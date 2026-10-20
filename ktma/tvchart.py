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
# Past human labels on the chart: (position, colour, text)
LABEL_STYLE = {"LONG": ("belowBar", "#00897b", "L"), "SHORT": ("aboveBar", "#d32f2f", "S"),
               "SKIP": ("aboveBar", "#787b86", "✕"), "UNSURE": ("aboveBar", "#b2b5be", "?")}
# TradingView's 4-colour MACD histogram: strong/weak green above zero, strong/weak red below.
MACD_COLORS = {"up_rising": "#26a69a", "up_falling": "#b2dfdb", "down_falling": "#ff5252", "down_rising": "#ffcdd2"}


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
               reg_channel: dict | None = None, rsi_levels=(80, 20), label_marks: list[dict] | None = None) -> dict:
    """`w` = frame from add_indicators (bars of one timeframe, index 0..n-1)."""
    t = chart_times(w["open_time"])
    n = len(w)
    focus = n - 1 if focus_i is None else focus_i
    spec: dict = {
        "candles": [{"time": int(a), "open": float(o), "high": float(h), "low": float(l), "close": float(c)}
                    for a, o, h, l, c in zip(t, w["open"], w["high"], w["low"], w["close"])],
        "overlays": [], "segments": [], "markers": [], "priceLines": price_lines or [], "panes": {},
    }
    if "EMA 21/50" in layers:
        spec["overlays"] += [{"name": "EMA 21", "color": "#f2a900", "data": _series(t, w.get("ma_21", []))},
                             {"name": "EMA 50", "color": "#2962ff", "data": _series(t, w.get("ma_50", []))}]
    if "EMA 200" in layers and "ma_200" in w:
        spec["overlays"].append({"name": "EMA 200", "color": "#9c27b0", "data": _series(t, w["ma_200"])})
    if "VWAP" in layers and "vwap" in w:
        spec["overlays"].append({"name": "VWAP", "color": "#00897b", "style": 2, "data": _series(t, w["vwap"])})

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
        color = DOWN if ln["kind"] == "resistance" else UP
        spec["segments"].append({"color": color, "width": 2, "style": 0, "data": [
            {"time": int(t[x_start]), "value": float(val(x_start))}, {"time": int(t[x_end]), "value": float(val(x_end))}]})
        if "Dotyky" in layers:
            # Swing points the line was built from / touched (what the scanner "saw").
            for tt in ln.get("touch_times") or []:
                xi = int(np.searchsorted(wt, tt))
                if xi < n and wt[xi] == tt:
                    spec["markers"].append({"time": int(t[xi]), "position": "atPriceMiddle", "price": float(val(xi)),
                                            "color": color, "shape": "circle", "size": 0.6, "text": ""})
        if "Rovnobežky" in layers and ln.get("channel_offset"):
            off = ln["channel_offset"]
            spec["segments"].append({"color": color, "width": 1, "style": 2, "data": [
                {"time": int(t[x_start]), "value": float(val(x_start) + off)},
                {"time": int(t[x_end]), "value": float(val(x_end) + off)}]})

    notes: dict[int, list[str]] = {}
    for m in markers or []:
        i = int(m["i"])
        if 0 <= i < n:
            bull = m["direction"] == "bullish"
            spec["markers"].append({
                "time": int(t[i]), "position": "belowBar" if bull else "aboveBar",
                "color": UP if bull else DOWN, "shape": "arrowUp" if bull else "arrowDown",
                "text": m.get("text", ""), "size": m.get("size", 1)})
            if m.get("note"):
                notes.setdefault(int(t[i]), []).append(("🟢 " if bull else "🔴 ") + m["note"])

    for lab in (label_marks or []) if "Labely" in layers else []:
        i = int(lab["i"])
        if 0 <= i < n:
            style = LABEL_STYLE.get(lab["label"], LABEL_STYLE["UNSURE"])
            spec["markers"].append({"time": int(t[i]), "position": style[0], "color": style[1],
                                    "shape": "square", "size": 1, "text": style[2]})
            notes.setdefault(int(t[i]), []).append(f"🏷️ label: {lab['label']}")
    spec["markers"].sort(key=lambda m: m["time"])
    spec["notes"] = {str(k): v for k, v in notes.items()}

    if "Objem" in layers:
        up = (w["close"] >= w["open"]).to_numpy()
        spec["volume"] = [{"time": int(a), "value": float(v), "color": (UP if u else DOWN) + "80"}
                          for a, v, u in zip(t, w["volume"].fillna(0), up)]
    if "RSI" in layers:
        spec["panes"]["rsi"] = {"data": _series(t, w["rsi"]), "levels": list(rsi_levels)}
    if "MACD" in layers:
        h = w["macd_hist"].to_numpy()
        prev = np.concatenate([[np.nan], h[:-1]])
        colors = np.where(h >= 0, np.where(h >= prev, MACD_COLORS["up_rising"], MACD_COLORS["up_falling"]),
                          np.where(h <= prev, MACD_COLORS["down_falling"], MACD_COLORS["down_rising"]))
        spec["panes"]["macd"] = {
            "hist": [{"time": int(a), "value": round(float(v), 4), "color": c}
                     for a, v, c in zip(t, h, colors) if pd.notna(v)],
            "macd": _series(t, w["macd"]), "signal": _series(t, w["macd_signal"]),
        }
    return spec


