"""TradingView-style chart for the label UI, built on TradingView Lightweight
Charts (Apache-2.0, vendored in static/). Drag the price axis to stretch it,
wheel/pinch to zoom, double-click an axis to reset, like on TradingView.

`build_spec` turns an indicator frame into plain JSON; `render` draws it.
"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd

LIB_LOCAL = "/app/static/lightweight-charts-5.2.1.js"   # served by Streamlit static serving
LIB_CDN = "https://unpkg.com/lightweight-charts@5.2.1/dist/lightweight-charts.standalone.production.js"

UP, DOWN = "#26a69a", "#ef5350"

CHART_TYPES = ["Sviečky", "Bary", "Čiara", "Heikin-Ashi"]
THEMES = {
    "Tmavé": {"bg": "#131722", "text": "#d1d4dc", "grid": "#1e222d", "border": "#2a2e39",
              "legend": "rgba(19,23,34,0.75)", "button": "#2a2e39"},
    "Svetlé": {"bg": "#ffffff", "text": "#131722", "grid": "#f0f3fa", "border": "#d1d4dc",
               "legend": "rgba(255,255,255,0.8)", "button": "#f0f3fa"},
}
SCALES = {"Normálna": 0, "Logaritmická": 1, "Percentá": 2}
STYLE_DEFAULTS = {
    "type": "Sviečky", "up": UP, "down": DOWN, "theme": "Tmavé", "grid": True, "scale": "Normálna",
    "ema_fast": 21, "ema_slow": 50, "ema_long": 200,
    "ema_fast_color": "#f2a900", "ema_slow_color": "#2962ff", "ema_long_color": "#ce93d8",
    "rsi_period": 14, "rsi_upper": 80, "rsi_lower": 20, "rsi_color": "#b39ddb",
    "macd_fast": 12, "macd_slow": 26, "macd_signal": 9,
    "macd_up": UP, "macd_down": DOWN, "macd_line_color": "#2962ff", "macd_signal_color": "#ff6d00",
    "line_width": 1, "trendline_width": 2,
}


def style_indicators(df: pd.DataFrame, style: dict) -> pd.DataFrame:
    """Display-only indicators with the user's own periods (the scanner keeps its config).
    Call on the frame *with* warm-up bars, before slicing the visible window."""
    from .indicators import ema, macd, rsi

    st = {**STYLE_DEFAULTS, **(style or {})}
    out = df.copy()
    c = out["close"]
    for k in ("ema_fast", "ema_slow", "ema_long"):
        out[f"s_{k}"] = ema(c, int(st[k]))
    out["s_rsi"] = rsi(c, int(st["rsi_period"]))
    m = macd(c, int(st["macd_fast"]), int(st["macd_slow"]), int(st["macd_signal"]))
    out["s_macd"], out["s_macd_signal"], out["s_macd_hist"] = m["macd"], m["macd_signal"], m["macd_hist"]
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


def build_spec(w: pd.DataFrame, layers: set, lines: list[dict] | None = None, focus_i: int | None = None,
               extend: int = 40, markers: list[dict] | None = None, price_lines: list[dict] | None = None,
               reg_channel: dict | None = None, label_marks: list[dict] | None = None,
               zoom_before: int = 70, zoom_after: int = 40, style: dict | None = None,
               levels: list[dict] | None = None) -> dict:
    """`w` = frame from add_indicators + style_indicators (bars of one timeframe, index 0..n-1)."""
    st = {**STYLE_DEFAULTS, **(style or {})}
    up_c, down_c = st["up"], st["down"]
    t = chart_times(w["open_time"])
    n = len(w)
    focus = n - 1 if focus_i is None else focus_i
    ohlc = ("ha_open", "ha_high", "ha_low", "ha_close") if st["type"] == "Heikin-Ashi" and "ha_open" in w \
        else ("open", "high", "low", "close")
    spec: dict = {
        "candles": [{"time": int(a), "open": float(o), "high": float(h), "low": float(l), "close": float(c)}
                    for a, o, h, l, c in zip(t, *(w[k] for k in ohlc))],
        "overlays": [], "segments": [], "markers": [], "priceLines": price_lines or [], "panes": {},
        "style": {**st, "series": {"Bary": "bar", "Čiara": "line"}.get(st["type"], "candle"),
                  "colors": THEMES.get(st["theme"], THEMES["Tmavé"]), "scaleMode": SCALES.get(st["scale"], 0)},
    }
    col = lambda name, fallback: w[name] if name in w else w.get(fallback, pd.Series(dtype=float))  # noqa: E731
    if "EMA" in layers:
        spec["overlays"] += [
            {"name": f"EMA {st['ema_fast']}", "color": st["ema_fast_color"], "data": _series(t, col("s_ema_fast", "ma_21"))},
            {"name": f"EMA {st['ema_slow']}", "color": st["ema_slow_color"], "data": _series(t, col("s_ema_slow", "ma_50"))}]
    if "EMA dlhá" in layers:
        spec["overlays"].append({"name": f"EMA {st['ema_long']}", "color": st["ema_long_color"],
                                 "data": _series(t, col("s_ema_long", "ma_200"))})
    if "VWAP" in layers and "vwap" in w:
        spec["overlays"].append({"name": "VWAP", "color": "#4db6ac", "style": 2, "data": _series(t, w["vwap"])})

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

    if "S/R" in layers:
        for lv in levels or []:
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

    if "Objem" in layers:
        up = (w["close"] >= w["open"]).to_numpy()
        spec["volume"] = [{"time": int(a), "value": float(v), "color": (up_c if u else down_c) + "80"}
                          for a, v, u in zip(t, w["volume"].fillna(0), up)]
    if "RSI" in layers:
        spec["panes"]["rsi"] = {"data": _series(t, col("s_rsi", "rsi")),
                                "levels": [st["rsi_upper"], st["rsi_lower"]]}
    if "MACD" in layers:
        h = col("s_macd_hist", "macd_hist").to_numpy()
        prev = np.concatenate([[np.nan], h[:-1]])
        # Green above zero, red below; a weakening bar is the same colour, slightly transparent.
        mu, md = st["macd_up"], st["macd_down"]
        colors = np.where(h >= 0, np.where(h >= prev, mu, mu + "99"), np.where(h <= prev, md, md + "99"))
        spec["panes"]["macd"] = {
            "hist": [{"time": int(a), "value": round(float(v), 4), "color": c}
                     for a, v, c in zip(t, h, colors) if pd.notna(v)],
            "macd": _series(t, col("s_macd", "macd")), "signal": _series(t, col("s_macd_signal", "macd_signal")),
        }
    return spec


_TEMPLATE = """<!doctype html><html><head><meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; background: __BG__; font-family: -apple-system, system-ui, sans-serif; }
  #chart { position: relative; width: 100%; height: __HEIGHT__px; }
  #legend { position: absolute; left: 8px; top: 6px; z-index: 5; font-size: 12px; color: __TEXT__;
            pointer-events: none; line-height: 1.5; background: __LEGEND__; padding: 0 4px; }
  #legend b { font-weight: 600; }
  #help { font-size: 11px; color: #787b86; padding: 2px 8px; }
  #fs { position: absolute; right: 70px; top: 6px; z-index: 6; background: __BUTTON__; color: __TEXT__;
        border: 1px solid __BORDER__; border-radius: 4px; font-size: 15px; line-height: 1; padding: 4px 7px;
        cursor: pointer; }
  #fs:hover { opacity: 0.8; }
  html:fullscreen #chart { height: 100vh !important; }
  html:fullscreen #help { display: none; }
