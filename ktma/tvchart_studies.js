// Browser-side indicators for the chart's "ƒx Indikátory" menu.
// Same formulas as ktma/indicators.py (pandas ewm with adjust=False, Wilder smoothing, ddof=0 std),
// so a chart RSI/MACD with the scanner's periods shows exactly what the scanner computed.
// Inputs are arrays where null/NaN means "no value"; outputs use NaN.

const KS = (() => {
  const bad = v => v === null || v === undefined || Number.isNaN(v);

  // pandas .ewm(alpha, adjust=False, min_periods): starts at the first valid value.
  function ewm(x, alpha, minP) {
    const out = new Array(x.length).fill(NaN);
    let m = NaN, n = 0;
    for (let i = 0; i < x.length; i++) {
      const v = x[i];
      if (!bad(v)) { m = n === 0 ? v : alpha * v + (1 - alpha) * m; n++; }
      if (n >= minP) out[i] = m;
    }
    return out;
  }
  const ema = (x, p) => ewm(x, 2 / (p + 1), p);
  const wilder = (x, p) => ewm(x, 1 / p, p);

  function rolling(x, p, fn) {
    const out = new Array(x.length).fill(NaN);
    for (let i = p - 1; i < x.length; i++) {
      const win = x.slice(i - p + 1, i + 1);
      if (win.some(bad)) continue;
      out[i] = fn(win);
    }
    return out;
  }
  const sum = a => a.reduce((s, v) => s + v, 0);
  const sma = (x, p) => rolling(x, p, w => sum(w) / p);
  const wma = (x, p) => rolling(x, p, w => sum(w.map((v, i) => v * (i + 1))) / (p * (p + 1) / 2));
  const stdev = (x, p) => rolling(x, p, w => { const m = sum(w) / p; return Math.sqrt(sum(w.map(v => (v - m) ** 2)) / p); });
  const rmax = (x, p) => rolling(x, p, w => Math.max(...w));
  const rmin = (x, p) => rolling(x, p, w => Math.min(...w));
  const zip = (a, b, fn) => a.map((v, i) => (bad(v) || bad(b[i]) ? NaN : fn(v, b[i])));

  function source(D, name) {
    const { o, h, l, c } = D;
    switch (name) {
      case 'open': return o;
      case 'high': return h;
      case 'low': return l;
      case 'hl2': return h.map((v, i) => (v + l[i]) / 2);
      case 'hlc3': return h.map((v, i) => (v + l[i] + c[i]) / 3);
      case 'ohlc4': return h.map((v, i) => (o[i] + v + l[i] + c[i]) / 4);
      default: return c;
    }
  }

  function rsi(x, p) {
    const d = x.map((v, i) => (i ? v - x[i - 1] : NaN));
    const g = wilder(d.map(v => (bad(v) ? NaN : Math.max(v, 0))), p);
    const ls = wilder(d.map(v => (bad(v) ? NaN : Math.max(-v, 0))), p);
    return g.map((a, i) => {
      const b = ls[i];
      if (bad(a) || bad(b)) return NaN;
      if (a === 0 && b === 0) return 50;
      return 100 - 100 / (1 + a / b);
    });
  }

  function macd(x, fast, slow, signal) {
    const line = zip(ema(x, fast), ema(x, slow), (a, b) => a - b);
    const sig = ewm(line, 2 / (signal + 1), signal);
    return { macd: line, signal: sig, hist: zip(line, sig, (a, b) => a - b) };
  }

  function trueRange(D) {
    const { h, l, c } = D;
    return h.map((v, i) => (i ? Math.max(v - l[i], Math.abs(v - c[i - 1]), Math.abs(l[i] - c[i - 1])) : v - l[i]));
  }
  const atr = (D, p) => wilder(trueRange(D), p);

  function adx(D, p) {
    const { h, l } = D;
    const pdm = h.map((v, i) => { const up = i ? v - h[i - 1] : NaN, dn = i ? l[i - 1] - l[i] : NaN;
      return up > dn && up > 0 ? up : 0; });
    const mdm = h.map((v, i) => { const up = i ? v - h[i - 1] : NaN, dn = i ? l[i - 1] - l[i] : NaN;
      return dn > up && dn > 0 ? dn : 0; });
    const tr = wilder(trueRange(D), p);
    const pdi = zip(wilder(pdm, p), tr, (a, b) => 100 * a / b);
    const mdi = zip(wilder(mdm, p), tr, (a, b) => 100 * a / b);
    const dx = zip(pdi, mdi, (a, b) => 100 * Math.abs(a - b) / (a + b));
    return { adx: wilder(dx, p), pdi, mdi };
  }

  function bollinger(x, p, mult) {
    const mid = sma(x, p), sd = stdev(x, p);
    return { basis: mid, upper: zip(mid, sd, (m, s) => m + mult * s), lower: zip(mid, sd, (m, s) => m - mult * s) };
  }

  // Session-anchored VWAP with volume-weighted σ bands (session id per bar; falls back to the calendar day).
  function vwap(D) {
    const { h, l, c, v, t } = D;
    const sess = D.s || t.map(x => Math.floor(x / 86400));
    const vw = new Array(c.length).fill(NaN), sd = new Array(c.length).fill(NaN);
    let cur = null, cv = 0, cpv = 0, cp2v = 0;
    for (let i = 0; i < c.length; i++) {
      if (sess[i] !== cur) { cur = sess[i]; cv = 0; cpv = 0; cp2v = 0; }
      const tp = (h[i] + l[i] + c[i]) / 3, vol = bad(v[i]) ? 0 : v[i];
      cv += vol; cpv += tp * vol; cp2v += tp * tp * vol;
      if (cv > 0) { vw[i] = cpv / cv; sd[i] = Math.sqrt(Math.max(cp2v / cv - vw[i] ** 2, 0)); }
    }
    return { vwap: vw, sd };
  }

  function stoch(D, k, smooth, d) {
    const hh = rmax(D.h, k), ll = rmin(D.l, k);
    const raw = D.c.map((v, i) => (bad(hh[i]) || hh[i] === ll[i] ? NaN : 100 * (v - ll[i]) / (hh[i] - ll[i])));
    const kk = sma(raw, smooth);
    return { k: kk, d: sma(kk, d) };
  }

  function cci(D, p) {
    const tp = source(D, 'hlc3');
    const ma = sma(tp, p);
    const md = rolling(tp, p, w => { const m = sum(w) / p; return sum(w.map(v => Math.abs(v - m))) / p; });
    return tp.map((v, i) => (bad(ma[i]) || !md[i] ? NaN : (v - ma[i]) / (0.015 * md[i])));
  }

  // ---- registry: what the "ƒx Indikátory" menu offers -------------------------------------------
  // inputs: {k, label, def, min, max, step?, type?: 'source'}
  // plots:  {k, label, color, width?, style?, kind?: 'line' | 'color' (colour only) | 'level'}
  const P = (k, label, color, extra) => ({ k, label, color, width: 1, style: 0, kind: 'line', ...(extra || {}) });
  const SRC = { k: 'source', label: 'Zdroj', type: 'source', def: 'close' };
  const LEVELS = [{ k: 'upper', label: 'Horná úroveň', def: 80, min: 0, max: 100 },
                  { k: 'lower', label: 'Dolná úroveň', def: 20, min: 0, max: 100 }];

  const STUDIES = {
    ema: { name: 'EMA', title: 'Exponenciálny kĺzavý priemer', pane: false,
      inputs: [{ k: 'period', label: 'Perióda', def: 21, min: 1, max: 1000 }, SRC],
      plots: [P('ma', 'EMA', '#f2a900')],
      label: s => `EMA ${s.inputs.period}`,
      calc: (D, s) => ({ ma: ema(source(D, s.inputs.source), s.inputs.period) }) },
    sma: { name: 'SMA', title: 'Jednoduchý kĺzavý priemer', pane: false,
      inputs: [{ k: 'period', label: 'Perióda', def: 50, min: 1, max: 1000 }, SRC],
      plots: [P('ma', 'SMA', '#ff9800')],
      label: s => `SMA ${s.inputs.period}`,
      calc: (D, s) => ({ ma: sma(source(D, s.inputs.source), s.inputs.period) }) },
    wma: { name: 'WMA', title: 'Vážený kĺzavý priemer', pane: false,
      inputs: [{ k: 'period', label: 'Perióda', def: 20, min: 1, max: 1000 }, SRC],
      plots: [P('ma', 'WMA', '#00bcd4')],
      label: s => `WMA ${s.inputs.period}`,
      calc: (D, s) => ({ ma: wma(source(D, s.inputs.source), s.inputs.period) }) },
    bb: { name: 'Bollinger', title: 'Bollingerove pásma', pane: false,
      inputs: [{ k: 'period', label: 'Perióda', def: 20, min: 2, max: 500 },
               { k: 'mult', label: 'Násobok σ', def: 2, min: 0.1, max: 10, step: 0.1 }, SRC],
      plots: [P('basis', 'Stred', '#ff6d00'), P('upper', 'Horné', '#2962ff'), P('lower', 'Dolné', '#2962ff')],
      label: s => `BB ${s.inputs.period} ${s.inputs.mult}`,
      calc: (D, s) => bollinger(source(D, s.inputs.source), s.inputs.period, s.inputs.mult) },
    vwap: { name: 'VWAP', title: 'VWAP seansy s pásmami σ', pane: false,
      inputs: [{ k: 'b1', label: 'Pásmo 1 (σ, 0 = vyp.)', def: 1, min: 0, max: 5, step: 0.5 },
               { k: 'b2', label: 'Pásmo 2 (σ, 0 = vyp.)', def: 2, min: 0, max: 5, step: 0.5 }],
      plots: [P('vwap', 'VWAP', '#4db6ac', { width: 2 }), P('u1', '+pásmo 1', '#4db6ac', { style: 2 }),
              P('l1', '−pásmo 1', '#4db6ac', { style: 2 }), P('u2', '+pásmo 2', '#80cbc4', { style: 2 }),
              P('l2', '−pásmo 2', '#80cbc4', { style: 2 })],
      label: () => 'VWAP',
      calc: (D, s) => {
        const r = vwap(D), b = (k, sign) => (k > 0 ? zip(r.vwap, r.sd, (m, x) => m + sign * k * x) : r.vwap.map(() => NaN));
        return { vwap: r.vwap, u1: b(s.inputs.b1, 1), l1: b(s.inputs.b1, -1), u2: b(s.inputs.b2, 1), l2: b(s.inputs.b2, -1) };
      } },
    donchian: { name: 'Donchian', title: 'Donchianov kanál', pane: false,
      inputs: [{ k: 'period', label: 'Perióda', def: 20, min: 2, max: 500 }],
      plots: [P('upper', 'Horné', '#2962ff'), P('basis', 'Stred', '#ff6d00', { style: 2 }), P('lower', 'Dolné', '#2962ff')],
      label: s => `DC ${s.inputs.period}`,
      calc: (D, s) => { const u = rmax(D.h, s.inputs.period), lo = rmin(D.l, s.inputs.period);
        return { upper: u, lower: lo, basis: zip(u, lo, (a, b) => (a + b) / 2) }; } },
    volume: { name: 'Objem', title: 'Objem (v spodnej časti grafu)', pane: 'volume',
      inputs: [{ k: 'ma', label: 'Priemer objemu (0 = vyp.)', def: 0, min: 0, max: 500 }],
      plots: [P('up', 'Rastúca sviečka', '#26a69a', { kind: 'color' }), P('down', 'Klesajúca sviečka', '#ef5350', { kind: 'color' }),
              P('vma', 'Priemer', '#ff9800')],
      label: () => 'Objem',
      calc: (D, s) => ({ vol: D.v, vma: s.inputs.ma > 0 ? sma(D.v, s.inputs.ma) : D.v.map(() => NaN) }) },
    rsi: { name: 'RSI', title: 'Index relatívnej sily', pane: true,
      inputs: [{ k: 'period', label: 'Perióda', def: 14, min: 1, max: 500 }, SRC, ...LEVELS],
      plots: [P('rsi', 'RSI', '#b39ddb'), P('levels', 'Úrovne', '#5d606b', { kind: 'level', style: 2 })],
      label: s => `RSI ${s.inputs.period}`,
      calc: (D, s) => ({ rsi: rsi(source(D, s.inputs.source), s.inputs.period) }) },
    macd: { name: 'MACD', title: 'MACD', pane: true,
      inputs: [{ k: 'fast', label: 'Rýchla', def: 12, min: 1, max: 500 }, { k: 'slow', label: 'Pomalá', def: 26, min: 1, max: 500 },
               { k: 'signal', label: 'Signál', def: 9, min: 1, max: 500 }, SRC],
      plots: [P('macd', 'MACD', '#2962ff'), P('signal', 'Signál', '#ff6d00'),
              P('hup', 'Histogram +', '#26a69a', { kind: 'color' }), P('hdown', 'Histogram −', '#ef5350', { kind: 'color' })],
      label: s => `MACD ${s.inputs.fast} ${s.inputs.slow} ${s.inputs.signal}`,
      calc: (D, s) => macd(source(D, s.inputs.source), s.inputs.fast, s.inputs.slow, s.inputs.signal) },
    stoch: { name: 'Stochastic', title: 'Stochastický oscilátor', pane: true,
      inputs: [{ k: 'k', label: '%K perióda', def: 14, min: 1, max: 500 }, { k: 'smooth', label: '%K vyhladenie', def: 3, min: 1, max: 100 },
               { k: 'd', label: '%D perióda', def: 3, min: 1, max: 100 }, ...LEVELS],
      plots: [P('k', '%K', '#2962ff'), P('d', '%D', '#ff6d00'), P('levels', 'Úrovne', '#5d606b', { kind: 'level', style: 2 })],
      label: s => `Stoch ${s.inputs.k} ${s.inputs.smooth} ${s.inputs.d}`,
      calc: (D, s) => stoch(D, s.inputs.k, s.inputs.smooth, s.inputs.d) },
    cci: { name: 'CCI', title: 'Commodity Channel Index', pane: true,
      inputs: [{ k: 'period', label: 'Perióda', def: 20, min: 2, max: 500 },
               { k: 'upper', label: 'Horná úroveň', def: 100, min: -500, max: 500 },
               { k: 'lower', label: 'Dolná úroveň', def: -100, min: -500, max: 500 }],
      plots: [P('cci', 'CCI', '#26c6da'), P('levels', 'Úrovne', '#5d606b', { kind: 'level', style: 2 })],
      label: s => `CCI ${s.inputs.period}`,
      calc: (D, s) => ({ cci: cci(D, s.inputs.period) }) },
    atr: { name: 'ATR', title: 'Priemerný skutočný rozsah', pane: true,
      inputs: [{ k: 'period', label: 'Perióda', def: 14, min: 1, max: 500 }],
      plots: [P('atr', 'ATR', '#ef5350')],
      label: s => `ATR ${s.inputs.period}`,
      calc: (D, s) => ({ atr: atr(D, s.inputs.period) }) },
    adx: { name: 'ADX / DMI', title: 'Sila trendu (ADX, +DI, −DI)', pane: true,
      inputs: [{ k: 'period', label: 'Perióda', def: 14, min: 1, max: 500 },
               { k: 'level', label: 'Úroveň silného trendu', def: 25, min: 0, max: 100 }],
      plots: [P('adx', 'ADX', '#ff9800', { width: 2 }), P('pdi', '+DI', '#26a69a'), P('mdi', '−DI', '#ef5350'),
              P('levels', 'Úroveň', '#5d606b', { kind: 'level', style: 2 })],
      label: s => `ADX ${s.inputs.period}`,
      calc: (D, s) => adx(D, s.inputs.period) },
  };

  // Complete an instance (saved or default) with everything its type defines.
  let seq = 0;
  function normalize(x) {
    const def = STUDIES[x && x.type];
    if (!def) return null;
    const inputs = {}, plots = {};
    for (const i of def.inputs) {
      const v = x.inputs && x.inputs[i.k];
      inputs[i.k] = i.type === 'source' ? (typeof v === 'string' ? v : i.def) : (Number.isFinite(+v) && v !== '' && v !== null ? +v : i.def);
    }
    for (const p of def.plots) {
      const v = (x.plots && x.plots[p.k]) || {};
      plots[p.k] = { color: v.color || p.color, width: +v.width || p.width, style: Number.isFinite(+v.style) ? +v.style : p.style,
                     visible: v.visible !== false };
    }
    return { uid: x.uid || `s${Date.now().toString(36)}${(seq++).toString(36)}`, type: x.type, visible: x.visible !== false,
             inputs, plots, temp: !!x.temp };
  }

  return { ewm, ema, sma, wma, rsi, macd, atr, adx, bollinger, vwap, stoch, cci, source, STUDIES, normalize };
})();
if (typeof module !== 'undefined') module.exports = KS;
