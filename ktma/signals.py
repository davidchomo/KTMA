"""Rule-based signal detection (the "primary model").

Each rule is evaluated on *closed* candles only. The output is a list of
events; a human (and later the ML model) decides whether an event was a good
entry or not.
"""

from __future__ import annotations

import pandas as pd

BULLISH, BEARISH, NEUTRAL = "bullish", "bearish", "neutral"


def _cross_up(a: pd.Series, b) -> pd.Series:
    b_prev = b.shift(1) if isinstance(b, pd.Series) else b
    return (a > b) & (a.shift(1) <= b_prev)


def _cross_down(a: pd.Series, b) -> pd.Series:
    b_prev = b.shift(1) if isinstance(b, pd.Series) else b
    return (a < b) & (a.shift(1) >= b_prev)


def _rules(df: pd.DataFrame, cfg: dict):
    """Yield (signal_name, direction, boolean mask, details-fn) tuples."""
    s = cfg["signals"]
    ind = cfg["indicators"]
    ob, os_ = ind["rsi"]["overbought"], ind["rsi"]["oversold"]

    if s.get("rsi_zone"):
        # Overbought/oversold are read as mean-reversion hints; the label decides.
        yield f"RSI_ABOVE_{ob}", BEARISH, _cross_up(df["rsi"], ob)
        yield f"RSI_BELOW_{os_}", BULLISH, _cross_down(df["rsi"], os_)
        if s.get("rsi_zone_exit"):
            yield f"RSI_EXIT_ABOVE_{ob}", BEARISH, _cross_down(df["rsi"], ob)
            yield f"RSI_EXIT_BELOW_{os_}", BULLISH, _cross_up(df["rsi"], os_)

    if s.get("macd_cross"):
        yield "MACD_BULL_CROSS", BULLISH, _cross_up(df["macd"], df["macd_signal"])
        yield "MACD_BEAR_CROSS", BEARISH, _cross_down(df["macd"], df["macd_signal"])

    if s.get("macd_zero_cross"):
        yield "MACD_ZERO_UP", BULLISH, _cross_up(df["macd"], 0.0)
        yield "MACD_ZERO_DOWN", BEARISH, _cross_down(df["macd"], 0.0)

    if s.get("ma_cross"):
        for fast, slow in ind["ma"]["crosses"]:
            f, sl = df[f"ma_{fast}"], df[f"ma_{slow}"]
            yield f"MA_{fast}_{slow}_GOLDEN", BULLISH, _cross_up(f, sl)
            yield f"MA_{fast}_{slow}_DEATH", BEARISH, _cross_down(f, sl)

    for p in s.get("price_ma_cross") or []:
        ma = df[f"ma_{p}"]
        yield f"PRICE_ABOVE_MA_{p}", BULLISH, _cross_up(df["close"], ma)
        yield f"PRICE_BELOW_MA_{p}", BEARISH, _cross_down(df["close"], ma)

    if s.get("volume_spike"):
        spike = df["volume_ratio"] >= ind["volume"]["spike_ratio"]
        # Only the first bar of a spike run, to avoid one alert per bar.
        first = spike & ~spike.shift(1, fill_value=False)
        up = df["close"] >= df["open"]
        yield "VOLUME_SPIKE_UP", BULLISH, first & up
        yield "VOLUME_SPIKE_DOWN", BEARISH, first & ~up


def detect(df: pd.DataFrame, cfg: dict) -> list[dict]:
    """Return events for every bar in `df` (a frame from `add_indicators`).

    `df` must contain only closed candles and be indexed 0..n-1 with an
    `open_time` column (ms UTC).
    """
    events = []
    for name, direction, mask in _rules(df, cfg):
        for i in df.index[mask.fillna(False).to_numpy()]:
            row = df.loc[i]
            events.append(
                {
                    "bar_time": int(row["open_time"]),
                    "signal": name,
                    "direction": direction,
                    "price": float(row["close"]),
                    "volume_ratio": None if pd.isna(row["volume_ratio"]) else float(row["volume_ratio"]),
                    "details": {
                        "rsi": _f(row["rsi"]),
                        "macd": _f(row["macd"]),
                        "macd_signal": _f(row["macd_signal"]),
                        "macd_hist": _f(row["macd_hist"]),
                        "atr": _f(row["atr"]),
                        **{c: _f(row[c]) for c in df.columns if c.startswith("ma_")},
                    },
                }
            )
    events.sort(key=lambda e: (e["bar_time"], e["signal"]))
    return events


def passes_volume_filter(event: dict, cfg: dict) -> bool:
    """Notification filter: require volume confirmation if configured."""
    min_ratio = cfg["signals"].get("min_volume_ratio") or 0
    if min_ratio <= 0 or event["signal"].startswith("VOLUME_SPIKE"):
        return True
    vr = event.get("volume_ratio")
    return vr is not None and vr >= min_ratio


def _f(v):
    return None if pd.isna(v) else round(float(v), 6)
