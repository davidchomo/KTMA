// Nexus chart: minimal full-screen chart. Toolbar (symbol, chart type, timeframe, drawings, indicators,
// trading idea, settings, panel position, fullscreen), live Binance data, and a floating "trading idea"
// window for labelling the scanner's alerts (entry / SL / TP, long / short) for model training.

(() => {
  const { $, $$, esc, LS, openMenu, closeMenu, openDialog, closeDialog, cancelDialog, dialogOpen, colorPopover, closePop, swatch, opts, toast, rgba } = UI;
  const LW = LightweightCharts;
  const SECONDS = { '1s': 1, '5s': 5, '15s': 15, '30s': 30 };
  const TF_SEC = { ...SECONDS, '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '2h': 7200, '4h': 14400, '6h': 21600,
                   '8h': 28800, '12h': 43200, '1d': 86400, '3d': 259200, '1w': 604800, '1M': 2592000 };
  const TF_GROUPS = [['Sekundy', ['1s', '5s', '15s', '30s']], ['Minúty', ['1m', '3m', '5m', '15m', '30m']], ['Hodiny', ['1h', '2h', '4h', '6h', '8h', '12h']],
                     ['Dni a viac', ['1d', '3d', '1w', '1M']]];
  const TYPES = [['candles', 'Sviečky', '🕯'], ['hollow', 'Duté sviečky', '▯'], ['ha', 'Heikin Ashi', '🕯'], ['bars', 'OHLC bary', '┤'],
                 ['hlc', 'HLC bary', '╡'], ['cbar_hlc', 'Farebné HLC bary', '╡'], ['cbar_ohlc', 'Farebné OHLC bary', '┤'], ['line', 'Čiara', '╱'],
                 ['linedot', 'Čiara s bodmi', '⋰'], ['step', 'Schodová čiara', '⌐'], ['dot', 'Bodový graf', '⋯'], ['area', 'Plocha', '◭'],
                 ['baseline', 'Základná línia', '⫠'], ['forest', 'Bar Forest (stĺpce)', '▮'], ['renko', 'Renko', '▦']];
  const ZONES = ['UTC', 'Europe/Bratislava', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'Asia/Tokyo', 'Asia/Hong_Kong',
                 'Asia/Singapore', 'Asia/Dubai', 'Australia/Sydney'];

  // ---- state (this browser; also synced to the server under your name) ---------------------------
  const DEF = {
    symbol: 'XAUUSD', tf: '5m', type: 'candles', toolbar: 'top', tz: 'Europe/Bratislava', hours: true, bars: 1000,
    look: { up: '#089981', down: '#f23645', borderUp: '#089981', borderDown: '#f23645', wickUp: '#089981', wickDown: '#f23645',
            body: true, borders: true, wicks: true, line: '#2962ff', lineWidth: 2, bg: '#161a25', text: '#d1d4dc', grid: true, gridColor: '#1f2433',
            scale: 0, invert: false, lastLine: true, rightOffset: 8 },
    crosshair: { mode: 0, color: '#9598a1', opacity: 100, width: 1, style: 2, labels: true, labelBg: '#363c4e' },
    renko: { method: 'atr', atr: 14, box: 1, pct: 0.1, wicks: true },
    studies: null, templates: {}, favorites: ['ema', 'sma', 'vwap', 'bb', 'rsi', 'macd', 'volume'],
    magnet: 'off', drawings: {}, toolDefaults: {}, legendOpen: true, labeler: '',
    idea: { open: false, x: null, y: null, tab: 'alerts', blind: false, tfs: ['1m', '5m', '15m'], notified: true, unlabeled: true, order: 'new' },
    savedAt: 0,
  };
  const merge = (a, b) => { const o = { ...a }; for (const k in b || {}) o[k] = a && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) && b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) ? merge(a[k], b[k]) : b[k]; return o; };
  let S = merge(DEF, LS.get('nx2', {}));
  if (!Array.isArray(S.studies)) S.studies = [{ type: 'volume' }];
  let studies = S.studies.map(KS.normalize).filter(Boolean);
  let syncT = null;
  function save() {
    S.studies = studies.filter(s => !s.temp).map(({ temp, ...s }) => s);
    S.savedAt = Date.now();
    LS.set('nx2', S);
    if (S.labeler) { clearTimeout(syncT); syncT = setTimeout(() => fetch(`api/prefs/${encodeURIComponent(S.labeler)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(S) }).catch(() => {}), 1500); }
  }
  async function pullPrefs(name) {
    try {
      const r = await (await fetch(`api/prefs/${encodeURIComponent(name)}`)).json();
      if (r && r.savedAt && r.savedAt > S.savedAt) { S = merge(DEF, { ...r, labeler: name }); studies = S.studies.map(KS.normalize).filter(Boolean); LS.set('nx2', S); return true; }
    } catch (e) {}
    return false;
  }

  // ---- data ------------------------------------------------------------------------------------
  let META = { symbols: [] }, SYM = {};
  let raw = [], disp = [], D = null, view = { mode: 'live' }, olderDone = false, loadingOlder = false;
  const sym = () => SYM[S.symbol] || { digits: 2, hours: null, market: 'futures', ticker: 'XAUUSDT', name: S.symbol };
  const fmt = p => (p === undefined || p === null || Number.isNaN(p) ? '–' : (+p).toFixed(sym().digits ?? 2));
  async function fetchBars(symbol, tf, end, limit) {
    const q = new URLSearchParams({ symbol, tf, limit: String(limit || S.bars), hours: String(!!S.hours) });
    if (end) q.set('end', String(end));
    const r = await fetch(`api/candles?${q}`);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.status);
    return (await r.json()).bars.map(b => ({ time: b[0], open: b[1], high: b[2], low: b[3], close: b[4], volume: b[5] }));
  }
  // Gold/silver trade Sun 18:00 – Fri 17:00 New York, with a 17:00–18:00 daily break (like the scanner).
  const nyFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', hourCycle: 'h23' });
  function goldOpen(t) {
    const parts = Object.fromEntries(nyFmt.formatToParts(new Date(t * 1000)).map(p => [p.type, p.value]));
    const wd = parts.weekday, h = +parts.hour;
    return !(wd === 'Sat' || (wd === 'Sun' && h < 18) || (wd === 'Fri' && h >= 17) || (['Mon', 'Tue', 'Wed', 'Thu'].includes(wd) && h === 17));
  }
  // VWAP sessions: CME day (17:00 Chicago) for metals, the UTC day for the rest.
  const chiFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' });
  const sessCache = new Map();
  function sessionId(t) {
    if (sym().hours !== 'gold') return Math.floor(t / 86400);
    const hb = Math.floor(t / 3600);
    if (!sessCache.has(hb)) sessCache.set(hb, +chiFmt.format(new Date((hb * 3600 + 7 * 3600) * 1000)).replace(/-/g, ''));
    return sessCache.get(hb);
  }

  // ---- chart types (Heikin Ashi and Renko change the bars themselves) -----------------------------
  function transform(bars) {
    if (S.type === 'ha') {
      const out = []; let po, pc;
      for (const b of bars) {
        const c = (b.open + b.high + b.low + b.close) / 4, o = po === undefined ? (b.open + b.close) / 2 : (po + pc) / 2;
        out.push({ time: b.time, open: o, high: Math.max(b.high, o, c), low: Math.min(b.low, o, c), close: c, volume: b.volume });
        po = o; pc = c;
      }
      return out;
    }
    if (S.type === 'renko') return renko(bars);
    return bars;
  }
  function renko(bars) {
    if (bars.length < 2) return bars;
    const R = S.renko;
    let box = R.box;
    if (R.method === 'atr') {
      const a = KS.atr({ h: bars.map(b => b.high), l: bars.map(b => b.low), c: bars.map(b => b.close) }, R.atr);
      box = a[a.length - 1] || bars[bars.length - 1].close * 0.001;
    } else if (R.method === 'pct') box = bars[bars.length - 1].close * R.pct / 100;
    if (!(box > 0)) return bars;
    const out = [];
    let top = Math.floor(bars[0].close / box) * box + box, bot = top - box, lastT = -Infinity, hi = -Infinity, lo = Infinity, vol = 0;
    const push = (o, c, t) => {
      const time = Math.max(t, lastT + 1); lastT = time;
      out.push({ time, open: o, close: c, high: R.wicks ? Math.max(hi, o, c) : Math.max(o, c), low: R.wicks ? Math.min(lo, o, c) : Math.min(o, c), volume: vol });
      hi = -Infinity; lo = Infinity; vol = 0;
    };
    for (const b of bars) {
      hi = Math.max(hi, b.high); lo = Math.min(lo, b.low); vol += b.volume || 0;
      while (b.close >= top + box) { push(top, top + box, b.time); bot = top; top += box; }
      while (b.close <= bot - box) { push(bot, bot - box, b.time); top = bot; bot -= box; }
    }
    return out.length ? out : bars;
  }
  function toD(bars) {
    return { t: bars.map(b => b.time), o: bars.map(b => b.open), h: bars.map(b => b.high), l: bars.map(b => b.low), c: bars.map(b => b.close),
             v: bars.map(b => b.volume || 0), s: bars.map(b => sessionId(b.time)) };
  }
  function mainSeries(chart) {
    const L = S.look, t = S.type;
    const fmtP = { priceFormat: { type: 'price', precision: sym().digits ?? 2, minMove: 1 / 10 ** (sym().digits ?? 2) }, priceLineVisible: L.lastLine };
    if (['candles', 'ha', 'renko', 'hollow'].includes(t)) {
      return chart.addSeries(LW.CandlestickSeries, { ...fmtP, upColor: L.body ? L.up : 'rgba(0,0,0,0)', downColor: L.body ? L.down : 'rgba(0,0,0,0)',
        borderVisible: L.borders, borderUpColor: L.borderUp, borderDownColor: L.borderDown, wickVisible: L.wicks, wickUpColor: L.wickUp, wickDownColor: L.wickDown });
    }
    if (['bars', 'hlc', 'cbar_hlc', 'cbar_ohlc'].includes(t)) return chart.addSeries(LW.BarSeries, { ...fmtP, upColor: L.up, downColor: L.down, openVisible: !t.includes('hlc'), thinBars: false });
    if (t === 'area') return chart.addSeries(LW.AreaSeries, { ...fmtP, lineColor: L.line, lineWidth: L.lineWidth, topColor: rgba(L.line, 35), bottomColor: rgba(L.line, 0) });
    if (t === 'baseline') return chart.addSeries(LW.BaselineSeries, { ...fmtP, baseValue: { type: 'price', price: disp.length ? disp[0].close : 0 }, lineWidth: L.lineWidth,
      topLineColor: L.up, topFillColor1: rgba(L.up, 28), topFillColor2: rgba(L.up, 5), bottomLineColor: L.down, bottomFillColor1: rgba(L.down, 5), bottomFillColor2: rgba(L.down, 28) });
    if (t === 'forest') return chart.addSeries(LW.HistogramSeries, { ...fmtP, base: Math.min(...disp.map(b => b.low)) });
    return chart.addSeries(LW.LineSeries, { ...fmtP, color: L.line, lineWidth: L.lineWidth, lineType: t === 'step' ? 1 : 0, lineVisible: t !== 'dot',
      pointMarkersVisible: t === 'linedot' || t === 'dot', pointMarkersRadius: t === 'dot' ? 2.5 : 2 });
  }
  function mainData() {
    const L = S.look, t = S.type;
    if (['candles', 'ha', 'renko'].includes(t)) return disp.map(b => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close }));
    if (t === 'hollow') return disp.map((b, i) => {   // hollow = rising candle, colour = close vs previous close
      const c = i && b.close < disp[i - 1].close ? L.down : L.up;
      return { time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, color: b.close >= b.open ? 'rgba(0,0,0,0)' : c, borderColor: c, wickColor: c };
    });
    if (t === 'bars' || t === 'hlc') return disp.map(b => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close }));
    if (t.startsWith('cbar')) return disp.map((b, i) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, color: i && b.close < disp[i - 1].close ? L.down : L.up }));
    if (t === 'forest') return disp.map((b, i) => ({ time: b.time, value: b.close, color: rgba(i && b.close < disp[i - 1].close ? L.down : L.up, 80) }));
    return disp.map(b => ({ time: b.time, value: b.close }));
  }

  // ---- filled areas between two lines (no band fill in Lightweight Charts) -------------------------
  class BandFill {
    constructor() { this.bands = []; this.p = null; }
    attached(p) { this.p = p; } detached() { this.p = null; }
    update() { if (this.p) this.p.requestUpdate(); }
    updateAllViews() {}
    paneViews() { return [{ zOrder: () => 'bottom', renderer: () => ({ draw: target => this.draw(target) }) }]; }
    draw(target) {
      if (!this.p) return;
      const ts = this.p.chart.timeScale(), series = this.p.series, T = D.t, S2 = D.s;
      target.useMediaCoordinateSpace(({ context: ctx }) => {
        for (const b of this.bands) {
          let seg = [], sign = 0;
          const flush = () => {
            if (seg.length > 1) {
              ctx.fillStyle = sign >= 0 || !b.color2 ? b.color : b.color2;
              ctx.beginPath(); seg.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
              for (let i = seg.length - 1; i >= 0; i--) ctx.lineTo(seg[i][0], seg[i][2]);
              ctx.closePath(); ctx.fill();
            }
            seg = [];
          };
          for (let i = 0; i < T.length; i++) {
            if (b.breaks && i && (b.breaks === 'day' ? Math.floor(T[i] / 86400) !== Math.floor(T[i - 1] / 86400) : S2[i] !== S2[i - 1])) flush();
            const top = b.top[i], bot = b.bot[i];
            if (!Number.isFinite(top) || !Number.isFinite(bot)) { flush(); continue; }
            const sg = top >= bot ? 1 : -1;
            if (b.color2 && seg.length && sg !== sign) { const last = seg[seg.length - 1]; flush(); seg.push(last); }
            sign = sg;
            const x = ts.timeToCoordinate(T[i]), y1 = series.priceToCoordinate(top), y2 = series.priceToCoordinate(bot);
            if (x === null || y1 === null || y2 === null) { flush(); continue; }
            seg.push([x, y1, y2]);
          }
          flush();
        }
      });
    }
  }

  // ---- chart --------------------------------------------------------------------------------------
  let chart = null, main = null, units = [], markersApi = null, alertMark = null;
  const el = $('#chart');
  const tzFmt = {};
  const tzf = (o) => { const k = S.tz + JSON.stringify(o); return tzFmt[k] || (tzFmt[k] = new Intl.DateTimeFormat('sk-SK', { timeZone: S.tz, ...o })); };
  const fmtTime = t => tzf({ day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', ...(TF_SEC[S.tf] < 60 ? { second: '2-digit' } : {}) }).format(new Date(t * 1000));
  function chartOptions() {
    const L = S.look, C = S.crosshair, ch = { color: rgba(C.color, C.opacity), width: C.width, style: C.style, labelVisible: C.labels, labelBackgroundColor: C.labelBg };
    return {
      autoSize: true,
      layout: { background: { color: L.bg }, textColor: L.text, fontSize: 11, attributionLogo: false, panes: { separatorColor: '#2a2e39', enableResize: true } },
      grid: { vertLines: { color: L.gridColor, visible: L.grid }, horzLines: { color: L.gridColor, visible: L.grid } },
      crosshair: { mode: C.mode === 2 ? LW.CrosshairMode.Hidden : C.mode === 1 ? LW.CrosshairMode.Magnet : C.mode === 3 ? (LW.CrosshairMode.MagnetOHLC ?? 1) : LW.CrosshairMode.Normal, vertLine: ch, horzLine: ch },
      rightPriceScale: { borderColor: '#2a2e39', mode: L.scale, invertScale: L.invert, scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { borderColor: '#2a2e39', timeVisible: true, secondsVisible: TF_SEC[S.tf] < 60, rightOffset: L.rightOffset,
                   tickMarkFormatter: (t, type) => tzf([{ year: 'numeric' }, { month: 'short' }, { day: 'numeric', month: 'short' }, { hour: '2-digit', minute: '2-digit' },
                                                       { hour: '2-digit', minute: '2-digit', second: '2-digit' }][type] || { hour: '2-digit', minute: '2-digit' }).format(new Date(t * 1000)) },
      localization: { timeFormatter: fmtTime, locale: 'sk-SK' },
      handleScale: { axisPressedMouseMove: { time: true, price: true }, mouseWheel: true, pinch: true, axisDoubleClickReset: { time: true, price: true } },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    };
  }
  const shown = s => s.visible && s.tfs[S.tf] !== false;

  function buildChart(keepRange) {
    // undefined = keep the current zoom; null = new data, start fresh (alert focus or the newest bars)
    const range = keepRange === undefined ? (chart ? chart.timeScale().getVisibleLogicalRange() : null) : keepRange;
    if (chart) { chart.remove(); chart = null; }
    document.body.style.setProperty('--bg', S.look.bg);
    disp = transform(raw); D = toD(disp);
    chart = LW.createChart(el, chartOptions());
    main = mainSeries(chart);
    main.setData(mainData());
    markersApi = LW.createSeriesMarkers(main, []);
    units = [];
    let pane = 1;
    for (const s of studies) {
      if (!shown(s)) continue;
      const def = KS.STUDIES[s.type];
      const u = { s, def, pane: def.pane === true ? pane++ : 0, lines: {}, hists: {}, values: {}, fill: null, levels: false, host: null, marks: [] };
      units.push(u);
      refreshUnit(u);
    }
    const panes = chart.panes();
    if (panes.length > 1) { panes[0].setStretchFactor(Math.max(2, 6 - panes.length)); for (let i = 1; i < panes.length; i++) panes[i].setStretchFactor(1); }
    updateMarkers();
    draw.attach(main);
    draw.setList(currentDrawings());
    if (view.position) draw.add(view.position);
    legendRows();
    showOHLC();
    chart.subscribeCrosshairMove(p => showOHLC(p && p.time !== undefined ? p.time : null));
    const ts = chart.timeScale();
    if (range) ts.setVisibleLogicalRange(range);
    else if (view.focus !== undefined) focusOn(view.focus);
    else ts.setVisibleLogicalRange({ from: disp.length - 150, to: disp.length + 5 });
    ts.subscribeVisibleLogicalRangeChange(r => { if (r && r.from < 30) loadOlder(); });
  }
  function focusOn(time) {
    const i = disp.findIndex(b => b.time >= time);
    if (i < 0) return;
    chart.timeScale().setVisibleLogicalRange({ from: i - 90, to: i + 50 });
  }
  // Re-run the indicators and push new data into the existing series (live ticks, older history).
  function refreshAll() {
    if (!chart) return;
    disp = transform(raw); D = toD(disp);
    main.setData(mainData());
    units.forEach(refreshUnit);
    updateMarkers();
    draw.redraw();
    showOHLC();
  }
  function lineOptions(u, st) {
    const prec = u.s.out.precision === 'auto' ? null : +u.s.out.precision;
    return { priceLineVisible: false, crosshairMarkerVisible: false, lastValueVisible: u.s.out.priceLabels,
      color: rgba(st.color, st.opacity), lineWidth: st.width, lineStyle: st.style, visible: st.visible,
      lineType: st.type === 3 ? 0 : st.type, lineVisible: st.type !== 3, pointMarkersVisible: st.type === 3,
      ...(st.type === 3 ? { pointMarkersRadius: st.width + 1 } : {}),
      ...(prec === null ? {} : { priceFormat: { type: 'price', precision: prec, minMove: 1 / 10 ** prec } }),
      ...(u.pane === 0 && u.s.type !== 'volume' ? { autoscaleInfoProvider: () => null } : {}) };
  }
  function refreshUnit(u) {
    const { s, def } = u, n = D.t.length;
    if (def.pattern) { u.marks = KS.patternMarks(D, s); return; }
    const r = def.calc(D, s);
    const ser = (key, type, o) => (u.hists[key] = u.hists[key] || chart.addSeries(type, o, u.pane));
    if (s.type === 'volume') {
      const v = ser('vol', LW.HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', priceLineVisible: false, lastValueVisible: s.out.priceLabels });
      v.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      const up = rgba(s.plots.up.color, s.plots.up.opacity), dn = rgba(s.plots.down.color, s.plots.down.opacity);
      v.setData(D.t.map((t, i) => ({ time: t, value: D.v[i], color: D.c[i] >= D.o[i] ? up : dn })));
      u.values.vol = D.v;
    }
    if (def.histogram4) {                     // MACD: 4 colours (growing / falling above and below zero)
      const h = r[def.histogram4], c = ['h1', 'h2', 'h3', 'h4'].map(k => rgba(s.plots[k].color, s.plots[k].opacity));
      ser('h4', LW.HistogramSeries, { priceLineVisible: false, lastValueVisible: s.out.priceLabels })
        .setData(D.t.map((t, i) => [t, h[i], h[i - 1]]).filter(([, v]) => Number.isFinite(v))
          .map(([time, v, p]) => ({ time, value: v, color: v >= 0 ? (Number.isFinite(p) && v < p ? c[1] : c[0]) : (Number.isFinite(p) && v > p ? c[3] : c[2]) })));
      u.values.hist = h;
    }
    for (const p of def.plots) {
      const st = s.plots[p.k];
      if (p.kind === 'hist' && r[p.k]) {
        const h = r[p.k], c1 = rgba(st.color, st.opacity), c2 = rgba(st.color2 || st.color, st.opacity);
        const hs = ser(p.k, LW.HistogramSeries, { priceLineVisible: false, lastValueVisible: s.out.priceLabels, visible: st.visible });
        hs.setData(D.t.map((t, i) => ({ time: t, value: h[i], color: h[i] >= 0 ? c1 : c2 })).filter(x => Number.isFinite(x.value)));
        u.values[p.k] = h; u.host = u.host || hs;
      }
      if (p.kind !== 'line' || !r[p.k]) continue;
      const vals = r[p.k];
      u.values[p.k] = vals;
      const dual = def.plots.find(x => x.kind === 'dual' && x.of === p.k), dir = dual && s.plots[dual.k].visible ? { ...s.plots[dual.k], trend: dual.trend } : null;
      const point = j => {
        const v = vals[j];
        if (!dir) return { time: D.t[j], value: v };
        const down = dir.trend ? r[dir.trend][j] < 0 : Number.isFinite(vals[j - 1]) && v < vals[j - 1];
        return { time: D.t[j], value: v, color: rgba(down ? dir.color2 : dir.color, dir.opacity) };
      };
      // VWAP / pivots restart every session: one series per session, so there is a gap instead of a jump.
      const groups = [];
      if (def.sessionBreaks) {
        const key = j => (def.sessionBreaks === 'day' ? Math.floor(D.t[j] / 86400) : D.s[j]);
        let cur = null;
        for (let j = 0; j < n; j++) { if (!Number.isFinite(vals[j])) continue; if (!cur || key(j) !== cur.k) groups.push(cur = { k: key(j), d: [] }); cur.d.push(point(j)); }
      } else {
        const d = []; for (let j = 0; j < n; j++) if (Number.isFinite(vals[j])) d.push(point(j));
        groups.push({ d });
      }
      const list = u.lines[p.k] = u.lines[p.k] || [];
      while (list.length > groups.length) chart.removeSeries(list.pop());
      groups.forEach((g, gi) => {
        if (!list[gi]) list[gi] = chart.addSeries(LW.LineSeries, { ...lineOptions(u, st), lastValueVisible: s.out.priceLabels && gi === groups.length - 1 }, u.pane);
        list[gi].setData(g.d);
      });
      u.host = u.host || list[0];
    }
    if (!u.host && u.hists.h4) u.host = u.hists.h4;
    if (!u.levels && u.host && s.plots.levels && s.plots.levels.visible) {
      const lv = s.plots.levels;
      for (const k of ['upper', 'lower', 'level']) if (k in s.inputs) u.host.createPriceLine({ price: s.inputs[k], color: rgba(lv.color, lv.opacity), lineWidth: lv.width, lineStyle: lv.style, axisLabelVisible: true, title: '' });
      u.levels = true;
    }
    const fills = def.plots.filter(p => p.kind === 'fill' && s.plots[p.k].visible && s.plots[p.k].opacity > 0);
    if (fills.length) {
      const target = u.pane === 0 ? main : u.host;
      if (target && !u.fill) { u.fill = new BandFill(); target.attachPrimitive(u.fill); }
      if (u.fill) {
        const val = name => (name[0] === '=' ? D.t.map(() => s.inputs[name.slice(1)]) : (r[name] || []));
        u.fill.bands = fills.map(p => ({ top: val(p.between[0]), bot: val(p.between[1]), color: rgba(s.plots[p.k].color, s.plots[p.k].opacity),
                                        color2: p.color2 ? rgba(s.plots[p.k].color2, s.plots[p.k].opacity) : null, breaks: def.sessionBreaks }));
        u.fill.update();
      }
    }
  }
  function updateMarkers() {
    const m = [];
    for (const u of units) {
      if (!u.def.pattern) continue;
      const c = rgba(u.s.plots.mark.color, u.s.plots.mark.opacity);
      for (const k of u.marks) m.push({ time: D.t[k.i], position: k.dir < 0 ? 'aboveBar' : 'belowBar', color: c, shape: k.dir > 0 ? 'arrowUp' : k.dir < 0 ? 'arrowDown' : 'circle', text: k.text, size: 0.8 });
    }
    if (alertMark) {
      const i = disp.findIndex(b => b.time >= alertMark.time);
      if (i >= 0) m.push({ time: disp[i].time, position: alertMark.bull ? 'belowBar' : 'aboveBar', color: alertMark.bull ? S.look.up : S.look.down, shape: alertMark.bull ? 'arrowUp' : 'arrowDown', text: alertMark.text, size: 2 });
    }
    m.sort((a, b) => a.time - b.time);
    markersApi && markersApi.setMarkers(m);
  }

  // ---- legend ------------------------------------------------------------------------------------
  function showOHLC(time) {
    if (!disp.length) return;
    const i = time === null || time === undefined ? disp.length - 1 : disp.findIndex(b => b.time === time);
    const b = disp[i < 0 ? disp.length - 1 : i], prev = disp[(i < 0 ? disp.length - 1 : i) - 1];
    const c = b.close >= b.open ? S.look.up : S.look.down, ch = prev ? b.close - prev.close : 0;
    $('#ohlc').innerHTML = `<span class="sym">${esc(sym().name)} · ${S.tf} · ${esc(TYPES.find(t => t[0] === S.type)[1])}</span>` +
      `O <b style="color:${c}">${fmt(b.open)}</b>H <b style="color:${c}">${fmt(b.high)}</b>L <b style="color:${c}">${fmt(b.low)}</b>C <b style="color:${c}">${fmt(b.close)}</b>` +
      `<b style="color:${ch >= 0 ? S.look.up : S.look.down}">${ch >= 0 ? '+' : ''}${fmt(ch)} (${prev ? (100 * ch / prev.close).toFixed(2) : '0.00'} %)</b>`;
    legendValues(i < 0 ? disp.length - 1 : i);
  }
  function legendRows() {
    const rows = units.filter(u => !u.s.temp || true);
    const toggle = rows.length ? `<div id="lgToggle">${S.legendOpen ? '⌃ skryť' : `⌄ indikátory (${rows.length})`}</div>` : '';
    $('#studies').innerHTML = (S.legendOpen ? rows.map((u, n) => `<div class="lg-row" data-n="${n}"><span class="lg-name">${esc(u.def.label(u.s))}</span><span class="vals"></span>` +
      `<button class="lg-btn" data-a="hide" title="Skryť">👁</button><button class="lg-btn" data-a="cfg" title="Nastavenia">⚙</button>` +
      `<button class="lg-btn" data-a="del" title="Odstrániť">✕</button></div>`).join('<br>') + '<br>' : '') + toggle;
    const t = $('#lgToggle'); if (t) t.onclick = () => { S.legendOpen = !S.legendOpen; save(); legendRows(); showOHLC(); };
    $$('#studies .lg-row').forEach(div => div.addEventListener('click', e => {
      const u = rows[+div.dataset.n], b = e.target.closest('button');
      if (!b) { if (e.detail === 2) studySettings(u.s); return; }
      if (b.dataset.a === 'hide') { u.s.visible = false; studiesChanged(); }
      else if (b.dataset.a === 'cfg') studySettings(u.s);
      else { studies = studies.filter(x => x !== u.s); studiesChanged(); }
    }));
  }
  function legendValues(i) {
    $$('#studies .lg-row').forEach(div => {
      const u = units[+div.dataset.n];
      if (!u || !u.s.out.legendValues || u.def.pattern) { if (u && div.querySelector('.vals')) div.querySelector('.vals').innerHTML = u && u.def.pattern ? `<span class="lg-val muted">${u.marks.length}×</span>` : ''; return; }
      const keys = u.def.legend || (u.s.type === 'volume' ? ['vol'] : Object.keys(u.values).filter(k => !u.s.plots[k] || u.s.plots[k].visible));
      div.querySelector('.vals').innerHTML = keys.filter(k => u.values[k]).slice(0, 7).map(k => {
        const st = u.s.plots[k] || u.s.plots.up || u.s.plots.h1 || {}, v = u.values[k][i];
        const txt = !Number.isFinite(v) ? '–' : u.s.type === 'volume' || k === 'obv' || k === 'ad' ? (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : v.toFixed(0))
          : u.s.out.precision !== 'auto' ? v.toFixed(+u.s.out.precision) : Math.abs(v) >= 1000 ? fmt(v) : v.toFixed(Math.abs(v) >= 1 ? 2 : 4);
        return `<span class="lg-val" style="color:${st.color || 'inherit'}">${txt}</span>`;
      }).join('');
    });
  }
  function studiesChanged() { save(); buildChart(); }

  // ---- drawings ----------------------------------------------------------------------------------
  const currentDrawings = () => S.drawings[S.symbol] || [];
  const draw = DR.create({
    el, chart: () => chart, series: () => main, bars: () => disp,
    timeToLogical: t => { const T = D ? D.t : []; const n = T.length; if (!n) return 0; const bs = TF_SEC[S.tf];
      if (t <= T[0]) return (t - T[0]) / bs; if (t >= T[n - 1]) return n - 1 + (t - T[n - 1]) / bs;
      let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; } return lo + (t - T[lo]) / (T[hi] - T[lo]); },
    logicalToTime: l => { const T = D ? D.t : []; const n = T.length, bs = TF_SEC[S.tf]; if (!n) return 0;
      if (l <= 0) return T[0] + l * bs; if (l >= n - 1) return T[n - 1] + (l - (n - 1)) * bs; const i = Math.floor(l); return T[i] + (l - i) * (T[i + 1] - T[i]); },
    fmt, fmtTime, bg: () => S.look.bg, magnet: () => S.magnet, barSeconds: () => TF_SEC[S.tf],
    priceSpan: () => { const r = chart && chart.timeScale().getVisibleLogicalRange(); const b = disp.slice(Math.max(0, Math.floor(r ? r.from : 0)), Math.ceil(r ? r.to : disp.length));
      return b.length ? Math.max(...b.map(x => x.high)) - Math.min(...b.map(x => x.low)) : 0; },
    onChange: list => { S.drawings[S.symbol] = list; save(); },
    toolDefaults: id => S.toolDefaults[id], saveToolDefaults: (id, st) => { S.toolDefaults[id] = st; save(); },
    hint: text => { const h = $('#hint'); h.textContent = text; h.style.display = text ? 'block' : 'none'; },
    onMode: id => { $('#bDraw').classList.toggle('on', !!id); },
    bar: $('#drawbar'),
  });

  // ---- loading and live data ---------------------------------------------------------------------
  let ws = null, wsTimer = null, refreshTimer = null;
  function setStatus(kind, text) { const s = $('#status'); s.className = 'status ' + kind; $('#statusText').textContent = text; }
  async function load() {
    closeLive();
    olderDone = false;
    setStatus('', 'načítavam…');
    try {
      if (view.mode === 'alert') {
        const bs = TF_SEC[S.tf], end = (view.blind ? view.time + bs - 1 : view.time + 80 * bs) * 1000;
        raw = await fetchBars(S.symbol, S.tf, Math.min(end, Date.now()), 600);
        setStatus('hist', view.blind ? 'história · naslepo' : 'história');
      } else {
        raw = await fetchBars(S.symbol, S.tf, null, S.bars);
      }
    } catch (e) { setStatus('err', 'chyba dát'); toast(`Dáta sa nepodarilo načítať: ${e.message}`, 4000); raw = []; }
    buildChart(null);
    $('#histBar').classList.toggle('open', view.mode === 'alert');
    if (view.mode === 'alert') $('#histText').textContent = `Alert #${view.id} · ${fmtTime(view.time)}${view.blind ? ' · naslepo' : ''}`;
    else connectLive();
  }
  async function loadOlder() {
    if (loadingOlder || olderDone || !raw.length || view.mode !== 'live') return;
    loadingOlder = true;
    try {
      const older = await fetchBars(S.symbol, S.tf, raw[0].time * 1000 - 1, 1000);
      const fresh = older.filter(b => b.time < raw[0].time);
      if (!fresh.length) olderDone = true;
      else {
        const before = disp.length, r = chart.timeScale().getVisibleLogicalRange();
        raw = fresh.concat(raw);
        refreshAll();
        const added = disp.length - before;
        if (r) chart.timeScale().setVisibleLogicalRange({ from: r.from + added, to: r.to + added });
      }
    } catch (e) { olderDone = true; }
    loadingOlder = false;
  }
  function closeLive() { if (ws) { ws.onclose = null; ws.close(); ws = null; } clearTimeout(wsTimer); }
  function connectLive() {
    closeLive();
    const sy = sym(), tf = S.tf, sec = SECONDS[tf], t = sy.ticker.toLowerCase();
    const base = sy.market === 'spot' ? 'wss://stream.binance.com:9443/ws/' : 'wss://fstream.binance.com/ws/';
    ws = new WebSocket(base + (sec ? `${t}@aggTrade` : `${t}@kline_${tf}`));
    ws.onopen = () => setStatus('live', 'live');
    ws.onclose = () => { setStatus('err', 'odpojené · skúšam znova'); wsTimer = setTimeout(connectLive, 3000); };
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      let bar;
      if (m.e === 'kline') { const k = m.k; bar = { time: Math.floor(k.t / 1000), open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v, replace: true }; }
      else if (m.e === 'aggTrade') { const p = +m.p; bar = { time: Math.floor(m.T / 1000 / sec) * sec, open: p, high: p, low: p, close: p, volume: +m.q }; }
      else return;
      if (S.hours && sy.hours === 'gold' && TF_SEC[tf] < 86400 && !goldOpen(bar.time)) return;
      const last = raw[raw.length - 1];
      if (last && last.time === bar.time) {
        if (bar.replace) Object.assign(last, { open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume });
        else { last.high = Math.max(last.high, bar.high); last.low = Math.min(last.low, bar.low); last.close = bar.close; last.volume += bar.volume; }
      } else if (!last || bar.time > last.time) { delete bar.replace; raw.push(bar); }
      else return;
      if (!refreshTimer) refreshTimer = setTimeout(() => { refreshTimer = null; refreshAll(); }, 250);
    };
  }

  // ---- toolbar ------------------------------------------------------------------------------------
  const side = () => (S.toolbar === 'left' ? 'right' : S.toolbar === 'bottom' ? 'up' : undefined);
  function applyToolbar() {
    document.body.className = `tb-${S.toolbar}`;
    $('#symLabel').textContent = sym().name || S.symbol;
    const t = TYPES.find(x => x[0] === S.type) || TYPES[0];
    $('#typeLabel').textContent = t[1]; $('#typeIcon').textContent = t[2];
    $('#tfLabel').textContent = S.tf;
  }
  function setAndReload(changes) { Object.assign(S, changes); save(); applyToolbar(); view = { mode: 'live' }; alertMark = null; load(); }

  $('#bSymbol').onclick = e => openMenu(e.currentTarget, META.symbols.map(s => `<div class="it ${s.id === S.symbol ? 'on' : ''}" data-s="${s.id}"><span class="ic">◆</span><span class="grow">${esc(s.name)}<br><small>${esc(s.desc)}</small></span></div>`).join(''),
    m => $$('[data-s]', m).forEach(x => x.onclick = () => { closeMenu(); setAndReload({ symbol: x.dataset.s }); }), { side: side() });
  $('#bType').onclick = e => openMenu(e.currentTarget, TYPES.map(([k, n, ic]) => `<div class="it ${k === S.type ? 'on' : ''}" data-t="${k}"><span class="ic">${ic}</span><span class="grow">${n}</span>${k === 'renko' ? '<small>⚙ v Nastaveniach</small>' : ''}</div>`).join(''),
    m => $$('[data-t]', m).forEach(x => x.onclick = () => {   // Renko / HA change the number of bars: start from the newest again
      closeMenu(); const fresh = (x.dataset.t === 'renko') !== (S.type === 'renko'); S.type = x.dataset.t; save(); applyToolbar(); buildChart(fresh ? null : undefined); }), { side: side() });
  $('#bTf').onclick = e => openMenu(e.currentTarget, TF_GROUPS.map(([g, list]) => `<div class="sec">${g}</div><div class="tfgrid">${list.map(tf => `<div class="${tf === S.tf ? 'on' : ''}" data-tf="${tf}">${tf}</div>`).join('')}</div>`).join(''),
    m => $$('[data-tf]', m).forEach(x => x.onclick = () => { closeMenu(); setAndReload({ tf: x.dataset.tf }); }), { side: side(), cls: 'tfs' });
  $('#bDraw').onclick = e => {
    const magnets = [['off', 'Vyp'], ['weak', 'Slabý'], ['strong', 'OHLC'], ['close', 'Close'], ['hl', 'High/Low']];
    const html = `<div class="sec">Magnet (prichytenie k sviečke)</div><div class="row">${magnets.map(([k, n]) => `<button class="btn ${S.magnet === k ? 'pri' : ''}" data-mag="${k}">${n}</button>`).join('')}</div>
      <div class="row"><button class="btn ${draw.keep ? 'pri' : ''}" data-x="keep" title="Po nakreslení ostane nástroj zapnutý">🔁 Opakovane</button><button class="btn" data-x="hide">${draw.hidden ? '👁 Zobraziť' : '🙈 Skryť'} všetky</button></div>
      <div class="row"><button class="btn" data-x="lock">🔒 Zamknúť všetky</button><button class="btn" data-x="del">🗑 Zmazať všetky</button></div>
      ${DR.GROUPS.map(([g, name]) => `<div class="sec">${name}</div>${Object.values(DR.TOOLS).filter(t => t.group === g).map(t => `<div class="it ${draw.mode === t.id ? 'on' : ''}" data-tool="${t.id}"><span class="ic">${t.icon}</span><span class="grow">${esc(t.name)}</span>${t.key ? `<span class="key">${t.key}</span>` : ''}</div>`).join('')}`).join('')}`;
    openMenu(e.currentTarget, html, m => {
      $$('[data-tool]', m).forEach(x => x.onclick = () => { closeMenu(); draw.start(x.dataset.tool); });
      $$('[data-mag]', m).forEach(x => x.onclick = () => { S.magnet = x.dataset.mag; save(); closeMenu(); toast(`Magnet: ${x.textContent}`); });
      $$('[data-x]', m).forEach(x => x.onclick = () => {
        const a = x.dataset.x;
        if (a === 'keep') draw.keep = !draw.keep; else if (a === 'hide') draw.hidden = !draw.hidden; else if (a === 'lock') draw.lockAll(true);
        else if (a === 'del') { if (!x.dataset.sure) { x.dataset.sure = 1; x.textContent = 'Naozaj?'; return; } draw.removeAll(); }
        closeMenu();
      });
    }, { side: side(), cls: 'draw' });
  };
  $('#bPanel').onclick = e => openMenu(e.currentTarget, [['top', '⬆', 'Hore'], ['bottom', '⬇', 'Dole'], ['left', '⬅', 'Vľavo (zboku)'], ['hidden', '🙈', 'Skryť (☰ alebo Alt+P ho vráti)']]
    .map(([k, ic, n]) => `<div class="it ${S.toolbar === k ? 'on' : ''}" data-p="${k}"><span class="ic">${ic}</span><span class="grow">${n}</span></div>`).join(''),
    m => $$('[data-p]', m).forEach(x => x.onclick = () => { closeMenu(); if (x.dataset.p === 'hidden') S.lastToolbar = S.toolbar; S.toolbar = x.dataset.p; save(); applyToolbar(); }), { side: side() });
  $('#showToolbar').onclick = () => { S.toolbar = S.lastToolbar && S.lastToolbar !== 'hidden' ? S.lastToolbar : 'top'; save(); applyToolbar(); };
  $('#bFull').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}));
  document.addEventListener('fullscreenchange', () => { $('#fullIcon').textContent = document.fullscreenElement ? '🗗' : '⛶'; $('#fullLabel').textContent = document.fullscreenElement ? 'Ukončiť' : 'Celá obr.'; });
  $('#backLive').onclick = () => { view = { mode: 'live' }; alertMark = null; load(); };

  // ---- indicator menu (search, favourites, studies, patterns, templates, on chart) -------------------
  let indTab = 'all', indQuery = '';
  const CATS = [['ma', 'Kĺzavé priemery'], ['band', 'Pásma a kanály'], ['trend', 'Trend'], ['osc', 'Oscilátory'], ['vol', 'Objem']];
  function indMenu(anchor) {
    const m = openMenu(anchor, `<div class="ind-search"><input placeholder="Hľadať indikátor alebo vzor…" value="${esc(indQuery)}"></div>
      <div class="ind-tabs">${[['fav', '☆'], ['all', 'Indikátory'], ['pat', 'Vzory'], ['tpl', 'Šablóny'], ['on', `Na grafe (${studies.length})`]].map(([k, n]) => `<span data-tab="${k}" class="${indTab === k ? 'on' : ''}">${n}</span>`).join('')}</div>
      <div class="ind-list"></div>`, null, { side: side(), cls: 'ind' });
    if (!m) return;
    const list = $('.ind-list', m), input = $('input', m);
    const item = ([k, d]) => `<div class="it" data-add="${k}"><span class="star ${S.favorites.includes(k) ? 'on' : ''}" data-star="${k}">${S.favorites.includes(k) ? '★' : '☆'}</span>
      <span class="grow">${esc(d.name)} <small>${esc(d.title)}</small></span>${studies.some(s => s.type === k) ? '<span class="act">na grafe</span>' : ''}</div>`;
    const paint = () => {
      const q = indQuery.toLowerCase(), all = Object.entries(KS.STUDIES).filter(([k, d]) => !q || (d.name + ' ' + d.title + ' ' + k).toLowerCase().includes(q));
      if (indTab === 'on') {
        list.innerHTML = studies.length ? studies.map((s, n) => `<div class="it" data-n="${n}"><input type="checkbox" ${s.visible ? 'checked' : ''}><span class="grow">${esc(KS.STUDIES[s.type].label(s))}${s.tfs[S.tf] === false ? ` <small>(skryté na ${S.tf})</small>` : ''}</span>
          <button class="ib" data-act="up" title="Vyššie">↑</button><button class="ib" data-act="cfg" title="Nastavenia">⚙</button><button class="ib" data-act="del" title="Odstrániť">✕</button></div>`).join('')
          : '<div class="it muted">Na grafe nie sú žiadne indikátory.</div>';
        $$('[data-n]', list).forEach(div => {
          const s = studies[+div.dataset.n];
          $('input', div).onchange = e => { s.visible = e.target.checked; studiesChanged(); };
          $$('button', div).forEach(b => b.onclick = () => {
            const n = +div.dataset.n;
            if (b.dataset.act === 'cfg') { closeMenu(); studySettings(s); return; }
            if (b.dataset.act === 'del') studies.splice(n, 1);
            if (b.dataset.act === 'up' && n > 0) [studies[n - 1], studies[n]] = [studies[n], studies[n - 1]];
            studiesChanged(); paint();
          });
        });
        return;
      }
      if (indTab === 'tpl') {
        const names = Object.keys(S.templates);
        list.innerHTML = `<div class="it"><input class="idea-in" placeholder="Názov šablóny" id="tplName"><button class="btn sm" id="tplSave">Uložiť aktuálne</button></div>` +
          (names.length ? names.map(n => `<div class="it" data-tpl="${esc(n)}"><span class="grow">${esc(n)} <small>${S.templates[n].length} indikátorov</small></span><button class="ib" data-del="${esc(n)}">✕</button></div>`).join('')
            : '<div class="it muted">Ulož si sadu indikátorov ako šablónu a neskôr ju načítaj jedným klikom.</div>');
        $('#tplSave', list).onclick = () => { const n = $('#tplName', list).value.trim(); if (!n) return; S.templates[n] = studies.filter(s => !s.temp).map(({ temp, uid, ...s }) => s); save(); paint(); };
        $$('[data-tpl]', list).forEach(x => x.onclick = e => { if (e.target.closest('[data-del]')) return; studies = S.templates[x.dataset.tpl].map(KS.normalize).filter(Boolean); studiesChanged(); closeMenu(); toast(`Šablóna „${x.dataset.tpl}“ načítaná`); });
        $$('[data-del]', list).forEach(x => x.onclick = () => { delete S.templates[x.dataset.del]; save(); paint(); });
        return;
      }
      let rows = all.filter(([, d]) => (indTab === 'pat' ? d.cat === 'pattern' : indTab === 'fav' ? true : d.cat !== 'pattern'));
      if (indTab === 'fav') rows = rows.filter(([k]) => S.favorites.includes(k));
      list.innerHTML = indTab === 'all' && !q ? CATS.map(([c, n]) => `<div class="cat">${n}</div>` + rows.filter(([, d]) => d.cat === c).map(item).join('')).join('')
        : rows.map(item).join('') || '<div class="it muted">Nič sa nenašlo.</div>';
      $$('[data-star]', list).forEach(x => x.onclick = e => {
        e.stopPropagation(); const k = x.dataset.star;
        S.favorites = S.favorites.includes(k) ? S.favorites.filter(y => y !== k) : [...S.favorites, k]; save(); paint();
      });
      $$('[data-add]', list).forEach(x => x.onclick = () => {
        const tpl = (S.toolDefaults['study:' + x.dataset.add]) || {};
        studies.push(KS.normalize({ ...tpl, type: x.dataset.add, uid: undefined, visible: true })); studiesChanged();
        toast(`Pridané: ${KS.STUDIES[x.dataset.add].name}`); paint();
      });
    };
    $$('[data-tab]', m).forEach(t => t.onclick = () => { indTab = t.dataset.tab; $$('[data-tab]', m).forEach(x => x.classList.toggle('on', x === t)); paint(); });
    input.oninput = () => { indQuery = input.value; if (indQuery && (indTab === 'tpl' || indTab === 'on')) { indTab = 'all'; $$('[data-tab]', m).forEach(x => x.classList.toggle('on', x.dataset.tab === 'all')); } paint(); };
    input.focus();
    paint();
  }
  $('#bInd').onclick = e => indMenu(e.currentTarget);

  // ---- indicator settings (Vstupy / Štýl / Viditeľnosť) --------------------------------------------
  const LINE_TYPES = [['∿ čiara', 0], ['⌐ schodová', 1], ['◠ krivka', 2], ['• body', 3]];
  const SOURCES = [['Close', 'close'], ['Open', 'open'], ['High', 'high'], ['Low', 'low'], ['(H+L)/2', 'hl2'], ['(H+L+C)/3', 'hlc3'], ['(O+H+L+C)/4', 'ohlc4']];
  function studySettings(s) {
    const def = KS.STUDIES[s.type], before = JSON.stringify({ inputs: s.inputs, plots: s.plots, tfs: s.tfs, out: s.out });
    let tab = def.inputs.length ? 'in' : 'st', t = null;
    const live = () => { save(); clearTimeout(t); t = setTimeout(() => buildChart(), 60); };
    const cb = (attrs, on) => `<input type="checkbox" ${attrs} ${on ? 'checked' : ''}>`;
    const row = p => {
      const st = s.plots[p.k];
      if (p.kind === 'color') return `<div class="fld sub"><span>${esc(p.label)}</span>${swatch(p.k, st.color, st.opacity)}</div>`;
      if (p.kind === 'dual' || p.kind === 'hist' || (p.kind === 'fill' && p.color2)) return `<div class="fld"><label class="ctl">${cb(`data-pl="${p.k}"`, st.visible)} ${esc(p.label)}</label>
        <span class="ctl">${swatch(p.k, st.color, st.opacity)}${swatch(p.k + ':2', st.color2, st.opacity)}</span></div>`;
      return `<div class="fld"><label class="ctl">${cb(`data-pl="${p.k}"`, st.visible)} ${esc(p.label)}</label><span class="ctl">${swatch(p.k, st.color, st.opacity)}
        ${p.kind === 'line' ? `<select class="sm" data-type="${p.k}">${opts(LINE_TYPES, st.type)}</select>` : ''}</span></div>`;
    };
    const body = () => {
      if (tab === 'in') return def.inputs.map(i => `<div class="fld"><span>${esc(i.label)}</span>${i.type === 'source' ? `<select data-in="${i.k}">${opts(SOURCES, s.inputs[i.k])}</select>`
        : `<input type="number" data-in="${i.k}" value="${s.inputs[i.k]}" min="${i.min}" max="${i.max}" step="${i.step || 1}">`}</div>`).join('') || '<div class="muted">Bez vstupov.</div>';
      if (tab === 'vis') return `<div class="muted" style="margin:6px 0">Na ktorých časových rámcoch sa ${esc(def.name)} zobrazí:</div><div class="tfgrid">` +
        KS.TIMEFRAMES.map(tf => `<label class="ctl">${cb(`data-tf="${tf}"`, s.tfs[tf])} ${tf}</label>`).join('') + '</div>';
      const lines = def.plots.filter(p => p.kind !== 'fill'), fills = def.plots.filter(p => p.kind === 'fill');
      return lines.map(row).join('') + (fills.length ? '<div class="sec2">Výplne</div>' + fills.map(row).join('') : '') +
        `<div class="sec2">Výstupné hodnoty</div><div class="fld"><span>Presnosť</span><select data-out="precision">${opts([['Predvolená', 'auto'], ['0', 0], ['1', 1], ['2', 2], ['3', 3], ['4', 4]], s.out.precision)}</select></div>
         <div class="fld"><label class="ctl">${cb('data-out="priceLabels"', s.out.priceLabels)} Hodnoty na cenovej osi</label></div>
         <div class="fld"><label class="ctl">${cb('data-out="legendValues"', s.out.legendValues)} Hodnoty v legende</label></div>`;
    };
    const cancel = () => { Object.assign(s, JSON.parse(before)); save(); buildChart(); closeDialog(); };
    const paint = () => {
      const d = openDialog(`<div class="dlg-h"><span>${esc(def.name)} <small class="muted" style="font-weight:400">${esc(def.title)}</small></span><button class="ib" data-cancel>✕</button></div>
        <div class="dlg-b"><div class="tabs">${def.inputs.length ? `<span class="tab ${tab === 'in' ? 'on' : ''}" data-tab="in">Vstupy</span>` : ''}<span class="tab ${tab === 'st' ? 'on' : ''}" data-tab="st">Štýl</span>
        <span class="tab ${tab === 'vis' ? 'on' : ''}" data-tab="vis">Viditeľnosť</span></div>${body()}</div>
        <div class="dlg-f"><button class="btn" data-defmenu>Predvolené ▾</button><span class="grow"></span><button class="btn" data-cancel>Zrušiť</button><button class="btn pri" data-ok>OK</button></div>`, cancel);
      $$('[data-tab]', d).forEach(x => x.onclick = () => { tab = x.dataset.tab; paint(); });
      $$('[data-in]', d).forEach(x => x.onchange = () => { const i = def.inputs.find(y => y.k === x.dataset.in);
        if (i.type === 'source') s.inputs[i.k] = x.value; else { const v = Math.min(i.max, Math.max(i.min, +x.value)); if (Number.isFinite(v)) s.inputs[i.k] = v; x.value = s.inputs[i.k]; } live(); });
      $$('[data-pl]', d).forEach(x => x.onchange = () => { s.plots[x.dataset.pl].visible = x.checked; live(); });
      $$('[data-type]', d).forEach(x => x.onchange = () => { s.plots[x.dataset.type].type = +x.value; live(); });
      $$('[data-tf]', d).forEach(x => x.onchange = () => { s.tfs[x.dataset.tf] = x.checked; live(); });
      $$('[data-out]', d).forEach(x => x.onchange = () => { s.out[x.dataset.out] = x.type === 'checkbox' ? x.checked : (x.value === 'auto' ? 'auto' : +x.value); live(); });
      $$('[data-sw]', d).forEach(b => b.onclick = () => { const [k, two] = b.dataset.sw.split(':'), p = def.plots.find(x => x.k === k);
        const lineish = p.kind === 'line' || p.kind === 'level'; colorPopover(b, s.plots[k], { width: lineish, style: lineish }, live, two ? { color: 'color2' } : null); });
      $('[data-defmenu]', d).onclick = e => {
        const f = e.currentTarget.parentElement;
        if ($('.menu', f)) { $('.menu', f).remove(); return; }
        f.insertAdjacentHTML('beforeend', `<div class="menu"><div data-m="reset">Obnoviť pôvodné nastavenia</div><div data-m="save">Uložiť ako predvolené pre nové ${esc(def.name)}</div></div>`);
        $('[data-m=reset]', f).onclick = () => { const n = KS.normalize({ type: s.type }); Object.assign(s, { inputs: n.inputs, plots: n.plots, tfs: n.tfs, out: n.out }); live(); paint(); };
        $('[data-m=save]', f).onclick = () => { S.toolDefaults['study:' + s.type] = { inputs: s.inputs, plots: s.plots, tfs: s.tfs, out: s.out }; save(); $('.menu', f).remove(); toast('Uložené ako predvolené'); };
      };
      $$('[data-cancel]', d).forEach(x => x.onclick = cancel);
      $('[data-ok]', d).onclick = closeDialog;
    };
    paint();
  }

  // ---- chart settings ---------------------------------------------------------------------------
  function settings() {
    let tab = 'bars';
    const L = S.look, C = S.crosshair, R = S.renko;
    const cb = (k, on, label) => `<label class="ctl"><input type="checkbox" data-k="${k}" ${on ? 'checked' : ''}> ${label}</label>`;
    const num = (k, v, min, max, step) => `<input type="number" data-k="${k}" value="${v}" min="${min}" max="${max}" step="${step || 1}">`;
    const body = () => ({
      bars: `<div class="fld">${cb('look.body', L.body, 'Telo sviečky')}<span class="ctl">${swatch('up', L.up)}${swatch('down', L.down)}</span></div>
        <div class="fld">${cb('look.borders', L.borders, 'Okraje')}<span class="ctl">${swatch('borderUp', L.borderUp)}${swatch('borderDown', L.borderDown)}</span></div>
        <div class="fld">${cb('look.wicks', L.wicks, 'Knôty')}<span class="ctl">${swatch('wickUp', L.wickUp)}${swatch('wickDown', L.wickDown)}</span></div>
        <div class="fld"><span>Čiara / plocha (čiarové typy)</span><span class="ctl">${swatch('line', L.line)}<select class="sm" data-k="look.lineWidth">${opts([1, 2, 3, 4].map(w => [w + ' px', w]), L.lineWidth)}</select></span></div>
        <div class="fld"><span>Rovnaké farby pre telo, okraj aj knôt</span><button class="btn sm" data-sync>Zjednotiť</button></div>`,
      scale: `<div class="fld"><span>Mierka</span><select data-k="look.scale">${opts([['Normálna', 0], ['Logaritmická', 1], ['Percentá', 2], ['Indexovaná na 100', 3]], L.scale)}</select></div>
        <div class="fld">${cb('look.invert', L.invert, 'Obrátiť mierku')}</div><div class="fld">${cb('look.lastLine', L.lastLine, 'Čiara poslednej ceny')}</div>
        <div class="fld"><span>Voľné miesto vpravo (sviečky)</span>${num('look.rightOffset', L.rightOffset, 0, 200)}</div>
        <div class="fld"><span>Pozadie</span>${swatch('bg', L.bg)}</div><div class="fld"><span>Text mierok</span>${swatch('text', L.text)}</div>
        <div class="fld">${cb('look.grid', L.grid, 'Mriežka')}${swatch('gridColor', L.gridColor)}</div>`,
      cross: `<div class="fld"><span>Režim</span><select data-k="crosshair.mode">${opts([['Normálny', 0], ['Magnet (close)', 1], ['Magnet (OHLC)', 3], ['Skrytý', 2]], C.mode)}</select></div>
        <div class="fld"><span>Čiary kurzora</span>${swatch('cross', C.color, C.opacity)}</div>
        <div class="fld">${cb('crosshair.labels', C.labels, 'Popisy na osiach')}${swatch('labelBg', C.labelBg)}</div>`,
      time: `<div class="fld"><span>Časové pásmo</span><select data-k="tz">${opts(ZONES.map(z => [z === 'UTC' ? 'UTC' : z.replace('_', ' '), z]), S.tz)}</select></div>
        <div class="muted">Čas na osi aj v legende sa zobrazí v tomto pásme.</div>`,
      renko: `<div class="fld"><span>Veľkosť tehly</span><select data-k="renko.method">${opts([['ATR (automaticky)', 'atr'], ['Pevná cena', 'fixed'], ['Percento ceny', 'pct']], R.method)}</select></div>
        <div class="fld"><span>ATR perióda</span>${num('renko.atr', R.atr, 1, 500)}</div><div class="fld"><span>Pevná veľkosť</span>${num('renko.box', R.box, 0.0001, 100000, 'any')}</div>
        <div class="fld"><span>Percento</span>${num('renko.pct', R.pct, 0.001, 50, 'any')}</div><div class="fld">${cb('renko.wicks', R.wicks, 'Knôty')}</div>`,
      data: `<div class="fld">${cb('hours', S.hours, 'Zlato a striebro: iba obchodné hodiny (bez víkendu a dennej pauzy)')}</div>
        <div class="fld"><span>Sviečok načítať</span>${num('bars', S.bars, 200, 5000, 100)}</div>
        <div class="fld"><span>Tvoje meno (nastavenia na všetkých zariadeniach)</span><input type="text" data-k="labeler" value="${esc(S.labeler)}"></div>
        <div class="muted" style="margin-top:14px;font-size:11px">Grafy: <a href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noopener" style="color:inherit">TradingView Lightweight Charts™</a> · Dáta: Binance</div>`,
    })[tab];
    const set = (path, v) => { const ks = path.split('.'); let o = S; while (ks.length > 1) o = o[ks.shift()]; o[ks[0]] = v; };
    const paint = () => {
      const d = openDialog(`<div class="dlg-h"><span>Nastavenia grafu</span><button class="ib" data-x>✕</button></div><div class="dlg-b">
        <div class="tabs">${[['bars', 'Sviečky'], ['scale', 'Mierka a pozadie'], ['cross', 'Kurzor'], ['time', 'Čas'], ['renko', 'Renko'], ['data', 'Dáta']].map(([k, n]) => `<span class="tab ${tab === k ? 'on' : ''}" data-tab="${k}">${n}</span>`).join('')}</div>${body()}</div>
        <div class="dlg-f"><button class="btn" data-reset>Predvolené</button><span class="grow"></span><button class="btn pri" data-x>Hotovo</button></div>`, null, 'wide');
      $$('[data-tab]', d).forEach(x => x.onclick = () => { tab = x.dataset.tab; paint(); });
      $$('[data-k]', d).forEach(x => x.onchange = async () => {
        const k = x.dataset.k, v = x.type === 'checkbox' ? x.checked : x.type === 'number' || x.tagName === 'SELECT' && /^-?\d+(\.\d+)?$/.test(x.value) ? +x.value : x.value;
        set(k, v); save();
        if (k === 'labeler' && v) { if (await pullPrefs(v)) { closeDialog(); applyToolbar(); load(); } else save(); }
        else if (k === 'hours' || k === 'bars') load(); else { Object.keys(tzFmt).forEach(z => delete tzFmt[z]); buildChart(k.startsWith('renko.') ? null : undefined); }
      });
      const sw = (k, st, keys, o) => { const b = $(`[data-sw="${k}"]`, d); if (b) b.onclick = () => colorPopover(b, st, o || { noOpacity: true }, () => { save(); buildChart(); }, keys); };
      for (const k of ['up', 'down', 'borderUp', 'borderDown', 'wickUp', 'wickDown', 'line', 'bg', 'text', 'gridColor']) sw(k, L, { color: k, opacity: '_o' + k });
      sw('cross', C, null, { width: true, style: true }); sw('labelBg', C, { color: 'labelBg', opacity: '_ol' });
      const sy = $('[data-sync]', d); if (sy) sy.onclick = () => { Object.assign(L, { borderUp: L.up, wickUp: L.up, borderDown: L.down, wickDown: L.down }); save(); buildChart(); paint(); };
      $('[data-reset]', d).onclick = () => { S.look = JSON.parse(JSON.stringify(DEF.look)); S.crosshair = { ...DEF.crosshair }; S.renko = { ...DEF.renko }; save(); buildChart(); paint(); };
      $$('[data-x]', d).forEach(x => x.onclick = closeDialog);
    };
    for (const k of ['up', 'down', 'borderUp', 'borderDown', 'wickUp', 'wickDown', 'line', 'bg', 'text', 'gridColor']) if (L['_o' + k] === undefined) L['_o' + k] = 100;
    if (C._ol === undefined) C._ol = 100;
    paint();
  }
  $('#bSettings').onclick = settings;

  // ---- trading idea window: the scanner's alerts, labelled for training ---------------------------
  const idea = $('#idea');
  let queue = [], qi = 0, current = null, form = null, mark = null;
  function placeIdea() {
    if (S.idea.x !== null) { idea.style.left = Math.max(0, Math.min(innerWidth - 80, S.idea.x)) + 'px'; idea.style.top = Math.max(0, Math.min(innerHeight - 40, S.idea.y)) + 'px'; idea.style.right = 'auto'; }
  }
  (() => {           // drag the window by its header
    let d = null;
    $('#ideaHead').addEventListener('pointerdown', e => { if (e.target.closest('button')) return; const r = idea.getBoundingClientRect(); d = { x: e.clientX - r.left, y: e.clientY - r.top }; e.preventDefault(); });
    window.addEventListener('pointermove', e => { if (!d) return; S.idea.x = e.clientX - d.x; S.idea.y = e.clientY - d.y; placeIdea(); });
    window.addEventListener('pointerup', () => { if (d) { d = null; save(); } });
  })();
  function toggleIdea(open) {
    S.idea.open = open ?? !S.idea.open; save();
    idea.classList.toggle('open', S.idea.open); $('#bIdea').classList.toggle('on', S.idea.open);
    if (S.idea.open) { placeIdea(); renderIdea(); if (S.idea.tab === 'alerts' && !current) loadQueue(); }
  }
  $('#bIdea').onclick = () => toggleIdea();
  $('#ideaClose').onclick = () => toggleIdea(false);
  $('#ideaMin').onclick = () => idea.classList.toggle('min');
  $('#ideaPrev').onclick = () => { if (qi > 0) openAlert(qi - 1); };
  $('#ideaNext').onclick = () => openAlert(qi + 1);

  async function loadQueue() {
    const I = S.idea, q = new URLSearchParams({ labeler: S.labeler || '', unlabeled: I.unlabeled, notified: I.notified, order: I.order, tfs: I.tfs.join(','), symbol: 'XAUUSD' });
    try { queue = await (await fetch(`api/alerts?${q}`)).json(); } catch (e) { queue = []; }
    qi = 0;
    if (queue.length) openAlert(0); else { current = null; renderIdea(); }
  }
  async function openAlert(i) {
    if (i < 0 || i >= queue.length) { toast('Vo fronte už nič nie je'); return; }
    qi = i;
    try { current = await (await fetch(`api/alerts/${queue[i].id}?labeler=${encodeURIComponent(S.labeler || '')}`)).json(); } catch (e) { toast('Alert sa nepodarilo načítať'); return; }
    const a = current, plan = a.idea.plan || {}, lab = a.label || {};
    form = { label: lab.label || (a.direction === 'bullish' ? 'LONG' : 'SHORT'), entry: lab.entry ?? plan.entry ?? a.price, sl: lab.stop_loss ?? plan.sl ?? null, tp: lab.take_profit ?? plan.tp ?? null,
             be: lab.break_even ?? null, correct: lab.correct ?? null, confidence: lab.confidence ?? 2, lines: lab.lines_quality ?? null, note: lab.note || '' };
    S.symbol = a.symbol; S.tf = a.timeframe; applyToolbar();
    alertMark = { time: a.bar_time, bull: a.direction === 'bullish', text: a.direction === 'bullish' ? 'LONG?' : 'SHORT?' };
    view = { mode: 'alert', id: a.id, time: a.bar_time, focus: a.bar_time, blind: S.idea.blind };
    syncPosition();
    await load();
    renderIdea();
  }
  // The entry / SL / TP of the form are a long/short position on the chart; dragging it updates the form.
  function syncPosition() {
    const f = form, a = current;
    if (!a || !['LONG', 'SHORT'].includes(f.label) || !f.entry || !f.sl || !f.tp) { view.position = null; return; }
    const end = a.bar_time + 30 * TF_SEC[a.timeframe];
    const d = view.position || { ...DR.TOOLS.long.defaults, ...draw.styleOf('long'), id: 'form', temp: true, locked: false };
    d.type = f.label === 'LONG' ? 'long' : 'short';
    d.pts = [{ t: a.bar_time, p: +f.entry }, { t: end, p: +f.tp }, { t: end, p: +f.sl }];
    d.onMove = x => { form.entry = +x.pts[0].p.toFixed(sym().digits); form.tp = +x.pts[1].p.toFixed(sym().digits); form.sl = +x.pts[2].p.toFixed(sym().digits); renderForm(); };
    view.position = d;
  }
  function positionChanged() {
    const had = view.position;
    syncPosition();
    if (!chart) return;
    if (had && !view.position) { draw.setList(currentDrawings()); }
    else if (!had && view.position) draw.add(view.position);
    draw.redraw();
  }
  function rrText() {
    const f = form;
    if (!['LONG', 'SHORT'].includes(f.label) || !f.entry || !f.sl || !f.tp) return '';
    const side = f.label === 'LONG' ? 1 : -1, risk = side * (f.entry - f.sl), reward = side * (f.tp - f.entry), rr = risk > 0 ? reward / risk : NaN;
    const wrong = risk <= 0 || reward <= 0, col = wrong || rr < 1 ? 'var(--down)' : rr < 1.5 ? '#f9a825' : 'var(--up)';
    return `<div class="rr"><small>RISK : REWARD</small><b style="color:${col}">${wrong ? 'SL/TP na zlej strane' : `1 : ${rr.toFixed(2)}`}</b><small>riziko ${fmt(Math.abs(risk))} ${current && current.atr ? `· ${(Math.abs(risk) / current.atr).toFixed(1)} ATR` : ''}</small></div>`;
  }
  function renderIdea() {
    const I = S.idea, body = $('#ideaBody');
    const tabs = `<div class="segbtn" style="margin-bottom:10px"><button data-itab="alerts" class="${I.tab === 'alerts' ? 'on' : ''}">Alerty skenera</button><button data-itab="own" class="${I.tab === 'own' ? 'on' : ''}">Vlastný nápad</button></div>`;
    const who = `<label class="grid2" style="grid-template-columns:1fr"><label>Tvoje meno<input class="idea-in" id="iName" value="${esc(S.labeler)}" placeholder="napr. kamil"></label></label>`;
    if (I.tab === 'own') { body.innerHTML = tabs + who + ownForm(); bindIdea(); return; }
    const filt = `<details class="more"><summary>Filter a poradie · vo fronte ${queue.length}</summary>
      <div class="fld"><span>Timeframe</span><span class="ctl">${['1m', '5m', '15m'].map(tf => `<label class="ctl"><input type="checkbox" data-ftf="${tf}" ${I.tfs.includes(tf) ? 'checked' : ''}>${tf}</label>`).join('')}</span></div>
      <div class="fld"><label class="ctl"><input type="checkbox" data-f="notified" ${I.notified ? 'checked' : ''}> Iba alerty z Telegramu</label></div>
      <div class="fld"><label class="ctl"><input type="checkbox" data-f="unlabeled" ${I.unlabeled ? 'checked' : ''}> Iba neoznačené</label></div>
      <div class="fld"><span>Poradie</span><select data-f="order">${opts([['Najnovšie', 'new'], ['Najstaršie', 'old'], ['Náhodne', 'random']], I.order)}</select></div>
      <div class="fld"><label class="ctl"><input type="checkbox" data-f="blind" ${I.blind ? 'checked' : ''}> Naslepo (skryť, čo bolo po alerte)</label></div></details>`;
    if (!current) { body.innerHTML = tabs + who + filt + '<div class="muted" style="margin-top:10px">Žiadny alert podľa filtra. Zmeň filter alebo počkaj na skener.</div>'; bindIdea(); return; }
    const a = current, x = a.idea;
    $('#ideaTitle').textContent = `💡 Alert #${a.id}`;
    body.innerHTML = tabs + who + filt + `<div style="margin-top:10px"><div class="idea-t">${esc(x.direction)} · ${esc(x.title)}</div><div class="idea-why">${esc(x.why)}</div>
      <div class="muted" style="font-size:11px;margin-bottom:6px">${esc(x.symbol)} · sviečka ${a.timeframe} · ${esc(fmtTime(a.bar_time))}</div>
      <table class="facts">${x.facts.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td class="muted">${esc(r[2])}</td></tr>`).join('')}
      ${x.confluence ? `<tr><td>🧩 Súlad</td><td colspan="2">${esc(x.confluence)}</td></tr>` : ''}${x.setup ? `<tr><td>Setup</td><td colspan="2">${esc(x.setup)}</td></tr>` : ''}
      ${x.plan ? `<tr><td>Návrh</td><td>1:${(x.plan.rr ?? 0).toFixed(1)}</td><td class="muted">SL ${fmt(x.plan.sl)} · TP ${fmt(x.plan.tp)}</td></tr>` : ''}</table></div>
      <div id="formBox"></div>`;
    renderForm();
    bindIdea();
  }
  function renderForm() {
    const box = $('#formBox'); if (!box) return;
    const f = form, plan = (current && current.idea.plan) || null, trade = ['LONG', 'SHORT'].includes(f.label);
    const seg = (key, list) => `<div class="segbtn">${list.map(([v, n]) => `<button data-set="${key}" data-v="${v}" class="${String(f[key]) === String(v) ? 'on' : ''}">${n}</button>`).join('')}</div>`;
    box.innerHTML = `<div class="step">1 · Rozhodnutie</div>${seg('label', [['LONG', '🟢 LONG'], ['SHORT', '🔴 SHORT'], ['SKIP', '⛔ Nevstupovať'], ['UNSURE', '❔ Neviem']])}
      ${trade ? `<div class="step">2 · Plán obchodu</div>${plan ? '<button class="btn" data-plan style="width:100%;margin-bottom:6px">🎯 Použiť návrh SL/TP</button>' : ''}
        <div class="grid3"><label>Vstup<input type="number" step="any" data-num="entry" value="${f.entry ?? ''}"></label><label>SL<input type="number" step="any" data-num="sl" value="${f.sl ?? ''}"></label>
        <label>TP<input type="number" step="any" data-num="tp" value="${f.tp ?? ''}"></label></div>${rrText()}
        <div class="muted" style="font-size:11px;margin-top:4px">Vstup, SL aj TP môžeš ťahať aj priamo v grafe.</div>` : ''}
      <div class="step">3 · Hodnotenie</div><div class="muted" style="font-size:11px;margin-bottom:3px">Bol signál správny?</div>${seg('correct', [[1, '✓ správny'], [0, '✗ nesprávny'], ['null', '? neviem']])}
      <div class="muted" style="font-size:11px;margin:6px 0 3px">Istota</div>${seg('confidence', [[1, '★'], [2, '★★'], [3, '★★★']])}
      <details class="more"><summary>Viac: BE, poznámka</summary>${trade ? `<label class="grid2" style="grid-template-columns:1fr;margin-top:6px"><label>BE – posun SL na vstup pri cene (prázdne = nie)<input type="number" step="any" data-num="be" value="${f.be ?? ''}"></label></label>` : ''}
        <label class="grid2" style="grid-template-columns:1fr;margin-top:6px"><label>Poznámka (prečo)<textarea class="ta" rows="3" data-note>${esc(f.note)}</textarea></label></label></details>
      <div class="save"><button class="btn pri" data-save title="Ctrl+Enter">💾 Uložiť a ďalší</button><button class="btn" data-skip title="Ctrl+Shift+Enter">⏭</button></div>
      <div class="prog" id="prog"></div>`;
    $$('[data-set]', box).forEach(b => b.onclick = () => { const k = b.dataset.set; f[k] = b.dataset.v === 'null' ? null : k === 'label' ? b.dataset.v : +b.dataset.v; renderForm(); if (k === 'label') positionChanged(); });
    $$('[data-num]', box).forEach(i => i.onchange = () => { f[i.dataset.num] = i.value === '' ? null : +i.value; renderForm(); positionChanged(); });
    const n = $('[data-note]', box); if (n) n.oninput = () => { f.note = n.value; };
    const p = $('[data-plan]', box); if (p) p.onclick = () => { f.entry = plan.entry; f.sl = plan.sl; f.tp = plan.tp; renderForm(); positionChanged(); };
    $('[data-save]', box).onclick = saveLabel;
    $('[data-skip]', box).onclick = () => openAlert(qi + 1);
    progress();
  }
  async function progress() {
    if (!S.labeler) { const p = $('#prog'); if (p) p.textContent = 'Vyplň meno, aby sa dali labely ukladať.'; return; }
    try { const r = await (await fetch(`api/progress?labeler=${encodeURIComponent(S.labeler)}`)).json(); const p = $('#prog'); if (p) p.textContent = `Vo fronte ${queue.length} · označené dnes ${r.today} · spolu ${r.total}`; } catch (e) {}
  }
  async function saveLabel() {
    if (!S.labeler) { toast('Najprv vyplň svoje meno'); $('#iName') && $('#iName').focus(); return; }
    if (!current) return;
    const f = form, trade = ['LONG', 'SHORT'].includes(f.label);
    const body = { alert_id: current.id, labeler: S.labeler, label: f.label, correct: f.correct, confidence: f.confidence,
                   entry: trade ? f.entry : null, stop_loss: trade ? f.sl : null, take_profit: trade ? f.tp : null, break_even: trade ? f.be : null,
                   lines_quality: f.lines, note: f.note || null, saw_future: view.blind ? 0 : 1 };
    const r = await fetch('api/labels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { toast('Uloženie zlyhalo'); return; }
    toast('Uložené ✅');
    if (S.idea.unlabeled) { queue.splice(qi, 1); if (qi >= queue.length) qi = queue.length - 1; if (queue.length) openAlert(Math.max(0, qi)); else { current = null; view.position = null; renderIdea(); } }
    else openAlert(qi + 1);
  }
  function ownForm() {
    mark = mark || { direction: 'bullish', entry: null, sl: null, tp: null, note: '', time: null };
    const m = mark, seg = (list) => `<div class="segbtn">${list.map(([v, n]) => `<button data-mdir="${v}" class="${m.direction === v ? 'on' : ''}">${n}</button>`).join('')}</div>`;
    return `<div class="muted" style="margin:8px 0">Zaznač vlastný vstup na ľubovoľnej sviečke ${esc(sym().name)} ${S.tf}. Uloží sa ako manuálny nápad pre tréning.</div>
      ${seg([['bullish', '🟢 LONG'], ['bearish', '🔴 SHORT']])}
      <div class="fld"><span>Sviečka: ${m.time ? esc(fmtTime(m.time)) : '—'}</span><button class="btn sm" data-pick>${m.picking ? 'klikni na graf…' : 'Vybrať v grafe'}</button></div>
      <div class="grid3"><label>Vstup<input type="number" step="any" data-m="entry" value="${m.entry ?? ''}"></label><label>SL<input type="number" step="any" data-m="sl" value="${m.sl ?? ''}"></label><label>TP<input type="number" step="any" data-m="tp" value="${m.tp ?? ''}"></label></div>
      <label class="grid2" style="grid-template-columns:1fr;margin-top:6px"><label>Poznámka<textarea class="ta" rows="2" data-mnote>${esc(m.note)}</textarea></label></label>
      <div class="save"><button class="btn pri" data-msave>💾 Uložiť nápad</button></div>`;
  }
  function bindIdea() {
    const body = $('#ideaBody');
    $$('[data-itab]', body).forEach(b => b.onclick = () => { S.idea.tab = b.dataset.itab; save(); renderIdea(); if (S.idea.tab === 'alerts' && !current) loadQueue(); });
    const nm = $('#iName', body); if (nm) nm.onchange = async () => { S.labeler = nm.value.trim(); save(); if (S.labeler && await pullPrefs(S.labeler)) { applyToolbar(); } renderIdea(); if (S.idea.tab === 'alerts') loadQueue(); };
    $$('[data-ftf]', body).forEach(x => x.onchange = () => { const t = x.dataset.ftf; S.idea.tfs = x.checked ? [...new Set([...S.idea.tfs, t])] : S.idea.tfs.filter(y => y !== t); save(); loadQueue(); });
    $$('[data-f]', body).forEach(x => x.onchange = () => { S.idea[x.dataset.f] = x.type === 'checkbox' ? x.checked : x.value; save(); if (x.dataset.f === 'blind') { if (current) openAlert(qi); } else loadQueue(); });
    $$('[data-mdir]', body).forEach(b => b.onclick = () => { mark.direction = b.dataset.mdir; renderIdea(); });
    $$('[data-m]', body).forEach(i => i.onchange = () => { mark[i.dataset.m] = i.value === '' ? null : +i.value; });
    const mn = $('[data-mnote]', body); if (mn) mn.oninput = () => { mark.note = mn.value; };
    const pick = $('[data-pick]', body); if (pick) pick.onclick = () => { mark.picking = true; renderIdea(); toast('Klikni na sviečku v grafe'); };
    const ms = $('[data-msave]', body); if (ms) ms.onclick = async () => {
      if (!S.labeler) { toast('Najprv vyplň svoje meno'); return; }
      if (!mark.time || !mark.entry) { toast('Vyber sviečku a vyplň vstup'); return; }
      const r = await fetch('api/marks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: S.symbol, timeframe: S.tf, bar_time: mark.time * 1000,
        direction: mark.direction, entry: mark.entry, stop_loss: mark.sl, take_profit: mark.tp, labeler: S.labeler, note: mark.note || null }) });
      toast(r.ok ? 'Nápad uložený ✅' : 'Uloženie zlyhalo'); if (r.ok) { mark = null; renderIdea(); }
    };
  }
  el.addEventListener('click', e => {     // "Vybrať v grafe" for the own idea
    if (!mark || !mark.picking || !chart) return;
    const b = el.getBoundingClientRect(), l = chart.timeScale().coordinateToLogical(e.clientX - b.left);
    const bar = disp[Math.max(0, Math.min(disp.length - 1, Math.round(l)))];
    if (!bar) return;
    Object.assign(mark, { time: bar.time, entry: mark.entry ?? bar.close, picking: false });
    renderIdea();
  });

  // ---- keyboard ---------------------------------------------------------------------------------
  document.addEventListener('keydown', e => {
    const typing = e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (e.key === 'Escape') { if ($('#pop').classList.contains('open')) { closePop(); return; } if (dialogOpen()) { cancelDialog(); return; } closeMenu(); }
    if (dialogOpen()) return;
    if (e.ctrlKey && e.key === 'Enter' && S.idea.open && current) { e.preventDefault(); if (e.shiftKey) openAlert(qi + 1); else saveLabel(); return; }
    if (e.altKey && e.code === 'KeyP') { e.preventDefault(); if (S.toolbar === 'hidden') $('#showToolbar').click(); else { S.lastToolbar = S.toolbar; S.toolbar = 'hidden'; save(); applyToolbar(); } return; }
    if (draw.key(e)) e.preventDefault();
  });
  window.addEventListener('beforeunload', save);

  // ---- start ------------------------------------------------------------------------------------
  (async () => {
    try { META = await (await fetch('api/meta')).json(); } catch (e) { toast('Server neodpovedá'); }
    SYM = Object.fromEntries((META.symbols || []).map(s => [s.id, s]));
    if (!SYM[S.symbol]) S.symbol = 'XAUUSD';
    if (S.labeler) await pullPrefs(S.labeler);
    applyToolbar();
    await load();
    if (S.idea.open) toggleIdea(true);
  })();
})();
