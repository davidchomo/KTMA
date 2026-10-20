"""Technical indicators computed with plain pandas/numpy (no TA-Lib dependency).

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


def _wilder(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(alpha=1.0 / period, adjust=False, min_periods=period).mean()


def rsi(close: pd.Series, period: int = 14) -> pd.Series:
    """Wilder's RSI (the variant TradingView and most platforms show)."""
    delta = close.diff()
    avg_gain = _wilder(delta.clip(lower=0.0), period)
    avg_loss = _wilder(-delta.clip(upper=0.0), period)
    out = 100.0 - 100.0 / (1.0 + avg_gain / avg_loss)
    # No movement at all gives 0/0; call that neutral.
    return out.where(~((avg_loss == 0) & (avg_gain == 0)), 50.0)


def macd(close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> pd.DataFrame:
    line = ema(close, fast) - ema(close, slow)
    sig = line.ewm(span=signal, adjust=False, min_periods=signal).mean()
    return pd.DataFrame({"macd": line, "macd_signal": sig, "macd_hist": line - sig})


def true_range(df: pd.DataFrame) -> pd.Series:
    prev_close = df["close"].shift(1)
    return pd.concat(
        [df["high"] - df["low"], (df["high"] - prev_close).abs(), (df["low"] - prev_close).abs()],
        axis=1,
    ).max(axis=1)


def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    return _wilder(true_range(df), period)


def adx(df: pd.DataFrame, period: int = 14) -> pd.DataFrame:
    up = df["high"].diff()
    down = -df["low"].diff()
    plus_dm = up.where((up > down) & (up > 0), 0.0)
    minus_dm = down.where((down > up) & (down > 0), 0.0)
    tr = _wilder(true_range(df), period)
    plus_di = 100 * _wilder(plus_dm, period) / tr
    minus_di = 100 * _wilder(minus_dm, period) / tr
    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di)
    return pd.DataFrame({"adx": _wilder(dx, period), "plus_di": plus_di, "minus_di": minus_di})


def bollinger(close: pd.Series, period: int = 20, std: float = 2.0) -> pd.DataFrame:
    mid = sma(close, period)
    dev = close.rolling(period, min_periods=period).std(ddof=0)
    upper, lower = mid + std * dev, mid - std * dev
    width = upper - lower
    return pd.DataFrame(
        {"bb_pctb": (close - lower) / width.replace(0, np.nan), "bb_width": width / mid}
    )


def volume_ratio(volume: pd.Series, period: int = 20) -> pd.Series:
    """Current volume divided by the average of the *previous* `period` bars.

    NaN where volume is missing or zero (e.g. feeds without real volume), so
    volume rules simply don't fire there.
    """
    vol = volume.replace(0, np.nan)
    avg = vol.rolling(period, min_periods=period).mean().shift(1)
    return vol / avg


def obv(df: pd.DataFrame) -> pd.Series:
    direction = np.sign(df["close"].diff()).fillna(0.0)
    return (direction * df["volume"].fillna(0.0)).cumsum()


def session_id(open_time_ms: pd.Series, tz: str = "America/Chicago", start_hour: int = 17) -> pd.Series:
    """CME trading-session id: a new session starts at 17:00 Chicago time
    (handles daylight saving). Returns the session's calendar date as int."""
    local = pd.to_datetime(open_time_ms, unit="ms", utc=True).dt.tz_convert(tz)
    shifted = local + pd.Timedelta(hours=24 - start_hour)
    return shifted.dt.year * 10000 + shifted.dt.month * 100 + shifted.dt.day


def vwap(df: pd.DataFrame, session: pd.Series) -> pd.DataFrame:
    """Session-anchored VWAP with volume-weighted standard deviation bands."""
    tp = (df["high"] + df["low"] + df["close"]) / 3.0
    vol = df["volume"].fillna(0.0)
    g = session.to_numpy()
    cum_v = vol.groupby(g).cumsum()
    cum_pv = (tp * vol).groupby(g).cumsum()
    cum_p2v = (tp * tp * vol).groupby(g).cumsum()
    vw = cum_pv / cum_v.replace(0, np.nan)
    var = (cum_p2v / cum_v.replace(0, np.nan) - vw**2).clip(lower=0)
    sd = np.sqrt(var)
    return pd.DataFrame({"vwap": vw, "vwap_sd": sd})


def regression_channel(close: pd.Series, period: int = 100, std: float = 2.0) -> pd.DataFrame:
    """Rolling least-squares line over the last `period` closes, evaluated at the
    current bar, with bands at ± `std` residual standard deviations."""
    y = close.to_numpy(dtype=float)
    n = len(y)
    mid = np.full(n, np.nan)
    slope = np.full(n, np.nan)
    resid_sd = np.full(n, np.nan)
    r2 = np.full(n, np.nan)
    if n >= period:
        x = np.arange(period, dtype=float)
        x_mean = x.mean()
        sxx = ((x - x_mean) ** 2).sum()
        windows = np.lib.stride_tricks.sliding_window_view(y, period)
        y_mean = windows.mean(axis=1)
        b = ((windows - y_mean[:, None]) * (x - x_mean)).sum(axis=1) / sxx
        a = y_mean - b * x_mean
        fitted = a[:, None] + b[:, None] * x
        resid = windows - fitted
        sd = resid.std(axis=1)
        ss_tot = ((windows - y_mean[:, None]) ** 2).sum(axis=1)
        idx = slice(period - 1, n)
        mid[idx] = a + b * (period - 1)
        slope[idx] = b
        resid_sd[idx] = sd
        with np.errstate(invalid="ignore", divide="ignore"):
            r2[idx] = 1 - (resid**2).sum(axis=1) / ss_tot
    out = pd.DataFrame(
        {"reg_mid": mid, "reg_slope": slope, "reg_sd": resid_sd, "reg_r2": r2}, index=close.index
    )
    out["reg_upper"] = out["reg_mid"] + std * out["reg_sd"]
    out["reg_lower"] = out["reg_mid"] - std * out["reg_sd"]
    return out


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
    out = out.join(adx(out, ind.get("adx_period", 14)))
    bb = ind.get("bollinger", {"period": 20, "std": 2.0})
    out = out.join(bollinger(close, bb["period"], bb["std"]))
    out["volume_ratio"] = volume_ratio(out["volume"], ind["volume"]["period"])
    out["obv"] = obv(out)
    vw = ind.get("vwap")
    if vw:
        out["session"] = session_id(out["open_time"], vw.get("tz", "America/Chicago"), vw.get("session_start_hour", 17))
        out = out.join(vwap(out, out["session"]))

    for p in ind.get("donchian", []):
        # Channel of the *previous* p bars, so a breakout means a new p-bar extreme.
        out[f"don_high_{p}"] = out["high"].rolling(p, min_periods=p).max().shift(1)
        out[f"don_low_{p}"] = out["low"].rolling(p, min_periods=p).min().shift(1)

    rc = cfg.get("structure", {}).get("regression_channel")
    if rc:
        out = out.join(regression_channel(close, rc["period"], rc["std"]))
    return out
