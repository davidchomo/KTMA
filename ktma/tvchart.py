"""TradingView-style chart for the label UI, built on TradingView Lightweight
Charts (Apache-2.0, vendored in static/). Drag the price axis to stretch it,
wheel/pinch to zoom, double-click an axis to reset, like on TradingView.

`build_spec` turns an indicator frame into plain JSON; `render` draws it.
Display indicators (EMA, RSI, MACD, …) are computed in the browser from raw
OHLCV, so the "ƒx Indikátory" menu inside the chart (also in fullscreen) can
add, hide and restyle them instantly, like on TradingView.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

LIB_LOCAL = "/app/static/lightweight-charts-5.2.1.js"   # served by Streamlit static serving
LIB_CDN = "https://unpkg.com/lightweight-charts@5.2.1/dist/lightweight-charts.standalone.production.js"

UP, DOWN = "#26a69a", "#ef5350"

CHART_TYPES = ["Sviečky", "Bary", "Čiara", "Heikin-Ashi"]
THEMES = {
    "Tmavé": {"bg": "#131722", "text": "#d1d4dc", "grid": "#1e222d", "border": "#2a2e39",
              "legend": "rgba(19,23,34,0.75)", "button": "#2a2e39", "panel": "#1e222d", "muted": "#787b86",
              "scheme": "dark"},
    "Svetlé": {"bg": "#ffffff", "text": "#131722", "grid": "#f0f3fa", "border": "#d1d4dc",
               "legend": "rgba(255,255,255,0.8)", "button": "#f0f3fa", "panel": "#ffffff", "muted": "#787b86",
               "scheme": "light"},
}
SCALES = {"Normálna": 0, "Logaritmická": 1, "Percentá": 2}
STYLE_DEFAULTS = {
    "type": "Sviečky", "up": UP, "down": DOWN, "theme": "Tmavé", "grid": True, "scale": "Normálna",
    # Seed values for the in-chart indicators (used until the browser has its own saved set).
    "ema_fast": 21, "ema_slow": 50, "ema_long": 200,
    "ema_fast_color": "#f2a900", "ema_slow_color": "#2962ff", "ema_long_color": "#ce93d8",
    "rsi_period": 14, "rsi_upper": 80, "rsi_lower": 20, "rsi_color": "#b39ddb",
    "macd_fast": 12, "macd_slow": 26, "macd_signal": 9,
    "macd_up": UP, "macd_down": DOWN, "macd_line_color": "#2962ff", "macd_signal_color": "#ff6d00",
    "line_width": 1, "trendline_width": 2,
}
WARMUP_BARS = 500   # extra bars before the visible window so browser-side indicators are warmed up


def style_indicators(df: pd.DataFrame, style: dict) -> pd.DataFrame:
    """Display-only candle transforms (Heikin-Ashi). Call on the frame *with* warm-up bars."""
    st = {**STYLE_DEFAULTS, **(style or {})}
    out = df.copy()
    if st["type"] == "Heikin-Ashi":
        o, h, l, cl = (out[k].to_numpy(float) for k in ("open", "high", "low", "close"))
        ha_c = (o + h + l + cl) / 4
        ha_o = np.empty_like(ha_c)
        ha_o[0] = (o[0] + cl[0]) / 2
        for i in range(1, len(ha_c)):
            ha_o[i] = (ha_o[i - 1] + ha_c[i - 1]) / 2
        out["ha_open"], out["ha_close"] = ha_o, ha_c
        out["ha_high"] = np.maximum.reduce([h, ha_o, ha_c])
        out["ha_low"] = np.minimum.reduce([l, ha_o, ha_c])
    return out


def default_studies(style: dict | None = None) -> list[dict]:
    """Starting indicator set for a browser without saved indicators (seeded from the saved chart style)."""
    st = {**STYLE_DEFAULTS, **(style or {})}
    lw = int(st["line_width"])
    line = lambda c: {"color": c, "width": lw}  # noqa: E731
    return [
        {"type": "ema", "inputs": {"period": int(st["ema_fast"])}, "plots": {"ma": line(st["ema_fast_color"])}},
        {"type": "ema", "inputs": {"period": int(st["ema_slow"])}, "plots": {"ma": line(st["ema_slow_color"])}},
        {"type": "ema", "visible": False, "inputs": {"period": int(st["ema_long"])},
         "plots": {"ma": line(st["ema_long_color"])}},
        {"type": "vwap", "visible": False},
        {"type": "volume", "plots": {"up": {"color": st["up"]}, "down": {"color": st["down"]}}},
        {"type": "rsi", "inputs": {"period": int(st["rsi_period"]), "upper": int(st["rsi_upper"]),
                                   "lower": int(st["rsi_lower"])}, "plots": {"rsi": line(st["rsi_color"])}},
        {"type": "macd", "inputs": {"fast": int(st["macd_fast"]), "slow": int(st["macd_slow"]),
                                    "signal": int(st["macd_signal"])},
         "plots": {"macd": line(st["macd_line_color"]), "signal": line(st["macd_signal_color"]),
                   "h1": {"color": st["macd_up"]}, "h4": {"color": st["macd_down"]}}},
    ]


# Past human labels on the chart: (position, colour, text)
LABEL_STYLE = {"LONG": ("belowBar", "#26a69a", "L"), "SHORT": ("aboveBar", "#ef5350", "S"),
               "SKIP": ("aboveBar", "#787b86", "✕"), "UNSURE": ("aboveBar", "#787b86", "?")}


def chart_times(open_time_ms) -> np.ndarray:
    """Lightweight Charts shows UTC; shift timestamps so the axis reads Slovak local time.

    One offset (that of the last bar) for the whole window: a per-bar offset would
    create duplicate times when clocks fall back, which the library rejects."""
    ms = np.asarray(open_time_ms, dtype="int64")
    if len(ms) == 0:
        return ms
    offset = pd.Timestamp(int(ms[-1]), unit="ms", tz="UTC").tz_convert("Europe/Bratislava").utcoffset()
    return ms // 1000 + int(offset.total_seconds())


def _series(times, values) -> list[dict]:
    return [{"time": int(t), "value": round(float(v), 4)} for t, v in zip(times, values) if pd.notna(v)]


def _ohlcv(w: pd.DataFrame, warm: pd.DataFrame | None) -> dict:
    """Raw OHLCV (+ VWAP session id) of warm-up + visible bars for the browser-side indicators."""
    full = w if warm is None or warm.empty else pd.concat([warm.tail(WARMUP_BARS), w], ignore_index=True)
    r = lambda col: [round(float(x), 4) for x in full[col].fillna(0.0)]  # noqa: E731
    out = {"t": [int(x) for x in chart_times(full["open_time"])],
           "o": r("open"), "h": r("high"), "l": r("low"), "c": r("close"), "v": r("volume")}
    if "session" in full:
        out["s"] = [int(x) if pd.notna(x) else None for x in full["session"]]
    return out


def build_spec(w: pd.DataFrame, layers: set, lines: list[dict] | None = None, focus_i: int | None = None,
               extend: int = 40, markers: list[dict] | None = None, price_lines: list[dict] | None = None,
               reg_channel: dict | None = None, label_marks: list[dict] | None = None,
               zoom_before: int = 70, zoom_after: int = 40, style: dict | None = None,
               levels: list[dict] | None = None, position: dict | None = None, bar_seconds: int = 300,
               warm: pd.DataFrame | None = None, force_studies: list[str] | None = None,
               symbol: str = "", timeframe: str = "") -> dict:
    """`w` = frame from add_indicators + style_indicators (bars of one timeframe, index 0..n-1);
    `warm` = the bars just before `w` (indicator warm-up only, not drawn)."""
    st = {**STYLE_DEFAULTS, **(style or {})}
    up_c, down_c = st["up"], st["down"]
    t = chart_times(w["open_time"])
    n = len(w)
    focus = n - 1 if focus_i is None else focus_i
    ohlc = ("ha_open", "ha_high", "ha_low", "ha_close") if st["type"] == "Heikin-Ashi" and "ha_open" in w \
        else ("open", "high", "low", "close")
    ohlcv = _ohlcv(w, warm)
    spec: dict = {
        "candles": [{"time": int(a), "open": float(o), "high": float(h), "low": float(l), "close": float(c)}
                    for a, o, h, l, c in zip(t, *(w[k] for k in ohlc))],
        "segments": [], "markers": [], "priceLines": price_lines or [],
        "ohlcv": ohlcv, "warm": len(ohlcv["t"]) - n,
        "studyDefaults": default_studies(st), "forceStudies": force_studies or [],
        # for per-timeframe indicator visibility and drawings saved per symbol + timeframe
        "symbol": symbol, "tf": timeframe, "barSeconds": bar_seconds,
        "tzOffset": int(t[-1] - int(w["open_time"].iloc[-1]) // 1000) if n else 0,
        "style": {**st, "series": {"Bary": "bar", "Čiara": "line"}.get(st["type"], "candle"),
                  "colors": THEMES.get(st["theme"], THEMES["Tmavé"]), "scaleMode": SCALES.get(st["scale"], 0)},
    }

    if "Kanál" in layers and reg_channel and focus + 1 >= reg_channel["period"]:
        xs = np.arange(focus + 1 - reg_channel["period"], focus + 1)
        y = w["close"].to_numpy()[xs]
        b, a0 = np.polyfit(xs, y, 1)
        sd = np.std(y - (a0 + b * xs))
        for k, style in ((reg_channel["std"], 2), (0, 1), (-reg_channel["std"], 2)):
            spec["segments"].append({"color": "#787b86", "width": 1, "style": style, "data": [
                {"time": int(t[xs[0]]), "value": float(a0 + b * xs[0] + k * sd)},
                {"time": int(t[xs[-1]]), "value": float(a0 + b * xs[-1] + k * sd)}]})

    wt = w["open_time"].to_numpy()
    for ln in (lines or []) if "Čiary" in layers else []:
        x1 = int(np.searchsorted(wt, ln["t1"]))
        if x1 >= n or wt[x1] != ln["t1"]:
            x1 = focus - ln["bars_from_t1"]
        x_end = min(n - 1, focus + (0 if ln["ended_here"] else extend))
        x_start = max(x1, 0)
        if x_end <= x_start:
            continue
        val = lambda x: ln["p1"] + ln["slope_per_bar"] * (x - x1)  # noqa: E731
        color = down_c if ln["kind"] == "resistance" else up_c
        # Strong lines (3+ touches) solid and thick, weak ones (2 touches) thin and dashed.
        strong = ln.get("touches", 2) >= 3
        spec["segments"].append({"color": color if strong else color + "aa",
                                 "width": st["trendline_width"] + (1 if ln.get("touches", 2) >= 4 else 0) if strong else 1,
                                 "style": 0 if strong else 2, "data": [
            {"time": int(t[x_start]), "value": float(val(x_start))}, {"time": int(t[x_end]), "value": float(val(x_end))}]})
        if "Dotyky" in layers:
            # Swing points the line was built from / touched (what the scanner "saw").
            for tt in ln.get("touch_times") or []:
                xi = int(np.searchsorted(wt, tt))
                if xi < n and wt[xi] == tt:
                    spec["markers"].append({"time": int(t[xi]), "position": "atPriceMiddle", "price": float(val(xi)),
                                            "color": color + "99", "shape": "circle", "size": 0.3, "text": ""})
        if "Rovnobežky" in layers and ln.get("channel_offset"):
            off = ln["channel_offset"]
            spec["segments"].append({"color": color, "width": 1, "style": 2, "data": [
                {"time": int(t[x_start]), "value": float(val(x_start) + off)},
                {"time": int(t[x_end]), "value": float(val(x_end) + off)}]})

    if position and position.get("entry") and position.get("sl") and position.get("tp"):
        # TradingView-style long/short position: green zone entry→TP, red zone entry→SL.
        n_bars = position.get("bars", 30)
        ts = [int(x) for x in t[focus: focus + n_bars]]
        while len(ts) < n_bars:                          # extend into the future after the last bar
            ts.append((ts[-1] if ts else int(t[-1])) + bar_seconds)
        e, sl, tp = position["entry"], position["sl"], position["tp"]
        risk = abs(e - sl)
        rr = abs(tp - e) / risk if risk else 0
        spec["position"] = {"times": ts, "entry": e, "sl": sl, "tp": tp,
                            "profit": up_c + "40", "loss": down_c + "40"}
        spec["priceLines"] += [
            {"price": e, "color": "#2962ff", "title": "Vstup", "style": 0},
            {"price": tp, "color": up_c, "title": f"TP +{rr:.1f}R", "style": 0},
            {"price": sl, "color": down_c, "title": "SL −1R", "style": 0}]
        if position.get("be"):
            spec["priceLines"].append({"price": position["be"], "color": "#f9a825", "title": "BE", "style": 2})

    if "S/R" in layers:
        ref = float(w["close"].iloc[focus])
        sup = sorted((lv for lv in levels or [] if lv["role"] == "support"), key=lambda lv: ref - lv["price"])[:2]
        res = sorted((lv for lv in levels or [] if lv["role"] != "support"), key=lambda lv: lv["price"] - ref)[:2]
        for lv in sup + res:
            sup = lv["role"] == "support"
            spec["priceLines"].append({"price": lv["price"], "color": (up_c if sup else down_c) + "cc",
                                       "title": f"{'S' if sup else 'R'}{lv['touches']}",
                                       "width": 2 if lv["touches"] >= 3 else 1, "style": 1})

    notes: dict[int, list[str]] = {}
    for m in markers or []:
        i = int(m["i"])
        if 0 <= i < n:
            bull = m["direction"] == "bullish"
            spec["markers"].append({
                "time": int(t[i]), "position": "belowBar" if bull else "aboveBar",
                "color": up_c if bull else down_c, "shape": "arrowUp" if bull else "arrowDown",
                "text": m.get("text", ""), "size": m.get("size", 1)})
            if m.get("note"):
                notes.setdefault(int(t[i]), []).append(("🟢 " if bull else "🔴 ") + m["note"])

    for lab in (label_marks or []) if "Labely" in layers else []:
        i = int(lab["i"])
        if 0 <= i < n:
            style = LABEL_STYLE.get(lab["label"], LABEL_STYLE["UNSURE"])
            spec["markers"].append({"time": int(t[i]), "position": style[0], "color": style[1],
                                    "shape": "circle", "size": 0.5, "text": style[2]})
            notes.setdefault(int(t[i]), []).append(f"🏷️ label: {lab['label']}")
    spec["markers"].sort(key=lambda m: m["time"])
    # Open zoomed in around the focus bar (older bars stay reachable by dragging left).
    spec["focus"] = {"from": max(0, focus - zoom_before), "to": min(n - 1, focus + zoom_after) + 3}
    spec["notes"] = {str(k): v for k, v in notes.items()}
    return spec


_HERE = Path(__file__).parent
_TEMPLATE = (_HERE / "tvchart_template.html").read_text(encoding="utf-8")
_STUDIES_JS = (_HERE / "tvchart_studies.js").read_text(encoding="utf-8")


def render(spec: dict, height: int, key: str):
    import streamlit.components.v1 as components

    colors = spec.get("style", {}).get("colors", THEMES["Tmavé"])
    html = (_TEMPLATE.replace("__HEIGHT__", str(height))
            .replace("__BG__", colors["bg"]).replace("__TEXT__", colors["text"])
            .replace("__LEGEND__", colors["legend"]).replace("__BUTTON__", colors["button"])
            .replace("__BORDER__", colors["border"]).replace("__PANEL__", colors["panel"])
            .replace("__MUTED__", colors["muted"]).replace("__SCHEME__", colors["scheme"])
            .replace("__LIB_LOCAL__", LIB_LOCAL).replace("__LIB_CDN__", LIB_CDN)
            .replace("__KEY__", "".join(ch for ch in key if ch.isalnum() or ch in "-_"))
            .replace("__STUDIES_JS__", _STUDIES_JS)
            .replace("__SPEC__", json.dumps(spec, separators=(",", ":")).replace("</", "<\\/")))
    components.html(html, height=height + 24)