_TEMPLATE = """<!doctype html><html><head><meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; background: #ffffff; font-family: -apple-system, system-ui, sans-serif; }
  #chart { position: relative; width: 100%; height: __HEIGHT__px; }
  #legend { position: absolute; left: 8px; top: 6px; z-index: 5; font-size: 12px; color: #131722;
            pointer-events: none; line-height: 1.5; background: rgba(255,255,255,0.75); padding: 0 4px; }
  #legend b { font-weight: 600; }
  #help { font-size: 11px; color: #787b86; padding: 2px 8px; }
</style></head><body>
<div id="chart"><div id="legend"></div></div>
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
  const el = document.getElementById('chart');
  const chart = LW.createChart(el, {
    autoSize: true,
    layout: { background: { color: '#ffffff' }, textColor: '#131722', fontSize: 11,
              panes: { separatorColor: '#e0e3eb', enableResize: true } },
    grid: { vertLines: { color: '#f0f3fa' }, horzLines: { color: '#f0f3fa' } },
    crosshair: { mode: LW.CrosshairMode.Normal },
    rightPriceScale: { borderColor: '#d1d4dc' },
    timeScale: { borderColor: '#d1d4dc', timeVisible: true, secondsVisible: false, rightOffset: 5 },
    handleScale: { axisPressedMouseMove: { time: true, price: true }, mouseWheel: true, pinch: true,
                   axisDoubleClickReset: { time: true, price: true } },
    handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
  });
  const candles = chart.addSeries(LW.CandlestickSeries, {
    upColor: '#26a69a', downColor: '#ef5350', borderVisible: false,
    wickUpColor: '#26a69a', wickDownColor: '#ef5350' });
  candles.setData(SPEC.candles);
  const quiet = { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
  for (const o of SPEC.overlays) {
    const s = chart.addSeries(LW.LineSeries, { ...quiet, color: o.color, lineWidth: 1, lineStyle: o.style || 0,
                                                 title: '' });
    s.setData(o.data);
  }
  for (const g of SPEC.segments) {
    const s = chart.addSeries(LW.LineSeries, { ...quiet, color: g.color, lineWidth: g.width, lineStyle: g.style,
                                                 autoscaleInfoProvider: () => null });
    s.setData(g.data);
  }
  if (SPEC.markers.length) LW.createSeriesMarkers(candles, SPEC.markers);
  for (const p of SPEC.priceLines) {
    candles.createPriceLine({ price: p.price, color: p.color, lineWidth: 1, lineStyle: 2,
                              axisLabelVisible: true, title: p.title });
  }
  if (SPEC.volume) {
    const v = chart.addSeries(LW.HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol',
                                                     priceLineVisible: false, lastValueVisible: false });
    v.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    v.setData(SPEC.volume);
  }
  let pane = 1, rsiSeries = null;
  if (SPEC.panes.rsi) {
    rsiSeries = chart.addSeries(LW.LineSeries, { color: '#7e57c2', lineWidth: 1, priceLineVisible: false }, pane);
    rsiSeries.setData(SPEC.panes.rsi.data);
    for (const lvl of SPEC.panes.rsi.levels) {
      rsiSeries.createPriceLine({ price: lvl, color: '#9598a1', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' });
    }
    pane++;
  }
  if (SPEC.panes.macd) {
    const h = chart.addSeries(LW.HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pane);
    h.setData(SPEC.panes.macd.hist);
    const m = chart.addSeries(LW.LineSeries, { color: '#2962ff', lineWidth: 1, priceLineVisible: false,
                                               lastValueVisible: false }, pane);
    m.setData(SPEC.panes.macd.macd);
    const s = chart.addSeries(LW.LineSeries, { color: '#ff6d00', lineWidth: 1, priceLineVisible: false,
                                               lastValueVisible: false }, pane);
    s.setData(SPEC.panes.macd.signal);
  }
  const panes = chart.panes();
  if (panes.length > 1) {
    panes[0].setStretchFactor(3);
    for (let i = 1; i < panes.length; i++) panes[i].setStretchFactor(1);
  }

  // OHLC legend like on TradingView
  const legend = document.getElementById('legend');
  const fmt = x => (x === undefined ? '–' : x.toFixed(2));
  const esc = x => String(x).replace(/[&<>]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'}[c]));
  const show = d => {
    if (!d) { legend.innerHTML = ''; return; }
    const col = d.close >= d.open ? '#26a69a' : '#ef5350';
    const notes = (SPEC.notes || {})[String(d.time)] || [];
    legend.innerHTML = `O <b style="color:${col}">${fmt(d.open)}</b> H <b style="color:${col}">${fmt(d.high)}</b> ` +
                       `L <b style="color:${col}">${fmt(d.low)}</b> C <b style="color:${col}">${fmt(d.close)}</b>` +
                       notes.map(x => `<br>${esc(x)}`).join('');
  };
  show(SPEC.candles[SPEC.candles.length - 1]);
  chart.subscribeCrosshairMove(p => {
    const d = p && p.seriesData ? p.seriesData.get(candles) : null;
    show(d || SPEC.candles[SPEC.candles.length - 1]);
  });

  // Keep zoom/scroll across Streamlit reruns (e.g. while editing SL/TP).
  const ts = chart.timeScale();
  let restored = false;
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORE_KEY) || 'null');
    if (saved && saved.to - saved.from > 5) { ts.setVisibleLogicalRange(saved); restored = true; }
  } catch (e) {}
  if (!restored) ts.fitContent();
  ts.subscribeVisibleLogicalRangeChange(r => {
    if (!r || el.clientWidth === 0) return;   // never remember the range of a hidden chart
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(r)); } catch (e) {}
  });
}
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

    html = (_TEMPLATE.replace("__HEIGHT__", str(height))
            .replace("__LIB_LOCAL__", LIB_LOCAL).replace("__LIB_CDN__", LIB_CDN)
            .replace("__KEY__", "".join(ch for ch in key if ch.isalnum() or ch in "-_"))
            .replace("__SPEC__", json.dumps(spec, separators=(",", ":")).replace("</", "<\\/")))
    components.html(html, height=height + 24)
