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
    symbol: 'XAUUSD', tf: '5m', type: 'candles', toolbar: 'top', tz: 'Europe/Bratislava', lang: 'sk', hours: true, spot: true, bars: 1000, tradeMarks: false,
    look: { up: '#089981', down: '#f23645', borderUp: '#089981', borderDown: '#f23645', wickUp: '#089981', wickDown: '#f23645',
            body: true, borders: true, wicks: true, line: '#2962ff', lineWidth: 2, bg: '#161a25', text: '#d1d4dc', grid: true, gridColor: '#1f2433',
            scale: 0, invert: false, lastLine: true, liveW: 2, liveStyle: 0, rightOffset: 8,
            bgType: 'solid', bg2: '#0f121a', gridV: { on: true, color: '#1f2433', opacity: 100, style: 0 }, gridH: { on: true, color: '#1f2433', opacity: 100, style: 0 },
            sepColor: '#2a2e39', scaleLine: '#2a2e39', fontSize: 11, font: 'system', marginTop: 8, marginBottom: 8,
            candle: { preset: 'std', body: 80, wick: 1, radius: 0, spacing: 6 }, bright: 100 },
    bubbles: { on: false, group: 0, minPct: 70, scale: 100, opacity: 70, style: 'pie', labels: true },
    panel: { w: 118, h: 30, fs: 13, font: 'system', bg: '#1e222d', text: '#d1d4dc', accent: '#2962ff', show: 'both', opacity: 100 },
    bgImg: { id: 'none', auto: false, autoKind: 'photo', dim: 55, blur: 0, url: '', anim: 'none', animSpeed: 100, animOpacity: 70 },
    auto: { on: false, maxLines: 3, maxLevels: 8, reach: 1, major: false, lines: true, channels: false, levels: true, pivots: false, ended: false, touches: true, labels: true, k: 0, ext: 30,
            sup: { color: '#26a69a', opacity: 90, width: 2, style: 0 }, res: { color: '#ef5350', opacity: 90, width: 2, style: 0 },
            lvl: { color: '#ffb74d', opacity: 75, width: 1, style: 2 } },
    ideas: { on: true, markers: true, history: true, notify: true, sound: false, minTouches: 0, minLevel: 0, rr: 2, minScore: 1, strat: {} },
    tint: { on: false, opacity: 18, label: true },
    range: { on: false, solid: true, minLen: 15, maxAtr: 3.5, minTests: 2, count: 6, bos: true, mid: true, fill: 10, ext: 40, width: 1.5, color: '#5b9cf6', up: '#00c853', down: '#ff1744' },
    fork: { on: false, type: 'andrews', k: 0, count: 1, half: false, fill: 6, ext: 80, width: 1.5, up: '#26a69a', down: '#ef5350' },
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
    account: { start: 10000, positions: [], history: [] }, accounts: [], accountId: 'main', board: { notes: [] },
    robot: { on: false, symbols: ['XAUUSD'], tfs: ['1m', '5m', '15m', '1h'], period: 10, sharpBars: 3, sharpAtr: 2, onSharp: 'both', paper: true, lots: 0.1, state: {}, log: [] },
    alerts: [], scripts: [], addons: { follow: false, always: false, float: true, floatBg: 0, scroll: false, scrollH: 75, scrollCols: 1 },
    savedAt: 0,
  };
  const merge = (a, b) => { const o = { ...a }; for (const k in b || {}) o[k] = a && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) && b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) ? merge(a[k], b[k]) : b[k]; return o; };
  // ?embed=2..4 = one of the extra charts of the multi-chart layout: its own settings key, no chat / robot / server sync
  const QS = new URLSearchParams(location.search), EMBED = QS.get('embed'), KEY = EMBED ? 'nx2:pane' + EMBED : 'nx2';
  let S = merge(DEF, LS.get(KEY, null) || LS.get('nx2', {}));
  if (EMBED) {
    if (QS.get('symbol')) S.symbol = QS.get('symbol');
    if (QS.get('tf')) S.tf = QS.get('tf');
    S.toolbar = QS.get('bar') === '0' ? 'hidden' : 'top'; S.chat.open = S.news.open = S.idea.open = S.flow.open = false; S.robot = { ...S.robot, on: false };
    document.body.classList.add('embed');
  }
  if (!Array.isArray(S.studies)) S.studies = [{ type: 'volume' }];
  let studies = S.studies.map(KS.normalize).filter(Boolean);
  let syncT = null;
  let hist = [], hpos = -1, histT = null, restoring = false;
  function save() {
    S.studies = studies.filter(s => !s.temp).map(({ temp, ...s }) => s);
    S.savedAt = Date.now();
    LS.set(KEY, persisted());
    record();
    if (S.labeler && !EMBED) { clearTimeout(syncT); syncT = setTimeout(() => fetch(`api/prefs/${encodeURIComponent(S.labeler)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(persisted()) }).catch(() => {}), 1500); }
  }
  async function pullPrefs(name) {
    if (EMBED) return false;
    try {
      const r = await (await fetch(`api/prefs/${encodeURIComponent(name)}`)).json();
      if (r && r.savedAt && r.savedAt > S.savedAt) { S = merge(DEF, { ...r, labeler: name }); studies = S.studies.map(KS.normalize).filter(Boolean); LS.set('nx2', S); return true; }
    } catch (e) {}
    return false;
  }

  // ---- mirror: a member of a shared account sees the owner's chart (symbol, timeframe, indicators, drawings, notes) --
  // The owner's prefs are pulled every 5 s; my own values of these keys are kept aside and are what save() stores.
  const MIRROR_KEYS = ['symbol', 'tf', 'type', 'studies', 'drawings', 'board', 'look', 'auto', 'ideas', 'bubbles', 'tint', 'legend', 'renko', 'hours'];
  let mirror = null;
  const persisted = () => (mirror ? { ...S, ...mirror.own } : S);
  async function mirrorPull() {
    if (!mirror) return;
    let r; try { r = await (await fetch(`api/prefs/${encodeURIComponent(mirror.owner)}`)).json(); } catch (e) { return; }
    if (!mirror || !r || !r.savedAt || r.savedAt === mirror.at) return;
    mirror.at = r.savedAt;
    const reload = r.symbol !== S.symbol || r.tf !== S.tf || r.hours !== S.hours;
    for (const k of MIRROR_KEYS) if (k in r) S[k] = DEF[k] && typeof DEF[k] === 'object' && !Array.isArray(DEF[k]) ? merge(DEF[k], r[k]) : r[k];
    studies = (S.studies || []).map(KS.normalize).filter(Boolean);
    if (reload) { applyToolbar(); await load(); } else { applyBg(); buildChart(); }
    if (window.NEXUS && NEXUS.refresh) NEXUS.refresh();
    if (S.chat.tab === 'board') NEXUS.renderBoard(socBoard);
    paintMirror();
  }
  function paintMirror() {
    let b = $('#mirrorBar');
    if (!mirror) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('div'); b.id = 'mirrorBar'; document.body.append(b); }
    b.innerHTML = `👁 Vidíš graf používateľa <b>${esc(mirror.owner)}</b> – jeho indikátory, kresby a poznámky (naživo) <button class="btn sm" id="mirrorStop">⏹ Späť na môj graf</button>`;
    $('#mirrorStop', b).onclick = () => setMirror(null);
  }
  function setMirror(owner) {
    if (EMBED) return;
    if (mirror) {                               // back to my own chart
      clearInterval(mirror.t);
      Object.assign(S, mirror.own); studies = (S.studies || []).map(KS.normalize).filter(Boolean);
      mirror = null; S.mirrorOf = ''; save(); paintMirror(); applyToolbar(); load();
      if (S.chat.tab === 'board') NEXUS.renderBoard(socBoard);
    }
    if (!owner || owner === S.labeler) return;
    const own = {}; save(); for (const k of MIRROR_KEYS) own[k] = JSON.parse(JSON.stringify(S[k] ?? null));
    mirror = { owner, own, at: 0, t: setInterval(mirrorPull, 5000) };
    S.mirrorOf = owner; save(); paintMirror(); mirrorPull();
    toast(`Sleduješ graf: ${owner}`);
  }

  // ---- data ------------------------------------------------------------------------------------
  let META = { symbols: [] }, SYM = {};
  let raw = [], disp = [], D = null, view = { mode: 'live' }, olderDone = false, loadingOlder = false;
  window.NX_spotOff = id => (SYM[id] && SYM[id].off) || 0;
  const sym = () => SYM[S.symbol] || { digits: 2, hours: null, market: 'futures', ticker: 'XAUUSDT', name: S.symbol };
  const fmt = p => (p === undefined || p === null || Number.isNaN(p) ? '–' : (+p).toFixed(sym().digits ?? 2));
  async function fetchBars(symbol, tf, end, limit) {
    const q = new URLSearchParams({ symbol, tf, limit: String(limit || S.bars), hours: String(!!S.hours), spot: String(S.spot !== false) });
    if (end) q.set('end', String(end));
    const r = await fetch(`api/candles?${q}`);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.status);
    const j = await r.json(); if (SYM[symbol]) SYM[symbol].off = j.offset || 0;     // spot correction the server applied (see /api/spot)
    return j.bars.map(b => ({ time: b[0], open: b[1], high: b[2], low: b[3], close: b[4], volume: b[5], buy: b[6] ?? NaN }));
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
  const cOp = c => { const o = S.look.cop ?? 100; return o >= 100 || !c || c.startsWith('rgba') ? c : rgba(c, o); };
  function mainSeries(chart) {
    const L = S.look, t = S.type;
    const fmtP = { priceFormat: { type: 'price', precision: sym().digits ?? 2, minMove: 1 / 10 ** (sym().digits ?? 2) }, priceLineVisible: L.lastLine, priceLineWidth: L.liveW || 2, priceLineStyle: L.liveStyle ?? 0 };
    if (['candles', 'ha', 'renko', 'hollow'].includes(t)) {
      const C = L.candle;
      return chart.addCustomSeries(new CandleView(), { ...fmtP, body: C.body, wick: C.wick, radius: C.radius, fill: L.body, borders: L.borders, wicks: L.wicks,
        up: cOp(L.up), down: cOp(L.down), borderUp: cOp(L.borderUp), borderDown: cOp(L.borderDown), wickUp: cOp(L.wickUp), wickDown: cOp(L.wickDown) });
    }
    if (['bars', 'hlc', 'cbar_hlc', 'cbar_ohlc'].includes(t)) return chart.addSeries(LW.BarSeries, { ...fmtP, upColor: cOp(L.up), downColor: cOp(L.down), openVisible: !t.includes('hlc'), thinBars: false });
    if (t === 'area') return chart.addSeries(LW.AreaSeries, { ...fmtP, lineColor: L.line, lineWidth: L.lineWidth, topColor: rgba(L.line, 35), bottomColor: rgba(L.line, 0) });
    if (t === 'baseline') return chart.addSeries(LW.BaselineSeries, { ...fmtP, baseValue: { type: 'price', price: disp.length ? disp[0].close : 0 }, lineWidth: L.lineWidth,
      topLineColor: L.up, topFillColor1: rgba(L.up, 28), topFillColor2: rgba(L.up, 5), bottomLineColor: L.down, bottomFillColor1: rgba(L.down, 5), bottomFillColor2: rgba(L.down, 28) });
    if (t === 'forest') return chart.addSeries(LW.HistogramSeries, { ...fmtP, base: Math.min(...disp.map(b => b.low)) });
    return chart.addSeries(LW.LineSeries, { ...fmtP, color: L.line, lineWidth: L.lineWidth, lineType: t === 'step' ? 1 : 0, lineVisible: t !== 'dot',
      pointMarkersVisible: t === 'linedot' || t === 'dot', pointMarkersRadius: t === 'dot' ? 2.5 : 2 });
  }
  function pointOf(b, i) {
    const L = S.look, t = S.type, dn = i > 0 && b.close < disp[i - 1].close;
    if (['candles', 'ha', 'renko', 'bars', 'hlc'].includes(t)) return { time: b.time, open: b.open, high: b.high, low: b.low, close: b.close };
    if (t === 'hollow') { const c = cOp(dn ? L.down : L.up);   // hollow = rising candle, colour = close vs previous close
      return { time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, color: b.close >= b.open ? 'rgba(0,0,0,0)' : c, borderColor: c, wickColor: c }; }
    if (t.startsWith('cbar')) return { time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, color: cOp(dn ? L.down : L.up) };
    if (t === 'forest') return { time: b.time, value: b.close, color: rgba(dn ? L.down : L.up, 0.8 * (L.cop ?? 100)) };
    return { time: b.time, value: b.close };
  }
  const mainData = () => disp.map(pointOf);

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
      rightPriceScale: { visible: !L.hideScale, borderColor: L.scaleLine, mode: L.scale, invertScale: L.invert, scaleMargins: { top: L.marginTop / 100, bottom: L.marginBottom / 100 } },
      timeScale: { visible: !L.hideTime, borderColor: L.scaleLine, timeVisible: true, secondsVisible: TF_SEC[S.tf] < 60, rightOffset: L.rightOffset,
                   tickMarkFormatter: (t, type) => tzf([{ year: 'numeric' }, { month: 'short' }, { day: 'numeric', month: 'short' }, { hour: '2-digit', minute: '2-digit' },
                                                       { hour: '2-digit', minute: '2-digit', second: '2-digit' }][type] || { hour: '2-digit', minute: '2-digit' }).format(new Date(t * 1000)) },
      localization: { timeFormatter: fmtTime, locale: 'sk-SK' },
      handleScale: { axisPressedMouseMove: { time: true, price: true }, mouseWheel: !pageScroll(), pinch: true, axisDoubleClickReset: { time: true, price: true } },
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
          let bx2 = bx;
          for (const [id, t] of [...(l.btns || [])].reverse()) {
            const w = ctx.measureText(t).width + 12; bx2 -= w + 3;
            ctx.fillStyle = this.hoverBtn === key + '|' + id ? l.color : 'rgba(18,21,30,.9)';
            ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx2, by, w, 18, 4) : ctx.rect(bx2, by, w, 18); ctx.fill();
            ctx.strokeStyle = l.color; ctx.lineWidth = 1; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.fillText(t, bx2 + 6, by + 9.5);
            this.hits.push({ l, y, x0: bx2, x1: bx2 + w, btn: id });
          }
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
    const r = el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top - mainTop();
    if (x > chart.paneSize(mainIdx).width || y < 0) return;
    const hb = tradeLines.hits.find(q => q.btn && Math.abs(q.y - y) <= 9 && x >= q.x0 && x <= q.x1);
    if (hb) { e.stopPropagation(); e.preventDefault(); if (nx.lineAction) nx.lineAction(hb.l.pid, hb.btn, hb.l.kind, hb.l.idx); refreshTrades(true); return; }
    const h = tradeLines.lineAt(x, y) || tradeLines.hits.find(q => q.del && Math.abs(q.y - y) <= 9 && x >= q.x0 && x <= q.x1);
    if (!h) return;
    e.stopPropagation(); e.preventDefault();
    if (h.del && x >= h.x0 && x <= h.x1) { nx.removeLine(h.l.pid, h.l.kind, h.l.idx); refreshTrades(true); return; }
    tradeLines.drag = { key: lineKey(h.l), l: h.l };
    chart.applyOptions({ handleScroll: false, handleScale: false });
    const move = ev => {
      const yy = ev.clientY - el.getBoundingClientRect().top - mainTop(), price = main.coordinateToPrice(yy);
      if (price === null) return;
      nx.moveLine(h.l.pid, h.l.kind, h.l.idx, price, false); tradeLines.update();
    };
    const up = ev => {
      window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true);
      const yy = ev.clientY - el.getBoundingClientRect().top - mainTop(), price = main.coordinateToPrice(yy);
      if (price !== null) nx.moveLine(h.l.pid, h.l.kind, h.l.idx, price, true);
      tradeLines.drag = null; el.style.cursor = '';
      const o = chartOptions(); chart.applyOptions({ handleScroll: o.handleScroll, handleScale: o.handleScale });
      refreshTrades(false);
    };
    window.addEventListener('pointermove', move, true); window.addEventListener('pointerup', up, true);
  }, true);
  $('#chartWrap').addEventListener('pointermove', e => {
    if (!tradeLines || !chart || tradeLines.drag) return;
    const r = el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top - mainTop();
    const hb = tradeLines.hits.find(q => q.btn && Math.abs(q.y - y) <= 9 && x >= q.x0 && x <= q.x1), hk = hb ? lineKey(hb.l) + '|' + hb.btn : null;
    const h = hb ? null : tradeLines.lineAt(x, y), key = h ? lineKey(h.l) : null;
    if (key !== tradeLines.hover || hk !== tradeLines.hoverBtn) { tradeLines.hover = key; tradeLines.hoverBtn = hk; el.style.cursor = hb ? 'pointer' : h ? 'ns-resize' : ''; tradeLines.update(); }
  });

  // ---- pick a price / a bar with the mouse (trade panel levels 🎯, learning areas ✂) ------------------------------
  // The click is caught before the drawing tools and the chart's own panning; Esc cancels. A price snaps to the bar's
  // high / low / open / close when the mouse is within 8 px of it.
  let pickReq = null;
  function pickChart(text, o = {}) {
    if (pickReq) pickReq.done(null);
    return new Promise(res => {
      const h = $('#hint'); h.textContent = text + ' · Esc = zrušiť'; h.style.display = '';
      el.classList.add('picking');
      pickReq = { o, done: v => { pickReq = null; h.style.display = 'none'; el.classList.remove('picking'); pickBand(); pickLine(); res(v); } };
    });
  }
  function pickAt(e) {
    if (!chart || !disp.length) return null;
    const r = el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top - mainTop(), ps = chart.paneSize(mainIdx);
    if (x < 0 || x > ps.width || y < 0 || y > ps.height) return null;
    const lg = chart.timeScale().coordinateToLogical(x), i = lg === null ? null : Math.max(0, Math.min(disp.length - 1, Math.round(lg)));
    let price = main.coordinateToPrice(y);
    if (i !== null && price !== null) { const b = disp[i]; let best = 8; for (const v of [b.high, b.low, b.open, b.close]) { const yy = main.priceToCoordinate(v); if (yy !== null && Math.abs(yy - y) < best) { best = Math.abs(yy - y); price = v; } } }
    return { x, i, price, time: i === null ? null : disp[i].time };
  }
  function pickBand(x0, x1) {
    let b = $('#pickBand');
    if (x0 === undefined) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('div'); b.id = 'pickBand'; $('#chartWrap').appendChild(b); }
    const wr = $('#chartWrap').getBoundingClientRect(), r = el.getBoundingClientRect();
    Object.assign(b.style, { left: r.left - wr.left + x0 + 'px', width: Math.max(2, x1 - x0) + 'px', top: r.top - wr.top + mainTop() + 'px', height: chart.paneSize(mainIdx).height + 'px' });
  }
  window.addEventListener('pointerdown', e => {
    if (!pickReq || e.button !== 0 || !e.target.closest('#chartWrap') || e.target.closest('.no-chart')) return;
    const p = pickAt(e); if (!p) return;
    e.stopImmediatePropagation(); e.preventDefault();
    pickReq.done(p);
  }, true);
  function pickLine(p) {
    let b = $('#pickLine');
    if (!p || p.price == null) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('div'); b.id = 'pickLine'; b.innerHTML = '<span></span>'; $('#chartWrap').appendChild(b); }
    const wr = $('#chartWrap').getBoundingClientRect(), r = el.getBoundingClientRect(), y = main.priceToCoordinate(p.price);
    Object.assign(b.style, { top: r.top - wr.top + mainTop() + y + 'px', left: r.left - wr.left + 'px', width: chart.paneSize(mainIdx).width + 'px' });
    b.firstChild.textContent = `${pickReq.o.label ? pickReq.o.label(p.price) + ' · ' : ''}${fmt(p.price)}`;
  }
  window.addEventListener('pointermove', e => {
    if (!pickReq) return;
    if (pickReq.o.from == null) { if (!pickReq.o.bar) { const p = pickAt(e); pickLine(p); } return; }
    const p = pickAt(e); if (!p) return;
    const ts = chart.timeScale(), x0 = ts.logicalToCoordinate(pickReq.o.from), hb = ts.options().barSpacing / 2; if (x0 === null) return;
    pickBand(Math.min(x0, p.x) - hb, Math.max(x0, p.x) + hb);
  });

  // ---- ✂ learning areas: mark bars that already happened (e.g. 20 × 5 min) – statistics and every indicator in numbers ------
  // are stored in Nexus Lab as a saved move (kind 'case'): the Lab learns from them and Claude sees them in the summary.
  const AREA_TYPES = [['brk_vol', '⚡ Prudký prieraz s veľkým objemom'], ['brk_low', '💨 Prudký prieraz bez veľkého objemu'], ['tl_wait', '📐 Čakanie na prieraz trendovej čiary'],
    ['after_vol', '🌊 Po pohybe s veľkým objemom (retracement)'], ['retest', '🎯 Pomalý retracement s malým objemom k presnej úrovni'], ['range', '▭ Konsolidácia / range'], ['other', '✎ Iné']];
  const AREA_KEYS = [['rsi.rsi', 'RSI'], ['rsi.slope', 'RSI zmena za 3 sv.'], ['macd.state', 'MACD histogram (stav −2…2)'], ['macd.cross', 'MACD nad / pod signálom'], ['stoch.k', 'Stochastic %K'],
    ['adx.adx', 'ADX'], ['cci.cci', 'CCI'], ['mfi.mfi', 'MFI'], ['bbpct.pb', 'Bollinger %B'], ['vol.x', 'Objem × priemer 20'], ['vol.buy', 'Nákupy % z objemu'], ['bar.body', 'Telo sviečky (ATR)'],
    ['ret.20', 'Pohyb za 20 sv. (ATR)'], ['atr.pct', 'Volatilita ATR (percentil)']];
  const avg = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN), r2 = x => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
  function areaStats(X, i0, i1) {
    const F = LAB.build(X), A = F.atr, { o, h, l, c, v, bv } = X, a = A[i0] > 0 ? A[i0] : A[i1], n = i1 - i0 + 1, seg = arr => arr.slice(i0, i1 + 1);
    const dir = Math.sign(c[i1] - o[i0]) || 1, hi = Math.max(...seg(h)), lo = Math.min(...seg(l));
    const prevVol = avg(v.slice(Math.max(0, i0 - 20), i0).filter(x => x > 0)) || avg(seg(v)) || 1;
    let jv = i0, jb = i0, jx = i0;
    for (let j = i0; j <= i1; j++) { if (v[j] > v[jv]) jv = j; if (Math.abs(c[j] - o[j]) > Math.abs(c[jb] - o[jb])) jb = j; if (dir > 0 ? h[j] > h[jx] : l[j] < l[jx]) jx = j; }
    // impulse up to the extreme in the direction of the move, retracement after it
    const ext = dir > 0 ? h[jx] : l[jx], imp = (ext - o[i0]) * dir;
    let jr = jx; for (let j = jx + 1; j <= i1; j++) if (dir > 0 ? l[j] < l[jr] : h[j] > h[jr]) jr = j;
    const pr = jr > jx ? (dir > 0 ? l[jr] : h[jr]) : ext, back = (ext - pr) * dir;
    const volImp = avg(v.slice(i0, jx + 1)), volBack = jx < i1 ? avg(v.slice(jx + 1, i1 + 1)) : NaN;
    let sharp = 0, js = i0; for (let j = i0; j + 2 <= i1; j++) { const m = Math.abs(c[j + 2] - o[j]) / (A[j] || a); if (m > sharp) { sharp = m; js = j; } }
    let bs = 0, bt = 0; for (let j = i0; j <= i1; j++) if (Number.isFinite(bv[j]) && v[j] > 0) { bs += bv[j]; bt += v[j]; }
    // auto trendlines and levels known up to the end of the area: what happened at them inside it
    let evs = [], lines = 0, near = null;
    try {
      const R = TL.run(sliceD(X, i1 + 1), { k: S.auto.k || TL.zigK(S.tf, TF_SEC[S.tf]) });
      evs = R.events.filter(e => e.i >= i0 && e.i <= i1).map(e => ({ i: e.i, sig: e.signal, dir: e.dir, what: e.what }));
      const live = x => x.created <= i1 && (x.ended == null || x.ended >= i0);
      lines = R.lines.filter(x => live(x) && x.touches >= 3).length;
      if (back > 0) {        // where the retracement stopped: the nearest level or line, in ATR
        for (const lv of R.levels.filter(x => live(x) && x.touches >= 2 && x.created <= jr)) { const d = Math.abs(lv.price - pr) / a; if (!near || d < near.dist) near = { what: `úroveň (${lv.touches}× dotyk)`, dist: r2(d), price: lv.price }; }
        for (const ln of R.lines.filter(x => live(x) && x.created <= jr)) { const lp = R.value(ln, jr), d = Math.abs(lp - pr) / a; if (Number.isFinite(d) && (!near || d < near.dist)) near = { what: `trendová čiara (${ln.touches}× dotyk)`, dist: r2(d), price: lp }; }
      }
    } catch (e) {}
    const st = { n, dir, move: r2((c[i1] - o[i0]) / a), pct: r2(100 * (c[i1] - o[i0]) / o[i0]), range: r2((hi - lo) / a), hi, lo, atr: a,
      volX: r2(avg(seg(v)) / prevVol), maxVolX: r2(v[jv] / prevVol), jv: jv - i0, buy: bt ? Math.round(100 * bs / bt) : null,
      body: r2(Math.abs(c[jb] - o[jb]) / (A[jb] || a)), bodyVolX: r2(v[jb] / prevVol), jb: jb - i0, sharp: r2(sharp), js: js - i0,
      imp: r2(imp / a), impBars: jx - i0 + 1, impVolX: r2(volImp / prevVol), back: imp > 0 ? Math.round(100 * back / imp) : 0, backVol: Number.isFinite(volBack) && volImp > 0 ? r2(volBack / volImp) : null,
      lines, brk: evs.filter(e => /BREAK/.test(e.sig)).length, touch: evs.filter(e => /TOUCH|BOUNCE/.test(e.sig)).length, near };
    st.type = st.back >= 30 && st.impVolX >= 1.5 && st.backVol !== null && st.backVol < 0.8 ? (near && near.dist <= 0.25 ? 'retest' : 'after_vol')
      : st.sharp >= 2 || st.body >= 1.2 ? (st.maxVolX >= 2 ? 'brk_vol' : 'brk_low') : st.range <= 2.5 ? (lines ? 'tl_wait' : 'range') : 'other';
    return { F, st, evs };
  }
  // your entry inside the area: which came first after it, the stop or the target (on the bars we have)
  function entryResult(X, j, dir, price, sl, tp) {
    for (let k = j + 1; k < X.c.length; k++) {
      if (sl && (dir > 0 ? X.l[k] <= sl : X.h[k] >= sl)) return { hit: -1, bars: k - j, pnl: r2((sl - price) * dir) };
      if (tp && (dir > 0 ? X.h[k] >= tp : X.l[k] <= tp)) return { hit: 1, bars: k - j, pnl: r2((tp - price) * dir) };
    }
    const k = X.c.length - 1; return { hit: 0, bars: k - j, pnl: r2((X.c[k] - price) * dir) };
  }
  async function areaLearn() {
    if (EMBED || !chart) return;
    const a = await pickChart('✂ Oblasť na učenie: klikni na PRVÚ sviečku', { bar: true }); if (!a || a.i == null) return;
    const b = await pickChart('✂ Teraz klikni na POSLEDNÚ sviečku oblasti', { from: a.i }); if (!b || b.i == null) return;
    // Heikin Ashi / Renko change the bars: the statistics use the real candles of that time
    const R = src(), t0 = disp[Math.min(a.i, b.i)].time, t1 = disp[Math.max(a.i, b.i)].time;
    const i0 = Math.max(0, R.findIndex(x => x.time >= t0)), ix = R.findIndex(x => x.time > t1), i1 = (ix < 0 ? R.length : ix) - 1;
    if (i1 - i0 < 2) { toast('Oblasť musí mať aspoň 3 sviečky'); return; }
    if (i1 - i0 > 400) { toast('Oblasť je príliš dlhá (najviac 400 sviečok)'); return; }
    if (i0 < 30) toast('Pozor: pred oblasťou je málo sviečok – niektoré indikátory ešte nemajú hodnotu');
    areaDialog(toD(R), i0, i1);
  }
  function areaDialog(X, i0, i1) {
    const { F, st, evs } = areaStats(X, i0, i1), m = KS.macd(X.c, 12, 26, 9), rs = KS.rsi(X.c, 14), dg = sym().digits ?? 2;
    const when = t => tzf({ day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(t * 1000));
    const num = x => (Number.isFinite(x) ? (Math.abs(x) >= 1000 ? fmt(x) : x.toFixed(Math.abs(x) >= 100 ? 1 : 2)) : '–');
    const sgn = x => (x > 0 ? '+' : '') + num(x), fA = LAB.featuresAt(F, i0), fC = LAB.featuresAt(F, i1);
    const E = { j: i0 + st.jb, dir: st.dir };
    const setE = () => { E.price = X.c[E.j]; E.sl = E.dir > 0 ? Math.min(...X.l.slice(i0, E.j + 1)) : Math.max(...X.h.slice(i0, E.j + 1)); E.tp = E.price + 2 * (E.price - E.sl); };
    setE();
    const card = (k, v, s) => `<div><small>${k}</small><b>${v}</b>${s ? `<span>${s}</span>` : ''}</div>`;
    const d = openDialog(`<div class="dlg-h"><span>✂ Oblasť na učenie · ${esc(sym().name)} ${S.tf} · ${st.n} sviečok · ${when(X.t[i0])} – ${when(X.t[i1])}</span><button class="ib" data-x>✕</button></div>
      <div class="dlg-b ar-dlg">
        <div class="ar-sum">
          ${card('Pohyb', `<span class="${st.dir > 0 ? 'up' : 'dn'}">${sgn(st.move)} ATR</span>`, `${sgn(st.pct)} % · rozsah ${num(st.range)} ATR`)}
          ${card('Objem v oblasti', `${num(st.volX)}×`, `oproti 20 sviečkam pred ňou${st.buy !== null ? ` · nákupy ${st.buy} %` : ''}`)}
          ${card('Najväčší objem', `${num(st.maxVolX)}×`, `sviečka ${st.jv + 1}`)}
          ${card('Najprudší pohyb', `${num(st.sharp)} ATR`, `za 3 sviečky od ${st.js + 1}. · najväčšie telo ${num(st.body)} ATR pri objeme ${num(st.bodyVolX)}×`)}
          ${card('Impulz', `${num(st.imp)} ATR`, `${st.impBars} sviečok · objem ${num(st.impVolX)}×`)}
          ${card('Retracement', `${st.back} %`, st.backVol !== null ? `objem ${num(st.backVol)}× impulzu${st.backVol < 0.8 ? ' (pomalý, slabý)' : ''}` : 'žiadny')}
          ${card('Čiary a úrovne', `${st.lines} čiar 3+`, `${st.touch} dotykov · ${st.brk} prierazov`)}
          ${card('Retracement skončil pri', st.near ? `${num(st.near.dist)} ATR` : '–', st.near ? `${esc(st.near.what)} ${st.near.price.toFixed(dg)}` : 'žiadna blízka úroveň')}
        </div>
        <div class="fld"><span>Typ situácie</span><select data-ty>${AREA_TYPES.map(([k, n]) => `<option value="${k}" ${k === st.type ? 'selected' : ''}>${n}</option>`).join('')}</select><small class="muted">predvolený = odhad z čísel</small></div>
        <div class="sec2">Tvoj vstup</div>
        <div class="fld ar-e"><span>Sviečka a smer</span><select data-ej>${Array.from({ length: st.n }, (_, k) => `<option value="${i0 + k}" ${i0 + k === E.j ? 'selected' : ''}>${k + 1}. · ${when(X.t[i0 + k])} · ${X.c[i0 + k].toFixed(dg)}</option>`).join('')}</select>
          <select data-ed><option value="1" ${E.dir > 0 ? 'selected' : ''}>▲ Long</option><option value="-1" ${E.dir < 0 ? 'selected' : ''}>▼ Short</option></select></div>
        <div class="fld ar-e"><span>Vstup · SL · TP</span><input data-ev="price" type="number" step="any"><input data-ev="sl" type="number" step="any" placeholder="SL"><input data-ev="tp" type="number" step="any" placeholder="TP"></div>
        <div class="ar-res"></div>
        <div class="sec2">Indikátory v číslach</div>
        <div class="ar-tw"><table class="ar-t"></table></div>
        ${evs.length ? `<div class="sec2">Udalosti v oblasti</div><div class="ar-ev">${evs.map(e => `<span class="${e.dir > 0 ? 'up' : 'dn'}">${e.i - i0 + 1}. ${esc((TL.NAMES || {})[e.sig] || e.sig)}</span>`).join('')}</div>` : ''}
        <div class="fld"><span>Poznámka</span><textarea data-note rows="2" placeholder="Čo si tu videl, prečo vstup, čo by si nabudúce urobil inak…"></textarea></div>
      </div>
      <div class="dlg-f"><button class="btn" data-lab title="Uložené oblasti nájdeš v Nexus Lab → ✂ Uložené">🧪 Nexus Lab</button><span class="grow"></span><button class="btn" data-x>Zrušiť</button><button class="btn pri" data-save>💾 Uložiť do učenia</button></div>`, null, 'ar-wide');
    const paint = () => {
      const fB = LAB.featuresAt(F, E.j), rows = [['MACD', m.macd], ['MACD signál', m.signal], ['MACD histogram', m.hist]].map(([n, arr]) => [n, arr[i0], arr[E.j], arr[i1]])
        .concat(AREA_KEYS.map(([k, n]) => [n, fA[k], fB[k], fC[k]]));
      $('.ar-t', d).innerHTML = `<tr><th></th><th>Začiatok<small>${when(X.t[i0])}</small></th><th>Tvoj vstup<small>${when(X.t[E.j])}</small></th><th>Koniec<small>${when(X.t[i1])}</small></th></tr>` +
        rows.map(([n, a, b, c]) => `<tr><td>${n}</td><td>${num(a)}</td><td><b>${num(b)}</b></td><td>${num(c)}</td></tr>`).join('');
      for (const k of ['price', 'sl', 'tp']) { const x = $(`[data-ev="${k}"]`, d); if (document.activeElement !== x) x.value = Number.isFinite(E[k]) ? E[k].toFixed(dg) : ''; }
      const r = entryResult(X, E.j, E.dir, E.price, E.sl, E.tp), risk = Math.abs(E.price - E.sl);
      E.res = { ...r, rr: risk && E.tp ? r2(Math.abs(E.tp - E.price) / risk) : null, r: risk ? r2(r.pnl / risk) : null };
      $('.ar-res', d).innerHTML = `${r.hit > 0 ? '<b class="up">✓ TP prišiel prvý</b>' : r.hit < 0 ? '<b class="dn">✗ SL prišiel prvý</b>' : '<b>… ešte ani SL, ani TP</b>'} za ${r.bars} sviečok · ${sgn(r.pnl)} b${E.res.r !== null ? ` · ${sgn(E.res.r)} R` : ''}${E.res.rr ? ` · plán R:R 1:${E.res.rr}` : ''}`;
    };
    paint();
    $('[data-ej]', d).onchange = e => { E.j = +e.target.value; setE(); paint(); };
    $('[data-ed]', d).onchange = e => { E.dir = +e.target.value; setE(); paint(); };
    $$('[data-ev]', d).forEach(x => x.onchange = () => { E[x.dataset.ev] = x.value === '' ? null : +x.value; paint(); });
    $$('[data-x]', d).forEach(x => x.onclick = closeDialog);
    $('[data-lab]', d).onclick = () => window.open('lab', '_blank');
    $('[data-save]', d).onclick = async () => {
      const ty = $('[data-ty]', d).value, note = $('[data-note]', d).value.trim(), pick = f => Object.fromEntries(AREA_KEYS.map(([k]) => [k, f[k]]).filter(([, x]) => Number.isFinite(x)));
      const rec = LAB.caseRecord(F, { symbol: S.symbol, tf: S.tf }, i0, i1, S.labeler || '', `[${AREA_TYPES.find(t => t[0] === ty)[1]}] ${note}`.trim());
      rec.outcome = { ...rec.outcome, setup: ty, area: st, fEnd: pick(fC),
        entry: { t: X.t[E.j], bar: E.j - i0 + 1, dir: E.dir, price: E.price, sl: E.sl, tp: E.tp, res: E.res, rsi: r2(rs[E.j]), macd: r2(m.macd[E.j]), signal: r2(m.signal[E.j]), hist: r2(m.hist[E.j]), f: pick(LAB.featuresAt(F, E.j)) } };
      try { await LAB.api.save([rec]); } catch (e) { toast('⚠ Uloženie zlyhalo: ' + e.message); return; }
      if (LAB.forget) LAB.forget('case');
      closeDialog(); toast(`✂ Uložené do učenia: ${AREA_TYPES.find(t => t[0] === ty)[1]} · ${st.n} sviečok${S.labeler ? '' : ' (bez mena – nastav ho v Nexus → Účet)'}`);
    };
  }

  // ---- 🪟 floating indicators: MACD, RSI… (and volume if you want) in their own box over the chart -----------------------
  // The box has its own small chart and price scale, follows the main chart's time range and crosshair, and never takes
  // height from the candles. Drag it by its title, resize it by the corner, drag its price axis to scale it.
  // s.float: true / false per indicator, undefined = the Add-ons switch (S.addons.float); s.box = {x, y, w, h} in % of the chart.
  function isFloat(s, def = KS.STUDIES[s.type]) {
    if (!def || def.custom || def.pattern || s.overlay) return false;
    if (def.pane === true) return s.float ?? !!S.addons.float;
    return s.type === 'volume' && s.float === true;
  }
  const clampN = (a, v, b) => Math.max(a, Math.min(b, v));
  function placeFloat(u) { const b = u.s.box; Object.assign(u.fel.style, { left: b.x + '%', top: b.y + '%', width: b.w + '%', height: b.h + '%' }); }
  function makeFloat(u, k) {
    const s = u.s, wrap = $('#chartWrap');
    if (!s.box) s.box = { x: 1 + (k % 2) * 45, y: clampN(4, 70 - Math.floor(k / 2) * 27, 90), w: 43, h: 25 };
    const el = u.fel = document.createElement('div'); el.className = 'fl-box no-chart';
    el.innerHTML = `<div class="fl-h"><span class="fl-n">${esc(u.def.label(s))}</span><span class="fl-v"></span><span class="grow"></span>
      <button data-fa="cfg" title="Nastavenia indikátora">⚙</button><button data-fa="dock" title="Späť do panela pod grafom">⇲</button><button data-fa="hide" title="Skryť">✕</button></div>
      <div class="fl-c"></div><span class="fl-rz" title="Ťahaj = veľkosť okna"></span>`;
    wrap.appendChild(el); placeFloat(u);
    const L = S.look;
    u.fc = LW.createChart($('.fl-c', el), { autoSize: true,
      layout: { background: { type: 'solid', color: 'rgba(0,0,0,0)' }, textColor: L.text, fontSize: Math.max(9, L.fontSize - 1), fontFamily: fontCss(L.font), attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: rgba(L.gridH.color, 45), visible: L.gridH.on } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.08 } }, timeScale: { visible: false, borderVisible: false },
      crosshair: { mode: 0, vertLine: { labelVisible: false, color: rgba(S.crosshair.color, 60) }, horzLine: { color: rgba(S.crosshair.color, 60) } },
      handleScroll: false, handleScale: { axisPressedMouseMove: { time: false, price: true }, axisDoubleClickReset: { price: true, time: false }, mouseWheel: false, pinch: false } });
    // move by the title, resize by the corner (in % of the chart, so it fits any window size)
    const drag = (handle, fn) => {
      let d = null;
      handle.addEventListener('pointerdown', e => { if (e.button !== 0 || e.target.closest('button')) return; d = { x: e.clientX, y: e.clientY, b: { ...s.box }, W: wrap.getBoundingClientRect() }; handle.setPointerCapture(e.pointerId); e.preventDefault(); e.stopPropagation(); el.classList.add('drag'); });
      handle.addEventListener('pointermove', e => { if (!d) return; fn(d, 100 * (e.clientX - d.x) / d.W.width, 100 * (e.clientY - d.y) / d.W.height); placeFloat(u); });
      handle.addEventListener('pointerup', () => { if (d) { d = null; el.classList.remove('drag'); save(); } });
    };
    drag($('.fl-h', el), (d, dx, dy) => { s.box.x = clampN(0, d.b.x + dx, 100 - s.box.w); s.box.y = clampN(0, d.b.y + dy, 100 - 5); });
    drag($('.fl-rz', el), (d, dx, dy) => { s.box.w = clampN(12, d.b.w + dx, 100 - s.box.x); s.box.h = clampN(8, d.b.h + dy, 100 - s.box.y); });
    el.addEventListener('click', e => { const a = e.target.closest('[data-fa]'); if (!a) return;
      if (a.dataset.fa === 'cfg') studySettings(s); else if (a.dataset.fa === 'dock') { s.float = false; studiesChanged(); toast(`${u.def.name}: späť v paneli pod grafom (🧩 Add-ons ho vráti do okna)`); } else { s.visible = false; studiesChanged(); } });
    el.addEventListener('dblclick', e => { if (e.target.closest('.fl-h')) studySettings(s); });
  }
  function destroyFloats() { for (const u of units || []) if (u.fc) { try { u.fc.remove(); } catch (e) {} u.fel.remove(); u.fc = null; } $$('#chartWrap .fl-box').forEach(x => x.remove()); }
  function syncFloats(r) { if (!r) return; for (const u of units) if (u.fc) u.fc.timeScale().setVisibleLogicalRange(r); }
  // the crosshair and the values of the bar under the mouse (the last bar otherwise)
  function floatCross(p) {
    const n = D ? D.t.length : 0;
    for (const u of units) {
      if (!u.fc) continue;
      const i = p && p.logical !== undefined && p.time !== undefined ? clampN(0, Math.round(p.logical), n - 1) : n - 1;
      const keys = Object.keys(u.values).filter(k => u.values[k] && (!u.s.plots[k] || u.s.plots[k].visible !== false));
      $('.fl-v', u.fel).innerHTML = keys.slice(0, 4).map(k => { const v = u.values[k][i], st = u.s.plots[k] || u.s.plots.h1 || {};
        return `<b style="color:${st.color || 'inherit'}">${Number.isFinite(v) ? (Math.abs(v) >= 1e4 ? (v / 1e3).toFixed(1) + 'K' : v.toFixed(Math.abs(v) >= 100 ? 1 : 2)) : '–'}</b>`; }).join(' ');
      if (p && p.time !== undefined && u.host) { const v = keys.map(k => u.values[k][i]).find(Number.isFinite); if (Number.isFinite(v)) u.fc.setCrosshairPosition(v, p.time, u.host); }
      else u.fc.clearCrosshairPosition();
    }
  }

  // pane index of the price chart (indicator panels can sit above it) and its top edge inside #chart
  let mainIdx = 0;
  const mainTop = () => { if (!chart || !mainIdx) return 0; const P = chart.panes(); let t = 0; for (let i = 0; i < mainIdx; i++) t += P[i].getHeight() + 1; return t; };
  function buildChart(keepRange) {
    const tB = performance.now();
    // undefined = keep the current zoom; null = new data, start fresh (alert focus or the newest bars)
    const range = keepRange === undefined ? (chart ? chart.timeScale().getVisibleLogicalRange() : null) : keepRange;
    destroyFloats();
    if (chart) { chart.remove(); chart = null; }
    document.body.style.setProperty('--bg', S.look.bg);
    disp = transform(src()); D = toD(disp);
    chart = LW.createChart(el, chartOptions());
    main = mainSeries(chart);
    main.setData(mainData());
    markersApi = LW.createSeriesMarkers(main, []);
    units = []; mainIdx = 0;
    let pane = 1;
    for (const s of studies) {
      if (!shown(s) || hideL.studies || S.hideStudies) continue;
      const def = KS.STUDIES[s.type];
      const ov = def.pane === true && s.overlay, fl = isFloat(s, def), u = { s, def, ov: ov ? 'ov' + units.length : null, pane: def.pane === true && !ov && !fl ? pane++ : 0, lines: {}, hists: {}, values: {}, fill: null, levels: false, host: null, marks: [] };
      if (fl) makeFloat(u, units.filter(x => x.fc).length);
      units.push(u);
      { const t1 = performance.now(); refreshUnit(u); u.ms = performance.now() - t1; }
    }
    // indicator panels marked "above" go over the price chart, the rest under it; u.pane then holds the real index
    const pu = units.filter(u => u.pane > 0), above = pu.filter(u => u.s.above);
    if (above.length) {
      const P = chart.panes(), order = [...above.map(u => u.pane), 0, ...pu.filter(u => !u.s.above).map(u => u.pane)], at = {};
      order.forEach((old, i) => { P[old].moveTo(i); at[old] = i; });
      mainIdx = above.length;
      for (const u of units) u.pane = at[u.pane];
    }
    const panes = chart.panes();
    if (panes.length > 1) panes.forEach((p, i) => p.setStretchFactor(i === mainIdx ? Math.max(2, 6 - panes.length) : 1));
    if (!units.some(u => u.def.custom === 'obheat')) bookClose();
    autoLayer = new AutoLayer(); main.attachPrimitive(autoLayer);
    structLayer = new StructLayer(); main.attachPrimitive(structLayer); stKey = ''; computeStruct();
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
    showOHLC(); if (mainIdx) requestAnimationFrame(() => showOHLC());
    chart.subscribeCrosshairMove(p => { lastCross = p; crossTime = p && p.time !== undefined ? p.time : null; showOHLC(crossTime); floatCross(p); });
    if (!S.addons.fl0) { S.addons.fl0 = 1; S.addons.floatBg = 0; } // floating windows became transparent (v29)
    $('#chartWrap').style.setProperty('--fl-bg', ((S.addons.floatBg ?? 0) / 100).toFixed(2));
    const ts = chart.timeScale();
    if (range) ts.setVisibleLogicalRange(range);
    else if (view.focus !== undefined) focusOn(view.focus);
    else { ts.applyOptions({ barSpacing: S.look.candle.spacing }); ts.scrollToRealTime(); }
    ts.subscribeVisibleLogicalRangeChange(r => { if (r && r.from < 30) loadOlder(); syncFloats(r); });
    if (units.some(u => u.fc)) requestAnimationFrame(() => { if (chart) { syncFloats(chart.timeScale().getVisibleLogicalRange()); floatCross(null); } });
    if (S.addons.follow && !range) followTick(true);
    paintAddonsBtn();
    perf.build = performance.now() - tB;
  }
  function focusOn(time) {
    const i = disp.findIndex(b => b.time >= time);
    if (i < 0) return;
    chart.timeScale().setVisibleLogicalRange({ from: i - 90, to: i + 50 });
  }
  let heavyAt = 0, heavyT = null;
  function liveTick() {
    if (!chart) return;
    const n = raw.length;
    if (S.type !== 'ha' && S.type !== 'renko' && !view.replay && disp === raw && D && D.t.length === n && n) {
      const i = n - 1, b = raw[i];
      D.o[i] = b.open; D.h[i] = b.high; D.l[i] = b.low; D.c[i] = b.close; D.v[i] = b.volume || 0; D.bv[i] = b.buy ?? NaN;
      main.update(pointOf(b, i));
      if (window.NEXUS && NEXUS.tick) NEXUS.tick();
      if (crossTime === null || crossTime === undefined) showOHLC();
      followTick();
      if (document.hidden) return;
      const gap = EMBED ? 2000 : 1000, wait = gap - (Date.now() - heavyAt);
      if (wait <= 0) refreshAll(); else if (!heavyT) heavyT = setTimeout(() => { heavyT = null; if (!document.hidden) refreshAll(); }, wait);
      return;
    }
    refreshAll();          // a new bar (or Heikin Ashi / Renko / replay): everything at once
  }
  // Re-run the indicators and push new data into the existing series (new bars, older history, every second while live).
  function refreshAll() {
    if (!chart) return;
    heavyAt = Date.now(); clearTimeout(heavyT); heavyT = null;
    disp = transform(src()); D = toD(disp);
    main.setData(mainData());
    const tT = performance.now();
    units.forEach(u => { const t1 = performance.now(); refreshUnit(u); u.ms = performance.now() - t1; });
    perf.tick = performance.now() - tT;
    if (computeTL()) { checkNewIdeas(); if (S.idea.open && S.idea.tab === 'live') renderIdea(); }
    autoLayer && autoLayer.update();
    computeStruct(); structLayer && structLayer.update();
    bubbles && bubbles.update();
    applyTint();
    if (window.NEXUS && NEXUS.tick) NEXUS.tick();
    updateMarkers();
    draw.redraw();
    showOHLC();
    if (crossTime === null || crossTime === undefined) floatCross(null);
    followTick();
  }
  function lineOptions(u, st) {
    const prec = u.s.out.precision === 'auto' ? null : +u.s.out.precision;
    return { priceLineVisible: false, crosshairMarkerVisible: false, lastValueVisible: u.s.out.priceLabels,
      color: rgba(st.color, st.opacity * (u.s.alpha ?? 100) / 100), lineWidth: st.width, lineStyle: st.style, visible: st.visible,
      lineType: st.type === 3 ? 0 : st.type, lineVisible: st.type !== 3, pointMarkersVisible: st.type === 3,
      ...(st.type === 3 ? { pointMarkersRadius: st.width + 1 } : {}),
      ...(prec === null ? {} : { priceFormat: { type: 'price', precision: prec, minMove: 1 / 10 ** prec } }),
      ...(u.pane === mainIdx && !u.ov && !u.fc && u.s.type !== 'volume' ? { autoscaleInfoProvider: () => null } : {}) };
  }
  // ---- custom volume layers: volume profile (VPVR), volume heatmap, live order book heatmap ----------------------
  // A bar's volume is spread evenly over its high–low range (the exchange gives no volume per price for candles).
  const HEAT = [[0, [20, 40, 120, 0]], [0.25, [30, 90, 200, 0.55]], [0.5, [0, 200, 200, 0.75]], [0.75, [255, 214, 0, 0.88]], [1, [255, 60, 30, 0.95]]];
  const heatColor = (v, op) => {
    v = Math.max(0, Math.min(1, v));
    for (let k = 1; k < HEAT.length; k++) if (v <= HEAT[k][0]) { const [a, ca] = HEAT[k - 1], [b, cb] = HEAT[k], f = (v - a) / (b - a); const c = ca.map((x, j) => x + (cb[j] - x) * f); return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${c[3] * op})`; }
    return `rgba(255,60,30,${op})`;
  };
  const book = { sym: null, ws: null, cols: new Map(), last: null };       // order book: bar time → Map(price bin → max qty)
  function bookConnect() {
    const sy = sym(), key = S.symbol + '|' + S.tf;
    if (book.sym === key && book.ws) return;
    if (book.ws) { book.ws.onclose = null; book.ws.close(); }
    book.sym = key; book.cols = new Map(); book.last = null;
    const url = sy.market === 'spot' ? `wss://stream.binance.com:9443/ws/${sy.ticker.toLowerCase()}@depth20@1000ms` : `wss://fstream.binance.com/public/ws/${sy.ticker.toLowerCase()}@depth20@500ms`;
    const ws = book.ws = new WebSocket(url);
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data), bids = m.b || m.bids || [], asks = m.a || m.asks || [];
      const off = sy.off || 0, levels = [...bids.map(([p, q]) => [+p + off, +q, 1]), ...asks.map(([p, q]) => [+p + off, +q, -1])];
      book.last = levels;
      const t = raw.length ? raw[raw.length - 1].time : 0;
      let col = book.cols.get(t); if (!col) { col = new Map(); book.cols.set(t, col); if (book.cols.size > 600) book.cols.delete(book.cols.keys().next().value); }
      for (const [p, q] of levels) col.set(p, Math.max(col.get(p) || 0, q));
      units.forEach(u => u.layer && u.def.custom === 'obheat' && u.layer.update());
    };
    ws.onclose = () => { book.ws = null; };
  }
  function bookClose() { if (book.ws) { book.ws.onclose = null; book.ws.close(); book.ws = null; } book.sym = null; }
  class VolLayer {
    constructor(u) { this.u = u; this.p = null; }
    attached(p) { this.p = p; } detached() { this.p = null; if (this.u.def.custom === 'obheat') bookClose(); }
    update() { if (this.p) this.p.requestUpdate(); }
    updateAllViews() {}
    paneViews() { return [{ zOrder: () => (this.u.def.custom === 'vprofile' ? 'top' : 'bottom'), renderer: () => ({ draw: t => this.draw(t) }) }]; }
    range() {
      const ts = this.p.chart.timeScale(), vr = ts.getVisibleLogicalRange(), n = D.t.length;
      const i0 = Math.max(0, Math.floor(vr ? vr.from : 0)), i1 = Math.min(n - 1, Math.ceil(vr ? vr.to : n - 1));
      let lo = Infinity, hi = -Infinity; for (let i = i0; i <= i1; i++) { lo = Math.min(lo, D.l[i]); hi = Math.max(hi, D.h[i]); }
      return { i0, i1, lo, hi };
    }
    draw(target) {
      if (!this.p || !D || D.t.length < 2 || !this.u.s.visible) return;
      const kind = this.u.def.custom, I = this.u.s.inputs, series = this.p.series, ts = this.p.chart.timeScale();
      const { i0, i1, lo, hi } = this.range(); if (!(hi > lo)) return;
      target.useMediaCoordinateSpace(({ context: ctx, mediaSize: { width: W } }) => {
        if (kind === 'vprofile') {
          const rows = I.rows, step = (hi - lo) / rows, buy = new Array(rows).fill(0), sell = new Array(rows).fill(0);
          for (let i = i0; i <= i1; i++) {
            const a = Math.max(0, Math.floor((D.l[i] - lo) / step)), b = Math.min(rows - 1, Math.floor((D.h[i] - lo) / step)), k = b - a + 1;
            const bv = Number.isFinite(D.bv[i]) ? D.bv[i] : D.v[i] / 2, sv = D.v[i] - bv;
            for (let r = a; r <= b; r++) { buy[r] += bv / k; sell[r] += sv / k; }
          }
          const tot = buy.map((v, r) => v + sell[r]), max = Math.max(...tot), poc = tot.indexOf(max), all = tot.reduce((x, y) => x + y, 0);
          // value area: grow around the POC until it holds va % of the volume
          let va0 = poc, va1 = poc, acc = tot[poc];
          while (acc < all * I.va / 100 && (va0 > 0 || va1 < rows - 1)) { const dn = va0 > 0 ? tot[va0 - 1] : -1, up = va1 < rows - 1 ? tot[va1 + 1] : -1; if (up >= dn) acc += tot[++va1]; else acc += tot[--va0]; }
          const PL = this.u.s.plots, maxW = W * I.width / 100, right = !I.side;
          for (let r = 0; r < rows; r++) {
            const y0 = series.priceToCoordinate(lo + (r + 1) * step), y1 = series.priceToCoordinate(lo + r * step); if (y0 === null || y1 === null) continue;
            const h = Math.max(1, y1 - y0 - 1), wb = maxW * buy[r] / max, ws = maxW * sell[r] / max, inVA = r >= va0 && r <= va1, dim = inVA ? 1 : 0.45;
            const x0 = right ? W - wb - ws : 0;
            ctx.fillStyle = rgba(PL.buy.color, PL.buy.opacity * dim); ctx.fillRect(x0, y0, wb, h);
            ctx.fillStyle = rgba(PL.sell.color, PL.sell.opacity * dim); ctx.fillRect(x0 + wb, y0, ws, h);
            if (inVA && (r === va0 || r === va1)) { ctx.fillStyle = rgba(PL.va.color, PL.va.opacity); ctx.fillRect(right ? W - maxW : 0, r === va1 ? y0 : y0 + h - 1, maxW, 1); }
          }
          const yp = series.priceToCoordinate(lo + (poc + 0.5) * step);
          if (yp !== null) { ctx.strokeStyle = rgba(PL.poc.color, PL.poc.opacity); ctx.lineWidth = PL.poc.width; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(0, yp); ctx.lineTo(W, yp); ctx.stroke(); ctx.setLineDash([]);
            ctx.fillStyle = rgba(PL.poc.color, 100); ctx.font = '600 10px system-ui'; ctx.textAlign = right ? 'right' : 'left'; ctx.fillText(`POC ${fmt(lo + (poc + 0.5) * step)}`, right ? W - maxW - 6 : maxW + 6, yp - 3); }
          return;
        }
        const rows = I.rows, step = (hi - lo) / rows, op = I.opacity / 100, bs = ts.options().barSpacing, cw = Math.max(1, bs);
        const yOf = r => [series.priceToCoordinate(lo + (r + 1) * step), series.priceToCoordinate(lo + r * step)];
        if (kind === 'vheat') {
          // rolling volume profile of the last `win` bars for every column: high-volume price zones show as bands over time
          const grid = [], win = I.win || 50, acc = new Array(rows).fill(0); let max = 0;
          const put = (i, sgn) => { if (i < 0) return; const a = Math.floor((D.l[i] - lo) / step), b = Math.floor((D.h[i] - lo) / step), k = b - a + 1;
            for (let r = Math.max(0, a); r <= Math.min(rows - 1, b); r++) acc[r] += sgn * D.v[i] / k; };
          for (let i = Math.max(0, i0 - win + 1); i < i0; i++) put(i, 1);
          for (let i = i0; i <= i1; i++) { put(i, 1); put(i - win, -1); const col = acc.map(v => Math.max(0, v)); grid.push(col); max = Math.max(max, ...col); }
          grid.forEach((col, j) => { const x = ts.logicalToCoordinate(i0 + j); if (x === null) return;
            col.forEach((v, r) => { if (!v) return; const [y0, y1] = yOf(r); if (y0 === null || y1 === null) return; ctx.fillStyle = heatColor(Math.sqrt(v / max), op); ctx.fillRect(x - cw / 2, y0, cw, y1 - y0); }); });
          return;
        }
        // order book heatmap: columns collected live (bar time → price → biggest resting size), plus the book right now on the right
        bookConnect();
        let max = 0; for (const col of book.cols.values()) for (const q of col.values()) max = Math.max(max, q);
        if (!max) { ctx.fillStyle = 'rgba(149,152,161,.8)'; ctx.font = '12px system-ui'; ctx.fillText('Heatmapa knihy príkazov: zbieram dáta z Binance…', 12, 40); return; }
        for (const [t, col] of book.cols) {
          const i = D.t.indexOf(t); if (i < 0) continue; const x = ts.logicalToCoordinate(i); if (x === null) continue;
          const bins = new Map(); for (const [p, q] of col) { if (p < lo || p > hi) continue; const r = Math.floor((p - lo) / step); bins.set(r, (bins.get(r) || 0) + q); }
          for (const [r, q] of bins) { const [y0, y1] = yOf(r); if (y0 === null || y1 === null) continue; ctx.fillStyle = heatColor(Math.sqrt(q / max), op); ctx.fillRect(x - cw / 2, y0, cw, Math.max(1, y1 - y0)); }
        }
        if (book.last) {
          const lmax = Math.max(...book.last.map(l => l[1]));
          for (const [p, q, side] of book.last) { const y = series.priceToCoordinate(p); if (y === null) continue; const w = 80 * q / lmax;
            ctx.fillStyle = side > 0 ? 'rgba(38,166,154,.55)' : 'rgba(239,83,80,.55)'; ctx.fillRect(W - w, y - 1, w, 2); }
        }
      });
    }
  }
  function customLayer(u) { if (!u.layer) { u.layer = new VolLayer(u); main.attachPrimitive(u.layer); } u.layer.update(); }
  function refreshUnit(u) {
    const { s, def } = u, n = D.t.length, al = (s.alpha ?? 100) / 100, rgba = (c, op) => UI.rgba(c, (op ?? 100) * al);   // the indicator's own transparency
    if (def.pattern) { u.marks = KS.patternMarks(D, s); return; }
    if (def.custom) { customLayer(u); return; }
    const r = def.calc(D, s);
    // an oscillator laid over the price chart gets its own hidden scale in the bottom part of the chart
    const mk = (type, o) => { const x = u.fc ? u.fc.addSeries(type, o, 0) : chart.addSeries(type, u.ov ? { ...o, priceScaleId: u.ov } : o, u.pane); if (u.ov) x.priceScale().applyOptions({ scaleMargins: { top: 1 - (s.ovH || 30) / 100, bottom: 0.02 } }); return x; };
    const ser = (key, type, o) => (u.hists[key] = u.hists[key] || mk(type, o));
    if (s.type === 'volume') {
      const v = ser('vol', LW.HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', priceLineVisible: false, lastValueVisible: s.out.priceLabels });
      v.priceScale().applyOptions({ scaleMargins: u.fc ? { top: 0.1, bottom: 0 } : { top: 0.82, bottom: 0 } });
      const up = rgba(s.plots.up.color, s.plots.up.opacity), dn = rgba(s.plots.down.color, s.plots.down.opacity);
      v.setData(D.t.map((t, i) => ({ time: t, value: D.v[i], color: D.c[i] >= D.o[i] ? up : dn })));
      u.values.vol = D.v;
    }
    if (def.histogram4) {                     // MACD: 4 colours (growing / falling above and below zero)
      const h = r[def.histogram4], c = ['h1', 'h2', 'h3', 'h4'].map(k => rgba(s.plots[k].color, s.plots[k].opacity));
      ser('h4', LW.HistogramSeries, { priceLineVisible: false, lastValueVisible: s.out.priceLabels })
        .setData(D.t.map((t, i) => [t, h[i], h[i - 1]]).filter(([, v]) => Number.isFinite(v))
          .map(([time, v, p]) => ({ time, value: v, color: v >= 0 ? (Number.isFinite(p) && v < p ? c[1] : c[0]) : (Number.isFinite(p) && v > p ? c[2] : c[3]) })));
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
      while (list.length > groups.length) (u.fc || chart).removeSeries(list.pop());
      groups.forEach((g, gi) => {
        if (!list[gi]) list[gi] = mk(LW.LineSeries, { ...lineOptions(u, st), lastValueVisible: s.out.priceLabels && gi === groups.length - 1 });
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
      const target = u.pane === mainIdx && !u.ov && !u.fc ? main : u.host;
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
    if (S.tradeMarks && nx && nx.chartMarkers && D && D.t.length) {
      const T = D.t, barAt = t => { if (t < T[0]) return null; let lo = 0, hi = T.length - 1; while (lo < hi) { const k = (lo + hi + 1) >> 1; if (T[k] <= t) lo = k; else hi = k - 1; } return T[lo]; };
      // several trades on one bar (more entries, partial closes) → one marker with the total, not a stack
      const grp = new Map();
      for (const x of nx.chartMarkers(S.symbol)) {
        const time = barAt(x.time); if (time === null) continue;
        const key = `${time}|${x.kind}|${x.kind === 'in' ? x.dir : ''}`, g = grp.get(key) || grp.set(key, { time, kind: x.kind, dir: x.dir, n: 0, lots: 0, pnl: 0, text: x.text, ids: new Set() }).get(key);
        if (x.kind === 'in' && x.id !== undefined) { if (g.ids.has(x.id)) continue; g.ids.add(x.id); }   // a partly closed trade shows its entry once
        g.n++; g.lots += x.lots || 0; g.pnl += x.pnl || 0;
      }
      const usd = v => `${v < 0 ? '−' : '+'}$${Math.abs(v).toFixed(2)}`;
      for (const g of grp.values()) {
        const many = g.n > 1 ? ` (${g.n}×)` : '';
        if (g.kind === 'in') m.push({ time: g.time, position: g.dir > 0 ? 'belowBar' : 'aboveBar', color: g.dir > 0 ? '#00c853' : '#ff1744', shape: g.dir > 0 ? 'arrowUp' : 'arrowDown', text: g.n > 1 ? `${g.dir > 0 ? 'BUY' : 'SELL'} ${+g.lots.toFixed(2)}${many}` : g.text, size: 1.6 });
        else m.push({ time: g.time, position: g.dir > 0 ? 'aboveBar' : 'belowBar', color: g.pnl > 0 ? '#00c853' : '#ff1744', shape: 'square', text: g.n > 1 ? `✕ ${usd(g.pnl)}${many}` : g.text, size: 1 });
      }
    }
    m.push(...algoMarks());
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
    const lg = $('#legend'), lt = mainIdx ? 6 + mainTop() + 'px' : ''; if (lg.style.top !== lt) lg.style.top = lt;   // sits on the price chart
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
      (u.def.pane === true ? `<button class="lg-btn" data-a="up" title="Panel vyššie – až nad graf">↑</button><button class="lg-btn" data-a="dn" title="Panel nižšie – pod graf">↓</button>` : '') + `<button class="lg-btn" data-a="hide" title="Skryť">👁</button><button class="lg-btn" data-a="cfg" title="Nastavenia">⚙</button>` +
      `<button class="lg-btn" data-a="del" title="Odstrániť">✕</button></div>`).join('<br>') + '<br>' : '') + toggle;
    const t = $('#lgToggle'); if (t) t.onclick = () => { S.legendOpen = !S.legendOpen; save(); legendRows(); showOHLC(); };
    $$('#studies .lg-row').forEach(div => div.addEventListener('click', e => {
      const u = rows[+div.dataset.n], b = e.target.closest('button');
      if (!b) { if (e.detail === 2) studySettings(u.s); return; }
      if (b.dataset.a === 'up' || b.dataset.a === 'dn') movePanel(u.s, b.dataset.a === 'up' ? -1 : 1);
      else if (b.dataset.a === 'hide') { u.s.visible = false; studiesChanged(); }
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
    el, chart: () => chart, series: () => main, bars: () => disp, pane: () => mainIdx, top: mainTop,
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
      const m = JSON.parse(ev.data), off = sy.off || 0;
      let bar;
      if (m.e === 'kline') { const k = m.k; bar = { time: Math.floor(k.t / 1000), open: +k.o + off, high: +k.h + off, low: +k.l + off, close: +k.c + off, volume: +k.v, buy: +k.V, replace: true }; }
      else if (m.e === 'aggTrade') { const p = +m.p + off; bar = { time: Math.floor(m.T / 1000 / sec) * sec, open: p, high: p, low: p, close: p, volume: +m.q, buy: m.m ? 0 : +m.q }; }
      else return;
      if (S.hours && sy.hours === 'gold' && TF_SEC[tf] < 86400 && !goldOpen(bar.time)) return;
      const last = raw[raw.length - 1];
      if (last && last.time === bar.time) {
        if (bar.replace) Object.assign(last, { open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume, buy: bar.buy });
        else { last.high = Math.max(last.high, bar.high); last.low = Math.min(last.low, bar.low); last.close = bar.close; last.volume += bar.volume; last.buy = (last.buy || 0) + bar.buy; }
      } else if (!last || bar.time > last.time) { delete bar.replace; raw.push(bar); }
      else return;
      if (!refreshTimer) refreshTimer = setTimeout(() => { refreshTimer = null; liveTick(); }, 250);
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
    document.body.classList.remove('tb-top', 'tb-bottom', 'tb-left', 'tb-right', 'tb-hidden'); document.body.classList.add(`tb-${S.toolbar}`); applySide();
    $('#bAuto').classList.toggle('on', S.auto.on);
    $('#symLabel').textContent = sym().name || S.symbol;
    const t = TYPES.find(x => x[0] === S.type) || TYPES[0];
    $('#typeLabel').textContent = t[1]; $('#typeIcon').textContent = t[2];
    $('#tfLabel').textContent = S.tf;
    fitToolbar();
  }
  // ---- undo / redo: drawings, indicators, symbol, timeframe, chart type, look… (not window positions) ----
  const HIST_SKIP = ['addons', 'alerts', 'scripts', 'wsShared', 'wsDock', 'algo', 'board', 'accounts', 'accountId', 'workspaces', 'wsId', 'layout', 'savedAt', 'chat', 'news', 'idea', 'labeler', 'legendOpen', 'lastToolbar', 'flow', 'folders', 'nexus', 'account', 'robot'];
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
    if (['symbol', 'tf', 'hours', 'spot', 'bars'].some(k => before[k] !== S[k])) { exitReplay(); view = { mode: 'live' }; alertMark = null; ideaPos = null; load(); }
    else { Object.keys(tzFmt).forEach(z => delete tzFmt[z]); buildChart((S.type === 'renko') !== (before.type === 'renko') ? null : undefined); }
    restoring = false; paintHist();
    toast(d < 0 ? '↶ Späť o krok' : '↷ Znova (krok dopredu)', 900);
  }
  $('#bUndo').onclick = () => stepHist(-1);
  $('#bRedo').onclick = () => stepHist(1);

  function setAndReload(changes) { Object.assign(S, changes); save(); applyToolbar(); exitReplay(); view = { mode: 'live' }; alertMark = null; ideaPos = null; load(); FLOW.setSymbol({ id: S.symbol, ...sym() });
    if (EMBED) { if (parent.NX_paneChanged) parent.NX_paneChanged(+QS.get('i'), { symbol: S.symbol, tf: S.tf }); }
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
      ${DR.GROUPS.filter(([g]) => g !== 'text' && g !== 'content').map(([g, name]) => `<div class="sec">${name}</div>${Object.values(DR.TOOLS).filter(t => t.group === g).map(t => `<div class="it ${draw.mode === t.id ? 'on' : ''}" data-tool="${t.id}"><span class="ic">${t.icon}</span><span class="grow">${esc(t.name)}</span>${t.key ? `<span class="key">${t.key}</span>` : ''}</div>`).join('')}`).join('')}`;
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
  // quick colour sets and sizes for any indicator (VWAP, MACD, RSI, volume, EMA ribbon…)
  const PALETTES = [['TradingView', ['#2962ff', '#ff6d00', '#e91e63', '#00bcd4', '#9c27b0', '#4caf50']], ['Neón', ['#00e5ff', '#ff2bd6', '#ffd600', '#00e676', '#7c4dff', '#ff3d00']],
    ['Pastel', ['#90caf9', '#f48fb1', '#ffe082', '#a5d6a7', '#ce93d8', '#80cbc4']], ['Zlato', ['#ffca28', '#ff8f00', '#fff59d', '#bcaaa4', '#ffd54f', '#8d6e63']],
    ['Oceán', ['#26c6da', '#29b6f6', '#5c6bc0', '#26a69a', '#80deea', '#3949ab']], ['Oheň', ['#ff1744', '#ff9100', '#ffea00', '#ff3d00', '#ffc400', '#d50000']],
    ['Čiernobiela', ['#ffffff', '#bdbdbd', '#757575', '#e0e0e0', '#9e9e9e', '#616161']], ['Farboslepé', ['#0072b2', '#e69f00', '#56b4e9', '#009e73', '#f0e442', '#d55e00']],
    ['Býk / medveď', ['#26a69a', '#ef5350', '#66bb6a', '#ff7043', '#00897b', '#e53935']]];
  function studySettings(s) {
    const def = KS.STUDIES[s.type], before = JSON.stringify({ inputs: s.inputs, plots: s.plots, tfs: s.tfs, out: s.out, alpha: s.alpha, overlay: s.overlay, ovH: s.ovH, above: s.above });
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
      return `<div class="sec2">Rýchle predvoľby</div><div class="pre-row">${PALETTES.map(([n, c], k) => `<button class="pre" data-pal="${k}" title="${n}"><span>${c.slice(0, 5).map(x => `<i style="background:${x}"></i>`).join('')}</span><small>${n}</small></button>`).join('')}</div>
        <div class="fld"><span>Hrúbka všetkých čiar</span><span class="ctl">${[1, 2, 3, 4, 6].map(w => `<button class="btn sm" data-allw="${w}">${w} px</button>`).join('')}</span></div>
        <div class="fld"><span>Krytie všetkého</span><span class="ctl">${[100, 80, 60, 40, 25].map(o => `<button class="btn sm" data-allo="${o}">${o} %</button>`).join('')}</span></div>
        <div class="fld"><span>Priehľadnosť celého indikátora</span><span class="op" style="width:250px"><input type="range" min="10" max="100" step="5" data-alpha value="${s.alpha ?? 100}"><b>${s.alpha ?? 100} %</b></span></div>
        <div class="sec2">Jednotlivo</div>` + lines.map(row).join('') + (fills.length ? '<div class="sec2">Výplne</div>' + fills.map(row).join('') : '') +
        (def.pane === true || s.type === 'volume' ? `<div class="sec2">Panel</div><div class="fld"><span>🪟 Plávajúce okno (nezmenšuje sviečky)</span><select data-flt>${opts([['Podľa 🧩 Add-ons', ''], ['Áno – vlastné okno', '1'], ['Nie – panel / v grafe', '0']], s.float === undefined ? '' : s.float ? '1' : '0')}</select></div>` : '') +
        (def.pane === true ? `<div class="fld"><label class="ctl">${cb('data-ov', s.overlay)} Prekryť graf – priehľadne cez spodok grafu, bez vlastného panelu</label></div>
          ${s.overlay ? `<div class="fld"><span>Výška prekrytia</span><span class="op" style="width:250px"><input type="range" min="15" max="70" step="5" data-ovh value="${s.ovH || 30}"><b>${s.ovH || 30} %</b></span></div>`
            : `<div class="fld"><span>Umiestnenie panelu</span><select data-place>${opts([['⬇ Pod grafom', '0'], ['⬆ Nad grafom (hore)', '1']], s.above ? '1' : '0')}</select></div>`}` : '') +
        `<div class="sec2">Výstupné hodnoty</div><div class="fld"><span>Presnosť</span><select data-out="precision">${opts([['Predvolená', 'auto'], ['0', 0], ['1', 1], ['2', 2], ['3', 3], ['4', 4]], s.out.precision)}</select></div>
         <div class="fld"><label class="ctl">${cb('data-out="priceLabels"', s.out.priceLabels)} Hodnoty na cenovej osi</label></div>
         <div class="fld"><label class="ctl">${cb('data-out="legendValues"', s.out.legendValues)} Hodnoty v legende</label></div>`;
    };
    const cancel = () => { Object.assign(s, JSON.parse(before)); save(); buildChart(); closeDialog(); };
    const paint = () => {
      const d = openDialog(`<div class="dlg-h"><span>${esc(def.name)} <small class="muted" style="font-weight:400">${esc(def.title)}</small></span><button class="ib" data-cancel>✕</button></div>
        <div class="dlg-b"><div class="tabs">${def.inputs.length ? `<span class="tab ${tab === 'in' ? 'on' : ''}" data-tab="in">Vstupy</span>` : ''}<span class="tab ${tab === 'st' ? 'on' : ''}" data-tab="st">Štýl</span>
        <span class="tab ${tab === 'vis' ? 'on' : ''}" data-tab="vis">Viditeľnosť</span></div>${body()}</div>
        <div class="dlg-f"><button class="btn" data-defmenu>Predvolené ▾</button><button class="btn" data-sall title="Tieto nastavenia (farby, dĺžky, priehľadnosť…) dostane ${esc(def.name)} vo všetkých grafoch a plochách">🔁 Na všetky grafy</button><span class="grow"></span><button class="btn" data-cancel>Zrušiť</button><button class="btn pri" data-ok>OK</button></div>`, cancel);
      $$('[data-tab]', d).forEach(x => x.onclick = () => { tab = x.dataset.tab; paint(); });
      $$('[data-in]', d).forEach(x => x.onchange = () => { const i = def.inputs.find(y => y.k === x.dataset.in);
        if (i.type === 'source') s.inputs[i.k] = x.value; else { const v = Math.min(i.max, Math.max(i.min, +x.value)); if (Number.isFinite(v)) s.inputs[i.k] = v; x.value = s.inputs[i.k]; } live(); });
      $$('[data-pl]', d).forEach(x => x.onchange = () => { s.plots[x.dataset.pl].visible = x.checked; live(); });
      $$('[data-type]', d).forEach(x => x.onchange = () => { s.plots[x.dataset.type].type = +x.value; live(); });
      $$('[data-tf]', d).forEach(x => x.onchange = () => { s.tfs[x.dataset.tf] = x.checked; live(); });
      $$('[data-pal]', d).forEach(x => x.onclick = () => { const pal = PALETTES[+x.dataset.pal][1]; let j = 0;
        for (const p of def.plots) { const st = s.plots[p.k]; if (!st || p.kind === 'level') continue; st.color = pal[j % pal.length]; if (st.color2 !== undefined || p.color2) st.color2 = pal[(j + 1) % pal.length]; j++; }
        live(); paint(); });
      $$('[data-allw]', d).forEach(x => x.onclick = () => { for (const p of def.plots) if (p.kind === 'line' && s.plots[p.k]) s.plots[p.k].width = +x.dataset.allw; live(); });
      $$('[data-allo]', d).forEach(x => x.onclick = () => { for (const p of def.plots) if (s.plots[p.k] && p.kind !== 'fill') s.plots[p.k].opacity = +x.dataset.allo; live(); paint(); });
      $$('[data-out]', d).forEach(x => x.onchange = () => { s.out[x.dataset.out] = x.type === 'checkbox' ? x.checked : (x.value === 'auto' ? 'auto' : +x.value); live(); });
      const pl = $('[data-place]', d); if (pl) pl.onchange = () => { s.above = pl.value === '1'; live(); };
      const al = $('[data-alpha]', d); if (al) al.oninput = () => { s.alpha = +al.value; al.nextElementSibling.textContent = s.alpha + ' %'; live(); };
      const ov = $('[data-ov]', d); if (ov) ov.onchange = () => { s.overlay = ov.checked; live(); paint(); };
      const flt = $('[data-flt]', d); if (flt) flt.onchange = () => { s.float = flt.value === '' ? undefined : flt.value === '1'; live(); };
      const oh = $('[data-ovh]', d); if (oh) oh.oninput = () => { s.ovH = +oh.value; oh.nextElementSibling.textContent = s.ovH + ' %'; live(); };
      $('[data-sall]', d).onclick = () => { closeDialog(); applyStudyAll(s); };
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
        <div class="fld">${cb('look.invert', L.invert, 'Obrátiť mierku')}</div><div class="fld">${cb('look.lastLine', L.lastLine, 'Živá cenová čiara (posledná cena)')}<span class="ctl"><select data-live="liveW">${[1, 2, 3, 4].map(w => `<option value="${w}" ${(L.liveW || 2) === w ? 'selected' : ''}>${w} px</option>`).join('')}</select><select data-live="liveStyle">${[['plná', 0], ['bodkovaná', 1], ['čiarkovaná', 2], ['dlhé čiarky', 3]].map(([n, v]) => `<option value="${v}" ${(L.liveStyle ?? 0) === v ? 'selected' : ''}>${n}</option>`).join('')}</select></span></div>
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
        <div class="sec2">Panel na boku (vľavo / vpravo)</div>
        <div class="fld"><span>Šírka bočného panela</span><span class="op" style="width:250px"><input type="range" min="20" max="64" data-pside="sideW" value="${P.sideW || 30}"><b>${P.sideW || 30} px</b></span></div>
        <div class="fld"><span>Krytie bočného panela</span><span class="op" style="width:250px"><input type="range" min="0" max="100" data-pside="sideOpacity" value="${P.sideOpacity ?? 100}"><b>${P.sideOpacity ?? 100} %</b></span></div>
        <div class="fld"><label class="ctl"><input type="checkbox" data-pfloat ${P.sideFloat ? 'checked' : ''}> Plávať nad grafom (graf sa nezúži; s nízkym krytím je panel priehľadný)</label></div>
        <div class="sec2">Vzhľad panelu</div>
        <div class="fld"><span>Šírka tlačidla</span>${rng('w', 40, 240)}</div><div class="fld"><span>Výška panelu</span>${rng('h', 22, 56)}</div>
        <div class="fld"><span>Veľkosť písma</span>${rng('fs', 9, 22)}</div>
        <div class="fld"><span>Písmo</span><select data-pl="font">${opts(FONTS, P.font)}</select></div>
        <div class="fld"><span>Zobraziť</span><select data-pl="show">${opts([['Ikona + text', 'both'], ['Iba ikony', 'icons'], ['Iba text', 'text']], P.show)}</select></div>
        <div class="fld"><span>Pozadie panelu</span>${swatch('pbg', P.bg, P.opacity)}</div><div class="fld"><span>Text</span>${swatch('ptext', P.text)}</div>
        <div class="fld"><span>Zvýraznenie (aktívne tlačidlá, výber)</span>${swatch('paccent', P.accent)}</div>
        <div class="fld"><span>Vzhľad panelu na predvolený</span><button class="btn sm" data-preset>Predvolené</button></div>`; })(),
      lang: `<div class="fld"><span>Jazyk aplikácie / App language</span><select data-k="lang">${opts([['Slovenčina', 'sk'], ['English', 'en']], S.lang)}</select></div>
        <div class="muted" style="font-size:11px">English prekladá menu, tlačidlá, okná a nastavenia. Dlhšie texty (Knižnica, tipy, správy, chat) zostávajú po slovensky. / English covers menus, buttons, windows and settings; long texts (library, tips, news, chat) stay Slovak.</div>`,
      data: `<div class="fld">${cb('hours', S.hours, 'Zlato a striebro: iba obchodné hodiny (bez víkendu a dennej pauzy)')}</div>
        <div class="fld">${cb('spot', S.spot !== false, 'Spot cena ako na TradingView (zlato, striebro, forex) – Binance futures sú o pár dolárov inde, ceny posunieme o rozdiel')}</div>
        <div class="muted" style="font-size:11px;margin:-4px 0 8px">Teraz posun ${esc(sym().name || S.symbol)}: ${(sym().off || 0) >= 0 ? '+' : ''}${(sym().off || 0).toFixed(sym().digits || 2)} (spot podľa Swissquote, kontrola raz za minútu)</div>
        <div class="fld"><span>Sviečok načítať</span>${num('bars', S.bars, 200, 5000, 100)}</div>
        <div class="fld"><span>Tvoje meno (nastavenia na všetkých zariadeniach)</span><input type="text" data-k="labeler" value="${esc(S.labeler)}"></div>
        <div class="muted" style="margin-top:14px;font-size:11px">Grafy: <a href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noopener" style="color:inherit">TradingView Lightweight Charts™</a> · Dáta: Binance</div>`,
    })[tab];
    const rng = (k, min, max, unit) => `<span class="op" style="width:250px"><input type="range" min="${min}" max="${max}" data-cs="${k}" value="${L.candle[k]}"><b>${L.candle[k]} ${unit}</b></span>`;
    const set = (path, v) => { const ks = path.split('.'); let o = S; while (ks.length > 1) o = o[ks.shift()]; o[ks[0]] = v; };
    const paint = () => {
      const d = openDialog(`<div class="dlg-h"><span>Nastavenia grafu</span><button class="ib" data-x>✕</button></div><div class="dlg-b">
        <div class="tabs">${[['bars', 'Sviečky'], ['canvas', 'Plátno'], ['legend', 'Legenda'], ['scale', 'Mierka'], ['cross', 'Kurzor'], ['time', 'Čas'], ['renko', 'Renko'], ['panel', 'Panel'], ['styles', '🖼 Štýly a pozadia'], ['lang', '🌐 Jazyk / Language'], ['data', 'Dáta']].map(([k, n]) => `<span class="tab ${tab === k ? 'on' : ''}" data-tab="${k}">${n}</span>`).join('')}</div>${body()}</div>
        <div class="dlg-f"><button class="btn" data-reset>Predvolené</button><button class="btn" data-allc title="Sviečky, farby, pozadie, mriežka, kurzor, legenda a typ grafu aj vo všetkých ostatných grafoch a plochách">🔁 Na všetky grafy</button><span class="grow"></span><button class="btn pri" data-x>Hotovo</button></div>`, null, 'wide');
      $$('[data-tab]', d).forEach(x => x.onclick = () => { if (x.dataset.tab === 'styles') { closeDialog(); stylesDialog(); return; } tab = x.dataset.tab; paint(); });
      $$('[data-live]', d).forEach(x => x.onchange = () => { L[x.dataset.live] = +x.value; save(); buildChart(); });
      const br = $('[data-bright]', d); if (br) br.oninput = () => { L.bright = +br.value; br.nextElementSibling.textContent = L.bright + ' %'; applyBright(); save(); };
      const CS = L.candle;
      $$('[data-cs]', d).forEach(x => x.oninput = () => { const k = x.dataset.cs; CS[k] = +x.value; CS.preset = ''; x.nextElementSibling.textContent = x.nextElementSibling.textContent.replace(/^\S+/, () => CS[k]);
        if (k === 'spacing') chart && chart.timeScale().applyOptions({ barSpacing: CS.spacing }); else main && main.applyOptions({ [k]: CS[k] }); save(); });
      $$('[data-cp]', d).forEach(x => x.onclick = () => { Object.assign(CS, CANDLE_PRESETS[x.dataset.cp][1], { preset: x.dataset.cp }); save(); buildChart();
        chart.timeScale().applyOptions({ barSpacing: CS.spacing }); chart.timeScale().scrollToRealTime(); paint(); });
      const P = S.panel;
      $$('[data-pside]', d).forEach(x => x.oninput = () => { P[x.dataset.pside] = +x.value; x.nextElementSibling.textContent = x.value + (x.dataset.pside === 'sideW' ? ' px' : ' %'); save(); applySide(); });
      const pf = $('[data-pfloat]', d); if (pf) pf.onchange = () => { P.sideFloat = pf.checked; save(); applySide(); };
      $$('[data-pos]', d).forEach(x => x.onclick = () => { if (x.dataset.pos === 'hidden') S.lastToolbar = S.toolbar; S.toolbar = x.dataset.pos; save(); applyToolbar(); paint(); });
      $$('[data-pl]', d).forEach(x => x[x.type === 'range' ? 'oninput' : 'onchange'] = () => { const k = x.dataset.pl; P[k] = x.type === 'range' ? +x.value : x.value;
        if (x.type === 'range') x.nextElementSibling.textContent = `${P[k]} px`; save(); applyPanel(); });
      [['pbg', 'bg', 'opacity', {}], ['ptext', 'text', '_ot', { noOpacity: true }], ['paccent', 'accent', '_oa', { noOpacity: true }]].forEach(([id, color, opacity, o]) => {
        const b = $(`[data-sw=${id}]`, d); if (b) b.onclick = () => colorPopover(b, P, o, () => { save(); applyPanel(); }, { color, opacity }); });
      const pr = $('[data-preset]', d); if (pr) pr.onclick = () => { S.panel = { ...DEF.panel }; save(); applyPanel(); paint(); };
      $$('[data-k]', d).forEach(x => x.onchange = async () => {
        const k = x.dataset.k, v = x.type === 'checkbox' ? x.checked : x.type === 'number' || x.tagName === 'SELECT' && /^-?\d+(\.\d+)?$/.test(x.value) ? +x.value : x.value;
        set(k, v); save();
        if (k === 'lang') { I18N.set(v); return; }
        if (k === 'labeler' && v) { if (await pullPrefs(v)) { closeDialog(); applyToolbar(); load(); } else save(); }
        else if (k === 'hours' || k === 'bars' || k === 'spot') load(); else { Object.keys(tzFmt).forEach(z => delete tzFmt[z]); applyBg(); buildChart(k.startsWith('renko.') ? null : undefined); if (k === 'look.bgType') paint(); }
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
                            rr: S.ideas.rr, minScore: S.ideas.minScore, strat: S.ideas.strat || {} });
  // how many lines / levels the auto lines keep (the scanner keeps its own settings)
  // reach: how far back the lines may start (pivots to pair with, how long an untouched line lives, how far price may move away)
  const REACH = [[6, 600, 12], [12, 1500, 18], [25, 3000, 26], [50, 6000, 40]];
  const tlCfg = () => { const n = S.auto.maxLines || 3, [lb, age, dist] = REACH[S.auto.reach ?? 1] || REACH[1];
    return { maxLines: n, lvMax: S.auto.maxLevels || 8, lookback: Math.max(lb, Math.ceil(n * 1.5)), maxAge: Math.max(age, n > 6 ? 1200 : 600), maxDist: dist }; };
  let tlMajor = null;
  const sliceD = (X, n) => Object.fromEntries(Object.entries(X).map(([k, v]) => [k, v.slice(0, n)]));
  function computeTL() {
    const n = closedCount();
    if (!(S.auto.on || S.ideas.on) || n < 60) { const had = !!tlR; tlR = null; tlMajor = null; tlIdeas = []; tlSnap = null; tlKey = ''; return had; }
    const k = S.auto.k || TL.zigK(S.tf, TF_SEC[S.tf]);
    const key = [S.symbol, S.tf, S.type, n, disp[0].time, disp[n - 1].time, k, JSON.stringify(ideaOpts()), JSON.stringify(tlCfg()), S.auto.major, S.ideas.on].join('|'), changed = key !== tlKey;
    if (changed) {
      tlKey = key;
      const Dc = n === D.t.length ? D : sliceD(D, n);
      tlR = TL.run(Dc, { k, cfg: tlCfg() });
      tlIdeas = S.ideas.on ? TL.ideas(Dc, tlR, ideaOpts()) : [];
      // major lines: the same method on swings 2.5× bigger – long lines across days / weeks
      tlMajor = S.auto.major ? TL.run(Dc, { k: k * 2.5, cfg: { ...tlCfg(), maxLines: Math.max(2, Math.ceil((S.auto.maxLines || 3) / 2)), lookback: 40, maxAge: 8000, maxDist: 60 } }) : null;
      if (tlMajor) tlMajor.lines.forEach(x => { x.major = true; });
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
      const X = i => ts.logicalToCoordinate(i), Y = p => se.priceToCoordinate(p), vr = ts.getVisibleLogicalRange(), left = vr ? Math.floor(vr.from) - 2 : 0;
      // per line kind, like a drawn trendline: extend left to the edge, extend right (or stop at the last bar), labels
      const from = (st, i) => (st.extL && left < i ? left : i), till = st => (st.extR === false ? n - 1 : last);
      target.useMediaCoordinateSpace(({ context: ctx }) => {
        const pen = (st, fade, dash) => { ctx.strokeStyle = rgba(st.color, st.opacity * (fade ? 0.45 : 1)); ctx.lineWidth = st.width;
          ctx.setLineDash(dash || [[], [st.width, st.width * 2.5], [7, 5], [14, 6]][st.style] || []); };
        const seg = (i1, p1, i2, p2) => { const x1 = X(i1), y1 = Y(p1), x2 = X(i2), y2 = Y(p2); if ([x1, y1, x2, y2].some(v => v === null)) return null;
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); return [x2, y2]; };
        const label = (txt, x, y, color, up, st) => { if (!A.labels || (st && st.labels === false) || x === null || y === null) return; ctx.font = '11px ' + fontCss(S.look.font); ctx.fillStyle = color; ctx.textAlign = 'right'; ctx.fillText(txt, x - 4, y + (up ? -5 : 13)); };
        if (A.lines) for (const ln of tlMajor ? [...tlR.lines, ...tlMajor.lines] : tlR.lines) {
          if (ln.created > n - 1) continue;
          const alive = ln.ended === null || ln.ended > n - 1;
          if (!alive && !(A.ended && ln.ended > n - 400)) continue;
          const st = ln.kind === 'sup' ? A.sup : A.res, to = alive ? till(st) : ln.ended, i0 = from(st, ln.i1);
          pen(st, !alive); if (ln.major) ctx.lineWidth = st.width + 1;
          const endPt = seg(i0, val(ln, i0), to, val(ln, to));
          if (A.channels && alive) { pen(st, true, [4, 4]); seg(ln.i1, ln.p1 + ln.offset, to, val(ln, to) + ln.offset); }
          if (A.touches && alive) { ctx.fillStyle = rgba(st.color, st.opacity); for (const ti of ln.touchIdx) { const x = X(ti), y = Y(val(ln, ti)); if (x !== null && y !== null) { ctx.beginPath(); ctx.arc(x, y, 2.5, 0, 7); ctx.fill(); } } }
          if (alive && endPt) label(`${ln.major ? 'hlavná ' : ''}${ln.kind === 'sup' ? 'podpora' : 'rezistencia'} ${ln.touches}×`, endPt[0], endPt[1], rgba(st.color, st.opacity), ln.kind === 'res', st);
        }
        if (A.levels) for (const lv of tlR.levels) {
          if (lv.created > n - 1) continue;
          const alive = lv.ended === null || lv.ended > n - 1, touches = lv.touchConf.filter(c => c <= n - 1).length;
          if (touches < tlR.minLevel || (!alive && !(A.ended && lv.ended > n - 400))) continue;
          pen(A.lvl, !alive);
          const endPt = seg(from(A.lvl, lv.touchIdx[0]), lv.price, alive ? till(A.lvl) : lv.ended, lv.price);
          if (alive && endPt) label(`S/R ${touches}×`, endPt[0], endPt[1], rgba(A.lvl.color, A.lvl.opacity), true, A.lvl);
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
      <div class="it" style="cursor:default"><span class="grow">Max. trendových čiar na stranu</span><span class="op" style="width:150px"><input type="range" min="1" max="100" data-a="auto.maxLines" value="${A.maxLines || 3}"><b>${A.maxLines || 3}</b></span></div>
      <div class="it" style="cursor:default"><span class="grow">Max. horizontálnych úrovní</span><span class="op" style="width:150px"><input type="range" min="1" max="50" data-a="auto.maxLevels" value="${A.maxLevels || 8}"><b>${A.maxLevels || 8}</b></span></div>
      <div class="it" data-a-strat><span class="ic">⚡</span><span class="grow">Stratégie živých nápadov…</span></div>
      <div class="it" style="cursor:default"><span class="grow">Dosah dozadu</span><select data-a="auto.reach">${opts([['Krátky', 0], ['Stredný', 1], ['Ďaleký (napr. 2h → týždeň)', 2], ['Veľmi ďaleký', 3]], A.reach ?? 1)}</select></div>
      ${cb('auto.major', A.major, 'Aj hlavné čiary z veľkých swingov (dni – týždne)')}
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
      $('[data-a-strat]', m).onclick = () => { closeMenu(); strategiesDialog(); };
      $$('input[type=range][data-a]', m).forEach(x => x.oninput = () => { x.nextElementSibling.textContent = x.value; });
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
  // the same controls as a trendline you draw yourself (drawings.js settings): colour, width, style, extend, labels
  function autoStyle(tab0) {
    const A = S.auto, before = JSON.stringify(A);
    let tab = tab0 || 'sup';
    const redraw = () => { save(); autoLayer && autoLayer.update(); };
    const cb = (attr, on, label) => `<label class="ctl"><input type="checkbox" ${attr} ${on ? 'checked' : ''}> ${label}</label>`;
    const TABS = [['sup', 'Podpora'], ['res', 'Rezistencia'], ['lvl', 'S/R úrovne'], ['all', 'Spoločné']];
    const body = () => {
      if (tab === 'all') return `<div class="fld"><span>Predĺženie doprava (sviečok)</span><input type="number" data-ext value="${A.ext}" min="0" max="500" class="num"></div>
        <div class="fld">${cb('data-c="labels"', A.labels, 'Popisy (podpora 3×, S/R 2×…)')}</div><div class="fld">${cb('data-c="touches"', A.touches, 'Body dotykov na čiarach')}</div>
        <div class="fld">${cb('data-c="channels"', A.channels, 'Kanály (rovnobežka cez protiľahlý swing)')}</div><div class="fld">${cb('data-c="ended"', A.ended, 'Aj prerazené čiary (slabšie)')}</div>`;
      const st = A[tab];
      return `<div class="fld"><span>Čiara</span><span class="ctl">${swatch('line', st.color, st.opacity)}
          <select data-k="width" class="sm">${opts([1, 2, 3, 4, 6, 8, 12].map(v => [v + ' px', v]), st.width)}</select>
          <select data-k="style" class="sm">${opts([['━ plná', 0], ['┈ bodky', 1], ['╌ čiarky', 2], ['— dlhé', 3]], st.style)}</select></span></div>
        <div class="fld">${cb('data-kc="extL"', !!st.extL, 'Predĺžiť doľava')}</div><div class="fld">${cb('data-kc="extR"', st.extR !== false, 'Predĺžiť doprava')}</div>
        <div class="fld">${cb('data-kc="labels"', st.labels !== false, 'Popisy')}</div>
        <div class="fld"><span>Ako tvoja kreslená čiara</span><button class="btn sm" data-mine>✎ Prevziať štýl mojej trendovej čiary</button></div>`;
    };
    const cancel = () => { S.auto = JSON.parse(before); redraw(); closeDialog(); };
    const paint = () => {
      const d = openDialog(`<div class="dlg-h"><span>Auto trendové čiary · nastavenia</span><button class="ib" data-cancel>✕</button></div>
        <div class="dlg-b"><div class="tabs">${TABS.map(([k, n]) => `<span class="tab ${tab === k ? 'on' : ''}" data-tab="${k}">${n}</span>`).join('')}</div>${body()}</div>
        <div class="dlg-f"><button class="btn" data-def>Uložiť ako predvolené</button><button class="btn" data-reset>Predvolené</button><span class="grow"></span><button class="btn" data-cancel>Zrušiť</button><button class="btn pri" data-ok>OK</button></div>`, cancel);
      const st = A[tab];
      $$('[data-tab]', d).forEach(x => x.onclick = () => { tab = x.dataset.tab; paint(); });
      $$('[data-k]', d).forEach(x => x.onchange = () => { st[x.dataset.k] = +x.value; redraw(); });
      $$('[data-kc]', d).forEach(x => x.onchange = () => { st[x.dataset.kc] = x.checked; redraw(); });
      $$('[data-c]', d).forEach(x => x.onchange = () => { A[x.dataset.c] = x.checked; redraw(); });
      const ex = $('[data-ext]', d); if (ex) ex.onchange = () => { A.ext = Math.max(0, Math.min(500, +ex.value || 0)); redraw(); };
      const sw = $('[data-sw="line"]', d); if (sw) sw.onclick = e => colorPopover(e.currentTarget, st, { width: true, style: true }, () => { redraw(); });
      const mine = $('[data-mine]', d); if (mine) mine.onclick = () => {
        const t = draw.styleOf('trend');
        Object.assign(st, { color: t.color, opacity: t.opacity ?? 100, width: t.width, style: t.style, extL: !!t.extL, extR: t.extR !== false, labels: t.labels !== false });
        redraw(); paint(); toast('Štýl prevzatý z tvojej trendovej čiary');
      };
      $('[data-def]', d).onclick = () => { S.toolDefaults.auto = JSON.parse(JSON.stringify({ sup: A.sup, res: A.res, lvl: A.lvl, ext: A.ext })); save(); toast('Uložené ako predvolené pre auto čiary'); };
      $('[data-reset]', d).onclick = () => { const D0 = S.toolDefaults.auto || DEF.auto; for (const k of ['sup', 'res', 'lvl']) A[k] = { ...D0[k] }; A.ext = D0.ext ?? DEF.auto.ext; redraw(); paint(); };
      $$('[data-cancel]', d).forEach(x => x.onclick = cancel);
      $('[data-ok]', d).onclick = closeDialog;
    };
    paint();
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
                  bug: ['🐞', 'Chyba', '#ff5252'], ai: ['🤖', 'Opýtať sa Clauda', '#26c6da'], signal: ['📡', 'Signál (algoritmy)', '#ff9100'] };
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

  // ---- 🧩 Funkcie: lines, volume, the strategies of the live ideas, technicals background – one button -----------
  function funcMenu(anchor) {
    const T = S.tint, onIdeas = TL.STRATS.filter(k => (S.ideas.strat[k] || {}).on !== false).length;
    const it = (k, ic, n, sub, on) => `<div class="it fn-it" data-fn2="${k}"><span class="ic">${ic}</span><span class="grow"><b>${n}</b><small>${sub}</small></span>${on ? '<span class="fn-on">●</span>' : ''}<span class="car-r">›</span></div>`;
    const html = () => `${it('lines', '📐', 'Čiary', 'Auto trendové čiary, úrovne, kanály, počet čiar', S.auto.on)}
      ${it('volume', '🫧', 'Objem', 'Bubliny, delta, CVD, tok obchodov, profil objemu', S.bubbles.on || FLOW.isOpen())}
      ${it('range', '▭', 'Range a BOS', 'Bočné pásmo – vrch, spodok a prerazenie štruktúry', S.range.on)}
      ${it('fork', '⋔', 'Vidly (pitchfork)', 'Automaticky hore v uptrende, dole v downtrende', S.fork.on)}
      ${it('strats', '⚡', 'Stratégie živých nápadov', `${onIdeas} z ${TL.STRATS.length} zapnutých · R:R, stop, potvrdenia, úspešnosť`, S.ideas.on)}
      <div class="sep"></div><div class="sec">🎨 Pozadie podľa Technicals</div>
      <label class="it"><input type="checkbox" data-tn="on" ${T.on ? 'checked' : ''}><span class="grow">Zafarbiť pozadie grafu podľa súhrnu Technicals<br><small>červená = predaj · sivomodrá = neutrál · zelená = nákup; čím istejšie, tým sýtejšie</small></span></label>
      <div class="lbl" style="padding:0 12px">Sýtosť</div><span class="op" style="padding:0 12px 8px"><input type="range" min="5" max="60" data-tn="opacity" value="${T.opacity}"><b style="min-width:40px">${T.opacity} %</b></span>
      <label class="it"><input type="checkbox" data-tn="label" ${T.label ? 'checked' : ''}><span class="grow">Ukázať nápis (napr. „Technicals 5m: Silný nákup“)</span></label>`;
    const bind = m => {
      $$('[data-fn2]', m).forEach(x => x.onclick = () => {
        closeMenu();
        const k = x.dataset.fn2;
        if (k === 'lines') autoMenu(anchor); else if (k === 'volume') flowMenu(anchor); else if (k === 'range' || k === 'fork') structMenu(anchor, k); else strategiesDialog();
      });
      $$('[data-tn]', m).forEach(x => x[x.type === 'range' ? 'oninput' : 'onchange'] = () => {
        const k = x.dataset.tn; T[k] = x.type === 'checkbox' ? x.checked : +x.value;
        if (x.type === 'range') x.nextElementSibling.textContent = x.value + ' %';
        save(); if (k === 'on') buildChart(); applyTint(true);
      });
    };
    openMenu(anchor, html(), bind, { side: side(), cls: 'func-menu' });
  }
  $('#bFunc').onclick = e => funcMenu(e.currentTarget);

  // ---- structure: ranges with BOS and pitchforks (struct.js), one chart layer -----------------------------------
  let stR = null, stKey = '', structLayer = null;
  function computeStruct() {
    const R = S.range, F = S.fork, n = closedCount();
    if (!(R.on || F.on) || !D || n < 40) { stR = null; stKey = ''; return; }
    const key = [S.symbol, S.tf, S.type, n, disp[0].time, disp[n - 1].time, JSON.stringify(R), JSON.stringify(F)].join('|');
    if (key === stKey) return;
    stKey = key;
    const Dc = n === D.t.length ? D : sliceD(D, n);
    stR = { ranges: R.on ? ST.ranges(Dc, { minLen: R.minLen, maxAtr: R.maxAtr, minTests: R.minTests }).filter(r => !R.solid || (r.testsTop >= 3 && r.testsBot >= 3 && r.i1 - r.i0 >= Math.max(25, R.minLen))).slice(-R.count) : [],
            forks: F.on ? ST.forks(Dc, { k: F.k || TL.zigK(S.tf, TF_SEC[S.tf]), count: F.count, type: F.type }) : [] };
  }
  class StructLayer {
    attached(p) { this.p = p; } detached() { this.p = null; }
    update() { if (this.p) this.p.requestUpdate(); }
    updateAllViews() {}
    paneViews() { return [{ zOrder: () => 'normal', renderer: () => ({ draw: t => this.draw(t) }) }]; }
    draw(target) {
      if (!this.p || !stR || hideL.auto) return;
      const ts = this.p.chart.timeScale(), se = this.p.series, X = i => ts.logicalToCoordinate(i), Y = p => se.priceToCoordinate(p), R = S.range, F = S.fork;
      target.useMediaCoordinateSpace(({ context: ctx }) => {
        ctx.font = '600 11px ' + fontCss(S.look.font);
        for (const r of stR.ranges) {
          const to = r.live ? disp.length - 1 + R.ext : r.i1, x0 = X(r.i0), x1 = X(to), yt = Y(r.top), yb = Y(r.bot);
          if ([x0, x1, yt, yb].some(v => v === null)) continue;
          const col = r.brk > 0 ? R.up : r.brk < 0 ? R.down : R.color;
          ctx.fillStyle = rgba(col, R.fill); ctx.fillRect(x0, yt, x1 - x0, yb - yt);
          ctx.strokeStyle = rgba(col, 90); ctx.lineWidth = R.width; ctx.setLineDash(r.live ? [6, 4] : []);
          ctx.beginPath(); ctx.moveTo(x0, yt); ctx.lineTo(x1, yt); ctx.moveTo(x0, yb); ctx.lineTo(x1, yb); ctx.stroke();
          if (R.mid) { ctx.setLineDash([2, 4]); ctx.lineWidth = 1; const ym = Y((r.top + r.bot) / 2); ctx.beginPath(); ctx.moveTo(x0, ym); ctx.lineTo(x1, ym); ctx.stroke(); }
          ctx.setLineDash([]);
          ctx.fillStyle = rgba(col, 100); ctx.textAlign = 'left';
          ctx.fillText(`Range ${fmt(r.top)}`, x0 + 3, yt - 4); ctx.fillText(`${fmt(r.bot)}`, x0 + 3, yb + 12);
          if (r.brk && R.bos) {
            const xb = X(r.i1), yl = r.brk > 0 ? yt : yb;
            if (xb !== null) { ctx.textAlign = 'center'; ctx.fillStyle = r.brk > 0 ? rgba(R.up, 100) : rgba(R.down, 100);
              const lab = `BOS ${r.brk > 0 ? '▲' : '▼'}`, w = ctx.measureText(lab).width + 10, yy = yl + (r.brk > 0 ? -22 : 8);
              ctx.fillRect(xb - w / 2, yy, w, 15); ctx.fillStyle = '#fff'; ctx.fillText(lab, xb, yy + 11); }
          } else if (r.live) { ctx.textAlign = 'right'; ctx.fillStyle = rgba(col, 100); ctx.fillText(`čaká na BOS (${r.testsTop}× hore · ${r.testsBot}× dole)`, x1 - 4, yt - 4); }
        }
        for (const f of stR.forks) {
          const to = disp.length - 1 + F.ext, col = f.dir > 0 ? F.up : F.down;
          const line = (i0, p0, dash, w) => { const x0 = X(i0), y0 = Y(p0), x1 = X(to), y1 = Y(p0 + f.slope * (to - i0)); if ([x0, y0, x1, y1].some(v => v === null)) return null;
            ctx.setLineDash(dash); ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); return [x0, y0, x1, y1]; };
          // tines through P1 and P2, the median from the origin; light fill between the tines
          const a = [f.p1.idx, f.p1.price], b = [f.p2.idx, f.p2.price];
          const pa = [X(a[0]), Y(a[1]), X(to), Y(a[1] + f.slope * (to - a[0]))], pb = [X(b[0]), Y(b[1]), X(to), Y(b[1] + f.slope * (to - b[0]))];
          if (F.fill && ![...pa, ...pb].some(v => v === null)) { ctx.fillStyle = rgba(col, F.fill); ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pa[2], pa[3]); ctx.lineTo(pb[2], pb[3]); ctx.lineTo(pb[0], pb[1]); ctx.closePath(); ctx.fill(); }
          ctx.strokeStyle = rgba(col, 95);
          line(f.o.i, f.o.p, [], F.width + 0.5);
          line(a[0], a[1], [], F.width); line(b[0], b[1], [], F.width);
          if (F.half) { ctx.strokeStyle = rgba(col, 55); const m1 = [(a[0] + f.mid.i) / 2, (a[1] + f.mid.p) / 2], m2 = [(b[0] + f.mid.i) / 2, (b[1] + f.mid.p) / 2]; line(m1[0], m1[1], [4, 4], 1); line(m2[0], m2[1], [4, 4], 1); }
          // the three swings and the handle
          ctx.strokeStyle = rgba(col, 60); ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
          const xs = [f.p0, f.p1, f.p2].map(p => [X(p.idx), Y(p.price)]);
          if (!xs.flat().some(v => v === null)) { ctx.beginPath(); ctx.moveTo(...xs[1]); ctx.lineTo(...xs[2]); ctx.stroke(); ctx.setLineDash([]);
            ctx.fillStyle = rgba(col, 100); xs.forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill(); });
            ctx.textAlign = 'left'; ctx.fillText(`Vidly ${f.dir > 0 ? '▲ uptrend' : '▼ downtrend'}`, xs[0][0] + 6, xs[0][1] + (f.dir > 0 ? 16 : -8)); }
          ctx.setLineDash([]);
        }
      });
    }
  }
  function structMenu(anchor, what) {
    const X = S[what], cb = (k, label) => `<label class="it"><input type="checkbox" data-sx="${k}" ${X[k] ? 'checked' : ''}><span class="grow">${label}</span></label>`;
    const rng = (k, min, max, step, label, unit = '') => `<div class="it" style="cursor:default"><span class="grow">${label}</span><span class="op" style="width:150px"><input type="range" min="${min}" max="${max}" step="${step}" data-sx="${k}" value="${X[k]}"><b>${X[k]}${unit}</b></span></div>`;
    const sw = (k, label) => `<div class="it" style="cursor:default"><span class="grow">${label}</span>${swatch(k, X[k])}</div>`;
    const html = what === 'range'
      ? `${cb('on', '<b>Range a BOS</b><br><small>zvýrazní pásmo bočného trhu (vrch a spodok) a označí prerazenie – BOS</small>')}
        <div class="sec">Ako hľadať range</div>${cb('solid', 'Len pevne usadené range (každá hrana 3+ dotyky, aspoň 25 sviečok)')}${rng('minLen', 8, 100, 1, 'Min. dĺžka (sviečok)')}${rng('maxAtr', 1.5, 8, 0.5, 'Max. výška (× ATR)')}${rng('minTests', 1, 5, 1, 'Min. dotykov každej hrany')}${rng('count', 1, 30, 1, 'Koľko posledných range ukázať')}
        <div class="sec">Vzhľad</div>${cb('bos', 'Značka BOS pri prerazení')}${cb('mid', 'Stredná čiara (polovica range)')}${rng('fill', 0, 40, 1, 'Výplň', ' %')}${rng('ext', 0, 200, 5, 'Predĺženie živého range doprava')}
        ${sw('color', 'Farba range')}${sw('up', 'BOS nahor')}${sw('down', 'BOS nadol')}`
      : `${cb('on', '<b>Vidly (pitchfork)</b><br><small>z troch posledných swingov: v uptrende smerom hore, v downtrende dole</small>')}
        <div class="it" style="cursor:default"><span class="grow">Typ</span><select data-sx="type">${opts([['Andrews', 'andrews'], ['Schiff', 'schiff'], ['Upravený Schiff', 'mschiff']], X.type)}</select></div>
        <div class="it" style="cursor:default"><span class="grow">Swingy (ZigZag × ATR)</span><select data-sx="k">${opts([['Ako auto čiary', 0], ['1.5 · menšie', 1.5], ['2', 2], ['3', 3], ['4 · väčšie', 4], ['6 · hlavné', 6]], X.k)}</select></div>
        ${rng('count', 1, 5, 1, 'Počet vidiel')}${cb('half', 'Polovičné čiary (medzi stredom a krajmi)')}${rng('fill', 0, 30, 1, 'Výplň', ' %')}${rng('ext', 10, 300, 10, 'Dĺžka doprava (sviečok)')}
        ${sw('up', 'Farba – hore')}${sw('down', 'Farba – dole')}`;
    const apply = () => { save(); stKey = ''; computeStruct(); structLayer && structLayer.update(); };
    openMenu(anchor, html, m => {
      $$('[data-sx]', m).forEach(x => x[x.type === 'range' ? 'oninput' : 'onchange'] = () => {
        const k = x.dataset.sx; X[k] = x.type === 'checkbox' ? x.checked : x.tagName === 'SELECT' && k === 'type' ? x.value : +x.value;
        if (x.type === 'range') x.nextElementSibling.textContent = x.value + (x.nextElementSibling.textContent.endsWith('%') ? ' %' : '');
        apply();
      });
      $$('[data-sw]', m).forEach(b => b.onclick = e => { e.stopPropagation(); colorPopover(b, X, { noOpacity: true }, apply, { color: b.dataset.sw }); });
    }, { side: side(), cls: 'func-menu' });
  }

  // the strategies of the live ideas: on / off, own R:R, stop and confirmations, results on this chart
  function strategiesDialog() {
    const ST = S.ideas.strat, all = S.ideas.on ? tlIdeas : [];
    const row = k => {
      const c = ST[k] || {}, on = c.on !== false, mine = all.filter(x => x.signals.includes(k)), st = TL.stats(mine);
      return `<tr class="${on ? '' : 'off'}"><td><label class="sw-t"><input type="checkbox" data-sk="${k}" data-f="on" ${on ? 'checked' : ''}><i></i></label></td>
        <td><b>${/SUP|UP/.test(k) ? '<span class="up">▲</span>' : '<span class="dn">▼</span>'} ${esc(TL.NAMES[k])}</b><small class="muted">${/^TL/.test(k) ? 'trendová čiara' : 'horizontálna úroveň'} · ${/BREAK/.test(k) ? 'prerazenie' : 'odraz'}</small></td>
        <td><select data-sk="${k}" data-f="rr">${opts([['ako všetky', ''], ...[1, 1.5, 2, 2.5, 3, 4].map(v => ['1:' + v, v])], c.rr ?? '')}</select></td>
        <td><select data-sk="${k}" data-f="slAtr">${opts([['ako všetky', ''], ...[0.5, 0.75, 1, 1.5, 2].map(v => [v + '× ATR', v])], c.slAtr ?? '')}</select></td>
        <td><select data-sk="${k}" data-f="minScore">${opts([['ako všetky', ''], ...[0, 1, 2, 3, 4].map(v => [v ? v + '+' : 'žiadne', v])], c.minScore ?? '')}</select></td>
        <td>${mine.length}</td><td>${st.win === null ? '–' : (100 * st.win).toFixed(0) + ' %'}</td><td class="${st.avgR > 0 ? 'up' : st.avgR < 0 ? 'dn' : ''}">${st.avgR === null ? '–' : (st.avgR >= 0 ? '+' : '') + st.avgR.toFixed(2) + 'R'}</td></tr>`;
    };
    const d = openDialog(`<div class="dlg-h"><span>⚡ Stratégie živých nápadov</span><button class="ib" data-x>✕</button></div><div class="dlg-b">
      <div class="muted" style="font-size:12px;margin-bottom:8px">Živé nápady (⚡ v grafe, okno Nápad, skener) vznikajú z týchto 8 situácií na auto čiarach a úrovniach a potvrdzujú sa RSI, MACD, VWAP, objemom a štruktúrou swingov.
        Vypni tie, ktoré nechceš; každej môžeš dať vlastný R:R, stop a minimum potvrdení. Úspešnosť je spätný test na otvorenom grafe (${esc(sym().name || S.symbol)} ${S.tf}).</div>
      <div class="fld"><label class="ctl"><input type="checkbox" data-gon ${S.ideas.on ? 'checked' : ''}> <b>Živé nápady zapnuté</b></label><span class="ctl"><button class="btn sm" data-all="1">Zapnúť všetky</button><button class="btn sm" data-all="0">Vypnúť všetky</button><button class="btn sm" data-reset>Predvolené</button></span></div>
      <table class="tt st-t"><tr><th></th><th>Stratégia</th><th>R:R</th><th>Stop</th><th>Potvrdenia</th><th>Nápadov</th><th>Úspešnosť</th><th>Priem.</th></tr>${TL.STRATS.map(row).join('')}</table>
      <div class="muted" style="font-size:11px;margin-top:8px">Spoločné nastavenia (R:R ${S.ideas.rr}, potvrdenia ${S.ideas.minScore}+) sú vo Funkcie → Čiary. Overené stratégie z literatúry nájdeš v okne 🧠 Algo.</div></div>
      <div class="dlg-f"><span class="grow"></span><button class="btn pri" data-x>Hotovo</button></div>`, null, 'wide strat-dlg');
    const redo = () => { save(); tlKey = ''; computeTL(); ideaSeenT = tlIdeas.length ? tlIdeas[tlIdeas.length - 1].time : 0; autoLayer && autoLayer.update(); updateMarkers(); if (S.idea.open && S.idea.tab === 'live') renderIdea(); closeDialog(); strategiesDialog(); };
    $$('[data-sk]', d).forEach(x => x.onchange = () => { const c = ST[x.dataset.sk] = ST[x.dataset.sk] || {}, f = x.dataset.f;
      if (f === 'on') c.on = x.checked; else if (x.value === '') delete c[f]; else c[f] = +x.value; redo(); });
    $('[data-gon]', d).onchange = e => { S.ideas.on = e.target.checked; redo(); };
    $$('[data-all]', d).forEach(x => x.onclick = () => { TL.STRATS.forEach(k => { (ST[k] = ST[k] || {}).on = x.dataset.all === '1'; }); redo(); });
    $('[data-reset]', d).onclick = () => { S.ideas.strat = {}; redo(); };
    $$('[data-x]', d).forEach(x => x.onclick = closeDialog);
  }

  // technicals background: the summary rating of this timeframe tints the chart (-1 strong sell … +1 strong buy)
  let tintT = 0;
  const TINT = [[-1, [183, 28, 28]], [-0.5, [229, 57, 53]], [-0.1, [96, 125, 139]], [0.1, [96, 125, 139]], [0.5, [67, 160, 71]], [1, [0, 200, 83]]];
  function tintColor(r) {
    for (let k = 1; k < TINT.length; k++) if (r <= TINT[k][0]) { const [a, ca] = TINT[k - 1], [b, cb] = TINT[k], f = Math.max(0, Math.min(1, (r - a) / (b - a || 1))); return ca.map((v, j) => Math.round(v + (cb[j] - v) * f)); }
    return TINT[TINT.length - 1][1];
  }
  function applyTint(force) {
    let el = $('#taTint');
    const T = S.tint;
    if (!T.on || EMBED && !T.on) { if (el) el.style.display = 'none'; return; }
    if (!el) { el = document.createElement('div'); el.id = 'taTint'; el.innerHTML = '<span></span>'; ($('#bgAnim') || $('#bgDim')).after(el); }
    if (!force && Date.now() - tintT < 3000) return;
    tintT = Date.now();
    if (!D || D.c.length < 210) return;
    let g;
    try { g = TA.compute(D).groups.sum; } catch (e) { return; }
    const [r0, g0, b0] = tintColor(g.r), a = (T.opacity / 100) * (0.55 + 0.45 * Math.min(1, Math.abs(g.r) * 2));
    el.style.display = '';
    el.style.background = `linear-gradient(180deg, rgba(${r0},${g0},${b0},${a}), rgba(${r0},${g0},${b0},${a * 0.55}))`;
    const sp = $('span', el); sp.style.display = T.label ? '' : 'none';
    sp.textContent = `Technicals ${S.tf}: ${TA.SK[g.label]} (${g.r >= 0 ? '+' : ''}${g.r.toFixed(2)})`; sp.style.color = `rgb(${r0},${g0},${b0})`;
  }

  // ---- 🧠 algorithmic trading: rank published systems on our data, show them on the chart, broadcast live signals ----
  const algoEl = $('#algoWin');
  const ALGO_DEF = { tab: 'rank', markets: ['XAUUSD', 'XAGUSD', 'BTCUSD', 'EURUSD'], tfs: ['15m', '1h', '4h'], bars: 2000, live: [], chat: true, telegram: false,
                     paper: false, lots: 0.1, show: null, log: [], seen: {}, sel: 'rsi2', x: null, y: null };
  const AG = () => { const a = S.algo = S.algo || {}; for (const k in ALGO_DEF) if (a[k] === undefined) a[k] = JSON.parse(JSON.stringify(ALGO_DEF[k])); return a; };
  let algoRes = [], algoBusy = false, algoTimer = null;
  const pct = v => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + (100 * v).toFixed(1) + ' %' : '–');
  const dToD = bars => ({ t: bars.map(b => b.time), o: bars.map(b => b.open), h: bars.map(b => b.high), l: bars.map(b => b.low), c: bars.map(b => b.close), v: bars.map(b => b.volume || 0),
                          s: bars.map(b => (SYM[b.sym] && SYM[b.sym].hours === 'gold' ? sessGold(b.time) : Math.floor(b.time / 86400))) });
  async function algoRank() {
    const G = AG(); if (algoBusy) return;
    algoBusy = true; algoRes = []; paintAlgo();
    const jobs = G.markets.filter(s => SYM[s]).flatMap(s => G.tfs.map(tf => [s, tf]));
    let k = 0;
    for (const [s, tf] of jobs) {
      k++; const pr = $('#algoProg'); if (pr) pr.textContent = `Testujem ${SYM[s].name} ${tf} (${k}/${jobs.length})…`;
      try {
        const bars = (await fetchBars(s, tf, null, G.bars)).map(b => ({ ...b, sym: s })), D = dToD(bars);
        for (const id of Object.keys(ALGO.SYS)) {
          if (ALGO.SYS[id].intraday && TF_SEC[tf] > 3600) continue;
          const r = ALGO.run(id, D, { symbol: s });
          algoRes.push({ id, symbol: s, tf, stats: r.stats, half: r.half, open: r.open, from: D.t[0], to: D.t[D.t.length - 1], score: ALGO.score(r.stats, r.half) });
        }
      } catch (e) {}
      if (algoEl.classList.contains('open') && AG().tab === 'rank') paintAlgo();
    }
    algoBusy = false; paintAlgo();
  }
  const isLive = (id, s, tf) => AG().live.some(x => x.id === id && x.symbol === s && x.tf === tf);
  function curveSvg(c, w = 520, h = 90) {
    if (!c || c.length < 2) return '';
    const lo = Math.min(...c), hi = Math.max(...c), X = i => (i / (c.length - 1)) * w, Y = v => h - 4 - ((v - lo) / (hi - lo || 1)) * (h - 8), up = c[c.length - 1] >= 1;
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="al-curve"><line x1="0" x2="${w}" y1="${Y(1)}" y2="${Y(1)}" stroke="rgba(255,255,255,.2)" stroke-dasharray="4 4"/>
      <polyline points="${c.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}" fill="none" stroke="${up ? '#10b981' : '#ef4444'}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
  }
  function paintAlgo() {
    const G = AG(), body = $('#algoBody');
    $$('#algoTabs [data-at]').forEach(x => x.classList.toggle('on', x.dataset.at === G.tab));
    if (G.tab === 'rank') {
      const rows = [...algoRes].sort((a, b) => b.score - a.score);
      body.innerHTML = `<div class="al-cfg"><span class="nx-chips">${(META.symbols || []).map(s => `<span data-am="${s.id}" class="${G.markets.includes(s.id) ? 'on' : ''}">${esc(s.name)}</span>`).join('')}</span>
          <span class="nx-chips">${['5m', '15m', '1h', '4h', '1d'].map(tf => `<span data-atf="${tf}" class="${G.tfs.includes(tf) ? 'on' : ''}">${tf}</span>`).join('')}</span>
          <select data-abars>${[1000, 2000, 5000].map(v => `<option value="${v}" ${G.bars === v ? 'selected' : ''}>${v} sviečok</option>`).join('')}</select>
          ${G.show ? `<button class="btn sm" data-ahide>🙈 Skryť ${esc(ALGO.SYS[G.show.id].name)} z grafu</button>` : ''}<button class="btn sm pri" data-arun>${algoBusy ? '⏳ Testujem…' : '▶ Otestovať všetky algoritmy'}</button><span class="muted" id="algoProg"></span></div>
        <div class="muted al-note">Každý algoritmus sa otestuje na reálnych sviečkach s cenou spreadu: rozhoduje uzavretá sviečka, vstup na otvorení ďalšej, ak sviečka zasiahne stop aj cieľ, ráta sa stop.
          <b>Overenie</b> = posledných 30 % dát. Rebríček = profit faktor, priemerné R, menší prepad, aspoň 15 obchodov. Minulé výsledky nezaručujú budúce.</div>
        ${rows.length ? `<table class="tt al-t"><tr><th>#</th><th>Algoritmus</th><th>Trh</th><th>Obch.</th><th>Úspešnosť</th><th>PF</th><th>Výnos</th><th>Max DD</th><th>Priem. R</th><th>Overenie</th><th>Teraz</th><th></th></tr>
          ${rows.map((r, k) => { const A = ALGO.SYS[r.id], s = r.stats, h = r.half, good = s.pf > 1.2 && s.n >= 15;
            return `<tr class="${good ? 'good' : s.pf !== null && s.pf < 1 ? 'bad' : ''}"><td>${k + 1}</td><td><b>${A.icon} ${esc(A.name)}</b><small class="muted"> ${esc(A.family)}</small></td><td>${esc(SYM[r.symbol].name)} ${r.tf}</td>
              <td>${s.n}</td><td>${s.win === null ? '–' : (100 * s.win).toFixed(0) + ' %'}</td><td><b>${s.pf === null ? '–' : s.pf === Infinity ? '∞' : s.pf.toFixed(2)}</b></td><td class="${s.ret >= 0 ? 'up' : 'dn'}">${pct(s.ret)}</td><td>${(100 * s.dd).toFixed(1)} %</td>
              <td>${s.avgR === null ? '–' : s.avgR.toFixed(2)}</td><td class="muted">${h.n ? `${(100 * h.win).toFixed(0)} % · PF ${h.pf === null ? '–' : h.pf === Infinity ? '∞' : h.pf.toFixed(2)}` : '–'}</td>
              <td>${r.open ? `<span class="pill ${r.open.dir > 0 ? 'win' : 'loss'}">${r.open.dir > 0 ? 'LONG' : 'SHORT'}</span>` : '<span class="muted">–</span>'}</td>
              <td class="al-btns"><button class="btn sm" data-adet="${r.id}" title="Detail a zdroje">ⓘ</button><button class="btn sm" data-agraph="${r.id}|${r.symbol}|${r.tf}" title="Zobraziť obchody v grafe">📈</button>
                <label class="al-live" title="Živé signály pre tento trh a timeframe"><input type="checkbox" data-alive="${r.id}|${r.symbol}|${r.tf}" ${isLive(r.id, r.symbol, r.tf) ? 'checked' : ''}> 📡</label></td></tr>`; }).join('')}</table>
          <div style="margin-top:8px"><button class="btn sm" data-atop>📡 Zapnúť živé signály pre 5 najlepších</button></div>` : `<div class="muted" style="padding:16px">${algoBusy ? 'Počítam…' : 'Vyber trhy a timeframy a stlač ▶. Test 4 trhov × 3 timeframov trvá pár sekúnd.'}</div>`}`;
    } else if (G.tab === 'detail') {
      const A = ALGO.SYS[G.sel] || ALGO.SYS.rsi2, mine = algoRes.filter(r => r.id === G.sel).sort((a, b) => b.score - a.score);
      body.innerHTML = `<div class="al-pick">${Object.entries(ALGO.SYS).map(([k, x]) => `<span data-asel="${k}" class="${k === G.sel ? 'on' : ''}">${x.icon} ${esc(x.name)}</span>`).join('')}</div>
        <h3 class="al-h">${A.icon} ${esc(A.name)} <small class="muted">${esc(A.family)}</small></h3><p>${esc(A.desc)}</p>
        <div class="lib-sec"><h3>Pravidlá</h3><ul>${A.rules.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>
        <div class="lib-sec"><h3>Čo hovorí výskum</h3><p>${esc(A.evidence)}</p><ul>${A.src.map(([n, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(n)}</a></li>`).join('')}</ul></div>
        <div class="lib-sec"><h3>Výsledky na našich dátach</h3>${mine.length ? mine.map(r => `<div class="al-res"><b>${esc(SYM[r.symbol].name)} ${r.tf}</b> · ${r.stats.n} obchodov · úspešnosť ${r.stats.win === null ? '–' : (100 * r.stats.win).toFixed(0) + ' %'} · PF ${r.stats.pf === null ? '–' : r.stats.pf === Infinity ? '∞' : r.stats.pf.toFixed(2)} · ${pct(r.stats.ret)}${curveSvg(r.stats.curve)}</div>`).join('') : '<div class="muted">Spusti test v záložke Rebríček.</div>'}</div>`;
    } else {
      body.innerHTML = `<div class="al-cfg"><label><input type="checkbox" data-aopt="chat" ${G.chat ? 'checked' : ''}> Vysielať do chatu (📡 Signál – vidia ho všetci)</label>
          <label><input type="checkbox" data-aopt="telegram" ${G.telegram ? 'checked' : ''}> Poslať aj na Telegram</label>
          <label><input type="checkbox" data-aopt="paper" ${G.paper ? 'checked' : ''}> Automaticky obchodovať na papierovom účte</label> <label>Loty <input type="number" step="0.01" min="0.01" value="${G.lots}" data-alots style="width:70px"></label></div>
        <div class="nx-sub">Sledované kombinácie (${G.live.length}) <span class="muted">· kontrola každých 30 s, signál = uzavretá sviečka s novým vstupom</span></div>
        ${G.live.length ? `<div class="al-live-list">${G.live.map((x, k) => `<span>${ALGO.SYS[x.id].icon} ${esc(ALGO.SYS[x.id].name)} · ${esc(SYM[x.symbol] ? SYM[x.symbol].name : x.symbol)} ${x.tf} <button class="ib" data-aoff="${k}">✕</button></span>`).join('')}</div>` : '<div class="muted">Zatiaľ nič – zapni 📡 pri riadkoch v Rebríčku.</div>'}
        <div class="nx-sub">Posledné signály <button class="btn sm" data-aclr>vymazať</button></div>
        <div class="nx-log">${G.log.slice(0, 60).map(l => `<div class="${l.dir > 0 ? 'buy' : 'sell'}"><span class="muted">${esc(new Date(l.t).toLocaleString('sk-SK'))}</span> <b>${esc(l.text)}</b></div>`).join('') || '<div class="muted">Zatiaľ žiadne signály.</div>'}</div>`;
    }
    bindAlgo(body);
  }
  function bindAlgo(b) {
    const G = AG(), tog = (arr, v) => (arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
    $$('[data-am]', b).forEach(x => x.onclick = () => { G.markets = tog(G.markets, x.dataset.am); save(); paintAlgo(); });
    $$('[data-atf]', b).forEach(x => x.onclick = () => { G.tfs = tog(G.tfs, x.dataset.atf); save(); paintAlgo(); });
    const ab = $('[data-abars]', b); if (ab) ab.onchange = () => { G.bars = +ab.value; save(); };
    const ar = $('[data-arun]', b); if (ar) ar.onclick = algoRank;
    const ah = $('[data-ahide]', b); if (ah) ah.onclick = () => { G.show = null; save(); updateMarkers(); paintAlgo(); };
    $$('[data-adet]', b).forEach(x => x.onclick = () => { G.sel = x.dataset.adet; G.tab = 'detail'; save(); paintAlgo(); });
    $$('[data-asel]', b).forEach(x => x.onclick = () => { G.sel = x.dataset.asel; save(); paintAlgo(); });
    $$('[data-agraph]', b).forEach(x => x.onclick = () => { const [id, s, tf] = x.dataset.agraph.split('|'); G.show = { id, symbol: s, tf }; save(); setAndReload({ symbol: s, tf }); toast(`🧠 ${ALGO.SYS[id].name}: obchody v grafe (▲▼ a ✕)`); });
    $$('[data-alive]', b).forEach(x => x.onchange = () => { const [id, symbol, tf] = x.dataset.alive.split('|'); G.live = x.checked ? [...G.live, { id, symbol, tf }] : G.live.filter(y => !(y.id === id && y.symbol === symbol && y.tf === tf)); save(); scheduleAlgo(); });
    const top = $('[data-atop]', b); if (top) top.onclick = () => { [...algoRes].sort((p, q) => q.score - p.score).slice(0, 5).forEach(r => { if (!isLive(r.id, r.symbol, r.tf)) G.live.push({ id: r.id, symbol: r.symbol, tf: r.tf }); }); save(); scheduleAlgo(); paintAlgo(); toast('📡 Živé signály zapnuté pre 5 najlepších'); };
    $$('[data-aopt]', b).forEach(x => x.onchange = () => { G[x.dataset.aopt] = x.checked; save(); });
    const al = $('[data-alots]', b); if (al) al.onchange = () => { G.lots = Math.max(0.01, +al.value || 0.1); save(); };
    $$('[data-aoff]', b).forEach(x => x.onclick = () => { G.live.splice(+x.dataset.aoff, 1); save(); paintAlgo(); });
    const cl = $('[data-aclr]', b); if (cl) cl.onclick = () => { G.log = []; save(); paintAlgo(); };
  }
  // live: every 30 s check the watched combinations; a new entry on the last closed candle = a signal
  async function algoTick() {
    const G = AG();
    for (const x of G.live) {
      if (!SYM[x.symbol] || !ALGO.SYS[x.id]) continue;
      try {
        const bars = (await fetchBars(x.symbol, x.tf, null, 600)).map(b => ({ ...b, sym: x.symbol })), D = dToD(bars), r = ALGO.run(x.id, D, { symbol: x.symbol });
        const o = r.open; if (!o || o.i0 !== D.t.length - 1) continue;
        const key = `${x.id}|${x.symbol}|${x.tf}|${o.sigT}`; if (G.seen[key]) continue;
        G.seen[key] = Date.now();
        const sy = SYM[x.symbol], f = v => (Number.isFinite(v) ? (+v).toFixed(sy.digits ?? 2) : '–'), A = ALGO.SYS[x.id];
        const text = `${o.dir > 0 ? '▲ BUY' : '▼ SELL'} ${sy.name} ${x.tf} · ${A.name} · vstup ~${f(D.c[D.c.length - 1])} · SL ${f(o.sl)}${o.tp ? ' · TP ' + f(o.tp) : ''}`;
        G.log.unshift({ t: Date.now(), dir: o.dir, text }); G.log.length = Math.min(G.log.length, 200);
        toast('📡 ' + text, 6000);
        if (G.chat && author()) fetch('api/signal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ author: author(), text, symbol: x.symbol, timeframe: x.tf, telegram: G.telegram }) }).then(() => pollChat()).catch(() => {});
        if (G.paper) NEXUS.algoTrade({ symbol: x.symbol, dir: o.dir, lots: G.lots, sl: o.sl, tp: o.tp, note: `${A.name} ${x.tf}` });
      } catch (e) {}
    }
    // forget old keys
    for (const k in G.seen) if (Date.now() - G.seen[k] > 7 * 86400e3) delete G.seen[k];
    save();
    if (algoEl.classList.contains('open') && G.tab === 'live') paintAlgo();
  }
  function scheduleAlgo() { clearInterval(algoTimer); algoTimer = AG().live.length && !EMBED ? setInterval(algoTick, 30000) : null; $('#bAlgo').classList.toggle('badge-on', AG().live.length > 0); }
  function toggleAlgo(open) {
    const G = AG(); G.open = open ?? !algoEl.classList.contains('open'); save();
    algoEl.classList.toggle('open', G.open); $('#bAlgo').classList.toggle('on', G.open);
    if (G.open) { placeWin(algoEl, G); paintAlgo(); if (!algoRes.length && G.tab === 'rank') algoRank(); }
  }
  $('#bAlgo').onclick = () => toggleAlgo();
  $('#algoClose').onclick = () => toggleAlgo(false);
  $('#algoMin').onclick = () => algoEl.classList.toggle('min');
  $$('#algoTabs [data-at]').forEach(x => x.onclick = () => { AG().tab = x.dataset.at; save(); paintAlgo(); });
  dragWin(algoEl, $('#algoHead'), AG());
  // the trades of the chosen algorithm as markers on the chart
  function algoMarks() {
    const G = AG(), sh = G.show;
    if (!sh || sh.symbol !== S.symbol || sh.tf !== S.tf || !ALGO.SYS[sh.id] || !D || D.t.length < 50) return [];
    const r = ALGO.run(sh.id, { ...D }, { symbol: S.symbol }), A = ALGO.SYS[sh.id], out = [];
    for (const t of r.trades.slice(-150)) {
      out.push({ time: t.t0, position: t.dir > 0 ? 'belowBar' : 'aboveBar', color: '#7c4dff', shape: t.dir > 0 ? 'arrowUp' : 'arrowDown', text: `🧠${t.dir > 0 ? '▲' : '▼'}`, size: 1.2 });
      out.push({ time: t.t1, position: t.dir > 0 ? 'aboveBar' : 'belowBar', color: t.ret > 0 ? '#00c853' : '#ff1744', shape: 'circle', text: `${t.ret > 0 ? '✓' : '✗'} ${(100 * t.ret).toFixed(2)}%`, size: 0.8 });
    }
    if (r.open) out.push({ time: r.open.t0, position: r.open.dir > 0 ? 'belowBar' : 'aboveBar', color: '#ffab00', shape: r.open.dir > 0 ? 'arrowUp' : 'arrowDown', text: `🧠 ${A.name} – otvorené`, size: 1.6 });
    return out;
  }

  // ---- workspaces with 1–10 charts each: the extra charts are small copies of this page (?embed=…) -----------
  // grid per chart count: columns, rows, and whether the main chart spans both rows on the left
  const GRIDS = { 1: ['1fr', '1fr'], '2h': ['1fr 1fr', '1fr'], '2v': ['1fr', '1fr 1fr'], 3: ['1.6fr 1fr', '1fr 1fr', 1], 4: ['1fr 1fr', '1fr 1fr'], 5: ['1.4fr 1fr 1fr', '1fr 1fr', 1],
                  6: ['1fr 1fr 1fr', '1fr 1fr'], 7: ['1.4fr 1fr 1fr 1fr', '1fr 1fr', 1], 8: ['repeat(4,1fr)', '1fr 1fr'], 9: ['repeat(3,1fr)', 'repeat(3,1fr)'], 10: ['repeat(5,1fr)', '1fr 1fr'] };
  const PANE_TFS = ['15m', '1h', '4h', '1d', '1m', '5m', '30m', '1w', '3m'];
  const layoutKey = L => (L.n === 2 ? '2' + L.two : String(L.n));
  function workspaces() {
    if (!Array.isArray(S.workspaces) || !S.workspaces.length) { S.workspaces = [{ id: 'w1', name: 'Plocha 1', layout: S.layout, main: { symbol: S.symbol, tf: S.tf } }]; S.wsId = 'w1'; }
    const ws = S.workspaces.find(w => w.id === S.wsId) || S.workspaces[0];
    S.wsId = ws.id; S.layout = ws.layout;
    return ws;
  }
  function paneDefaults(L) {
    const ids = (META.symbols || []).map(s => s.id);
    for (let i = 0; i < L.n - 1; i++) if (!L.panes[i]) L.panes[i] = { tf: PANE_TFS[i % PANE_TFS.length], symbol: ids[(i + 1) % Math.max(1, ids.length)] || S.symbol };
  }
  function applyLayout() {
    if (EMBED) return;
    const ws = workspaces(), L = S.layout, wrap = $('#chartWrap');
    paneDefaults(L);
    let grid = $('#paneGrid');
    if (!grid) { grid = document.createElement('div'); grid.id = 'paneGrid'; wrap.parentNode.insertBefore(grid, wrap); grid.appendChild(wrap); }
    const [cols, rows, span] = GRIDS[layoutKey(L)] || GRIDS[1];
    const scroll = pageScroll(), A = S.addons;
    grid.classList.toggle('scroll', scroll);
    if (scroll) { grid.style.gridTemplateColumns = `repeat(${A.scrollCols || 1}, 1fr)`; grid.style.gridTemplateRows = ''; grid.style.gridAutoRows = (A.scrollH || 75) + 'vh'; wrap.style.gridRow = ''; }
    else { grid.style.gridTemplateColumns = cols; grid.style.gridTemplateRows = rows; grid.style.gridAutoRows = ''; wrap.style.gridRow = span ? 'span 2' : ''; }
    if (chart) chart.applyOptions({ handleScale: { mouseWheel: !scroll } });
    eachPane(w => w.NX_pageScroll && w.NX_pageScroll(scroll));
    if (grid.dataset.ws !== ws.id) { $$('iframe.pane', grid).forEach(f => f.remove()); grid.dataset.ws = ws.id; }
    const want = Math.max(0, Math.min(9, L.n - 1)), frames = $$('iframe.pane', grid);
    frames.forEach((f, i) => { if (i >= want) f.remove(); });
    for (let i = frames.length; i < want; i++) {
      const p = L.panes[i], f = document.createElement('iframe');
      f.className = 'pane'; f.dataset.i = i; f.title = `Graf ${i + 2}`;
      f.src = `./?embed=${encodeURIComponent(ws.id)}-${i + 2}&i=${i}${L.hideBars ? '&bar=0' : ''}&symbol=${encodeURIComponent(L.sync ? S.symbol : p.symbol || S.symbol)}&tf=${encodeURIComponent(p.tf)}`;
      grid.appendChild(f);
    }
    $('#bLayout').classList.toggle('on', L.n > 1 || S.workspaces.length > 1);
    setTimeout(fitToolbar, 50);
  }
  const panes = () => $$('#paneGrid iframe.pane');
  // in the page of charts the mouse wheel scrolls the page; Ctrl + wheel zooms the chart under the mouse
  function pageScroll() { if (EMBED) { try { return !!parent.NX_isPageScroll(); } catch (e) { return false; } } return !!(S.addons.scroll && S.layout.n > 1); }
  window.NX_isPageScroll = () => pageScroll();
  window.NX_pageScroll = on => { if (chart) chart.applyOptions({ handleScale: { mouseWheel: !on } }); };
  $('#chartWrap').addEventListener('wheel', e => {
    if (!chart || !pageScroll()) return;
    if (!e.ctrlKey) { if (EMBED) { e.preventDefault(); try { parent.document.querySelector('#paneGrid').scrollBy({ top: e.deltaY, behavior: 'auto' }); } catch (x) {} } return; }   // a small chart passes the wheel to the page
    e.preventDefault(); const ts = chart.timeScale(); ts.applyOptions({ barSpacing: Math.max(1, Math.min(60, ts.options().barSpacing * (e.deltaY < 0 ? 1.12 : 0.89))) });
  }, { passive: false, capture: true });
  function setPageScroll(on) {
    S.addons.scroll = on;
    if (on && S.layout.n < 3) { S.layout.n = 4; S.layout.two = 'h'; }
    save(); applyLayout(); paintAddonsBtn();
    toast(on ? `📜 Stránka grafov: ${S.layout.n} grafov pod sebou – roluj kolieskom, Ctrl + koliesko = zoom` : 'Stránka grafov vypnutá – grafy späť v mriežke');
  }
  const eachPane = fn => panes().forEach(f => { try { fn(f.contentWindow); } catch (e) {} });
  window.NX_paneChanged = (i, x) => { const p = S.layout.panes[i]; if (p) { Object.assign(p, x); save(); } };
  // a workspace with `own` keeps its own indicators, functions and drawings (◻ Čistý graf starts with nothing on);
  // the other workspaces share one set, parked in S.wsShared while an own one is open
  const OWN_KEYS = ['studies', 'auto', 'range', 'fork', 'ideas', 'bubbles', 'tint', 'drawings', 'tradeMarks'];
  const snapOwn = () => JSON.parse(JSON.stringify(Object.fromEntries(OWN_KEYS.map(k => [k, k === 'studies' ? studies.filter(x => !x.temp) : S[k]]))));
  const cleanState = () => ({ studies: [], auto: { ...S.auto, on: false }, range: { ...S.range, on: false }, fork: { ...S.fork, on: false }, ideas: { ...S.ideas, on: false },
    bubbles: { ...S.bubbles, on: false }, tint: { ...S.tint, on: false }, drawings: {}, tradeMarks: false });
  function applyOwn(st) {
    for (const k of OWN_KEYS) if (k in st) S[k] = DEF[k] && typeof DEF[k] === 'object' && !Array.isArray(DEF[k]) ? merge(DEF[k], st[k]) : st[k];
    studies = (S.studies || []).map(KS.normalize).filter(Boolean);
  }
  function switchWorkspace(id) {
    const cur = workspaces();
    cur.main = { symbol: S.symbol, tf: S.tf };
    if (cur.own) cur.own = snapOwn(); else S.wsShared = snapOwn();
    S.wsId = id;
    const ws = workspaces();
    const swap = !!(ws.own || cur.own);
    if (ws.own) applyOwn(ws.own); else if (cur.own && S.wsShared) applyOwn(S.wsShared);
    save(); applyLayout();
    if (ws.main && (ws.main.symbol !== S.symbol || ws.main.tf !== S.tf)) setAndReload({ symbol: ws.main.symbol || S.symbol, tf: ws.main.tf || S.tf });
    else if (swap) { applyToolbar(); tlKey = ''; buildChart(); }
    paintDock();
    toast(`▦ ${ws.name} · ${S.layout.n} ${S.layout.n === 1 ? 'graf' : S.layout.n < 5 ? 'grafy' : 'grafov'}`);
  }
  // what is shown around every chart: price scale, time scale, legend, toolbar
  function applyView() {
    document.body.classList.toggle('no-legend', !!S.look.hideLegend);
    if (chart) chart.applyOptions({ rightPriceScale: { visible: !S.look.hideScale }, timeScale: { visible: !S.look.hideTime } });
  }
  function setView(o, all) {
    if ('scale' in o) S.look.hideScale = !o.scale;
    if ('time' in o) S.look.hideTime = !o.time;
    if ('legend' in o) S.look.hideLegend = !o.legend;
    if ('bar' in o && (EMBED || all === 'main')) { if (o.bar) { if (S.toolbar === 'hidden') S.toolbar = S.lastToolbar && S.lastToolbar !== 'hidden' ? S.lastToolbar : 'top'; } else if (S.toolbar !== 'hidden') { S.lastToolbar = S.toolbar; S.toolbar = 'hidden'; } applyToolbar(); }
    save(); applyView();
    if (all === true) eachPane(w => w.NX_view(o));
  }
  window.NX_view = o => setView(o);
  function layoutMenu(anchor) {
    const L = () => S.layout;
    const html = () => { const ws = workspaces(), cur = layoutKey(L());
      return `<div class="sec">Plochy <small class="muted">(Alt+1…9)</small></div>
      <div class="ws-list">${S.workspaces.map((w, k) => `<div class="ws-it ${w === ws ? 'on' : ''}" data-ws="${w.id}"><b>${k + 1}</b><span class="grow">${w.own ? '◻ ' : ''}${esc(w.name)}</span><small>${w.layout.n} ${w.layout.n === 1 ? 'graf' : 'gr.'}</small>
        <button class="ib" data-wsr="${w.id}" title="Premenovať">✎</button>${S.workspaces.length > 1 ? `<button class="ib" data-wsd="${w.id}" title="Zmazať plochu">🗑</button>` : ''}</div>`).join('')}
        <div class="ws-it add" data-wsnew>＋ Nová plocha</div><div class="ws-it add" data-wsclean title="Bez indikátorov, auto čiar, stratégií a kresieb – čo tu zapneš, platí len pre túto plochu">◻ Čistý graf (prázdne plátno)</div>
        <div class="ws-it add" data-wslab>🧪 Nexus Lab – druhý grafový systém</div><div class="ws-it add" data-wssave>💾 Uložiť / načítať rozloženie… <small class="muted">Ctrl+S</small></div></div>
      <div class="sec">Počet grafov na tejto ploche</div>
      <div class="lay-pick">${['1', '2h', '2v', '3', '4', '5', '6', '7', '8', '9', '10'].map(k => `<span data-ly="${k}" class="${cur === k ? 'on' : ''}">${k === '2h' ? '2 ⇆' : k === '2v' ? '2 ⇅' : k}</span>`).join('')}</div>
      <label class="it"><input type="checkbox" data-dock ${(S.wsDock || {}).on !== false ? 'checked' : ''}><span class="grow">Prepínač plôch priamo na obrazovke (dok)</span></label>
      <div class="it" data-dockcfg><span class="ic">⚙</span><span class="grow">Prepínač plôch: veľkosť, farby, karty hore / v bočnom paneli…</span></div>
      <div class="sec">Zobraziť pri grafoch</div>
      <div class="vw-grid">${[['scale', 'Cenová os', !S.look.hideScale], ['time', 'Čas a dátum', !S.look.hideTime], ['legend', 'Legenda', !S.look.hideLegend], ['bar', 'Panel malých grafov', !L().hideBars]].map(([k, n, on]) => `<label><input type="checkbox" data-vw="${k}" ${on ? 'checked' : ''}> ${n}</label>`).join('')}</div>
      ${L().n > 1 ? `<label class="it"><input type="checkbox" data-sync ${L().sync ? 'checked' : ''}><span class="grow">Rovnaký symbol vo všetkých grafoch</span></label>
      <div class="pane-list">${L().panes.slice(0, L().n - 1).map((p, i) => `<div class="pane-row"><b>Graf ${i + 2}</b>
        <select data-psym="${i}" ${L().sync ? 'disabled' : ''}>${(META.symbols || []).map(s => `<option value="${s.id}" ${(L().sync ? S.symbol : p.symbol) === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
        <select data-ptf="${i}">${['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'].map(tf => `<option ${p.tf === tf ? 'selected' : ''}>${tf}</option>`).join('')}</select></div>`).join('')}</div>` : ''}
      <div class="muted" style="font-size:11px;padding:4px 12px 6px">Pravý klik do grafu = skryť / zobraziť osi a panel len v ňom. Obchody, SL / TP aj značky vidíš vo všetkých grafoch.</div>`; };
    const rerender = m => { m.innerHTML = html(); bind(m); };
    const bind = m => {
      $$('[data-ws]', m).forEach(x => x.onclick = e => { if (e.target.closest('button')) return; if (x.dataset.ws !== S.wsId) { switchWorkspace(x.dataset.ws); rerender(m); } });
      $$('[data-wsr]', m).forEach(x => x.onclick = () => { const w = S.workspaces.find(y => y.id === x.dataset.wsr), n = prompt('Názov plochy', w.name); if (n && n.trim()) { w.name = n.trim().slice(0, 30); save(); rerender(m); } });
      $$('[data-wsd]', m).forEach(x => x.onclick = () => { const w = S.workspaces.find(y => y.id === x.dataset.wsd); if (!confirm(`Zmazať plochu „${w.name}“?`)) return;
        S.workspaces = S.workspaces.filter(y => y !== w); if (S.wsId === w.id) switchWorkspace(S.workspaces[0].id); else save(); rerender(m); });
      $('[data-wsnew]', m).onclick = () => { newWorkspace(false); rerender(m); };
      $('[data-wsclean]', m).onclick = () => { newWorkspace(true); rerender(m); };
      $('[data-wslab]', m).onclick = () => { closeMenu(); window.open('lab', '_blank'); };
      $('[data-wssave]', m).onclick = () => { closeMenu(); NEXUS.openApp('saves'); };
      $('[data-dockcfg]', m).onclick = () => { const D = dockCfg(); D.on = true; save(); paintDock(); closeMenu(); dockMenu($('#bLayout')); };
      $$('[data-ly]', m).forEach(x => x.onclick = () => { const k = x.dataset.ly; L().n = k === '2h' || k === '2v' ? 2 : +k; L().two = k === '2v' ? 'v' : 'h'; save(); applyLayout(); rerender(m); });
      $$('[data-vw]', m).forEach(x => x.onchange = () => {
        if (x.dataset.vw === 'bar') { L().hideBars = !x.checked; save(); eachPane(w => w.NX_view({ bar: x.checked })); return; }
        setView({ [x.dataset.vw]: x.checked }, true);
      });
      const dk = $('[data-dock]', m); if (dk) dk.onchange = () => { S.wsDock = { ...(S.wsDock || {}), on: dk.checked }; save(); paintDock(); };
      const sy = $('[data-sync]', m); if (sy) sy.onchange = () => { L().sync = sy.checked; save(); if (L().sync) eachPane(w => w.NX_setSymbol(S.symbol)); rerender(m); };
      $$('[data-psym]', m).forEach(x => x.onchange = () => { const i = +x.dataset.psym; L().panes[i].symbol = x.value; save(); const f = panes()[i]; try { f.contentWindow.NX_setSymbol(x.value); } catch (e) {} });
      $$('[data-ptf]', m).forEach(x => x.onchange = () => { const i = +x.dataset.ptf; L().panes[i].tf = x.value; save(); const f = panes()[i]; try { f.contentWindow.NX_setTf(x.value); } catch (e) {} });
    };
    openMenu(anchor, html(), bind, { side: side(), cls: 'lay-menu' });
  }
  $('#bLayout').onclick = e => layoutMenu(e.currentTarget);
  // ---- 💾 saves: the whole chart setup (workspaces, charts, indicators, drawings, look) under a name and date/time ------
  // On the server per name (api/saves/{labeler}); without a name only in this browser (localStorage nxsaves).
  // Accounts, chat, board, robot and window positions are not part of a save and stay as they are when one is loaded.
  const SAVE_SKIP = ['alerts', 'scripts', 'accounts', 'accountId', 'account', 'chat', 'news', 'board', 'robot', 'labeler', 'savedAt', 'idea', 'folders', 'nexus', 'algo', 'mirrorOf', 'flow'];
  const saveName = () => `Uloženie ${new Date().toLocaleString('sk-SK', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
  function snapSave() {
    const cur = workspaces(); cur.main = { symbol: S.symbol, tf: S.tf }; if (cur.own) cur.own = snapOwn();
    save();
    const state = JSON.parse(JSON.stringify(persisted(), (k, v) => (k[0] === '_' ? undefined : v))); SAVE_SKIP.forEach(k => delete state[k]);
    const ids = S.workspaces.map(w => `nx2:pane${w.id}-`), panes = {};    // the small charts of every workspace keep their own settings
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (ids.some(p => k.startsWith(p))) panes[k] = localStorage.getItem(k); }
    const info = { symbol: S.symbol, tf: S.tf, ws: S.workspaces.length, charts: S.workspaces.reduce((n, w) => n + (w.layout.n || 1), 0),
      studies: studies.filter(s => !s.temp).length, drawings: Object.values(S.drawings || {}).reduce((n, a) => n + (Array.isArray(a) ? a.length : 0), 0) };
    return { data: { v: 1, state, panes }, info };
  }
  const SV = {
    remote: () => !!S.labeler,
    url: id => `api/saves/${encodeURIComponent(S.labeler)}${id ? '/' + id : ''}`,
    local: () => LS.get('nxsaves', []),
    async req(method, id, body) {
      const r = await fetch(SV.url(id), { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.status);
      return r.json();
    },
    async list() { return SV.remote() ? SV.req('GET') : SV.local().map(({ data, ...x }) => x); },
    async get(id) { return SV.remote() ? SV.req('GET', id) : SV.local().find(x => x.id === id); },
    async put(id, body) {      // id = null → a new save
      if (SV.remote()) return id ? SV.req('PUT', id, body) : SV.req('POST', null, body);
      const L = SV.local(), now = new Date().toISOString();
      let x = id && L.find(y => y.id === id);
      if (!x) { x = { id: Date.now().toString(36), created_at: now }; L.unshift(x); }
      Object.assign(x, body, { updated_at: now });
      try { localStorage.setItem('nxsaves', JSON.stringify(L)); } catch (e) { throw new Error('v prehliadači už nie je miesto – zadaj meno v Nexus → Účet, uloženia pôjdu na server'); }
      const { data, ...pub } = x; return pub;
    },
    async del(id) { if (SV.remote()) return SV.req('DELETE', id); LS.set('nxsaves', SV.local().filter(x => x.id !== id)); },
  };
  const saves = {
    remote: SV.remote, list: SV.list, defaultName: saveName,
    async create(name) { const x = await SV.put(null, { name: (name || '').trim().slice(0, 60) || saveName(), ...snapSave() }); toast(`💾 Uložené: ${x.name}`); return x; },
    async overwrite(id) { const x = await SV.put(id, snapSave()); toast(`💾 Prepísané: ${x.name}`); return x; },
    rename: (id, name) => SV.put(id, { name: name.trim().slice(0, 60) }),
    del: SV.del,
    async load(id) {
      const x = await SV.get(id); if (!x || !x.data || !x.data.state) throw new Error('uloženie je prázdne');
      if (mirror) { clearInterval(mirror.t); Object.assign(S, mirror.own); mirror = null; }
      const keep = Object.fromEntries(SAVE_SKIP.filter(k => k in S).map(k => [k, S[k]]));
      S = merge(DEF, { ...x.data.state, ...keep, mirrorOf: '', savedAt: Date.now() });
      studies = (S.studies || []).map(KS.normalize).filter(Boolean);
      Object.keys(localStorage).filter(k => k.startsWith('nx2:pane')).forEach(k => localStorage.removeItem(k));
      Object.entries(x.data.panes || {}).forEach(([k, v]) => { try { localStorage.setItem(k, v); } catch (e) {} });
      LS.set(KEY, S);
      if (S.labeler) await fetch(`api/prefs/${encodeURIComponent(S.labeler)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(S) }).catch(() => {});
      toast(`↺ Načítavam: ${x.name}…`); setTimeout(() => location.reload(), 300);
    },
  };
  // ---- Text: notes, pins, a table, callouts, pictures, posts and ideas on the chart ---------------------------
  $('#bText').onclick = e => {
    const sec = (g, name) => `<div class="sec">${name}</div>${Object.values(DR.TOOLS).filter(t => t.group === g).map(t => `<div class="it ${draw.mode === t.id ? 'on' : ''}" data-tool="${t.id}"><span class="ic tx-ic">${t.icon}</span><span class="grow">${esc(t.name)}</span></div>`).join('')}`;
    openMenu(e.currentTarget, sec('text', 'Text a poznámky') + sec('content', 'Obsah') +
      '<div class="muted" style="font-size:11px;padding:6px 12px 8px">Klikni do grafu, kam to patrí. Text upravíš dvojklikom na kresbu (alebo ⚙).</div>',
      m => $$('[data-tool]', m).forEach(x => x.onclick = () => { closeMenu(); draw.start(x.dataset.tool); }), { side: side(), cls: 'text-menu' });
  };

  // ---- 🧰 Tools: drawing, text and indicators in one menu, plus the learning area ✂ -------------------------------
  function toolsMenu(anchor) {
    const tile = (attr, ic, n, on, cls) => `<div class="tl-t ${on ? 'on' : ''} ${cls || ''}" ${attr} title="${esc(n)}"><span class="tl-ic">${ic}</span><small>${esc(n)}</small></div>`;
    const html = () => {
      const T = Object.values(DR.TOOLS), has = k => studies.some(s => s.type === k), fav = (S.favorites || []).filter(k => KS.STUDIES[k]);
      const extra = studies.map(s => s.type).filter((k, i, a) => a.indexOf(k) === i && !fav.includes(k) && KS.STUDIES[k]);
      return `<div class="tl-head"><b>🧰 Tools</b><span class="muted">kreslenie · text · indikátory</span></div>
        <div class="sec">✎ Kreslenie</div><div class="tl-grid">${T.filter(t => t.group !== 'text' && t.group !== 'content').map(t => tile(`data-tool="${t.id}"`, t.icon, t.name, draw.mode === t.id)).join('')}</div>
        <div class="sec">T Text a obsah</div><div class="tl-grid">${T.filter(t => t.group === 'text' || t.group === 'content').map(t => tile(`data-tool="${t.id}"`, t.icon, t.name, draw.mode === t.id, 'tx-ic')).join('')}</div>
        <div class="sec">ƒx Indikátory <small class="muted">klik = pridať / odobrať</small></div><div class="tl-grid">${[...fav, ...extra].map(k => tile(`data-st="${k}"`, has(k) ? '✓' : '＋', KS.STUDIES[k].name, has(k))).join('')}${tile('data-allind', 'ƒx', 'Všetky indikátory…')}</div>
        <div class="sec">💹 Obchod</div><div class="tl-grid">${tile('data-qbuy="1"', '🐂', 'Kúpiť (vyber loty)')}${tile('data-qbuy="-1"', '🐻', 'Predať (vyber loty)')}${tile('data-qlim', '🖱', 'Limit / stop myšou')}
          ${tile('data-qbar', '⚡', 'Rýchle tlačidlá na grafe', (NEXUS.flags() || {}).quick)}${tile('data-ticket', '🎛', 'Obchodný panel', (NEXUS.flags() || {}).ticket)}</div>
        <div class="sec">🧠 Učenie, roboty, prehľad</div><div class="tl-grid">${tile('data-area', '✂', 'Uložiť oblasť do učenia')}${tile('data-feat', '🎛', 'Prehľad funkcií (on / off)')}${tile('data-alerts', '🔔', 'RSI upozornenia')}
          ${tile('data-script', '📜', 'Script – roboty')}${tile('data-og', '🌱', 'Overgrown Lab')}${tile('data-lab', '🧪', 'Nexus Lab')}</div>`;
    };
    const bind = m => {
      $$('[data-tool]', m).forEach(x => x.onclick = () => { closeMenu(); draw.start(x.dataset.tool); });
      $$('[data-st]', m).forEach(x => x.onclick = () => { const k = x.dataset.st; if (studies.some(s => s.type === k)) { studies = studies.filter(s => s.type !== k); studiesChanged(); toast(`Odobrané: ${KS.STUDIES[k].name}`); } else addStudy(k); m.innerHTML = html(); bind(m); });
      $('[data-allind]', m).onclick = () => { closeMenu(); indMenu($('#bInd').style.display === 'none' ? anchor : $('#bInd')); };
      $('[data-area]', m).onclick = () => { closeMenu(); areaLearn(); };
      $('[data-ticket]', m).onclick = () => { NEXUS.toggleTicket(); m.innerHTML = html(); bind(m); };
      $('[data-lab]', m).onclick = () => { closeMenu(); window.open('lab', '_blank'); };
      $$('[data-qbuy]', m).forEach(x => x.onclick = () => { closeMenu(); NEXUS.quickDialog(+x.dataset.qbuy); });
      $('[data-qlim]', m).onclick = () => { closeMenu(); NEXUS.limitByMouse(null, ((S.nexus || {}).qt || {}).lots || 0.1); };
      $('[data-qbar]', m).onclick = () => { NEXUS.setFlag('quick', !(NEXUS.flags() || {}).quick); m.innerHTML = html(); bind(m); };
      $('[data-feat]', m).onclick = () => { closeMenu(); featuresDialog(); };
      $('[data-alerts]', m).onclick = () => { closeMenu(); alertsDialog(); };
      $('[data-script]', m).onclick = () => { closeMenu(); NEXUS.openApp('script'); };
      $('[data-og]', m).onclick = () => { closeMenu(); window.open('overgrown', '_blank'); };
    };
    openMenu(anchor, html(), bind, { side: side(), cls: 'tools-menu' });
  }
  $('#bTools').onclick = e => toolsMenu(e.currentTarget);

  // ---- 🔁 the same look / candles / background / indicator style on every chart (every workspace, the small charts too) ----
  // The small charts keep their own copy of the settings (localStorage nx2:pane…); open ones reload it at once.
  const LOOK_KEYS = ['look', 'bgImg', 'type', 'renko', 'crosshair', 'legend', 'tint', 'addons'], VIEW_KEYS = ['hideScale', 'hideTime', 'hideLegend'];
  const clone = x => JSON.parse(JSON.stringify(x));
  const lookNow = () => Object.fromEntries(LOOK_KEYS.map(k => [k, S[k]]));
  const studyStyle = s => ({ type: s.type, set: clone({ inputs: s.inputs, plots: s.plots, tfs: s.tfs, out: s.out, alpha: s.alpha, overlay: s.overlay, ovH: s.ovH, float: s.float, box: s.box }) });
  const lookPatch = src => st => { const keep = Object.fromEntries(VIEW_KEYS.map(k => [k, (st.look || {})[k]])); for (const k of LOOK_KEYS) if (src[k] !== undefined) st[k] = clone(src[k]); st.look = { ...st.look, ...keep }; };
  const studyPatch = (style, add) => st => {
    const list = Array.isArray(st.studies) ? st.studies : (st.studies = []), same = list.filter(x => x && x.type === style.type);
    same.forEach(x => Object.assign(x, clone(style.set)));
    if (!same.length && add) list.push({ ...clone(style.set), type: style.type, visible: true });
  };
  function applyAll(what, src, add) {
    if (EMBED) { try { parent.NX_applyAll(what, clone(src), add); } catch (e) {} return; }
    const patch = what === 'look' ? lookPatch(src) : what === 'cop' ? (st => { st.look = { ...(st.look || {}), cop: src.cop }; }) : studyPatch(src, add);
    if (what === 'look' || what === 'cop') { const keep = clone(S.look); patch(S); VIEW_KEYS.forEach(k => { S.look[k] = keep[k]; }); }
    else {
      const me = { studies }; patch(me); studies = me.studies.map(KS.normalize).filter(Boolean);
      (S.workspaces || []).forEach(w => { if (w.own) patch(w.own); }); if (S.wsShared) patch(S.wsShared);
    }
    save(); applyPanel(); applyBg(); applyBright(); applyToolbar(); applyView(); buildChart();
    const keys = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('nx2:pane')) keys.push(k); }
    for (const k of keys) { const st = LS.get(k, null); if (st && typeof st === 'object') { patch(st); LS.set(k, st); } }
    eachPane(w => w.NX_reloadState && w.NX_reloadState());
    toast(`🔁 ${what === 'look' ? 'Vzhľad, sviečky a pozadie' : what === 'cop' ? `🔆 Jas sviečok ${src.cop} %` : KS.STUDIES[src.type].name} – použité na všetky grafy (${keys.length + 1})`);
  }
  window.NX_applyAll = applyAll;
  window.NX_reloadState = () => {
    const st = LS.get(KEY, null); if (!st) return;
    for (const k of [...LOOK_KEYS, 'studies', 'hideStudies']) if (k in st) S[k] = DEF[k] && typeof DEF[k] === 'object' && !Array.isArray(DEF[k]) ? merge(DEF[k], st[k]) : st[k];
    studies = (S.studies || []).map(KS.normalize).filter(Boolean);
    applyPanel(); applyBg(); applyBright(); applyToolbar(); applyView(); buildChart();
  };
  function applyStudyAll(s) {
    const add = confirm(`Nastavenia ${KS.STUDIES[s.type].name} použiť vo všetkých grafoch.\n\nOK = pridať ${KS.STUDIES[s.type].name} aj do grafov, kde ešte nie je\nZrušiť = iba tam, kde už je`);
    applyAll('study', studyStyle(s), add);
  }
  document.addEventListener('click', e => { if (e.target.closest('[data-allc]')) applyAll('look', lookNow()); });

  // ---- shortcut buttons next to 🧰 Tools: hide all indicators, candles, all functions, Buy / Sell scanner ---------------
  function setHideStudies(on, all) {
    S.hideStudies = on; save(); buildChart(); paintHideBtn();
    if (all) eachPane(w => w.NX_hideStudies && w.NX_hideStudies(on));
  }
  window.NX_hideStudies = on => setHideStudies(on, false);
  function paintHideBtn() { const b = $('#bHideInd'); if (!b) return; b.classList.toggle('on', !!S.hideStudies); $('.tx', b).textContent = S.hideStudies ? 'Zobraziť ind.' : 'Skryť ind.'; $('.ic', b).textContent = S.hideStudies ? '🙈' : '👁'; }
  $('#bHideInd').onclick = () => { setHideStudies(!S.hideStudies, true); toast(S.hideStudies ? '🙈 Všetky indikátory skryté (vo všetkých grafoch) · Alt+H' : '👁 Indikátory znova zobrazené'); };
  $('#bAll2').onclick = e => $('#bAll').onclick({ currentTarget: e.currentTarget });
  const COP_PRE = [[100, 'Plné'], [85, 'Jemne tlmené'], [70, 'Tlmené'], [55, 'Matné'], [40, 'Jemné'], [25, 'Duch']];
  const copHtml = () => { const L = S.look, o = L.cop ?? 100;
    return `<div class="sec">🔆 Jas sviečok <small class="muted">všetky sviečky, všetky grafy</small></div><div class="tl-grid">${COP_PRE.map(([v, n]) => `<div class="tl-t ${o === v ? 'on' : ''}" data-copp="${v}"><span class="tl-ic"><i class="cc-sw" style="background:${L.up};opacity:${v / 100}"></i><i class="cc-sw" style="background:${L.down};opacity:${v / 100}"></i></span><small>${n} · ${v} %</small></div>`).join('')}</div>
      <div class="it fl-op"><span class="ic">◐</span><span class="grow">Vlastný jas</span><input type="range" min="10" max="100" step="5" data-cop value="${o}"><b>${o} %</b></div>`; };
  function bindCop(m, re) {
    $$('[data-copp]', m).forEach(x => x.onclick = () => { applyAll('cop', { cop: +x.dataset.copp }); re(m); });
    const r = $('[data-cop]', m); if (!r) return;
    r.oninput = () => { S.look.cop = +r.value; r.nextElementSibling.textContent = r.value + ' %'; clearTimeout(r.t); r.t = setTimeout(() => buildChart(), 60); };   // preview here
    r.onchange = () => { applyAll('cop', { cop: +r.value }); re(m); };                                                                                       // then every chart
  }
  const CANDLE_COLORS = [['TradingView', '#089981', '#f23645'], ['Klasika', '#26a69a', '#ef5350'], ['Neón', '#00e676', '#ff1744'], ['Modrá / oranžová', '#2962ff', '#ff6d00'],
    ['Čiernobiela', '#e0e3eb', '#5d606b'], ['Zlato', '#d4a017', '#8d6e63'], ['Fialová', '#7c4dff', '#ff4081'], ['Farboslepé', '#0072b2', '#e69f00']];
  const shapeSvg = p => `<svg viewBox="0 0 40 24" width="40" height="24">${[[4, 14, 4, 20], [7, 17, 3, 22], [10, 12, 2, 18]].map(([y, h, top, bot], i) => { const x = 6 + i * 12, w = Math.max(1.5, 9 * p.body / 100);
    return `<line x1="${x}" y1="${top}" x2="${x}" y2="${bot}" stroke="currentColor" stroke-width="${p.wick}"/><rect x="${x - w / 2}" y="${y}" width="${w}" height="${h - y + 2}" rx="${Math.min(w / 2, p.radius / 12)}" fill="${i === 1 ? 'var(--down)' : 'var(--up)'}"/>`; }).join('')}</svg>`;
  function candlesMenu(anchor) {
    const L = S.look, CS = L.candle;
    const html = () => `<div class="tl-head"><b>🕯 Sviečky</b><span class="muted">typ grafu, tvar, farby</span></div>
      <div class="sec">Typ grafu</div><div class="tl-grid">${TYPES.map(([k, n, ic]) => `<div class="tl-t ${k === S.type ? 'on' : ''}" data-ct="${k}"><span class="tl-ic">${ic}</span><small>${esc(n)}</small></div>`).join('')}</div>
      <div class="sec">Tvar sviečok</div><div class="tl-grid">${Object.entries(CANDLE_PRESETS).map(([k, [n, p]]) => `<div class="tl-t ${CS.preset === k ? 'on' : ''}" data-cpr="${k}"><span class="tl-ic">${shapeSvg(p)}</span><small>${esc(n)}</small></div>`).join('')}</div>
      ${copHtml()}
      <div class="sec">Farby</div><div class="tl-grid">${CANDLE_COLORS.map(([n, u, d], k) => `<div class="tl-t ${L.up === u && L.down === d ? 'on' : ''}" data-ccol="${k}"><span class="tl-ic"><i class="cc-sw" style="background:${u}"></i><i class="cc-sw" style="background:${d}"></i></span><small>${esc(n)}</small></div>`).join('')}</div>
      <div class="cm-row"><label>▲ rast <input type="color" data-cc="up" value="${L.up}"></label><label>▼ pokles <input type="color" data-cc="down" value="${L.down}"></label>
        ${[['body', 'Telo'], ['wicks', 'Knôty'], ['borders', 'Okraje']].map(([k, n]) => `<label><input type="checkbox" data-cb="${k}" ${L[k] ? 'checked' : ''}> ${n}</label>`).join('')}</div>
      <div class="it" data-cset><span class="ic">⚙</span><span class="grow">Všetky nastavenia sviečok (hrúbka, knôty, zaoblenie, rozostup)…</span></div>
      <div class="it" data-allc><span class="ic">🔁</span><span class="grow">Použiť sviečky, farby a pozadie na všetky grafy</span></div>`;
    const re = m => { m.innerHTML = html(); bind(m); };
    const bind = m => {
      $$('[data-ct]', m).forEach(x => x.onclick = () => { const k = x.dataset.ct, fresh = (k === 'renko') !== (S.type === 'renko'); S.type = k; save(); applyToolbar(); buildChart(fresh ? null : undefined); re(m); });
      $$('[data-cpr]', m).forEach(x => x.onclick = () => { Object.assign(CS, CANDLE_PRESETS[x.dataset.cpr][1], { preset: x.dataset.cpr }); save(); buildChart(); chart.timeScale().applyOptions({ barSpacing: CS.spacing }); re(m); });
      $$('[data-ccol]', m).forEach(x => x.onclick = () => { const [, u, d] = CANDLE_COLORS[+x.dataset.ccol]; Object.assign(L, { up: u, borderUp: u, wickUp: u, down: d, borderDown: d, wickDown: d }); save(); buildChart(); re(m); });
      $$('[data-cc]', m).forEach(x => x.onchange = () => { const k = x.dataset.cc, c = x.value; if (k === 'up') Object.assign(L, { up: c, borderUp: c, wickUp: c }); else Object.assign(L, { down: c, borderDown: c, wickDown: c }); save(); buildChart(); });
      $$('[data-cb]', m).forEach(x => x.onchange = () => { L[x.dataset.cb] = x.checked; save(); buildChart(); });
      $('[data-cset]', m).onclick = () => { closeMenu(); settings('bars'); };
      bindCop(m, re);
      $('[data-allc]', m).addEventListener('click', () => closeMenu());
    };
    openMenu(anchor, html(), bind, { side: side(), cls: 'tools-menu' });
  }
  $('#bCandles').onclick = e => candlesMenu(e.currentTarget);

  // ---- 🎯 Buy / Sell scanner: one verdict per market and timeframe ----------------------------------------------------
  // Votes: TradingView-like technical ratings 35 %, trend (EMA 50 / 200) 20 %, MACD histogram 20 %, RSI 10 %, a fresh live
  // idea (trendline / level) 15 %. ≥ +20 % = BUY, ≤ −20 % = SELL. Stop 1.5 ATR, target 3 ATR (or the idea's own levels).
  const SIG_TFS = ['5m', '15m', '1h', '4h'], SIG_W = { '5m': 1, '15m': 1.3, '1h': 1.6, '4h': 2 };
  let sigRes = {}, sigBusy = false, sigAt = 0, sigSel = null; const sigCache = {};
  const verdict = (Dx, tf) => MV.verdict(Dx, tf, { tfSec: TF_SEC[tf], ideas: ideaOpts() });
  async function runSig() {
    if (sigBusy) return; sigBusy = true; paintSig();
    const syms = (META.symbols || []).map(s => s.id), jobs = [];
    for (const s of syms) for (const tf of SIG_TFS) jobs.push([s, tf]);
    const worker = async () => { while (jobs.length) { const [s, tf] = jobs.shift();
      try { const bars = (await fetchBars(s, tf, null, 600)).slice(0, -1); if (bars.length > 220) { const Dx = toD(bars); Dx.s = Dx.t.map(t => (SYM[s] && SYM[s].hours === 'gold' ? sessGold(t) : Math.floor(t / 86400))); sigRes[s + '|' + tf] = verdict(Dx, tf); } }
      catch (e) { sigRes[s + '|' + tf] = { err: String(e.message || e) }; }
      paintSig(); } };
    await Promise.all([worker(), worker(), worker()]);
    sigBusy = false; sigAt = Date.now(); paintSig();
  }
  const sigBadge = (v, big) => { if (!v) return '<span class="sg n">…</span>'; if (v.err) return '<span class="sg n" title="' + esc(v.err) + '">⚠</span>';
    const p = Math.round(Math.abs(v.score) * 100); return `<span class="sg ${v.dir > 0 ? 'b' : v.dir < 0 ? 's' : 'n'}${big ? ' big' : ''}">${v.dir > 0 ? '🐂 BUY' : v.dir < 0 ? '🐻 SELL' : '— NEUTRÁL'} <small>${p} %</small></span>`; };
  function sigAll(s) {
    let w = 0, sc = 0; for (const tf of SIG_TFS) { const v = sigRes[s + '|' + tf]; if (v && !v.err) { sc += v.score * SIG_W[tf]; w += SIG_W[tf]; } }
    if (!w) return null; sc /= w; return { score: sc, dir: sc >= 0.2 ? 1 : sc <= -0.2 ? -1 : 0 };
  }
  function paintSig() {
    const d = $('.sig-dlg'); if (!d) return;
    const syms = META.symbols || [], cur = sigAll(S.symbol);
    $('.sig-now', d).innerHTML = `<b>${esc(sym().name)}</b> spolu (všetky timeframy): ${sigBadge(cur, true)} <span class="muted">${sigBusy ? 'skenujem…' : sigAt ? 'aktualizované ' + new Date(sigAt).toLocaleTimeString('sk-SK') : ''}</span>`;
    $('.sig-t', d).innerHTML = `<tr><th>Trh</th>${SIG_TFS.map(tf => `<th>${tf}</th>`).join('')}<th>Spolu</th></tr>` + syms.map(s => `<tr class="${s.id === S.symbol ? 'cur' : ''}"><td>${esc(s.name)}</td>${SIG_TFS.map(tf => `<td data-sg="${s.id}|${tf}" class="${sigSel === s.id + '|' + tf ? 'sel' : ''}">${sigBadge(sigRes[s.id + '|' + tf])}</td>`).join('')}<td>${sigBadge(sigAll(s.id))}</td></tr>`).join('');
    $$('[data-sg]', d).forEach(x => x.onclick = () => { sigSel = x.dataset.sg; paintSig(); });
    const box = $('.sig-det', d), v = sigSel && sigRes[sigSel];
    if (!v || v.err) { box.innerHTML = '<div class="muted">Klikni na políčko – uvidíš prečo, vstup, stop loss a cieľ.</div>'; return; }
    const [s, tf] = sigSel.split('|'), dg = (SYM[s] || {}).digits ?? 2, f = x => (+x).toFixed(dg);
    box.innerHTML = `<div class="sig-h">${esc((SYM[s] || {}).name || s)} ${tf} ${sigBadge(v, true)}</div>
      <ul>${v.why.map(w => `<li class="${w.v > 0.1 ? 'up' : w.v < -0.1 ? 'dn' : ''}">${w.v > 0.1 ? '▲' : w.v < -0.1 ? '▼' : '•'} ${esc(w.txt)}</li>`).join('')}</ul>
      ${v.dir ? `<div>Vstup ~ <b>${f(v.entry)}</b> · SL <b class="dn">${f(v.sl)}</b> · TP <b class="up">${f(v.tp)}</b> · R:R 1:${(Math.abs(v.tp - v.entry) / Math.abs(v.entry - v.sl)).toFixed(1)}${v.idea ? '' : ' (SL 1,5 ATR, TP 3 ATR)'}</div>` : '<div class="muted">Signály sa navzájom rušia – radšej počkaj.</div>'}
      <div class="sig-b"><button class="btn sm" data-sgo>📈 Otvoriť graf</button>${v.dir ? `<button class="btn sm pri" data-sgt>${v.dir > 0 ? '🐂' : '🐻'} Pripraviť obchod v paneli</button>` : ''}</div>`;
    $('[data-sgo]', box).onclick = () => { closeDialog(); if (s !== S.symbol || tf !== S.tf) setAndReload({ symbol: s, tf }); };
    const t = $('[data-sgt]', box); if (t) t.onclick = () => { closeDialog(); if (s !== S.symbol || tf !== S.tf) setAndReload({ symbol: s, tf });
      NEXUS.plan({ dir: v.dir, slD: Math.abs(v.entry - v.sl), tpD: Math.abs(v.tp - v.entry) }); toast(`${v.dir > 0 ? '🐂 BUY' : '🐻 SELL'} pripravený v obchodnom paneli – skontroluj SL / TP a potvrď ✔`); };
  }
  function sigDialog() {
    openDialog(`<div class="dlg-h"><span>🎯 Buy / Sell skener</span><button class="ib" data-x>✕</button></div><div class="dlg-b">
      <div class="sig-now"></div><div class="ar-tw"><table class="sig-t ar-t"></table></div><div class="sig-det"></div>
      <div class="muted" style="font-size:11px;margin-top:8px">Hlasujú: Technicals 35 %, trend EMA 50/200 20 %, MACD 20 %, RSI 10 %, čerstvý nápad z čiar a úrovní 15 %. Nad +20 % = BUY, pod −20 % = SELL. „Spolu“ váži vyššie timeframy viac. Je to štatistika, nie istota – vždy použi stop loss.</div></div>
      <div class="dlg-f"><button class="btn" data-sre>↻ Skenovať znova</button><span class="grow"></span><button class="btn pri" data-x>Hotovo</button></div>`, null, 'wide sig-dlg');
    $$('.sig-dlg [data-x]').forEach(x => x.onclick = closeDialog);
    $('.sig-dlg [data-sre]').onclick = () => runSig();
    paintSig();
    if (Date.now() - sigAt > 60000) runSig();
  }
  $('#bSig').onclick = () => sigDialog();
  $('#bFeat').onclick = () => featuresDialog();

  // ---- 🧩 Toolbar Add-ons: small extras of the chart, the first one follows the live price -------------------------------
  // Follow: the last candle stays at the right edge and the price in view. Scroll back and it pauses until you return to the end
  // (or, with "always", every tick brings the chart back).
  const idle = () => new Promise(r => (window.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: 300 }) : setTimeout(r, 0)));
  let followPaused = false;
  function followTick(force) {
    if (!chart || !main || !S.addons.follow || view.replay || !disp.length) { if (followPaused) { followPaused = false; paintAddonsBtn(); } return; }
    const ts = chart.timeScale(), r = ts.getVisibleLogicalRange(), n = disp.length;
    const paused = !force && !S.addons.always && r && r.to < n - 2;
    if (paused !== followPaused) { followPaused = paused; paintAddonsBtn(); }
    if (paused) return;
    if (!r || r.to < n - 1 || force) ts.scrollToRealTime();
    const y = main.priceToCoordinate(disp[n - 1].close), h = chart.paneSize(mainIdx).height;
    if (y === null || y < 12 || y > h - 12) main.priceScale().applyOptions({ autoScale: true });
  }
  function setFollow(on) {
    S.addons.follow = on; save(); followPaused = false;
    if (on) followTick(true);
    paintAddonsBtn();
    toast(on ? '📡 Sledovať cenu: zapnuté – graf ide so živou cenou (Alt+F)' : '📡 Sledovať cenu: vypnuté');
  }
  function paintAddonsBtn() {
    const b = $('#bAddons'); if (!b) return;
    b.classList.toggle('on', !!S.addons.follow); b.classList.toggle('paused', !!(S.addons.follow && followPaused));
    b.title = S.addons.follow ? (followPaused ? '📡 Sledovanie pozastavené – odscrolloval si. Klik → Späť na cenu' : '📡 Graf sleduje živú cenu') : 'Toolbar Add-ons: sledovať cenu a ďalšie doplnky';
  }
  function addonsMenu(anchor) {
    const A = S.addons;
    const html = () => `<div class="tl-head"><b>🧩 Toolbar Add-ons</b><span class="muted">doplnky grafu</span></div>
      <label class="it"><input type="checkbox" data-ad="follow" ${A.follow ? 'checked' : ''}><span class="grow">📡 <b>Sledovať cenu</b> ${A.follow ? (followPaused ? '<small class="muted">⏸ pozastavené</small>' : '<small class="up">● zapnuté</small>') : ''}<br><small class="muted">graf sa posúva so živou cenou – posledná sviečka vpravo, cena vždy v obraze · Alt+F</small></span></label>
      <label class="it ${A.follow ? '' : 'dis'}"><input type="checkbox" data-ad="always" ${A.always ? 'checked' : ''} ${A.follow ? '' : 'disabled'}><span class="grow">Vrátiť sa na cenu aj keď odscrollujem<br><small class="muted">inak sa sledovanie pozastaví, kým sa nevrátiš na koniec grafu</small></span></label>
      <div class="it" data-adback><span class="ic">⏎</span><span class="grow">Späť na živú cenu teraz</span></div>
      ${copHtml()}
      <div class="sec">📜 Stránka grafov</div>
      <label class="it"><input type="checkbox" data-ad="scroll" ${A.scroll ? 'checked' : ''}><span class="grow"><b>Grafy pod sebou – rolovať ako na stránke</b><br><small class="muted">každý graf plochy má svoju výšku, kolieskom roluješ nadol na ďalšie · Ctrl + koliesko = zoom grafu</small></span></label>
      <div class="it sc-cfg ${A.scroll ? '' : 'dis'}"><span class="ic">↕</span><span class="grow">Výška grafu</span><select data-scrh>${[40, 50, 60, 75, 90, 100].map(v => `<option value="${v}" ${(A.scrollH || 75) === v ? 'selected' : ''}>${v} % okna</option>`).join('')}</select>
        <select data-scrc>${[1, 2, 3].map(v => `<option value="${v}" ${(A.scrollCols || 1) === v ? 'selected' : ''}>${v} ${v === 1 ? 'stĺpec' : 'stĺpce'}</option>`).join('')}</select>
        <select data-scrn>${[2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => `<option value="${v}" ${S.layout.n === v ? 'selected' : ''}>${v} grafov</option>`).join('')}</select></div>
      <div class="sec">🪟 Plávajúce indikátory</div>
      <label class="it"><input type="checkbox" data-ad="float" ${A.float ? 'checked' : ''}><span class="grow"><b>Indikátory v plávajúcich oknách</b><br><small class="muted">MACD, RSI… nezmenšujú sviečky: okno presunieš za názov, veľkosť rohom ◢, mierku ťahaním po jeho cenovej osi (dvojklik = späť)</small></span></label>
      ${studies.filter(s => !s.temp && (KS.STUDIES[s.type].pane === true || s.type === 'volume') && !KS.STUDIES[s.type].custom && !KS.STUDIES[s.type].pattern).map(s => `<label class="it fl-sub"><input type="checkbox" data-fls="${s.uid}" ${isFloat(s) ? 'checked' : ''} ${s.overlay ? 'disabled' : ''}><span class="grow">${esc(KS.STUDIES[s.type].label(s))}${s.overlay ? ' <small class="muted">(prekrýva graf)</small>' : s.float === undefined && s.type !== 'volume' ? ' <small class="muted">podľa hlavného prepínača</small>' : ''}</span></label>`).join('')}
      <div class="it fl-op"><span class="ic">◐</span><span class="grow">Pozadie okien</span><input type="range" min="0" max="90" step="5" data-flbg value="${A.floatBg ?? 0}"><b>${A.floatBg ?? 0} %</b></div>
      <div class="it" data-flarr><span class="ic">⊞</span><span class="grow">Zoradiť okná (dole vľavo)</span></div>
      <div class="sep"></div>
      <div class="it" data-adall><span class="ic">🔁</span><span class="grow">Tieto doplnky aj vo všetkých grafoch</span></div>
      <div class="it" data-adfeat><span class="ic">🎛</span><span class="grow">Všetky funkcie on / off…</span></div>`;
    const bind = m => {
      $$('[data-ad]', m).forEach(x => x.onchange = () => { const k = x.dataset.ad;
        if (k === 'follow') setFollow(x.checked); else if (k === 'scroll') setPageScroll(x.checked); else if (k === 'float') { A.float = x.checked; save(); buildChart(); toast(A.float ? '🪟 Indikátory v plávajúcich oknách – sviečky majú celú výšku' : 'Indikátory späť v paneloch pod grafom'); }
        else { A.always = x.checked; save(); followTick(true); } m.innerHTML = html(); bind(m); });
      bindCop(m, mm => { mm.innerHTML = html(); bind(mm); });
      const sh = $('[data-scrh]', m), sc = $('[data-scrc]', m), sn = $('[data-scrn]', m);
      sh.onchange = () => { A.scrollH = +sh.value; save(); applyLayout(); };
      sc.onchange = () => { A.scrollCols = +sc.value; save(); applyLayout(); };
      sn.onchange = () => { S.layout.n = +sn.value; save(); applyLayout(); };
      $$('[data-fls]', m).forEach(x => x.onchange = () => { const s = studies.find(y => y.uid === x.dataset.fls); if (s) { s.float = x.checked; studiesChanged(); } m.innerHTML = html(); bind(m); });
      const fb = $('[data-flbg]', m); if (fb) fb.oninput = () => { A.floatBg = +fb.value; fb.nextElementSibling.textContent = A.floatBg + ' %'; $('#chartWrap').style.setProperty('--fl-bg', (A.floatBg / 100).toFixed(2)); clearTimeout(fb.t); fb.t = setTimeout(save, 300); };
      $('[data-flarr]', m).onclick = () => { closeMenu(); studies.forEach(s => { delete s.box; }); studiesChanged(); };
      $('[data-adback]', m).onclick = () => { closeMenu(); followPaused = false; if (chart) { chart.timeScale().scrollToRealTime(); main.priceScale().applyOptions({ autoScale: true }); } paintAddonsBtn(); };
      $('[data-adall]', m).onclick = () => { closeMenu(); applyAll('look', { addons: S.addons }); };
      $('[data-adfeat]', m).onclick = () => { closeMenu(); featuresDialog(); };
    };
    openMenu(anchor, html(), bind, { side: side(), cls: 'tools-menu' });
  }
  $('#bAddons').onclick = e => addonsMenu(e.currentTarget);

  // ---- 🔔 alerts: RSI reaching its levels (e.g. 80 / 20 on 1 minute) – toast, sound and a system notification -------------
  const alertsOn = () => (S.alerts || []).filter(a => a.on).length;
  let alertT = null;
  function notifyOS(title, body) { try { if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body, tag: title + body }); } catch (e) {} }
  const askNotify = () => { try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {} };
  function scheduleAlerts() { clearInterval(alertT); alertT = !EMBED && alertsOn() ? setInterval(checkAlerts, 15000) : null; if (alertT) checkAlerts(); }
  async function checkAlerts() {
    for (const a of (S.alerts || []).filter(x => x.on)) {
      try {
        const bars = await fetchBars(a.symbol, a.tf, null, Math.max(80, a.len * 6)), r = KS.rsi(bars.map(b => b.close), a.len), v = r[r.length - 1];
        if (!Number.isFinite(v)) continue;
        a.last = v;
        const zone = v >= a.hi ? 'hi' : v <= a.lo ? 'lo' : 'mid';
        if (zone !== a.zone) {
          if (zone !== 'mid') {
            const n = `${(SYM[a.symbol] || {}).name || a.symbol} ${a.tf}`, t = `RSI ${a.len} = ${v.toFixed(1)} ${zone === 'hi' ? `≥ ${a.hi} – prekúpené` : `≤ ${a.lo} – prepredané`}`;
            toast(`🔔 ${n}: ${t}`, 9000); beep(zone === 'hi' ? -1 : 1); notifyOS(`🔔 ${n}`, t); a.hits = (a.hits || 0) + 1; a.lastHit = Date.now();
          }
          a.zone = zone; save();
        }
      } catch (e) {}
    }
    const d = $('.al-dlg'); if (d) paintAlerts(d);
  }
  function paintAlerts(d) {
    const L = S.alerts = S.alerts || [], tfs = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d'];
    $('.al-list', d).innerHTML = L.map((a, i) => `<div class="al-row ${a.on ? '' : 'off'}"><label class="ctl"><input type="checkbox" data-aon="${i}" ${a.on ? 'checked' : ''}></label>
      <select data-af="${i}|symbol">${(META.symbols || []).map(s => `<option value="${s.id}" ${s.id === a.symbol ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
      <select data-af="${i}|tf">${tfs.map(t => `<option ${t === a.tf ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <span>RSI</span><input type="number" min="2" max="100" data-af="${i}|len" value="${a.len}" title="Dĺžka RSI"><span>▲</span><input type="number" min="50" max="100" data-af="${i}|hi" value="${a.hi}" title="Horná úroveň">
      <span>▼</span><input type="number" min="0" max="50" data-af="${i}|lo" value="${a.lo}" title="Dolná úroveň">
      <span class="al-now ${a.zone === 'hi' ? 'dn' : a.zone === 'lo' ? 'up' : ''}">${Number.isFinite(a.last) ? 'teraz ' + a.last.toFixed(1) : '…'}${a.hits ? ` · ${a.hits}×` : ''}</span><button class="ib" data-adel="${i}" title="Zmazať">✕</button></div>`).join('')
      || '<div class="muted">Zatiaľ žiadne upozornenie. Pridaj si napr. RSI 80 / 20 na 1 minúte.</div>';
    $$('[data-aon]', d).forEach(x => x.onchange = () => { L[+x.dataset.aon].on = x.checked; if (x.checked) askNotify(); save(); scheduleAlerts(); paintAlerts(d); });
    $$('[data-af]', d).forEach(x => x.onchange = () => { const [i, k] = x.dataset.af.split('|'), a = L[+i]; a[k] = ['len', 'hi', 'lo'].includes(k) ? +x.value : x.value; a.zone = null; a.last = NaN; save(); scheduleAlerts(); });
    $$('[data-adel]', d).forEach(x => x.onclick = () => { L.splice(+x.dataset.adel, 1); save(); scheduleAlerts(); paintAlerts(d); });
  }
  function alertsDialog() {
    const d = openDialog(`<div class="dlg-h"><span>🔔 Upozornenia RSI</span><button class="ib" data-x>✕</button></div><div class="dlg-b al-dlg">
      <div class="al-add"><button class="btn sm pri" data-apre="1m|80|20">＋ RSI 80 / 20 na 1m</button><button class="btn sm" data-apre="5m|70|30">＋ RSI 70 / 30 na 5m</button><button class="btn sm" data-apre="15m|70|30">＋ 70 / 30 na 15m</button><button class="btn sm" data-apre="1h|80|20">＋ 80 / 20 na 1h</button></div>
      <div class="al-list"></div>
      <div class="muted" style="font-size:11px;margin-top:8px">Kontrola každých 15 s (aj keď je otvorený iný trh). Upozorní raz, keď RSI vojde nad hornú alebo pod dolnú úroveň – znova až keď z nej vyjde a vojde späť. Zvuk + správa v Nexuse + systémová notifikácia (povoľ ju v prehliadači).</div></div>
      <div class="dlg-f"><span class="grow"></span><button class="btn pri" data-x>Hotovo</button></div>`, null, 'wide al-dlg');
    $$('[data-x]', d).forEach(x => x.onclick = closeDialog);
    $$('[data-apre]', d).forEach(b => b.onclick = () => { const [tf, hi, lo] = b.dataset.apre.split('|'); (S.alerts = S.alerts || []).push({ id: Date.now().toString(36), symbol: S.symbol, tf, len: 14, hi: +hi, lo: +lo, on: true }); askNotify(); save(); scheduleAlerts(); paintAlerts(d); });
    paintAlerts(d);
  }

  // ---- 🎛 overview of every function: on / off in one place, with how much each one costs the chart ------------------------
  // cost: 0 nothing … 3 heavy (fixed by what the function does) + what we measured (ms per redraw of each indicator)
  const perf = { build: 0, tick: 0 };
  const COST_TXT = ['žiadna', 'nízka', 'stredná', 'vysoká', 'veľmi vysoká'];
  function featRows() {
    const nx = (NEXUS.flags && NEXUS.flags()) || {}, al = ((S.algo || {}).live || []).length, dn = currentDrawings().length;
    const R = (g, k, name, on, set, cost, info, cfg) => ({ g, k, name, on: !!on, set, cost, info: info || '', cfg });
    const unitOf = s => units.find(u => u.s === s);
    return [
      R('Indikátory', 'float', '🪟 Indikátory v plávajúcich oknách', S.addons.float, v => { S.addons.float = v; buildChart(); }, 0, `${units.filter(u => u.fc).length} v oknách`, () => addonsMenu($('#bAddons'))),
      R('Graf', 'cop', `🔆 Jas sviečok ${S.look.cop ?? 100} %`, (S.look.cop ?? 100) < 100, v => applyAll('cop', { cop: v ? 70 : 100 }), 0, 'vypnuté = plné farby; presety v 🕯 Sviečky / 🧩 Add-ons', () => candlesMenu($('#bCandles'))),
      R('Graf', 'scroll', '📜 Stránka grafov (rolovať nadol)', S.addons.scroll, v => setPageScroll(v), 0, S.addons.scroll ? `${S.layout.n} grafov · ${S.addons.scrollH || 75} % výšky` : '', () => addonsMenu($('#bAddons'))),
      R('Graf', 'follow', '📡 Sledovať cenu (graf ide s cenou)', S.addons.follow, v => setFollow(v), 0, S.addons.follow ? (S.addons.always ? 'vráti sa aj po odscrollovaní' : 'pri odscrollovaní sa pozastaví') : '', () => addonsMenu($('#bAddons'))),
      R('Graf', 'live', 'Živá cenová čiara', S.look.lastLine, v => { S.look.lastLine = v; buildChart(); }, 0, `hrúbka ${S.look.liveW || 2} px`, () => settings('scale')),
      R('Graf', 'legend', 'Legenda (názvy a hodnoty)', !S.look.hideLegend, v => setView({ legend: v }), 0),
      R('Graf', 'photo', 'Pozadie – fotka / kreslená scéna', !!bgUrl(), v => { if (v) { if (S.bgImg.prevId) S.bgImg.id = S.bgImg.prevId; else return stylesDialog(); } else { S.bgImg.prevId = S.bgImg.id; S.bgImg.id = 'none'; S.bgImg.auto = false; } applyBg(); buildChart(); }, 1, S.bgImg.id !== 'none' ? S.bgImg.id : '', () => stylesDialog()),
      R('Graf', 'video', 'Video pozadie', !!S.bgImg.video, v => { if (v) return stylesDialog(); S.bgImg.video = ''; applyBg(); applyVideo && applyVideo(); buildChart(); }, 3, '', () => stylesDialog()),
      R('Graf', 'anim', 'Animácia pozadia', S.bgImg.anim && S.bgImg.anim !== 'none', v => { if (v) return stylesDialog(); S.bgImg.anim = 'none'; applyAnim(); }, 2, S.bgImg.anim && S.bgImg.anim !== 'none' ? S.bgImg.anim : '', () => stylesDialog()),
      R('Graf', 'tint', 'Podfarbenie podľa Technicals', S.tint.on, v => { S.tint.on = v; applyTint(true); }, 1),
      R('Indikátory', 'allind', 'Všetky indikátory', !S.hideStudies, v => setHideStudies(!v, true), 0, `${studies.filter(s => !s.temp).length} v grafe`),
      ...studies.filter(s => !s.temp).map(s => { const u = unitOf(s), def = KS.STUDIES[s.type];
        return R('Indikátory', 'st:' + s.uid, def.label(s), s.visible !== false && !S.hideStudies, v => { s.visible = v; if (v && S.hideStudies) setHideStudies(false, true); studiesChanged(); },
          def.custom ? 3 : def.pattern ? 1 : 1 + (u && u.ms > 12 ? 2 : u && u.ms > 4 ? 1 : 0),
          `${u && Number.isFinite(u.ms) ? u.ms.toFixed(1) + ' ms' : 'vypnutý'}${(s.alpha ?? 100) < 100 ? ` · priehľadnosť ${s.alpha} %` : ''}${s.overlay ? ' · prekrýva graf' : def.pane === true ? ' · vlastný panel' : ' · v grafe'}`, () => studySettings(s)); }),
      R('Analýza', 'auto', 'Auto trendové čiary a úrovne', S.auto.on, v => toggleAuto(v), 2, S.auto.on && tlR ? `${(tlR.lines || []).filter(x => x.ended == null).length} čiar` : '', () => autoMenu($('#bFunc'))),
      R('Analýza', 'major', 'Veľké (major) čiary', S.auto.major, v => { S.auto.major = v; tlKey = ''; computeTL(); autoLayer && autoLayer.update(); }, 2),
      R('Analýza', 'range', 'Range + BOS', S.range.on, v => { S.range.on = v; stKey = ''; computeStruct(); structLayer && structLayer.update(); }, 2, '', () => structMenu($('#bFunc'), 'range')),
      R('Analýza', 'fork', 'Vidly (pitchfork)', S.fork.on, v => { S.fork.on = v; stKey = ''; computeStruct(); structLayer && structLayer.update(); }, 1, '', () => structMenu($('#bFunc'), 'fork')),
      R('Analýza', 'ideas', 'Živé nápady (značky v grafe)', S.ideas.on, v => { S.ideas.on = v; tlKey = ''; buildChart(); }, 1, '', () => strategiesDialog()),
      R('Analýza', 'bubbles', 'Objemové bubliny', S.bubbles.on, v => { S.bubbles.on = v; save(); bubbles && bubbles.update(); }, 2, '', () => flowMenu($('#bFunc'))),
      R('Analýza', 'draw', 'Kresby', !draw.hidden, v => { draw.hidden = !v; draw.redraw(); }, dn > 40 ? 2 : 1, `${dn} v tomto grafe`),
      R('Obchod', 'ticket', 'Obchodný panel 🐂 / 🐻', nx.ticket, v => NEXUS.setFlag('ticket', v), 0),
      R('Obchod', 'quick', 'Rýchle BUY / SELL tlačidlá na grafe', nx.quick, v => NEXUS.setFlag('quick', v), 0),
      R('Obchod', 'ctl', 'Tlačidlá na čiare pozície (SL / TP / ½ / BE / ✕ myšou)', nx.ctl, v => NEXUS.setFlag('ctl', v), 0),
      R('Obchod', 'lines', 'Čiara vstupu aj bez tlačidiel', nx.lines, v => NEXUS.setFlag('lines', v), 0),
      R('Obchod', 'marks', 'Značky obchodov v grafe', S.tradeMarks, v => { S.tradeMarks = v; save(); updateMarkers(); }, 1),
      R('Automatika', 'scan', 'Automatický skener', S.scan.every > 0, v => { S.scan.every = v ? 300 : 0; save(); scheduleScan(); }, 2, S.scan.every ? `každých ${Math.round(S.scan.every / 60)} min` : '', () => scanDialog()),
      R('Automatika', 'alerts', 'RSI upozornenia', alertsOn() > 0, v => { (S.alerts || []).forEach(a => { a.on = v; }); save(); scheduleAlerts(); if (v && !(S.alerts || []).length) alertsDialog(); }, alertsOn() > 3 ? 2 : 1, `${alertsOn()} aktívne`, () => alertsDialog()),
      R('Automatika', 'robot', 'SMA robot', nx.robot, v => NEXUS.setFlag('robot', v), 1, '', () => NEXUS.openApp('bot')),
      R('Automatika', 'scripts', '📜 Script roboty', nx.scripts > 0, v => { if (v) NEXUS.openApp('script'); else NEXUS.setFlag('scripts', false); }, nx.scripts ? 2 : 0, `${nx.scripts || 0} beží · ${nx.orders || 0} čakajúcich príkazov`, () => NEXUS.openApp('script')),
      R('Automatika', 'algo', '🧠 Algo živé signály', al > 0, null, al ? 2 : 0, `${al} systémov`, () => toggleAlgo(true)),
    ];
  }
  function featuresDialog() {
    const d = openDialog(`<div class="dlg-h"><span>🎛 Prehľad funkcií – čo je zapnuté</span><button class="ib" data-x>✕</button></div><div class="dlg-b fm-dlg"><div class="fm-top"></div><div class="fm-body"></div></div>
      <div class="dlg-f"><button class="btn" data-fmoff title="Vypne všetko, čo graf zaťažuje (pozadie, animácie, analýzy, bubliny) – indikátory a obchody nechá">🪶 Odľahčiť graf</button><span class="grow"></span><button class="btn pri" data-x>Hotovo</button></div>`, null, 'wide fm-wide');
    $$('[data-x]', d).forEach(x => x.onclick = closeDialog);
    const paint = () => {
      const rows = featRows(), on = rows.filter(r => r.on), load = on.reduce((s, r) => s + r.cost, 0), lvl = load <= 4 ? 1 : load <= 9 ? 2 : load <= 15 ? 3 : 4;
      const series = units.reduce((n, u) => n + Object.keys(u.hists).length + Object.values(u.lines).reduce((m, l) => m + l.length, 0), 0);
      $('.fm-top', d).innerHTML = `<div class="fm-load c${lvl}"><b>Zaťaženie grafu: ${COST_TXT[lvl]}</b><span class="fm-bar"><i style="width:${Math.min(100, load * 5)}%"></i></span></div>
        <div class="muted">Zapnuté ${on.length} z ${rows.length} · prekreslenie grafu ${perf.build.toFixed(0)} ms · živý tik ${perf.tick.toFixed(1)} ms · ${series} čiar indikátorov · ${(disp || []).length} sviečok</div>`;
      const groups = [...new Set(rows.map(r => r.g))];
      $('.fm-body', d).innerHTML = groups.map(g => `<div class="sec2">${g}</div>` + rows.filter(r => r.g === g).map(r => `<div class="fm-row ${r.on ? 'on' : ''}"><label class="ctl"><input type="checkbox" data-fk="${esc(r.k)}" ${r.on ? 'checked' : ''} ${r.set ? '' : 'disabled'}></label>
        <span class="grow"><b>${esc(r.name)}</b>${r.info ? `<small>${esc(r.info)}</small>` : ''}</span><span class="fm-cost c${r.on ? Math.min(4, r.cost) : 0}" title="Zaťaženie: ${COST_TXT[Math.min(4, r.cost)]}">${'▮'.repeat(Math.max(1, Math.min(4, r.cost)))}</span>
        ${r.cfg ? `<button class="ib" data-fc="${esc(r.k)}" title="Nastavenia">⚙</button>` : '<span class="ib"></span>'}</div>`).join('')).join('');
      $$('[data-fk]', d).forEach(x => x.onchange = () => { const r = featRows().find(y => y.k === x.dataset.fk); if (r && r.set) { r.set(x.checked); save(); } setTimeout(paint, 250); });
      $$('[data-fc]', d).forEach(x => x.onclick = () => { const r = featRows().find(y => y.k === x.dataset.fc); if (r && r.cfg) { closeDialog(); r.cfg(); } });
    };
    $('[data-fmoff]', d).onclick = () => { for (const r of featRows()) if (r.on && r.set && ['photo', 'video', 'anim', 'tint', 'auto', 'major', 'range', 'fork', 'bubbles', 'scan'].includes(r.k)) r.set(false); save(); setTimeout(paint, 300); toast('🪶 Graf odľahčený'); };
    paint();
  }

  // ---- ⊞ every function in one place, by category; choose which buttons stay on the toolbar -------------------
  const FUNCS = [
    ['Graf', [['bSymbol', '◆', 'Symbol', 'Vyber trh'], ['bType', '🕯', 'Typ grafu', 'Sviečky, Heikin Ashi, Renko…'], ['bTf', '⏱', 'Timeframe', '1 s až 1 mesiac'], ['bLayout', '▦', 'Rozloženie a plochy', '1–10 grafov, prepínanie plôch'], ['bAddons', '🧩', 'Toolbar Add-ons', 'Sledovať cenu a ďalšie doplnky · Alt+F'], ['saves', '💾', 'Uloženia', 'Ulož rozloženie pod názvom (s dátumom a časom), načítaj neskôr · Ctrl+S']]],
    ['Kreslenie a text', [['bTools', '🧰', 'Tools', 'Kreslenie + text + indikátory v jednom menu · Alt+T'], ['bHideInd', '👁', 'Skryť indikátory', 'Skryje / zobrazí všetky indikátory vo všetkých grafoch · Alt+H'], ['bCandles', '🕯', 'Sviečky', 'Typ grafu, tvar a farby sviečok'], ['bDraw', '✎', 'Kreslenie', 'Čiary, Fibonacci, vzory, tvary'], ['bText', 'T', 'Text', 'Poznámky, pin, tabuľka, obrázok, nápad']]],
    ['Analýza', [['bInd', 'ƒx', 'Indikátory', 'RSI, MACD, kĺzavé priemery, vzory'], ['bFunc', '🧩', 'Funkcie', 'Čiary, objem, stratégie, pozadie podľa Technicals'], ['lines', '📐', 'Čiary', 'Auto trendové čiary a úrovne'], ['volume', '🫧', 'Objem', 'Bubliny, delta, tok obchodov'], ['strats', '⚡', 'Stratégie nápadov', 'Zapnúť / vypnúť, R:R, stop'], ['bAlgo', '🧠', 'Algo', 'Overené stratégie, test, živé signály'], ['area', '✂', 'Oblasť do učenia', 'Označ sviečky, ktoré už prebehli: štatistika + indikátory v číslach do Nexus Lab'],
      ['tech', '📊', 'Technicals', 'Súhrn pre všetky timeframy (v Knižnici)'], ['bScan', '🔍', 'Skenovať', 'Hľadá vstupy na trhoch'], ['bSig', '🎯', 'Buy / Sell skener', 'Nákup alebo predaj? Verdikt pre každý trh a timeframe'], ['bFeat', '🎛', 'Prehľad funkcií', 'Všetko, čo je zapnuté – vypni / zapni a pozri, ako zaťažuje graf'], ['alerts', '🔔', 'RSI upozornenia', 'Napr. RSI 80 / 20 na 1 minúte'],
      ['og', '🌱', 'Overgrown Lab', 'Tretí grafový systém: trend na všetkých TF, kde sa začína pohyb'], ['script', '📜', 'Script', 'Roboty: Director skenuje, dáva signály, kladie príkazy'], ['bReplay', '⏯', 'Replay', 'Tréning na histórii'],
      ['lab', '🧪', 'Nexus Lab', 'Druhý grafový systém: karty, skener objemových pohybov, učenie'], ['elec', '🔌', 'Electricals', 'Štatistiky: čo sa stalo pri akej hodnote indikátorov']]],
    ['Obchod', [['nexus', '◆', 'Nexus', 'Účet, pozície, robot, nástenka'], ['ticket', '🐂', 'Obchodný panel', 'Býk = kúpiť, medveď = predať · SL, TP, čiastočné výstupy'], ['bIdea', '💡', 'Nápad', 'Alerty skenera a labelovanie']]],
    ['Komunikácia', [['bChat', '💬', 'Chat', 'Tím, nápady, otázky pre Clauda'], ['news', '📰', 'Správy', 'Novinky, kalendár, odkazy (v okne chatu)']]],
    ['Vzhľad', [['bSettings', '⚙', 'Nastavenia', 'Graf, panel, jas'], ['styles', '🖼', 'Štýly', 'Fotky, videá, animácie, témy (aj v Nastaveniach)'], ['bFull', '⛶', 'Celá obrazovka', 'F11'], ['bUndo', '↶', 'Späť', 'Ctrl+Z'], ['bRedo', '↷', 'Znova', 'Ctrl+Y']]],
    ['Vzdelávanie', [['bLib', '📚', 'Knižnica', 'Formácie, stratégie, tipy']]],
  ];
  function applyHiddenButtons() { const H = S.panel.hide || []; $$('#toolbar .tbtn').forEach(b => { if (b.id !== 'bAll') b.style.display = H.includes(b.id) ? 'none' : ''; }); fitToolbar(); }
  $('#bAll').onclick = e => {
    const html = () => `<div class="all-head"><b>Všetky funkcie</b><span class="muted">☆ = tlačidlo je v paneli</span></div>
      ${FUNCS.map(([cat, list]) => `<div class="sec">${cat}</div><div class="all-grid">${list.map(([id, ic, n, hint]) => { const onBar = id.startsWith('b') && !(S.panel.hide || []).includes(id);
        return `<div class="all-it" data-fn="${id}" title="${esc(hint)}"><span class="all-ic">${ic}</span><span class="grow"><b>${esc(n)}</b><small>${esc(hint)}</small></span>${id.startsWith('b') ? `<span class="all-pin ${onBar ? 'on' : ''}" data-pin="${id}" title="${onBar ? 'Skryť z panela' : 'Pridať do panela'}">${onBar ? '★' : '☆'}</span>` : ''}</div>`; }).join('')}</div>`).join('')}`;
    const bind = m => {
      $$('[data-pin]', m).forEach(x => x.onclick = ev => { ev.stopPropagation(); const id = x.dataset.pin, H = S.panel.hide = S.panel.hide || []; S.panel.hide = H.includes(id) ? H.filter(y => y !== id) : [...H, id]; save(); applyHiddenButtons(); m.innerHTML = html(); bind(m); });
      $$('[data-fn]', m).forEach(x => x.onclick = () => {
        const id = x.dataset.fn; closeMenu();
        if (id === 'nexus') return NEXUS.open();
        if (id === 'lab') return window.open('lab', '_blank');
        if (id === 'elec') return NEXUS.openApp('elec');
        if (id === 'saves') return NEXUS.openApp('saves');
        if (id === 'area') return areaLearn();
        if (id === 'alerts') return alertsDialog();
        if (id === 'og') return window.open('overgrown', '_blank');
        if (id === 'script') return NEXUS.openApp('script');
        if (id === 'ticket') return NEXUS.toggleTicket();
        if (id === 'styles') return stylesDialog();
        if (id === 'lines') return autoMenu($('#bFunc'));
        if (id === 'volume') return flowMenu($('#bFunc'));
        if (id === 'strats') return strategiesDialog();
        if (id === 'tech') { LIB.close(); return openTech(); }
        if (id === 'news') return toggleNews(true);
        const b = $('#' + id); if (!b) return;
        // a hidden button still opens its menu: anchor it to ⊞
        if (b.style.display === 'none') { b.style.display = ''; b.click(); setTimeout(() => applyHiddenButtons(), 0); } else b.click();
      });
    };
    openMenu(e.currentTarget, html(), bind, { side: side(), cls: 'all-menu' });
  };

  // ---- the workspace dock: Plocha 1 / 2 / 3 … floating anywhere, as tabs above the chart or as a side panel of tabs ------
  // themes: background, accent, active tab, text
  const DOCK_THEMES = { blue: ['Modrá', 'rgba(20,23,32,.9)', '#2962ff', 'rgba(41,98,255,.3)', '#b2b5be'], gold: ['Zlatá', 'rgba(26,22,12,.93)', '#d4a017', 'rgba(212,160,23,.28)', '#e8d9a8'],
    green: ['Zelená', 'rgba(10,26,22,.92)', '#10b981', 'rgba(16,185,129,.28)', '#b8e0d2'], purple: ['Fialová', 'rgba(24,16,36,.92)', '#8b5cf6', 'rgba(139,92,246,.3)', '#d4c8f0'],
    neon: ['Neón', 'rgba(6,6,14,.94)', '#ff2bd6', 'rgba(0,229,255,.2)', '#9ef'], mono: ['Šedá', 'rgba(32,32,32,.92)', '#9e9e9e', 'rgba(255,255,255,.14)', '#ddd'],
    light: ['Svetlá', 'rgba(245,247,250,.96)', '#2962ff', 'rgba(41,98,255,.15)', '#333'] };
  const dockCfg = () => { const D = S.wsDock = S.wsDock || {}; for (const [k, v] of Object.entries({ on: true, x: null, y: null, vertical: false, min: false, mode: 'float', size: 100, theme: 'blue', names: true })) if (D[k] === undefined) D[k] = v; return D; };
  function newWorkspace(clean) {
    const id = 'w' + Date.now().toString(36), n = S.workspaces.length + 1;
    S.workspaces.push({ id, name: clean ? `Čistý graf ${n}` : `Plocha ${n}`, layout: clean ? { n: 1, two: 'h', sync: true, panes: [] } : { n: 4, two: 'h', sync: true, panes: [] },
      main: { symbol: S.symbol, tf: S.tf }, ...(clean ? { own: cleanState() } : {}) });
    switchWorkspace(id);
    if (clean) toast('◻ Čistý graf: bez indikátorov, čiar a stratégií – čo tu zapneš, platí len pre túto plochu');
  }
  function paintDock() {
    if (EMBED) return;
    let d = $('#wsDock');
    const D = dockCfg();
    document.body.classList.remove('ws-top', 'ws-side');
    if (!D.on) { if (d) d.remove(); document.body.style.removeProperty('--ws-dock'); return; }
    if (!d) {
      d = document.createElement('div'); d.id = 'wsDock'; d.className = 'no-chart'; document.body.appendChild(d);
      let g = null;
      d.addEventListener('pointerdown', e => { if (!e.target.closest('[data-grip]') || S.wsDock.mode !== 'float') return; const r = d.getBoundingClientRect(); g = { x: e.clientX - r.left, y: e.clientY - r.top }; d.setPointerCapture(e.pointerId); e.preventDefault(); });
      d.addEventListener('pointermove', e => { if (!g) return; S.wsDock.x = e.clientX - g.x; S.wsDock.y = e.clientY - g.y; placeDock(); });
      d.addEventListener('pointerup', () => { if (g) { g = null; save(); } });
      d.addEventListener('click', e => {
        const D = dockCfg(), w = e.target.closest('[data-dws]'); if (w) { if (w.dataset.dws !== S.wsId) switchWorkspace(w.dataset.dws); paintDock(); return; }
        if (e.target.closest('[data-dadd]')) { newWorkspace(false); paintDock(); }
        if (e.target.closest('[data-dclean]')) { newWorkspace(true); paintDock(); }
        if (e.target.closest('[data-dlab]')) window.open('lab', '_blank');
        if (e.target.closest('[data-dcfg]')) dockMenu(e.target.closest('[data-dcfg]'));
        if (e.target.closest('[data-drot]')) { D.vertical = !D.vertical; save(); paintDock(); }
        if (e.target.closest('[data-dmin]')) { D.min = !D.min; save(); paintDock(); }
        if (e.target.closest('[data-dhide]')) { D.on = false; save(); paintDock(); toast('Prepínač plôch skrytý – zapneš ho v ▦ menu'); }
      });
      d.addEventListener('contextmenu', e => { e.preventDefault(); dockMenu(d); });
    }
    workspaces();
    const T = DOCK_THEMES[D.theme] || DOCK_THEMES.blue, docked = D.mode !== 'float';
    [['--wd-bg', 1], ['--wd-acc', 2], ['--wd-on', 3], ['--wd-tx', 4]].forEach(([v, i]) => d.style.setProperty(v, T[i]));
    d.style.zoom = D.size / 100;
    d.className = `no-chart dock-${D.mode}${!docked && D.vertical ? ' vert' : ''}${D.min ? ' mini' : ''}${D.names ? '' : ' nonames'}${D.theme === 'light' ? ' light' : ''}`;
    d.innerHTML = `${docked ? '' : '<span class="ws-grip" data-grip title="Potiahni a presuň · pravý klik = nastavenia">⋮⋮</span>'}${S.workspaces.map((w, i) => `<button data-dws="${w.id}" class="${w.id === S.wsId ? 'on' : ''}" title="${esc(w.name)} · Alt+${i + 1}${w.own ? ' · vlastné nastavenia' : ''}"><b>${i + 1}</b><span>${w.own ? '◻ ' : ''}${esc(w.name)}</span><small>${w.layout.n}▦</small></button>`).join('')}
      <button data-dadd title="Nová plocha">＋</button><button data-dclean title="Čistý graf – nová plocha bez indikátorov, čiar a stratégií (prázdne plátno)">◻</button><button data-dlab title="Nexus Lab – druhý grafový systém (nová karta)">🧪</button>
      <button data-dcfg title="Veľkosť, farby, umiestnenie (karty hore / v bočnom paneli)">⚙</button>${docked ? '' : `<button data-drot title="Otočiť (vodorovne / zvislo)">⤾</button><button data-dmin title="Zbaliť / rozbaliť">${D.min ? '▸' : '–'}</button>`}<button data-dhide title="Skryť prepínač plôch (vrátiš ho v ▦ menu)">✕</button>`;
    placeDock();
  }
  function placeDock() {
    const d = $('#wsDock'), D = S.wsDock; if (!d) return;
    const grid = $('#paneGrid') || $('#chartWrap'), z = (D.size || 100) / 100;
    if (D.mode === 'top' || D.mode === 'side') {
      // docked: the chart area makes room for the tabs (margin), the tabs sit in that room
      document.body.classList.add(D.mode === 'top' ? 'ws-top' : 'ws-side');
      d.style.width = d.style.height = '';
      const r0 = d.getBoundingClientRect();
      document.body.style.setProperty('--ws-dock', Math.ceil(D.mode === 'top' ? r0.height : r0.width) + 'px');
      const r = grid.getBoundingClientRect();
      if (D.mode === 'top') { d.style.left = r.left / z + 'px'; d.style.top = (r.top - r0.height) / z + 'px'; d.style.width = r.width / z + 'px'; }
      else { d.style.left = (r.left - r0.width) / z + 'px'; d.style.top = r.top / z + 'px'; d.style.height = r.height / z + 'px'; }
      return;
    }
    d.style.width = d.style.height = '';
    const w = d.offsetWidth * z, h = d.offsetHeight * z, x = D.x ?? innerWidth / 2 + 60, y = D.y ?? innerHeight - h - 14;
    d.style.left = Math.max(0, Math.min(innerWidth - w, x)) / z + 'px'; d.style.top = Math.max(0, Math.min(innerHeight - h, y)) / z + 'px';
  }
  window.addEventListener('resize', () => placeDock());
  function dockMenu(anchor) {
    const D = dockCfg();
    const html = () => `<div class="sec">Umiestnenie prepínača plôch</div>
      ${[['float', '🪟 Plávajúci (potiahni kamkoľvek)'], ['top', '▭ Karty hore nad grafom'], ['side', '▯ Karty v bočnom paneli vľavo']].map(([k, n]) => `<div class="it ${D.mode === k ? 'on' : ''}" data-dm="${k}"><span class="ic">${D.mode === k ? '✓' : ''}</span><span class="grow">${n}</span></div>`).join('')}
      <div class="sec">Veľkosť</div><div class="it" style="cursor:default"><span class="op" style="width:100%"><input type="range" min="70" max="170" step="5" data-dsz value="${D.size}"><b>${D.size} %</b></span></div>
      <label class="it"><input type="checkbox" data-dnames ${D.names ? 'checked' : ''}><span class="grow">Zobraziť názvy plôch</span></label>
      <div class="sec">Farebná téma</div><div class="dock-themes">${Object.entries(DOCK_THEMES).map(([k, t]) => `<span data-dt="${k}" class="${D.theme === k ? 'on' : ''}" style="background:${t[1]};border-color:${t[2]};color:${t[4]}" title="${t[0]}"><i style="background:${t[2]}"></i>${t[0]}</span>`).join('')}</div>
      <div class="sep"></div><div class="it" data-dnew><span class="ic">＋</span><span class="grow">Nová plocha</span></div><div class="it" data-dnclean><span class="ic">◻</span><span class="grow">Čistý graf (prázdne plátno, vlastné nastavenia)</span></div>
      <div class="it" data-dnlab><span class="ic">🧪</span><span class="grow">Nexus Lab (druhý grafový systém)</span></div>`;
    const bind = m => {
      $$('[data-dm]', m).forEach(x => x.onclick = () => { D.mode = x.dataset.dm; save(); paintDock(); m.innerHTML = html(); bind(m); });
      const sz = $('[data-dsz]', m); sz.oninput = () => { D.size = +sz.value; sz.nextElementSibling.textContent = D.size + ' %'; paintDock(); clearTimeout(sz._t); sz._t = setTimeout(save, 300); };
      $('[data-dnames]', m).onchange = e => { D.names = e.target.checked; save(); paintDock(); };
      $$('[data-dt]', m).forEach(x => x.onclick = () => { D.theme = x.dataset.dt; save(); paintDock(); m.innerHTML = html(); bind(m); });
      $('[data-dnew]', m).onclick = () => { closeMenu(); newWorkspace(false); };
      $('[data-dnclean]', m).onclick = () => { closeMenu(); newWorkspace(true); };
      $('[data-dnlab]', m).onclick = () => { closeMenu(); window.open('lab', '_blank'); };
    };
    openMenu(anchor, html(), bind, { cls: 'dock-menu' });
  }

  // ---- side toolbar: thin by default, own width, see-through, floating over the chart -----------------------------
  function applySide() {
    const P = S.panel, r = document.documentElement.style;
    r.setProperty('--tb-sw', (P.sideW || 30) + 'px');
    r.setProperty('--tb-sbg', rgba(P.bg, P.sideOpacity ?? 100));
    document.body.classList.toggle('tb-float', !!P.sideFloat && ['left', 'right'].includes(S.toolbar));
  }


  // ---- styles: chart backgrounds (seasons) and colour themes ---------------------------------------
  const bgLayer = $('#bgLayer'), bgDim = $('#bgDim');
  const bgId = () => (S.bgImg.auto ? seasonId() : S.bgImg.id);
  function bgUrl() {
    const id = bgId();
    if (id === 'custom') return LS.get('nx-bg-custom', '') || S.bgImg.url || '';
    if (id.startsWith('photo:')) return photoUrl(id.slice(6));
    return id === 'none' ? '' : BG.url(id);
  }
  function hasBg() { return (S.tint && S.tint.on) || !!bgUrl() || (!EMBED && !!S.bgImg.video) || (!EMBED && !['none', 'kenburns', undefined].includes(S.bgImg.anim)); }
  // ---- animated backgrounds: CSS layers (cheap, GPU) or a small canvas at ≤ 30 fps that stops when the tab is hidden ----
  const ANIMS = {
    none: ['Bez animácie', 'linear-gradient(135deg,#161a25,#1e222d)', 'Základné'],
    aurora: ['Polárna žiara', 'linear-gradient(160deg,#04131f,#0b3b3a 45%,#3b1d5c)', 'Príroda'],
    fog: ['Hmla nad grafom', 'linear-gradient(180deg,#1b2433,#3a4658 55%,#1b2433)', 'Príroda'],
    waves: ['Oceán', 'linear-gradient(180deg,#06121f,#0b3556 60%,#0e4f78)', 'Príroda'],
    snow: ['Sneženie', 'linear-gradient(180deg,#0f1724,#233148)', 'Počasie'],
    rain: ['Dážď', 'linear-gradient(180deg,#0b0f17,#1c2533)', 'Počasie'],
    storm: ['Búrka s bleskami', 'linear-gradient(180deg,#07090e,#1a1f2b)', 'Počasie'],
    money: ['Tlač peňazí', 'linear-gradient(180deg,#0b1a12,#14402a)', 'Efekty'],
    fire: ['Oheň', 'linear-gradient(0deg,#3a0d02,#120604 70%)', 'Efekty'],
    spotlights: ['Reflektory (slávnostné)', 'linear-gradient(180deg,#0a0716,#1c1236)', 'Efekty'],
    fireworks: ['Ohňostroj', 'linear-gradient(180deg,#05060d,#141a33)', 'Efekty'],
    neon: ['Neónové farby', 'linear-gradient(135deg,#ff2bd6,#2962ff,#00e5ff)', 'Efekty'],
    bokeh: ['Bokeh svetlá', 'radial-gradient(circle at 30% 40%,#ffb30055,transparent 40%),radial-gradient(circle at 70% 60%,#00e5ff44,#0b0f17 60%)', 'Efekty'],
    matrix: ['Digitálny dážď čísel', 'linear-gradient(180deg,#020a04,#04150a)', 'Efekty'],
    nebula: ['Hmlovina', 'radial-gradient(circle at 30% 40%,#5b2a86,transparent 60%),radial-gradient(circle at 70% 60%,#1f5f9e,#03040a 70%)', 'Vesmír'],
    kenburns: ['Pomalý pohyb fotky', 'linear-gradient(135deg,#2b3a2f,#5c4a32)', 'Základné'],
  };
  const CSS_ANIMS = { aurora: 3, nebula: 3, fog: 3, waves: 3, spotlights: 4, neon: 2 };
  // canvas effects: init(w, h) → state, step(g, w, h, state, speed)
  const rnd = (a, b) => a + Math.random() * (b - a);
  const FX = {
    snow: { init: (w, h) => Array.from({ length: 110 }, () => ({ x: rnd(0, w), y: rnd(0, h), v: rnd(0.4, 1.4), r: rnd(1, 3.2), ph: rnd(0, 6.3) })),
      step: (g, w, h, P, sp) => { g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); for (const p of P) { p.ph += 0.02; p.x += Math.sin(p.ph) * 0.4; p.y += p.v * sp; if (p.y > h + 5) { p.y = -5; p.x = rnd(0, w); } g.moveTo(p.x + p.r, p.y); g.arc(p.x, p.y, p.r, 0, 6.28); } g.fill(); } },
    rain: { init: (w, h) => Array.from({ length: 150 }, () => ({ x: rnd(0, w), y: rnd(0, h), v: rnd(7, 13), l: rnd(10, 22) })),
      step: (g, w, h, P, sp, st) => {
        if (st && st.storm) { if (st.flash > 0) { g.fillStyle = `rgba(200,210,255,${st.flash * 0.25})`; g.fillRect(0, 0, w, h); st.flash -= 0.08; } else if (Math.random() < 0.004) st.flash = 1; }
        g.strokeStyle = 'rgba(180,200,230,.35)'; g.lineWidth = 1; g.beginPath();
        for (const p of P) { p.y += p.v * sp; p.x -= p.v * sp * 0.15; if (p.y > h + 20) { p.y = -20; p.x = rnd(0, w + 40); } g.moveTo(p.x, p.y); g.lineTo(p.x + p.l * 0.15, p.y - p.l); }
        g.stroke(); } },
    // banknotes come out of a press at the top and float down, turning
    money: { init: (w, h) => Array.from({ length: 34 }, () => ({ x: rnd(0, w), y: rnd(-h, h), v: rnd(0.6, 1.6), a: rnd(0, 6.3), va: rnd(-0.02, 0.02), s: rnd(0.7, 1.25), fl: rnd(0, 6.3) })),
      step: (g, w, h, P, sp) => {
        const press = 26;
        const grd = g.createLinearGradient(0, 0, 0, press); grd.addColorStop(0, '#2a2f38'); grd.addColorStop(1, '#14171d');
        g.fillStyle = grd; g.fillRect(0, 0, w, press); g.fillStyle = 'rgba(255,255,255,.08)'; for (let x = (Date.now() / 20) % 40; x < w; x += 40) g.fillRect(x, 6, 20, 3);
        for (const p of P) {
          p.y += p.v * sp; p.a += p.va * sp; p.fl += 0.05 * sp; p.x += Math.sin(p.fl) * 0.5;
          if (p.y > h + 40) { p.y = press - 10; p.x = rnd(0, w); }
          const bw = 64 * p.s, bh = 30 * p.s, sq = Math.abs(Math.cos(p.fl));
          g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.scale(1, 0.35 + 0.65 * sq);
          g.fillStyle = '#2e7d4f'; g.fillRect(-bw / 2, -bh / 2, bw, bh); g.strokeStyle = '#a5d6a7'; g.lineWidth = 1.2; g.strokeRect(-bw / 2 + 3, -bh / 2 + 3, bw - 6, bh - 6);
          g.fillStyle = '#c8e6c9'; g.beginPath(); g.ellipse(0, 0, bh * 0.32, bh * 0.32, 0, 0, 6.28); g.fill();
          g.fillStyle = '#1b5e20'; g.font = `700 ${Math.round(12 * p.s)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 0, 1);
          g.fillStyle = '#c8e6c9'; g.font = `600 ${Math.round(7 * p.s)}px system-ui`; g.fillText('100', -bw / 2 + 10, -bh / 2 + 8); g.fillText('100', bw / 2 - 10, bh / 2 - 7);
          g.restore();
        }
      } },
    // flames from the bottom edge: additive glowing particles
    fire: { init: () => [],
      step: (g, w, h, P, sp) => {
        for (let i = 0; i < 9 * sp; i++) P.push({ x: rnd(0, w), y: h + 10, vx: rnd(-0.4, 0.4), vy: rnd(-2.6, -1.2), r: rnd(18, 46), life: 1 });
        g.globalCompositeOperation = 'lighter';
        for (const p of P) {
          p.x += p.vx * sp + Math.sin(p.y / 30) * 0.3; p.y += p.vy * sp; p.life -= 0.012 * sp; p.r *= 0.992;
          const k = Math.max(0, p.life), gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
          gr.addColorStop(0, `rgba(255,${Math.round(200 * k)},${Math.round(60 * k)},${0.35 * k})`); gr.addColorStop(1, 'rgba(255,60,0,0)');
          g.fillStyle = gr; g.fillRect(p.x - p.r, p.y - p.r, 2 * p.r, 2 * p.r);
        }
        g.globalCompositeOperation = 'source-over';
        for (let i = P.length - 1; i >= 0; i--) if (P[i].life <= 0) P.splice(i, 1);
        if (P.length > 600) P.splice(0, P.length - 600);
      } },
    // rockets rise, burst into coloured sparks that fall and fade
    fireworks: { init: () => ({ r: [], s: [] }),
      step: (g, w, h, F, sp) => {
        if (Math.random() < 0.035 * sp) F.r.push({ x: rnd(w * 0.15, w * 0.85), y: h, vy: rnd(-8.5, -6.5), t: rnd(h * 0.15, h * 0.45), hue: Math.round(rnd(0, 360)) });
        g.globalCompositeOperation = 'lighter';
        for (const r of F.r) { r.y += r.vy * sp; g.fillStyle = `hsl(${r.hue},100%,75%)`; g.fillRect(r.x - 1, r.y, 2, 6); }
        for (let i = F.r.length - 1; i >= 0; i--) { const r = F.r[i]; if (r.y <= r.t) { const n = 70; for (let k = 0; k < n; k++) { const a = (k / n) * 6.28, v = rnd(1.5, 4.2); F.s.push({ x: r.x, y: r.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, hue: r.hue + rnd(-20, 20) }); } F.r.splice(i, 1); } }
        for (const s of F.s) { s.x += s.vx * sp; s.y += s.vy * sp; s.vy += 0.05 * sp; s.vx *= 0.985; s.life -= 0.012 * sp; g.fillStyle = `hsla(${s.hue},100%,65%,${Math.max(0, s.life)})`; g.beginPath(); g.arc(s.x, s.y, 1.8, 0, 6.28); g.fill(); }
        g.globalCompositeOperation = 'source-over';
        F.s = F.s.filter(s => s.life > 0);
      } },
    bokeh: { init: (w, h) => Array.from({ length: 26 }, () => ({ x: rnd(0, w), y: rnd(0, h), r: rnd(20, 70), vx: rnd(-0.25, 0.25), vy: rnd(-0.2, 0.2), hue: [40, 190, 280, 330, 210][Math.floor(rnd(0, 5))], ph: rnd(0, 6.3) })),
      step: (g, w, h, P, sp) => {
        g.globalCompositeOperation = 'lighter';
        for (const p of P) {
          p.x += p.vx * sp; p.y += p.vy * sp; p.ph += 0.01 * sp;
          if (p.x < -80) p.x = w + 80; if (p.x > w + 80) p.x = -80; if (p.y < -80) p.y = h + 80; if (p.y > h + 80) p.y = -80;
          const a = 0.1 + 0.07 * Math.sin(p.ph), gr = g.createRadialGradient(p.x, p.y, p.r * 0.2, p.x, p.y, p.r);
          gr.addColorStop(0, `hsla(${p.hue},90%,65%,${a})`); gr.addColorStop(0.8, `hsla(${p.hue},90%,60%,${a * 0.7})`); gr.addColorStop(1, `hsla(${p.hue},90%,60%,0)`);
          g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.28); g.fill();
        }
        g.globalCompositeOperation = 'source-over';
      } },
    // columns of prices / digits falling like a terminal
    matrix: { init: (w, h) => Array.from({ length: Math.ceil(w / 18) }, (_, i) => ({ x: i * 18 + 6, y: rnd(-h, 0), v: rnd(2, 5) })),
      step: (g, w, h, P, sp, st) => {
        if (P.length < Math.ceil(w / 18)) for (let i = P.length; i < Math.ceil(w / 18); i++) P.push({ x: i * 18 + 6, y: rnd(-h, 0), v: rnd(2, 5) });
        g.font = '600 14px Consolas, monospace'; g.textAlign = 'center';
        for (const p of P) {
          p.y += p.v * sp * 3; if (p.y > h + 200) { p.y = rnd(-200, 0); p.v = rnd(2, 5); }
          for (let k = 0; k < 12; k++) { const y = p.y - k * 17; if (y < -20 || y > h + 20) continue; g.fillStyle = k ? `rgba(0,230,118,${0.55 - k * 0.045})` : 'rgba(200,255,220,.95)'; g.fillText('0123456789$.+−▲▼'[(Math.floor(p.y / 17) + k * 7 + Math.round(p.x)) % 17], p.x, y); }
        }
      } },
  };
  let animRaf = null;
  function applyAnim() {
    const B = S.bgImg, kind = EMBED ? 'none' : B.anim || 'none';
    let el = $('#bgAnim');
    if (!el) { el = document.createElement('div'); el.id = 'bgAnim'; $('#bgDim').after(el); }
    cancelAnimationFrame(animRaf); animRaf = null;
    el.className = 'anim-' + kind; el.innerHTML = '';
    el.style.setProperty('--as', 100 / (B.animSpeed || 100)); el.style.opacity = (B.animOpacity ?? 70) / 100;
    $('#bgLayer').classList.toggle('kenburns', kind === 'kenburns');
    if (CSS_ANIMS[kind]) el.innerHTML = '<i></i>'.repeat(CSS_ANIMS[kind]);
    const fx = FX[kind === 'storm' ? 'rain' : kind];
    if (!fx) return;
    const c = document.createElement('canvas'), g = c.getContext('2d');
    el.appendChild(c);
    let state = null, st = { storm: kind === 'storm', flash: 0 }, last = 0;
    const size = () => { c.width = el.clientWidth; c.height = el.clientHeight; state = fx.init(c.width, c.height); };
    size();
    const step = t => {
      animRaf = requestAnimationFrame(step);
      if (document.hidden || t - last < 33) return;                  // ≤ 30 fps
      last = t;
      if (c.width !== el.clientWidth || c.height !== el.clientHeight) size();
      g.clearRect(0, 0, c.width, c.height);
      fx.step(g, c.width, c.height, state, (B.animSpeed || 100) / 100, st);
    };
    animRaf = requestAnimationFrame(step);
  }

  // ---- video backgrounds (short loops from Wikimedia Commons, credited in the window) --------------------
  let VIDEOS = [];
  function applyVideo() {
    const B = S.bgImg, v = !EMBED && B.video ? VIDEOS.find(x => x.id === B.video) : null;
    let el = $('#bgVideo');
    if (!v) { if (el) { el.pause(); el.remove(); } return; }
    if (!el) { el = document.createElement('video'); el.id = 'bgVideo'; el.muted = true; el.loop = true; el.playsInline = true; el.autoplay = true; $('#bgLayer').after(el); }
    if (!el.src.endsWith(v.file)) { el.poster = v.poster ? 'static/' + v.poster : ''; el.src = 'static/' + v.file; }
    el.playbackRate = (B.videoSpeed || 100) / 100;
    el.style.filter = B.blur ? `blur(${B.blur}px)` : '';
    el.play().catch(() => {});
  }
  document.addEventListener('visibilitychange', () => { const v = $('#bgVideo'); if (v) { if (document.hidden) v.pause(); else v.play().catch(() => {}); } });

  function applyBright() { const b = S.look.bright || 100; document.documentElement.style.filter = b !== 100 ? `brightness(${b / 100})` : ''; }
  function applyBg() {
    const url = bgUrl(), B = S.bgImg;
    bgLayer.style.backgroundImage = url ? `url("${url.replace(/"/g, '%22')}")` : 'none';
    bgLayer.style.filter = B.blur ? `blur(${B.blur}px)` : '';
    bgLayer.style.inset = B.blur ? `-${B.blur * 2}px` : '0';
    applyVideo();
    bgDim.style.background = url || (B.video && !EMBED) ? rgba(S.look.bg, B.dim) : 'transparent';
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

  // ---- toolbar look: size, font, colours -----------------------------------------------------------
  function applyPanel() {
    const P = S.panel, r = document.documentElement.style;
    r.setProperty('--tb-w', P.w + 'px'); r.setProperty('--tb-h', P.h + 'px'); r.setProperty('--tb-fs', P.fs + 'px'); r.setProperty('--tb-font', fontCss(P.font));
    r.setProperty('--tb-bg', rgba(P.bg, P.opacity)); r.setProperty('--tb-text', P.text); r.setProperty('--accent', P.accent);
    applySide();
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
      if (stTab === 'video') {
        const cur = VIDEOS.find(v => v.id === B.video), cats = [...new Set(VIDEOS.map(v => v.cat))];
        return `<div class="tiles"><div class="tile ${B.video ? '' : 'on'}" data-vid=""><div class="thumb" style="background:${S.look.bg}"></div><span>Bez videa</span></div></div>
          ${cats.map(c => `<div class="tgroup">${esc(c)}</div><div class="tiles">${VIDEOS.filter(v => v.cat === c).map(v => `<div class="tile ${B.video === v.id ? 'on' : ''}" data-vid="${v.id}" title="${esc(v.name)} · ${esc(v.author)} (${esc(v.license)})"><div class="thumb vthumb" style="background-image:url('static/${v.poster}')"><b>▶</b></div><span>${esc(v.name)}</span></div>`).join('')}</div>`).join('')}
          ${cur ? `<div class="muted credit">🎬 ${esc(cur.name)} · ${esc(cur.author)} · <a href="${esc(cur.licenseUrl || cur.source)}" target="_blank" rel="noopener">${esc(cur.license)}</a> · <a href="${esc(cur.source)}" target="_blank" rel="noopener">Wikimedia Commons</a></div>` : ''}
          <div class="fld"><span>Rýchlosť prehrávania</span><span class="op" style="width:240px"><input type="range" min="25" max="200" data-vs value="${B.videoSpeed || 100}"><b>${B.videoSpeed || 100} %</b></span></div>
          ${common()}<div class="muted" style="font-size:11px">Krátke slučky bez zvuku (480p, 1–4 MB). Video sa zastaví, keď okno nie je viditeľné; v malých grafoch sa nespúšťa.</div>`;
      }
      if (stTab === 'anim') return `${[...new Set(Object.values(ANIMS).map(a => a[2]))].map(c => `<div class="tgroup">${esc(c)}</div><div class="tiles">${Object.entries(ANIMS).filter(([, a]) => a[2] === c).map(([k, [n, bg]]) => `<div class="tile ${(B.anim || 'none') === k ? 'on' : ''}" data-an="${k}"><div class="thumb an-thumb an-${k}" style="background:${bg}"><i></i></div><span>${esc(n)}</span></div>`).join('')}</div>`).join('')}
          <div class="fld"><span>Rýchlosť</span><span class="op" style="width:240px"><input type="range" min="30" max="250" data-ab="animSpeed" value="${B.animSpeed || 100}"><b>${B.animSpeed || 100} %</b></span></div>
          <div class="fld"><span>Výraznosť</span><span class="op" style="width:240px"><input type="range" min="10" max="100" data-ab="animOpacity" value="${B.animOpacity ?? 70}"><b>${B.animOpacity ?? 70} %</b></span></div>
          <div class="muted" style="font-size:11px">Animácia ide nad pozadím (aj nad fotkou), pod sviečkami. Žiara, hmla, hmlovina, oceán, reflektory a neón sú čisté CSS animácie – takmer nezaťažia počítač.
          Ostatné (sneh, dážď, peniaze, oheň, ohňostroj, bokeh, čísla) kreslia max. 30 snímok za sekundu a zastavia sa, keď je okno skryté. V malých grafoch (rozloženie viac grafov) sa animácia nespúšťa.</div>`;
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
        <div class="tabs">${[['photos', '📷 Fotky'], ['drawn', '🏔 Kreslené'], ['anim', '✨ Animované'], ['video', '🎬 Videá'], ['candles', '🕯 Farby sviečok'], ['themes', '🎨 Témy']].map(([k, n]) => `<span class="tab ${stTab === k ? 'on' : ''}" data-tab="${k}">${n}</span>`).join('')}</div>
        ${body()}</div><div class="dlg-f"><button class="btn" data-allc title="Pozadie, farby a sviečky aj vo všetkých ostatných grafoch a plochách">🔁 Na všetky grafy</button><span class="grow"></span><button class="btn pri" data-x>Hotovo</button></div>`, null, 'wide styles-dlg');
      $$('[data-tab]', d).forEach(x => x.onclick = () => { stTab = x.dataset.tab; paint(); });
      $$('[data-vid]', d).forEach(x => x.onclick = () => { B.video = x.dataset.vid; save(); applyBg(); buildChart(); paint(); });
      const vs = $('[data-vs]', d); if (vs) vs.oninput = () => { B.videoSpeed = +vs.value; vs.nextElementSibling.textContent = vs.value + ' %'; save(); applyVideo(); };
      $$('[data-an]', d).forEach(x => x.onclick = () => { B.anim = x.dataset.an; save(); applyAnim(); buildChart(); paint(); });
      $$('[data-ab]', d).forEach(x => x.oninput = () => { B[x.dataset.ab] = +x.value; x.nextElementSibling.textContent = x.value + ' %'; save(); applyAnim(); });
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
  // move an indicator panel one place up or down; past the price chart it switches between "above" and "below"
  function movePanel(s, dir) {
    const vis = units.filter(u => u.pane !== mainIdx), k = vis.findIndex(u => u.s === s); if (k < 0) return;
    const j = vis.findIndex(u => u.pane === vis[k].pane + dir);
    if (j < 0) {                                // crossing the price chart: it becomes the panel right next to it
      const cross = dir < 0 ? !s.above && vis[k].pane === mainIdx + 1 : s.above && vis[k].pane === mainIdx - 1; if (!cross) return;
      s.above = dir < 0; studies = studies.filter(x => x !== s); if (s.above) studies.push(s); else studies.unshift(s);
    } else { const o = vis[j].s, a = studies.indexOf(s), b = studies.indexOf(o); studies[a] = o; studies[b] = s; }
    studiesChanged();
  }
  function studyMenu(ev, s) {
    const def = KS.STUDIES[s.type];
    ctxMenu(ev, `<div class="sec">${esc(def.label(s))}</div>${item('cfg', '⚙', 'Nastavenia… (farby, dĺžka, štýl)')}${item('hide', '👁', 'Skryť')}${item('dup', '⧉', 'Duplikovať')}
      ${def.pane === true ? `<div class="sep"></div>${item('above', s.above ? '⬇' : '⬆', s.above ? 'Panel pod graf' : 'Panel nad graf')}${item('pup', '↑', 'Posunúť panel vyššie')}${item('pdn', '↓', 'Posunúť panel nižšie')}<div class="sep"></div>` : ''}
      ${def.pane === true || s.type === 'volume' ? item('fl', '🪟', isFloat(s) ? 'Späť do panela (nie okno)' : 'Do plávajúceho okna') : ''}${def.pane === true ? item('ov', '◩', s.overlay ? 'Vlastný panel (neprekrývať graf)' : 'Prekryť graf priehľadne') : ''}${item('sall', '🔁', 'Tieto nastavenia na všetky grafy')}${item('def', '⭐', 'Uložiť ako predvolené')}${item('del', '🗑', 'Odstrániť')}<div class="sep"></div>${item('add', 'ƒx', 'Pridať ďalší indikátor…')}`, m => bindItems(m, {
      cfg: () => studySettings(s), hide: () => { s.visible = false; studiesChanged(); },
      dup: () => { studies.push(KS.normalize({ ...JSON.parse(JSON.stringify(s)), uid: undefined })); studiesChanged(); },
      def: () => { S.toolDefaults['study:' + s.type] = { inputs: s.inputs, plots: s.plots, tfs: s.tfs, out: s.out }; save(); toast('Uložené ako predvolené'); },
      del: () => { studies = studies.filter(x => x !== s); studiesChanged(); }, add: () => $('#bInd').click(),
      ov: () => { s.overlay = !s.overlay; studiesChanged(); }, sall: () => applyStudyAll(s), fl: () => { s.float = !isFloat(s); studiesChanged(); },
      above: () => { s.above = !s.above; studiesChanged(); }, pup: () => movePanel(s, -1), pdn: () => movePanel(s, 1),
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
      ${item('reset', '⤢', 'Resetovať zobrazenie')}${item('panel', '☰', S.toolbar === 'hidden' ? 'Zobraziť panel' : 'Skryť panel', 'Alt+P')}
      ${item('vscale', '↕', S.look.hideScale ? 'Zobraziť cenovú os' : 'Skryť cenovú os')}${item('vtime', '↔', S.look.hideTime ? 'Zobraziť čas a dátum' : 'Skryť čas a dátum')}${item('vleg', '🏷', S.look.hideLegend ? 'Zobraziť legendu' : 'Skryť legendu')}
      ${item('tmarks', S.tradeMarks ? '✓' : '◆', S.tradeMarks ? 'Skryť značky obchodov (BUY / SELL / ✕)' : 'Zobraziť značky obchodov (BUY / SELL / ✕)')}`, m => bindItems(m, {
      tmarks: () => { S.tradeMarks = !S.tradeMarks; save(); updateMarkers(); toast(S.tradeMarks ? 'Značky obchodov zobrazené' : 'Značky obchodov skryté'); },
      vscale: () => setView({ scale: !!S.look.hideScale }), vtime: () => setView({ time: !!S.look.hideTime }), vleg: () => setView({ legend: !!S.look.hideLegend }),
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
    const r = el.getBoundingClientRect(), x = e.clientX - r.left; let y = e.clientY - r.top;
    const W = chart.paneSize(mainIdx).width, pane = paneAt(y);
    if (!pane) return timeMenu(e);
    if (x > W) return scaleMenu(e);
    if (pane.i === mainIdx) {
      y -= pane.top;
      const h = draw.hitAt(x, y);
      if (h && !h.d.temp) return ctxMenu(e, `<div class="sec">${esc(DR.TOOLS[h.d.type].name)}</div>${item('cfg', '⚙', 'Nastavenia… (farba, štýl, text)')}${item('lock', '🔒', h.d.locked ? 'Odomknúť' : 'Zamknúť')}${item('del', '🗑', 'Zmazať')}`,
        m => bindItems(m, { cfg: () => draw.openSettings(h.d), lock: () => { h.d.locked = !h.d.locked; S.drawings[S.symbol] = draw.list().filter(d => !d.temp); save(); }, del: () => draw.remove(h.d) }));
      const u = unitAt(mainIdx, x, y);
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
  // news live in the chat window as a second tab (one window for chat and news)
  const socBoard = document.createElement('div'); socBoard.id = 'socBoard';
  chatEl.append($('#newsTabs'), $('#newsBody'), socBoard);
  function setCommTab(t) {
    S.chat.tab = t; save();
    chatEl.classList.toggle('news-tab', t === 'news'); chatEl.classList.toggle('board-tab', t === 'board');
    if (t === 'board') NEXUS.renderBoard(socBoard);
    $$('#chatHead [data-cw]').forEach(x => x.classList.toggle('on', x.dataset.cw === t));
    if (t === 'news') renderNews();
  }
  $$('#chatHead [data-cw]').forEach(x => x.onclick = () => setCommTab(x.dataset.cw));
  setCommTab(S.chat.tab || 'chat');
  function toggleNews(open) {
    S.news.open = false;
    if (open === false) { if (S.chat.tab === 'news') toggleChat(false); return; }
    if (!S.chat.open) toggleChat(true);
    setCommTab('news');
  }
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
    onTech: () => openTech(),
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
    if (e.key === 'Escape' && pickReq) { pickReq.done(null); return; }
    if (e.key === 'Escape') { if ($('#pop').classList.contains('open')) { closePop(); return; } if (dialogOpen()) { cancelDialog(); return; } if ($('.dd')) { closeMenu(); return; } if (techEl.classList.contains('open')) { closeTech(); return; } closeMenu(); if (replayPick) { stopPick(); return; } }
    if (dialogOpen()) return;
    if ((e.ctrlKey || e.metaKey) && !typing && !e.altKey && (e.code === 'KeyZ' || e.code === 'KeyY')) { e.preventDefault(); stepHist(e.code === 'KeyY' || e.shiftKey ? 1 : -1); return; }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !EMBED && e.code === 'KeyS') { e.preventDefault(); NEXUS.openApp('saves'); setTimeout(() => { const i = $('#svName'); if (i) i.focus(); }, 50); return; }
    if (e.ctrlKey && e.key === 'Enter' && S.idea.open && current) { e.preventDefault(); if (e.shiftKey) openAlert(qi + 1); else saveLabel(); return; }
    if (e.altKey && !typing && e.code === 'KeyR' && !e.shiftKey) { e.preventDefault(); if (view.replay) exitReplay(); else startReplay(true); return; }
    if (e.altKey && !typing && e.code === 'KeyF' && !e.shiftKey) { e.preventDefault(); setFollow(!S.addons.follow); return; }
    if (e.altKey && !typing && e.code === 'KeyH' && !e.shiftKey && !EMBED) { e.preventDefault(); $('#bHideInd').click(); return; }
    if (e.altKey && !typing && e.code === 'KeyT' && !e.shiftKey && !EMBED) { e.preventDefault(); toolsMenu($('#bTools').style.display === 'none' ? $('#bAll') : $('#bTools')); return; }
    if (e.altKey && !typing && e.code === 'KeyA' && !e.shiftKey) { e.preventDefault(); toggleAuto(); return; }
    if (view.replay && !typing && !e.altKey && !e.ctrlKey) {
      if (e.key === 'ArrowRight') { e.preventDefault(); playReplay(false); stepReplay(e.shiftKey ? 10 : 1); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); playReplay(false); stepReplay(e.shiftKey ? -10 : -1); return; }
      if (e.key === ' ') { e.preventDefault(); playReplay(!replayTimer); return; }
    }
    if (e.altKey && !EMBED && /^Digit[1-9]$/.test(e.code)) { const w = (S.workspaces || [])[+e.code.slice(5) - 1]; if (w) { e.preventDefault(); if (w.id !== S.wsId) switchWorkspace(w.id); return; } }
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
    try { VIDEOS = await (await fetch('static/videos/videos.json')).json(); } catch (e) { VIDEOS = []; }
    if (!SYM[S.symbol]) S.symbol = 'XAUUSD';
    if (S.labeler) await pullPrefs(S.labeler);
    applyPanel(); applyBg(); applyBright(); applyToolbar(); applyView(); applyAnim();
    applyLayout(); paintDock(); applyHiddenButtons(); paintHideBtn(); scheduleAlerts();
    { let lg = S.lang; if (EMBED) try { lg = JSON.parse(localStorage.getItem('nx2')).lang; } catch (e) {} if (lg === 'en') I18N.set('en'); }
    await load();
    if (EMBED) { hist = [snap()]; hpos = 0; paintHist(); return; }
    if (S.idea.open) toggleIdea(true);
    if (S.chat.open) toggleChat(true); else pollChat(true);
    if (S.news.open) toggleNews(true);
    if (S.flow.open) FLOW.open({ id: S.symbol, ...sym() });
    scheduleAlgo(); if ((S.algo || {}).open) toggleAlgo(true);
    $('#bFlow').classList.toggle('on', S.bubbles.on || FLOW.isOpen());
    scheduleScan();
    hist = [snap()]; hpos = 0; paintHist();
    NEXUS.init({
      mirror: owner => setMirror(owner), mirroring: () => mirror && mirror.owner,
      S: () => S, save, toast, fetchBars, symbols: () => META.symbols || [], chatMsgs: () => chatMsgs, kinds: () => KINDS,
      newFolder, folderColors: () => FOLDER_COLORS, saves,
      pickPrice: (text, label) => pickChart(text, { label }).then(p => (p && p.price != null ? p.price : null)),
      notify: (title, body) => notifyOS(title, body),
      signal: async (s, tf) => { const k = s + '|' + tf, c = sigCache[k]; if (c && Date.now() - c.at < (TF_SEC[tf] <= 300 ? 20000 : 60000)) return c.v;
        const bars = await fetchBars(s, tf, null, 600), Dx = toD(bars.slice(0, -1)); await idle(); Dx.s = Dx.t.map(t => (SYM[s] && SYM[s].hours === 'gold' ? sessGold(t) : Math.floor(t / 86400)));
        const v = { ...verdict(Dx, tf), price: bars[bars.length - 1].close }; sigCache[k] = { at: Date.now(), v }; return v; },
      moves: async (s, tf, o = {}) => { const bars = await fetchBars(s, tf, null, 800), Dx = toD(bars.slice(0, -1)); await idle();
        const r = MV.moves(Dx, { tf, tfSec: TF_SEC[tf], digits: (SYM[s] || {}).digits, ...o });
        return { moves: r.moves.slice(-40), starting: r.starting, trend: MV.trend(Dx, r.R), price: bars[bars.length - 1].close }; },
      openChat: filter => { if (filter) S.chat.filter = filter; toggleChat(true); renderChatFilter(); renderChatList(); },
      setName: name => { S.labeler = name; save(); if (S.chat.open) renderChat(); },
      liveIdeas: () => (scanRes || []).map((x, i) => ({ ...x, i })).filter(x => x.kind === 'idea'),
      jumpTo: x => jumpTo(x.symbol, x.tf, x.time, x),
      onRobot: () => {},
      chartSymbol: () => S.symbol,
      livePrice: id => (id === S.symbol && view.mode === 'live' && !view.replay && raw.length ? raw[raw.length - 1].close : NaN),
      onTrades: markers => { refreshTrades(markers); $$('#paneGrid iframe.pane').forEach(f => { try { f.contentWindow.NX_refreshTrades(markers); } catch (e) {} }); },
    });
    if (S.chat.tab === 'board') NEXUS.renderBoard(socBoard);
    if (S.mirrorOf) setMirror(S.mirrorOf);
  })();
})();
