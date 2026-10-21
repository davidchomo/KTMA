// Nexus Lab engine, shared by the Lab page (lab.js) and the Electricals window in Nexus (app.js).
// For every bar it knows the value of every indicator in studies.js; it finds market moves (volume spikes with a big
// price change, trendline / level touches and breaks, breaks of established ranges), measures what happened next and
// makes statistics and nearest-neighbour suggestions out of the stored moves. Like autotl.js nothing looks ahead:
// the features of bar i use bars <= i and the outcome uses only bars after i.

const LAB = (() => {
  const H = 20;                                    // how many bars after a move we look at
  // indicators whose own value means something (RSI 70 is RSI 70 on every market); the rest become a percentile
  // rank 0–100 against their own last 200 bars, so MACD, OBV or momentum compare across markets and timeframes
  const RAW = { 'rsi.rsi': [0, 100, [30, 40, 50, 60, 70]], 'stoch.k': [0, 100, [20, 40, 60, 80]], 'stoch.d': [0, 100, [20, 40, 60, 80]],
    'stochrsi.k': [0, 100, [20, 40, 60, 80]], 'cci.cci': [-300, 300, [-100, -50, 0, 50, 100]], 'willr.wr': [-100, 0, [-80, -60, -40, -20]],
    'mfi.mfi': [0, 100, [20, 40, 60, 80]], 'adx.adx': [0, 60, [15, 20, 25, 35]], 'adx.pdi': [0, 60, [15, 25, 35]], 'adx.mdi': [0, 60, [15, 25, 35]],
    'aroon.up': [0, 100, [30, 70]], 'aroon.dn': [0, 100, [30, 70]], 'aroonosc.osc': [-100, 100, [-50, 0, 50]], 'bbpct.pb': [-0.5, 1.5, [0, 0.2, 0.5, 0.8, 1]],
    'chop.chop': [0, 100, [38.2, 50, 61.8]], 'cmo.cmo': [-100, 100, [-50, -20, 0, 20, 50]], 'uo.uo': [0, 100, [30, 50, 70]], 'mfi': null };
  const MIN_N = 20;                                // fewer cases than this in a cell is mostly chance – not ranked
  const PCT_BINS = [20, 40, 60, 80], DIST_BINS = [-2, -0.5, 0.5, 2];
  const SKIP_OV = new Set(['ribbon.a', 'ribbon.b', 'ribbon.c', 'ribbon.d', 'ichimoku.chikou', 'pivots.r2', 'pivots.r3', 'pivots.s2', 'pivots.s3', 'zigzag.zz', 'volume.vma']);
  const fin = Number.isFinite, r2 = v => Math.round(v * 100) / 100;

  // percentile rank of x[i] among x[i-w+1 .. i]
  function pctRank(x, w = 200) {
    const out = new Array(x.length).fill(NaN);
    for (let i = 0; i < x.length; i++) {
      if (!fin(x[i])) continue;
      let lo = 0, n = 0;
      for (let j = Math.max(0, i - w + 1); j <= i; j++) if (fin(x[j])) { n++; if (x[j] < x[i]) lo++; else if (x[j] === x[i]) lo += 0.5; }
      if (n >= 30) out[i] = 100 * lo / n;
    }
    return out;
  }

  // every indicator as a column: META[key] = {label, kind: 'raw' | 'pct' | 'dist' | 'x', bins, scale}
  function build(D) {
    const n = D.c.length, atr = KS.atr(D, 14), cols = {}, meta = {};
    const add = (key, label, kind, arr, bins, scale) => { cols[key] = arr; meta[key] = { label, kind, bins, scale }; };
    for (const [type, def] of Object.entries(KS.STUDIES)) {
      if (def.custom || def.pattern || type === 'volume') continue;
      let r; try { r = def.calc(D, KS.normalize({ type })); } catch (e) { continue; }
      if (!r) continue;
      for (const p of def.plots) {
        if (!(p.kind === 'line' || p.kind === 'hist' || !p.kind) || !Array.isArray(r[p.k])) continue;
        const key = `${type}.${p.k}`, name = def.plots.filter(q => q.kind === 'line' || q.kind === 'hist' || !q.kind).length > 1 ? `${def.name} · ${p.label}` : def.name;
        if (def.pane === true) {
          if (RAW[key]) { const [a, b, bins] = RAW[key]; add(key, name, 'raw', r[p.k], bins, b - a); }
          else add(key + '%', name + ' (percentil)', 'pct', pctRank(r[p.k]), PCT_BINS, 100);
        } else if (!SKIP_OV.has(key) && !/^vwap\.[ul][2-5]$/.test(key)) {
          add(key + '~', `Cena vs ${name} (ATR)`, 'dist', r[p.k].map((v, i) => (fin(v) && atr[i] > 0 ? Math.max(-6, Math.min(6, (D.c[i] - v) / atr[i])) : NaN)), DIST_BINS, 8);
        }
      }
    }
    // a few of our own: MACD state, slopes, volume, delta, the bar itself and where the price comes from
    const m = KS.macd(D.c, 12, 26, 9);
    add('macd.state', 'MACD histogram (stav)', 'x', m.hist.map((v, i) => (!fin(v) || !fin(m.hist[i - 1]) ? NaN : v >= 0 ? (v >= m.hist[i - 1] ? 2 : 1) : (v <= m.hist[i - 1] ? -2 : -1))), [-1.5, -0.5, 0.5, 1.5], 4);
    add('macd.cross', 'MACD nad / pod signálom', 'x', m.macd.map((v, i) => (fin(v) && fin(m.signal[i]) ? (v >= m.signal[i] ? 1 : -1) : NaN)), [0], 2);
    const rs = KS.rsi(D.c, 14);
    add('rsi.slope', 'RSI zmena za 3 sviečky', 'raw', rs.map((v, i) => (i >= 3 ? v - rs[i - 3] : NaN)), [-10, -3, 3, 10], 40);
    const vma = KS.sma(D.v, 20);
    add('vol.x', 'Objem × priemer 20', 'raw', D.v.map((v, i) => (i && vma[i - 1] > 0 ? v / vma[i - 1] : NaN)), [1, 1.5, 2.5, 4], 6);
    if (D.bv) add('vol.buy', 'Nákupy % z objemu', 'raw', D.v.map((v, i) => (v > 0 && fin(D.bv[i]) ? 100 * D.bv[i] / v : NaN)), [35, 45, 55, 65], 100);
    add('bar.body', 'Telo sviečky (ATR)', 'raw', D.c.map((c, i) => (i && atr[i - 1] > 0 ? (c - D.o[i]) / atr[i - 1] : NaN)), [-1.5, -0.5, 0.5, 1.5], 6);
    for (const k of [5, 20, 50]) add(`ret.${k}`, `Pohyb za ${k} sviečok (ATR)`, 'raw', D.c.map((c, i) => (i >= k && atr[i] > 0 ? (c - D.c[i - k]) / atr[i] : NaN)), [-3, -1, 1, 3], 12);
    add('atr.pct', 'Volatilita ATR (percentil)', 'pct', pctRank(atr), PCT_BINS, 100);
    const sess = D.t.map(t => new Date(t * 1000).getUTCHours());
    add('hour', 'Hodina (UTC)', 'raw', sess, [4, 8, 12, 16, 20], 24);
    return { n, atr, cols, meta, D };
  }
  const featuresAt = (F, i) => { const o = {}; for (const k in F.cols) { const v = F.cols[k][i]; if (fin(v)) o[k] = k.endsWith('%') ? Math.round(v) : r2(v); } return o; };

  // what happened after bar i for a trade in direction dir: which of ±1 ATR came first, best / worst excursion, returns
  function outcome(F, i, dir, end) {
    const { D, atr } = F, a = atr[i], c0 = D.c[i], last = Math.min(end - 1, i + H);
    if (!(a > 0)) return null;
    let hit = 0, mfe = 0, mae = 0;
    for (let j = i + 1; j <= last; j++) {
      const up = dir * ((dir > 0 ? D.h[j] : D.l[j]) - c0) / a, dn = dir * ((dir > 0 ? D.l[j] : D.h[j]) - c0) / a;
      if (!hit && dn <= -1) hit = -1; else if (!hit && up >= 1) hit = 1;   // the stop first when both are in one bar
      mfe = Math.max(mfe, up); mae = Math.min(mae, dn);
    }
    const ret = k => (i + k < end ? r2(dir * (D.c[i + k] - c0) / a) : null);
    return { hit, mfe: r2(mfe), mae: r2(mae), r5: ret(5), r10: ret(10), r20: ret(20), done: i + H < end, atr: a, price: c0 };
  }

  // ---- finding moves -----------------------------------------------------------------------------------
  const P = { volX: 2.5, moveAtr: 1.2, gap: 3, minTouches: 3, rangeTests: 3, rangeLen: 25 };
  function spikes(F, end, o = {}) {
    const O = { ...P, ...o }, { D, atr } = F, vx = F.cols['vol.x'], out = []; let last = -1e9;
    for (let i = 30; i < end; i++) {
      const a = atr[i - 1], mv = D.c[i] - D.o[i];
      if (!(vx[i] >= O.volX) || !(a > 0) || Math.abs(mv) < O.moveAtr * a || i - last < O.gap) continue;
      last = i; out.push({ kind: 'event', i, dir: Math.sign(mv), info: { volx: r2(vx[i]), move: r2(mv / a) } });
    }
    return out;
  }
  function tlMoves(F, end, k) {
    const D = F.D.c.length === end ? F.D : slice(F.D, end), R = TL.run(D, { k }), out = [];
    for (const e of R.events) {
      const touches = e.ref.touchConf ? e.ref.touchConf.filter(x => x <= e.i).length || e.ref.touches : e.ref.touches;
      if (touches < P.minTouches) continue;
      out.push({ kind: 'tl', i: e.i, dir: e.dir, info: { sig: e.signal, what: e.what, touches } });
    }
    return { moves: out, lines: R.lines, levels: R.levels, value: R.value };
  }
  // established ranges only: both edges tested at least rangeTests times and at least rangeLen bars long
  const solid = r => r.testsTop >= P.rangeTests && r.testsBot >= P.rangeTests && r.i1 - r.i0 >= P.rangeLen;
  function rangeMoves(F, end) {
    const D = F.D.c.length === end ? F.D : slice(F.D, end), rs = ST.ranges(D, { minLen: P.rangeLen, maxAtr: 3.5, minTests: P.rangeTests }).filter(solid);
    return { moves: rs.filter(r => r.brk).map(r => ({ kind: 'range', i: r.i1, dir: r.brk, info: { len: r.i1 - r.i0, tests: Math.min(r.testsTop, r.testsBot), height: r2((r.top - r.bot) / r.atr) } })), ranges: rs };
  }
  function slice(D, n) { const o = {}; for (const k in D) o[k] = Array.isArray(D[k]) ? D[k].slice(0, n) : D[k]; return o; }

  // everything for one chart: records ready for /api/lab plus what the chart draws
  function analyse(D, meta, o = {}) {
    const end = o.closed ?? D.c.length, F = build(D);
    const tl = tlMoves(F, end, o.k || TL.zigK(meta.tf, o.tfSec || 3600)), rg = rangeMoves(F, end);
    const moves = [...spikes(F, end, o), ...tl.moves, ...rg.moves].sort((a, b) => a.i - b.i);
    const recs = moves.map(m => ({ kind: m.kind, symbol: meta.symbol, timeframe: meta.tf, t0: D.t[m.i], t1: D.t[Math.min(end - 1, m.i + H)], dir: m.dir,
      features: featuresAt(F, m.i), outcome: { ...outcome(F, m.i, m.dir, end), ...m.info }, i: m.i })).filter(r => r.outcome.atr);
    return { F, recs, tl, ranges: rg.ranges, end };
  }
  function caseRecord(F, meta, i0, i1, author, note) {
    const { D, atr } = F, dir = Math.sign(D.c[i1] - D.c[i0]) || 1, a = atr[i0];
    let mfe = 0; for (let j = i0 + 1; j <= i1; j++) mfe = Math.max(mfe, dir * ((dir > 0 ? D.h[j] : D.l[j]) - D.c[i0]) / a);
    return { kind: 'case', author, note, symbol: meta.symbol, timeframe: meta.tf, t0: D.t[i0], t1: D.t[i1], dir, features: featuresAt(F, i0),
      outcome: { hit: 1, move: r2(dir * (D.c[i1] - D.c[i0]) / a), pct: r2(100 * (D.c[i1] - D.c[i0]) / D.c[i0]), bars: i1 - i0, mfe: r2(mfe), done: true, atr: a, price: D.c[i0] } };
  }

  // ---- learning: nearest neighbours among stored moves ----------------------------------------------
  const scaleOf = (meta, k) => (meta && meta[k] && meta[k].scale) || (k.endsWith('%') ? 100 : k.endsWith('~') ? 8 : 100);
  function distance(a, b, meta) {
    let s = 0, n = 0;
    for (const k in a) { if (!(k in b) || k === 'hour') continue; const d = (a[k] - b[k]) / scaleOf(meta, k); s += d * d; n++; }
    return n >= 10 ? Math.sqrt(s / n) : Infinity;
  }
  const simPct = d => Math.max(0, Math.round(100 * (1 - d / 0.35)));
  // neighbours vote with the direction price actually went first (dir × hit); saved moves count three times
  function suggest(f, pool, meta, o = {}) {
    const K = o.k || 25, cand = pool.filter(r => r.outcome && (r.kind === 'case' || (r.outcome.done && r.outcome.hit)) && (!o.kind || r.kind === o.kind || r.kind === 'case'));
    const near = cand.map(r => ({ r, d: distance(f, r.features, meta) })).filter(x => fin(x.d)).sort((a, b) => a.d - b.d).slice(0, K);
    if (near.length < 8) return { n: near.length, near };
    let up = 0, dn = 0, mfe = [];
    for (const { r } of near) { const w = r.kind === 'case' ? 3 : 1, u = r.kind === 'case' ? r.dir : r.dir * r.outcome.hit; if (u > 0) up += w; else dn += w; mfe.push(r.outcome.mfe || 1); }
    const pUp = up / (up + dn), sim = simPct(near.reduce((s, x) => s + x.d, 0) / near.length);
    const dir = pUp >= (o.th || 0.62) ? 1 : pUp <= 1 - (o.th || 0.62) ? -1 : 0;
    mfe.sort((a, b) => a - b);
    return { n: near.length, near, pUp, sim, dir, tp: Math.max(1, Math.min(3, mfe[Math.floor(mfe.length / 2)])) };
  }
  // bars that look like the start of a saved move (only moves saved from earlier bars count, so no peeking)
  function caseMatches(F, cases, from, th = 70) {
    const out = [];
    for (let i = from; i < F.n; i++) {
      const f = featuresAt(F, i); let best = null;
      for (const c of cases) { if (c.t1 >= F.D.t[i] && c.symbol) continue; const s = simPct(distance(f, c.features, F.meta)); if (s >= th && (!best || s > best.s)) best = { s, c }; }
      if (best) out.push({ i, ...best });
    }
    return out;
  }

  // ---- statistics (Electricals) --------------------------------------------------------------------------
  // win = price went 1 ATR in the move's direction before 1 ATR against it within H bars
  function base(rs) {
    const d = rs.filter(r => r.outcome && r.outcome.done && r.kind !== 'case'), w = d.filter(r => r.outcome.hit > 0).length, l = d.filter(r => r.outcome.hit < 0).length;
    const r10 = d.map(r => r.outcome.r10).filter(fin);
    return { n: d.length, win: w + l ? w / (w + l) : null, r10: r10.length ? r10.reduce((a, b) => a + b, 0) / r10.length : null };
  }
  const binOf = (v, bins) => { let k = 0; while (k < bins.length && v >= bins[k]) k++; return k; };
  const binName = (bins, k, kind) => { const f = v => (kind === 'pct' ? Math.round(v) : +v.toFixed(2)); return k === 0 ? `< ${f(bins[0])}` : k === bins.length ? `≥ ${f(bins[k - 1])}` : `${f(bins[k - 1])}–${f(bins[k])}`; };
  function table(rs, meta) {
    const B = base(rs), out = [], done = rs.filter(r => r.outcome && r.outcome.done && r.kind !== 'case');
    const keys = new Set(); for (const r of done) for (const k in r.features) keys.add(k);
    for (const k of keys) {
      const m = (meta && meta[k]) || guessMeta(k); if (!m) continue;
      const cells = Array.from({ length: m.bins.length + 1 }, (_, j) => ({ name: binName(m.bins, j, m.kind), n: 0, w: 0, l: 0, r10: 0, rn: 0 }));
      for (const r of done) { const v = r.features[k]; if (!fin(v)) continue; const c = cells[binOf(v, m.bins)]; c.n++; if (r.outcome.hit > 0) c.w++; else if (r.outcome.hit < 0) c.l++; if (fin(r.outcome.r10)) { c.r10 += r.outcome.r10; c.rn++; } }
      for (const c of cells) { c.win = c.w + c.l ? c.w / (c.w + c.l) : null; c.r10 = c.rn ? c.r10 / c.rn : null; c.edge = c.win !== null && B.win !== null ? c.win - B.win : 0; }
      out.push({ key: k, label: m.label, kind: m.kind, cells, power: Math.max(0, ...cells.filter(c => c.n >= MIN_N).map(c => Math.abs(c.edge) * Math.sqrt(c.n))) });
    }
    return { base: B, rows: out.sort((a, b) => b.power - a.power) };
  }
  // stored records from another browser may have keys this build doesn't (or no meta at all): rebuild bins from the key
  function guessMeta(k) {
    if (metaAll()[k]) return metaAll()[k];
    if (k.endsWith('%')) return { label: k.slice(0, -1), kind: 'pct', bins: PCT_BINS, scale: 100 };
    if (k.endsWith('~')) return { label: 'Cena vs ' + k.slice(0, -1), kind: 'dist', bins: DIST_BINS, scale: 8 };
    if (RAW[k]) return { label: k, kind: 'raw', bins: RAW[k][2], scale: RAW[k][1] - RAW[k][0] };
    return null;
  }
  // labels and bins of every feature without real data (the Electricals window in Nexus has no Lab chart): build once on a made-up series
  let META_HINT = null;
  function metaAll() {
    if (META_HINT) return META_HINT;
    const n = 300, D = { t: [], o: [], h: [], l: [], c: [], v: [], bv: [] }; let p = 100;
    for (let i = 0; i < n; i++) { const o = p; p += Math.sin(i / 7) + Math.cos(i / 3) * 0.5; D.t.push(i * 3600); D.o.push(o); D.c.push(p); D.h.push(Math.max(o, p) + 0.3); D.l.push(Math.min(o, p) - 0.3); D.v.push(100 + 50 * Math.abs(Math.sin(i))); D.bv.push(60); }
    return (META_HINT = build(D).meta);
  }
  function setMeta(m) { META_HINT = m || null; }
  function groups(rs, by) {
    const g = new Map();
    for (const r of rs) { if (!r.outcome || !r.outcome.done) continue; const k = by(r); if (k === null || k === undefined) continue; if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
    return [...g.entries()].map(([k, v]) => ({ k, ...base(v) }));
  }
  const SIG = { TL_BREAK_UP: 'prerazenie čiary nahor', TL_BREAK_DOWN: 'prerazenie čiary nadol', TL_TOUCH_RESISTANCE: 'odraz od rezistencie (čiara)', TL_TOUCH_SUPPORT: 'odraz od podpory (čiara)',
    SR_BREAK_UP: 'prerazenie úrovne nahor', SR_BREAK_DOWN: 'prerazenie úrovne nadol', SR_BOUNCE_SUPPORT: 'odraz od podpory (úroveň)', SR_BOUNCE_RESISTANCE: 'odraz od rezistencie (úroveň)' };
  const KINDS = { event: '⚡ Objemové špičky', tl: '📐 Trendové čiary a úrovne', range: '▭ Prerazenie range (BOS)', case: '✂ Uložené pohyby' };

  // short text for Claude in the chat
  function summary(rs) {
    const L = [], pc = v => (v === null ? '–' : Math.round(100 * v) + ' %');
    for (const kind of ['event', 'tl', 'range']) {
      const sub = rs.filter(r => r.kind === kind), B = base(sub); if (!B.n) continue;
      L.push(`${KINDS[kind]}: ${B.n} prípadov, pokračovanie o 1 ATR skôr než 1 ATR proti: ${pc(B.win)}, priemer po 10 sviečkach ${B.r10 === null ? '–' : B.r10.toFixed(2)} ATR.`);
      const T = table(sub, metaAll());
      for (const row of T.rows.slice(0, 5)) { const c = row.cells.filter(x => x.n >= MIN_N).sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge))[0]; if (c) L.push(`  – ${row.label} ${c.name}: ${c.n}×, úspešnosť ${pc(c.win)} (základ ${pc(T.base.win)})`); }
      if (kind === 'tl') for (const g of groups(sub, r => Math.min(5, r.outcome.touches || 0)).sort((a, b) => a.k - b.k)) L.push(`  – ${g.k >= 5 ? '5+' : g.k} dotykov: ${g.n}×, úspešnosť ${pc(g.win)}`);
    }
    const cs = rs.filter(r => r.kind === 'case'); if (cs.length) L.push(`✂ Uložené pohyby: ${cs.length} (${cs.slice(0, 5).map(c => `${c.symbol} ${c.timeframe} ${c.dir > 0 ? '▲' : '▼'} ${c.outcome.move} ATR${c.note ? ' „' + c.note.slice(0, 40) + '“' : ''}`).join('; ')})`);
    return L.join('\n');
  }

  // ---- server ------------------------------------------------------------------------------------------
  const api = {
    list: async (q = {}) => (await fetch('api/lab?' + new URLSearchParams(q))).json(),
    save: async recs => (await fetch('api/lab', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(recs.map(({ i, ...r }) => r)) })).json(),
    del: async (id, author) => fetch(`api/lab/${id}?author=${encodeURIComponent(author || '')}`, { method: 'DELETE' }),
    summary: async text => fetch('api/lab/summary', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }),
  };

  // ---- the Electricals view (Lab side panel and the Nexus window share it) ---------------------------------
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pc = v => (v === null || v === undefined ? '–' : Math.round(100 * v) + ' %');
  const heat = (c, B) => { if (c.win === null || c.n < 5) return ''; const e = c.edge, a = Math.min(0.75, Math.abs(e) * 3 * Math.min(1, c.n / 30)); return `background:${e >= 0 ? `rgba(38,166,154,${a})` : `rgba(239,83,80,${a})`}`; };
  function render(el, rs, st, onChange) {
    const kinds = ['event', 'tl', 'range', 'case'].filter(k => rs.some(r => r.kind === k));
    st.kind = kinds.includes(st.kind) ? st.kind : kinds[0] || 'event';
    const syms = [...new Set(rs.map(r => r.symbol))].sort(), tfs = [...new Set(rs.map(r => r.timeframe))];
    let sub = rs.filter(r => r.kind === st.kind && (!st.symbol || r.symbol === st.symbol) && (!st.tf || r.timeframe === st.tf) && (!st.dir || r.dir === +st.dir));
    const B = base(sub);
    const sel = (k, opts) => `<select data-el="${k}">${opts.map(([v, n]) => `<option value="${esc(v)}" ${String(st[k] || '') === String(v) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
    let html = `<div class="el-bar">${kinds.map(k => `<span class="el-tab ${st.kind === k ? 'on' : ''}" data-ek="${k}">${KINDS[k]} <small>${rs.filter(r => r.kind === k).length}</small></span>`).join('')}</div>
      <div class="el-bar">${sel('symbol', [['', 'Všetky trhy'], ...syms.map(s => [s, s])])}${sel('tf', [['', 'Všetky TF'], ...tfs.map(s => [s, s])])}${sel('dir', [['', 'Oba smery'], ['1', 'Len ▲ nahor'], ['-1', 'Len ▼ nadol']])}
      <input data-el="q" placeholder="Hľadať indikátor…" value="${esc(st.q || '')}"></div>`;
    if (!rs.length) return void (el.innerHTML = html + `<p class="muted el-empty">Zatiaľ žiadne dáta. Otvor <b>Nexus Lab</b> a daj <b>🔍 Skenovať</b> – nájdené pohyby sa uložia sem.</p>`, bind());
    if (st.kind === 'case') {
      html += `<table class="el-t"><tr><th>Trh</th><th>Smer</th><th>Od</th><th>Pohyb</th><th>Sviečok</th><th>RSI</th><th>MACD</th><th>Objem×</th><th>Poznámka</th><th></th></tr>${sub.map(c => `<tr>
        <td>${esc(c.symbol)} ${esc(c.timeframe)}</td><td class="${c.dir > 0 ? 'up' : 'dn'}">${c.dir > 0 ? '▲' : '▼'}</td><td>${new Date(c.t0 * 1000).toLocaleString('sk-SK', { dateStyle: 'short', timeStyle: 'short' })}</td>
        <td>${c.outcome.move} ATR · ${c.outcome.pct} %</td><td>${c.outcome.bars}</td><td>${c.features['rsi.rsi'] ?? '–'}</td><td>${['', 'pod 0 ↓', 'pod 0 ↑', '', 'nad 0 ↓', 'nad 0 ↑'][(c.features['macd.state'] ?? 0) + 3] || '–'}</td><td>${c.features['vol.x'] ?? '–'}</td>
        <td>${esc(c.note || '')} <small class="muted">${esc(c.author || '')}</small></td><td>${st.open ? `<button class="btn sm" data-eopen="${c.id}">↗</button>` : ''}<button class="btn sm" data-edel="${c.id}">🗑</button></td></tr>`).join('')}</table>`;
      el.innerHTML = html; return bind();
    }
    html += `<div class="el-base">Prípadov <b>${B.n}</b> · pokračovanie (1 ATR v smere skôr než 1 ATR proti) <b>${pc(B.win)}</b> · priemer po 10 sviečkach <b>${B.r10 === null ? '–' : B.r10.toFixed(2)} ATR</b>
      <span class="muted">· zelená = lepšie než základ, červená = horšie (silnejšia farba = väčší rozdiel a viac prípadov)</span>
      <div class="muted">Pozor: pri desiatkach prípadov je veľa rozdielov len náhoda. Ber vážne až to, čo vydrží na viacerých trhoch a timeframoch (prepni filter hore).</div></div>`;
    if (st.kind === 'tl') {
      const g = groups(sub, r => Math.min(5, r.outcome.touches || 0)).sort((a, b) => a.k - b.k), s = groups(sub, r => r.outcome.sig);
      html += `<div class="el-two"><table class="el-t"><tr><th>Dotykov čiary</th><th>Prípadov</th><th>Úspešnosť</th><th>Po 10 sv.</th></tr>${g.map(x => `<tr><td>${x.k >= 5 ? '5+' : x.k}</td><td>${x.n}</td><td style="${heat({ ...x, edge: x.win - B.win }, B)}">${pc(x.win)}</td><td>${x.r10 === null ? '–' : x.r10.toFixed(2)}</td></tr>`).join('')}</table>
        <table class="el-t"><tr><th>Signál</th><th>Prípadov</th><th>Úspešnosť</th><th>Po 10 sv.</th></tr>${s.map(x => `<tr><td>${esc(SIG[x.k] || x.k)}</td><td>${x.n}</td><td style="${heat({ ...x, edge: x.win - B.win }, B)}">${pc(x.win)}</td><td>${x.r10 === null ? '–' : x.r10.toFixed(2)}</td></tr>`).join('')}</table></div>`;
    }
    if (st.kind === 'range') {
      const g = groups(sub, r => Math.min(6, r.outcome.tests || 0)).sort((a, b) => a.k - b.k);
      html += `<table class="el-t"><tr><th>Dotykov hrán (min)</th><th>Prípadov</th><th>Úspešnosť BOS</th><th>Po 10 sv.</th></tr>${g.map(x => `<tr><td>${x.k >= 6 ? '6+' : x.k}</td><td>${x.n}</td><td style="${heat({ ...x, edge: x.win - B.win }, B)}">${pc(x.win)}</td><td>${x.r10 === null ? '–' : x.r10.toFixed(2)}</td></tr>`).join('')}</table>`;
    }
    const T = table(sub, metaAll()), q = (st.q || '').toLowerCase();
    const top = T.rows.flatMap(r => r.cells.filter(c => c.n >= MIN_N && c.win !== null).map(c => ({ r, c }))).sort((a, b) => Math.abs(b.c.edge) * Math.sqrt(b.c.n) - Math.abs(a.c.edge) * Math.sqrt(a.c.n)).slice(0, 12);
    if (top.length) html += `<div class="sec">Najsilnejšie súvislosti</div><table class="el-t"><tr><th>Indikátor</th><th>Hodnota</th><th>Prípadov</th><th>Úspešnosť</th><th>vs základ</th><th>Po 10 sv.</th></tr>${top.map(({ r, c }) => `<tr><td>${esc(r.label)}</td><td>${esc(c.name)}</td><td>${c.n}</td><td style="${heat(c, B)}">${pc(c.win)}</td><td class="${c.edge >= 0 ? 'up' : 'dn'}">${c.edge >= 0 ? '+' : ''}${Math.round(100 * c.edge)} %</td><td>${c.r10 === null ? '–' : c.r10.toFixed(2)}</td></tr>`).join('')}</table>`;
    html += `<div class="sec">Všetky indikátory – čo sa stalo pri akej hodnote <span class="muted">(v bunke: úspešnosť · počet)</span></div><table class="el-t el-grid">${T.rows.filter(r => !q || r.label.toLowerCase().includes(q) || r.key.includes(q)).map(r => `<tr><td title="${esc(r.key)}">${esc(r.label)}</td>${r.cells.map(c => `<td style="${heat(c, B)}" title="${esc(c.name)}: ${c.n} prípadov, úspešnosť ${pc(c.win)}, po 10 sviečkach ${c.r10 === null ? '–' : c.r10.toFixed(2)} ATR"><small>${esc(c.name)}</small><br>${c.n ? pc(c.win) : '–'} <small class="muted">${c.n}</small></td>`).join('')}</tr>`).join('')}</table>`;
    el.innerHTML = html; bind();
    function bind() {
      el.querySelectorAll('[data-ek]').forEach(x => x.onclick = () => { st.kind = x.dataset.ek; onChange(); });
      el.querySelectorAll('select[data-el]').forEach(x => x.onchange = () => { st[x.dataset.el] = x.value; onChange(); });
      const qi = el.querySelector('input[data-el=q]'); if (qi) qi.oninput = () => { st.q = qi.value; clearTimeout(qi._t); qi._t = setTimeout(() => { onChange(); const n = el.querySelector('input[data-el=q]'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 300); };
      el.querySelectorAll('[data-edel]').forEach(x => x.onclick = () => st.del && st.del(+x.dataset.edel));
      el.querySelectorAll('[data-eopen]').forEach(x => x.onclick = () => st.open && st.open(rs.find(r => r.id === +x.dataset.eopen)));
    }
  }

  return { H, P, build, featuresAt, outcome, analyse, caseRecord, suggest, caseMatches, distance, simPct, table, base, groups, summary, render, api, setMeta, solid, KINDS, SIG };
})();