</style></head><body>
<div id="chart"><div id="legend"></div><button id="fs" title="Celá obrazovka (Esc = späť)">⛶</button></div>
<div id="help">ťahaj graf = posun · koliesko / dva prsty = zoom · ťahaj cenovú stupnicu hore/dole = natiahnuť ·
 dvojklik na stupnicu = späť</div>
<script src="__LIB_LOCAL__" onerror="var s=document.createElement('script');s.src='__LIB_CDN__';s.onload=start;document.head.appendChild(s);"></script>
<script>
const SPEC = __SPEC__;
const STORE_KEY = "ktma-range-__KEY__";
function draw() {
  if (!window.LightweightCharts || window.__drawn) return;
  window.__drawn = true;
  const LW = LightweightCharts;
  const ST = SPEC.style, C = ST.colors;
  const el = document.getElementById('chart');
  const chart = LW.createChart(el, {
    autoSize: true,
    layout: { background: { color: C.bg }, textColor: C.text, fontSize: 11,
              panes: { separatorColor: C.border, enableResize: true } },
    grid: { vertLines: { color: C.grid, visible: ST.grid }, horzLines: { color: C.grid, visible: ST.grid } },
    crosshair: { mode: LW.CrosshairMode.Normal },
    rightPriceScale: { borderColor: C.border, scaleMargins: { top: 0.08, bottom: 0.12 }, mode: ST.scaleMode },
    timeScale: { borderColor: C.border, timeVisible: true, secondsVisible: false, rightOffset: 5 },
    handleScale: { axisPressedMouseMove: { time: true, price: true }, mouseWheel: true, pinch: true,
                   axisDoubleClickReset: { time: true, price: true } },
    handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
  });
  let candles;
  if (ST.series === 'line') {
    candles = chart.addSeries(LW.LineSeries, { color: ST.up, lineWidth: Math.max(2, ST.line_width) });
    candles.setData(SPEC.candles.map(c => ({ time: c.time, value: c.close })));
  } else if (ST.series === 'bar') {
    candles = chart.addSeries(LW.BarSeries, { upColor: ST.up, downColor: ST.down, thinBars: false });
    candles.setData(SPEC.candles);
  } else {
    candles = chart.addSeries(LW.CandlestickSeries, { upColor: ST.up, downColor: ST.down, borderVisible: false,
                                                       wickUpColor: ST.up, wickDownColor: ST.down });
    candles.setData(SPEC.candles);
  }
  const byTime = new Map(SPEC.candles.map(c => [c.time, c]));
  const quiet = { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
  for (const o of SPEC.overlays) {
    const s = chart.addSeries(LW.LineSeries, { ...quiet, color: o.color, lineWidth: ST.line_width, lineStyle: o.style || 0,
                                                 title: '', autoscaleInfoProvider: () => null });
    s.setData(o.data);
  }
  for (const g of SPEC.segments) {
    const s = chart.addSeries(LW.LineSeries, { ...quiet, color: g.color, lineWidth: g.width, lineStyle: g.style,
                                                 autoscaleInfoProvider: () => null });
    s.setData(g.data);
  }
  if (SPEC.markers.length) LW.createSeriesMarkers(candles, SPEC.markers);
  for (const p of SPEC.priceLines) {
    candles.createPriceLine({ price: p.price, color: p.color, lineWidth: p.width || 1,
                              lineStyle: p.style === undefined ? 2 : p.style, axisLabelVisible: true, title: p.title });
  }
  if (SPEC.volume) {
    const v = chart.addSeries(LW.HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol',
                                                     priceLineVisible: false, lastValueVisible: false });
    v.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    v.setData(SPEC.volume);
  }
  let pane = 1, rsiSeries = null;
  if (SPEC.panes.rsi) {
    rsiSeries = chart.addSeries(LW.LineSeries, { color: ST.rsi_color, lineWidth: ST.line_width, priceLineVisible: false }, pane);
    rsiSeries.setData(SPEC.panes.rsi.data);
    for (const lvl of SPEC.panes.rsi.levels) {
      rsiSeries.createPriceLine({ price: lvl, color: '#5d606b', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' });
    }
    pane++;
  }
  if (SPEC.panes.macd) {
    const h = chart.addSeries(LW.HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pane);
    h.setData(SPEC.panes.macd.hist);
    const m = chart.addSeries(LW.LineSeries, { color: ST.macd_line_color, lineWidth: ST.line_width, priceLineVisible: false,
                                               lastValueVisible: false }, pane);
    m.setData(SPEC.panes.macd.macd);
    const s = chart.addSeries(LW.LineSeries, { color: ST.macd_signal_color, lineWidth: ST.line_width, priceLineVisible: false,
                                               lastValueVisible: false }, pane);
    s.setData(SPEC.panes.macd.signal);
  }
  const panes = chart.panes();
  if (panes.length > 1) {
    panes[0].setStretchFactor(5);
    for (let i = 1; i < panes.length; i++) panes[i].setStretchFactor(1);
  }

  // OHLC legend like on TradingView
  const legend = document.getElementById('legend');
  const fmt = x => (x === undefined ? '–' : x.toFixed(2));
  const esc = x => String(x).replace(/[&<>]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'}[c]));
  const show = d => {
    if (!d) { legend.innerHTML = ''; return; }
    const col = d.close >= d.open ? ST.up : ST.down;
    const notes = (SPEC.notes || {})[String(d.time)] || [];
    legend.innerHTML = `O <b style="color:${col}">${fmt(d.open)}</b> H <b style="color:${col}">${fmt(d.high)}</b> ` +
                       `L <b style="color:${col}">${fmt(d.low)}</b> C <b style="color:${col}">${fmt(d.close)}</b>` +
                       notes.map(x => `<br>${esc(x)}`).join('');
  };
  show(SPEC.candles[SPEC.candles.length - 1]);
  chart.subscribeCrosshairMove(p => {
    const d = p && p.time !== undefined ? byTime.get(p.time) : null;
    show(d || SPEC.candles[SPEC.candles.length - 1]);
  });

  // Keep zoom/scroll across Streamlit reruns (e.g. while editing SL/TP).
  const ts = chart.timeScale();
  let restored = false;
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORE_KEY) || 'null');
    if (saved && saved.to - saved.from > 5) { ts.setVisibleLogicalRange(saved); restored = true; }
  } catch (e) {}
  if (!restored) { if (SPEC.focus) ts.setVisibleLogicalRange(SPEC.focus); else ts.fitContent(); }
  ts.subscribeVisibleLogicalRangeChange(r => {
    if (!r || el.clientWidth === 0) return;   // never remember the range of a hidden chart
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(r)); } catch (e) {}
  });
}
document.getElementById('fs').onclick = () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
};
// A chart inside a hidden Streamlit tab has zero width; wait until it is visible.
function start() {
  if (!window.LightweightCharts) return;
  const el = document.getElementById('chart');
  if (el.clientWidth > 0) { draw(); return; }
  const obs = new ResizeObserver(() => { if (el.clientWidth > 0) { obs.disconnect(); draw(); } });
  obs.observe(el);
}
if (window.LightweightCharts) start(); else window.addEventListener('load', start);
</script></body></html>"""


def render(spec: dict, height: int, key: str):
    import streamlit.components.v1 as components

    colors = spec.get("style", {}).get("colors", THEMES["Tmavé"])
    html = (_TEMPLATE.replace("__HEIGHT__", str(height))
            .replace("__BG__", colors["bg"]).replace("__TEXT__", colors["text"])
            .replace("__LEGEND__", colors["legend"]).replace("__BUTTON__", colors["button"])
            .replace("__BORDER__", colors["border"])
            .replace("__LIB_LOCAL__", LIB_LOCAL).replace("__LIB_CDN__", LIB_CDN)
            .replace("__KEY__", "".join(ch for ch in key if ch.isalnum() or ch in "-_"))
            .replace("__SPEC__", json.dumps(spec, separators=(",", ":")).replace("</", "<\\/")))
    components.html(html, height=height + 24)
