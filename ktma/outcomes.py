"""What happened after an alert: triple-barrier (long and short), forward
returns, MFE/MAE and a trend-scanning label. Used as a hint for the labeler,
as automatic labels for pre-training, and to compare human vs. mechanical."""

from __future__ import annotations

import numpy as np
import pandas as pd


def barrier(high, low, entry, tp, sl, side: int, max_bars: int) -> tuple[int, int]:
    """Walk forward bar by bar. Returns (result, bars): +1 TP first, -1 SL first,
    0 timeout. If both are hit inside one bar we assume SL (conservative)."""
    for k in range(min(max_bars, len(high))):
        hit_tp = high[k] >= tp if side > 0 else low[k] <= tp
        hit_sl = low[k] <= sl if side > 0 else high[k] >= sl
        if hit_sl:
            return -1, k + 1
        if hit_tp:
            return 1, k + 1
    return 0, min(max_bars, len(high))


def trend_scan(closes: np.ndarray, min_len: int = 5) -> tuple[float, int]:
    """Horizon with the largest |t-stat| of a linear-trend slope (López de Prado)."""
    best_t, best_l = 0.0, 0
    for L in range(min_len, len(closes) + 1):
        y = closes[:L]
        x = np.arange(L, dtype=float)
        x -= x.mean()
        b = (x * (y - y.mean())).sum() / (x * x).sum()
        resid = y - y.mean() - b * x
        se = np.sqrt((resid**2).sum() / max(L - 2, 1) / (x * x).sum())
        t = b / se if se > 0 else 0.0
        if abs(t) > abs(best_t):
            best_t, best_l = float(t), L
    return best_t, best_l


def compute_outcome(candles: pd.DataFrame, bar_time: int, atr: float, cfg: dict) -> dict | None:
    """`candles` = OHLC of the alert's timeframe. Entry = close of the alert bar.
    Returns None until enough future bars exist."""
    oc = cfg["outcomes"]
    max_bars = max(oc["max_bars"], max(oc["horizons"]))
    idx = np.searchsorted(candles["open_time"].to_numpy(), bar_time)
    if idx >= len(candles) or candles["open_time"].iloc[idx] != bar_time:
        return None
    fut = candles.iloc[idx + 1: idx + 1 + max_bars]
    if len(fut) < max_bars or not atr or np.isnan(atr):
        return None
    entry = float(candles["close"].iloc[idx])
    h, l, c, o = (fut[k].to_numpy(float) for k in ("high", "low", "close", "open"))
    tp, sl = oc["take_profit_atr"] * atr, oc["stop_loss_atr"] * atr
    long_res, long_bars = barrier(h, l, entry, entry + tp, entry - sl, +1, oc["max_bars"])
    short_res, short_bars = barrier(h, l, entry, entry - tp, entry + sl, -1, oc["max_bars"])
    w = slice(0, oc["max_bars"])
    prev_close = np.concatenate([[entry], c[:-1]])
    gap = bool(np.any(np.abs(o - prev_close) > oc["gap_atr"] * atr))
    t, L = trend_scan(c[w])
    return {
        "long_result": long_res, "long_bars": long_bars,
        "short_result": short_res, "short_bars": short_bars,
        "mfe_atr": float((h[w].max() - entry) / atr), "mae_atr": float((entry - l[w].min()) / atr),
        "trend_scan_t": t, "trend_scan_bars": L, "gap_flag": gap,
        "data": {f"ret{hz}_atr": float((c[hz - 1] - entry) / atr) for hz in oc["horizons"]},
    }


def trade_result(candles: pd.DataFrame, bar_time: int, entry: float, sl: float, tp: float,
                 max_bars: int = 500) -> dict | None:
    """Outcome of the labeler's own trade plan (entry at alert close).
    Returns R multiple: +RR if TP first, -1 if SL first, else mark-to-market."""
    if None in (entry, sl, tp) or entry == sl:
        return None
    side = 1 if tp > entry else -1
    idx = np.searchsorted(candles["open_time"].to_numpy(), bar_time)
    fut = candles.iloc[idx + 1: idx + 1 + max_bars]
    if fut.empty:
        return None
    res, bars = barrier(fut["high"].to_numpy(float), fut["low"].to_numpy(float), entry, tp, sl, side, max_bars)
    risk = abs(entry - sl)
    rr = abs(tp - entry) / risk
    if res == 1:
        r = rr
    elif res == -1:
        r = -1.0
    else:
        r = side * (float(fut["close"].iloc[bars - 1]) - entry) / risk
    return {"result": res, "bars": bars, "rr": rr, "r_multiple": r}
