"""Suggested trade plan for an alert: SL behind the nearest support (resistance),
TP at the next resistance (support), with the resulting risk:reward.
Falls back to ATR multiples when there is no usable level."""

from __future__ import annotations


def _levels(details: dict, lines: list[dict] | None) -> list[float]:
    prices = [lv["price"] for lv in (details or {}).get("levels") or []]
    prices += [ln["value_at_alert"] for ln in lines or [] if not ln.get("ended_here")]
    return prices


def suggest_plan(direction: str, entry: float, atr: float, details: dict | None, lines: list[dict] | None,
                 cfg: dict | None = None) -> dict | None:
    if not atr or atr <= 0:
        return None
    c = {"sl_buffer_atr": 0.2, "min_sl_atr": 0.8, "max_sl_atr": 3.0, "min_tp_atr": 1.0, "default_sl_atr": 1.0,
         "default_tp_atr": 2.0, **(cfg or {})}
    side = 1 if direction == "bullish" else -1
    levels = _levels(details or {}, lines)
    # SL: just beyond the nearest level on the losing side (within max_sl_atr), else default.
    behind = [p for p in levels if 0 < side * (entry - p) <= c["max_sl_atr"] * atr]
    if behind:
        lvl = max(behind, key=lambda p: side * p)          # nearest to entry
        sl, sl_reason = lvl - side * c["sl_buffer_atr"] * atr, "za najbližšou úrovňou"
        if side * (entry - sl) < c["min_sl_atr"] * atr:   # level too close: give the trade room
            sl, sl_reason = entry - side * c["min_sl_atr"] * atr, f"úroveň je blízko, min. {c['min_sl_atr']:g}× ATR"
    else:
        sl, sl_reason = entry - side * c["default_sl_atr"] * atr, f"{c['default_sl_atr']:g}× ATR"
    # TP: first level on the winning side that is at least min_tp_atr away, else default.
    ahead = [p for p in levels if side * (p - entry) >= c["min_tp_atr"] * atr]
    if ahead:
        lvl = min(ahead, key=lambda p: side * p)
        tp, tp_reason = lvl - side * 0.1 * atr, "pred ďalšou úrovňou"
    else:
        tp, tp_reason = entry + side * c["default_tp_atr"] * atr, f"{c['default_tp_atr']:g}× ATR"
    risk = abs(entry - sl)
    return {"entry": round(entry, 2), "sl": round(sl, 2), "tp": round(tp, 2),
            "rr": round(abs(tp - entry) / risk, 2) if risk else None,
            "risk_atr": round(risk / atr, 2), "sl_reason": sl_reason, "tp_reason": tp_reason}
