"""Feature snapshot for an alert: scale-free features from every timeframe,
aligned by bar *close* time (no lookahead), plus time/session features.

The same code builds features live and for training (docs/ARCHITEKTURA.md, D).
Bump FEATURE_VERSION whenever a feature's meaning changes.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .config import tf_ms

FEATURE_VERSION = 1


def derive_features(f: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    """Vectorised per-bar features for one timeframe frame (indicators + structure state)."""
    c, a = f["close"], f["atr"].replace(0, np.nan)
    out = pd.DataFrame(index=f.index)
    out["rsi"] = f["rsi"]
    out["rsi_chg3"] = f["rsi"] - f["rsi"].shift(3)
    out["macd_atr"] = f["macd"] / a
    out["hist_atr"] = f["macd_hist"] / a
    out["hist_chg_atr"] = f["macd_hist"].diff() / a
    for p in cfg["indicators"]["ma"]["periods"]:
        out[f"dist_ma{p}_atr"] = (c - f[f"ma_{p}"]) / a
    slow = max(cfg["indicators"]["ma"]["periods"])
    mid = sorted(cfg["indicators"]["ma"]["periods"])[-2]
    out[f"ma{mid}_slope_atr"] = (f[f"ma_{mid}"] - f[f"ma_{mid}"].shift(5)) / a
    out[f"ma{slow}_slope_atr"] = (f[f"ma_{slow}"] - f[f"ma_{slow}"].shift(5)) / a
    out["adx"], out["plus_di"], out["minus_di"] = f["adx"], f["plus_di"], f["minus_di"]
    out["bb_pctb"], out["bb_width"] = f["bb_pctb"], f["bb_width"]
    out["atr_pct"] = a / c * 100
    out["volume_ratio"] = f["volume_ratio"]
    vol_avg = f["volume"].rolling(20, min_periods=5).mean().replace(0, np.nan)
    out["obv_slope"] = (f["obv"] - f["obv"].shift(10)) / (vol_avg * 10)
    for k in (1, 5, 20):
        out[f"ret{k}_atr"] = (c - c.shift(k)) / a
    hi20, lo20 = f["high"].rolling(20).max(), f["low"].rolling(20).min()
    out["range_pos20"] = (c - lo20) / (hi20 - lo20).replace(0, np.nan)
    for p in cfg["indicators"].get("donchian", []):
        h, l = f[f"don_high_{p}"], f[f"don_low_{p}"]
        out[f"don{p}_pos"] = (c - l) / (h - l).replace(0, np.nan)
    if "reg_upper" in f:
        width = (f["reg_upper"] - f["reg_lower"]).replace(0, np.nan)
        out["reg_pos"] = (c - f["reg_lower"]) / width
        out["reg_slope_atr"] = f["reg_slope"] / a
        out["reg_width_atr"] = width / a
        out["reg_width_chg"] = width / width.shift(5) - 1
        out["reg_r2"] = f["reg_r2"]
    if "vwap" in f:
        out["vwap_dist_atr"] = (c - f["vwap"]) / a
        out["vwap_z"] = (c - f["vwap"]) / f["vwap_sd"].replace(0, np.nan)
    if "sup_val" in f:
        out["sup_dist_atr"] = (c - f["sup_val"]) / a
        out["res_dist_atr"] = (f["res_val"] - c) / a
        out["sup_touches"], out["res_touches"] = f["sup_touches"], f["res_touches"]
        out["sup_slope_atr"] = f["sup_slope"] / a
        out["res_slope_atr"] = f["res_slope"] / a
        chan = (f["sup_chan"] - f["sup_val"]).replace(0, np.nan)
        out["sup_chan_pos"] = (c - f["sup_val"]) / chan
        out["swing_trend"] = f["swing_trend"]
    return out.replace([np.inf, -np.inf], np.nan)


def aligned_index(open_times: np.ndarray, timeframe: str, close_time_ms: int) -> int:
    """Index of the last bar of `timeframe` that had closed by `close_time_ms` (-1 if none)."""
    closes = open_times + tf_ms(timeframe)
    return int(np.searchsorted(closes, close_time_ms, side="right")) - 1


def time_features(close_time_ms: int) -> dict:
    t = pd.Timestamp(close_time_ms, unit="ms", tz="UTC")
    lon = t.tz_convert("Europe/London")
    ny = t.tz_convert("America/New_York")
    chi = t.tz_convert("America/Chicago")
    london_open = 8 <= lon.hour < 17
    ny_open = (ny.hour, ny.minute) >= (8, 20) and ny.hour < 17  # COMEX pit hours 8:20-13:30 ET, extended to 17
    session_start = chi.normalize() + pd.Timedelta(hours=17)
    if chi < session_start:
        session_start -= pd.Timedelta(days=1)
    return {
        "hour_utc": t.hour + t.minute / 60,
        "weekday": t.weekday(),
        "sess_asia": float(not london_open and not ny_open),
        "sess_london": float(london_open and not ny_open),
        "sess_overlap": float(london_open and ny_open),
        "sess_ny": float(ny_open and not london_open),
        "min_since_session_open": (chi - session_start).total_seconds() / 60,
    }


def build_snapshot(frames: dict, alert_tf: str, bar_open_ms: int, feature_tables: dict) -> dict:
    """Flattened feature dict: `<tf>__<feature>` for every timeframe, plus time features."""
    close_ms = bar_open_ms + tf_ms(alert_tf)
    snap: dict = {}
    for tf, frame in frames.items():
        idx = aligned_index(frame["open_time"].to_numpy(), tf, close_ms)
        if idx < 0:
            continue
        row = feature_tables[tf].iloc[idx]
        for k, v in row.items():
            snap[f"{tf}__{k}"] = None if pd.isna(v) else round(float(v), 6)
    snap.update({f"time__{k}": v for k, v in time_features(close_ms).items()})
    return snap
