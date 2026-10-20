"""Named trading setups (docs/RESEARCH.md §12):

* HOLY_GRAIL  – Linda Raschke / Larry Connors (Street Smarts): strong trend (ADX > 30),
  pullback to the 20 EMA, entry when a following bar breaks the high (low) of the
  bar that touched the EMA.
* ORB         – Opening Range Breakout (Toby Crabel): range of the first N minutes
  after a session open; first close beyond it inside the trading window.
* HITCHHIKER  – SMB Capital scalp: opening drive, tight consolidation near the
  extreme of the drive, entry on the break of the consolidation.

All rules are causal: a signal on bar i only uses bars <= i.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .config import tf_ms
from .indicators import ema


def _bull(name, i, extra):
    return {"i": int(i), "signal": name, "direction": "bullish", "extra": extra}


def _bear(name, i, extra):
    return {"i": int(i), "signal": name, "direction": "bearish", "extra": extra}


def holy_grail(df: pd.DataFrame, c: dict) -> list[dict]:
    """`df` needs high, low, close, adx, plus_di, minus_di."""
    e = ema(df["close"], c.get("ema", 20)).to_numpy()
    h, l = df["high"].to_numpy(), df["low"].to_numpy()
    adx, pdi, mdi = df["adx"].to_numpy(), df["plus_di"].to_numpy(), df["minus_di"].to_numpy()
    min_adx, wait = c.get("min_adx", 30), c.get("max_wait_bars", 3)
    events, setup_long, setup_short = [], None, None
    for i in range(1, len(df)):
        if np.isnan(e[i]) or np.isnan(adx[i]):
            continue
        # Trigger first (the touch bar itself can't trigger).
        if setup_long is not None:
            s = setup_long
            if h[i] > h[s]:
                events.append(_bull("HOLY_GRAIL_LONG", i, {"setup_high": float(h[s]), "ema20": float(e[s]),
                                                           "adx": float(adx[s])}))
                setup_long = None
            elif i - s >= wait:
                setup_long = None
        if setup_short is not None:
            s = setup_short
            if l[i] < l[s]:
                events.append(_bear("HOLY_GRAIL_SHORT", i, {"setup_low": float(l[s]), "ema20": float(e[s]),
                                                            "adx": float(adx[s])}))
                setup_short = None
            elif i - s >= wait:
                setup_short = None
        # New pullback to the EMA while the trend is strong.
        if adx[i] > min_adx and pdi[i] > mdi[i] and l[i] <= e[i] and setup_long is None:
            setup_long = i
        if adx[i] > min_adx and mdi[i] > pdi[i] and h[i] >= e[i] and setup_short is None:
            setup_short = i
    return events


def _session_minutes(open_time: pd.Series, tz: str, hh: int, mm: int):
    """Minutes since today's session open (local tz) and a per-day session key."""
    local = pd.to_datetime(open_time, unit="ms", utc=True).dt.tz_convert(tz)
    minutes = (local.dt.hour * 60 + local.dt.minute - (hh * 60 + mm)).to_numpy()
    day = (local.dt.year * 10000 + local.dt.month * 100 + local.dt.day).to_numpy()
    return minutes, day


def opening_range_breakout(df: pd.DataFrame, timeframe: str, c: dict) -> list[dict]:
    n_min = c.get("range_minutes", 15)
    tf_min = tf_ms(timeframe) // 60_000
    if tf_min > n_min:
        return []  # the range can't be measured on bars longer than the range itself
    h, l, cl = df["high"].to_numpy(), df["low"].to_numpy(), df["close"].to_numpy()
    events = []
    for sess in c.get("sessions", []):
        hh, mm = map(int, sess["open"].split(":"))
        minutes, day = _session_minutes(df["open_time"], sess["tz"], hh, mm)
        name = sess["name"]
        state: dict = {}
        for i in range(len(df)):
            d, m = day[i], minutes[i]
            st = state.setdefault(d, {"hi": -np.inf, "lo": np.inf, "bars": 0, "up": False, "down": False})
            if 0 <= m < n_min:
                st["hi"], st["lo"] = max(st["hi"], h[i]), min(st["lo"], l[i])
                st["bars"] += 1
            elif n_min <= m < c.get("window_minutes", 180) and st["bars"] > 0:
                extra = {"session": name, "or_high": float(st["hi"]), "or_low": float(st["lo"]),
                         "or_minutes": n_min}
                if not st["up"] and cl[i] > st["hi"]:
                    st["up"] = True
                    events.append(_bull(f"ORB_UP_{name}", i, extra))
                if not st["down"] and cl[i] < st["lo"]:
                    st["down"] = True
                    events.append(_bear(f"ORB_DOWN_{name}", i, extra))
    return events


def hitchhiker(df: pd.DataFrame, timeframe: str, c: dict) -> list[dict]:
    """Opening drive (>= drive_atr × ATR from the session open price), then a tight
    consolidation (range <= consol_atr × ATR over `consol_bars`) in the upper (lower)
    part of the drive; signal on the close that breaks the consolidation."""
    tf_min = tf_ms(timeframe) // 60_000
    if tf_min > c.get("max_tf_minutes", 5):
        return []
    h, l, o, cl = (df[k].to_numpy() for k in ("high", "low", "open", "close"))
    a = df["atr"].to_numpy()
    nb = c.get("consol_bars", 6)
    events = []
    for sess in c.get("sessions", []):
        hh, mm = map(int, sess["open"].split(":"))
        minutes, day = _session_minutes(df["open_time"], sess["tz"], hh, mm)
        window = c.get("window_minutes", 60)
        done: set = set()
        first: dict = {}
        for i in range(len(df)):
            d, m = day[i], minutes[i]
            if not (0 <= m < window) or np.isnan(a[i]):
                continue
            first.setdefault(d, i)
            s = first[d]
            if d in done or i - s < nb + 1:
                continue
            open_px = o[s]
            c_hi, c_lo = h[i - nb:i].max(), l[i - nb:i].min()
            drive_hi, drive_lo = h[s:i - nb].max() if i - nb > s else c_hi, l[s:i - nb].min() if i - nb > s else c_lo
            tight = (c_hi - c_lo) <= c.get("consol_atr", 1.0) * a[i]
            extra = {"session": sess["name"], "consol_high": float(c_hi), "consol_low": float(c_lo),
                     "open_price": float(open_px)}
            if tight and drive_hi - open_px >= c.get("drive_atr", 2.0) * a[i] \
                    and c_lo >= open_px + 0.5 * (drive_hi - open_px) and cl[i] > c_hi:
                events.append(_bull(f"HITCHHIKER_LONG_{sess['name']}", i, extra))
                done.add(d)
            elif tight and open_px - drive_lo >= c.get("drive_atr", 2.0) * a[i] \
                    and c_hi <= open_px - 0.5 * (open_px - drive_lo) and cl[i] < c_lo:
                events.append(_bear(f"HITCHHIKER_SHORT_{sess['name']}", i, extra))
                done.add(d)
    return events


def detect_setups(df: pd.DataFrame, timeframe: str, cfg: dict) -> list[dict]:
    s = cfg.get("setups") or {}
    events = []
    if s.get("holy_grail", {}).get("enabled"):
        events += holy_grail(df, s["holy_grail"])
    if s.get("orb", {}).get("enabled"):
        events += opening_range_breakout(df, timeframe, s["orb"])
    if s.get("hitchhiker", {}).get("enabled"):
        events += hitchhiker(df, timeframe, s["hitchhiker"])
    return events
