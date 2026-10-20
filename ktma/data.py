"""Market data providers and resampling.

Every provider returns a DataFrame with columns
``open_time`` (ms UTC, start of bar), ``open, high, low, close, volume``.
Only closed bars are returned.
"""

from __future__ import annotations

import time

import numpy as np
import pandas as pd

from .config import tf_ms

COLUMNS = ["open_time", "open", "high", "low", "close", "volume"]


def now_ms() -> int:
    return int(time.time() * 1000)


def drop_unclosed(df: pd.DataFrame, timeframe: str, now: int | None = None) -> pd.DataFrame:
    now = now_ms() if now is None else now
    return df[df["open_time"] + tf_ms(timeframe) <= now].reset_index(drop=True)


def resample(df_1m: pd.DataFrame, timeframe: str, last_closed_ms: int | None = None) -> pd.DataFrame:
    """Aggregate bars into `timeframe` buckets aligned to UTC epoch.

    A bucket is only returned when it is complete, i.e. its end is <= the close
    time of the last input bar (or `last_closed_ms`). Missing minutes (no
    trades) are fine; the bucket just has fewer input bars.
    """
    if df_1m.empty:
        return pd.DataFrame(columns=COLUMNS)
    step = tf_ms(timeframe)
    src_step = int(df_1m["open_time"].diff().min()) if len(df_1m) > 1 else 60_000
    end_of_data = last_closed_ms if last_closed_ms is not None else int(df_1m["open_time"].iloc[-1]) + src_step
    bucket = (df_1m["open_time"] // step) * step
    out = (
        df_1m.assign(bucket=bucket)
        .groupby("bucket", sort=True)
        .agg(open=("open", "first"), high=("high", "max"), low=("low", "min"),
             close=("close", "last"), volume=("volume", "sum"))
        .reset_index()
        .rename(columns={"bucket": "open_time"})
    )
    out = out[out["open_time"] + step <= end_of_data]
    return out[COLUMNS].reset_index(drop=True)


class YFinanceProvider:
    """Yahoo Finance via yfinance. CME data is delayed by >= 10 minutes."""

    # Max history Yahoo serves per interval.
    PERIODS = {"1m": "7d", "5m": "60d", "15m": "60d", "1h": "730d"}
    INTERVALS = {"1m": "1m", "5m": "5m", "15m": "15m", "1h": "60m"}

    def fetch(self, symbol: str, timeframe: str, since_ms: int | None = None) -> pd.DataFrame:
        import yfinance as yf

        kwargs = {"interval": self.INTERVALS[timeframe], "auto_adjust": False, "prepost": True}
        max_days = int(self.PERIODS[timeframe][:-1])
        if since_ms is not None:
            start = pd.Timestamp(since_ms, unit="ms", tz="UTC")
            oldest = pd.Timestamp.now(tz="UTC") - pd.Timedelta(days=max_days - 1)
            kwargs["start"] = max(start, oldest).to_pydatetime()
        else:
            kwargs["period"] = self.PERIODS[timeframe]
        raw = yf.Ticker(symbol).history(**kwargs)
        if raw.empty:
            return pd.DataFrame(columns=COLUMNS)
        idx = raw.index.tz_convert("UTC") if raw.index.tz is not None else raw.index.tz_localize("UTC")
        df = pd.DataFrame(
            {
                "open_time": idx.as_unit("ms").asi8,
                "open": raw["Open"].to_numpy(float),
                "high": raw["High"].to_numpy(float),
                "low": raw["Low"].to_numpy(float),
                "close": raw["Close"].to_numpy(float),
                "volume": raw["Volume"].to_numpy(float),
            }
        )
        df = df.dropna(subset=["open", "high", "low", "close"])
        return drop_unclosed(df, timeframe)


def gold_market_open(open_time_ms: pd.Series) -> pd.Series:
    """True when spot gold trades: Sun 18:00 – Fri 17:00 New York time, with a
    daily break 17:00–18:00. Used to drop weekend/off-hours candles from 24/7
    venues (crypto-exchange gold contracts)."""
    ny = pd.to_datetime(open_time_ms, unit="ms", utc=True).dt.tz_convert("America/New_York")
    wd, h = ny.dt.weekday, ny.dt.hour  # Mon=0 … Sun=6
    closed = (wd == 5) | ((wd == 6) & (h < 18)) | ((wd == 4) & (h >= 17)) | ((wd <= 3) & (h == 17))
    return ~closed


class BinanceGoldProvider:
    """Binance USDT-margined gold/silver perpetuals (XAUUSDT, XAGUSDT, listed Jan 2026).

    Public market data: no account, no API key. The contract tracks spot
    XAU/USD closely; volume is real traded volume on Binance. The contract
    trades 24/7, so off-hours candles are dropped when `market_hours_only`.
    """

    SYMBOLS = {"XAUUSD": "XAUUSDT", "XAGUSD": "XAGUSDT"}
    URL = "https://fapi.binance.com/fapi/v1/klines"
    LIMIT = 1500

    def __init__(self, history_days: dict | None = None, market_hours_only: bool = True):
        self.history_days = {"1m": 14, "5m": 90, "15m": 180, "1h": 730, **(history_days or {})}
        self.market_hours_only = market_hours_only

    def fetch(self, symbol: str, timeframe: str, since_ms: int | None = None) -> pd.DataFrame:
        import requests

        step = tf_ms(timeframe)
        start = since_ms if since_ms is not None else now_ms() - self.history_days[timeframe] * 86_400_000
        rows = []
        while True:
            r = requests.get(self.URL, timeout=30, params={
                "symbol": self.SYMBOLS.get(symbol, symbol), "interval": timeframe,
                "startTime": start, "limit": self.LIMIT,
            })
            if r.status_code != 200:
                raise RuntimeError(f"Binance {r.status_code}: {r.text[:200]}")
            batch = r.json()
            rows += [(int(k[0]), float(k[1]), float(k[2]), float(k[3]), float(k[4]), float(k[5])) for k in batch]
            if len(batch) < self.LIMIT:
                break
            start = int(batch[-1][0]) + step
            if start >= now_ms():
                break
            time.sleep(0.2)  # stay far below Binance rate limits
        df = pd.DataFrame(rows, columns=COLUMNS).drop_duplicates("open_time").sort_values("open_time")
        if self.market_hours_only and not df.empty:
            df = df[gold_market_open(df["open_time"]).to_numpy()]
        return drop_unclosed(df.reset_index(drop=True), timeframe)


class OandaProvider:
    """OANDA v20 REST API: spot XAU/USD, XAG/USD in real time (free practice account).

    Volume is *tick volume* (number of price updates), there is no central
    volume for spot metals. Needs OANDA_API_TOKEN (and OANDA_ENV=practice|live).
    """

    GRANULARITY = {"1m": "M1", "5m": "M5", "15m": "M15", "1h": "H1"}
    HOSTS = {"practice": "https://api-fxpractice.oanda.com", "live": "https://api-fxtrade.oanda.com"}
    MAX_COUNT = 5000

    def __init__(self, history_days: dict | None = None, token: str | None = None, env: str | None = None):
        import os

        self.token = token or os.environ.get("OANDA_API_TOKEN")
        if not self.token:
            raise RuntimeError("Chýba OANDA_API_TOKEN v .env (OANDA demo účet -> Manage API Access)")
        self.host = self.HOSTS[(env or os.environ.get("OANDA_ENV") or "practice").lower()]
        self.history_days = {"1m": 14, "5m": 90, "15m": 180, "1h": 730, **(history_days or {})}

    @staticmethod
    def instrument(symbol: str) -> str:
        s = symbol.upper().replace("/", "")
        return s if "_" in s else f"{s[:3]}_{s[3:]}"

    def _get(self, instrument: str, params: dict) -> list[dict]:
        import requests

        r = requests.get(
            f"{self.host}/v3/instruments/{instrument}/candles", params=params, timeout=30,
            headers={"Authorization": f"Bearer {self.token}", "Accept-Datetime-Format": "UNIX"},
        )
        if r.status_code != 200:
            # Never include the request headers/token in the error.
            raise RuntimeError(f"OANDA {r.status_code}: {r.text[:200]}")
        return r.json().get("candles", [])

    def fetch(self, symbol: str, timeframe: str, since_ms: int | None = None) -> pd.DataFrame:
        step = tf_ms(timeframe)
        if since_ms is None:
            since_ms = now_ms() - self.history_days[timeframe] * 86_400_000
        rows, start = [], since_ms
        while True:
            batch = self._get(self.instrument(symbol), {
                "granularity": self.GRANULARITY[timeframe], "price": "M",
                "from": f"{start / 1000:.0f}", "count": self.MAX_COUNT,
            })
            for c in batch:
                if not c.get("complete"):
                    continue
                m = c["mid"]
                rows.append((int(float(c["time"]) * 1000), float(m["o"]), float(m["h"]), float(m["l"]),
                             float(m["c"]), float(c.get("volume", 0))))
            if len(batch) < self.MAX_COUNT:
                break
            start = int(float(batch[-1]["time"]) * 1000) + step
            if start >= now_ms():
                break
        df = pd.DataFrame(rows, columns=COLUMNS).drop_duplicates("open_time").sort_values("open_time")
        return drop_unclosed(df.reset_index(drop=True), timeframe)


class SyntheticProvider:
    """Deterministic random-walk data with trends, ranges and volume spikes.

    Used by `python -m ktma demo` and the tests; no network needed.
    """

    def __init__(self, days: int = 20, seed: int = 7, start_price: float = 4000.0, end_ms: int | None = None):
        self.days = days
        self.seed = seed
        self.start_price = start_price
        self.end_ms = end_ms

    def _series(self, symbol: str) -> pd.DataFrame:
        rng = np.random.default_rng(self.seed + sum(map(ord, symbol)))
        n = self.days * 24 * 60
        end = self.end_ms if self.end_ms is not None else (now_ms() // 60_000) * 60_000
        times = end - 60_000 * np.arange(n, 0, -1)
        # Regime-switching drift so there are trends, channels and reversals.
        regime_len = rng.integers(120, 900, size=n // 120 + 2)
        drift = np.repeat(rng.normal(0, 0.00012, size=len(regime_len)), regime_len)[:n]
        vol = np.repeat(rng.uniform(0.0002, 0.0007, size=len(regime_len)), regime_len)[:n]
        rets = drift + vol * rng.standard_normal(n)
        close = self.start_price * np.exp(np.cumsum(rets))
        open_ = np.concatenate([[self.start_price], close[:-1]])
        spread = np.abs(rng.normal(0, vol * close, size=n))
        high = np.maximum(open_, close) + spread
        low = np.minimum(open_, close) - spread
        volume = rng.gamma(2.0, 150.0, size=n) * (1 + 20 * np.abs(rets) / vol.mean())
        spikes = rng.random(n) < 0.004
        volume[spikes] *= rng.uniform(3, 6, size=spikes.sum())
        return pd.DataFrame(
            {"open_time": times.astype("int64"), "open": open_, "high": high, "low": low,
             "close": close, "volume": volume.round()}
        )

    def fetch(self, symbol: str, timeframe: str, since_ms: int | None = None) -> pd.DataFrame:
        df = self._series(symbol)
        if timeframe != "1m":
            df = resample(df, timeframe)
        if since_ms is not None:
            df = df[df["open_time"] >= since_ms]
        return df.reset_index(drop=True)


def get_provider(cfg: dict):
    name = cfg["data"]["provider"]
    if name == "yfinance":
        return YFinanceProvider()
    if name == "binance":
        return BinanceGoldProvider(cfg["data"].get("history_days"), cfg["data"].get("market_hours_only", True))
    if name == "oanda":
        return OandaProvider(cfg["data"].get("history_days"))
    if name == "synthetic":
        return SyntheticProvider(**cfg["data"].get("synthetic", {}))
    raise ValueError(f"Unknown data provider: {name}")
