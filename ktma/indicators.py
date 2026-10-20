"""Technical indicators computed with plain pandas (no TA-Lib dependency).

All indicators are causal: the value at bar *t* only uses bars <= t, so they
can be computed once over a whole series and sliced without lookahead.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def sma(series: pd.Series, period: int) -> pd.Series:
    return series.rolling(period, min_periods=period).mean()


def ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False, min_periods=period).mean()


def rsi(close: pd.Series, period: int = 14) -> pd.Series:
    """Wilder's RSI (the variant TradingView and most platforms show)."""
    delta = close.diff()
    gain = delta.clip(lower=0.0)
    loss = -delta.clip(upper=0.0)
    avg_gain = gain.ewm(alpha=1.0 / period, adjust=False, min_periods=period).mean()
    avg_loss = loss.ewm(alpha=1.0 / period, adjust=False, min_periods=period).mean()
    rs = avg_gain / avg_loss
    out = 100.0 - 100.0 / (1.0 + rs)
    # avg_loss == 0 -> only gains -> RSI 100 (rs is inf, formula already gives 100,
    # but 0/0 gives NaN when the price did not move at all).
    out = out.where(~((avg_loss == 0) & (avg_gain == 0)), 50.0)
    return out


def macd(close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> pd.DataFrame:
    line = ema(close, fast) - ema(close, slow)
    sig = line.ewm(span=signal, adjust=False, min_periods=signal).mean()
    return pd.DataFrame({"macd": line, "macd_signal": sig, "macd_hist": line - sig})


def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    prev_close = df["close"].shift(1)
    tr = pd.concat(
        [df["high"] - df["low"], (df["high"] - prev_close).abs(), (df["low"] - prev_close).abs()],
        axis=1,
    ).max(axis=1)
    return tr.ewm(alpha=1.0 / period, adjust=False, min_periods=period).mean()


def volume_ratio(volume: pd.Series, period: int = 20) -> pd.Series:
    """Current volume divided by the average of the *previous* `period` bars.

    Returns NaN where volume is missing or zero (e.g. spot FX/metals feeds
    without real volume), so volume rules simply don't fire there.
    """
    vol = volume.replace(0, np.nan)
    avg = vol.rolling(period, min_periods=period).mean().shift(1)
    return vol / avg


def add_indicators(df: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    """Return a copy of an OHLCV frame with all configured indicator columns."""
    ind = cfg["indicators"]
    out = df.copy()
    close = out["close"]

    out["rsi"] = rsi(close, ind["rsi"]["period"])

    m = ind["macd"]
    out = out.join(macd(close, m["fast"], m["slow"], m["signal"]))

    ma = ind["ma"]
    fn = ema if ma.get("type", "ema") == "ema" else sma
    for p in ma["periods"]:
        out[f"ma_{p}"] = fn(close, p)

    out["atr"] = atr(out, ind.get("atr_period", 14))
    out["volume_ratio"] = volume_ratio(out["volume"], ind["volume"]["period"])
    return out
