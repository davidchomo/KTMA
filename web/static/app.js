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
  const FONTS = [['Systémové', 'system'], ['Segoe UI', '"Segoe UI"'], ['Arial', 'Arial'], ['Verdana', 'Verdana'], ['Tahoma', 'Tahoma'], ['Trebuchet MS', '"Trebuchet MS"'],
                 ['Georgia', 'Georgia'], ['Consolas', 'Consolas'], ['Courier New', '"Courier New"'], ['Monospace', 'monospace']];
  const fontCss = f => (f === 'system' ? '-apple-system, system-ui, "Segoe UI", sans-serif' : f + ', sans-serif');
  const ZONES = ['UTC', 'Europe/Bratislava', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'Asia/Tokyo', 'Asia/Hong_Kong',
                 'Asia/Singapore', 'Asia/Dubai', 'Australia/Sydney'];

  // ---- state (this browser; also synced to the server under your name) ---------------------------
  const DEF = {
    symbol: 'XAUUSD', tf: '5m', type: 'candles', toolbar: 'top', tz: 'Europe/Bratislava', hours: true, bars: 1000,
    look: { up: '#089981', down: '#f23645', borderUp: '#089981', borderDown: '#f23645', wickUp: '#089981', wickDown: '#f23645',
            body: true, borders: true, wicks: true, line: '#2962ff', lineWidth: 2, bg: '#161a25', text: '#d1d4dc', grid: true, gridColor: '#1f2433',
            scale: 0, invert: false, lastLine: true, rightOffset: 8,
            bgType: 'solid', bg2: '#0f121a', gridV: { on: true, color: '#1f2433', opacity: 100, style: 0 }, gridH: { on: true, color: '#1f2433', opacity: 100, style: 0 },
            sepColor: '#2a2e39', scaleLine: '#2a2e39', fontSize: 11, font: 'system', marginTop: 8, marginBottom: 8,
            candle: { preset: 'std', body: 80, wick: 1, radius: 0, spacing: 6 }, bright: 100 },
    bubbles: { on: false, group: 0, minPct: 70, scale: 100, opacity: 70, style: 'pie', labels: true },
    panel: { w: 118, h: 30, fs: 13, font: 'system', bg: '#1e222d', text: '#d1d4dc', accent: '#2962ff', show: 'both', opacity: 100 },
    bgImg: { id: 'none', auto: false, autoKind: 'photo', dim: 55, blur: 0, url: '' },
    auto: { on: false, lines: true, channels: false, levels: true, pivots: false, ended: false, touches: true, labels: true, k: 0, ext: 30,
            sup: { color: '#26a69a', opacity: 90, width: 2, style: 0 }, res: { color: '#ef5350', opacity: 90, width: 2, style: 0 },
            lvl: { color: '#ffb74d', opacity: 75, width: 1, style: 2 } },
    ideas: { on: true, markers: true, history: true, notify: true, sound: false, minTouches: 0, minLevel: 0, rr: 2, minScore: 1 },
    scan: { symbols: ['XAUUSD', 'XAGUSD', 'BTCUSD'], tfs: ['1m', '5m', '15m', '1h', '4h'], fresh: 3, near: true, minScore: 0, every: 0 },
    chat: { open: false, x: null, y: null, kind: 'msg', filter: 'all', attach: false },
    replaySpeed: 2,
    legend: { symbol: true, name: 'short', tf: false, type: false, ohlc: false, change: false, studies: true, values: true },
    news: { open: false, x: null, y: null, topic: '', impact: 'med', cur: 'USD', links: [] },
    crosshair: { mode: 0, color: '#9598a1', opacity: 100, width: 1, style: 2, labels: true, labelBg: '#363c4e' },
    renko: { method: 'atr', atr: 14, box: 1, pct: 0.1, wicks: true },
    studies: null, templates: {}, favorites: ['ema', 'sma', 'vwap', 'bb', 'rsi', 'macd', 'volume'],
    magnet: 'off', drawings: {}, toolDefaults: {}, legendOpen: true, labeler: '',
    idea: { open: false, x: null, y: null, tab: 'alerts', blind: false, tfs: ['1m', '5m', '15m'], notified: true, unlabeled: true, order: 'new' },
    flow: { open: false, x: null, y: null }, folders: [],
    layout: { n: 1, two: 'h', sync: true, panes: [{ tf: '15m' }, { tf: '1h' }, { tf: '4h' }] },
    nexus: { hudX: null, hudY: null, avatar: '', quote: 0 },
    account: { start: 10000, positions: [], history: [] },
    robot: { on: false, symbols: ['XAUUSD'], tfs: ['1m', '5m', '15m', '1h'], period: 10, sharpBars: 3, sharpAtr: 2, onSharp: 'both', paper: true, lots: 0.1, state: {}, log: [] },
    savedAt: 0,
  };
  const merge = (a, b) => { const o = { ...a }; for (const k in b || {}) o[k] = a && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) && b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) ? merge(a[k], b[k]) : b[k]; return o; };
  // ?embed=2..4 = one of the extra charts of the multi-chart layout: its own settings key, no chat / robot / server sync
  const QS = new URLSearchParams(location.search), EMBED = QS.get('embed'), KEY = EMBED ? 'nx2:pane' + EMBED : 'nx2';
  let S = merge(DEF, LS.get(KEY, null) || LS.get('nx2', {}));
  if (EMBED) {
    if (QS.get('symbol')) S.symbol = QS.get('symbol');
    if (QS.get('tf')) S.tf = QS.get('tf');
    S.toolbar = 'top'; S.chat.open = S.news.open = S.idea.open = S.flow.open = false; S.robot = { ...S.robot, on: false };
    document.body.classList.add('embed');
  }
  if (!Array.isArray(S.studies)) S.studies = [{ type: 'volume' }];
  let studies = S.studies.map(KS.normalize).filter(Boolean);
  let syncT = null;
  let hist = [], hpos = -1, histT = null, restoring = false;
  function save() {
    S.studies = studies.filter(s => !s.temp).map(({ temp, ...s }) => s);
    S.savedAt = Date.now();
    LS.set(KEY, S);
    record();
    if (S.labeler && !EMBED) { clearTimeout(syncT); syncT = setTimeout(() => fetch(`api/prefs/${encodeURIComponent(S.labeler)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(S) }).catch(() => {}), 1500); }
  }
  async function pullPrefs(name) {
    if (EMBED) return false;
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
    return (await r.json()).bars.map(b => ({ time: b[0], open: b[1], high: b[2], low: b[3], close: b[4], volume: b[5], buy: b[6] ?? NaN }));
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
        out.push({ time: b.time, open: o, high: Math.max(b.high, o, c), low: Math.min(b.low, o, c), close: c, volume: b.volume, buy: b.buy });
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
    let top = Math.floor(bars[0].close / box) * box + box, bot = top - box, lastT = -Infinity, hi = -Infinity, lo = Infinity, vol = 0, buy = 0;
    const push = (o, c, t) => {
      const time = Math.max(t, lastT + 1); lastT = time;
      out.push({ time, open: o, close: c, high: R.wicks ? Math.max(hi, o, c) : Math.max(o, c), low: R.wicks ? Math.min(lo, o, c) : Math.min(o, c), volume: vol, buy });
      hi = -Infinity; lo = Infinity; vol = 0; buy = 0;
    };
    for (const b of bars) {
      hi = Math.max(hi, b.high); lo = Math.min(lo, b.low); vol += b.volume || 0; buy += b.buy || 0;
      while (b.close >= top + box) { push(top, top + box, b.time); bot = top; top += box; }
      while (b.close <= bot - box) { push(bot, bot - box, b.time); top = bot; bot -= box; }
    }
    return out.length ? out : bars;
  }
  function toD(bars) {
    return { t: bars.map(b => b.time), o: bars.map(b => b.open), h: bars.map(b => b.high), l: bars.map(b => b.low), c: bars.map(b => b.close),
             v: bars.map(b => b.volume || 0), bv: bars.map(b => b.buy ?? NaN), s: bars.map(b => sessionId(b.time)) };
  }
  function mainSeries(chart) {
    const L = S.look, t = S.type;
    const fmtP = { priceFormat: { type: 'price', precision: sym().digits ?? 2, minMove: 1 / 10 ** (sym().digits ?? 2) }, priceLineVisible: L.lastLine };
    if (['candles', 'ha', 'renko', 'hollow'].includes(t)) {
      const C = L.candle;
      return chart.addCustomSeries(new CandleView(), { ...fmtP, body: C.body, wick: C.wick, radius: C.radius, fill: L.body, borders: L.borders, wicks: L.wicks,
        up: L.up, down: L.down, borderUp: L.borderUp, borderDown: L.borderDown, wickUp: L.wickUp, wickDown: L.wickDown });
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

  // ---- candles drawn by us: body width, wick width, rounded corners (presets slim, chunky, expanded…) ------
  const CANDLE_PRESETS = {
    std: ['Štandard', { body: 80, wick: 1, radius: 0, spacing: 6 }], slim: ['Tenké', { body: 35, wick: 1, radius: 0, spacing: 6 }],
    chunky: ['Hrubé', { body: 94, wick: 2, radius: 2, spacing: 12 }], wide: ['Rozťahané', { body: 55, wick: 1, radius: 1, spacing: 18 }],
    compact: ['Husté', { body: 75, wick: 1, radius: 0, spacing: 3 }], pill: ['Zaoblené', { body: 70, wick: 1, radius: 50, spacing: 10 }],
    needle: ['Ihly', { body: 18, wick: 1, radius: 0, spacing: 8 }],
  };
  const UP0 = '#089981', DN0 = '#f23645';
  class CandleView {
    constructor() { this.d = null; this.o = null; }
    renderer() { return { draw: (target, toY) => this.draw(target, toY) }; }
    update(d, o) { this.d = d; this.o = o; }
    priceValueBuilder(p) { return [p.high, p.low, p.close]; }
    isWhitespace(p) { return p.close === undefined; }
    defaultOptions() { return { ...LW.customSeriesDefaultOptions, body: 80, wick: 1, radius: 0, up: UP0, down: DN0, borderUp: UP0, borderDown: DN0, wickUp: UP0, wickDown: DN0, fill: true, borders: true, wicks: true }; }
    draw(target, toY) {
      const d = this.d, o = this.o;
      if (!d || !d.visibleRange) return;
      target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
        const bw = Math.max(1, Math.floor(d.barSpacing * hr * o.body / 100)), ww = Math.max(1, Math.round(o.wick * hr));
        for (let i = d.visibleRange.from; i < d.visibleRange.to; i++) {
          const b = d.bars[i], p = b.originalData;
          if (!p || p.close === undefined) continue;
          const up = p.close >= p.open, yo = toY(p.open), yc = toY(p.close), yh = toY(p.high), yl = toY(p.low);
          if (yo === null || yc === null || yh === null || yl === null) continue;
          const x = Math.round(b.x * hr), top = Math.round(Math.min(yo, yc) * vr), h = Math.max(1, Math.round(Math.abs(yo - yc) * vr)), left = x - Math.floor(bw / 2);
          if (o.wicks) { ctx.fillStyle = p.wickColor || (up ? o.wickUp : o.wickDown); ctx.fillRect(x - Math.floor(ww / 2), Math.round(yh * vr), ww, Math.max(1, Math.round((yl - yh) * vr))); }
          const r = Math.min(bw / 2, h / 2, o.radius >= 50 ? bw : o.radius * hr);
          ctx.beginPath();
          if (r > 0.5 && ctx.roundRect) ctx.roundRect(left, top, bw, h, r); else ctx.rect(left, top, bw, h);
          const fill = p.color || (up ? o.up : o.down);
          if (o.fill && fill !== 'rgba(0,0,0,0)') { ctx.fillStyle = fill; ctx.fill(); }
          if (o.borders && bw > 2) { ctx.strokeStyle = p.borderColor || (up ? o.borderUp : o.borderDown); ctx.lineWidth = Math.max(1, hr); ctx.stroke(); }
          else if (!o.fill || fill === 'rgba(0,0,0,0)') { ctx.strokeStyle = p.borderColor || (up ? o.borderUp : o.borderDown); ctx.lineWidth = Math.max(1, hr); ctx.stroke(); }
        }
      });
    }
  }

  // ---- volume bubbles: one circle per bar or per higher-timeframe block, size = volume, pie = buyers vs sellers ----
  class Bubbles {
    constructor() { this.p = null; }
    attached(p) { this.p = p; } detached() { this.p = null; }
    update() { if (this.p) this.p.requestUpdate(); }
    updateAllViews() {}
    paneViews() { return [{ zOrder: () => 'top', renderer: () => ({ draw: target => this.draw(target) }) }]; }
    groups() {
      const B = S.bubbles, n = D.t.length, step = +B.group || 0, out = [];
      let g = null;
      for (let i = 0; i < n; i++) {
        const key = step ? Math.floor(D.t[i] / step) : i;
        if (!g || g.key !== key) { g = { key, i0: i, i1: i, v: 0, bv: 0, pv: 0, hasBuy: false }; out.push(g); }
        g.i1 = i; g.v += D.v[i]; g.pv += (D.h[i] + D.l[i] + D.c[i]) / 3 * D.v[i];
        if (Number.isFinite(D.bv[i])) { g.bv += D.bv[i]; g.hasBuy = true; }
      }
      return out;
    }
    draw(target) {
      if (!this.p || !S.bubbles.on || !D || !D.t.length) return;
      const ts = this.p.chart.timeScale(), series = this.p.series, B = S.bubbles, vr = ts.getVisibleLogicalRange();
      if (!vr) return;
      const all = this.groups().filter(g => g.i1 >= vr.from - 1 && g.i0 <= vr.to + 1 && g.v > 0);
      if (!all.length) return;
      const sorted = all.map(g => g.v).sort((a, b) => a - b), cut = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * B.minPct / 100))], max = sorted[sorted.length - 1];
      const maxR = Math.max(6, Math.min(70, ts.options().barSpacing * ((all[0].i1 - all[0].i0) + 1) * 0.9)) * B.scale / 100;
      target.useMediaCoordinateSpace(({ context: ctx }) => {
        for (const g of all) {
          if (g.v < cut) continue;
          const x1 = ts.logicalToCoordinate(g.i0), x2 = ts.logicalToCoordinate(g.i1), y = series.priceToCoordinate(g.pv / g.v);
          if (x1 === null || x2 === null || y === null) continue;
          const x = (x1 + x2) / 2, r = Math.max(3, maxR * Math.sqrt(g.v / max)), buy = g.hasBuy ? g.bv / g.v : 0.5;
          ctx.globalAlpha = B.opacity / 100;
          if (!g.hasBuy || B.style === 'delta') {
            ctx.fillStyle = buy >= 0.5 ? S.look.up : S.look.down;
            ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill();
          } else {
            const a0 = -Math.PI / 2, a1 = a0 + buy * 2 * Math.PI;
            ctx.fillStyle = S.look.up; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, a0, a1); ctx.closePath(); ctx.fill();
            ctx.fillStyle = S.look.down; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, a1, a0 + 2 * Math.PI); ctx.closePath(); ctx.fill();
          }
          ctx.globalAlpha = 1; ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.stroke();
          if (B.labels && r >= 13 && g.hasBuy) {
            const dl = 2 * g.bv - g.v;
            ctx.font = `600 ${Math.min(13, Math.max(9, r / 2.6))}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 3;
            ctx.fillText((dl >= 0 ? '+' : '−') + fmtVol(Math.abs(dl)), x, y); ctx.shadowBlur = 0;
          }
        }
      });
    }
  }
  const fmtVol = v => (v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e4 ? (v / 1e3).toFixed(0) + 'k' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'k' : v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2));

  // ---- chart --------------------------------------------------------------------------------------
  let bubbles = null;
  let chart = null, main = null, units = [], markersApi = null, alertMark = null;
  const el = $('#chart');
  const tzFmt = {};
  const tzf = (o) => { const k = S.tz + JSON.stringify(o); return tzFmt[k] || (tzFmt[k] = new Intl.DateTimeFormat('sk-SK', { timeZone: S.tz, ...o })); };
  const fmtTime = t => tzf({ day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', ...(TF_SEC[S.tf] < 60 ? { second: '2-digit' } : {}) }).format(new Date(t * 1000));
  function chartOptions() {
    const L = S.look, C = S.crosshair, ch = { color: rgba(C.color, C.opacity), width: C.width, style: C.style, labelVisible: C.labels, labelBackgroundColor: C.labelBg };
    const G = g => ({ color: rgba(g.color, g.opacity), visible: g.on, style: g.style });
    const bg = hasBg() ? { type: 'solid', color: 'rgba(0,0,0,0)' } : L.bgType === 'gradient' ? { type: 'gradient', topColor: L.bg, bottomColor: L.bg2 } : { type: 'solid', color: L.bg };
    return {
      autoSize: true,
      layout: { background: bg, textColor: L.text, fontSize: L.fontSize, fontFamily: fontCss(L.font), attributionLogo: false, panes: { separatorColor: L.sepColor, enableResize: true } },
      grid: { vertLines: G(L.gridV), horzLines: G(L.gridH) },
      crosshair: { mode: C.mode === 2 ? LW.CrosshairMode.Hidden : C.mode === 1 ? LW.CrosshairMode.Magnet : C.mode === 3 ? (LW.CrosshairMode.MagnetOHLC ?? 1) : LW.CrosshairMode.Normal, vertLine: ch, horzLine: ch },
      rightPriceScale: { borderColor: L.scaleLine, mode: L.scale, invertScale: L.invert, scaleMargins: { top: L.marginTop / 100, bottom: L.marginBottom / 100 } },
      timeScale: { borderColor: L.scaleLine, timeVisible: true, secondsVisible: TF_SEC[S.tf] < 60, rightOffset: L.rightOffset,
                   tickMarkFormatter: (t, type) => tzf([{ year: 'numeric' }, { month: 'short' }, { day: 'numeric', month: 'short' }, { hour: '2-digit', minute: '2-digit' },
                                                       { hour: '2-digit', minute: '2-digit', second: '2-digit' }][type] || { hour: '2-digit', minute: '2-digit' }).format(new Date(t * 1000)) },
      localization: { timeFormatter: fmtTime, locale: 'sk-SK' },
      handleScale: { axisPressedMouseMove: { time: true, price: true }, mouseWheel: true, pinch: true, axisDoubleClickReset: { time: true, price: true } },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    };
  }
  const shown = s => s.visible && s.tfs[S.tf] !== false;

  // ---- trades on the chart: SL / TP / partial TP lines you drag with the mouse, entry → exit connectors -------
  // The data comes from NEXUS (in a small chart of the 4-chart layout: from the main window's NEXUS).
  const NX = () => (EMBED ? (parent.NEXUS || null) : window.NEXUS);
  function logicalOf(t) {
    const T = D ? D.t : [], n = T.length, bs = TF_SEC[S.tf];
    if (!n) return 0;
    if (t <= T[0]) return (t - T[0]) / bs;
    if (t >= T[n - 1]) return n - 1 + (t - T[n - 1]) / bs;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; }
    return lo + (t - T[lo]) / (T[hi] - T[lo]);
  }
  class TradeLines {
    constructor() { this.p = null; this.hits = []; this.hover = null; this.drag = null; }
    attached(p) { this.p = p; } detached() { this.p = null; }
    update() { if (this.p) this.p.requestUpdate(); }
    updateAllViews() {}
    paneViews() { return [{ zOrder: () => 'top', renderer: () => ({ draw: target => this.draw(target) }) }]; }
    draw(target) {
      const nx = NX();
      this.hits = [];
      if (!this.p || !nx || !nx.chartLines || !D) return;
      const series = this.p.series, ts = this.p.chart.timeScale(), lines = nx.chartLines(S.symbol), segs = nx.chartTrades(S.symbol);
      target.useMediaCoordinateSpace(({ context: ctx, mediaSize: { width: W } }) => {
        // closed trades: a dotted connector from the entry to the exit, green = profit, red = loss
        for (const s of segs) {
          const x1 = ts.logicalToCoordinate(logicalOf(s.t1)), x2 = ts.logicalToCoordinate(logicalOf(s.t2)), y1 = series.priceToCoordinate(s.p1), y2 = series.priceToCoordinate(s.p2);
          if ([x1, x2, y1, y2].some(v => v === null)) continue;
          ctx.strokeStyle = s.win ? S.look.up : S.look.down; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
          for (const [x, y] of [[x1, y1], [x2, y2]]) { ctx.beginPath(); ctx.arc(x, y, 3, 0, 2 * Math.PI); ctx.fillStyle = ctx.strokeStyle; ctx.fill(); }
        }
        ctx.font = '600 11px system-ui'; ctx.textBaseline = 'middle';
        for (const l of lines) {
          const y = series.priceToCoordinate(l.price);
          if (y === null) continue;
          const key = lineKey(l), hot = this.hover === key || (this.drag && this.drag.key === key);
          ctx.strokeStyle = l.color; ctx.lineWidth = hot ? 2 : 1; ctx.setLineDash(l.solid ? [] : [6, 4]); ctx.globalAlpha = l.plan ? 0.85 : 1;
          ctx.beginPath(); ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(W, Math.round(y) + 0.5); ctx.stroke(); ctx.setLineDash([]);
          // the label with the money result, a grip to drag and ✕ to remove
          const text = (l.drag ? '⇕ ' : '') + l.text, tw = ctx.measureText(text).width, bw = tw + 14 + (l.del || l.plan ? 18 : 0), bx = W - bw - 70, by = Math.round(y) - 9;
          ctx.fillStyle = l.color; ctx.globalAlpha = hot ? 1 : 0.92;
          ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, bw, 18, 4) : ctx.rect(bx, by, bw, 18); ctx.fill(); ctx.globalAlpha = 1;
          ctx.fillStyle = '#fff'; ctx.fillText(text, bx + 7, by + 9.5);
          if (l.del || l.plan) { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(bx + bw - 18, by, 18, 18); ctx.fillStyle = '#fff'; ctx.fillText('✕', bx + bw - 13, by + 9.5); }
          this.hits.push({ l, y, x0: bx + bw - 18, x1: bx + bw, del: !!(l.del || l.plan) });
        }
      });
    }
    lineAt(x, y) {
      let best = null;
      for (const h of this.hits) if (h.l.drag && Math.abs(h.y - y) <= 6 && (!best || Math.abs(h.y - y) < Math.abs(best.y - y))) best = h;
      return best;
    }
  }
  let tradeLines = null;
  const lineKey = l => `${l.pid}|${l.kind}|${l.idx ?? ''}`;
  function refreshTrades(markers) {
    if (tradeLines) tradeLines.update();
    if (markers) updateMarkers();
  }
  window.NX_refreshTrades = refreshTrades;
  // drag a level: capture on the wrapper, before the drawing tools and the chart's own panning
  $('#chartWrap').addEventListener('pointerdown', e => {
    const nx = NX();
    if (!tradeLines || !nx || !chart || e.button !== 0 || e.target.closest('.no-chart')) return;
    const r = el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (x > chart.paneSize(0).width) return;
    const h = tradeLines.lineAt(x, y) || tradeLines.hits.find(q => q.del && Math.abs(q.y - y) <= 9 && x >= q.x0 && x <= q.x1);
    if (!h) return;
    e.stopPropagation(); e.preventDefault();
    if (h.del && x >= h.x0 && x <= h.x1) { nx.removeLine(h.l.pid, h.l.kind, h.l.idx); refreshTrades(true); return; }
    tradeLines.drag = { key: lineKey(h.l), l: h.l };
    chart.applyOptions({ handleScroll: false, handleScale: false });
    const move = ev => {
      const yy = ev.clientY - el.getBoundingClientRect().top, price = main.coordinateToPrice(yy);
      if (price === null) return;
      nx.moveLine(h.l.pid, h.l.kind, h.l.idx, price, false); tradeLines.update();
    };
    const up = ev => {
      window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true);
      const yy = ev.clientY - el.getBoundingClientRect().top, price = main.coordinateToPrice(yy);
      if (price !== null) nx.moveLine(h.l.pid, h.l.kind, h.l.idx, price, true);
      tradeLines.drag = null; el.style.cursor = '';
      const o = chartOptions(); chart.applyOptions({ handleScroll: o.handleScroll, handleScale: o.handleScale });
      refreshTrades(false);
    };
    window.addEventListener('pointermove', move, true); window.addEventListener('pointerup', up, true);
  }, true);
  $('#chartWrap').addEventListener('pointermove', e => {
    if (!tradeLines || !chart || tradeLines.drag) return;
    const r = el.getBoundingClientRect(), h = tradeLines.lineAt(e.clientX - r.left, e.clientY - r.top);
    const key = h ? lineKey(h.l) : null;
    if (key !== tradeLines.hover) { tradeLines.hover = key; el.style.cursor = h ? 'ns-resize' : ''; tradeLines.update(); }
  });

  function buildChart(keepRange) {
    // undefined = keep the current zoom; null = new data, start fresh (alert focus or the newest bars)
    const range = keepRange === undefined ? (chart ? chart.timeScale().getVisibleLogicalRange() : null) : keepRange;
    if (chart) { chart.remove(); chart = null; }
    document.body.style.setProperty('--bg', S.look.bg);
    disp = transform(src()); D = toD(disp);
    chart = LW.createChart(el, chartOptions());
    main = mainSeries(chart);
    main.setData(mainData());
    markersApi = LW.createSeriesMarkers(main, []);
    units = [];
    let pane = 1;
    for (const s of studies) {
      if (!shown(s) || hideL.studies) continue;
      const def = KS.STUDIES[s.type];
      const u = { s, def, pane: def.pane === true ? pane++ : 0, lines: {}, hists: {}, values: {}, fill: null, levels: false, host: null, marks: [] };
      units.push(u);
      refreshUnit(u);
    }
    const panes = chart.panes();
    if (panes.length > 1) { panes[0].setStretchFactor(Math.max(2, 6 - panes.length)); for (let i = 1; i < panes.length; i++) panes[i].setStretchFactor(1); }
    autoLayer = new AutoLayer(); main.attachPrimitive(autoLayer);
    bubbles = new Bubbles(); main.attachPrimitive(bubbles);
    tradeLines = new TradeLines(); main.attachPrimitive(tradeLines);
    computeTL(); checkNewIdeas();
    updateMarkers();
    draw.attach(main);
    draw.hidden = !!hideL.draw;
    draw.setList(currentDrawings());
    if (view.position) draw.add(view.position);
    if (ideaPos) draw.add(ideaPos);
    legendRows();
    showOHLC();
    chart.subscribeCrosshairMove(p => { lastCross = p; crossTime = p && p.time !== undefined ? p.time : null; showOHLC(crossTime); });
    const ts = chart.timeScale();
    if (range) ts.setVisibleLogicalRange(range);
    else if (view.focus !== undefined) focusOn(view.focus);
    else { ts.applyOptions({ barSpacing: S.look.candle.spacing }); ts.scrollToRealTime(); }
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
    disp = transform(src()); D = toD(disp);
    main.setData(mainData());
    units.forEach(refreshUnit);
    if (computeTL()) { checkNewIdeas(); if (S.idea.open && S.idea.tab === 'live') renderIdea(); }
    autoLayer && autoLayer.update();
    bubbles && bubbles.update();
    if (window.NEXUS && NEXUS.tick) NEXUS.tick();
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
    if (S.ideas.on && S.ideas.markers && !hideL.ideas) {
      const list = S.ideas.history ? tlIdeas : tlIdeas.slice(-1);
      for (const x of list) m.push({ time: x.time, position: x.dir > 0 ? 'belowBar' : 'aboveBar', color: x.dir > 0 ? S.look.up : S.look.down,
        shape: x.dir > 0 ? 'arrowUp' : 'arrowDown', text: '⚡' + (x.result === null ? '' : x.result > 0 ? '✓' : '✗'), size: 1 });
    }
    // your paper trades: BUY / SELL with the lots at the entry, ✕ with the result at the exit
    const nx = NX();
    if (nx && nx.chartMarkers && D && D.t.length) {
      const T = D.t, barAt = t => { if (t < T[0]) return null; let lo = 0, hi = T.length - 1; while (lo < hi) { const k = (lo + hi + 1) >> 1; if (T[k] <= t) lo = k; else hi = k - 1; } return T[lo]; };
      for (const x of nx.chartMarkers(S.symbol)) {
        const time = barAt(x.time); if (time === null) continue;
        if (x.kind === 'in') m.push({ time, position: x.dir > 0 ? 'belowBar' : 'aboveBar', color: x.dir > 0 ? '#00c853' : '#ff1744', shape: x.dir > 0 ? 'arrowUp' : 'arrowDown', text: x.text, size: 1.6 });
        else m.push({ time, position: x.dir > 0 ? 'aboveBar' : 'belowBar', color: x.win ? '#00c853' : '#ff1744', shape: 'square', text: x.text, size: 1 });
      }
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
    const c = b.close >= b.open ? S.look.up : S.look.down, ch = prev ? b.close - prev.close : 0, G = S.legend;
    const head = [G.symbol ? (G.name === 'name' ? sym().name : G.name === 'full' ? `${sym().name} · ${sym().desc || ''}` : S.symbol) : '', G.tf ? S.tf : '', G.type ? TYPES.find(t => t[0] === S.type)[1] : ''].filter(Boolean);
    const html = (head.length ? `<span class="sym">${esc(head.join(' · '))}</span>` : '') +
      (G.ohlc ? `O <b style="color:${c}">${fmt(b.open)}</b>H <b style="color:${c}">${fmt(b.high)}</b>L <b style="color:${c}">${fmt(b.low)}</b>C <b style="color:${c}">${fmt(b.close)}</b>` : '') +
      (G.change ? `<b style="color:${ch >= 0 ? S.look.up : S.look.down}">${ch >= 0 ? '+' : ''}${fmt(ch)} (${prev ? (100 * ch / prev.close).toFixed(2) : '0.00'} %)</b>` : '');
    const o = $('#ohlc'); o.innerHTML = html; o.style.display = html ? '' : 'none';
    legendValues(i < 0 ? disp.length - 1 : i);
  }
  function legendRows() {
    const rows = S.legend.studies ? units : [];
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
      if (!u || !u.s.out.legendValues || !S.legend.values || u.def.pattern) { if (u && div.querySelector('.vals')) div.querySelector('.vals').innerHTML = u && u.def.pattern ? `<span class="lg-val muted">${u.marks.length}×</span>` : ''; return; }
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
  function setStatus(kind, text) { const s = $('#status'); s.className = 'status ' + kind; $('#statusText').textContent = text; s.title = 'Stav dát: ' + text; }
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
        if (view.replay) view.replay.cut += fresh.length;
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
    const base = sy.market === 'spot' ? 'wss://stream.binance.com:9443/ws/' : 'wss://fstream.binance.com/market/ws/';
    ws = new WebSocket(base + (sec ? `${t}@aggTrade` : `${t}@kline_${tf}`));
    ws.onopen = () => setStatus('live', 'live');
    ws.onclose = () => { setStatus('err', 'odpojené · skúšam znova'); wsTimer = setTimeout(connectLive, 3000); };
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      let bar;
      if (m.e === 'kline') { const k = m.k; bar = { time: Math.floor(k.t / 1000), open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v, buy: +k.V, replace: true }; }
      else if (m.e === 'aggTrade') { const p = +m.p; bar = { time: Math.floor(m.T / 1000 / sec) * sec, open: p, high: p, low: p, close: p, volume: +m.q, buy: m.m ? 0 : +m.q }; }
      else return;
      if (S.hours && sy.hours === 'gold' && TF_SEC[tf] < 86400 && !goldOpen(bar.time)) return;
      const last = raw[raw.length - 1];
      if (last && last.time === bar.time) {
        if (bar.replace) Object.assign(last, { open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume, buy: bar.buy });
        else { last.high = Math.max(last.high, bar.high); last.low = Math.min(last.low, bar.low); last.close = bar.close; last.volume += bar.volume; last.buy = (last.buy || 0) + bar.buy; }
      } else if (!last || bar.time > last.time) { delete bar.replace; raw.push(bar); }
      else return;
      if (!refreshTimer) refreshTimer = setTimeout(() => { refreshTimer = null; refreshAll(); }, 250);
    };
  }

  // ---- toolbar ------------------------------------------------------------------------------------
  const side = () => (S.toolbar === 'left' ? 'right' : S.toolbar === 'right' ? 'left' : S.toolbar === 'bottom' ? 'up' : undefined);
  // Not enough room for every label: first tighten, then icons only on the right, then icons only everywhere.
  function fitToolbar() {
    const b = document.body;
    b.classList.remove('tb-fit1', 'tb-fit2', 'tb-fit3');
    if (!['top', 'bottom'].includes(S.toolbar)) return;
    const over = () => $$('#toolbar .tbtn .tx').some(t => t.offsetParent && t.scrollWidth > t.clientWidth + 1);
    for (const c of ['tb-fit1', 'tb-fit2', 'tb-fit3']) { if (!over()) return; b.classList.add(c); }
  }
  window.addEventListener('resize', () => { clearTimeout(fitToolbar.t); fitToolbar.t = setTimeout(fitToolbar, 150); });
  function applyToolbar() {
    document.body.classList.remove('tb-top', 'tb-bottom', 'tb-left', 'tb-right', 'tb-hidden'); document.body.classList.add(`tb-${S.toolbar}`);
    $('#bAuto').classList.toggle('on', S.auto.on);
    $('#symLabel').textContent = sym().name || S.symbol;
    const t = TYPES.find(x => x[0] === S.type) || TYPES[0];
    $('#typeLabel').textContent = t[1]; $('#typeIcon').textContent = t[2];
    $('#tfLabel').textContent = S.tf;
    fitToolbar();
  }
  // ---- undo / redo: drawings, indicators, symbol, timeframe, chart type, look… (not window positions) ----
  const HIST_SKIP = ['layout', 'savedAt', 'chat', 'news', 'idea', 'labeler', 'legendOpen', 'lastToolbar', 'flow', 'folders', 'nexus', 'account', 'robot'];
  function snap() { const o = { ...S }; HIST_SKIP.forEach(k => delete o[k]); return JSON.stringify(o, (k, v) => (k[0] === '_' ? undefined : v)); }
  function pushHist() {
    clearTimeout(histT); histT = null;
    const s = snap(); if (s === hist[hpos]) return;
    hist = hist.slice(0, hpos + 1); hist.push(s);
    if (hist.length > 150) hist.shift();
    hpos = hist.length - 1; paintHist();
  }
  function record() { if (restoring || hpos < 0) return; clearTimeout(histT); histT = setTimeout(pushHist, 400); }
  function paintHist() { $('#bUndo').disabled = hpos <= 0; $('#bRedo').disabled = hpos >= hist.length - 1; }
  function stepHist(d) {
    if (histT) pushHist();
    const to = hpos + d; if (to < 0 || to >= hist.length) return;
    const before = S;
    restoring = true;
    S = merge(DEF, JSON.parse(hist[to]));
    HIST_SKIP.forEach(k => { if (k in before) S[k] = before[k]; });   // the same objects: the windows keep references to them
    studies = S.studies.map(KS.normalize).filter(Boolean);
    hpos = to; save();
    applyPanel(); applyBg(); applyBright(); applyToolbar();
    if (['symbol', 'tf', 'hours', 'bars'].some(k => before[k] !== S[k])) { exitReplay(); view = { mode: 'live' }; alertMark = null; ideaPos = null; load(); }
    else { Object.keys(tzFmt).forEach(z => delete tzFmt[z]); buildChart((S.type === 'renko') !== (before.type === 'renko') ? null : undefined); }
    restoring = false; paintHist();
    toast(d < 0 ? '↶ Späť o krok' : '↷ Znova (krok dopredu)', 900);
  }
  $('#bUndo').onclick = () => stepHist(-1);
  $('#bRedo').onclick = () => stepHist(1);

  function setAndReload(changes) { Object.assign(S, changes); save(); applyToolbar(); exitReplay(); view = { mode: 'live' }; alertMark = null; ideaPos = null; load(); FLOW.setSymbol({ id: S.symbol, ...sym() });
    if (EMBED) { if (parent.NX_paneChanged) parent.NX_paneChanged(+EMBED, { symbol: S.symbol, tf: S.tf }); }
    else if (S.layout.sync && changes.symbol) $$('#paneGrid iframe.pane').forEach(f => { try { f.contentWindow.NX_setSymbol(S.symbol); } catch (e) {} });
  }
  window.NX_setSymbol = s => { if (s !== S.symbol) setAndReload({ symbol: s }); };
  window.NX_setTf = tf => { if (tf !== S.tf) setAndReload({ tf }); };

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
  $('#showToolbar').onclick = () => { S.toolbar = S.lastToolbar && S.lastToolbar !== 'hidden' ? S.lastToolbar : 'top'; save(); applyToolbar(); };
  $('#bFull').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}));
  document.addEventListener('fullscreenchange', () => { $('#fullIcon').textContent = document.fullscreenElement ? '🗗' : '⛶'; $('#bFull').title = document.fullscreenElement ? 'Ukončiť celú obrazovku' : 'Celá obrazovka (F11)'; });
  $('#backLive').onclick = () => { exitReplay(); view = { mode: 'live' }; alertMark = null; load(); };

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
  const GRID_STYLES = [['plná', 0], ['bodky', 1], ['čiarky', 2], ['veľké čiarky', 3], ['riedke bodky', 4]];
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
  function settings(tab0) {
    let tab = typeof tab0 === 'string' ? tab0 : 'bars';
    const L = S.look, C = S.crosshair, R = S.renko;
    const cb = (k, on, label) => `<label class="ctl"><input type="checkbox" data-k="${k}" ${on ? 'checked' : ''}> ${label}</label>`;
    const num = (k, v, min, max, step) => `<input type="number" data-k="${k}" value="${v}" min="${min}" max="${max}" step="${step || 1}">`;
    const body = () => ({
      bars: `<div class="fld">${cb('look.body', L.body, 'Telo sviečky')}<span class="ctl">${swatch('up', L.up)}${swatch('down', L.down)}</span></div>
        <div class="fld">${cb('look.borders', L.borders, 'Okraje')}<span class="ctl">${swatch('borderUp', L.borderUp)}${swatch('borderDown', L.borderDown)}</span></div>
        <div class="fld">${cb('look.wicks', L.wicks, 'Knôty')}<span class="ctl">${swatch('wickUp', L.wickUp)}${swatch('wickDown', L.wickDown)}</span></div>
        <div class="fld"><span>Čiara / plocha (čiarové typy)</span><span class="ctl">${swatch('line', L.line)}<select class="sm" data-k="look.lineWidth">${opts([1, 2, 3, 4].map(w => [w + ' px', w]), L.lineWidth)}</select></span></div>
        <div class="fld"><span>Rovnaké farby pre telo, okraj aj knôt</span><button class="btn sm" data-sync>Zjednotiť</button></div>
        <div class="sec2">Veľkosť a tvar sviečok</div>
        <div class="fld"><span class="ctl" style="flex-wrap:wrap">${Object.entries(CANDLE_PRESETS).map(([k, [n]]) => `<button class="btn sm ${L.candle.preset === k ? 'pri' : ''}" data-cp="${k}">${n}</button>`).join('')}</span></div>
        <div class="fld"><span>Šírka tela (% miesta pre sviečku)</span>${rng('body', 10, 100, '%')}</div>
        <div class="fld"><span>Hrúbka knôtu</span>${rng('wick', 1, 6, 'px')}</div>
        <div class="fld"><span>Zaoblenie rohov</span>${rng('radius', 0, 50, '')}</div>
        <div class="fld"><span>Rozostup sviečok (priblíženie)</span>${rng('spacing', 1, 50, 'px')}</div>
        <div class="muted" style="font-size:11px">Platí pre sviečky, duté sviečky, Heikin Ashi a Renko. Rozostup mení aj koliesko myši.</div>`,
      scale: `<div class="fld"><span>Mierka</span><select data-k="look.scale">${opts([['Normálna', 0], ['Logaritmická', 1], ['Percentá', 2], ['Indexovaná na 100', 3]], L.scale)}</select></div>
        <div class="fld">${cb('look.invert', L.invert, 'Obrátiť mierku')}</div><div class="fld">${cb('look.lastLine', L.lastLine, 'Čiara poslednej ceny')}</div>
        <div class="fld"><span>Voľné miesto vpravo (sviečky)</span>${num('look.rightOffset', L.rightOffset, 0, 200)}</div>
        <div class="fld"><span>Okraj hore / dole (%)</span><span class="ctl">${num('look.marginTop', L.marginTop, 0, 40)}${num('look.marginBottom', L.marginBottom, 0, 40)}</span></div>`,
      canvas: `<div class="sec2">Jas celej stránky</div>
        <div class="fld"><span>Jas</span><span class="op" style="width:250px"><input type="range" min="40" max="160" data-bright value="${L.bright}"><b>${L.bright} %</b></span></div>
        <div class="sec2">Pozadie</div>
        <div class="fld"><select data-k="look.bgType">${opts([['Plná farba', 'solid'], ['Prechod (gradient)', 'gradient']], L.bgType)}</select><span class="ctl">${swatch('bg', L.bg)}${L.bgType === 'gradient' ? swatch('bg2', L.bg2) : ''}</span></div>
        <div class="muted" style="font-size:11px">Obrázok na pozadí (hory, ročné obdobia, vlastný) nastavíš v 🖼 Štýly.</div>
        <div class="sec2">Mriežka</div>
        <div class="fld">${cb('look.gridV.on', L.gridV.on, 'Zvislé čiary')}<span class="ctl"><select class="sm" data-k="look.gridV.style">${opts(GRID_STYLES, L.gridV.style)}</select>${swatch('gridV', L.gridV.color, L.gridV.opacity)}</span></div>
        <div class="fld">${cb('look.gridH.on', L.gridH.on, 'Vodorovné čiary')}<span class="ctl"><select class="sm" data-k="look.gridH.style">${opts(GRID_STYLES, L.gridH.style)}</select>${swatch('gridH', L.gridH.color, L.gridH.opacity)}</span></div>
        <div class="fld"><span>Rovnaké nastavenie pre obe</span><button class="btn sm" data-gsync>Zjednotiť podľa zvislých</button></div>
        <div class="fld"><span>Oddeľovače panelov (RSI, MACD…)</span>${swatch('sepColor', L.sepColor)}</div>
        <div class="sec2">Mierky</div>
        <div class="fld"><span>Text</span>${swatch('text', L.text)}</div><div class="fld"><span>Čiary mierok</span>${swatch('scaleLine', L.scaleLine)}</div>
        <div class="fld"><span>Veľkosť písma</span><select data-k="look.fontSize">${opts([9, 10, 11, 12, 13, 14, 16, 18].map(v => [v + ' px', v]), L.fontSize)}</select></div>
        <div class="fld"><span>Písmo</span><select data-k="look.font">${opts(FONTS, L.font)}</select></div>`,
      cross: `<div class="fld"><span>Režim</span><select data-k="crosshair.mode">${opts([['Normálny', 0], ['Magnet (close)', 1], ['Magnet (OHLC)', 3], ['Skrytý', 2]], C.mode)}</select></div>
        <div class="fld"><span>Čiary kurzora</span>${swatch('cross', C.color, C.opacity)}</div>
        <div class="fld">${cb('crosshair.labels', C.labels, 'Popisy na osiach')}${swatch('labelBg', C.labelBg)}</div>`,
      time: `<div class="fld"><span>Časové pásmo</span><select data-k="tz">${opts(ZONES.map(z => [z === 'UTC' ? 'UTC' : z.replace('_', ' '), z]), S.tz)}</select></div>
        <div class="muted">Čas na osi aj v legende sa zobrazí v tomto pásme.</div>`,
      legend: `<div class="muted" style="margin:4px 0 8px">Čo sa zobrazí vľavo hore v grafe. Predvolené je iba skratka symbolu.</div>
        <div class="fld">${cb('legend.symbol', S.legend.symbol, 'Symbol')}<select data-k="legend.name">${opts([['Skratka (XAUUSD)', 'short'], ['Názov (XAU/USD)', 'name'], ['Názov + popis', 'full']], S.legend.name)}</select></div>
        <div class="fld">${cb('legend.tf', S.legend.tf, 'Timeframe')}</div><div class="fld">${cb('legend.type', S.legend.type, 'Typ grafu')}</div>
        <div class="fld">${cb('legend.ohlc', S.legend.ohlc, 'Ceny O H L C sviečky pod kurzorom')}</div><div class="fld">${cb('legend.change', S.legend.change, 'Zmena a percentuálna zmena')}</div>
        <div class="fld">${cb('legend.studies', S.legend.studies, 'Zoznam indikátorov (s tlačidlami 👁 ⚙ ✕)')}</div><div class="fld">${cb('legend.values', S.legend.values, 'Hodnoty indikátorov')}</div>`,
      renko: `<div class="fld"><span>Veľkosť tehly</span><select data-k="renko.method">${opts([['ATR (automaticky)', 'atr'], ['Pevná cena', 'fixed'], ['Percento ceny', 'pct']], R.method)}</select></div>
        <div class="fld"><span>ATR perióda</span>${num('renko.atr', R.atr, 1, 500)}</div><div class="fld"><span>Pevná veľkosť</span>${num('renko.box', R.box, 0.0001, 100000, 'any')}</div>
        <div class="fld"><span>Percento</span>${num('renko.pct', R.pct, 0.001, 50, 'any')}</div><div class="fld">${cb('renko.wicks', R.wicks, 'Knôty')}</div>`,
      panel: (() => { const P = S.panel, rng = (k, min, max) => `<span class="op" style="width:250px"><input type="range" min="${min}" max="${max}" data-pl="${k}" value="${P[k]}"><b>${P[k]} px</b></span>`;
        return `<div class="sec2">Poloha panelu</div>
        <div class="fld"><span class="ctl" style="flex-wrap:wrap">${[['top', '⬆ Hore'], ['bottom', '⬇ Dole'], ['left', '⬅ Vľavo'], ['right', '➡ Vpravo'], ['hidden', '🙈 Skryť']].map(([k, n]) => `<button class="btn sm ${S.toolbar === k ? 'pri' : ''}" data-pos="${k}">${n}</button>`).join('')}</span></div>
        <div class="muted" style="font-size:11px">Skrytý panel vrátiš tlačidlom ☰ v rohu grafu alebo Alt+P.</div>
        <div class="sec2">Vzhľad panelu</div>
        <div class="fld"><span>Šírka tlačidla</span>${rng('w', 40, 240)}</div><div class="fld"><span>Výška panelu</span>${rng('h', 22, 56)}</div>
        <div class="fld"><span>Veľkosť písma</span>${rng('fs', 9, 22)}</div>
        <div class="fld"><span>Písmo</span><select data-pl="font">${opts(FONTS, P.font)}</select></div>
        <div class="fld"><span>Zobraziť</span><select data-pl="show">${opts([['Ikona + text', 'both'], ['Iba ikony', 'icons'], ['Iba text', 'text']], P.show)}</select></div>
        <div class="fld"><span>Pozadie panelu</span>${swatch('pbg', P.bg, P.opacity)}</div><div class="fld"><span>Text</span>${swatch('ptext', P.text)}</div>
        <div class="fld"><span>Zvýraznenie (aktívne tlačidlá, výber)</span>${swatch('paccent', P.accent)}</div>
        <div class="fld"><span>Vzhľad panelu na predvolený</span><button class="btn sm" data-preset>Predvolené</button></div>`; })(),
      data: `<div class="fld">${cb('hours', S.hours, 'Zlato a striebro: iba obchodné hodiny (bez víkendu a dennej pauzy)')}</div>
        <div class="fld"><span>Sviečok načítať</span>${num('bars', S.bars, 200, 5000, 100)}</div>
        <div class="fld"><span>Tvoje meno (nastavenia na všetkých zariadeniach)</span><input type="text" data-k="labeler" value="${esc(S.labeler)}"></div>
        <div class="muted" style="margin-top:14px;font-size:11px">Grafy: <a href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noopener" style="color:inherit">TradingView Lightweight Charts™</a> · Dáta: Binance</div>`,
    })[tab];
    const rng = (k, min, max, unit) => `<span class="op" style="width:250px"><input type="range" min="${min}" max="${max}" data-cs="${k}" value="${L.candle[k]}"><b>${L.candle[k]} ${unit}</b></span>`;
    const set = (path, v) => { const ks = path.split('.'); let o = S; while (ks.length > 1) o = o[ks.shift()]; o[ks[0]] = v; };
    const paint = () => {
      const d = openDialog(`<div class="dlg-h"><span>Nastavenia grafu</span><button class="ib" data-x>✕</button></div><div class="dlg-b">
        <div class="tabs">${[['bars', 'Sviečky'], ['canvas', 'Plátno'], ['legend', 'Legenda'], ['scale', 'Mierka'], ['cross', 'Kurzor'], ['time', 'Čas'], ['renko', 'Renko'], ['panel', 'Panel'], ['data', 'Dáta']].map(([k, n]) => `<span class="tab ${tab === k ? 'on' : ''}" data-tab="${k}">${n}</span>`).join('')}</div>${body()}</div>
        <div class="dlg-f"><button class="btn" data-reset>Predvolené</button><span class="grow"></span><button class="btn pri" data-x>Hotovo</button></div>`, null, 'wide');
      $$('[data-tab]', d).forEach(x => x.onclick = () => { tab = x.dataset.tab; paint(); });
      const br = $('[data-bright]', d); if (br) br.oninput = () => { L.bright = +br.value; br.nextElementSibling.textContent = L.bright + ' %'; applyBright(); save(); };
      const CS = L.candle;
      $$('[data-cs]', d).forEach(x => x.oninput = () => { const k = x.dataset.cs; CS[k] = +x.value; CS.preset = ''; x.nextElementSibling.textContent = x.nextElementSibling.textContent.replace(/^\S+/, () => CS[k]);
        if (k === 'spacing') chart && chart.timeScale().applyOptions({ barSpacing: CS.spacing }); else main && main.applyOptions({ [k]: CS[k] }); save(); });
      $$('[data-cp]', d).forEach(x => x.onclick = () => { Object.assign(CS, CANDLE_PRESETS[x.dataset.cp][1], { preset: x.dataset.cp }); save(); buildChart();
        chart.timeScale().applyOptions({ barSpacing: CS.spacing }); chart.timeScale().scrollToRealTime(); paint(); });
      const P = S.panel;
      $$('[data-pos]', d).forEach(x => x.onclick = () => { if (x.dataset.pos === 'hidden') S.lastToolbar = S.toolbar; S.toolbar = x.dataset.pos; save(); applyToolbar(); paint(); });
      $$('[data-pl]', d).forEach(x => x[x.type === 'range' ? 'oninput' : 'onchange'] = () => { const k = x.dataset.pl; P[k] = x.type === 'range' ? +x.value : x.value;
        if (x.type === 'range') x.nextElementSibling.textContent = `${P[k]} px`; save(); applyPanel(); });
      [['pbg', 'bg', 'opacity', {}], ['ptext', 'text', '_ot', { noOpacity: true }], ['paccent', 'accent', '_oa', { noOpacity: true }]].forEach(([id, color, opacity, o]) => {
        const b = $(`[data-sw=${id}]`, d); if (b) b.onclick = () => colorPopover(b, P, o, () => { save(); applyPanel(); }, { color, opacity }); });
      const pr = $('[data-preset]', d); if (pr) pr.onclick = () => { S.panel = { ...DEF.panel }; save(); applyPanel(); paint(); };
      $$('[data-k]', d).forEach(x => x.onchange = async () => {
        const k = x.dataset.k, v = x.type === 'checkbox' ? x.checked : x.type === 'number' || x.tagName === 'SELECT' && /^-?\d+(\.\d+)?$/.test(x.value) ? +x.value : x.value;
        set(k, v); save();
        if (k === 'labeler' && v) { if (await pullPrefs(v)) { closeDialog(); applyToolbar(); load(); } else save(); }
        else if (k === 'hours' || k === 'bars') load(); else { Object.keys(tzFmt).forEach(z => delete tzFmt[z]); applyBg(); buildChart(k.startsWith('renko.') ? null : undefined); if (k === 'look.bgType') paint(); }
      });
      const sw = (k, st, keys, o) => { const b = $(`[data-sw="${k}"]`, d); if (b) b.onclick = () => colorPopover(b, st, o || { noOpacity: true }, () => { save(); applyBg(); buildChart(); }, keys); };
      for (const k of ['up', 'down', 'borderUp', 'borderDown', 'wickUp', 'wickDown', 'line', 'bg', 'bg2', 'text', 'sepColor', 'scaleLine']) sw(k, L, { color: k, opacity: '_o' + k });
      sw('gridV', L.gridV, null, {}); sw('gridH', L.gridH, null, {});
      const gs = $('[data-gsync]', d); if (gs) gs.onclick = () => { L.gridH = { ...L.gridV }; save(); buildChart(); paint(); };
      sw('cross', C, null, { width: true, style: true }); sw('labelBg', C, { color: 'labelBg', opacity: '_ol' });
      const sy = $('[data-sync]', d); if (sy) sy.onclick = () => { Object.assign(L, { borderUp: L.up, wickUp: L.up, borderDown: L.down, wickDown: L.down }); save(); buildChart(); paint(); };
      $('[data-reset]', d).onclick = () => { S.look = JSON.parse(JSON.stringify(DEF.look)); S.crosshair = { ...DEF.crosshair }; S.renko = { ...DEF.renko }; save(); applyBg(); buildChart(); paint(); };
      $$('[data-x]', d).forEach(x => x.onclick = closeDialog);
    };
    for (const k of ['up', 'down', 'borderUp', 'borderDown', 'wickUp', 'wickDown', 'line', 'bg', 'bg2', 'text', 'sepColor', 'scaleLine']) if (L['_o' + k] === undefined) L['_o' + k] = 100;
    if (C._ol === undefined) C._ol = 100;
    paint();
  }
  $('#bSettings').onclick = settings;

  // ---- trading idea window: the scanner's alerts, labelled for training ---------------------------
  const idea = $('#idea');
  let queue = [], qi = 0, current = null, form = null, mark = null;
  const placeIdea = () => placeWin(idea, S.idea);
  dragWin(idea, $('#ideaHead'), S.idea);
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
    const tabs = `<div class="segbtn" style="margin-bottom:10px"><button data-itab="alerts" class="${I.tab === 'alerts' ? 'on' : ''}">Alerty skenera</button><button data-itab="live" class="${I.tab === 'live' ? 'on' : ''}">⚡ Živé nápady</button><button data-itab="own" class="${I.tab === 'own' ? 'on' : ''}">Vlastný nápad</button></div>`;
    const who = `<label class="grid2" style="grid-template-columns:1fr"><label>Tvoje meno<input class="idea-in" id="iName" value="${esc(S.labeler)}" placeholder="napr. kamil"></label></label>`;
    if (I.tab === 'own') { $('#ideaTitle').textContent = '💡 Obchodný nápad'; body.innerHTML = tabs + who + ownForm(); bindIdea(); return; }
    if (I.tab === 'live') { $('#ideaTitle').textContent = '⚡ Živé nápady'; body.innerHTML = tabs + liveTab(); bindIdea(); bindLive(body); return; }
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

  // ---- replay: hide the future, stop the market, step through the bars -----------------------------
  // view.replay = {cut}: only raw[0 .. cut) is on the chart; live data keeps arriving behind the cut.
  const hideL = { studies: false, draw: false, auto: false, ideas: false };
  function src() { return view.replay ? raw.slice(0, view.replay.cut) : raw; }
  let replayTimer = null, replayPick = false;
  const rpBar = $('#replayBar');
  function startReplay(pick) {
    if (!raw.length) return;
    if (!view.replay) view.replay = { cut: raw.length };
    replayPick = !!pick;
    rpBar.classList.add('open'); $('#bReplay').classList.add('on');
    if (pick) { $('#hint').textContent = '✂ Klikni na sviečku – od nej ďalej sa trh skryje · Esc = zrušiť'; $('#hint').style.display = 'block'; el.classList.add('drawing'); }
    replayInfo(); refreshAll();
  }
  function stopPick() { replayPick = false; $('#hint').style.display = 'none'; el.classList.remove('drawing'); }
  function exitReplay() {
    stopPick(); playReplay(false);
    if (!view.replay) return;
    view.replay = null;
    rpBar.classList.remove('open'); $('#bReplay').classList.remove('on');
    refreshAll(); chart && chart.timeScale().scrollToRealTime();
  }
  function stepReplay(d) {
    const R = view.replay; if (!R) return;
    const next = Math.max(30, Math.min(raw.length, R.cut + d));
    if (next === R.cut) { if (d > 0 && replayTimer && view.mode !== 'live') playReplay(false); return; }
    const r = chart.timeScale().getVisibleLogicalRange(), before = disp.length, atEnd = r && r.to >= before - 3;
    R.cut = next; refreshAll();
    const added = disp.length - before;
    if (r && atEnd && added) chart.timeScale().setVisibleLogicalRange({ from: r.from + added, to: r.to + added });
    replayInfo();
  }
  function playReplay(on) {
    clearInterval(replayTimer); replayTimer = null;
    if (on && view.replay) replayTimer = setInterval(() => stepReplay(1), 1000 / S.replaySpeed);
    $('[data-r=play]', rpBar).textContent = replayTimer ? '⏸' : '▶';
  }
  function replayInfo() {
    const R = view.replay; if (!R) return;
    const hidden = raw.length - R.cut, b = raw[R.cut - 1];
    $('#rpInfo').textContent = `${b ? fmtTime(b.time) : ''} · skrytých ${hidden} ${hidden === 1 ? 'sviečka' : hidden < 5 && hidden ? 'sviečky' : 'sviečok'}`;
    $$('[data-h]', rpBar).forEach(x => x.classList.toggle('off', !!hideL[x.dataset.h]));
  }
  rpBar.innerHTML = `<button data-r="pick" title="Vybrať začiatok – klikni na sviečku">✂</button><button data-r="back" title="O sviečku späť (←)">⏮</button>
    <button data-r="play" title="Prehrať / pauza (medzerník)">▶</button><button data-r="fwd" title="O sviečku dopredu (→)">⏭</button>
    <select data-r="speed" title="Rýchlosť (sviečok za sekundu)">${opts([0.5, 1, 2, 3, 5, 10, 20].map(v => [v + '×/s', v]), S.replaySpeed)}</select><span class="rp-sep"></span>
    <button data-h="studies" title="Skryť / ukázať indikátory">ƒx</button><button data-h="draw" title="Skryť / ukázať kresby">✎</button>
    <button data-h="auto" title="Skryť / ukázať auto čiary">📐</button><button data-h="ideas" title="Skryť / ukázať nápady">⚡</button>
    <span class="rp-sep"></span><span id="rpInfo"></span><button data-r="exit" title="Ukončiť replay, späť na živý trh (Alt+R)">✕</button>`;
  rpBar.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const a = b.dataset.r, h = b.dataset.h;
    if (a === 'pick') startReplay(true); else if (a === 'back') { playReplay(false); stepReplay(-1); } else if (a === 'fwd') { playReplay(false); stepReplay(1); }
    else if (a === 'play') playReplay(!replayTimer); else if (a === 'exit') exitReplay();
    if (h) { hideL[h] = !hideL[h]; if (h === 'draw') draw.hidden = hideL.draw; if (h === 'studies') buildChart(); else { autoLayer && autoLayer.update(); updateMarkers(); } replayInfo(); }
  });
  $('[data-r=speed]', rpBar).onchange = e => { S.replaySpeed = +e.target.value; save(); if (replayTimer) playReplay(true); };
  el.addEventListener('click', e => {
    if (!replayPick || !chart) return;
    e.stopPropagation();
    const b = el.getBoundingClientRect(), l = Math.round(chart.timeScale().coordinateToLogical(e.clientX - b.left));
    const bar = disp[Math.max(0, Math.min(disp.length - 1, l))];
    stopPick();
    if (!bar) return;
    const i = raw.findIndex(x => x.time > bar.time);
    view.replay.cut = Math.max(30, i < 0 ? raw.length : i);
    refreshAll(); replayInfo();
  }, true);
  $('#bReplay').onclick = e => openMenu(e.currentTarget, `<div class="it" data-rp="pick"><span class="ic">✂</span><span class="grow">Replay od vybranej sviečky<br><small>klikni na sviečku, budúcnosť sa skryje</small></span></div>
    <div class="it" data-rp="now"><span class="ic">⏸</span><span class="grow">Zastaviť trh teraz<br><small>nové sviečky čakajú, pustíš ich ⏭ alebo ▶</small></span></div>
    ${view.replay ? '<div class="it" data-rp="exit"><span class="ic">✕</span><span class="grow">Ukončiť replay</span><span class="key">Alt+R</span></div>' : ''}
    <div class="sec">Klávesy v replay</div><div class="it muted" style="cursor:default">← → sviečka · medzerník prehrať / pauza</div>`,
    m => $$('[data-rp]', m).forEach(x => x.onclick = () => { closeMenu(); const a = x.dataset.rp; if (a === 'exit') exitReplay(); else startReplay(a === 'pick'); }), { side: side() });

  // ---- auto trendlines and levels (only drawn when switched on) + live trade ideas ----------------
  let tlR = null, tlKey = '', tlIdeas = [], tlSnap = null, autoLayer = null, ideaCtx = '', ideaSeenT = 0, ideaPos = null;
  const closedCount = () => (view.mode === 'live' && !view.replay ? disp.length - 1 : disp.length);
  const ideaOpts = () => ({ minTouches: S.ideas.minTouches || (META.minTouches || {}).line || 3, minLevel: S.ideas.minLevel || (META.minTouches || {}).level || 2,
                            rr: S.ideas.rr, minScore: S.ideas.minScore });
  const sliceD = (X, n) => Object.fromEntries(Object.entries(X).map(([k, v]) => [k, v.slice(0, n)]));
  function computeTL() {
    const n = closedCount();
    if (!(S.auto.on || S.ideas.on) || n < 60) { const had = !!tlR; tlR = null; tlIdeas = []; tlSnap = null; tlKey = ''; return had; }
    const k = S.auto.k || TL.zigK(S.tf, TF_SEC[S.tf]);
    const key = [S.symbol, S.tf, S.type, n, disp[0].time, disp[n - 1].time, k, JSON.stringify(ideaOpts()), S.ideas.on].join('|'), changed = key !== tlKey;
    if (changed) {
      tlKey = key;
      const Dc = n === D.t.length ? D : sliceD(D, n);
      tlR = TL.run(Dc, { k });
      tlIdeas = S.ideas.on ? TL.ideas(Dc, tlR, ideaOpts()) : [];
    }
    tlSnap = TL.snapshot(tlR, n - 1, disp[disp.length - 1].close);
    return changed;
  }
  function checkNewIdeas() {
    const ctx = `${S.symbol}|${S.tf}|${S.type}|${view.mode}|${view.id || ''}`, lastT = tlIdeas.length ? tlIdeas[tlIdeas.length - 1].time : 0;
    if (ideaCtx !== ctx) { ideaCtx = ctx; ideaSeenT = lastT; return; }
    if (lastT < ideaSeenT) { ideaSeenT = lastT; return; }       // replay stepped back
    const fresh = tlIdeas.filter(x => x.time > ideaSeenT);
    ideaSeenT = lastT;
    if (!fresh.length || !S.ideas.on || !S.ideas.notify) return;
    const x = fresh[fresh.length - 1];
    toast(`⚡ ${x.dir > 0 ? '🟢 LONG' : '🔴 SHORT'} ${sym().name} ${S.tf} · ${x.name} · ${'★'.repeat(x.score) || '☆'}`, 6000);
    if (S.ideas.sound) beep(x.dir);
  }
  let audio = null;
  function beep(dir) {
    try {
      audio = audio || new AudioContext();
      [0, 0.16].forEach((t, i) => { const o = audio.createOscillator(), g = audio.createGain(); o.frequency.value = dir > 0 ? 660 + i * 220 : 880 - i * 220;
        g.gain.setValueAtTime(0.0001, audio.currentTime + t); g.gain.exponentialRampToValueAtTime(0.15, audio.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + t + 0.14);
        o.connect(g).connect(audio.destination); o.start(audio.currentTime + t); o.stop(audio.currentTime + t + 0.15); });
    } catch (e) {}
  }
  class AutoLayer {
    attached(p) { this.p = p; } detached() { this.p = null; }
    update() { if (this.p) this.p.requestUpdate(); }
    updateAllViews() {}
    paneViews() { return [{ zOrder: () => 'normal', renderer: () => ({ draw: t => this.draw(t) }) }]; }
    draw(target) {
      if (!this.p || !S.auto.on || !tlR || hideL.auto) return;
      const A = S.auto, ts = this.p.chart.timeScale(), se = this.p.series, n = closedCount(), last = disp.length - 1 + A.ext, val = tlR.value;
      const X = i => ts.logicalToCoordinate(i), Y = p => se.priceToCoordinate(p);
      target.useMediaCoordinateSpace(({ context: ctx }) => {
        const pen = (st, fade, dash) => { ctx.strokeStyle = rgba(st.color, st.opacity * (fade ? 0.45 : 1)); ctx.lineWidth = st.width;
          ctx.setLineDash(dash || [[], [st.width, st.width * 2.5], [7, 5]][st.style] || []); };
        const seg = (i1, p1, i2, p2) => { const x1 = X(i1), y1 = Y(p1), x2 = X(i2), y2 = Y(p2); if ([x1, y1, x2, y2].some(v => v === null)) return null;
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); return [x2, y2]; };
        const label = (txt, x, y, color, up) => { if (!A.labels || x === null || y === null) return; ctx.font = '11px ' + fontCss(S.look.font); ctx.fillStyle = color; ctx.textAlign = 'right'; ctx.fillText(txt, x - 4, y + (up ? -5 : 13)); };
        if (A.lines) for (const ln of tlR.lines) {
          if (ln.created > n - 1) continue;
          const alive = ln.ended === null || ln.ended > n - 1;
          if (!alive && !(A.ended && ln.ended > n - 400)) continue;
          const st = ln.kind === 'sup' ? A.sup : A.res, to = alive ? last : ln.ended;
          pen(st, !alive);
          const endPt = seg(ln.i1, ln.p1, to, val(ln, to));
          if (A.channels && alive) { pen(st, true, [4, 4]); seg(ln.i1, ln.p1 + ln.offset, to, val(ln, to) + ln.offset); }
          if (A.touches && alive) { ctx.fillStyle = rgba(st.color, st.opacity); for (const ti of ln.touchIdx) { const x = X(ti), y = Y(val(ln, ti)); if (x !== null && y !== null) { ctx.beginPath(); ctx.arc(x, y, 2.5, 0, 7); ctx.fill(); } } }
          if (alive && endPt) label(`${ln.kind === 'sup' ? 'podpora' : 'rezistencia'} ${ln.touches}×`, endPt[0], endPt[1], rgba(st.color, st.opacity), ln.kind === 'res');
        }
        if (A.levels) for (const lv of tlR.levels) {
          if (lv.created > n - 1) continue;
          const alive = lv.ended === null || lv.ended > n - 1, touches = lv.touchConf.filter(c => c <= n - 1).length;
          if (touches < tlR.minLevel || (!alive && !(A.ended && lv.ended > n - 400))) continue;
          pen(A.lvl, !alive);
          const endPt = seg(lv.touchIdx[0], lv.price, alive ? last : lv.ended, lv.price);
          if (alive && endPt) label(`S/R ${touches}×`, endPt[0], endPt[1], rgba(A.lvl.color, A.lvl.opacity), true);
        }
        if (A.pivots) for (const p of tlR.pivots) {
          if (p.conf > n - 1) continue;
          const x = X(p.idx), y = Y(p.price); if (x === null || y === null) continue;
          ctx.fillStyle = p.kind === 'H' ? rgba(A.res.color, 90) : rgba(A.sup.color, 90);
          ctx.beginPath(); const d = p.kind === 'H' ? -1 : 1; ctx.moveTo(x, y + d * 4); ctx.lineTo(x - 4, y + d * 10); ctx.lineTo(x + 4, y + d * 10); ctx.fill();
        }
      });
    }
  }
  function autoMenu(anchor) {
    const A = S.auto, I = S.ideas;
    const cb = (path, on, label) => `<label class="it"><input type="checkbox" data-a="${path}" ${on ? 'checked' : ''}><span class="grow">${label}</span></label>`;
    const html = `<div class="it ${A.on ? 'on' : ''}" data-a-toggle><span class="ic">📐</span><span class="grow"><b>${A.on ? 'Auto čiary zapnuté' : 'Zapnúť auto čiary'}</b><br><small>rovnaké čiary ako skener, nikdy sa neprekresľujú</small></span><span class="key">Alt+A</span></div>
      <div class="sec">Čo kresliť</div>${cb('auto.lines', A.lines, 'Trendové čiary (podpora / rezistencia)')}${cb('auto.channels', A.channels, 'Rovnobežné kanály')}${cb('auto.levels', A.levels, 'Horizontálne S/R úrovne')}
      ${cb('auto.touches', A.touches, 'Body dotykov')}${cb('auto.labels', A.labels, 'Popisy (počet dotykov)')}${cb('auto.pivots', A.pivots, 'Swingy (ZigZag pivoty)')}${cb('auto.ended', A.ended, 'Aj ukončené (prerazené) čiary')}
      <div class="it" style="cursor:default"><span class="grow">Citlivosť ZigZag (× ATR)</span><select data-a="auto.k">${opts([['Ako skener', 0], ['1.0 · veľa čiar', 1], ['1.5', 1.5], ['2.0', 2], ['2.5', 2.5], ['3.0', 3], ['4.0 · málo čiar', 4]], A.k)}</select></div>
      <div class="it" data-a-style><span class="ic">🎨</span><span class="grow">Farby, hrúbka a štýl čiar…</span></div>
      <div class="sep"></div><div class="sec">⚡ Živé nápady (aj na sekundových grafoch)</div>
      ${cb('ideas.on', I.on, 'Hľadať vstupy pri každej uzavretej sviečke')}${cb('ideas.markers', I.markers, 'Šípky ⚡ v grafe')}${cb('ideas.history', I.history, 'Aj staršie nápady (spätný test)')}
      ${cb('ideas.notify', I.notify, 'Upozornenie pri novom nápade')}${cb('ideas.sound', I.sound, 'Zvuk')}
      <div class="it" style="cursor:default"><span class="grow">R:R cieľ</span><select data-a="ideas.rr">${opts([1, 1.5, 2, 2.5, 3, 4].map(v => ['1 : ' + v, v]), I.rr)}</select></div>
      <div class="it" style="cursor:default"><span class="grow">Min. potvrdení (RSI, MACD, VWAP, objem…)</span><select data-a="ideas.minScore">${opts([0, 1, 2, 3, 4].map(v => [v ? v + '+' : 'žiadne', v]), I.minScore)}</select></div>
      <div class="it" data-a-feed><span class="ic">💡</span><span class="grow">Zoznam nápadov a úspešnosť…</span></div>`;
    openMenu(anchor, html, m => {
      $('[data-a-toggle]', m).onclick = () => { toggleAuto(); closeMenu(); };
      $('[data-a-style]', m).onclick = () => { closeMenu(); autoStyle(); };
      $('[data-a-feed]', m).onclick = () => { closeMenu(); S.idea.tab = 'live'; toggleIdea(true); };
      $$('[data-a]', m).forEach(x => x.onchange = () => {
        const [o, k] = x.dataset.a.split('.'); S[o][k] = x.type === 'checkbox' ? x.checked : +x.value; save();
        tlKey = ''; computeTL(); ideaSeenT = tlIdeas.length ? tlIdeas[tlIdeas.length - 1].time : 0; autoLayer && autoLayer.update(); updateMarkers();
        if (S.idea.open && S.idea.tab === 'live') renderIdea();
      });
    }, { side: side(), cls: 'auto' });
  }
  function toggleAuto(on) {
    S.auto.on = on ?? !S.auto.on; save(); $('#bAuto').classList.toggle('on', S.auto.on);
    tlKey = ''; computeTL(); autoLayer && autoLayer.update(); updateMarkers();
    toast(S.auto.on ? '📐 Auto čiary zapnuté' : 'Auto čiary vypnuté');
  }
  function autoStyle() {
    const A = S.auto, before = JSON.stringify(A);
    const row = (k, n) => `<div class="fld"><span>${n}</span>${swatch(k, A[k].color, A[k].opacity)}</div>`;
    const d = openDialog(`<div class="dlg-h"><span>Auto čiary · štýl</span><button class="ib" data-x>✕</button></div><div class="dlg-b">
      ${row('sup', 'Podpora (trendová čiara pod cenou)')}${row('res', 'Rezistencia (nad cenou)')}${row('lvl', 'Horizontálne S/R úrovne')}
      <div class="fld"><span>Predĺženie doprava (sviečok)</span><input type="number" data-k="ext" value="${A.ext}" min="0" max="500"></div></div>
      <div class="dlg-f"><button class="btn" data-reset>Predvolené</button><span class="grow"></span><button class="btn" data-cancel>Zrušiť</button><button class="btn pri" data-x>OK</button></div>`,
      () => { S.auto = JSON.parse(before); save(); autoLayer && autoLayer.update(); closeDialog(); });
    $$('[data-sw]', d).forEach(b => b.onclick = () => colorPopover(b, A[b.dataset.sw], { width: true, style: true }, () => { save(); autoLayer && autoLayer.update(); }));
    $('[data-k=ext]', d).onchange = e => { A.ext = Math.max(0, Math.min(500, +e.target.value || 0)); save(); autoLayer && autoLayer.update(); };
    $('[data-reset]', d).onclick = () => { for (const k of ['sup', 'res', 'lvl']) A[k] = { ...DEF.auto[k] }; save(); autoLayer && autoLayer.update(); closeDialog(); autoStyle(); };
    $('[data-cancel]', d).onclick = UI.cancelDialog;
    $$('[data-x]', d).forEach(x => x.onclick = closeDialog);
  }
  $('#bAuto').onclick = e => autoMenu(e.currentTarget);

  // An idea on the chart: a temporary long/short position (entry, SL, TP).
  function showIdea(x) {
    if (ideaPos) draw.setList(currentDrawings());
    ideaPos = { ...DR.TOOLS.long.defaults, ...draw.styleOf('long'), id: 'idea', temp: true, locked: true, type: x.dir > 0 ? 'long' : 'short',
                pts: [{ t: x.time, p: x.entry }, { t: x.time + 25 * TF_SEC[S.tf], p: x.tp }, { t: x.time + 25 * TF_SEC[S.tf], p: x.sl }] };
    draw.setList(currentDrawings()); if (view.position) draw.add(view.position); draw.add(ideaPos);
    focusOn(x.time);
  }
  function clearIdeaPos() { if (!ideaPos) return; ideaPos = null; draw.setList(currentDrawings()); if (view.position) draw.add(view.position); }
  async function saveIdeaMark(x) {
    if (!S.labeler) { toast('Najprv vyplň svoje meno'); return; }
    const r = await fetch('api/marks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: S.symbol, timeframe: S.tf, bar_time: x.time * 1000,
      direction: x.dir > 0 ? 'bullish' : 'bearish', entry: x.entry, stop_loss: +x.sl.toFixed(sym().digits), take_profit: +x.tp.toFixed(sym().digits), labeler: S.labeler,
      note: `AUTO ${x.signals.join('+')} · ${x.conf.join(', ') || 'bez potvrdení'}${x.result === null ? '' : ` · výsledok ${x.result > 0 ? '+' : ''}${x.result}R`}` }) });
    toast(r.ok ? 'Nápad uložený pre tréning ✅' : 'Uloženie zlyhalo');
  }
  function liveTab() {
    const st = TL.stats(tlIdeas), near = (tlSnap && tlSnap.near) || [], last = tlIdeas.slice(-80).reverse();
    const pct = v => (v === null ? '–' : (100 * v).toFixed(0) + ' %');
    const res = x => (x.result === null ? '<span class="pill">⏳ otvorený</span>' : x.result > 0 ? `<span class="pill win">✓ +${x.result}R</span>` : '<span class="pill loss">✗ −1R</span>');
    return `<div class="muted" style="font-size:11px;margin-bottom:6px">${esc(sym().name)} · ${S.tf}${view.replay ? ' · <b style="color:#ffb74d">replay</b>' : ''} · nápady z trendových čiar a S/R úrovní skenera, potvrdené RSI, MACD, VWAP a objemom. Vyhodnotenie: čo zasiahne skôr, SL alebo TP.</div>
      ${S.ideas.on ? '' : '<div class="fld"><span>Živé nápady sú vypnuté</span><button class="btn sm" data-lv="on">Zapnúť</button></div>'}
      <div class="stats"><div><b>${st.n}</b><small>nápadov</small></div><div><b>${pct(st.win)}</b><small>úspešnosť</small></div><div><b>${st.avgR === null ? '–' : (st.avgR >= 0 ? '+' : '') + st.avgR.toFixed(2) + 'R'}</b><small>priemer</small></div><div><b>${st.open}</b><small>otvorené</small></div></div>
      <div class="fld"><span>R:R</span><select class="sm" data-li="rr">${opts([1, 1.5, 2, 2.5, 3, 4].map(v => ['1:' + v, v]), S.ideas.rr)}</select><span>Potvrdení</span><select class="sm" data-li="minScore">${opts([0, 1, 2, 3, 4].map(v => [v + '+', v]), S.ideas.minScore)}</select></div>
      ${near.length ? `<div class="step">👀 Cena je práve pri čiare</div>${near.map(q => `<div class="idea-row"><span class="pill ${q.kind === 'sup' ? 'win' : 'loss'}">${q.kind === 'sup' ? 'podpora' : 'rezistencia'}</span> ${q.what === 'line' ? 'trendová čiara' : 'úroveň'} ${fmt(q.value)} · ${q.touches}× · ${Math.abs(q.dist).toFixed(2)} ATR</div>`).join('')}` : ''}
      <div class="step">⚡ Nápady (najnovšie hore)</div>
      ${last.length ? last.map((x, k) => `<div class="idea-row" data-li-n="${tlIdeas.length - 1 - k}"><div class="ir-top"><span class="pill ${x.dir > 0 ? 'win' : 'loss'}">${x.dir > 0 ? 'LONG' : 'SHORT'}</span>
        <b>${esc(x.name)}</b><span class="grow"></span>${res(x)}</div><div class="ir-sub">${esc(fmtTime(x.time))} · vstup ${fmt(x.entry)} · SL ${fmt(x.sl)} · TP ${fmt(x.tp)} · ${'★'.repeat(x.score) || '☆'}</div>
        <div class="ir-sub muted">${esc(x.conf.join(' · ') || 'bez potvrdení')}</div><div class="ir-btn"><button class="btn sm" data-li-show>🎯 Ukázať</button><button class="btn sm" data-li-save>💾 Uložiť pre tréning</button></div></div>`).join('')
        : `<div class="muted">${S.ideas.on ? 'Zatiaľ žiadny nápad. Skús menej potvrdení, citlivejší ZigZag (📐 Auto čiary) alebo viac sviečok.' : ''}</div>`}`;
  }
  function bindLive(body) {
    $$('[data-lv=on]', body).forEach(b => b.onclick = () => { S.ideas.on = true; save(); tlKey = ''; computeTL(); updateMarkers(); renderIdea(); });
    $$('[data-li]', body).forEach(x => x.onchange = () => { S.ideas[x.dataset.li] = +x.value; save(); tlKey = ''; computeTL(); ideaSeenT = tlIdeas.length ? tlIdeas[tlIdeas.length - 1].time : 0; updateMarkers(); renderIdea(); });
    $$('[data-li-n]', body).forEach(row => {
      const x = tlIdeas[+row.dataset.liN];
      $('[data-li-show]', row).onclick = () => showIdea(x);
      $('[data-li-save]', row).onclick = () => saveIdeaMark(x);
    });
  }

  // ---- market scan: fresh ideas and price at a line, over symbols and timeframes --------------------
  let scanRes = [], scanBusy = false, scanTimer = null, scanSeen = new Set();
  async function runScan(quiet) {
    if (scanBusy) return; scanBusy = true;
    const C = S.scan, jobs = [];
    for (const s of C.symbols) for (const tf of C.tfs) jobs.push([s, tf]);
    const out = [], total = jobs.length;
    let done = 0;
    const prog = () => { const p = $('#scanProg'); if (p) p.textContent = done < total ? `skenujem ${done}/${total}…` : `hotovo · ${total} grafov`; };
    prog();
    const worker = async () => {
      while (jobs.length) {
        const [s, tf] = jobs.shift();
        try {
          const bars = await fetchBars(s, tf, null, 1000), closed = bars.slice(0, -1);
          if (closed.length > 80) {
            const Dx = { t: closed.map(b => b.time), o: closed.map(b => b.open), h: closed.map(b => b.high), l: closed.map(b => b.low), c: closed.map(b => b.close), v: closed.map(b => b.volume || 0) };
            Dx.s = Dx.t.map(t => (SYM[s] && SYM[s].hours === 'gold' ? sessGold(t) : Math.floor(t / 86400)));
            const R = TL.run(Dx, { k: TL.zigK(tf, TF_SEC[tf]) }), ideas = TL.ideas(Dx, R, { ...ideaOpts(), minScore: C.minScore });
            const n = closed.length, live = bars[bars.length - 1];
            for (const x of ideas) if (x.i >= n - C.fresh) out.push({ kind: 'idea', symbol: s, tf, ...x, ago: n - 1 - x.i, now: live.close });
            if (C.near) for (const q of TL.snapshot(R, n - 1, live.close).near) out.push({ kind: 'near', symbol: s, tf, dir: q.kind === 'sup' ? 1 : -1, time: live.time, name: TL.NAMES[q.kind === 'sup' ? 'NEAR_SUP' : 'NEAR_RES'], ...q, entry: live.close, now: live.close, score: 0, conf: [] });
          }
        } catch (e) { out.push({ kind: 'err', symbol: s, tf, name: String(e.message || e) }); }
        done++; prog();
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    scanRes = out.sort((a, b) => (a.kind === 'idea') === (b.kind === 'idea') ? (b.score - a.score) || (a.ago ?? 0) - (b.ago ?? 0) : a.kind === 'idea' ? -1 : 1);
    scanBusy = false;
    const fresh = scanRes.filter(x => x.kind === 'idea' && !scanSeen.has(`${x.symbol}${x.tf}${x.time}${x.dir}`));
    scanRes.forEach(x => x.kind === 'idea' && scanSeen.add(`${x.symbol}${x.tf}${x.time}${x.dir}`));
    if (quiet && fresh.length) { toast(`🔍 Skener: ${fresh.length} nový${fresh.length > 1 ? 'ch' : ''} nápad${fresh.length > 1 ? 'ov' : ''} · ${fresh[0].symbol} ${fresh[0].tf} ${fresh[0].dir > 0 ? 'LONG' : 'SHORT'}`, 6000); if (S.ideas.sound) beep(fresh[0].dir); }
    $('#bScan').classList.toggle('badge-on', fresh.length > 0 && quiet);
    if (dialogOpen() && $('#scanBox')) paintScanResults();
  }
  // session id for VWAP of a symbol that is not the current one
  function sessGold(t) { const hb = Math.floor(t / 3600); return +chiFmt.format(new Date((hb * 3600 + 7 * 3600) * 1000)).replace(/-/g, ''); }
  function paintScanResults() {
    const box = $('#scanBox'); if (!box) return;
    const dg = s => (SYM[s] ? SYM[s].digits : 2), f2 = (v, s) => (Number.isFinite(v) ? (+v).toFixed(dg(s)) : '–');
    box.innerHTML = scanRes.length ? `<table class="scan"><tr><th>Symbol</th><th>TF</th><th>Smer</th><th>Signál</th><th>Vstup</th><th>SL</th><th>TP</th><th>Potvrdenia</th><th>Kedy</th></tr>
      ${scanRes.map((x, i) => x.kind === 'err' ? `<tr><td>${esc(x.symbol)}</td><td>${x.tf}</td><td colspan="7" class="muted">chyba: ${esc(x.name)}</td></tr>` :
        `<tr data-sr="${i}" class="${x.kind}"><td>${esc((SYM[x.symbol] || {}).name || x.symbol)}</td><td>${x.tf}</td><td><span class="pill ${x.dir > 0 ? 'win' : 'loss'}">${x.dir > 0 ? 'LONG' : 'SHORT'}</span></td>
        <td>${x.kind === 'near' ? '👀 ' : '⚡ '}${esc(x.name)}${x.touches ? ` <small class="muted">${x.touches}×</small>` : ''}</td><td>${f2(x.entry, x.symbol)}</td><td>${x.kind === 'idea' ? f2(x.sl, x.symbol) : '–'}</td><td>${x.kind === 'idea' ? f2(x.tp, x.symbol) : '–'}</td>
        <td title="${esc(x.conf.join(', '))}">${x.kind === 'idea' ? '★'.repeat(x.score) || '☆' : ''}</td><td>${x.kind === 'idea' ? (x.ago ? `pred ${x.ago} sv.` : 'teraz') : 'teraz'}</td></tr>`).join('')}</table>`
      : '<div class="muted" style="padding:10px 0">Nič čerstvé. Skús viac timeframov, dlhšie okno alebo menej potvrdení.</div>';
    $$('[data-sr]', box).forEach(tr => tr.onclick = () => { const x = scanRes[+tr.dataset.sr]; closeDialog(); jumpTo(x.symbol, x.tf, x.time, x.kind === 'idea' ? x : null); });
  }
  async function jumpTo(symbol, tf, time, idea) {
    Object.assign(S, { symbol, tf }); save(); applyToolbar(); exitReplay();
    view = { mode: 'live', focus: time }; alertMark = null; ideaPos = null;
    await load();
    if (idea) { const x = tlIdeas.find(y => y.time === idea.time && y.dir === idea.dir) || idea; showIdea(x); }
  }
  function scanDialog() {
    const C = S.scan;
    const d = openDialog(`<div class="dlg-h"><span>🔍 Skenovať trh</span><button class="ib" data-x>✕</button></div><div class="dlg-b">
      <div class="muted" style="margin-bottom:6px">Hľadá vstupy podľa auto trendových čiar a S/R úrovní (rovnaký algoritmus ako skener), potvrdené RSI, MACD, VWAP a objemom.</div>
      <div class="fld"><span>Symboly</span><span class="ctl">${META.symbols.map(x => `<label class="ctl"><input type="checkbox" data-ss="${x.id}" ${C.symbols.includes(x.id) ? 'checked' : ''}>${esc(x.name)}</label>`).join('')}</span></div>
      <div class="fld" style="align-items:flex-start"><span>Timeframy</span><span class="ctl" style="flex-wrap:wrap;justify-content:flex-end;max-width:420px">${KS.TIMEFRAMES.map(tf => `<label class="ctl"><input type="checkbox" data-st="${tf}" ${C.tfs.includes(tf) ? 'checked' : ''}>${tf}</label>`).join('')}</span></div>
      <div class="fld"><span>Čerstvé = signál v posledných</span><select data-sc="fresh">${opts([1, 2, 3, 5, 10, 20].map(v => [v + ' sviečkach', v]), C.fresh)}</select></div>
      <div class="fld"><span>Min. potvrdení</span><select data-sc="minScore">${opts([0, 1, 2, 3, 4].map(v => [v + '+', v]), C.minScore)}</select></div>
      <div class="fld"><label class="ctl"><input type="checkbox" data-sc="near" ${C.near ? 'checked' : ''}> Aj „cena je pri čiare“ (možný vstup, čakaj na reakciu)</label></div>
      <div class="fld"><span>Skenovať automaticky</span><select data-sc="every">${opts([['Nie', 0], ['každú minútu', 60], ['každých 5 min', 300], ['každých 15 min', 900]], C.every)}</select></div>
      <div class="fld"><button class="btn pri" data-run>🔍 Skenovať teraz</button><span id="scanProg" class="muted">${scanRes.length ? `${scanRes.filter(x => x.kind === 'idea').length} nápadov · ${scanRes.filter(x => x.kind === 'near').length} pri čiare` : ''}</span></div>
      <div id="scanBox"></div><div class="muted" style="font-size:11px;margin-top:6px">Klik na riadok otvorí symbol a timeframe so zakreslenou pozíciou. Sekundové timeframy sú pomalšie (stavajú sa z obchodov).</div></div>`, null, 'wide scan-dlg');
    $$('[data-ss]', d).forEach(x => x.onchange = () => { C.symbols = META.symbols.map(y => y.id).filter(id => (id === x.dataset.ss ? x.checked : C.symbols.includes(id))); save(); });
    $$('[data-st]', d).forEach(x => x.onchange = () => { C.tfs = KS.TIMEFRAMES.filter(tf => (tf === x.dataset.st ? x.checked : C.tfs.includes(tf))); save(); });
    $$('[data-sc]', d).forEach(x => x.onchange = () => { C[x.dataset.sc] = x.type === 'checkbox' ? x.checked : +x.value; save(); if (x.dataset.sc === 'every') scheduleScan(); });
    $('[data-run]', d).onclick = () => runScan(false);
    $$('[data-x]', d).forEach(x => x.onclick = closeDialog);
    $('#bScan').classList.remove('badge-on');
    paintScanResults();
    if (!scanRes.length && !scanBusy) runScan(false);
  }
  function scheduleScan() { clearInterval(scanTimer); scanTimer = S.scan.every ? setInterval(() => runScan(true), S.scan.every * 1000) : null; }
  $('#bScan').onclick = scanDialog;

  // ---- chat: notes for the developers and trading ideas -------------------------------------------
  const chatEl = $('#chatWin');
  const KINDS = { msg: ['💬', 'Správa', '#5b9cf6'], dev: ['🛠', 'Pre vývojárov', '#b388ff'], idea: ['💡', 'Obchodný nápad', '#ffca28'],
                  bug: ['🐞', 'Chyba', '#ff5252'], ai: ['🤖', 'Opýtať sa Clauda', '#26c6da'] };
  const EMOJI = {
    '😀': '😀😃😄😁😆😅😂🤣😊🙂😉😍🥰😎🤓🤔🤨😐😶🙄😏😴😬😮😲😱🤯😤😡🤬😭😢🥲😇🥳🤩🤗🫡🤝',
    '👍': '👍👎👌✌️🤞🤟👏🙌👐💪🙏👀👋✋☝️👆👇👉👈🫵✍️',
    '📈': '📈📉📊💹💰💵💶💸🪙💎🏦🚀🌙🔥⚡🎯🐂🐻🦬⏰⌛⚠️🛑✅❌🔔🔕📌📎📝🧠💡🔍🛠🐞🧪🔒🔓',
    '❤️': '❤️🧡💛💚💙💜🖤🤍💔⭐🌟✨💯❗❓‼️⁉️🆗🆕🆒🔝➕➖✖️',
    '🏔': '☀️🌤⛅🌧⛈❄️☃️⛄🌨🏔⛰🌲🌳🍂🍁🌸🌷🌻🌊🌈🌙🌍',
  };
  let chatMsgs = [], chatLast = 0, chatPollT = null, emoTab = '😀', askBusy = false;
  const author = () => S.labeler || '';
  const hue = n => [...n].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  function chatHtml() {
    const F = S.chat.filter, fold = F.startsWith('f:') ? (S.folders || []).find(f => 'f:' + f.id === F) : null;
    const list = fold ? fold.items : chatMsgs.filter(m => F === 'all' || m.kind === F);
    const inFolders = m => (S.folders || []).filter(f => f.items.some(x => x.id === m.id));
    return list.length ? list.map(m => { const K = KINDS[m.kind] || KINDS.msg, fs2 = inFolders(m); return `<div class="msg ${m.author.toLowerCase() === author().toLowerCase() ? 'me' : ''} ${m.author === 'Claude' ? 'ai' : ''}" data-id="${m.id}" style="--kc:${K[2]}">
      <div class="mh"><b style="color:${m.author === 'Claude' ? K[2] : `hsl(${hue(m.author.toLowerCase())} 70% 65%)`}">${m.author === 'Claude' ? '🤖 ' : ''}${esc(m.author)}</b><span class="kchip">${K[0]} ${K[1]}</span>
      ${fs2.map(f => `<span class="fchip" style="--fc:${f.color}" title="V priečinku">📁 ${esc(f.name)}</span>`).join('')}<span class="grow"></span>
      <span class="muted">${esc(fmtChatTime(m.created_at))}</span><button class="ib" data-fold title="Uložiť do priečinka">📁</button>${fold ? '<button class="ib" data-unfold title="Odstrániť z tohto priečinka">✕</button>' : m.author.toLowerCase() === author().toLowerCase() ? '<button class="ib" data-del title="Zmazať">🗑</button>' : ''}</div>
      <div class="mt">${esc(m.text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\n/g, '<br>')}</div>
      ${m.symbol && m.author !== 'Claude' ? `<button class="att" data-att>📎 ${esc((SYM[m.symbol] || {}).name || m.symbol)} ${m.timeframe || ''}${m.bar_time ? ' · ' + esc(fmtTime(m.bar_time)) : ''}${m.price ? ' · ' + (+m.price).toFixed((SYM[m.symbol] || {}).digits ?? 2) : ''}</button>` : ''}</div>`; }).join('') + (askBusy ? '<div class="msg ai thinking" style="--kc:#26c6da"><div class="mt">🤖 Claude premýšľa…</div></div>' : '')
      : (fold ? '<div class="muted" style="padding:10px">Priečinok je prázdny. Správu doň pridáš tlačidlom 📁 pri správe.</div>' : '<div class="muted" style="padding:10px">Zatiaľ tu nič nie je. Napíš poznámku pre vývojárov, obchodný nápad alebo sa opýtaj Clauda (🤖).</div>');
  }
  const fmtChatTime = iso => { const t = Date.parse(iso); return Number.isFinite(t) ? tzf({ day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(t)) : ''; };
  function renderChat() {
    const C = S.chat;
    $('#chatBody').innerHTML = `<div id="chatList">${chatHtml()}</div>`;
    $('#chatFoot').innerHTML = `${author() ? '' : '<input class="idea-in" id="chatName" placeholder="Tvoje meno (zobrazí sa pri správach)" style="margin-bottom:6px">'}
      <div class="segbtn sm">${Object.entries(KINDS).map(([k, [ic, n]]) => `<button data-ck="${k}" class="${C.kind === k ? 'on' : ''}" title="${n}">${ic} ${n}</button>`).join('')}</div>
      <div class="chat-in"><textarea id="chatText" rows="2" placeholder="Správa… (Enter = odoslať, Shift+Enter = nový riadok)"></textarea>
      <div class="chat-btns"><button class="ib" id="emoBtn" title="Emoji">😊</button><button class="ib ${C.attach ? 'on' : ''}" id="attBtn" title="Priložiť aktuálny graf (symbol, TF, sviečka pod kurzorom)">📎</button>
      <button class="btn pri sm" id="chatSend">➤</button></div></div><div id="emoPanel"></div>`;
    renderChatFilter();
    const list = $('#chatList'); list.scrollTop = list.scrollHeight;
    $$('[data-ck]').forEach(b => b.onclick = () => { C.kind = b.dataset.ck; save(); $$('[data-ck]').forEach(x => x.classList.toggle('on', x === b)); });
    const ta = $('#chatText');
    ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } };
    $('#chatSend').onclick = sendChat;
    $('#attBtn').onclick = e => { C.attach = !C.attach; save(); e.currentTarget.classList.toggle('on', C.attach); toast(C.attach ? '📎 Priloží sa ' + sym().name + ' ' + S.tf : 'Bez prílohy'); };
    $('#emoBtn').onclick = () => { const p = $('#emoPanel'); p.classList.toggle('open'); if (p.classList.contains('open')) paintEmoji(); };
    const nm = $('#chatName'); if (nm) nm.onchange = () => { S.labeler = nm.value.trim(); save(); renderChat(); };
    bindChatList();
  }
  function paintEmoji() {
    const p = $('#emoPanel');
    p.innerHTML = `<div class="emo-tabs">${Object.keys(EMOJI).map(k => `<span data-et="${k}" class="${k === emoTab ? 'on' : ''}">${k}</span>`).join('')}</div>
      <div class="emo-grid">${[...new Intl.Segmenter().segment(EMOJI[emoTab])].map(x => `<span data-e="${x.segment}">${x.segment}</span>`).join('')}</div>`;
    $$('[data-et]', p).forEach(x => x.onclick = () => { emoTab = x.dataset.et; paintEmoji(); });
    $$('[data-e]', p).forEach(x => x.onclick = () => {
      const ta = $('#chatText'), a = ta.selectionStart ?? ta.value.length, b = ta.selectionEnd ?? a;
      ta.value = ta.value.slice(0, a) + x.dataset.e + ta.value.slice(b); ta.focus(); ta.selectionStart = ta.selectionEnd = a + x.dataset.e.length;
    });
  }
  function bindChatList() {
    $$('#chatList .msg').forEach(div => {
      const F = S.chat.filter, fold = F.startsWith('f:') ? (S.folders || []).find(f => 'f:' + f.id === F) : null;
      const m = (fold ? fold.items : chatMsgs).find(x => x.id === +div.dataset.id); if (!m) return;
      const fb = $('[data-fold]', div); if (fb) fb.onclick = e => folderMenu(e.currentTarget, m);
      const uf = $('[data-unfold]', div); if (uf) uf.onclick = () => { fold.items = fold.items.filter(x => x.id !== m.id); save(); renderChatList(); };
      const del = $('[data-del]', div); if (del) del.onclick = async () => {
        const r = await fetch(`api/chat/${m.id}?author=${encodeURIComponent(author())}`, { method: 'DELETE' });
        if (r.ok) { chatMsgs = chatMsgs.filter(x => x !== m); renderChatList(); } else toast('Zmazať sa nepodarilo');
      };
      const att = $('[data-att]', div); if (att) att.onclick = () => jumpTo(m.symbol, m.timeframe || S.tf, m.bar_time, null);
    });
  }
  // ---- chat folders: copies of messages (they stay even if the message is deleted), synced with your settings ----
  const FOLDER_COLORS = ['#5b9cf6', '#ffca28', '#26c6da', '#b388ff', '#ff7043', '#66bb6a', '#f06292', '#bdbdbd'];
  function newFolder(name) {
    S.folders = S.folders || [];
    const f = { id: Date.now().toString(36), name: name.slice(0, 40), color: FOLDER_COLORS[S.folders.length % FOLDER_COLORS.length], items: [], created: Date.now() };
    S.folders.push(f); save(); return f;
  }
  function toggleInFolder(f, m) {
    if (f.items.some(x => x.id === m.id)) f.items = f.items.filter(x => x.id !== m.id);
    else f.items.push({ id: m.id, author: m.author, kind: m.kind, text: m.text, created_at: m.created_at, symbol: m.symbol, timeframe: m.timeframe, bar_time: m.bar_time, price: m.price });
    save();
  }
  function folderMenu(anchor, m) {
    const paint = menu => {
      menu.innerHTML = `<div class="sec">Uložiť do priečinka</div>${(S.folders || []).map(f => `<div class="it" data-f="${f.id}"><span class="ic" style="color:${f.color}">${f.items.some(x => x.id === m.id) ? '☑' : '☐'}</span><span class="grow">📁 ${esc(f.name)}</span><small>${f.items.length}</small></div>`).join('')}
        <div class="sep"></div><div class="row" style="display:flex;gap:4px;padding:4px 10px"><input class="idea-in" placeholder="Nový priečinok…" data-nf style="flex:1"><button class="btn sm pri" data-nfa>➕</button></div>`;
      $$('[data-f]', menu).forEach(x => x.onclick = () => { toggleInFolder(S.folders.find(f => f.id === x.dataset.f), m); paint(menu); renderChatList(); renderChatFilter(); });
      const add = () => { const v = $('[data-nf]', menu).value.trim(); if (!v) return; toggleInFolder(newFolder(v), m); paint(menu); renderChatList(); renderChatFilter(); };
      $('[data-nfa]', menu).onclick = add; $('[data-nf]', menu).onkeydown = e => { if (e.key === 'Enter') add(); };
    };
    const menu = openMenu(anchor, '', paint, { cls: 'fold-menu' });
    if (menu) UI.place(menu, anchor);
  }
  function renderChatFilter() {
    const sel = $('#chatFilter'); if (!sel) return;
    sel.innerHTML = `<option value="all">Všetko</option>${Object.entries(KINDS).map(([k, [ic, n]]) => `<option value="${k}">${ic} ${n}</option>`).join('')}
      ${(S.folders || []).length ? `<optgroup label="Priečinky">${S.folders.map(f => `<option value="f:${f.id}">📁 ${esc(f.name)} (${f.items.length})</option>`).join('')}</optgroup>` : ''}`;
    if (![...sel.options].some(o => o.value === S.chat.filter)) S.chat.filter = 'all';
    sel.value = S.chat.filter;
  }
  function renderChatList() { const l = $('#chatList'); if (!l) return; const atEnd = l.scrollHeight - l.scrollTop - l.clientHeight < 40; l.innerHTML = chatHtml(); if (atEnd) l.scrollTop = l.scrollHeight; bindChatList(); }
  let crossTime = null;
  async function sendChat() {
    const ta = $('#chatText'), text = ta.value.trim();
    if (!text) return;
    if (!author()) { toast('Najprv napíš svoje meno'); $('#chatName') && $('#chatName').focus(); return; }
    const C = S.chat, bar = disp.find(b => b.time === crossTime) || disp[disp.length - 1];
    if (C.kind === 'ai') return askClaude(text);
    const body = { author: author(), kind: C.kind, text, ...(C.attach && bar ? { symbol: S.symbol, timeframe: S.tf, bar_time: bar.time, price: bar.close } : {}) };
    const r = await fetch('api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { toast('Odoslanie zlyhalo'); return; }
    ta.value = ''; $('#emoPanel').classList.remove('open');
    await pollChat();
  }
  // Questions for Claude: the server adds the last 80 candles of the open chart and answers as "Claude" in the chat.
  async function askClaude(text) {
    if (askBusy) { toast('Claude ešte odpovedá na predchádzajúcu otázku'); return; }
    const ta = $('#chatText'); ta.value = ''; $('#emoPanel').classList.remove('open');
    askBusy = true;
    chatMsgs.push({ id: -Date.now(), author: author(), kind: 'ai', text, created_at: new Date().toISOString() }); renderChatList();
    try {
      const r = await fetch('api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ author: author(), text, symbol: S.symbol, timeframe: S.tf }) });
      if (!r.ok) { const e = await r.json().catch(() => ({})); toast(`🤖 ${e.detail || 'Claude teraz neodpovedá'}`, 5000); ta.value = text; }
    } catch (e) { toast('🤖 Spojenie zlyhalo'); ta.value = text; }
    askBusy = false; chatMsgs = chatMsgs.filter(m => m.id > 0);
    await pollChat();
    renderChatList();
  }
  async function pollChat(full) {
    try {
      const r = await (await fetch(`api/chat?after=${full ? 0 : chatLast}`)).json();
      if (full) chatMsgs = r; else chatMsgs.push(...r);
      if (r.length) chatLast = r[r.length - 1].id;
      if (S.chat.open && (r.length || full)) renderChatList();
      if (r.length) NEXUS.refresh();
    } catch (e) {}
    const seen = LS.get('nx-chat-seen', 0), unread = S.chat.open ? 0 : chatMsgs.filter(m => m.id > seen && m.author.toLowerCase() !== author().toLowerCase()).length;
    if (S.chat.open && chatLast) LS.set('nx-chat-seen', chatLast);
    $('#chatBadge').textContent = unread ? (unread > 99 ? '99+' : unread) : '';
    clearTimeout(chatPollT); chatPollT = setTimeout(() => pollChat(), S.chat.open ? 3000 : 20000);
  }
  function toggleChat(open) {
    S.chat.open = open ?? !S.chat.open; save();
    chatEl.classList.toggle('open', S.chat.open); $('#bChat').classList.toggle('on', S.chat.open);
    if (S.chat.open) { placeWin(chatEl, S.chat); renderChat(); pollChat(true); }
  }
  $('#bChat').onclick = () => toggleChat();
  $('#chatClose').onclick = () => toggleChat(false);
  $('#chatMin').onclick = () => chatEl.classList.toggle('min');
  $('#chatFilter').onchange = e => { S.chat.filter = e.target.value; save(); renderChatList(); };
  // floating windows (idea, chat, news): drag by the header, resize from any edge or corner, A− / A+ text size,
  // maximise; position, size and zoom are remembered
  function placeWin(w, st) {
    w.classList.toggle('max', !!st.max);
    const zoom = st.zoom && st.zoom !== 100 ? st.zoom / 100 : '';
    [...w.children].forEach(c => { if (c.tagName !== 'HEADER' && !c.classList.contains('rz')) c.style.zoom = zoom; });
    if (st.x !== null && st.x !== undefined) { w.style.left = Math.max(0, Math.min(innerWidth - 80, st.x)) + 'px'; w.style.top = Math.max(0, Math.min(innerHeight - 40, st.y)) + 'px'; w.style.right = 'auto'; w.style.bottom = 'auto'; }
    if (st.w) { w.style.width = Math.min(st.w, innerWidth) + 'px'; w.style.height = Math.min(st.h, innerHeight) + 'px'; w.style.maxHeight = 'none'; }
  }
  function dragWin(w, head, st) {
    let d = null;
    head.addEventListener('pointerdown', e => { if (e.target.closest('button, select, input') || st.max) return; const r = w.getBoundingClientRect(); d = { x: e.clientX - r.left, y: e.clientY - r.top }; e.preventDefault(); });
    window.addEventListener('pointermove', e => { if (!d) return; st.x = e.clientX - d.x; st.y = e.clientY - d.y; placeWin(w, st); });
    window.addEventListener('pointerup', () => { if (d) { d = null; save(); } });
    head.addEventListener('dblclick', e => { if (!e.target.closest('button, select, input')) { st.max = !st.max; placeWin(w, st); save(); } });
    UI.edges(w, r => { Object.assign(st, r); placeWin(w, st); }, save);
    const tools = document.createElement('span');
    tools.className = 'dlg-tools';
    tools.innerHTML = '<button class="ib" data-z="-" title="Zmenšiť písmo">A−</button><button class="ib" data-z="+" title="Zväčšiť písmo">A+</button><button class="ib" data-z="max" title="Maximalizovať / obnoviť (dvojklik na hlavičku)">⤢</button><button class="ib" data-z="reset" title="Pôvodná veľkosť a poloha">↺</button>';
    head.insertBefore(tools, head.querySelector('.grow') ? head.querySelector('.grow').nextSibling : null);
    tools.addEventListener('click', e => {
      const z = e.target.dataset.z; if (!z) return;
      if (z === '+' || z === '-') st.zoom = Math.max(70, Math.min(180, (st.zoom || 100) + (z === '+' ? 10 : -10)));
      else if (z === 'max') st.max = !st.max;
      else { st.x = st.y = st.w = st.h = null; st.zoom = 100; st.max = false; w.style.cssText = ''; }
      placeWin(w, st); save();
    });
  }
  dragWin(chatEl, $('#chatHead'), S.chat);

  // ---- volume: bubbles of buyers vs sellers, delta / CVD indicators, the live tape -----------------------
  const flowEl = $('#flowWin');
  dragWin(flowEl, $('#flowHead'), S.flow);
  FLOW.onToggle = on => { $('#bFlow').classList.toggle('on', on || S.bubbles.on); S.flow.open = on; save(); if (on) placeWin(flowEl, S.flow); };
  const BUBBLE_GROUPS = [['Každá sviečka', 0], ['1 min', 60], ['5 min', 300], ['15 min', 900], ['1 hodina', 3600], ['4 hodiny', 14400], ['1 deň', 86400]];
  function addStudy(type) {
    if (studies.some(s => s.type === type)) { toast(`${KS.STUDIES[type].name} už v grafe je`); return; }
    studies.push(KS.normalize({ type, visible: true })); studiesChanged(); toast(`Pridané: ${KS.STUDIES[type].name}`);
  }
  function flowMenu(anchor) {
    const B = S.bubbles, rng = (k, min, max, unit) => `<span class="op" style="padding:0 12px 6px"><input type="range" min="${min}" max="${max}" data-bb="${k}" value="${B[k]}"><b style="min-width:44px">${B[k]} ${unit}</b></span>`;
    const html = () => `<div class="sec">🫧 Objemové bubliny</div>
      <label class="it"><input type="checkbox" data-bon ${B.on ? 'checked' : ''}><span class="grow">Zobraziť bubliny v grafe<br><small>veľkosť = objem, zelená časť = kupujúci, červená = predávajúci</small></span></label>
      <div class="lbl" style="padding:0 12px">Jedna bublina za</div><div class="tchips" style="grid-template-columns:repeat(4,1fr)">${BUBBLE_GROUPS.filter(([, s]) => !s || s > TF_SEC[S.tf]).map(([n, s]) => `<span data-bg2="${s}" class="${+B.group === s ? 'on' : ''}">${n}</span>`).join('')}</div>
      <div class="lbl" style="padding:0 12px">Iba najväčšie (skryť menších ako percentil)</div>${rng('minPct', 0, 98, '%')}
      <div class="lbl" style="padding:0 12px">Veľkosť bublín</div>${rng('scale', 30, 300, '%')}
      <div class="lbl" style="padding:0 12px">Krytie</div>${rng('opacity', 15, 100, '%')}
      <div class="tchips" style="grid-template-columns:1fr 1fr"><span data-bst="pie" class="${B.style === 'pie' ? 'on' : ''}">◔ Koláč kupujúci/predávajúci</span><span data-bst="delta" class="${B.style === 'delta' ? 'on' : ''}">● Farba podľa delty</span></div>
      <label class="it"><input type="checkbox" data-blab ${B.labels ? 'checked' : ''}><span class="grow">Čísla delty vo veľkých bublinách</span></label>
      <div class="sep"></div><div class="sec">Indikátory a tok</div>
      <div class="it" data-fa="delta"><span class="ic">▮</span><span class="grow">Pridať Deltu (kupujúci − predávajúci)</span></div>
      <div class="it" data-fa="cvd"><span class="ic">〰</span><span class="grow">Pridať kumulatívnu deltu (CVD)</span></div>
      <div class="it" data-fa="tape"><span class="ic">🌊</span><span class="grow">${FLOW.isOpen() ? 'Zavrieť' : 'Otvoriť'} tok obchodov (páska, loty, veľké obchody)</span></div>
      <div class="it" data-fa="help"><span class="ic">❓</span><span class="grow">Čo je objem, delta a tok príkazov?</span></div>`;
    const bind = m => {
      const redraw = () => { save(); bubbles && bubbles.update(); $('#bFlow').classList.toggle('on', B.on || FLOW.isOpen()); };
      $('[data-bon]', m).onchange = e => { B.on = e.target.checked; redraw(); };
      $('[data-blab]', m).onchange = e => { B.labels = e.target.checked; redraw(); };
      $$('[data-bb]', m).forEach(x => x.oninput = () => { B[x.dataset.bb] = +x.value; x.nextElementSibling.textContent = `${x.value} %`; redraw(); });
      $$('[data-bg2]', m).forEach(x => x.onclick = () => { B.group = +x.dataset.bg2; B.on = true; redraw(); m.innerHTML = html(); bind(m); });
      $$('[data-bst]', m).forEach(x => x.onclick = () => { B.style = x.dataset.bst; B.on = true; redraw(); m.innerHTML = html(); bind(m); });
      $$('[data-fa]', m).forEach(x => x.onclick = () => {
        closeMenu();
        const a = x.dataset.fa;
        if (a === 'tape') { if (FLOW.isOpen()) FLOW.close(); else FLOW.open({ id: S.symbol, ...sym() }); }
        else if (a === 'help') { LIB.open(); LIB.show('tips', 'orderflow'); }
        else addStudy(a);
      });
    };
    openMenu(anchor, html(), bind, { side: side(), cls: 'flow-menu' });
  }
  $('#bFlow').onclick = e => flowMenu(e.currentTarget);

  // ---- 1–4 charts on one screen: the extra ones are small copies of this page (?embed=2..4) ---------------
  const LAYOUTS = [['1', 1, 'h', 'Jeden graf'], ['2h', 2, 'h', 'Dva vedľa seba'], ['2v', 2, 'v', 'Dva pod sebou'], ['3', 3, 'h', 'Tri (veľký vľavo)'], ['4', 4, 'h', 'Štyri (2 × 2)']];
  const layoutIcon = k => `<svg viewBox="0 0 24 16" width="26" height="18" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1" y="1" width="22" height="14" rx="1.5"/>${
    { '2h': '<path d="M12 1v14"/>', '2v': '<path d="M1 8h22"/>', 3: '<path d="M14 1v14M14 8h9"/>', 4: '<path d="M12 1v14M1 8h22"/>' }[k] || ''}</svg>`;
  function applyLayout() {
    if (EMBED) return;
    const L = S.layout, wrap = $('#chartWrap');
    let grid = $('#paneGrid');
    if (!grid) { grid = document.createElement('div'); grid.id = 'paneGrid'; wrap.parentNode.insertBefore(grid, wrap); grid.appendChild(wrap); }
    grid.className = 'lay-' + (L.n === 2 ? '2' + L.two : L.n);
    const want = Math.max(0, Math.min(3, L.n - 1)), frames = $$('iframe.pane', grid);
    frames.forEach((f, i) => { if (i >= want) f.remove(); });
    for (let i = frames.length; i < want; i++) {
      const p = L.panes[i] = L.panes[i] || { tf: ['15m', '1h', '4h'][i] };
      const f = document.createElement('iframe');
      f.className = 'pane'; f.dataset.i = i; f.title = `Graf ${i + 2}`;
      f.src = `./?embed=${i + 2}&symbol=${encodeURIComponent(L.sync ? S.symbol : p.symbol || S.symbol)}&tf=${encodeURIComponent(p.tf)}`;
      grid.appendChild(f);
    }
    $('#bLayout').classList.toggle('on', L.n > 1);
    setTimeout(fitToolbar, 50);
  }
  window.NX_paneChanged = (n, x) => { const p = S.layout.panes[n - 2]; if (p) { Object.assign(p, x); save(); } };
  function layoutMenu(anchor) {
    const L = S.layout, cur = () => (L.n === 2 ? '2' + L.two : String(L.n));
    const html = () => `<div class="sec">Rozloženie grafov</div><div class="lay-pick">${LAYOUTS.map(([k, , , n]) => `<span data-ly="${k}" class="${cur() === k ? 'on' : ''}" title="${n}">${layoutIcon(k)}<small>${n}</small></span>`).join('')}</div>
      ${L.n > 1 ? `<label class="it"><input type="checkbox" data-sync ${L.sync ? 'checked' : ''}><span class="grow">Rovnaký symbol vo všetkých grafoch</span></label>
      ${L.panes.slice(0, L.n - 1).map((p, i) => `<div class="lbl" style="padding:0 12px">Graf ${i + 2} – timeframe</div><div class="tchips">${['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'].map(tf => `<span data-pane="${i}" data-ptf="${tf}" class="${p.tf === tf ? 'on' : ''}">${tf}</span>`).join('')}</div>`).join('')}
      <div class="muted" style="font-size:11px;padding:4px 12px 6px">V každom grafe môžeš zmeniť aj symbol, typ a indikátory jeho vlastným panelom. Obchody a čiary SL / TP vidíš vo všetkých.</div>` : ''}`;
    const bind = m => {
      $$('[data-ly]', m).forEach(x => x.onclick = () => { const [, n, two] = LAYOUTS.find(l => l[0] === x.dataset.ly); L.n = n; L.two = two; save(); applyLayout(); m.innerHTML = html(); bind(m); });
      const sy = $('[data-sync]', m); if (sy) sy.onchange = () => { L.sync = sy.checked; save(); if (L.sync) $$('#paneGrid iframe.pane').forEach(f => { try { f.contentWindow.NX_setSymbol(S.symbol); } catch (e) {} }); };
      $$('[data-ptf]', m).forEach(x => x.onclick = () => {
        const i = +x.dataset.pane; L.panes[i].tf = x.dataset.ptf; save();
        const f = $(`#paneGrid iframe.pane[data-i="${i}"]`); try { f.contentWindow.NX_setTf(x.dataset.ptf); } catch (e) {}
        m.innerHTML = html(); bind(m);
      });
    };
    openMenu(anchor, html(), bind, { side: side(), cls: 'lay-menu' });
  }
  $('#bLayout').onclick = e => layoutMenu(e.currentTarget);

  // ---- styles: chart backgrounds (seasons) and colour themes ---------------------------------------
  const bgLayer = $('#bgLayer'), bgDim = $('#bgDim');
  const bgId = () => (S.bgImg.auto ? seasonId() : S.bgImg.id);
  function bgUrl() {
    const id = bgId();
    if (id === 'custom') return LS.get('nx-bg-custom', '') || S.bgImg.url || '';
    if (id.startsWith('photo:')) return photoUrl(id.slice(6));
    return id === 'none' ? '' : BG.url(id);
  }
  function hasBg() { return !!bgUrl(); }
  function applyBright() { const b = S.look.bright || 100; document.documentElement.style.filter = b !== 100 ? `brightness(${b / 100})` : ''; }
  function applyBg() {
    const url = bgUrl(), B = S.bgImg;
    bgLayer.style.backgroundImage = url ? `url("${url.replace(/"/g, '%22')}")` : 'none';
    bgLayer.style.filter = B.blur ? `blur(${B.blur}px)` : '';
    bgLayer.style.inset = B.blur ? `-${B.blur * 2}px` : '0';
    bgDim.style.background = url ? rgba(S.look.bg, B.dim) : 'transparent';
  }
  // A picture from the device: scaled to max 2560 px and stored as JPEG in this browser.
  function loadImage(file, done) {
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 2560 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
      let data = c.toDataURL('image/jpeg', 0.85);
      try { localStorage.setItem('nx-bg-custom', JSON.stringify(data)); } catch (e) { data = c.toDataURL('image/jpeg', 0.6); try { localStorage.setItem('nx-bg-custom', JSON.stringify(data)); } catch (e2) { toast('Obrázok je príliš veľký'); return; } }
      done();
    };
    img.onerror = () => toast('Obrázok sa nepodarilo načítať');
    img.src = u;
  }
  $('#bStyle').onclick = () => stylesDialog();

  // ---- toolbar look: size, font, colours -----------------------------------------------------------
  function applyPanel() {
    const P = S.panel, r = document.documentElement.style;
    r.setProperty('--tb-w', P.w + 'px'); r.setProperty('--tb-h', P.h + 'px'); r.setProperty('--tb-fs', P.fs + 'px'); r.setProperty('--tb-font', fontCss(P.font));
    r.setProperty('--tb-bg', rgba(P.bg, P.opacity)); r.setProperty('--tb-text', P.text); r.setProperty('--accent', P.accent);
    document.body.classList.toggle('tb-icons', P.show === 'icons'); document.body.classList.toggle('tb-text', P.show === 'text');
    fitToolbar();
  }

  // ---- styles window: photos, drawn scenes, candle colours, themes -----------------------------------
  // Real photos (Wikimedia Commons, free licences, credited in the window) live in static/photos/.
  let PHOTOS = [];
  const PHOTO_SEASON = { winter: 'alps-winter', spring: 'spring-blossom', summer: 'summer-lake', autumn: 'autumn-foliage' };
  const CANDLES = {
    tv: ['TradingView', '#089981', '#f23645'], classic: ['Klasická', '#26a69a', '#ef5350'], vivid: ['Sýta', '#00c853', '#ff1744'],
    blueRed: ['Modrá / červená', '#2962ff', '#f23645'], cb: ['Pre farboslepých', '#1e88e5', '#ff9800'], mono: ['Čiernobiela', '#e0e3eb', '#5d606b'],
    gold: ['Zlatá', '#ffca28', '#7e57c2'], neon: ['Neón', '#00e5ff', '#ff2bd6'], pastel: ['Pastelová', '#80cbc4', '#f48fb1'],
    ocean: ['Oceán', '#26c6da', '#5c6bc0'], fire: ['Oheň', '#ffca28', '#e53935'], forest: ['Les', '#9ccc65', '#8d6e63'],
    ice: ['Ľad', '#b3e5fc', '#546e7a'], sepia: ['Sépia', '#2e7d32', '#b23c17'],
    outline: ['Iba obrysy', '#089981', '#f23645', { body: false }], greyWicks: ['Sivé knôty', '#089981', '#f23645', { wick: '#787b86' }],
    hollowMono: ['Obrysy čiernobiele', '#e0e3eb', '#787b86', { body: false }],
  };
  function candlePreset(k) {
    const [, up, down, o = {}] = CANDLES[k];
    return { up, down, borderUp: up, borderDown: down, wickUp: o.wick || up, wickDown: o.wick || down, body: o.body !== false, borders: true, wicks: true };
  }
  function candleSvg(p) {
    const H = [[30, 14, 22, 8], [26, 10, 18, 4], [20, 6, 12, 2], [24, 12, 30, 8], [16, 8, 26, 4], [12, 4, 20, 2]];   // [open, high, close, low] in px from top-ish
    return `<svg viewBox="0 0 84 40" width="100%" height="40">${H.map(([o, hh, c, l], i) => {
      const x = 6 + i * 13, up = c < o, col = up ? p.up : p.down, wick = up ? p.wickUp : p.wickDown, top = Math.min(o, c), h = Math.max(2, Math.abs(o - c));
      return `<line x1="${x + 3}" x2="${x + 3}" y1="${hh}" y2="${Math.max(o, c) + 6}" stroke="${wick}"/><rect x="${x}" y="${top}" width="6" height="${h}" fill="${p.body ? col : 'none'}" stroke="${up ? p.borderUp : p.borderDown}"/>`;
    }).join('')}</svg>`;
  }
  const photoUrl = id => { const p = PHOTOS.find(x => x.id === id); return p ? 'static/' + p.file : ''; };
  function seasonId() { const k = BG.bySeason(); return S.bgImg.autoKind === 'drawn' ? k : 'photo:' + PHOTO_SEASON[k]; }
  let stTab = 'photos';
  function stylesDialog(tab0) {
    if (typeof tab0 === 'string') stTab = tab0;
    const B = S.bgImg;
    const cur = B.auto ? '' : B.id;
    const tile = (id, name, img, extra, title) => `<div class="tile ${cur === id ? 'on' : ''}" data-bg="${id}" title="${esc(title || name)}"><div class="thumb" style="${img}"></div><span>${esc(name)}</span>${extra || ''}</div>`;
    const q = u => String(u).replace(/"/g, '%22').replace(/'/g, '%27');
    const common = () => `<div class="fld"><label class="ctl"><input type="checkbox" data-b="auto" ${B.auto ? 'checked' : ''}> Automaticky podľa ročného obdobia</label>
        <select data-b="autoKind">${opts([['fotky', 'photo'], ['kreslené', 'drawn']], B.autoKind)}</select></div>
      <div class="fld"><span>Stmavenie (aby bol graf čitateľný)</span><span class="op" style="width:240px"><input type="range" min="0" max="95" data-b="dim" value="${B.dim}"><b>${B.dim} %</b></span></div>
      <div class="fld"><span>Rozmazanie</span><span class="op" style="width:240px"><input type="range" min="0" max="20" data-b="blur" value="${B.blur}"><b>${B.blur} px</b></span></div>`;
    const body = () => {
      if (stTab === 'photos') {
        const cust = LS.get('nx-bg-custom', '') || B.url, sel = PHOTOS.find(p => 'photo:' + p.id === (B.auto ? seasonId() : B.id));
        const groups = [...new Set(['Vesmír', 'Búrky', 'Lesy a kopce', 'Zima', 'Jar', 'Leto', 'Jeseň', 'Celý rok', ...PHOTOS.map(p => p.season)])].filter(g => PHOTOS.some(p => p.season === g));
        return `<div class="tiles">${tile('none', 'Bez obrázka', `background:${S.look.bg}`)}${tile('custom', 'Vlastný obrázok', cust ? `background-image:url('${q(cust)}')` : 'background:repeating-linear-gradient(45deg,#2a2e39 0 8px,#1e222d 8px 16px)')}</div>
          ${groups.map(g => `<div class="tgroup">${esc(g)}</div><div class="tiles">${PHOTOS.filter(p => p.season === g).map(p => tile('photo:' + p.id, p.name.replace(/^[^·]*·\s*/, ''), `background-image:url('${q('static/' + p.thumb)}')`, '', `${p.name} · foto: ${p.author} (${p.license})`)).join('')}</div>`).join('')}
          ${sel ? `<div class="muted credit">📷 ${esc(sel.name)} · foto: ${esc(sel.author)} · <a href="${esc(sel.licenseUrl || sel.source)}" target="_blank" rel="noopener">${esc(sel.license)}</a> · <a href="${esc(sel.source)}" target="_blank" rel="noopener">Wikimedia Commons</a></div>` : ''}
          ${common()}
          <div class="fld"><span>Vlastný obrázok zo zariadenia</span><label class="btn sm">📁 Vybrať súbor<input type="file" accept="image/*" data-file hidden></label></div>
          <div class="fld"><span>…alebo adresa obrázka z internetu (URL)</span><input type="text" data-b="url" value="${esc(B.url)}" placeholder="https://…jpg" style="width:260px"></div>`;
      }
      if (stTab === 'drawn') return `<div class="tiles">${tile('none', 'Bez obrázka', `background:${S.look.bg}`)}${Object.entries(BG.SCENES).map(([k, x]) => tile(k, x.name, `background-image:url('${BG.url(k)}')`, `<small>${esc(x.season)}</small>`)).join('')}</div>${common()}`;
      if (stTab === 'candles') {
        const L = S.look, now = { up: L.up, down: L.down, borderUp: L.borderUp, borderDown: L.borderDown, wickUp: L.wickUp, wickDown: L.wickDown, body: L.body };
        const same = k => { const p = candlePreset(k); return ['up', 'down', 'wickUp', 'wickDown', 'body'].every(x => String(p[x]).toLowerCase() === String(now[x]).toLowerCase()); };
        return `<div class="muted" style="margin:4px 0 8px">Klik = použije farby na graf. Jemné doladenie (telo, okraje, knôty zvlášť) je v ⚙ Nastavenia → Sviečky, alebo pravý klik na sviečku.</div>
          <div class="tiles candles">${Object.keys(CANDLES).map(k => `<div class="tile ${same(k) ? 'on' : ''}" data-cd="${k}"><div class="thumb" style="background:${S.look.bg}">${candleSvg(candlePreset(k))}</div><span>${esc(CANDLES[k][0])}</span></div>`).join('')}</div>
          <div class="fld"><span>Teraz</span><span class="ctl">${swatch('up', L.up)}${swatch('down', L.down)}<button class="btn sm" data-cfull>Podrobné nastavenia…</button></span></div>`;
      }
      return `<div class="tiles themes">${Object.entries(BG.THEMES).map(([k, t]) => `<div class="tile" data-th="${k}"><div class="thumb" style="background:linear-gradient(135deg,${t.look.bg},${t.look.bg2})">
          <i style="background:${t.look.up}"></i><i style="background:${t.look.down}"></i><i style="background:${t.panel.accent}"></i></div><span>${esc(t.name)}</span></div>`).join('')}</div>
        <div class="muted">Téma zmení pozadie grafu, mriežku, text, farby sviečok aj panel. Obrázok na pozadí ostane.</div>`;
    };
    const paint = () => {
      const d = openDialog(`<div class="dlg-h"><span>🖼 Štýly a pozadia</span><button class="ib" data-x>✕</button></div><div class="dlg-b">
        <div class="tabs">${[['photos', '📷 Fotky'], ['drawn', '🏔 Kreslené'], ['candles', '🕯 Farby sviečok'], ['themes', '🎨 Témy']].map(([k, n]) => `<span class="tab ${stTab === k ? 'on' : ''}" data-tab="${k}">${n}</span>`).join('')}</div>
        ${body()}</div><div class="dlg-f"><span class="grow"></span><button class="btn pri" data-x>Hotovo</button></div>`, null, 'wide styles-dlg');
      $$('[data-tab]', d).forEach(x => x.onclick = () => { stTab = x.dataset.tab; paint(); });
      $$('[data-bg]', d).forEach(x => x.onclick = () => {
        if (x.dataset.bg === 'custom' && !(LS.get('nx-bg-custom', '') || B.url)) { $('[data-file]', d).click(); return; }
        B.id = x.dataset.bg; B.auto = false; save(); applyBg(); buildChart(); paint();
      });
      $$('[data-b]', d).forEach(x => x[x.type === 'range' ? 'oninput' : 'onchange'] = () => {
        const k = x.dataset.b; B[k] = x.type === 'checkbox' ? x.checked : x.type === 'range' ? +x.value : x.value.trim();
        if (k === 'url' && B.url) { LS.set('nx-bg-custom', ''); B.id = 'custom'; B.auto = false; }
        if (x.type === 'range') x.nextElementSibling.textContent = `${B[k]} ${k === 'dim' ? '%' : 'px'}`;
        save(); applyBg(); if (x.type !== 'range') { buildChart(); paint(); }
      });
      const file = $('[data-file]', d); if (file) file.onchange = e => { const f = e.target.files[0]; if (f) loadImage(f, () => { B.id = 'custom'; B.auto = false; B.url = ''; save(); applyBg(); buildChart(); paint(); }); };
      $$('[data-cd]', d).forEach(x => x.onclick = () => { Object.assign(S.look, candlePreset(x.dataset.cd)); save(); buildChart(); paint(); toast(`Sviečky: ${CANDLES[x.dataset.cd][0]}`); });
      ['up', 'down'].forEach(k => { const b = $(`[data-sw=${k}]`, d); if (b) b.onclick = () => colorPopover(b, S.look, { noOpacity: true }, () => { S.look[k === 'up' ? 'borderUp' : 'borderDown'] = S.look[k]; S.look[k === 'up' ? 'wickUp' : 'wickDown'] = S.look[k]; save(); buildChart(); }, { color: k, opacity: '_o' + k }); });
      const cf = $('[data-cfull]', d); if (cf) cf.onclick = () => settings('bars');
      $$('[data-th]', d).forEach(x => x.onclick = () => {
        const t = BG.THEMES[x.dataset.th];
        Object.assign(S.look, t.look, { borderUp: t.look.up, wickUp: t.look.up, borderDown: t.look.down, wickDown: t.look.down, body: true });
        S.look.gridV = { ...S.look.gridV, color: t.grid }; S.look.gridH = { ...S.look.gridH, color: t.grid };
        S.look.bgType = t.look.bg2 !== t.look.bg ? 'gradient' : 'solid';
        Object.assign(S.panel, t.panel); save(); applyPanel(); applyBg(); buildChart(); toast(`Téma: ${t.name}`);
      });
      $$('[data-x]', d).forEach(x => x.onclick = closeDialog);
    };
    paint();
  }

  // ---- right click: the settings of whatever is under the mouse ----------------------------------------
  let lastCross = null;
  function ctxMenu(ev, html, bind) {
    closeMenu();
    let a = $('#ctxAnchor');
    if (!a) { a = document.createElement('div'); a.id = 'ctxAnchor'; document.body.appendChild(a); }
    a.style.cssText = `position:fixed;left:${ev.clientX}px;top:${ev.clientY}px;width:1px;height:1px;pointer-events:none`;
    const m = openMenu(a, html, bind, { cls: 'ctx' });
    if (m && m.getBoundingClientRect().bottom > innerHeight - 4) { m.style.top = Math.max(6, ev.clientY - m.offsetHeight) + 'px'; m.style.maxHeight = ''; }
  }
  const item = (k, ic, name, key) => `<div class="it" data-c="${k}"><span class="ic">${ic}</span><span class="grow">${name}</span>${key ? `<span class="key">${key}</span>` : ''}</div>`;
  const bindItems = (m, acts) => $$('[data-c]', m).forEach(x => x.onclick = () => { closeMenu(); const f = acts[x.dataset.c]; if (f) f(x); });
  function paneAt(y) {
    const panes = chart.panes(); let top = 0;
    for (let i = 0; i < panes.length; i++) { const h = panes[i].getHeight(); if (y >= top && y < top + h) return { i, top }; top += h + 1; }
    return null;
  }
  // The indicator whose line / histogram is within a few pixels of (x, y) in pane `pi`.
  function unitAt(pi, x, yIn) {
    const l = Math.round(chart.timeScale().coordinateToLogical(x));
    if (!(l >= 0 && l < disp.length)) return null;
    let best = null;
    for (const u of units) {
      if (u.pane !== pi || u.def.pattern) continue;
      for (const [k, vals] of Object.entries(u.values)) {
        const st = u.s.plots[k]; if (st && !st.visible) continue;
        const ser = (u.lines[k] && u.lines[k][0]) || u.hists[k] || u.host; if (!ser) continue;
        const yy = ser.priceToCoordinate(vals[l]); if (yy === null || !Number.isFinite(vals[l])) continue;
        const d = Math.abs(yy - yIn); if (d < 7 && (!best || d < best.d)) best = { u, d };
      }
    }
    return best && best.u;
  }
  function autoLineAt(x, y) {
    if (!S.auto.on || !tlR || hideL.auto) return false;
    const ts = chart.timeScale(), l = ts.coordinateToLogical(x), n = closedCount(); if (l === null) return false;
    for (const ln of tlR.lines) {
      if (ln.created > n - 1 || !(ln.ended === null || ln.ended > n - 1) || l < ln.i1) continue;
      const yy = main.priceToCoordinate(tlR.value(ln, l)); if (yy !== null && Math.abs(yy - y) < 6) return true;
    }
    for (const lv of tlR.levels) {
      if (lv.created > n - 1 || !(lv.ended === null || lv.ended > n - 1) || l < lv.touchIdx[0]) continue;
      const yy = main.priceToCoordinate(lv.price); if (yy !== null && Math.abs(yy - y) < 5) return true;
    }
    return false;
  }
  function studyMenu(ev, s) {
    const def = KS.STUDIES[s.type];
    ctxMenu(ev, `<div class="sec">${esc(def.label(s))}</div>${item('cfg', '⚙', 'Nastavenia… (farby, dĺžka, štýl)')}${item('hide', '👁', 'Skryť')}${item('dup', '⧉', 'Duplikovať')}
      ${item('def', '⭐', 'Uložiť ako predvolené')}${item('del', '🗑', 'Odstrániť')}<div class="sep"></div>${item('add', 'ƒx', 'Pridať ďalší indikátor…')}`, m => bindItems(m, {
      cfg: () => studySettings(s), hide: () => { s.visible = false; studiesChanged(); },
      dup: () => { studies.push(KS.normalize({ ...JSON.parse(JSON.stringify(s)), uid: undefined })); studiesChanged(); },
      def: () => { S.toolDefaults['study:' + s.type] = { inputs: s.inputs, plots: s.plots, tfs: s.tfs, out: s.out }; save(); toast('Uložené ako predvolené'); },
      del: () => { studies = studies.filter(x => x !== s); studiesChanged(); }, add: () => $('#bInd').click(),
    }));
  }
  function candleMenu(ev, bar, price) {
    const L = S.look, chips = Object.keys(CANDLES).slice(0, 10).map(k => `<span class="cchip" data-cd="${k}" title="${esc(CANDLES[k][0])}"><i style="background:${CANDLES[k][1]}"></i><i style="background:${CANDLES[k][2]}"></i></span>`).join('');
    ctxMenu(ev, `<div class="sec">Sviečka ${esc(fmtTime(bar.time))}</div><div class="ctx-ohlc">O ${fmt(bar.open)} · H ${fmt(bar.high)} · L ${fmt(bar.low)} · C ${fmt(bar.close)}</div>
      <div class="sec">Farby sviečok</div><div class="cchips">${chips}</div>
      ${item('colors', '🎨', 'Farby a štýl sviečok… (telo, okraje, knôty)')}${item('more', '🕯', 'Ďalšie farebné témy sviečok…')}
      <div class="sec">Typ grafu</div><div class="tchips">${TYPES.map(([k, n, ic]) => `<span data-type="${k}" class="${S.type === k ? 'on' : ''}" title="${esc(n)}">${ic}</span>`).join('')}</div>
      <div class="sep"></div>${item('replay', '✂', 'Replay od tejto sviečky')}${item('idea', '💡', 'Vlastný nápad na tejto sviečke')}${item('chat', '💬', 'Poslať sviečku do chatu')}
      ${item('copy', '📋', `Kopírovať cenu ${fmt(price)}`)}`, m => {
      $$('[data-cd]', m).forEach(x => x.onclick = () => { Object.assign(S.look, candlePreset(x.dataset.cd)); save(); buildChart(); toast(`Sviečky: ${CANDLES[x.dataset.cd][0]}`); });
      $$('[data-type]', m).forEach(x => x.onclick = () => { closeMenu(); const fresh = (x.dataset.type === 'renko') !== (S.type === 'renko'); S.type = x.dataset.type; save(); applyToolbar(); buildChart(fresh ? null : undefined); });
      bindItems(m, {
        colors: () => settings('bars'), more: () => stylesDialog('candles'),
        replay: () => { startReplay(false); const i = raw.findIndex(x => x.time > bar.time); view.replay.cut = Math.max(30, i < 0 ? raw.length : i); refreshAll(); replayInfo(); },
        idea: () => { S.idea.tab = 'own'; mark = { direction: 'bullish', entry: bar.close, sl: null, tp: null, note: '', time: bar.time }; toggleIdea(true); renderIdea(); },
        chat: () => { crossTime = bar.time; S.chat.attach = true; toggleChat(true); setTimeout(() => $('#chatText') && $('#chatText').focus(), 50); },
        copy: () => { navigator.clipboard && navigator.clipboard.writeText(fmt(price)); toast('Skopírované ' + fmt(price)); },
      });
    });
  }
  function chartMenu(ev) {
    ctxMenu(ev, `${item('settings', '⚙', 'Nastavenia grafu…')}${item('canvas', '▦', 'Plátno a mriežka…')}${item('legend', '🏷', 'Legenda (čo sa zobrazí vľavo hore)…')}
      ${item('styles', '🖼', 'Štýly, pozadia a farby sviečok…')}<div class="sep"></div>${item('ind', 'ƒx', 'Pridať indikátor…')}${item('auto', '📐', S.auto.on ? 'Vypnúť auto čiary' : 'Zapnúť auto čiary', 'Alt+A')}
      ${item('draw', '✎', 'Kresliť trendovú čiaru', 'Alt+T')}${item('tech', '📊', 'Technicals tohto symbolu')}<div class="sep"></div>
      ${item('reset', '⤢', 'Resetovať zobrazenie')}${item('panel', '☰', S.toolbar === 'hidden' ? 'Zobraziť panel' : 'Skryť panel', 'Alt+P')}`, m => bindItems(m, {
      settings: () => settings(), canvas: () => settings('canvas'), legend: () => settings('legend'), styles: () => stylesDialog(), ind: () => $('#bInd').click(),
      auto: () => toggleAuto(), draw: () => draw.start('trend'), tech: () => openTech(),
      reset: () => { chart.priceScale('right').applyOptions({ autoScale: true }); chart.timeScale().setVisibleLogicalRange({ from: disp.length - 150, to: disp.length + 5 }); },
      panel: () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', code: 'KeyP', altKey: true })),
    }));
  }
  function scaleMenu(ev) {
    const L = S.look, set = v => () => { L.scale = v; save(); buildChart(); };
    ctxMenu(ev, `<div class="sec">Cenová mierka</div>${[['Normálna', 0], ['Logaritmická', 1], ['Percentá', 2], ['Indexovaná na 100', 3]].map(([n, v]) => `<div class="it ${L.scale === v ? 'on' : ''}" data-c="s${v}"><span class="ic">${L.scale === v ? '✓' : ''}</span><span class="grow">${n}</span></div>`).join('')}
      ${item('inv', L.invert ? '✓' : '', 'Obrátiť mierku')}${item('auto', '⤢', 'Automaticky prispôsobiť')}${item('cfg', '⚙', 'Nastavenia mierky…')}`, m => bindItems(m, {
      s0: set(0), s1: set(1), s2: set(2), s3: set(3), inv: () => { L.invert = !L.invert; save(); buildChart(); },
      auto: () => chart.priceScale('right').applyOptions({ autoScale: true }), cfg: () => settings('scale'),
    }));
  }
  function timeMenu(ev) {
    ctxMenu(ev, `<div class="sec">Časové pásmo</div>${ZONES.map(z => `<div class="it ${S.tz === z ? 'on' : ''}" data-z="${z}"><span class="ic">${S.tz === z ? '✓' : ''}</span><span class="grow">${z.replace('_', ' ')}</span></div>`).join('')}
      <div class="sep"></div>${item('tf', '⏱', 'Zmeniť timeframe…')}`, m => {
      $$('[data-z]', m).forEach(x => x.onclick = () => { closeMenu(); S.tz = x.dataset.z; save(); Object.keys(tzFmt).forEach(z => delete tzFmt[z]); buildChart(); });
      bindItems(m, { tf: () => $('#bTf').click() });
    });
  }
  el.addEventListener('contextmenu', e => {
    if (!chart) return;
    e.preventDefault(); e.stopPropagation();
    const r = el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const W = chart.paneSize(0).width, pane = paneAt(y);
    if (!pane) return timeMenu(e);
    if (x > W) return scaleMenu(e);
    if (pane.i === 0) {
      const h = draw.hitAt(x, y);
      if (h && !h.d.temp) return ctxMenu(e, `<div class="sec">${esc(DR.TOOLS[h.d.type].name)}</div>${item('cfg', '⚙', 'Nastavenia… (farba, štýl, text)')}${item('lock', '🔒', h.d.locked ? 'Odomknúť' : 'Zamknúť')}${item('del', '🗑', 'Zmazať')}`,
        m => bindItems(m, { cfg: () => draw.openSettings(h.d), lock: () => { h.d.locked = !h.d.locked; S.drawings[S.symbol] = draw.list().filter(d => !d.temp); save(); }, del: () => draw.remove(h.d) }));
      const u = unitAt(0, x, y);
      if (u) return studyMenu(e, u.s);
      if (autoLineAt(x, y)) return ctxMenu(e, `<div class="sec">Auto čiara</div>${item('style', '🎨', 'Farby, hrúbka a štýl auto čiar…')}${item('menu', '📐', 'Čo kresliť, citlivosť…')}${item('off', '🙈', 'Vypnúť auto čiary')}`,
        m => bindItems(m, { style: () => autoStyle(), menu: () => autoMenu($('#bAuto')), off: () => toggleAuto(false) }));
      const l = Math.round(chart.timeScale().coordinateToLogical(x)), bar = disp[l];
      if (bar) {
        const yh = main.priceToCoordinate(bar.high), yl = main.priceToCoordinate(bar.low), bx = chart.timeScale().logicalToCoordinate(l);
        const bw = Math.max(4, chart.timeScale().options().barSpacing * 0.5);
        if (yh !== null && yl !== null && y >= Math.min(yh, yl) - 4 && y <= Math.max(yh, yl) + 4 && Math.abs(x - bx) <= bw) return candleMenu(e, bar, main.coordinateToPrice(y));
      }
      return chartMenu(e);
    }
    const u = unitAt(pane.i, x, y - pane.top) || units.find(v => v.pane === pane.i);
    if (u) return studyMenu(e, u.s);
    chartMenu(e);
  });
  $('#legend').addEventListener('contextmenu', e => {
    e.preventDefault();
    const row = e.target.closest('.lg-row');
    if (row) { const u = units[+row.dataset.n]; if (u) return studyMenu(e, u.s); }
    ctxMenu(e, `${item('legend', '🏷', 'Čo zobraziť v legende…')}${item('sym', S.legend.symbol ? '🙈' : '👁', S.legend.symbol ? 'Skryť symbol' : 'Zobraziť symbol')}`,
      m => bindItems(m, { legend: () => settings('legend'), sym: () => { S.legend.symbol = !S.legend.symbol; save(); showOHLC(); } }));
  });

  // ---- news, economic calendar and important links ------------------------------------------------------
  const newsEl = $('#newsWin');
  const TOPICS = [['gold', '🥇 Zlato'], ['silver', '🥈 Striebro'], ['btc', '₿ Bitcoin'], ['macro', '🏛 Makro / Fed'], ['cal', '📅 Kalendár'], ['links', '🔗 Odkazy']];
  const LINKS = [
    ['Zlato a striebro', [['Kitco – ceny a správy', 'https://www.kitco.com/'], ['World Gold Council – Goldhub', 'https://www.gold.org/goldhub'], ['CME – zlaté futures', 'https://www.cmegroup.com/markets/metals/precious/gold.html'],
      ['LBMA – ceny drahých kovov', 'https://www.lbma.org.uk/prices-and-data/precious-metal-prices'], ['Investing.com – správy o zlate', 'https://www.investing.com/commodities/gold-news'],
      ['TradingView – XAUUSD', 'https://www.tradingview.com/symbols/XAUUSD/'], ['The Silver Institute', 'https://www.silverinstitute.org/'], ['CFTC – Commitments of Traders', 'https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm']]],
    ['Makro a Fed', [['Forex Factory – kalendár', 'https://www.forexfactory.com/calendar'], ['CME FedWatch – očakávania sadzieb', 'https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html'],
      ['Federal Reserve – správy', 'https://www.federalreserve.gov/newsevents.htm'], ['FRED – makro dáta', 'https://fred.stlouisfed.org/'], ['US Treasury – výnosy', 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates'],
      ['BLS – inflácia CPI', 'https://www.bls.gov/cpi/'], ['TradingView – index dolára DXY', 'https://www.tradingview.com/symbols/TVC-DXY/']]],
    ['Krypto', [['CoinDesk', 'https://www.coindesk.com/'], ['Binance – BTC/USDT', 'https://www.binance.com/en/trade/BTC_USDT'], ['CoinGlass – likvidácie, funding', 'https://www.coinglass.com/'],
      ['Crypto Fear & Greed Index', 'https://alternative.me/crypto/fear-and-greed-index/']]],
  ];
  const newsCache = {};
  const ago = t => { const s = Date.now() / 1000 - t; return s < 3600 ? `pred ${Math.max(1, Math.round(s / 60))} min` : s < 86400 ? `pred ${Math.round(s / 3600)} h` : `pred ${Math.round(s / 86400)} d`; };
  function newsTopic() { return S.news.topic || ({ XAUUSD: 'gold', XAGUSD: 'silver', BTCUSD: 'btc' }[S.symbol] || 'gold'); }
  async function renderNews() {
    const t = newsTopic(), body = $('#newsBody');
    $('#newsTabs').innerHTML = TOPICS.map(([k, n]) => `<span data-nt="${k}" class="${t === k ? 'on' : ''}">${n}</span>`).join('');
    $$('#newsTabs [data-nt]').forEach(x => x.onclick = () => { S.news.topic = x.dataset.nt; save(); renderNews(); });
    if (t === 'links') {
      body.innerHTML = LINKS.map(([g, list]) => `<div class="step">${esc(g)}</div>${list.map(([n, u]) => `<a class="nl" href="${esc(u)}" target="_blank" rel="noopener">${esc(n)}<small>${esc(new URL(u).hostname.replace('www.', ''))}</small></a>`).join('')}`).join('') +
        `<div class="step">Moje odkazy</div>${(S.news.links || []).map((l, i) => `<div class="nl own"><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name || l.url)}</a><button class="ib" data-ld="${i}">✕</button></div>`).join('')}
        <div class="grid2" style="margin-top:6px"><input class="idea-in" id="lnName" placeholder="Názov"><input class="idea-in" id="lnUrl" placeholder="https://…"></div><button class="btn sm" id="lnAdd" style="margin-top:6px">➕ Pridať odkaz</button>`;
      $$('[data-ld]', body).forEach(b => b.onclick = () => { S.news.links.splice(+b.dataset.ld, 1); save(); renderNews(); });
      $('#lnAdd').onclick = () => { const url = $('#lnUrl').value.trim(); if (!/^https?:\/\//.test(url)) { toast('Zadaj adresu začínajúcu https://'); return; } S.news.links = [...(S.news.links || []), { name: $('#lnName').value.trim(), url }]; save(); renderNews(); };
      return;
    }
    body.innerHTML = '<div class="muted" style="padding:10px">Načítavam…</div>';
    try {
      if (t === 'cal') {
        const list = newsCache.cal && Date.now() - newsCache.cal.at < 600000 ? newsCache.cal.v : await (await fetch('api/calendar')).json();
        newsCache.cal = { at: Date.now(), v: list };
        const N = S.news, now = Date.now() / 1000;
        const show = list.filter(e => (N.impact === 'all' || (N.impact === 'high' ? e.impact === 'High' : ['High', 'Medium'].includes(e.impact))) && (N.cur === 'all' || e.country === N.cur));
        const next = show.find(e => e.time > now);
        let day = '';
        body.innerHTML = `<div class="fld"><select id="calImp">${opts([['Iba vysoký vplyv', 'high'], ['Vysoký + stredný', 'med'], ['Všetko', 'all']], N.impact)}</select><select id="calCur">${opts([['USD', 'USD'], ['EUR', 'EUR'], ['GBP', 'GBP'], ['JPY', 'JPY'], ['CNY', 'CNY'], ['Všetky meny', 'all']], N.cur)}</select></div>
          ${next ? `<div class="cal-next">⏰ Najbližšie: <b>${esc(next.title)}</b> (${esc(next.country)}) o ${esc(tzf({ weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(next.time * 1000)))} · ${Math.floor((next.time - now) / 3600)} h ${Math.round((next.time - now) % 3600 / 60)} min</div>` : ''}
          ${show.map(e => { const d = tzf({ weekday: 'long', day: 'numeric', month: 'numeric' }).format(new Date(e.time * 1000)), head = d !== day ? `<div class="step">${esc(d)}</div>` : ''; day = d;
            return `${head}<div class="cal ${e.time < now ? 'past' : ''}"><span class="ct">${esc(tzf({ hour: '2-digit', minute: '2-digit' }).format(new Date(e.time * 1000)))}</span><span class="imp ${esc((e.impact || '').toLowerCase())}" title="${esc(e.impact)}"></span>
              <span class="cc">${esc(e.country)}</span><span class="grow">${esc(e.title)}</span><small>${e.actual ? `<b>${esc(e.actual)}</b> · ` : ''}${e.forecast ? 'odh. ' + esc(e.forecast) : ''}${e.previous ? ' · pred. ' + esc(e.previous) : ''}</small></div>`; }).join('') || '<div class="muted">Tento týždeň nič podľa filtra.</div>'}
          <div class="muted" style="font-size:11px;margin-top:8px">Zdroj: Forex Factory (tento týždeň) · čas v pásme ${esc(S.tz)}</div>`;
        $('#calImp').onchange = e => { N.impact = e.target.value; save(); renderNews(); };
        $('#calCur').onchange = e => { N.cur = e.target.value; save(); renderNews(); };
        return;
      }
      const key = 'n:' + t, c = newsCache[key];
      const list = c && Date.now() - c.at < 300000 ? c.v : await (await fetch(`api/news?topic=${t}`)).json();
      newsCache[key] = { at: Date.now(), v: list };
      body.innerHTML = (Array.isArray(list) && list.length ? list.map(n => `<a class="news" href="${esc(n.link)}" target="_blank" rel="noopener"><span>${esc(n.title)}</span><small>${esc(n.source)} · ${n.time ? ago(n.time) : ''}</small></a>`).join('')
        : '<div class="muted">Žiadne správy.</div>') + '<div class="muted" style="font-size:11px;margin-top:8px">Zdroj: Google News (posledné 3 dni) · obnovuje sa každých 10 min</div>';
    } catch (e) { body.innerHTML = '<div class="muted" style="padding:10px">Zdroj správ teraz neodpovedá.</div>'; }
  }
  function toggleNews(open) {
    S.news.open = open ?? !S.news.open; save();
    newsEl.classList.toggle('open', S.news.open); $('#bNews').classList.toggle('on', S.news.open);
    if (S.news.open) { placeWin(newsEl, S.news); renderNews(); }
  }
  $('#bNews').onclick = () => toggleNews();
  $('#newsClose').onclick = () => toggleNews(false);
  $('#newsMin').onclick = () => newsEl.classList.toggle('min');
  $('#newsReload').onclick = () => { for (const k in newsCache) delete newsCache[k]; renderNews(); };
  dragWin(newsEl, $('#newsHead'), S.news);

  // ---- technicals: ratings, pivots and trade ideas for every timeframe ----------------------------------
  const techEl = $('#techPage');
  const TECH_TFS = KS.TIMEFRAMES;
  const techCache = {};
  let techSym = null, techTf = null, techTimer = null, techBusy = new Set();
  const RCOL = { 'Strong sell': '#f23645', Sell: '#f77c80', Neutral: '#9598a1', Buy: '#5b9cf6', 'Strong buy': '#2962ff' };
  function gauge(g, big) {
    const R = 70, cx = 90, cy = 86, seg = [['#f23645', 180, 144], ['#f77c80', 142, 108], ['#9598a1', 106, 74], ['#5b9cf6', 72, 38], ['#2962ff', 36, 0]];
    const pt = (a, r) => [cx + r * Math.cos(a * Math.PI / 180), cy - r * Math.sin(a * Math.PI / 180)];
    const arc = ([c, a1, a2]) => { const [x1, y1] = pt(a1, R), [x2, y2] = pt(a2, R); return `<path d="M${x1},${y1} A${R},${R} 0 0 1 ${x2},${y2}" stroke="${c}" stroke-width="7" fill="none" stroke-linecap="round" opacity="${c === RCOL[g.label] ? 1 : 0.45}"/>`; };
    const ang = 90 - g.r * 90, [nx, ny] = pt(ang, R - 16);
    return `<svg viewBox="0 0 180 100" class="gauge ${big ? 'big' : ''}">${seg.map(arc).join('')}<line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="var(--text)" stroke-width="3" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="5" fill="var(--text)"/>
      <text x="12" y="98" font-size="9" fill="var(--muted)">Predaj</text><text x="168" y="98" font-size="9" fill="var(--muted)" text-anchor="end">Nákup</text></svg>`;
  }
  async function techData(symbol, tf, force) {
    const key = symbol + '|' + tf, c = techCache[key];
    if (c && !force && Date.now() - c.at < (TF_SEC[tf] < 60 ? 5000 : 20000)) return c;
    const bars = await fetchBars(symbol, tf, null, 1000);
    const Dx = { t: bars.map(b => b.time), o: bars.map(b => b.open), h: bars.map(b => b.high), l: bars.map(b => b.low), c: bars.map(b => b.close), v: bars.map(b => b.volume || 0) };
    Dx.s = Dx.t.map(t => (SYM[symbol] && SYM[symbol].hours === 'gold' ? sessGold(t) : Math.floor(t / 86400)));
    const ta = TA.compute(Dx);
    const n = bars.length - 1, Dc = sliceD(Dx, n), R = n > 80 ? TL.run(Dc, { k: TL.zigK(tf, TF_SEC[tf]) }) : null;
    const ideas = R ? TL.ideas(Dc, R, ideaOpts()) : [], near = R ? TL.snapshot(R, n - 1, bars[n].close).near : [];
    const per = TA.pivotPeriod(TF_SEC[tf]);
    let piv = techCache['piv|' + symbol + '|' + per];
    if (!piv || Date.now() - piv.at > 600000) {
      const pb = await fetchBars(symbol, per === '12M' ? '1M' : per, null, per === '12M' ? 40 : 12);
      let prev = pb[pb.length - 2];
      if (per === '12M') {
        const y = new Date(pb[pb.length - 1].time * 1000).getUTCFullYear() - 1, ys = pb.filter(b => new Date(b.time * 1000).getUTCFullYear() === y);
        prev = ys.length ? { open: ys[0].open, high: Math.max(...ys.map(b => b.high)), low: Math.min(...ys.map(b => b.low)), close: ys[ys.length - 1].close } : null;
      }
      piv = techCache['piv|' + symbol + '|' + per] = { at: Date.now(), v: prev ? TA.pivots({ o: prev.open, h: prev.high, l: prev.low, c: prev.close }) : null };
    }
    return (techCache[key] = { at: Date.now(), ta, ideas, near, piv: piv.v, per, price: bars[n].close, n: bars.length });
  }
  const tfName = tf => ({ s: 's', m: 'min', h: 'h', d: 'd', w: 'týž.', M: 'mes.' }[tf.slice(-1)] ? tf.replace(/(\d+)([smhdwM])$/, (_, n, u) => `${n} ${({ s: 's', m: 'min', h: 'h', d: 'd', w: 'týž.', M: 'mes.' })[u]}`) : tf);
  async function paintTech() {
    const sy = SYM[techSym] || {}, digits = sy.digits ?? 2, f = v => (Number.isFinite(v) ? (+v).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—');
    $('#techHead').innerHTML = `<span class="tt"><b>${esc(sy.name || techSym)}</b> · Technicals</span>
      <span class="tsyms">${META.symbols.map(s => `<span data-ts="${s.id}" class="${s.id === techSym ? 'on' : ''}">${esc(s.name)}</span>`).join('')}</span><span class="grow"></span>
      <button class="btn sm" id="techRefresh">↻ Obnoviť</button><button class="btn sm" id="techBack">📈 Späť na graf</button>`;
    $('#techTfs').innerHTML = TECH_TFS.map(tf => { const c = techCache[techSym + '|' + tf]; const lab = c ? c.ta.groups.sum.label : null;
      return `<span data-tt="${tf}" class="${tf === techTf ? 'on' : ''}"><b>${tfName(tf)}</b><i style="background:${lab ? RCOL[lab] : 'transparent'}" title="${lab ? TA.SK[lab] : 'ešte nevypočítané'}"></i></span>`; }).join('');
    $$('[data-ts]', techEl).forEach(x => x.onclick = () => { techSym = x.dataset.ts; paintTech(); overview(); });
    $$('[data-tt]', techEl).forEach(x => x.onclick = () => { techTf = x.dataset.tt; paintTech(); });
    $('#techBack').onclick = closeTech;
    $('#techRefresh').onclick = () => { delete techCache[techSym + '|' + techTf]; paintTech(); };
    const box = $('#techBody');
    let c = techCache[techSym + '|' + techTf];
    if (!c) {
      box.innerHTML = `<div class="muted" style="padding:30px;text-align:center">Počítam ${esc(sy.name || '')} ${techTf}…</div>`;
      try { c = await techData(techSym, techTf); } catch (e) { box.innerHTML = `<div class="muted" style="padding:30px">Dáta sa nepodarilo načítať: ${esc(e.message)}</div>`; return; }
      if (!techEl.classList.contains('open')) return;
      paintTech(); return;
    }
    const G = c.ta.groups, cnt = g => `<div class="tcnt"><div><small>Predaj</small><b>${g.sell}</b></div><div><small>Neutrálne</small><b>${g.neutral}</b></div><div><small>Nákup</small><b>${g.buy}</b></div></div>`;
    const act = a => `<td class="act ${a.toLowerCase()}">${({ Buy: 'Nákup', Sell: 'Predaj', Neutral: 'Neutrálne' })[a]}</td>`;
    const st = TL.stats(c.ideas), last = c.ideas.slice(-12).reverse();
    const pv = c.piv, PK = ['R3', 'R2', 'R1', 'P', 'S1', 'S2', 'S3'];
    box.innerHTML = `<div class="gauges"><div>${gauge(G.osc)}<div class="gl">Oscilátory</div><div class="gv" style="color:${RCOL[G.osc.label]}">${TA.SK[G.osc.label]}</div>${cnt(G.osc)}</div>
        <div>${gauge(G.sum, true)}<div class="gl">Súhrn</div><div class="gv big" style="color:${RCOL[G.sum.label]}">${TA.SK[G.sum.label]}</div>${cnt(G.sum)}</div>
        <div>${gauge(G.ma)}<div class="gl">Kĺzavé priemery</div><div class="gv" style="color:${RCOL[G.ma.label]}">${TA.SK[G.ma.label]}</div>${cnt(G.ma)}</div></div>
      <div class="tcols"><div><div class="th2">Oscilátory</div><table class="tt"><tr><th>Názov</th><th>Hodnota</th><th>Akcia</th></tr>${c.ta.osc.map(x => `<tr><td>${esc(x.name)}</td><td>${Number.isFinite(x.value) ? x.value.toFixed(3) : '—'}</td>${act(x.action)}</tr>`).join('')}</table></div>
        <div><div class="th2">Kĺzavé priemery</div><table class="tt"><tr><th>Názov</th><th>Hodnota</th><th>Akcia</th></tr>${c.ta.ma.map(x => `<tr><td>${esc(x.name)}</td><td>${f(x.value)}</td>${act(x.action)}</tr>`).join('')}</table></div></div>
      <div class="th2">Pivoty <small class="muted">(z predchádzajúceho obdobia: ${({ '1d': 'deň', '1w': 'týždeň', '1M': 'mesiac', '12M': 'rok' })[c.per]})</small></div>
      ${pv ? `<table class="tt piv"><tr><th>Pivot</th>${Object.keys(pv).map(k => `<th>${k}</th>`).join('')}</tr>${PK.map(k => `<tr><td>${k}</td>${Object.values(pv).map(p => `<td>${f(p[k])}</td>`).join('')}</tr>`).join('')}</table>` : '<div class="muted">Bez dát.</div>'}
      <div class="th2">⚡ Obchodné nápady na ${esc(techTf)} <small class="muted">(auto trendové čiary a S/R + potvrdenia, rovnako ako v grafe)</small></div>
      <div class="stats" style="max-width:520px"><div><b>${st.n}</b><small>nápadov</small></div><div><b>${st.win === null ? '–' : (100 * st.win).toFixed(0) + ' %'}</b><small>úspešnosť</small></div>
        <div><b>${st.avgR === null ? '–' : (st.avgR >= 0 ? '+' : '') + st.avgR.toFixed(2) + 'R'}</b><small>priemer</small></div><div><b>${st.open}</b><small>otvorené</small></div></div>
      ${c.near.length ? `<div class="tnear">👀 Cena je pri čiare: ${c.near.map(q => `<span class="pill ${q.kind === 'sup' ? 'win' : 'loss'}">${q.kind === 'sup' ? 'podpora' : 'rezistencia'} ${f(q.value)} · ${q.touches}×</span>`).join(' ')}</div>` : ''}
      <table class="tt ideas"><tr><th>Čas</th><th>Smer</th><th>Signál</th><th>Vstup</th><th>SL</th><th>TP</th><th>Potvrdenia</th><th>Výsledok</th><th></th></tr>
        ${last.map((x, k) => `<tr><td>${esc(fmtTime(x.time))}</td><td><span class="pill ${x.dir > 0 ? 'win' : 'loss'}">${x.dir > 0 ? 'LONG' : 'SHORT'}</span></td><td>${esc(x.name)}</td><td>${f(x.entry)}</td><td>${f(x.sl)}</td><td>${f(x.tp)}</td>
          <td title="${esc(x.conf.join(', '))}">${'★'.repeat(x.score) || '☆'}</td><td>${x.result === null ? '⏳ otvorený' : x.result > 0 ? `<b class="up">✓ +${x.result}R</b>` : '<b class="dn">✗ −1R</b>'}</td>
          <td><button class="btn sm" data-ti="${c.ideas.length - 1 - k}">📈 V grafe</button></td></tr>`).join('') || '<tr><td colspan="9" class="muted">Žiadne nápady.</td></tr>'}</table>
      <div class="th2">Prehľad všetkých timeframov</div><table class="tt ovw"><tr><th>TF</th><th>Súhrn</th><th>Oscilátory</th><th>Kĺzavé priemery</th><th>Posledný nápad</th><th>Úspešnosť</th><th>Pri čiare</th></tr>
        ${TECH_TFS.map(tf => { const o = techCache[techSym + '|' + tf]; if (!o) return `<tr data-ot="${tf}"><td><b>${tf}</b></td><td colspan="6" class="muted">${techBusy.has(techSym + '|' + tf) ? 'počítam…' : TF_SEC[tf] < 60 ? 'klikni pre výpočet' : 'čaká…'}</td></tr>`;
          const li = o.ideas[o.ideas.length - 1], s2 = TL.stats(o.ideas), g = o.ta.groups;
          return `<tr data-ot="${tf}" class="${tf === techTf ? 'on' : ''}"><td><b>${tf}</b></td><td style="color:${RCOL[g.sum.label]}">${TA.SK[g.sum.label]}</td><td style="color:${RCOL[g.osc.label]}">${TA.SK[g.osc.label]}</td><td style="color:${RCOL[g.ma.label]}">${TA.SK[g.ma.label]}</td>
            <td>${li ? `<span class="pill ${li.dir > 0 ? 'win' : 'loss'}">${li.dir > 0 ? 'LONG' : 'SHORT'}</span> ${esc(li.name)} <small class="muted">${esc(fmtTime(li.time))}</small>` : '<span class="muted">—</span>'}</td>
            <td>${s2.win === null ? '–' : (100 * s2.win).toFixed(0) + ' %'} <small class="muted">(${s2.done})</small></td><td>${o.near.length ? '👀 ' + o.near.length : ''}</td></tr>`; }).join('')}</table>`;
    $$('[data-ti]', box).forEach(b => b.onclick = () => { const x = c.ideas[+b.dataset.ti]; closeTech(); jumpTo(techSym, techTf, x.time, x); });
    $$('[data-ot]', box).forEach(r => r.onclick = async () => { techTf = r.dataset.ot; if (!techCache[techSym + '|' + techTf]) { techBusy.add(techSym + '|' + techTf); } paintTech(); });
  }
  async function overview() {
    const sy = techSym, list = TECH_TFS.filter(tf => TF_SEC[tf] >= 60 && !techCache[sy + '|' + tf]);
    const worker = async () => { while (list.length && techEl.classList.contains('open') && techSym === sy) { const tf = list.shift(); techBusy.add(sy + '|' + tf);
      try { await techData(sy, tf); } catch (e) {} techBusy.delete(sy + '|' + tf); if (techEl.classList.contains('open')) { const sc = $('#techBody').scrollTop; await paintTech(); $('#techBody').scrollTop = sc; } } };
    await Promise.all([worker(), worker()]);
  }
  function openTech() {
    techSym = S.symbol; techTf = S.tf;
    techEl.classList.add('open'); $('#bTech').classList.add('on');
    paintTech(); overview();
    clearInterval(techTimer);
    techTimer = setInterval(async () => { if (!techEl.classList.contains('open')) return; try { await techData(techSym, techTf, true); const sc = $('#techBody').scrollTop; await paintTech(); $('#techBody').scrollTop = sc; } catch (e) {} }, 15000);
  }
  function closeTech() { techEl.classList.remove('open'); $('#bTech').classList.remove('on'); clearInterval(techTimer); }
  $('#bTech').onclick = () => (techEl.classList.contains('open') ? closeTech() : (LIB.close(), openTech()));

  // ---- library: candlestick and chart patterns, strategies, tips ------------------------------------------
  LIB.init({
    onPattern: key => {
      const type = 'pat_' + key;
      if (!studies.some(s => s.type === type)) { studies.push(KS.normalize({ type, visible: true })); studiesChanged(); }
      LIB.close(); toast(`📈 ${KS.STUDIES[type].name} – značky v grafe`, 2500);
    },
  });
  $('#bLib').onclick = () => { if (!LIB.isOpen()) closeTech(); LIB.toggle(); };

  // ---- keyboard ---------------------------------------------------------------------------------
  document.addEventListener('keydown', e => {
    const typing = e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (e.key === 'Escape') { if ($('#pop').classList.contains('open')) { closePop(); return; } if (dialogOpen()) { cancelDialog(); return; } if ($('.dd')) { closeMenu(); return; } if (techEl.classList.contains('open')) { closeTech(); return; } closeMenu(); if (replayPick) { stopPick(); return; } }
    if (dialogOpen()) return;
    if ((e.ctrlKey || e.metaKey) && !typing && !e.altKey && (e.code === 'KeyZ' || e.code === 'KeyY')) { e.preventDefault(); stepHist(e.code === 'KeyY' || e.shiftKey ? 1 : -1); return; }
    if (e.ctrlKey && e.key === 'Enter' && S.idea.open && current) { e.preventDefault(); if (e.shiftKey) openAlert(qi + 1); else saveLabel(); return; }
    if (e.altKey && !typing && e.code === 'KeyR' && !e.shiftKey) { e.preventDefault(); if (view.replay) exitReplay(); else startReplay(true); return; }
    if (e.altKey && !typing && e.code === 'KeyA' && !e.shiftKey) { e.preventDefault(); toggleAuto(); return; }
    if (view.replay && !typing && !e.altKey && !e.ctrlKey) {
      if (e.key === 'ArrowRight') { e.preventDefault(); playReplay(false); stepReplay(e.shiftKey ? 10 : 1); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); playReplay(false); stepReplay(e.shiftKey ? -10 : -1); return; }
      if (e.key === ' ') { e.preventDefault(); playReplay(!replayTimer); return; }
    }
    if (e.altKey && e.code === 'KeyP') { e.preventDefault(); if (S.toolbar === 'hidden') $('#showToolbar').click(); else { S.lastToolbar = S.toolbar; S.toolbar = 'hidden'; save(); applyToolbar(); } return; }
    if (draw.key(e)) e.preventDefault();
  });
  window.addEventListener('beforeunload', save);

  // ---- start ------------------------------------------------------------------------------------
  (async () => {
    try { META = await (await fetch('api/meta')).json(); } catch (e) { toast('Server neodpovedá'); }
    SYM = Object.fromEntries((META.symbols || []).map(s => [s.id, s]));
    TL.configure(META.structure);
    try { PHOTOS = await (await fetch('static/photos/photos.json')).json(); } catch (e) { PHOTOS = []; }
    if (!SYM[S.symbol]) S.symbol = 'XAUUSD';
    if (S.labeler) await pullPrefs(S.labeler);
    applyPanel(); applyBg(); applyBright(); applyToolbar();
    applyLayout();
    await load();
    if (EMBED) { hist = [snap()]; hpos = 0; paintHist(); return; }
    if (S.idea.open) toggleIdea(true);
    if (S.chat.open) toggleChat(true); else pollChat(true);
    if (S.news.open) toggleNews(true);
    if (S.flow.open) FLOW.open({ id: S.symbol, ...sym() });
    $('#bFlow').classList.toggle('on', S.bubbles.on || FLOW.isOpen());
    scheduleScan();
    hist = [snap()]; hpos = 0; paintHist();
    NEXUS.init({
      S: () => S, save, toast, fetchBars, symbols: () => META.symbols || [], chatMsgs: () => chatMsgs, kinds: () => KINDS,
      newFolder, folderColors: () => FOLDER_COLORS,
      openChat: filter => { if (filter) S.chat.filter = filter; toggleChat(true); renderChatFilter(); renderChatList(); },
      setName: name => { S.labeler = name; save(); if (S.chat.open) renderChat(); },
      liveIdeas: () => (scanRes || []).map((x, i) => ({ ...x, i })).filter(x => x.kind === 'idea'),
      jumpTo: x => jumpTo(x.symbol, x.tf, x.time, x),
      onRobot: () => {},
      chartSymbol: () => S.symbol,
      livePrice: id => (id === S.symbol && view.mode === 'live' && !view.replay && raw.length ? raw[raw.length - 1].close : NaN),
      onTrades: markers => { refreshTrades(markers); $$('#paneGrid iframe.pane').forEach(f => { try { f.contentWindow.NX_refreshTrades(markers); } catch (e) {} }); },
    });
  })();
})();
