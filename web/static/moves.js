// Market moves and signals, shared by the chart (Buy / Sell scanner), Nexus Overgrown Lab and the Script robots.
// verdict(): one BUY / SELL / NEUTRAL number per chart. moves(): where buyers or sellers stepped in – a break of a trendline,
// a level, a range (BOS) or of the swing structure – and how far, how fast and on how much volume price went after it.
// Nothing looks ahead: a trigger at bar i uses bars <= i; its follow-through uses the bars after it.
// D = {t, o, h, l, c, v, bv} arrays, oldest first (closed bars).

const MV = (() => {
  const fin = Number.isFinite, r2 = x => (fin(x) ? Math.round(x * 100) / 100 : null);
  const avg = a => { let s = 0, n = 0; for (const x of a) if (fin(x)) { s += x; n++; } return n ? s / n : NaN; };
  const toD = bars => ({ t: bars.map(b => b.time), o: bars.map(b => b.open), h: bars.map(b => b.high), l: bars.map(b => b.low), c: bars.map(b => b.close),
    v: bars.map(b => b.volume || 0), bv: bars.map(b => b.buy ?? NaN) });
  const slice = (D, n) => { const o = {}; for (const k in D) o[k] = Array.isArray(D[k]) ? D[k].slice(0, n) : D[k]; return o; };

  // ---- one verdict: technical ratings 35 %, trend EMA 50/200 20 %, MACD 20 %, RSI 10 %, a fresh live idea 15 % ---------
  function verdict(D, tf, o = {}) {
    const n = D.c.length, i = n - 1, c = D.c[i], atr = KS.atr(D, 14)[i], why = [];
    const add = (v, w, txt) => { why.push({ v, txt }); return v * w; };
    const ta = TA.compute(D).groups.sum, e50 = KS.ema(D.c, 50)[i], e200 = KS.ema(D.c, 200)[i], m = KS.macd(D.c, 12, 26, 9), r = KS.rsi(D.c, 14)[i];
    let sc = add(ta.r, 0.35, `Technicals: ${TA.SK[ta.label] || ta.label} (${ta.buy}× nákup, ${ta.sell}× predaj)`);
    const tr = c > e50 && e50 > e200 ? 1 : c < e50 && e50 < e200 ? -1 : 0;
    sc += add(tr, 0.2, tr > 0 ? 'Trend hore: cena > EMA 50 > EMA 200' : tr < 0 ? 'Trend dole: cena < EMA 50 < EMA 200' : 'Bez jasného trendu (EMA 50 / 200)');
    const h = m.hist[i], h1 = m.hist[i - 1], mv = h >= 0 ? (h >= h1 ? 1 : 0.3) : (h <= h1 ? -1 : -0.3);
    sc += add(mv, 0.2, `MACD histogram ${h >= 0 ? 'nad' : 'pod'} nulou a ${Math.abs(h) >= Math.abs(h1) ? 'silnie' : 'slabne'}`);
    const rv = r > 70 ? -0.5 : r < 30 ? 0.5 : (r - 50) / 40;
    sc += add(rv, 0.1, `RSI ${r.toFixed(0)}${r > 70 ? ' – prekúpené' : r < 30 ? ' – prepredané' : ''}`);
    let idea = null;
    try { const R = TL.run(D, { k: TL.zigK(tf, o.tfSec || 3600) }); idea = TL.ideas(D, R, o.ideas || {}).filter(x => x.i >= n - 4).sort((a, b) => (b.score || 0) - (a.score || 0))[0] || null; } catch (e) {}
    if (idea) sc += add(idea.dir, 0.15, `Nápad: ${idea.name} ${'★'.repeat(idea.score || 0)}`);
    const dir = sc >= 0.2 ? 1 : sc <= -0.2 ? -1 : 0, own = idea && idea.dir === dir;
    return { dir, score: sc, entry: c, atr, why, idea: idea ? idea.name : null, rsi: r, hist: h,
      sl: own && idea.sl ? idea.sl : c - (dir || 1) * 1.5 * atr, tp: own && idea.tp ? idea.tp : c + (dir || 1) * 3 * atr };
  }

  // ---- triggers: where one side stepped in ----------------------------------------------------------------------
  // TL / level breaks from autotl.js, range breaks (BOS) from struct.js, and breaks of the zigzag structure: a close above the
  // last swing high after a lower high (buyers take over) or below the last swing low after a higher low (sellers take over).
  const TRIG = { TL_BREAK_UP: 'Prieraz trendovej čiary nahor', TL_BREAK_DOWN: 'Prieraz trendovej čiary nadol', SR_BREAK_UP: 'Prieraz úrovne nahor',
    SR_BREAK_DOWN: 'Prieraz úrovne nadol', RANGE_UP: 'Prieraz range nahor (BOS)', RANGE_DOWN: 'Prieraz range nadol (BOS)', BOS_UP: 'Zlom štruktúry nahor', BOS_DOWN: 'Zlom štruktúry nadol' };
  function triggers(D, tf, tfSec, R) {
    const out = [], n = D.c.length, atr = R ? R.atr : KS.atr(D, 14);
    if (R) for (const e of R.events) if (/BREAK/.test(e.signal)) out.push({ i: e.i, dir: e.dir, kind: e.signal, what: e.what });
    try { for (const g of ST.ranges(D, { minLen: 12, maxAtr: 3.5, minTests: 2 })) if (g.brk) out.push({ i: g.i1, dir: g.brk, kind: g.brk > 0 ? 'RANGE_UP' : 'RANGE_DOWN', what: 'range', len: g.i1 - g.i0 }); } catch (e) {}
    const piv = TL.zigzag(D.h, D.l, atr, TL.zigK(tf, tfSec) || 2.5);
    let lastH = null, lastL = null, prevH = null, prevL = null, k = 0;
    for (let i = 0; i < n; i++) {
      while (k < piv.length && piv[k].conf <= i) { const p = piv[k++]; if (p.kind === 'H') { prevH = lastH; lastH = p; } else { prevL = lastL; lastL = p; } }
      if (!fin(atr[i])) continue;
      if (lastH && prevH && lastH.price < prevH.price && D.c[i] > lastH.price + 0.1 * atr[i] && D.c[i - 1] <= lastH.price + 0.1 * atr[i]) out.push({ i, dir: 1, kind: 'BOS_UP', what: 'structure', level: lastH.price });
      if (lastL && prevL && lastL.price > prevL.price && D.c[i] < lastL.price - 0.1 * atr[i] && D.c[i - 1] >= lastL.price - 0.1 * atr[i]) out.push({ i, dir: -1, kind: 'BOS_DOWN', what: 'structure', level: lastL.price });
    }
    // one trigger per bar and side (the strongest name wins)
    const seen = new Set();
    return out.sort((a, b) => a.i - b.i).filter(x => { const key = x.i + '|' + x.dir; if (seen.has(key)) return false; seen.add(key); return true; });
  }

  // ---- follow-through: from the trigger bar until price gives back half of the run (or 80 bars) --------------------
  function follow(D, atr, i, dir, maxBars = 80) {
    const n = D.c.length, c0 = D.c[i];
    let ext = c0, jx = i, j = i + 1;
    for (; j < n && j <= i + maxBars; j++) {
      const hi = dir > 0 ? D.h[j] : -D.l[j];
      if (hi > dir * ext) { ext = dir > 0 ? D.h[j] : D.l[j]; jx = j; }
      const run = (ext - c0) * dir, back = (ext - (dir > 0 ? D.l[j] : D.h[j])) * dir;
      if (run > atr[i] && back > 0.5 * run) break;
      if (run <= 0 && (c0 - (dir > 0 ? D.l[j] : D.h[j])) * dir > 1.5 * atr[i]) break;     // went the other way at once
    }
    return { ext, jx, bars: jx - i, end: Math.min(n - 1, j), live: j >= n || jx >= n - 3 };
  }

  // ---- moves: triggers with their follow-through, volume, buyer / seller force and sharpness -----------------------
  // o: {tf, tfSec, digits, minAtr (default 3), minPips, R (TL.run result to reuse)}
  function moves(D, o = {}) {
    const n = D.c.length, tfSec = o.tfSec || 3600, R = o.R || TL.run(D, { k: TL.zigK(o.tf, tfSec) }), atr = R.atr || KS.atr(D, 14);
    const pip = 10 ** -(o.digits ?? 2), out = [];
    for (const g of triggers(D, o.tf, tfSec, R)) {
      const i = g.i, a = atr[i]; if (!(a > 0) || i < 21) continue;
      const f = follow(D, atr, i, g.dir), run = (f.ext - D.c[i]) * g.dir;
      const vPrev = avg(D.v.slice(i - 20, i)), vRun = avg(D.v.slice(i, f.jx + 1));
      let buy = 0, tot = 0; for (let j = i; j <= f.jx; j++) if (fin(D.bv[j]) && D.v[j] > 0) { buy += D.bv[j]; tot += D.v[j]; }
      const delta = tot ? (2 * buy - tot) / tot : null;           // −1 … +1: sellers … buyers
      const moveAtr = run / a, speed = moveAtr / Math.max(1, f.bars), volX = vPrev > 0 ? vRun / vPrev : null;
      // force: how far × how fast × volume × one-sidedness of the trades (0 … 5 stars)
      const force = Math.max(0, moveAtr) * Math.min(2, 0.5 + speed) * Math.min(2, 0.6 + (volX || 1) * 0.4) * (1 + Math.max(0, (delta ?? 0) * g.dir));
      const m = { ...g, t: D.t[i], price: D.c[i], ext: f.ext, tExt: D.t[f.jx], bars: f.bars, minutes: Math.round(f.bars * tfSec / 60), live: f.live,
        pips: Math.round(run / pip), moveAtr: r2(moveAtr), speed: r2(speed), volX: r2(volX), delta: delta === null ? null : Math.round(100 * delta), force: r2(force),
        stars: Math.max(0, Math.min(5, Math.round(force / 2))), name: TRIG[g.kind] || g.kind, sharp: speed >= 0.6 ? 'prudký' : speed >= 0.3 ? 'rýchly' : 'pomalý' };
      out.push(m);
    }
    const minAtr = o.minAtr ?? 3, minPips = o.minPips || 0;
    const big = out.filter(m => m.moveAtr >= minAtr && m.pips >= minPips);
    // starting now: a trigger in the last 3 bars that already runs ≥ 0.5 ATR in its direction, preferably on volume
    const starting = out.filter(m => n - 1 - m.i <= 3 && m.moveAtr >= 0.5).map(m => ({ ...m, strong: (m.volX || 0) >= 1.3 }));
    return { all: out, moves: big, starting, R };
  }

  // ---- trend of one timeframe: zigzag structure + EMA 50 / 200 + active trendlines -----------------------------------
  function trend(D, R) {
    const n = D.c.length, i = n - 1, c = D.c[i], e50 = KS.ema(D.c, 50)[i], e200 = KS.ema(D.c, 200)[i];
    const st = R && R.trend ? R.trend[i] || 0 : 0, ema = c > e50 && e50 > e200 ? 1 : c < e50 && e50 < e200 ? -1 : 0;
    const act = R ? R.lines.filter(x => x.ended == null) : [], sup = act.filter(x => x.kind === 'sup').length, res = act.filter(x => x.kind === 'res').length;
    const score = 0.5 * st + 0.35 * ema + 0.15 * Math.sign(sup - res);
    return { dir: score >= 0.3 ? 1 : score <= -0.3 ? -1 : 0, score: r2(score), structure: st, ema, sup, res };
  }

  return { verdict, triggers, follow, moves, trend, toD, slice, TRIG };
})();
