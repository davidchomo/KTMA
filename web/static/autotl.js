// Automatic trendlines, horizontal S/R levels and trade ideas, computed in the browser.
// A port of ktma/structure.py (ATR ZigZag, no repainting): the state after bar i depends only on
// bars <= i, so the same lines and signals appear live, in replay and in the scanner.
// D = {t, o, h, l, c, v, s} arrays (oldest first), as in studies.js.

const TL = (() => {
  // Same values as config.yaml → structure.
  const CFG = { lookback: 6, touch: 0.25, brk: 0.10, maxSlope: 0.2, maxAge: 600, maxDist: 12, maxLines: 3, cooldown: 5,
                lvMerge: 0.4, lvMin: 2, lvBreak: 0.15, lvTouch: 0.25, lvDist: 15, lvAge: 1500, lvMax: 8 };
  const ZIGZAG = { '1m': 2.5, '5m': 1.5, '15m': 1.5, '1h': 1.5, '4h': 1.5 };
  const zigK = (tf, sec) => ZIGZAG[tf] ?? (sec < 60 ? (ZIGZAG['1m'] ?? 2.5) : 2.0);
  // The scanner's own config.yaml → structure (sent by /api/meta), so the lines are exactly the scanner's.
  function configure(st) {
    if (!st) return;
    const lv = st.levels || {}, map = { pivots_lookback: 'lookback', touch_atr: 'touch', break_atr: 'brk', max_slope_atr: 'maxSlope', max_line_age_bars: 'maxAge',
      max_distance_atr: 'maxDist', max_lines_per_side: 'maxLines', touch_cooldown_bars: 'cooldown' };
    for (const [k, v] of Object.entries(map)) if (st[k] !== undefined) CFG[v] = st[k];
    for (const [k, v] of Object.entries({ merge_atr: 'lvMerge', min_touches: 'lvMin', break_atr: 'lvBreak', touch_atr: 'lvTouch', max_distance_atr: 'lvDist', max_age_bars: 'lvAge', max_levels: 'lvMax' }))
      if (lv[k] !== undefined) CFG[v] = lv[k];
    if (st.zigzag_atr) { for (const k in ZIGZAG) delete ZIGZAG[k]; Object.assign(ZIGZAG, st.zigzag_atr); }
  }

  function zigzag(h, l, atr, k) {
    const n = h.length, pivots = [];
    let s = atr.findIndex(Number.isFinite);
    if (s < 0) return pivots;
    let dir = 0, hi = h[s], hiI = s, lo = l[s], loI = s;
    for (let i = s + 1; i < n; i++) {
      const thr = k * atr[i];
      if (dir >= 0 && h[i] > hi) { hi = h[i]; hiI = i; }
      if (dir <= 0 && l[i] < lo) { lo = l[i]; loI = i; }
      if (dir >= 0 && hiI < i && hi - l[i] >= thr) {
        pivots.push({ kind: 'H', idx: hiI, price: hi, conf: i });
        dir = -1; loI = hiI + 1;
        for (let j = hiI + 1; j <= i; j++) if (l[j] < l[loI]) loI = j;
        lo = l[loI];
      } else if (dir <= 0 && loI < i && h[i] - lo >= thr) {
        pivots.push({ kind: 'L', idx: loI, price: lo, conf: i });
        dir = 1; hiI = loI + 1;
        for (let j = loI + 1; j <= i; j++) if (h[j] > h[hiI]) hiI = j;
        hi = h[hiI];
      }
    }
    return pivots;
  }

  const value = (ln, i) => ln.p1 + ln.slope * (i - ln.i1);
  const score = (touches, len) => touches * 10 + len / 50;
  function end(x, i, reason, active) { x.ended = i; x.endReason = reason; active.splice(active.indexOf(x), 1); }

  function run(D, opt = {}) {
    const C = { ...CFG, ...(opt.cfg || {}) }, { h, l, c } = D, n = c.length;
    const atr = KS.atr(D, 14), k = opt.k || 2;
    const pivots = zigzag(h, l, atr, k), byConf = new Map();
    for (const p of pivots) { if (!byConf.has(p.conf)) byConf.set(p.conf, []); byConf.get(p.conf).push(p); }
    const known = { H: [], L: [] }, active = [], lines = [], events = [], levels = [], allLevels = [];
    const ev = (i, signal, dir, ref, v, a, what) => events.push({ i, signal, dir, ref, value: v, atr: a, what });
    const trend = new Array(n).fill(0);

    for (let i = 0; i < n; i++) {
      const a = atr[i];
      if (!Number.isFinite(a)) continue;
      // 1) existing lines vs this bar: break, touch, expiry
      for (const ln of [...active]) {
        if (ln.created >= i) continue;
        const v = value(ln, i);
        if (ln.kind === 'res' && c[i] > v + C.brk * a) { end(ln, i, 'break', active); ev(i, 'TL_BREAK_UP', 1, ln, v, a, 'line'); }
        else if (ln.kind === 'sup' && c[i] < v - C.brk * a) { end(ln, i, 'break', active); ev(i, 'TL_BREAK_DOWN', -1, ln, v, a, 'line'); }
        else if (i - ln.lastTouch > C.maxAge) end(ln, i, 'expired', active);
        else if (Math.abs(c[i] - v) > C.maxDist * a) end(ln, i, 'far', active);
        else if (i - ln.lastAlert >= C.cooldown) {
          if (ln.kind === 'res' && h[i] >= v - C.touch * a && c[i] <= v) { ln.lastAlert = i; ev(i, 'TL_TOUCH_RESISTANCE', -1, ln, v, a, 'line'); }
          else if (ln.kind === 'sup' && l[i] <= v + C.touch * a && c[i] >= v) { ln.lastAlert = i; ev(i, 'TL_TOUCH_SUPPORT', 1, ln, v, a, 'line'); }
        }
      }
      // 1b) horizontal levels: break (the role flips), bounce, expiry
      if (i > 0) {
        const prev = c[i - 1];
        for (const lv of [...levels]) {
          const L = lv.price;
          if (Math.abs(c[i] - L) > C.lvDist * a) { end(lv, i, 'far', levels); continue; }
          if (i - lv.lastTouch > C.lvAge) { end(lv, i, 'expired', levels); continue; }
          if (lv.created >= i || lv.touches < C.lvMin || i - lv.lastAlert < C.cooldown) continue;
          const brk = C.lvBreak * a, tch = C.lvTouch * a;
          if (prev <= L && c[i] > L + brk) { lv.lastAlert = i; ev(i, 'SR_BREAK_UP', 1, lv, L, a, 'level'); }
          else if (prev >= L && c[i] < L - brk) { lv.lastAlert = i; ev(i, 'SR_BREAK_DOWN', -1, lv, L, a, 'level'); }
          else if (prev > L && l[i] <= L + tch && c[i] > L) { lv.lastAlert = i; ev(i, 'SR_BOUNCE_SUPPORT', 1, lv, L, a, 'level'); }
          else if (prev < L && h[i] >= L - tch && c[i] < L) { lv.lastAlert = i; ev(i, 'SR_BOUNCE_RESISTANCE', -1, lv, L, a, 'level'); }
        }
      }
      // 2) newly confirmed pivots: strengthen lines, create new ones, cluster levels
      for (const p of byConf.get(i) || []) {
        const kind = p.kind === 'H' ? 'res' : 'sup';
        for (const ln of active) {
          if (ln.kind === kind && Math.abs(p.price - value(ln, p.idx)) <= C.touch * a && !ln.touchIdx.includes(p.idx) && p.idx > ln.i2) {
            ln.touches++; ln.touchIdx.push(p.idx); ln.touchConf.push(i); ln.lastTouch = p.idx; ln.score = score(ln.touches, ln.i2 - ln.i1);
          }
        }
        const cand = candidate(p, known[p.kind].slice(-C.lookback), kind, D, atr, i, C);
        if (cand && !active.some(x => x.kind === cand.kind && Math.abs(x.slope - cand.slope) < 0.05 * a && Math.abs(value(x, i) - value(cand, i)) <= C.touch * a)) {
          active.push(cand); lines.push(cand);
          const side = active.filter(x => x.kind === kind).sort((x, y) => x.score - y.score || x.created - y.created);
          for (const weak of side.slice(0, Math.max(0, side.length - C.maxLines))) end(weak, i, 'replaced', active);
        }
        known[p.kind].push(p);
        const near = levels.filter(lv => Math.abs(lv.price - p.price) <= C.lvMerge * a);
        if (near.length) {
          const lv = near.reduce((x, y) => (Math.abs(y.price - p.price) < Math.abs(x.price - p.price) ? y : x));
          if (!lv.touchIdx.includes(p.idx)) {
            lv.touches++; lv.touchIdx.push(p.idx); lv.prices.push(p.price); lv.touchConf.push(i); lv.lastTouch = p.idx;
            lv.price = lv.prices.reduce((s, x) => s + x, 0) / lv.prices.length;
          }
        } else {
          const lv = { price: p.price, touches: 1, created: i, lastTouch: p.idx, touchIdx: [p.idx], prices: [p.price], touchConf: [i], ended: null, lastAlert: -1e9 };
          levels.push(lv); allLevels.push(lv);
          if (levels.length > C.lvMax) end(levels.reduce((x, y) => (Math.abs(y.price - c[i]) / a - 3 * y.touches > Math.abs(x.price - c[i]) / a - 3 * x.touches ? y : x)), i, 'replaced', levels);
        }
      }
      const hs = known.H, ls = known.L;
      if (hs.length >= 2 && ls.length >= 2) {
        const up = hs[hs.length - 1].price > hs[hs.length - 2].price && ls[ls.length - 1].price > ls[ls.length - 2].price;
        const dn = hs[hs.length - 1].price < hs[hs.length - 2].price && ls[ls.length - 1].price < ls[ls.length - 2].price;
        trend[i] = up ? 1 : dn ? -1 : 0;
      }
    }
    return { pivots, lines, levels: allLevels, events, atr, trend, n, value, minLevel: C.lvMin };
  }

  function candidate(p, prior, kind, D, atr, i, C) {
    const { h, l, c } = D, a = atr[i];
    let best = null;
    for (const q of prior) {
      if (q.idx >= p.idx) continue;
      const slope = (p.price - q.price) / (p.idx - q.idx);
      if (Math.abs(slope) > C.maxSlope * a) continue;
      let ok = true, off = kind === 'res' ? Infinity : -Infinity;
      for (let j = q.idx; j <= i; j++) {
        const v = q.price + slope * (j - q.idx), tol = C.brk * (atr[j] || 0);
        if (kind === 'res' ? c[j] > v + tol : c[j] < v - tol) { ok = false; break; }
        off = kind === 'res' ? Math.min(off, l[j] - v) : Math.max(off, h[j] - v);
      }
      if (!ok) continue;
      const touchIdx = prior.filter(r => q.idx <= r.idx && r.idx <= p.idx && Math.abs(r.price - (q.price + slope * (r.idx - q.idx))) <= C.touch * a).map(r => r.idx);
      const touches = Math.max(touchIdx.length, 1) + 1;
      const ln = { kind, i1: q.idx, p1: q.price, i2: p.idx, p2: p.price, slope, touches, created: i, lastTouch: p.idx, offset: off,
                   score: score(touches, p.idx - q.idx), ended: null, endReason: null, lastAlert: -1e9, touchIdx: [...touchIdx, p.idx] };
      ln.touchConf = ln.touchIdx.map(() => i);
      if (!best || ln.score > best.score) best = ln;
    }
    return best;
  }

  // ---- trade ideas: a signal of the structure engine + RSI / MACD / VWAP / volume confirmations ----
  const NAMES = {
    TL_TOUCH_SUPPORT: 'Odraz od trendovej podpory', TL_TOUCH_RESISTANCE: 'Odraz od trendovej rezistencie',
    TL_BREAK_UP: 'Prerazenie trendovej rezistencie', TL_BREAK_DOWN: 'Prerazenie trendovej podpory',
    SR_BREAK_UP: 'Prerazenie úrovne nahor', SR_BREAK_DOWN: 'Prerazenie úrovne nadol',
    SR_BOUNCE_SUPPORT: 'Odraz od horizontálnej podpory', SR_BOUNCE_RESISTANCE: 'Odraz od horizontálnej rezistencie',
    NEAR_SUP: 'Cena pri podpore – čakaj na odraz', NEAR_RES: 'Cena pri rezistencii – čakaj na odraz',
  };
  const IDEA_DEF = { minTouches: 3, minLevel: 2, rr: 2, slAtr: 1, minScore: 0, rsiP: 14 };
  // the eight setups the live ideas are made of (each can be switched off / tuned in Funkcie → Stratégie)
  const STRATS = ['TL_TOUCH_SUPPORT', 'TL_TOUCH_RESISTANCE', 'TL_BREAK_UP', 'TL_BREAK_DOWN', 'SR_BOUNCE_SUPPORT', 'SR_BOUNCE_RESISTANCE', 'SR_BREAK_UP', 'SR_BREAK_DOWN'];

  function ideas(D, R, opt = {}) {
    const O = { ...IDEA_DEF, ...opt }, n = R.n, { h, l, c, v } = D;
    const rsi = KS.rsi(c, O.rsiP), hist = KS.macd(c, 12, 26, 9).hist, vw = KS.vwap(D, KS.source(D, 'hlc3')).vwap, vol = KS.sma(v, 20);
    const byBar = new Map();
    const ST = O.strat || {};
    for (const e of R.events) {
      if (ST[e.signal] && ST[e.signal].on === false) continue;           // strategy switched off
      const touches = e.what === 'line' ? e.ref.touchConf.filter(x => x <= e.i).length || e.ref.touches : e.ref.touchConf.filter(x => x <= e.i).length;
      if (e.what === 'line' ? touches < O.minTouches : touches < O.minLevel) continue;
      const key = e.i * 2 + (e.dir > 0 ? 1 : 0);
      const x = byBar.get(key);
      if (x) { x.signals.push(e.signal); continue; }
      byBar.set(key, { ...e, touches, signals: [e.signal] });
    }
    const out = [];
    for (const e of [...byBar.values()].sort((x, y) => x.i - y.i)) {
      const i = e.i, d = e.dir, a = e.atr, entry = c[i], P = { ...O, ...(ST[e.signal] || {}) };
      const breakout = /BREAK/.test(e.signal);
      let sl = e.value - d * (breakout ? 1 : 0.75) * P.slAtr * a;
      if (d * (entry - sl) < 0.5 * a) sl = entry - d * 0.5 * a;
      const risk = Math.abs(entry - sl), tp = entry + d * P.rr * risk;
      const conf = [];
      if (Number.isFinite(rsi[i]) && Number.isFinite(rsi[i - 1]) && (d > 0 ? rsi[i] > rsi[i - 1] && rsi[i] < 70 : rsi[i] < rsi[i - 1] && rsi[i] > 30)) conf.push(`RSI ${rsi[i].toFixed(0)} ${d > 0 ? '↑' : '↓'}`);
      if (Number.isFinite(hist[i]) && Number.isFinite(hist[i - 1]) && d * (hist[i] - hist[i - 1]) > 0) conf.push('MACD hist. ' + (d > 0 ? 'rastie' : 'klesá'));
      if (Number.isFinite(vw[i]) && d * (entry - vw[i]) > 0) conf.push(d > 0 ? 'nad VWAP' : 'pod VWAP');
      if (Number.isFinite(vol[i]) && vol[i] > 0 && v[i] > 1.5 * vol[i]) conf.push(`objem ${(v[i] / vol[i]).toFixed(1)}×`);
      if (R.trend[i] === d) conf.push(d > 0 ? 'swingy HH/HL' : 'swingy LH/LL');
      if (e.touches >= 4) conf.push(`${e.touches} dotykov`);
      if (conf.length < P.minScore) continue;
      // Outcome on the bars after the signal (only what is already on the chart); SL first if both in one bar.
      let result = null, exitI = null;
      for (let j = i + 1; j < n; j++) {
        const hitSL = d > 0 ? l[j] <= sl : h[j] >= sl, hitTP = d > 0 ? h[j] >= tp : l[j] <= tp;
        if (hitSL) { result = -1; exitI = j; break; }
        if (hitTP) { result = P.rr; exitI = j; break; }
      }
      out.push({ i, time: D.t[i], dir: d, signal: e.signal, signals: e.signals, name: e.signals.map(s => NAMES[s] || s).join(' + '),
                 entry, sl, tp, rr: P.rr, atr: a, touches: e.touches, line: e.value, conf, score: conf.length,
                 rsi: rsi[i], result, exitI, exitTime: exitI === null ? null : D.t[exitI] });
    }
    return out;
  }

  // Lines / levels alive at bar `i`, and the ones price is sitting on right now (possible entries).
  function snapshot(R, i, closeNow) {
    const lines = R.lines.filter(x => x.created <= i && (x.ended === null || x.ended >= i));
    const levels = R.levels.filter(x => x.created <= i && (x.ended === null || x.ended >= i) && x.touchConf.filter(c => c <= i).length >= R.minLevel);
    const a = R.atr[i], near = [];
    if (Number.isFinite(a)) {
      for (const ln of lines) { if (ln.ended !== null && ln.ended <= i) continue; const v = R.value(ln, i); if (Math.abs(closeNow - v) <= 0.5 * a) near.push({ kind: ln.kind, what: 'line', value: v, touches: ln.touches, dist: (closeNow - v) / a }); }
      for (const lv of levels) { if (lv.ended !== null && lv.ended <= i) continue; if (Math.abs(closeNow - lv.price) <= 0.5 * a) near.push({ kind: closeNow >= lv.price ? 'sup' : 'res', what: 'level', value: lv.price, touches: lv.touches, dist: (closeNow - lv.price) / a }); }
    }
    return { lines, levels, near };
  }

  function stats(list) {
    const done = list.filter(x => x.result !== null), wins = done.filter(x => x.result > 0);
    return { n: list.length, done: done.length, wins: wins.length, win: done.length ? wins.length / done.length : null,
             avgR: done.length ? done.reduce((s, x) => s + x.result, 0) / done.length : null, open: list.length - done.length };
  }

  return { run, ideas, snapshot, stats, zigK, zigzag, configure, NAMES, CFG, IDEA_DEF, STRATS, value };
})();
if (typeof module !== 'undefined') module.exports = TL;
