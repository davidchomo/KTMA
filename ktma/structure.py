"""Market structure: ATR ZigZag swings, automatic trendlines and parallel channels.

Design goals (docs/RESEARCH.md §10):
* **No repainting.** A swing pivot only exists from the bar on which it is
  confirmed; a trendline only exists from the bar on which its second anchor
  was confirmed. Everything is computed bar-by-bar, so the state after bar *i*
  depends only on bars <= i.
* **Lines persist like a human's drawing.** A line stays until price closes
  through it, it expires without new touches, or a clearly better line pushes
  it out. New pivots that land on an existing line strengthen it instead of
  creating a near-duplicate.

Lines are defined in bar-index space (like TradingView), so session gaps and
weekends don't bend them.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

import numpy as np
import pandas as pd

SUPPORT, RESISTANCE = "support", "resistance"


@dataclass
class Pivot:
    kind: str          # "H" (swing high) or "L" (swing low)
    idx: int           # bar of the extreme
    price: float
    confirm_idx: int   # bar on which the swing became known


@dataclass
class Line:
    kind: str
    i1: int
    p1: float
    i2: int
    p2: float
    slope: float               # price per bar
    touches: int
    created_idx: int
    last_touch_idx: int
    channel_offset: float      # parallel line = value + offset (opposite side of the channel)
    score: float = 0.0
    ended_idx: int | None = None
    end_reason: str | None = None
    last_touch_alert_idx: int = -10**9
    touch_idxs: list = field(default_factory=list)
    touch_conf: list = field(default_factory=list)   # bar on which each touch became known

    def value(self, i: float) -> float:
        return self.p1 + self.slope * (i - self.i1)


@dataclass
class Level:
    """Horizontal support/resistance: swing highs/lows clustered at one price.
    Its role (support or resistance) is decided by where price is, so it flips after a break."""
    price: float
    touches: int
    created_idx: int
    last_touch_idx: int
    touch_idxs: list = field(default_factory=list)
    touch_prices: list = field(default_factory=list)
    touch_conf: list = field(default_factory=list)
    ended_idx: int | None = None
    end_reason: str | None = None
    last_alert_idx: int = -10**9


def zigzag(high: np.ndarray, low: np.ndarray, atr: np.ndarray, k: float) -> list[Pivot]:
    """ATR ZigZag. A swing high is confirmed once price falls k*ATR below the
    running extreme (and vice versa). Confirmed pivots never change."""
    n = len(high)
    valid = np.flatnonzero(~np.isnan(atr))
    if len(valid) == 0:
        return []
    s = int(valid[0])
    pivots: list[Pivot] = []
    direction = 0  # 0 undecided, +1 up-leg (tracking high), -1 down-leg (tracking low)
    hi, hi_i, lo, lo_i = high[s], s, low[s], s
    for i in range(s + 1, n):
        thr = k * atr[i]
        if direction >= 0 and high[i] > hi:
            hi, hi_i = high[i], i
        if direction <= 0 and low[i] < lo:
            lo, lo_i = low[i], i
        if direction >= 0 and hi_i < i and hi - low[i] >= thr:
            pivots.append(Pivot("H", hi_i, float(hi), i))
            direction = -1
            seg = low[hi_i + 1:i + 1]
            lo_i = hi_i + 1 + int(np.argmin(seg))
            lo = low[lo_i]
        elif direction <= 0 and lo_i < i and high[i] - lo >= thr:
            pivots.append(Pivot("L", lo_i, float(lo), i))
            direction = 1
            seg = high[lo_i + 1:i + 1]
            hi_i = lo_i + 1 + int(np.argmax(seg))
            hi = high[hi_i]
    return pivots


class StructureEngine:
    def __init__(self, scfg: dict, zigzag_k: float):
        self.k = zigzag_k
        self.lookback = scfg["pivots_lookback"]
        self.touch = scfg["touch_atr"]
        self.brk = scfg["break_atr"]
        self.max_slope = scfg["max_slope_atr"]
        self.max_age = scfg["max_line_age_bars"]
        self.max_dist = scfg.get("max_distance_atr", 12)
        self.max_lines = scfg["max_lines_per_side"]
        self.cooldown = scfg["touch_cooldown_bars"]
        lv = scfg.get("levels") or {}
        self.levels_on = lv.get("enabled", True)
        self.lv_merge = lv.get("merge_atr", 0.4)
        self.lv_min = lv.get("min_touches", 2)
        self.lv_break = lv.get("break_atr", 0.15)
        self.lv_touch = lv.get("touch_atr", 0.25)
        self.lv_dist = lv.get("max_distance_atr", 15)
        self.lv_age = lv.get("max_age_bars", 1500)
        self.lv_max = lv.get("max_levels", 8)

    def run(self, df: pd.DataFrame) -> dict:
        """`df` needs high, low, close, atr. Returns pivots, all lines, events
        (bar-indexed) and per-bar state arrays for features."""
        high = df["high"].to_numpy(float)
        low = df["low"].to_numpy(float)
        close = df["close"].to_numpy(float)
        atr = df["atr"].to_numpy(float)
        n = len(df)

        pivots = zigzag(high, low, atr, self.k)
        by_confirm: dict[int, list[Pivot]] = {}
        for p in pivots:
            by_confirm.setdefault(p.confirm_idx, []).append(p)

        known: dict[str, list[Pivot]] = {"H": [], "L": []}
        active: list[Line] = []
        all_lines: list[Line] = []
        events: list[dict] = []
        levels: list[Level] = []
        all_levels: list[Level] = []
        state = {k: np.full(n, np.nan) for k in (
            "sup_val", "sup_slope", "sup_touches", "sup_age", "sup_chan",
            "res_val", "res_slope", "res_touches", "res_age", "res_chan", "swing_trend",
            "lvl_sup_val", "lvl_sup_touches", "lvl_res_val", "lvl_res_touches")}

        for i in range(n):
            a = atr[i]
            if np.isnan(a):
                continue

            # 1) Existing lines vs. this bar: break, touch, expiry.
            for line in list(active):
                if line.created_idx >= i:
                    continue
                v = line.value(i)
                if line.kind == RESISTANCE and close[i] > v + self.brk * a:
                    self._end(line, i, "break", active)
                    events.append(self._event("TL_BREAK_UP", "bullish", i, line, v, a))
                elif line.kind == SUPPORT and close[i] < v - self.brk * a:
                    self._end(line, i, "break", active)
                    events.append(self._event("TL_BREAK_DOWN", "bearish", i, line, v, a))
                elif i - line.last_touch_idx > self.max_age:
                    self._end(line, i, "expired", active)
                elif abs(close[i] - v) > self.max_dist * a:
                    self._end(line, i, "far", active)
                elif i - line.last_touch_alert_idx >= self.cooldown:
                    if line.kind == RESISTANCE and high[i] >= v - self.touch * a and close[i] <= v:
                        line.last_touch_alert_idx = i
                        events.append(self._event("TL_TOUCH_RESISTANCE", "bearish", i, line, v, a))
                    elif line.kind == SUPPORT and low[i] <= v + self.touch * a and close[i] >= v:
                        line.last_touch_alert_idx = i
                        events.append(self._event("TL_TOUCH_SUPPORT", "bullish", i, line, v, a))

            # 1b) Horizontal levels vs. this bar: break (role flips), bounce, expiry.
            if self.levels_on and i > 0:
                self._levels_bar(levels, events, i, high, low, close, a)

            # 2) Newly confirmed pivots: strengthen lines, create new ones.
            for p in by_confirm.get(i, []):
                kind = RESISTANCE if p.kind == "H" else SUPPORT
                for line in active:
                    if line.kind == kind and abs(p.price - line.value(p.idx)) <= self.touch * a \
                            and p.idx not in line.touch_idxs and p.idx > line.i2:
                        line.touches += 1
                        line.touch_idxs.append(p.idx)
                        line.touch_conf.append(i)
                        line.last_touch_idx = p.idx
                        line.score = self._score(line.touches, line.i2 - line.i1)
                cand = self._best_candidate(p, known[p.kind][-self.lookback:], kind, high, low, close, atr, i)
                if cand is not None and not self._duplicate(cand, active, i, a):
                    active.append(cand)
                    all_lines.append(cand)
                    side = sorted((l for l in active if l.kind == kind), key=lambda l: (l.score, l.created_idx))
                    for weak in side[: max(0, len(side) - self.max_lines)]:
                        self._end(weak, i, "replaced", active)
                known[p.kind].append(p)
                if self.levels_on:
                    self._levels_pivot(levels, all_levels, p, i, close[i], a)

            # 3) Per-bar state (after this bar closed) for features.
            self._record_state(state, i, close[i], active)
            self._record_levels(state, i, close[i], levels)
            hs, ls = known["H"], known["L"]
            if len(hs) >= 2 and len(ls) >= 2:
                up = hs[-1].price > hs[-2].price and ls[-1].price > ls[-2].price
                down = hs[-1].price < hs[-2].price and ls[-1].price < ls[-2].price
                state["swing_trend"][i] = 1.0 if up else (-1.0 if down else 0.0)

        return {"pivots": pivots, "lines": all_lines, "levels": all_levels, "events": events, "state": state}

    # ---- horizontal levels -------------------------------------------
    def _levels_bar(self, levels, events, i, high, low, close, a):
        prev = close[i - 1]
        for lv in list(levels):
            L = lv.price
            if abs(close[i] - L) > self.lv_dist * a:
                self._end(lv, i, "far", levels)
                continue
            if i - lv.last_touch_idx > self.lv_age:
                self._end(lv, i, "expired", levels)
                continue
            if lv.created_idx >= i or lv.touches < self.lv_min or i - lv.last_alert_idx < self.cooldown:
                continue
            brk, tch = self.lv_break * a, self.lv_touch * a
            info = {"price": L, "touches": lv.touches, "age_bars": i - lv.touch_idxs[0]}
            if prev <= L and close[i] > L + brk:
                lv.last_alert_idx = i
                events.append({"i": i, "signal": "SR_BREAK_UP", "direction": "bullish", "level": info})
            elif prev >= L and close[i] < L - brk:
                lv.last_alert_idx = i
                events.append({"i": i, "signal": "SR_BREAK_DOWN", "direction": "bearish", "level": info})
            elif prev > L and low[i] <= L + tch and close[i] > L:
                lv.last_alert_idx = i
                events.append({"i": i, "signal": "SR_BOUNCE_SUPPORT", "direction": "bullish", "level": info})
            elif prev < L and high[i] >= L - tch and close[i] < L:
                lv.last_alert_idx = i
                events.append({"i": i, "signal": "SR_BOUNCE_RESISTANCE", "direction": "bearish", "level": info})

    def _levels_pivot(self, levels, all_levels, p: Pivot, i, c, a):
        near = [lv for lv in levels if abs(lv.price - p.price) <= self.lv_merge * a]
        if near:
            lv = min(near, key=lambda x: abs(x.price - p.price))
            if p.idx not in lv.touch_idxs:
                lv.touches += 1
                lv.touch_idxs.append(p.idx)
                lv.touch_prices.append(p.price)
                lv.touch_conf.append(i)
                lv.last_touch_idx = p.idx
                lv.price = float(np.mean(lv.touch_prices))
            return
        lv = Level(p.price, 1, i, p.idx, [p.idx], [p.price], [i])
        levels.append(lv)
        all_levels.append(lv)
        if len(levels) > self.lv_max:
            # Keep the strongest / nearest levels; drop the weakest far one.
            worst = max(levels, key=lambda x: (abs(x.price - c) / a) - 3 * x.touches)
            self._end(worst, i, "replaced", levels)

    def _record_levels(self, state, i, c, levels):
        valid = [lv for lv in levels if lv.touches >= self.lv_min]
        below = [lv for lv in valid if lv.price <= c]
        above = [lv for lv in valid if lv.price > c]
        if below:
            s = max(below, key=lambda x: x.price)
            state["lvl_sup_val"][i], state["lvl_sup_touches"][i] = s.price, s.touches
        if above:
            r = min(above, key=lambda x: x.price)
            state["lvl_res_val"][i], state["lvl_res_touches"][i] = r.price, r.touches

    # ------------------------------------------------------------------
    @staticmethod
    def _score(touches: int, length: int) -> float:
        return touches * 10.0 + length / 50.0

    @staticmethod
    def _end(line, i: int, reason: str, active: list):
        line.ended_idx = i
        line.end_reason = reason
        active.remove(line)

    def _best_candidate(self, p: Pivot, prior: list[Pivot], kind: str, high, low, close, atr, i) -> Line | None:
        a = atr[i]
        best = None
        for q in prior:
            if q.idx >= p.idx:
                continue
            slope = (p.price - q.price) / (p.idx - q.idx)
            if abs(slope) > self.max_slope * a:
                continue
            j = np.arange(q.idx, i + 1)
            vals = q.price + slope * (j - q.idx)
            tol = self.brk * atr[q.idx:i + 1]
            seg_close = close[q.idx:i + 1]
            if kind == RESISTANCE and np.any(seg_close > vals + tol):
                continue
            if kind == SUPPORT and np.any(seg_close < vals - tol):
                continue
            touches = sum(
                1 for r in prior if q.idx <= r.idx <= p.idx and abs(r.price - (q.price + slope * (r.idx - q.idx))) <= self.touch * a
            )
            touches = max(touches, 1) + 1  # + the new pivot itself
            if kind == RESISTANCE:
                offset = float(np.min(low[q.idx:i + 1] - vals))
            else:
                offset = float(np.max(high[q.idx:i + 1] - vals))
            line = Line(kind, q.idx, q.price, p.idx, p.price, slope, touches, i, p.idx, offset,
                        score=self._score(touches, p.idx - q.idx),
                        touch_idxs=[r.idx for r in prior if q.idx <= r.idx <= p.idx
                                    and abs(r.price - (q.price + slope * (r.idx - q.idx))) <= self.touch * a] + [p.idx])
            line.touch_conf = [i] * len(line.touch_idxs)
            if best is None or line.score > best.score:
                best = line
        return best

    def _duplicate(self, cand: Line, active: list[Line], i: int, a: float) -> bool:
        return any(
            l.kind == cand.kind
            and abs(l.slope - cand.slope) < 0.05 * a
            and abs(l.value(i) - cand.value(i)) <= self.touch * a
            for l in active
        )

    @staticmethod
    def _event(signal: str, direction: str, i: int, line: Line, v: float, a: float) -> dict:
        return {
            "i": i, "signal": signal, "direction": direction,
            "line": {"kind": line.kind, "touches": line.touches, "slope_atr": line.slope / a,
                     "age_bars": i - line.i1, "value": v},
        }

    @staticmethod
    def _record_state(state, i, c, active):
        sup = [l for l in active if l.kind == SUPPORT and l.value(i) <= c]
        res = [l for l in active if l.kind == RESISTANCE and l.value(i) >= c]
        if sup:
            s = max(sup, key=lambda l: l.value(i))
            state["sup_val"][i], state["sup_slope"][i] = s.value(i), s.slope
            state["sup_touches"][i], state["sup_age"][i] = s.touches, i - s.i1
            state["sup_chan"][i] = s.value(i) + s.channel_offset
        if res:
            r = min(res, key=lambda l: l.value(i))
            state["res_val"][i], state["res_slope"][i] = r.value(i), r.slope
            state["res_touches"][i], state["res_age"][i] = r.touches, i - r.i1
            state["res_chan"][i] = r.value(i) + r.channel_offset


def lines_snapshot(lines: list[Line], i: int, times: np.ndarray) -> list[dict]:
    """Lines that existed at the close of bar `i` (active, or ended on `i`),
    in a JSON-friendly form with absolute times for the label UI."""
    out = []
    for l in lines:
        if l.created_idx > i or (l.ended_idx is not None and l.ended_idx < i):
            continue
        out.append({
            "kind": l.kind, "t1": int(times[l.i1]), "p1": l.p1, "t2": int(times[l.i2]), "p2": l.p2,
            "slope_per_bar": l.slope, "touches": sum(1 for c in l.touch_conf if c <= i) or l.touches,
            "value_at_alert": l.value(i),
            "channel_offset": l.channel_offset,
            "bars_from_t1": i - l.i1, "ended_here": l.ended_idx == i,
            "touch_times": sorted({int(times[k]) for k, c in zip(l.touch_idxs, l.touch_conf) if c <= i}),
        })
    return out


def levels_snapshot(levels: list[Level], i: int, times: np.ndarray, close: float, min_touches: int = 2) -> list[dict]:
    """Valid horizontal levels at the close of bar `i`, with their current role."""
    out = []
    for lv in levels:
        if lv.created_idx > i or (lv.ended_idx is not None and lv.ended_idx < i):
            continue
        touches = sum(1 for c in lv.touch_conf if c <= i)
        if touches < min_touches:
            continue
        prices = [pr for c, pr in zip(lv.touch_conf, lv.touch_prices) if c <= i]
        out.append({"price": float(np.mean(prices)), "touches": touches,
                    "role": "support" if np.mean(prices) <= close else "resistance",
                    "since": int(times[lv.touch_idxs[0]])})
    return out


def line_record(line: Line, times: np.ndarray) -> dict:
    d = asdict(line)
    return {
        "kind": line.kind, "t1": int(times[line.i1]), "p1": line.p1, "t2": int(times[line.i2]),
        "p2": line.p2, "slope_per_bar": line.slope, "touches": line.touches,
        "created_time": int(times[line.created_idx]),
        "ended_time": int(times[line.ended_idx]) if d["ended_idx"] is not None else None,
        "end_reason": line.end_reason,
    }
