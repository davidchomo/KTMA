"""Multi-strategy confluence: several *different* strategy families pointing the
same way within a few bars (e.g. RSI + trendline + VWAP). Each event gets the
list of agreeing families; a CONFLUENCE_LONG/SHORT event is emitted when at
least `min_families` agree. Causal: only events on bars <= i are used."""

from __future__ import annotations

FAMILIES = [("RSI_", "RSI"), ("MACD_", "MACD"), ("MA_", "EMA"), ("PRICE_", "EMA"), ("VOLUME_", "VOL"),
            ("VWAP_", "VWAP"), ("TL_", "TL"), ("SR_", "SR"), ("CHANNEL_", "CHANNEL"), ("DONCHIAN_", "DONCHIAN"),
            ("HOLY_GRAIL", "HOLY_GRAIL"), ("ORB_", "ORB"), ("HITCHHIKER", "HITCHHIKER")]


def family(signal: str) -> str | None:
    for prefix, fam in FAMILIES:
        if signal.startswith(prefix):
            return fam
    return None


def confluence_events(events: list[dict], c: dict, timeframe: str | None = None) -> list[dict]:
    """Annotate `events` in place with ev['confluence'] and return new CONFLUENCE events."""
    k = c.get("window_bars", 3)
    need = c.get("min_families", 3)
    if isinstance(need, dict):
        need = need.get(timeframe, need.get("default", 3))
    out = []
    for direction, name in (("bullish", "CONFLUENCE_LONG"), ("bearish", "CONFLUENCE_SHORT")):
        evs = sorted((e for e in events if e["direction"] == direction and not e.get("candidate")
                      and family(e["signal"])), key=lambda e: e["i"])
        last_emit, lo, hi = None, 0, 0
        for idx, e in enumerate(evs):
            i = e["i"]
            while evs[lo]["i"] <= i - k:            # drop events older than the window
                lo += 1
            hi = max(hi, idx)
            while hi + 1 < len(evs) and evs[hi + 1]["i"] == i:   # include the rest of this bar
                hi += 1
            fams = sorted({family(x["signal"]) for x in evs[lo:hi + 1]})
            e["confluence"] = {"families": fams}
            if len(fams) >= need and (last_emit is None or i - last_emit > k) and idx == hi:
                out.append({"i": i, "signal": name, "direction": direction, "confluence": {"families": fams}})
                last_emit = i
    return out
