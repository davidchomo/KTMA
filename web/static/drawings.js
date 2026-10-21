// Drawing tools (TradingView-like): each tool describes only its geometry in pixels; drawing, hit-testing,
// selecting, dragging, styling and saving are shared. Points are stored as {t: bar time (s), p: price},
// so drawings stay where they belong when you zoom, scroll or switch the timeframe.

const DR = (() => {
  const { $, $$, esc, LS, swatch, opts, colorPopover, openDialog, closeDialog, rgba } = UI;
  const FIB = [[0, '#787b86'], [0.236, '#f23645'], [0.382, '#ff9800'], [0.5, '#4caf50'], [0.618, '#089981'], [0.786, '#00bcd4'],
               [1, '#787b86'], [1.618, '#2962ff'], [2.618, '#f23645'], [3.618, '#9c27b0'], [4.236, '#e91e63']];
  const FIB_EXT = [[0, '#787b86'], [0.382, '#f23645'], [0.618, '#ff9800'], [1, '#089981'], [1.272, '#00bcd4'], [1.618, '#2962ff'],
                   [2, '#9c27b0'], [2.618, '#e91e63'], [3.618, '#f23645'], [4.236, '#ff9800']];
  const FIB_CIRCLE = [[0.236, '#f23645'], [0.382, '#ff9800'], [0.5, '#4caf50'], [0.618, '#089981'], [0.786, '#00bcd4'], [1, '#787b86'], [1.618, '#2962ff'], [2.618, '#9c27b0']];
  const lv = list => list.map(([v, color]) => ({ v, color, on: true }));
  const GROUPS = [['lines', 'Trendové nástroje'], ['channels', 'Kanály'], ['pitch', 'Vidly'], ['fib', 'Fibonacci'], ['gann', 'Gann'],
                  ['patterns', 'Vzory'], ['positions', 'Pozície a meranie'], ['brush', 'Štetce'], ['arrows', 'Šípky'], ['shapes', 'Tvary'], ['text', 'Text a poznámky']];
  const BASE = { color: '#2962ff', opacity: 100, width: 2, style: 0, fill: false, fillColor: '#2962ff', fillOpacity: 15, text: '',
                 textColor: '#d1d4dc', fontSize: 13, extL: false, extR: false, labels: true };

  // ---- geometry helpers (pixels) ------------------------------------------------------------------
  const L = (a, b, o) => ({ t: 'line', a, b, ...(o || {}) });
  const PL = (pts, o) => ({ t: 'poly', pts, ...(o || {}) });
  const TX = (x, y, text, o) => ({ t: 'text', x, y, text, ...(o || {}) });
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const add = (a, v, k = 1) => ({ x: a.x + v.x * k, y: a.y + v.y * k });
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const ray = (a, dir, E) => {          // from a along dir to the edge of the pane
    const len = Math.hypot(dir.x, dir.y) || 1, k = (E.W + E.H) * 2 / len;
    return add(a, dir, k);
  };
  const arc = (cx, cy, r, a0, a1, n = 48) => Array.from({ length: n + 1 }, (_, i) => ({ x: cx + r * Math.cos(a0 + (a1 - a0) * i / n), y: cy + r * Math.sin(a0 + (a1 - a0) * i / n) }));
  const bez2 = (a, c, b, n = 40) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y }; });
  const bez3 = (a, c1, c2, b, n = 60) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t;
    return { x: u ** 3 * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * b.x, y: u ** 3 * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * b.y }; });
  const head = (from, to, size = 10) => {
    const a = Math.atan2(to.y - from.y, to.x - from.x);
    return PL([{ x: to.x - size * Math.cos(a - 0.45), y: to.y - size * Math.sin(a - 0.45) }, to, { x: to.x - size * Math.cos(a + 0.45), y: to.y - size * Math.sin(a + 0.45) }], { closed: true, fill: true, solid: true });
  };
  const box = (a, b) => [{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y }];

  // ---- tools ------------------------------------------------------------------------------------
  const TOOLS = {};
  const tool = (id, group, name, icon, n, geom, extra) => { TOOLS[id] = { id, group, name, icon, n, geom, ...(extra || {}) }; };
  const lineProps = ['line', 'ext'];

  tool('trend', 'lines', 'Trendová čiara', '╱', 2, ([a, b], d) => [L(a, b, { extL: d.extL, extR: d.extR })], { key: 'Alt+T', props: lineProps });
  tool('ray', 'lines', 'Lúč', '↗', 2, ([a, b], d) => [L(a, b, { extL: d.extL, extR: d.extR })], { defaults: { extR: true }, props: lineProps });
  tool('info', 'lines', 'Info čiara', 'ⓘ', 2, ([a, b], d, E) => {
    const [p, q] = d.pts, dp = q.p - p.p;
    return [L(a, b, { extL: d.extL, extR: d.extR }), TX(b.x + 8, b.y, `${dp >= 0 ? '+' : ''}${E.fmt(dp)} (${(100 * dp / p.p).toFixed(2)} %) · ${Math.round(E.bars(p.t, q.t))} sviečok`, { bg: true, align: 'left' })];
  }, { props: lineProps });
  tool('extended', 'lines', 'Predĺžená čiara', '⟷', 2, ([a, b], d) => [L(a, b, { extL: d.extL, extR: d.extR })], { defaults: { extL: true, extR: true }, props: lineProps });
  tool('angle', 'lines', 'Trendový uhol', '∠', 2, ([a, b], d) => {
    const ang = -Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    return [L(a, b, { extL: d.extL, extR: d.extR }), L(a, { x: a.x + 60, y: a.y }, { dash: [3, 3], width: 1 }),
            PL(arc(a.x, a.y, 30, 0, -ang * Math.PI / 180, 20)), TX(a.x + 36, a.y - 8, `${ang.toFixed(1)}°`, { align: 'left' })];
  }, { props: lineProps });
  tool('hline', 'lines', 'Horizontálna čiara', '─', 1, ([a], d, E) => [L({ x: 0, y: a.y }, { x: E.W, y: a.y }), TX(E.W - 4, a.y - 2, E.fmt(d.pts[0].p), { align: 'right', base: 'bottom', bg: true, solidBg: true })], { key: 'Alt+H', props: ['line'] });
  tool('hray', 'lines', 'Horizontálny lúč', '⊢', 1, ([a], d, E) => [L(a, { x: E.W, y: a.y }), TX(a.x + 4, a.y - 2, E.fmt(d.pts[0].p), { align: 'left', base: 'bottom' })], { key: 'Alt+J', props: ['line'] });
  tool('vline', 'lines', 'Vertikálna čiara', '│', 1, ([a], d, E) => [L({ x: a.x, y: 0 }, { x: a.x, y: E.H })], { key: 'Alt+V', props: ['line'] });
  tool('cross', 'lines', 'Krížová čiara', '┼', 1, ([a], d, E) => [L({ x: 0, y: a.y }, { x: E.W, y: a.y }), L({ x: a.x, y: 0 }, { x: a.x, y: E.H })], { key: 'Alt+C', props: ['line'] });

  tool('parallel', 'channels', 'Paralelný kanál', '▱', 3, ([a, b, c], d) => {
    if (!c) return [L(a, b)];
    const lineY = x => a.y + (b.y - a.y) * (x - a.x) / ((b.x - a.x) || 1e-9), off = { x: 0, y: c.y - lineY(c.x) };
    const a2 = add(a, off), b2 = add(b, off);
    return [PL([a, b, b2, a2], { closed: true, fill: true, stroke: false }), L(a, b, { extL: d.extL, extR: d.extR }), L(a2, b2, { extL: d.extL, extR: d.extR }),
            L(mid(a, a2), mid(b, b2), { dash: [4, 4], width: 1, extL: d.extL, extR: d.extR })];
  }, { defaults: { fill: true }, props: ['line', 'ext', 'fill'] });
  tool('regression', 'channels', 'Regresný trend', '⫽', 2, ([a, b], d, E) => {
    const r = E.regression(d.pts[0].t, d.pts[1].t, d.dev ?? 2);
    if (!r) return [L(a, b)];
    const P = (t, p) => E.px({ t, p });
    const m0 = P(r.t0, r.m0), m1 = P(r.t1, r.m1), u0 = P(r.t0, r.m0 + r.k), u1 = P(r.t1, r.m1 + r.k), l0 = P(r.t0, r.m0 - r.k), l1 = P(r.t1, r.m1 - r.k);
    return [PL([u0, u1, l1, l0], { closed: true, fill: true, stroke: false }), L(m0, m1, { dash: [4, 4], extR: d.extR }), L(u0, u1, { extR: d.extR }), L(l0, l1, { extR: d.extR })];
  }, { defaults: { fill: true, dev: 2 }, props: ['line', 'ext', 'fill', 'dev'] });
  tool('flat', 'channels', 'Plochý vrch / dno', '⏢', 3, ([a, b, c]) => {
    if (!c) return [L(a, b)];
    const a2 = { x: a.x, y: c.y }, b2 = { x: b.x, y: c.y };
    return [PL([a, b, b2, a2], { closed: true, fill: true, stroke: false }), L(a, b), L(a2, b2)];
  }, { defaults: { fill: true }, props: ['line', 'fill'] });
  tool('disjoint', 'channels', 'Rozbiehavý kanál', '⋖', 3, ([a, b, c]) => {
    if (!c) return [L(a, b)];
    const d2 = { x: c.x + (b.x - a.x), y: c.y - (b.y - a.y) };
    return [PL([a, b, d2, c], { closed: true, fill: true, stroke: false }), L(a, b), L(c, d2)];
  }, { defaults: { fill: true }, props: ['line', 'fill'] });

  const fork = kind => ([a, b, c], d, E) => {
    if (!c) return [L(a, b)];
    const o = kind === 'schiff' ? { x: a.x, y: (a.y + b.y) / 2 } : kind === 'mod' ? mid(a, b) : a, m = mid(b, c), dir = sub(m, o);
    const out = [L(b, c, { width: 1 }), L(o, ray(m, dir, E)), L(b, ray(b, dir, E)), L(c, ray(c, dir, E)), L(a, o, { dash: [4, 4], width: 1 })];
    out.unshift(PL([b, ray(b, dir, E), ray(c, dir, E), c], { closed: true, fill: true, stroke: false }));
    return out;
  };
  tool('pitchfork', 'pitch', 'Vidly (Andrews)', '⋔', 3, fork('std'), { defaults: { fill: true, fillOpacity: 8 }, props: ['line', 'fill'] });
  tool('schiff', 'pitch', 'Schiffove vidly', '⋔', 3, fork('schiff'), { defaults: { fill: true, fillOpacity: 8 }, props: ['line', 'fill'] });
  tool('modschiff', 'pitch', 'Upravené Schiffove vidly', '⋔', 3, fork('mod'), { defaults: { fill: true, fillOpacity: 8 }, props: ['line', 'fill'] });

  // Horizontal Fibonacci levels in price space, with fills between neighbours.
  const levelsGeom = (pricesAt, x0, x1, d, E, labelOf) => {
    const on = d.levels.filter(l => l.on).sort((p, q) => p.v - q.v), out = [], xs = [d.extL ? 0 : x0, d.extR ? E.W : x1];
    const ys = on.map(l => E.py(pricesAt(l.v)));
    if (d.fill) for (let i = 0; i + 1 < on.length; i++) out.push(PL(box({ x: xs[0], y: ys[i] }, { x: xs[1], y: ys[i + 1] }), { closed: true, fill: true, stroke: false, fillColor: on[i + 1].color }));
    on.forEach((l, i) => {
      out.push(L({ x: xs[0], y: ys[i] }, { x: xs[1], y: ys[i] }, { color: l.color, width: d.width }));
      if (d.labels) out.push(TX(xs[0] + 4, ys[i] - 2, labelOf(l), { align: 'left', base: 'bottom', color: l.color }));
    });
    return out;
  };
  tool('fibret', 'fib', 'Fibonacciho retracement', 'Φ', 2, ([a, b], d, E) => {
    const [p, q] = d.pts, at = v => q.p - (q.p - p.p) * v;
    return [L(a, b, { dash: [4, 4], width: 1, color: '#787b86' }), ...levelsGeom(at, Math.min(a.x, b.x), Math.max(a.x, b.x), d, E, l => `${l.v} (${E.fmt(at(l.v))})`)];
  }, { key: 'Alt+F', defaults: { width: 1, fill: true, fillOpacity: 8, levels: lv(FIB) }, props: ['line', 'ext', 'fill', 'labels', 'levels'] });
  tool('fibext', 'fib', 'Fib. rozšírenie podľa trendu', 'Φ↗', 3, ([a, b, c], d, E) => {
    if (!c) return [L(a, b, { dash: [4, 4], width: 1 })];
    const [p, q, r] = d.pts, at = v => r.p + (q.p - p.p) * v;
    return [L(a, b, { dash: [4, 4], width: 1, color: '#787b86' }), L(b, c, { dash: [4, 4], width: 1, color: '#787b86' }),
            ...levelsGeom(at, c.x, c.x + Math.abs(b.x - a.x), d, E, l => `${l.v} (${E.fmt(at(l.v))})`)];
  }, { defaults: { width: 1, fill: true, fillOpacity: 8, levels: lv(FIB_EXT) }, props: ['line', 'ext', 'fill', 'labels', 'levels'] });
  tool('fibchannel', 'fib', 'Fibonacciho kanál', 'Φ▱', 3, ([a, b, c], d, E) => {
    if (!c) return [L(a, b)];
    const lineY = x => a.y + (b.y - a.y) * (x - a.x) / ((b.x - a.x) || 1e-9), off = { x: 0, y: c.y - lineY(c.x) };
    return d.levels.filter(l => l.on).flatMap(l => [L(add(a, off, l.v), add(b, off, l.v), { color: l.color, extR: d.extR, extL: d.extL }),
      ...(d.labels ? [TX(a.x - 4, a.y + off.y * l.v, String(l.v), { align: 'right', color: l.color })] : [])]);
  }, { defaults: { width: 1, levels: lv(FIB) }, props: ['line', 'ext', 'labels', 'levels'] });
  const vlines = (x0, step, ks, d, E) => ks.flatMap(k => { const x = x0 + step * k; return x < -5 || x > E.W + 5 ? [] : [L({ x, y: 0 }, { x, y: E.H }, { width: 1 }), ...(d.labels ? [TX(x + 3, E.H - 4, String(k), { align: 'left', base: 'bottom' })] : [])]; });
  tool('fibtime', 'fib', 'Fibonacciho časové zóny', '⫼', 2, ([a, b], d, E) => vlines(a.x, b.x - a.x, [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144], d, E), { defaults: { width: 1 }, props: ['line', 'labels'] });
  tool('fibtrendtime', 'fib', 'Fib. čas podľa trendu', '⫼↗', 3, ([a, b, c], d, E) => (c ? [L(a, b, { dash: [4, 4], width: 1 }), L(b, c, { dash: [4, 4], width: 1 }), ...vlines(c.x, b.x - a.x, [0, 0.382, 0.5, 0.618, 1, 1.382, 1.618, 2, 2.382, 2.618, 3, 4.236], d, E)] : [L(a, b)]),
       { defaults: { width: 1 }, props: ['line', 'labels'] });
  tool('fibfan', 'fib', 'Fib. vejár rýchlosti a odporu', 'Φ⊿', 2, ([a, b], d, E) => {
    const ks = [0, 0.25, 0.382, 0.5, 0.618, 0.75, 1], out = [PL(box(a, b), { closed: true, width: 1, dash: [2, 3] })];
    for (const k of ks) {
      out.push(L(a, ray(a, sub({ x: b.x, y: a.y + (b.y - a.y) * k }, a), E), { width: 1 }));
      if (k > 0) out.push(L(a, ray(a, sub({ x: a.x + (b.x - a.x) * k, y: b.y }, a), E), { width: 1 }));
      if (d.labels) out.push(TX(b.x + 4, a.y + (b.y - a.y) * k, String(k), { align: 'left' }));
    }
    return out;
  }, { defaults: { width: 1 }, props: ['line', 'labels'] });
  tool('fibcircles', 'fib', 'Fibonacciho kruhy', '◎', 2, ([a, b], d) => {
    const r = dist(a, b);
    return [L(a, b, { dash: [4, 4], width: 1 }), ...d.levels.filter(l => l.on).flatMap(l => [PL(arc(a.x, a.y, r * l.v, 0, 2 * Math.PI, 72), { closed: true, color: l.color }),
      ...(d.labels ? [TX(a.x + r * l.v + 3, a.y, String(l.v), { align: 'left', color: l.color })] : [])])];
  }, { defaults: { width: 1, levels: lv(FIB_CIRCLE) }, props: ['line', 'labels', 'levels'] });
  tool('fibarcs', 'fib', 'Fib. oblúky rýchlosti a odporu', '◠', 2, ([a, b], d) => {
    const r = dist(a, b), up = a.y < b.y, [a0, a1] = up ? [Math.PI, 2 * Math.PI] : [0, Math.PI];
    return [L(a, b, { dash: [4, 4], width: 1 }), ...d.levels.filter(l => l.on).flatMap(l => [PL(arc(b.x, b.y, r * l.v, a0, a1, 48), { color: l.color }),
      ...(d.labels ? [TX(b.x, b.y + (up ? -1 : 1) * r * l.v - (up ? 3 : -12), String(l.v), { align: 'center', color: l.color })] : [])])];
  }, { defaults: { width: 1, levels: lv(FIB_CIRCLE) }, props: ['line', 'labels', 'levels'] });
  tool('fibspiral', 'fib', 'Fibonacciho špirála', '🌀', 2, ([a, b]) => {
    const r0 = dist(a, b), t0 = Math.atan2(b.y - a.y, b.x - a.x), phi = 1.618034;
    const pts = Array.from({ length: 241 }, (_, i) => { const th = t0 - 4 * Math.PI + i * 6 * Math.PI / 240, r = r0 * phi ** ((th - t0) / (Math.PI / 2)); return { x: a.x + r * Math.cos(th), y: a.y + r * Math.sin(th) }; });
    return [L(a, b, { dash: [4, 4], width: 1 }), PL(pts)];
  }, { defaults: { width: 1 }, props: ['line'] });
  tool('fibwedge', 'fib', 'Fibonacciho klin', '◺', 3, ([a, b, c], d) => {
    if (!c) return [L(a, b)];
    const r = dist(a, b), t1 = Math.atan2(b.y - a.y, b.x - a.x), t2 = Math.atan2(c.y - a.y, c.x - a.x);
    let dt = t2 - t1; while (dt > Math.PI) dt -= 2 * Math.PI; while (dt < -Math.PI) dt += 2 * Math.PI;
    return [L(a, b), L(a, add(a, sub(c, a), r / (dist(a, c) || 1))), ...d.levels.filter(l => l.on).map(l => PL(arc(a.x, a.y, r * l.v, t1, t1 + dt, 32), { color: l.color }))];
  }, { defaults: { width: 1, levels: lv(FIB_CIRCLE) }, props: ['line', 'levels'] });
  tool('pitchfan', 'fib', 'Vejár vidiel', '⋔⊿', 3, ([a, b, c], d, E) => {
    if (!c) return [L(a, b)];
    return [L(b, c, { width: 1 }), ...[0, 0.25, 0.382, 0.5, 0.618, 0.75, 1].map(k => L(a, ray(a, sub(add(b, sub(c, b), k), a), E), { width: 1 }))];
  }, { defaults: { width: 1 }, props: ['line'] });

  const gannGrid = (a, b, d, ks) => {
    const out = [PL(box(a, b), { closed: true, fill: d.fill, stroke: true })];
    for (const k of ks) {
      out.push(L({ x: a.x + (b.x - a.x) * k, y: a.y }, { x: a.x + (b.x - a.x) * k, y: b.y }, { width: 1, dash: [2, 3] }));
      out.push(L({ x: a.x, y: a.y + (b.y - a.y) * k }, { x: b.x, y: a.y + (b.y - a.y) * k }, { width: 1, dash: [2, 3] }));
    }
    out.push(L(a, b, { width: 1 }), L({ x: a.x, y: b.y }, { x: b.x, y: a.y }, { width: 1 }));
    return out;
  };
  tool('gannbox', 'gann', 'Gannov box', '▦', 2, ([a, b], d) => gannGrid(a, b, d, [0.25, 0.382, 0.5, 0.618, 0.75]), { defaults: { width: 1, fill: true, fillOpacity: 6 }, props: ['line', 'fill'] });
  tool('gannsquare', 'gann', 'Gannov štvorec', '▩', 2, ([a, b], d) => {
    const s = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)), q = { x: a.x + Math.sign(b.x - a.x || 1) * s, y: a.y + Math.sign(b.y - a.y || 1) * s };
    const out = gannGrid(a, q, d, [1 / 3, 2 / 3]);
    for (const k of [0.25, 0.5, 0.75]) out.push(L(a, { x: q.x, y: a.y + (q.y - a.y) * k }, { width: 1 }), L(a, { x: a.x + (q.x - a.x) * k, y: q.y }, { width: 1 }));
    return out;
  }, { defaults: { width: 1, fill: true, fillOpacity: 6 }, props: ['line', 'fill'] });
  tool('gannsqfixed', 'gann', 'Gannov štvorec (pevný)', '▩', 2, ([a, b], d) => {
    const s = Math.abs(b.x - a.x), q = { x: a.x + Math.sign(b.x - a.x || 1) * s, y: a.y + Math.sign(b.y - a.y || 1) * s };
    return gannGrid(a, q, d, [0.25, 0.5, 0.75]);
  }, { defaults: { width: 1, fill: true, fillOpacity: 6 }, props: ['line', 'fill'] });
  tool('gannfan', 'gann', 'Gannov vejár', '⊿', 2, ([a, b], d, E) => {
    const dx = b.x - a.x, dy = b.y - a.y, out = [];
    for (const [r, name] of [[1 / 8, '1×8'], [1 / 4, '1×4'], [1 / 3, '1×3'], [1 / 2, '1×2'], [1, '1×1'], [2, '2×1'], [3, '3×1'], [4, '4×1'], [8, '8×1']]) {
      const end = { x: a.x + dx * (r <= 1 ? 1 : 1 / r), y: a.y + dy * (r <= 1 ? r : 1) };
      out.push(L(a, ray(a, sub(end, a), E), { width: 1, color: r === 1 ? undefined : '#787b86' }));
      if (d.labels) out.push(TX(end.x + 3, end.y, name, { align: 'left' }));
    }
    return out;
  }, { defaults: { width: 1 }, props: ['line', 'labels'] });

  const ratio = (x, y) => (y ? Math.abs(x / y).toFixed(3) : '–');
  tool('xabcd', 'patterns', 'XABCD vzor', 'Ⓧ', 5, (P, d) => {
    const out = [PL(P)], names = 'XABCD', pr = d.pts.map(p => p.p);
    if (P.length >= 3) out.unshift(PL(P.slice(0, 3), { closed: true, fill: true, stroke: false }));
    if (P.length >= 5) out.unshift(PL(P.slice(2, 5), { closed: true, fill: true, stroke: false }));
    if (P.length >= 3) out.push(L(P[0], P[2], { dash: [3, 3], width: 1 }), TX(mid(P[0], P[2]).x, mid(P[0], P[2]).y, ratio(pr[2] - pr[1], pr[1] - pr[0]), { bg: true, align: 'center' }));
    if (P.length >= 4) out.push(L(P[1], P[3], { dash: [3, 3], width: 1 }), TX(mid(P[1], P[3]).x, mid(P[1], P[3]).y, ratio(pr[3] - pr[2], pr[2] - pr[1]), { bg: true, align: 'center' }));
    if (P.length >= 5) out.push(L(P[0], P[4], { dash: [3, 3], width: 1 }), TX(mid(P[0], P[4]).x, mid(P[0], P[4]).y, ratio(pr[4] - pr[1], pr[1] - pr[0]), { bg: true, align: 'center' }),
                                L(P[2], P[4], { dash: [3, 3], width: 1 }), TX(mid(P[2], P[4]).x, mid(P[2], P[4]).y, ratio(pr[4] - pr[3], pr[3] - pr[2]), { bg: true, align: 'center' }));
    P.forEach((p, i) => d.labels && out.push(TX(p.x, p.y + (i % 2 ? -10 : 12), names[i], { align: 'center', bg: true })));
    return out;
  }, { defaults: { fill: true, fillOpacity: 12, width: 1 }, props: ['line', 'fill', 'labels'] });
  tool('abcd', 'patterns', 'ABCD vzor', 'Ⓐ', 4, (P, d) => {
    const out = [PL(P)], pr = d.pts.map(p => p.p);
    if (P.length >= 3) out.push(L(P[0], P[2], { dash: [3, 3], width: 1 }), TX(mid(P[0], P[2]).x, mid(P[0], P[2]).y, ratio(pr[2] - pr[1], pr[1] - pr[0]), { bg: true, align: 'center' }));
    if (P.length >= 4) out.push(L(P[1], P[3], { dash: [3, 3], width: 1 }), TX(mid(P[1], P[3]).x, mid(P[1], P[3]).y, ratio(pr[3] - pr[2], pr[2] - pr[1]), { bg: true, align: 'center' }));
    P.forEach((p, i) => d.labels && out.push(TX(p.x, p.y + (i % 2 ? -10 : 12), 'ABCD'[i], { align: 'center', bg: true })));
    return out;
  }, { defaults: { width: 2 }, props: ['line', 'labels'] });
  tool('hs', 'patterns', 'Hlava a ramená', '⩚', 7, (P, d) => {
    const out = [PL(P)];
    if (P.length >= 5) out.push(L(P[2], P[4], { extL: true, extR: true, dash: [4, 3] }));
    if (P.length >= 3) out.unshift(PL(P.slice(0, 3), { closed: true, fill: true, stroke: false }));
    if (P.length >= 5) out.unshift(PL(P.slice(2, 5), { closed: true, fill: true, stroke: false }));
    if (P.length >= 7) out.unshift(PL(P.slice(4, 7), { closed: true, fill: true, stroke: false }));
    const names = ['', 'Ľavé rameno', '', 'Hlava', '', 'Pravé rameno', ''];
    P.forEach((p, i) => d.labels && names[i] && out.push(TX(p.x, p.y - 10, names[i], { align: 'center', bg: true })));
    return out;
  }, { defaults: { fill: true, fillOpacity: 12, width: 1 }, props: ['line', 'fill', 'labels'] });
  tool('elliott', 'patterns', 'Elliottova impulzná vlna', '⑤', 6, (P, d) => {
    const out = [PL(P)];
    P.forEach((p, i) => d.labels && out.push(TX(p.x, p.y + (i % 2 ? -10 : 12), `(${i})`, { align: 'center', bg: true })));
    return out;
  }, { props: ['line', 'labels'] });

  // Long / short position: one click places it (entry, target, stop), the handles adjust it.
  const position = side => (P, d, E) => {
    const [e, tgt, stp] = P, [pe, pt, ps] = d.pts, x1 = Math.max(e.x, tgt.x), x0 = Math.min(e.x, tgt.x);
    const rr = Math.abs(pt.p - pe.p) / (Math.abs(pe.p - ps.p) || 1e-9);
    const pct = v => `${(100 * (v - pe.p) / pe.p).toFixed(2)} %`;
    const out = [PL(box({ x: x0, y: e.y }, { x: x1, y: tgt.y }), { closed: true, fill: true, stroke: false, fillColor: d.profitColor, fillOpacity: d.fillOpacity }),
                 PL(box({ x: x0, y: e.y }, { x: x1, y: stp.y }), { closed: true, fill: true, stroke: false, fillColor: d.lossColor, fillOpacity: d.fillOpacity }),
                 L({ x: x0, y: e.y }, { x: x1, y: e.y }, { color: '#787b86', width: 1 }),
                 L({ x: x0, y: tgt.y }, { x: x1, y: tgt.y }, { color: d.profitColor, width: 1 }), L({ x: x0, y: stp.y }, { x: x1, y: stp.y }, { color: d.lossColor, width: 1 })];
    if (d.labels) {
      const c = (x0 + x1) / 2;
      out.push(TX(c, tgt.y + (side > 0 ? -4 : 14), `Cieľ ${E.fmt(pt.p)} (${pct(pt.p)})`, { align: 'center', bg: true, bgColor: d.profitColor, color: '#fff' }),
               TX(c, stp.y + (side > 0 ? 14 : -4), `Stop ${E.fmt(ps.p)} (${pct(ps.p)})`, { align: 'center', bg: true, bgColor: d.lossColor, color: '#fff' }),
               TX(c, e.y + (side > 0 ? -4 : 14), `${side > 0 ? 'LONG' : 'SHORT'} ${E.fmt(pe.p)} · R:R ${rr.toFixed(2)}`, { align: 'center', bg: true }));
    }
    return out;
  };
  const createPosition = side => (pt, E) => {
    const span = E.priceSpan() * 0.06 || pt.p * 0.002, end = pt.t + 20 * E.barSeconds();
    return [pt, { t: end, p: pt.p + side * 2 * span }, { t: end, p: pt.p - side * span }];
  };
  const keepPosition = (pts, i) => {        // target and stop share the right edge; the entry keeps its side
    if (i === 1 || i === 2) { pts[1].t = pts[2].t = pts[i].t; }
    return pts;
  };
  tool('long', 'positions', 'Long pozícia', '⬈', 1, position(1), { create: createPosition(1), constrain: keepPosition,
       defaults: { profitColor: '#089981', lossColor: '#f23645', fillOpacity: 22, width: 1 }, props: ['position', 'labels'] });
  tool('short', 'positions', 'Short pozícia', '⬊', 1, position(-1), { create: createPosition(-1), constrain: keepPosition,
       defaults: { profitColor: '#089981', lossColor: '#f23645', fillOpacity: 22, width: 1 }, props: ['position', 'labels'] });
  const rangeGeom = (what) => ([a, b], d, E) => {
    const [p, q] = d.pts, dp = q.p - p.p, bars = Math.round(E.bars(p.t, q.t)), lines = [];
    if (what !== 'date') lines.push(`${dp >= 0 ? '+' : ''}${E.fmt(dp)} (${(100 * dp / p.p).toFixed(2)} %)`);
    if (what !== 'price') lines.push(`${bars} sviečok · ${E.duration(q.t - p.t)}`);
    const c = mid(a, b);
    return [PL(box(a, b), { closed: true, fill: true, stroke: false }),
            what !== 'date' ? L({ x: c.x, y: a.y }, { x: c.x, y: b.y }, { width: 1 }) : null, what !== 'date' ? head({ x: c.x, y: a.y }, { x: c.x, y: b.y }, 8) : null,
            what !== 'price' ? L({ x: a.x, y: c.y }, { x: b.x, y: c.y }, { width: 1 }) : null, what !== 'price' ? head({ x: a.x, y: c.y }, { x: b.x, y: c.y }, 8) : null,
            TX(c.x, Math.max(a.y, b.y) + 16, lines.join('  ·  '), { align: 'center', bg: true })].filter(Boolean);
  };
  tool('pricerange', 'positions', 'Cenový rozsah', '↕', 2, rangeGeom('price'), { defaults: { fill: true, fillOpacity: 15, width: 1 }, props: ['line', 'fill'] });
  tool('daterange', 'positions', 'Časový rozsah', '↔', 2, rangeGeom('date'), { defaults: { fill: true, fillOpacity: 15, width: 1 }, props: ['line', 'fill'] });
  tool('measure', 'positions', 'Meranie (cena + čas)', '📏', 2, rangeGeom('both'), { defaults: { fill: true, fillOpacity: 15, width: 1 }, props: ['line', 'fill'] });

  tool('brush', 'brush', 'Štetec', '🖌', 'free', P => [PL(P, { round: true })], { props: ['line'] });
  tool('highlighter', 'brush', 'Zvýrazňovač', '🖍', 'free', P => [PL(P, { round: true })], { defaults: { color: '#ffeb3b', opacity: 35, width: 14 }, props: ['line'] });

  tool('arrowmarker', 'arrows', 'Šípkový ukazovateľ', '➤', 2, ([a, b], d) => {
    const len = dist(a, b) || 1, u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len }, n = { x: -u.y, y: u.x };
    const hl = Math.min(22, len * 0.45), hw = 11, sw = 4, base = add(b, u, -hl);
    return [PL([add(a, n, sw), add(base, n, sw), add(base, n, hw), b, add(base, n, -hw), add(base, n, -sw), add(a, n, -sw)], { closed: true, fill: true, solid: true }),
            ...(d.text ? [TX(a.x - u.x * 8, a.y - u.y * 8 + 4, d.text, { align: u.x > 0 ? 'right' : 'left' })] : [])];
  }, { defaults: { color: '#2962ff' }, props: ['line', 'text'] });
  tool('arrow', 'arrows', 'Šípka', '→', 2, ([a, b], d) => [L(a, b), head(a, b, 10 + d.width * 2)], { props: ['line'] });
  tool('arrowup', 'arrows', 'Značka šípka hore', '⬆', 1, ([a], d) => [PL([{ x: a.x, y: a.y + 2 }, { x: a.x - 9, y: a.y + 16 }, { x: a.x - 4, y: a.y + 16 }, { x: a.x - 4, y: a.y + 26 }, { x: a.x + 4, y: a.y + 26 }, { x: a.x + 4, y: a.y + 16 }, { x: a.x + 9, y: a.y + 16 }], { closed: true, fill: true, solid: true }),
       ...(d.text ? [TX(a.x, a.y + 40, d.text, { align: 'center' })] : [])], { defaults: { color: '#089981' }, props: ['line', 'text'] });
  tool('arrowdown', 'arrows', 'Značka šípka dole', '⬇', 1, ([a], d) => [PL([{ x: a.x, y: a.y - 2 }, { x: a.x - 9, y: a.y - 16 }, { x: a.x - 4, y: a.y - 16 }, { x: a.x - 4, y: a.y - 26 }, { x: a.x + 4, y: a.y - 26 }, { x: a.x + 4, y: a.y - 16 }, { x: a.x + 9, y: a.y - 16 }], { closed: true, fill: true, solid: true }),
       ...(d.text ? [TX(a.x, a.y - 32, d.text, { align: 'center', base: 'bottom' })] : [])], { defaults: { color: '#f23645' }, props: ['line', 'text'] });

  tool('rect', 'shapes', 'Obdĺžnik', '▭', 2, ([a, b], d) => [PL(box(a, b), { closed: true, fill: d.fill }), ...(d.text ? [TX(mid(a, b).x, mid(a, b).y, d.text, { align: 'center' })] : [])],
       { key: 'Alt+Shift+R', defaults: { fill: true, fillOpacity: 15 }, props: ['line', 'fill', 'text'] });
  tool('rotrect', 'shapes', 'Otočený obdĺžnik', '◇', 3, ([a, b, c], d) => {
    if (!c) return [L(a, b)];
    const len = dist(a, b) || 1, n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len }, h = (c.x - a.x) * n.x + (c.y - a.y) * n.y;
    return [PL([a, b, add(b, n, h), add(a, n, h)], { closed: true, fill: d.fill })];
  }, { defaults: { fill: true, fillOpacity: 15 }, props: ['line', 'fill'] });
  tool('path', 'shapes', 'Cesta (so šípkou)', '⤳', 'multi', (P, d) => (P.length > 1 ? [PL(P), head(P[P.length - 2], P[P.length - 1], 10 + d.width * 2)] : []), { props: ['line'] });
  tool('circle', 'shapes', 'Kruh', '◯', 2, ([a, b], d) => [{ t: 'ell', cx: a.x, cy: a.y, rx: dist(a, b), ry: dist(a, b), fill: d.fill }], { defaults: { fill: true, fillOpacity: 15 }, props: ['line', 'fill'] });
  tool('ellipse', 'shapes', 'Elipsa', '⬭', 2, ([a, b], d) => [{ t: 'ell', cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, rx: Math.abs(b.x - a.x) / 2, ry: Math.abs(b.y - a.y) / 2, fill: d.fill }],
       { defaults: { fill: true, fillOpacity: 15 }, props: ['line', 'fill'] });
  tool('polyline', 'shapes', 'Lomená čiara (mnohouholník)', '⬠', 'multi', (P, d) => [PL(P, { closed: P.length > 2, fill: d.fill && P.length > 2 })], { defaults: { fill: true, fillOpacity: 12 }, props: ['line', 'fill'] });
  tool('triangle', 'shapes', 'Trojuholník', '△', 3, (P, d) => [PL(P, { closed: P.length === 3, fill: d.fill && P.length === 3 })], { defaults: { fill: true, fillOpacity: 15 }, props: ['line', 'fill'] });
  tool('arc', 'shapes', 'Oblúk', '◜', 3, ([a, b, c], d) => {
    if (!c) return [L(a, b)];
    const D2 = 2 * (a.x * (c.y - b.y) + c.x * (b.y - a.y) + b.x * (a.y - c.y));
    if (Math.abs(D2) < 1e-6) return [L(a, b)];
    const s = p => p.x * p.x + p.y * p.y;
    const ux = (s(a) * (c.y - b.y) + s(c) * (b.y - a.y) + s(b) * (a.y - c.y)) / D2, uy = (s(a) * (b.x - c.x) + s(c) * (a.x - b.x) + s(b) * (c.x - a.x)) / D2;
    const r = Math.hypot(a.x - ux, a.y - uy), ang = p => Math.atan2(p.y - uy, p.x - ux);
    let t0 = ang(a), t1 = ang(b), tc = ang(c);
    const norm = x => ((x - t0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    if (norm(tc) > norm(t1)) t1 -= 2 * Math.PI; else t1 = t0 + norm(t1);
    return [PL(arc(ux, uy, r, t0, t1, 64), { closed: d.fill, fill: d.fill })];
  }, { defaults: { fill: false, fillOpacity: 15 }, props: ['line', 'fill'] });
  tool('curve', 'shapes', 'Krivka', '∽', 3, ([a, b, c]) => (c ? [PL(bez2(a, c, b))] : [L(a, b)]), { props: ['line'] });
  tool('doublecurve', 'shapes', 'Dvojitá krivka', '∿', 3, ([a, b, c]) => (c ? [PL(bez3(a, c, { x: a.x + b.x - c.x, y: a.y + b.y - c.y }, b))] : [L(a, b)]), { props: ['line'] });

  tool('text', 'text', 'Text', 'T', 1, ([a], d) => [TX(a.x, a.y, d.text || 'Text', { align: 'left', size: d.fontSize, color: d.textColor, bg: d.fill, bgColor: d.fillColor, bgOpacity: d.fillOpacity })],
       { defaults: { text: 'Text', fill: false, fillColor: '#2962ff', fillOpacity: 80 }, props: ['text', 'fill'], askText: true });
  tool('note', 'text', 'Poznámka s odkazom', '💬', 2, ([a, b], d) => [L(a, b, { width: 1 }), { t: 'ell', cx: a.x, cy: a.y, rx: 3, ry: 3, fill: true, solid: true },
       TX(b.x, b.y, d.text || 'Poznámka', { align: 'center', size: d.fontSize, color: d.textColor, bg: true, bgColor: d.fillColor, bgOpacity: d.fillOpacity, pad: 6 })],
       { defaults: { text: 'Poznámka', fillColor: '#2962ff', fillOpacity: 85, width: 1 }, props: ['line', 'text', 'fill'], askText: true });
  tool('pricelabel', 'text', 'Cenová značka', '🏷', 1, ([a], d, E) => [TX(a.x + 6, a.y, E.fmt(d.pts[0].p), { align: 'left', bg: true, bgColor: d.color, color: '#fff', pad: 4 }),
       { t: 'ell', cx: a.x, cy: a.y, rx: 3, ry: 3, fill: true, solid: true }], { props: ['line'] });
  tool('pricenote', 'text', 'Cenová poznámka', '📌', 2, ([a, b], d, E) => [L(a, b, { width: 1 }), TX(b.x + 4, b.y, E.fmt(d.pts[0].p), { align: 'left', bg: true, bgColor: d.color, color: '#fff', pad: 4 })], { props: ['line'] });

  // ---- rendering -----------------------------------------------------------------------------
  const DASHES = (style, w) => [[], [w, w * 1.5], [w * 3, w * 2], [w * 6, w * 3], [w, w * 4]][style] || [];
  function extend(a, b, extL, extR, W) {
    if (!(extL || extR) || a.x === b.x) {
      if (a.x === b.x && (extL || extR)) return [{ x: a.x, y: extL ? -1e4 : a.y }, { x: b.x, y: extR ? 1e4 : b.y }];
      return [a, b];
    }
    const k = (b.y - a.y) / (b.x - a.x), [l, r] = a.x <= b.x ? [a, b] : [b, a];
    return [extL ? { x: 0, y: l.y - k * l.x } : l, extR ? { x: W, y: r.y + k * (W - r.x) } : r];
  }
  function textBox(ctx, p) {
    const size = p.size || 12, lines = String(p.text).split('\n');
    ctx.font = `${size}px -apple-system, system-ui, sans-serif`;
    const w = Math.max(...lines.map(s => ctx.measureText(s).width)), h = lines.length * size * 1.25, pad = p.pad ?? 3;
    let x = p.x; if (p.align === 'center') x -= w / 2; else if (p.align === 'right') x -= w;
    let y = p.y; if (p.base === 'bottom') y -= h; else if (p.base !== 'top') y -= h / 2;
    return { x: x - pad, y: y - pad, w: w + 2 * pad, h: h + 2 * pad, lines, size, pad };
  }
  function drawPrims(ctx, prims, d, W, H, bg) {
    const stroke = (o) => { ctx.strokeStyle = rgba(o.color || d.color, o.opacity ?? d.opacity); ctx.lineWidth = o.width || d.width; ctx.setLineDash(o.dash || DASHES(d.style, o.width || d.width)); };
    for (const p of prims) {
      if (!p) continue;
      ctx.lineJoin = ctx.lineCap = p.round ? 'round' : 'butt';
      if (p.t === 'line') {
        const [a, b] = extend(p.a, p.b, p.extL, p.extR, W);
        stroke(p); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      } else if (p.t === 'poly' && p.pts.length) {
        ctx.beginPath(); p.pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); if (p.closed) ctx.closePath();
        if (p.fill) { ctx.fillStyle = p.solid ? rgba(p.color || d.color, d.opacity) : rgba(p.fillColor || d.fillColor, p.fillOpacity ?? d.fillOpacity); ctx.fill(); }
        if (p.stroke !== false && !p.solid) { stroke(p); ctx.stroke(); }
      } else if (p.t === 'ell') {
        ctx.beginPath(); ctx.ellipse(p.cx, p.cy, Math.max(p.rx, 0.5), Math.max(p.ry, 0.5), 0, 0, 2 * Math.PI);
        if (p.fill) { ctx.fillStyle = p.solid ? rgba(d.color, d.opacity) : rgba(d.fillColor, d.fillOpacity); ctx.fill(); }
        if (!p.solid) { stroke(p); ctx.stroke(); }
      } else if (p.t === 'text') {
        const b = textBox(ctx, p);
        if (p.bg) {
          ctx.fillStyle = p.bgColor ? rgba(p.bgColor, p.bgOpacity ?? 90) : bg;
          ctx.beginPath(); ctx.roundRect ? ctx.roundRect(b.x, b.y, b.w, b.h, 3) : ctx.rect(b.x, b.y, b.w, b.h); ctx.fill();
        }
        ctx.fillStyle = p.color ? rgba(p.color, 100) : rgba(d.textColor || d.color, 100);
        ctx.textBaseline = 'top'; ctx.textAlign = 'left';
        b.lines.forEach((s, i) => ctx.fillText(s, b.x + b.pad, b.y + b.pad + i * b.size * 1.25));
      }
    }
    ctx.setLineDash([]);
  }
  function distSeg(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }
  const inside = (p, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; };
  function hitPrims(p, prims, d, W, ctx) {
    let best = Infinity;
    for (const q of prims) {
      if (!q) continue;
      if (q.t === 'line') { const [a, b] = extend(q.a, q.b, q.extL, q.extR, W); best = Math.min(best, distSeg(p, a, b)); }
      else if (q.t === 'poly') {
        for (let i = 1; i < q.pts.length; i++) best = Math.min(best, distSeg(p, q.pts[i - 1], q.pts[i]));
        if (q.closed && q.pts.length > 2) best = Math.min(best, distSeg(p, q.pts[q.pts.length - 1], q.pts[0]));
        if ((q.fill || q.solid) && q.pts.length > 2 && inside(p, q.pts)) best = 0;
      } else if (q.t === 'ell') {
        const nx = (p.x - q.cx) / (q.rx || 1), ny = (p.y - q.cy) / (q.ry || 1), r = Math.hypot(nx, ny);
        best = Math.min(best, (q.fill && r <= 1) ? 0 : Math.abs(r - 1) * Math.min(q.rx, q.ry));
      } else if (q.t === 'text') {
        const b = textBox(ctx, q);
        if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) best = 0;
      }
    }
    return best;
  }

  // ---- engine --------------------------------------------------------------------------------
  // env: {el, chart(), series(), timeToLogical(t), logicalToTime(l), bars(), fmt(p), priceSpan(), barSeconds(),
  //       onChange(list), toolDefaults(id), saveToolDefaults(id, style), bg(), magnet()}
  function create(env) {
    let list = [], selected = null, mode = null, drag = null, hidden = false, layer = null, keep = false;
    const measureCtx = document.createElement('canvas').getContext('2d');
    const E = {
      get W() { return env.chart() ? env.chart().paneSize(0).width : 0; },
      get H() { return env.chart() ? env.chart().paneSize(0).height : 0; },
      px: pt => ({ x: env.chart().timeScale().logicalToCoordinate(env.timeToLogical(pt.t)), y: env.series().priceToCoordinate(pt.p) }),
      py: p => env.series().priceToCoordinate(p),
      fmt: p => env.fmt(p),
      bars: (t0, t1) => env.timeToLogical(t1) - env.timeToLogical(t0),
      duration: s => { s = Math.abs(s); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min ${Math.round(s % 60)} s`; },
      priceSpan: () => env.priceSpan(), barSeconds: () => env.barSeconds(),
      regression: (t0, t1, dev) => {
        const b = env.bars().filter(x => x.time >= Math.min(t0, t1) && x.time <= Math.max(t0, t1));
        if (b.length < 2) return null;
        const n = b.length, xm = (n - 1) / 2, ym = b.reduce((s, x) => s + x.close, 0) / n;
        let sxy = 0, sxx = 0; b.forEach((x, i) => { sxy += (i - xm) * (x.close - ym); sxx += (i - xm) ** 2; });
        const k = sxy / sxx, a = ym - k * xm, sd = Math.sqrt(b.reduce((s, x, i) => s + (x.close - (a + k * i)) ** 2, 0) / n);
        return { t0: b[0].time, t1: b[n - 1].time, m0: a, m1: a + k * (n - 1), k: dev * sd };
      },
    };
    const styleOf = id => ({ ...BASE, ...(TOOLS[id].defaults || {}), ...(env.toolDefaults(id) || {}) });
    const geomOf = (d, extraPt) => {
      const pts = extraPt ? d.pts.concat([extraPt]) : d.pts;
      const P = pts.map(E.px);
      if (P.some(q => q.x === null || q.y === null || q.x === undefined)) return null;
      try { return TOOLS[d.type].geom(P, { ...d, pts }, E); } catch (e) { return null; }
    };
    class Layer {
      attached(p) { this.p = p; } detached() { this.p = null; }
      update() { if (this.p) this.p.requestUpdate(); }
      updateAllViews() {}
      paneViews() { return [{ zOrder: () => 'top', renderer: () => ({ draw: target => this.draw(target) }) }]; }
      draw(target) {
        if (!this.p) return;
        target.useMediaCoordinateSpace(({ context: ctx, mediaSize: ms }) => {
          const bg = env.bg();
          for (const d of list) {
            if (hidden || d.hidden) continue;
            const g = geomOf(d);
            if (g) drawPrims(ctx, g, d, ms.width, ms.height, bg);
            if (d === selected) handles(ctx, d);
          }
          if (mode && mode.d && mode.d.pts.length) {
            const g = geomOf(mode.d, mode.free ? null : mode.hover);
            if (g) drawPrims(ctx, g, mode.d, ms.width, ms.height, bg);
            handles(ctx, mode.d);
          }
        });
      }
    }
    function handles(ctx, d) {
      if (TOOLS[d.type].n === 'free') return;
      for (const pt of d.pts) {
        const q = E.px(pt);
        if (q.x === null || q.y === null) continue;
        ctx.beginPath(); ctx.arc(q.x, q.y, 5, 0, 2 * Math.PI);
        ctx.fillStyle = env.bg(); ctx.fill(); ctx.strokeStyle = rgba(d.color, 100); ctx.lineWidth = 2; ctx.setLineDash([]); ctx.stroke();
      }
    }
    const redraw = () => layer && layer.update();
    const changed = () => { env.onChange(list.filter(d => !d.temp)); redraw(); bar(); };

    // mouse position -> {t, p}, with the magnet
    function pointAt(x, y) {
      const ch = env.chart(), s = env.series();
      const l = ch.timeScale().coordinateToLogical(x), p = s.coordinateToPrice(y);
      if (l === null || p === null) return null;
      const mag = env.magnet(), bars = env.bars();
      if (mag !== 'off' && bars.length) {
        const i = Math.max(0, Math.min(bars.length - 1, Math.round(l))), b = bars[i];
        const cands = mag === 'close' ? [b.close] : mag === 'hl' ? [b.high, b.low] : [b.open, b.high, b.low, b.close];
        const best = cands.reduce((m, c) => (Math.abs(s.priceToCoordinate(c) - y) < Math.abs(s.priceToCoordinate(m) - y) ? c : m), cands[0]);
        if (mag !== 'weak' || Math.abs(s.priceToCoordinate(best) - y) < 18) return { t: b.time, p: best };
      }
      return { t: env.logicalToTime(l), p };
    }
    function hit(x, y) {
      if (!env.chart() || y > E.H || hidden) return null;
      const P = { x, y };
      for (const d of [...list].reverse()) {                    // the top-most first
        if (d.hidden) continue;
        if (TOOLS[d.type].n !== 'free') {
          const i = d.pts.findIndex(pt => { const q = E.px(pt); return q.x !== null && Math.hypot(q.x - x, q.y - y) <= 7; });
          if (i >= 0) return { d, part: i };
        }
        const g = geomOf(d);
        if (g && hitPrims(P, g, d, E.W, measureCtx) <= Math.max(5, d.width + 3)) return { d, part: 'all' };
      }
      return null;
    }
    function select(d) { selected = d; redraw(); bar(); }

    function start(id) {
      if (!TOOLS[id]) return;
      cancel();
      mode = { tool: TOOLS[id], free: TOOLS[id].n === 'free', d: { id: `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, type: id, pts: [], ...JSON.parse(JSON.stringify(styleOf(id))) } };
      env.el.classList.add('drawing');
      env.hint(mode.free ? `${mode.tool.name}: ťahaj myšou · Esc = zrušiť` : `${mode.tool.name}: klikni na bod 1${mode.tool.n === 'multi' ? ' · dvojklik / Enter = koniec' : ''} · Esc = zrušiť`);
      env.onMode(id);
      select(null);
    }
    function finish() {
      if (!mode) return;
      const d = mode.d, t = mode.tool;
      const okCount = t.n === 'multi' ? d.pts.length >= 2 : t.n === 'free' ? d.pts.length >= 2 : d.pts.length >= (t.create ? 3 : t.n);
      mode = null;
      env.el.classList.remove('drawing'); env.hint(''); env.onMode(null);
      if (okCount) { list.push(d); select(d); changed(); if (t.askText) openSettings(d, 'text'); if (keep) start(t.id); }
      redraw();
    }
    function cancel() {
      if (!mode) return;
      if ((mode.tool.n === 'multi') && mode.d.pts.length >= 2) { finish(); return; }
      mode = null; env.el.classList.remove('drawing'); env.hint(''); env.onMode(null); redraw();
    }
    function addPoint(pt) {
      const t = mode.tool, d = mode.d;
      if (t.create) { d.pts = t.create(pt, E); finish(); return; }
      d.pts.push(pt);
      if (typeof t.n === 'number' && d.pts.length >= t.n) finish();
      else env.hint(`${t.name}: klikni na bod ${d.pts.length + 1}${t.n === 'multi' ? ' · dvojklik / Enter = koniec' : ''} · Esc = zrušiť`);
      redraw();
    }

    // ---- pointer handling on the chart element (capture: the chart must not pan while we work) ----
    const rel = e => { const b = env.el.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
    const inPane = ({ x, y }) => env.chart() && x >= 0 && x < E.W && y >= 0 && y < E.H;
    const ignore = e => e.target.closest('.no-chart');
    let downAt = null;
    env.el.addEventListener('pointerdown', e => {
      if (!env.chart() || e.button !== 0 || ignore(e)) return;
      const q = rel(e); downAt = q;
      if (mode && mode.free && inPane(q)) {
        e.stopPropagation(); e.preventDefault();
        const pt = pointAt(q.x, q.y); if (pt) mode.d.pts = [pt];
        drag = { free: true }; return;
      }
      if (mode) return;
      const h = hit(q.x, q.y);
      if (!h || h.d.locked) { if (h) select(h.d); return; }
      e.stopPropagation(); e.preventDefault();
      select(h.d);
      drag = { ...h, start: pointAt(q.x, q.y), orig: JSON.parse(JSON.stringify(h.d.pts)), moved: false };
    }, true);
    window.addEventListener('pointermove', e => {
      if (!env.chart()) return;
      const q = rel(e);
      if (drag && drag.free && mode) {
        const pt = pointAt(q.x, q.y), last = mode.d.pts[mode.d.pts.length - 1];
        if (pt && (!last || Math.hypot(E.px(last).x - q.x, E.px(last).y - q.y) > 2)) { mode.d.pts.push(pt); redraw(); }
        return;
      }
      if (mode && !mode.free && inPane(q)) { mode.hover = pointAt(q.x, q.y); redraw(); return; }
      if (!drag || !drag.start) return;
      const pt = pointAt(q.x, q.y);
      if (!pt) return;
      drag.moved = true;
      const d = drag.d;
      if (drag.part === 'all') {
        const dt = pt.t - drag.start.t, dp = pt.p - drag.start.p;
        d.pts = drag.orig.map(o => ({ t: o.t + dt, p: o.p + dp }));
      } else {
        d.pts[drag.part] = pt;
        if (TOOLS[d.type].constrain) d.pts = TOOLS[d.type].constrain(d.pts, drag.part);
      }
      redraw();
      if (d.onMove) d.onMove(d);
    });
    window.addEventListener('pointerup', () => {
      if (!drag) return;
      if (drag.free) { drag = null; finish(); return; }
      if (drag.moved) changed();
      setTimeout(() => { drag = null; }, 0);
    });
    env.el.addEventListener('click', e => {
      if (!env.chart() || ignore(e)) return;
      const q = rel(e);
      if (downAt && Math.hypot(q.x - downAt.x, q.y - downAt.y) > 4) return;      // a pan, not a click
      if (drag && drag.moved) return;
      if (mode && !mode.free) { if (inPane(q)) { const pt = pointAt(q.x, q.y); if (pt) addPoint(pt); } return; }
      if (mode) return;
      const h = inPane(q) ? hit(q.x, q.y) : null;
      select(h ? h.d : null);
    }, true);
    env.el.addEventListener('dblclick', e => {
      if (!env.chart() || ignore(e)) return;
      if (mode && mode.tool.n === 'multi') { e.stopPropagation(); mode.d.pts.pop(); finish(); return; }
      const q = rel(e), h = hit(q.x, q.y);
      if (h) { e.stopPropagation(); select(h.d); openSettings(h.d); }
    }, true);

    function key(e) {
      const typing = e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (e.key === 'Escape') { if (mode) { cancel(); return true; } if (selected) { select(null); return true; } return false; }
      if (e.key === 'Enter' && mode && mode.tool.n === 'multi') { finish(); return true; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected && !typing) { remove(selected); return true; }
      if (e.altKey && !typing) {
        const combo = `Alt+${e.shiftKey ? 'Shift+' : ''}${e.code.replace('Key', '')}`;
        const t = Object.values(TOOLS).find(x => x.key === combo);
        if (t) { start(t.id); return true; }
      }
      return false;
    }
    function remove(d) { list = list.filter(x => x !== d); if (selected === d) selected = null; changed(); }
    function clone(d) {
      const c = JSON.parse(JSON.stringify(d)); c.id = `d${Date.now().toString(36)}`;
      const sh = 5 * env.barSeconds(); c.pts = c.pts.map(p => ({ t: p.t + sh, p: p.p })); delete c.locked;
      list.push(c); select(c); changed();
    }

    // ---- floating bar for the selected drawing ------------------------------------------------------
    function bar() {
      const b = env.bar;
      if (!selected || !list.includes(selected)) { b.classList.remove('open'); return; }
      const d = selected, t = TOOLS[d.type], hasFill = (t.props || []).includes('fill'), hasText = (t.props || []).includes('text');
      b.innerHTML = `<span class="db-name">${esc(t.name)}</span>${swatch('line', d.color, d.opacity)}${hasFill ? swatch('fill', d.fillColor, d.fillOpacity) : ''}
        ${hasText ? '<button class="ib" data-a="text" title="Text">T</button>' : ''}<button class="ib" data-a="cfg" title="Nastavenia (dvojklik)">⚙</button>
        <button class="ib" data-a="lock" title="${d.locked ? 'Odomknúť' : 'Zamknúť'}">${d.locked ? '🔒' : '🔓'}</button>
        <button class="ib" data-a="clone" title="Kopírovať">⧉</button><button class="ib" data-a="del" title="Zmazať (Delete)">🗑</button>`;
      b.classList.add('open');
      $('[data-sw=line]', b).onclick = e => colorPopover(e.currentTarget, d, { width: true, style: true }, changed);
      if (hasFill) $('[data-sw=fill]', b).onclick = e => colorPopover(e.currentTarget, d, {}, changed, { color: 'fillColor', opacity: 'fillOpacity' });
      $$('[data-a]', b).forEach(x => x.onclick = () => {
        const a = x.dataset.a;
        if (a === 'cfg') openSettings(d); else if (a === 'text') openSettings(d, 'text');
        else if (a === 'lock') { d.locked = !d.locked; changed(); } else if (a === 'clone') clone(d); else if (a === 'del') remove(d);
      });
    }

    // ---- settings dialog --------------------------------------------------------------------------
    function openSettings(d, tab0) {
      const t = TOOLS[d.type], props = t.props || [], before = JSON.stringify(d);
      let tab = tab0 || (props.includes('levels') ? 'st' : 'st');
      const tabs = [['st', 'Štýl'], ...(props.includes('text') ? [['text', 'Text']] : []), ...(props.includes('levels') ? [['lv', 'Úrovne']] : []), ['xy', 'Súradnice']];
      const cb = (k, on, label) => `<label class="ctl"><input type="checkbox" data-k="${k}" ${on ? 'checked' : ''}> ${label}</label>`;
      const body = () => {
        if (tab === 'text') return `<textarea data-k="text" rows="4" class="ta">${esc(d.text)}</textarea>
          <div class="fld"><span>Farba textu</span>${swatch('text', d.textColor, 100)}</div>
          <div class="fld"><span>Veľkosť písma</span><select data-k="fontSize">${opts([10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 40].map(v => [v + ' px', v]), d.fontSize)}</select></div>`;
        if (tab === 'lv') return d.levels.map((l, i) => `<div class="fld"><label class="ctl"><input type="checkbox" data-lv="${i}" ${l.on ? 'checked' : ''}>
          <input type="number" step="0.001" data-lvv="${i}" value="${l.v}" class="num"></label>${swatch('lv' + i, l.color, 100)}</div>`).join('') +
          `<button class="btn" data-addlv>＋ úroveň</button>`;
        if (tab === 'xy') return d.pts.map((p, i) => `<div class="fld"><span>Bod ${i + 1} · ${esc(env.fmtTime(p.t))}</span><input type="number" step="any" data-pt="${i}" value="${+p.p.toFixed(6)}" class="num"></div>`).join('');
        let h = '';
        if (props.includes('line')) h += `<div class="fld"><span>Čiara</span><span class="ctl">${swatch('line', d.color, d.opacity)}
          <select data-k="width" class="sm">${opts([1, 2, 3, 4, 6, 8, 12, 16].map(v => [v + ' px', v]), d.width)}</select>
          <select data-k="style" class="sm">${opts([['━ plná', 0], ['┈ bodky', 1], ['╌ čiarky', 2], ['— dlhé', 3]], d.style)}</select></span></div>`;
        if (props.includes('position')) h += `<div class="fld"><span>Zisk</span>${swatch('profit', d.profitColor, d.fillOpacity)}</div><div class="fld"><span>Strata</span>${swatch('loss', d.lossColor, d.fillOpacity)}</div>`;
        if (props.includes('fill')) h += `<div class="fld">${cb('fill', d.fill, 'Výplň / pozadie')}${swatch('fill', d.fillColor, d.fillOpacity)}</div>`;
        if (props.includes('ext')) h += `<div class="fld">${cb('extL', d.extL, 'Predĺžiť doľava')}</div><div class="fld">${cb('extR', d.extR, 'Predĺžiť doprava')}</div>`;
        if (props.includes('labels')) h += `<div class="fld">${cb('labels', d.labels, 'Popisy')}</div>`;
        if (props.includes('dev')) h += `<div class="fld"><span>Odchýlka (σ)</span><input type="number" step="0.1" data-k="dev" value="${d.dev}" class="num"></div>`;
        return h || '<div class="muted">Tento nástroj nemá ďalšie nastavenia.</div>';
      };
      const cancel = () => { Object.assign(d, JSON.parse(before)); changed(); closeDialog(); };
      const paint = () => {
        const el = openDialog(`<div class="dlg-h"><span>${esc(t.name)}</span><button class="ib" data-cancel>✕</button></div>
          <div class="dlg-b"><div class="tabs">${tabs.map(([k, n]) => `<span class="tab ${tab === k ? 'on' : ''}" data-tab="${k}">${n}</span>`).join('')}</div>${body()}</div>
          <div class="dlg-f"><button class="btn" data-def>Uložiť ako predvolené</button><span class="grow"></span><button class="btn" data-cancel>Zrušiť</button><button class="btn pri" data-ok>OK</button></div>`, cancel);
        $$('[data-tab]', el).forEach(x => x.onclick = () => { tab = x.dataset.tab; paint(); });
        $$('[data-k]', el).forEach(x => x.addEventListener(x.tagName === 'TEXTAREA' ? 'input' : 'change', () => {
          const k = x.dataset.k; d[k] = x.type === 'checkbox' ? x.checked : x.tagName === 'TEXTAREA' ? x.value : +x.value; changed();
        }));
        const sw = (k, st, o, keys) => { const b = $(`[data-sw="${k}"]`, el); if (keys && keys.opacity && st[keys.opacity] === undefined) st[keys.opacity] = 100; if (b) b.onclick = e => colorPopover(e.currentTarget, st, o, changed, keys); };
        sw('line', d, { width: true, style: true });
        sw('fill', d, {}, { color: 'fillColor', opacity: 'fillOpacity' });
        sw('text', d, {}, { color: 'textColor', opacity: '_to' });
        sw('profit', d, {}, { color: 'profitColor', opacity: 'fillOpacity' });
        sw('loss', d, {}, { color: 'lossColor', opacity: 'fillOpacity' });
        (d.levels || []).forEach((l, i) => sw('lv' + i, l, {}, { opacity: '_o' }));
        $$('[data-lv]', el).forEach(x => x.onchange = () => { d.levels[+x.dataset.lv].on = x.checked; changed(); });
        $$('[data-lvv]', el).forEach(x => x.onchange = () => { d.levels[+x.dataset.lvv].v = +x.value; changed(); });
        $$('[data-pt]', el).forEach(x => x.onchange = () => { d.pts[+x.dataset.pt].p = +x.value; changed(); });
        const al = $('[data-addlv]', el); if (al) al.onclick = () => { d.levels.push({ v: 1.272, color: '#2962ff', on: true }); changed(); paint(); };
        $('[data-def]', el).onclick = () => {
          const st = {}; for (const k of Object.keys(BASE).concat(['levels', 'profitColor', 'lossColor', 'dev'])) if (k in d && k !== 'text') st[k] = JSON.parse(JSON.stringify(d[k]));
          env.saveToolDefaults(d.type, st); UI.toast(`Uložené ako predvolené pre „${t.name}“`);
        };
        $$('[data-cancel]', el).forEach(x => x.onclick = cancel);
        $('[data-ok]', el).onclick = closeDialog;
        const ta = $('textarea', el); if (ta && tab === 'text') { ta.focus(); ta.select(); }
      };
      paint();
    }

    return {
      TOOLS, GROUPS,
      attach(series) { layer = new Layer(); series.attachPrimitive(layer); },
      setList(l) { list = (l || []).map(d => ({ ...BASE, ...(TOOLS[d.type] && TOOLS[d.type].defaults), ...d })).filter(d => TOOLS[d.type]); selected = null; bar(); redraw(); },
      list: () => list,
      add(d) { list.push(d); redraw(); return d; },
      removeTemp() { list = list.filter(d => !d.temp); redraw(); },
      redraw, start, cancel, key, select, remove, removeAll() { list = list.filter(d => d.temp); select(null); changed(); },
      get mode() { return mode && mode.tool.id; },
      get keep() { return keep; }, set keep(v) { keep = v; },
      get hidden() { return hidden; }, set hidden(v) { hidden = v; select(null); redraw(); },
      lockAll(v) { list.forEach(d => { d.locked = v; }); changed(); },
      hitAt: (x, y) => hit(x, y), openSettings: d => { select(d); openSettings(d); },
      styleOf,
    };
  }
  return { create, TOOLS, GROUPS };
})();
