"""Rule-based signal detection (the "primary model").

Rules run on *closed* candles only. Every candidate is stored; `notify`
decides which ones are pushed to Telegram ("log more than you notify").
A human (and later the ML model) decides whether an event was a good entry.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

BULLISH, BEARISH, NEUTRAL = "bullish", "bearish", "neutral"


def _cross_up(a: pd.Series, b) -> pd.Series:
    b_prev = b.shift(1) if isinstance(b, pd.Series) else b
    return (a > b) & (a.shift(1) <= b_prev)


def _cross_down(a: pd.Series, b) -> pd.Series:
    b_prev = b.shift(1) if isinstance(b, pd.Series) else b
    return (a < b) & (a.shift(1) >= b_prev)


def _rules(df: pd.DataFrame, cfg: dict):
    """Yield (signal_name, direction, mask, is_candidate_only)."""
    s = cfg["signals"]
    ind = cfg["indicators"]
    r = ind["rsi"]

    if s.get("rsi_zone"):
        levels = [(r["overbought"], r["oversold"], False)]
        levels += [(ob, os_, True) for ob, os_ in r.get("candidate_levels", [])]
        for ob, os_, cand in levels:
            yield f"RSI_ABOVE_{ob}", BEARISH, _cross_up(df["rsi"], ob), cand
            yield f"RSI_BELOW_{os_}", BULLISH, _cross_down(df["rsi"], os_), cand
            if s.get("rsi_zone_exit"):
                yield f"RSI_EXIT_ABOVE_{ob}", BEARISH, _cross_down(df["rsi"], ob), cand
                yield f"RSI_EXIT_BELOW_{os_}", BULLISH, _cross_up(df["rsi"], os_), cand

    if s.get("macd_cross"):
        yield "MACD_BULL_CROSS", BULLISH, _cross_up(df["macd"], df["macd_signal"]), False
        yield "MACD_BEAR_CROSS", BEARISH, _cross_down(df["macd"], df["macd_signal"]), False
    if s.get("macd_zero_cross"):
        yield "MACD_ZERO_UP", BULLISH, _cross_up(df["macd"], 0.0), False
        yield "MACD_ZERO_DOWN", BEARISH, _cross_down(df["macd"], 0.0), False

    if s.get("ma_cross"):
        for fast, slow in ind["ma"]["crosses"]:
            f, sl = df[f"ma_{fast}"], df[f"ma_{slow}"]
            yield f"MA_{fast}_{slow}_GOLDEN", BULLISH, _cross_up(f, sl), False
            yield f"MA_{fast}_{slow}_DEATH", BEARISH, _cross_down(f, sl), False
    for p in s.get("price_ma_cross") or []:
        yield f"PRICE_ABOVE_MA_{p}", BULLISH, _cross_up(df["close"], df[f"ma_{p}"]), False
        yield f"PRICE_BELOW_MA_{p}", BEARISH, _cross_down(df["close"], df[f"ma_{p}"]), False

    if s.get("volume_spike"):
        spike = df["volume_ratio"] >= ind["volume"]["spike_ratio"]
        first = spike & ~spike.shift(1, fill_value=False)  # only the first bar of a spike run
        up = df["close"] >= df["open"]
        yield "VOLUME_SPIKE_UP", BULLISH, first & up, False
        yield "VOLUME_SPIKE_DOWN", BEARISH, first & ~up, False

    if s.get("channel_break") and "reg_upper" in df:
        yield "CHANNEL_BREAK_UP", BULLISH, _cross_up(df["close"], df["reg_upper"]), False
        yield "CHANNEL_BREAK_DOWN", BEARISH, _cross_down(df["close"], df["reg_lower"]), False

    if s.get("donchian_break"):
        for p in ind.get("donchian", []):
            yield f"DONCHIAN_BREAK_UP_{p}", BULLISH, _cross_up(df["close"], df[f"don_high_{p}"]), False
            yield f"DONCHIAN_BREAK_DOWN_{p}", BEARISH, _cross_down(df["close"], df[f"don_low_{p}"]), False

    if "vwap" in df:
        same_session = df["session"] == df["session"].shift(1)
        if s.get("vwap_cross"):
            yield "VWAP_CROSS_UP", BULLISH, _cross_up(df["close"], df["vwap"]) & same_session, False
            yield "VWAP_CROSS_DOWN", BEARISH, _cross_down(df["close"], df["vwap"]) & same_session, False
        if s.get("vwap_band_touch"):
            k = max(ind["vwap"].get("bands", [2.0]))
            up, lo = df["vwap"] + k * df["vwap_sd"], df["vwap"] - k * df["vwap_sd"]
            yield f"VWAP_UPPER_{k:g}SD", BEARISH, _cross_up(df["high"], up) & same_session, False
            yield f"VWAP_LOWER_{k:g}SD", BULLISH, _cross_down(df["low"], lo) & same_session, False


def detect(df: pd.DataFrame, cfg: dict) -> list[dict]:
    """Indicator-rule events for every bar of `df` (a frame from `add_indicators`,
    closed candles only, index 0..n-1). Each event carries the bar index `i`."""
    events = []
    for name, direction, mask, candidate in _rules(df, cfg):
        for i in np.flatnonzero(mask.fillna(False).to_numpy()):
            events.append({"i": int(i), "signal": name, "direction": direction, "candidate": candidate})
    return events


def should_notify(event: dict, row: pd.Series, timeframe: str, cfg: dict) -> bool:
    """Notification filters. Everything is stored regardless."""
    f = cfg.get("notify_filters", {})
    sig = event["signal"]
    if event.get("candidate"):
        return False
    only = (f.get("only_on") or {}).get(timeframe)
    if only and not any(sig.startswith(p) for p in only):
        return False
    if any(sig.startswith(p) for p in (f.get("exclude") or [])):
        return False
    if sig.startswith("DONCHIAN_BREAK"):
        if int(sig.rsplit("_", 1)[1]) not in (f.get("donchian_notify") or []):
            return False
    if f.get("mode") == "confluence" and not sig.startswith(("CONFLUENCE", "HOLY_GRAIL", "ORB_", "HITCHHIKER")):
        return False
    if sig.startswith("TL_") and event.get("line", {}).get("touches", 0) < f.get("min_line_touches", 0):
        return False
    if sig.startswith("SR_") and event.get("level", {}).get("touches", 0) < f.get("min_level_touches", 0):
        return False
    if sig.startswith("RSI_") and f.get("rsi_max_adx") and pd.notna(row.get("adx")) \
            and row["adx"] > f["rsi_max_adx"]:
        return False
    min_vr = f.get("min_volume_ratio_1m" if timeframe == "1m" else "min_volume_ratio") or 0
    if min_vr > 0 and not sig.startswith("VOLUME_SPIKE"):
        vr = row.get("volume_ratio")
        if pd.isna(vr) or vr < min_vr:
            return False
    return True
