// NOL strategy: RSI / MACD, divergences, similar situations from the past (on every timeframe) and a scalp plan
// built from all timeframes at once – the slow ones (30m+) give the trend, 1m–15m the setup (a divergence, a pattern
// that used to go one way, a trendline at hand), the second charts the momentum that has to agree before an entry.
// Nothing looks ahead: a divergence appears when its zigzag pivot is confirmed, a past match only counts with its outcome closed.
// D = {t, o, h, l, c, v, bv} arrays, oldest first.

const SG = (() => {
  const fin = Number.isFinite, r2 = x => (fin(x) ? Math.round(x * 100) / 100 : null);
  const L = 24, H = 12;               // a pattern = the last 24 bars, its outcome = the 12 bars after it

  function osc(D) {
    const m = KS.macd(D.c, 12, 26, 9);
    return { rsi: KS.rsi(D.c, 14), macd: m.macd, sig: m.signal, hist: m.hist, atr: KS.atr(D, 14) };
  }

  // regular divergence: price makes a higher high (lower low) and RSI or MACD does not → a reversal
  // hidden divergence: price makes a higher low (lower high) and the oscillator a lower low (higher high) → the trend goes on
  function divergences(D, O, k) {
    const piv = TL.zigzag(D.h, D.l, O.atr, k), out = [], last = { H: null, L: null };
    for (const p of piv) {
      const q = last[p.kind]; last[p.kind] = p;
      if (!q || p.idx - q.idx > 150 || p.idx - q.idx < 4) continue;
      const dr = O.rsi[p.idx] - O.rsi[q.idx], dm = O.macd[p.idx] - O.macd[q.idx], tol = 0.05 * O.atr[p.idx];
      if (!fin(dr) || !fin(dm) || !fin(tol)) continue;
      const hi = p.kind === 'H', up = p.price > q.price, oscUp = [], oscDn = [];
      if (dr > 2) oscUp.push('RSI'); if (dr < -2) oscDn.push('RSI');
      if (dm > tol) oscUp.push('MACD'); if (dm < -tol) oscDn.push('MACD');
      let dir = 0, kind = null, by = [];
      if (hi && up && oscDn.length) [dir, kind, by] = [-1, 'reg', oscDn];
      else if (!hi && !up && oscUp.length) [dir, kind, by] = [1, 'reg', oscUp];
      else if (!hi && up && oscDn.length) [dir, kind, by] = [1, 'hid', oscDn];
      else if (hi && !up && oscUp.length) [dir, kind, by] = [-1, 'hid', oscUp];
      if (dir) out.push({ i: p.conf, idx: p.idx, i0: q.idx, p0: q.price, price: p.price, t: D.t[p.idx], t0: D.t[q.idx], dir, kind, by, rsi: Math.round(O.rsi[p.idx]) });
    }
    return { list: out, piv };
  }

  // momentum at bar i: MACD histogram side and slope, the last 10 bars, RSI above / below 50
  function momentum(D, O, i = D.c.length - 1) {
    const a = O.atr[i], h = O.hist; if (!(a > 0) || !fin(h[i]) || !fin(h[i - 3])) return { dir: 0, score: 0 };
    const slope = (h[i] - h[i - 3]) / a, run = (D.c[i] - D.c[Math.max(0, i - 10)]) / a, r = O.rsi[i];
    let since = 0; while (since < 30 && i - since - 1 >= 0 && Math.sign(h[i - since - 1]) === Math.sign(h[i])) since++;
    const s = 0.35 * Math.sign(slope) * Math.min(1, Math.abs(slope) * 5) + 0.25 * Math.sign(h[i]) + 0.25 * Math.max(-1, Math.min(1, run / 2)) + 0.15 * Math.max(-1, Math.min(1, (r - 50) / 20));
    return { dir: s >= 0.3 ? 1 : s <= -0.3 ? -1 : 0, score: r2(s), rsi: Math.round(r), hist: h[i], slope: r2(slope), run: r2(run), cross: since < 3 ? Math.sign(h[i]) : 0 };
  }

  // ---- similar situations: z-scored shape of the closes (75 %) and of the MACD histogram (25 %), Pearson correlation --------
  function zs(a, i) {
    let s = 0, q = 0;
    for (let k = i - L + 1; k <= i; k++) { const v = a[k]; if (!fin(v)) return null; s += v; q += v * v; }
    const m = s / L, sd = Math.sqrt(Math.max(0, q / L - m * m)); if (!(sd > 0)) return null;
    const z = new Float64Array(L); for (let k = 0; k < L; k++) z[k] = (a[i - L + 1 + k] - m) / sd; return z;
  }
  function prep(D, O) {
    const n = D.c.length, zp = new Array(n).fill(null), zh = new Array(n).fill(null);
    for (let j = L + 30; j < n; j++) { zp[j] = zs(D.c, j); zh[j] = zs(O.hist, j); }
    return { zp, zh };
  }
  const dot = (a, b) => { let s = 0; for (let k = 0; k < L; k++) s += a[k] * b[k]; return s / L; };
  // cur, pools: {tf, D, O, Z}; the current pattern of cur searched in the history of every pool (cur itself too)
  function matches(cur, pools, o = {}) {
    const i = cur.D.c.length - 1, zp = cur.Z.zp[i], zh = cur.Z.zh[i], minC = o.min ?? 0.82, found = [];
    if (!zp) return { top: [], n: 0, dir: 0 };
    for (const P of pools) {
      const m = P.D.c.length, same = P === cur, cand = [];
      for (let j = L + 30; j < m - H; j++) {
        if (same && j > i - L) break;
        const a = P.Z.zp[j]; if (!a) continue;
        const dp = dot(zp, a); if (dp < minC) continue;
        const b = P.Z.zh[j], sc = zh && b ? 0.75 * dp + 0.25 * dot(zh, b) : dp;
        if (sc >= minC - 0.04) cand.push({ j, sc });
      }
      cand.sort((a, b) => b.sc - a.sc);
      const took = [];
      for (const c of cand) { if (took.some(x => Math.abs(x.j - c.j) < L / 2)) continue; took.push(c); if (took.length >= 4) break; }
      for (const { j, sc } of took) {
        const a = P.O.atr[j], c0 = P.D.c[j]; if (!(a > 0)) continue;
        let up = 0, dn = 0; for (let k = j + 1; k <= j + H; k++) { up = Math.max(up, (P.D.h[k] - c0) / a); dn = Math.max(dn, (c0 - P.D.l[k]) / a); }
        const cl = v => r2(Math.max(-5, Math.min(5, v)));         // a 1s ATR can be tiny: keep one wild bar from ruling the average
        found.push({ tf: P.tf, of: cur.tf, j, t: P.D.t[j], t0: P.D.t[j - L + 1], sim: Math.round(100 * sc), out: cl((P.D.c[j + H] - c0) / a), up: cl(up), dn: cl(dn) });
      }
    }
    const top = found.sort((a, b) => b.sim - a.sim).slice(0, o.top || 8);
    if (!top.length) return { top, n: 0, dir: 0 };
    let w = 0, s = 0, ups = 0, mu = 0, md = 0;
    for (const f of top) { const ww = Math.max(1, f.sim - 70); w += ww; s += ww * f.out; mu += f.up; md += f.dn; if (f.out > 0) ups++; }
    const avg = s / w, agree = ups / top.length;
    return { top, n: top.length, ups, avg: r2(avg), up: r2(mu / top.length), dn: r2(md / top.length), agree,
      dir: avg >= 0.3 && agree >= 0.62 ? 1 : avg <= -0.3 && agree <= 0.38 ? -1 : 0 };
  }

  // ---- the plan --------------------------------------------------------------------------------------------------------
  // rows: [{tf, sec, w, x}] (x = NOL analysis with O, dv, mom, match, tr, R, D), price: the live price, pip: price of 1 pip
  function plan(rows, price, pip) {
    rows = rows.filter(r => r.x && r.x.O).sort((a, b) => a.sec - b.sec);
    if (!rows.length) return null;
    const pick = f => rows.filter(f);
    let fast = pick(r => r.sec < 60), bias = pick(r => r.sec >= 1800), setup = pick(r => r.sec >= 60 && r.sec < 1800);
    if (!fast.length) fast = rows.slice(0, 1);
    if (!bias.length) bias = rows.slice(-1);
    if (!setup.length) setup = rows.filter(r => !fast.includes(r) && !bias.includes(r));
    if (!setup.length) setup = rows.slice(0, 1);
    const why = [], wavg = (a, f) => { let s = 0, w = 0; for (const r of a) { s += r.w * f(r); w += r.w; } return w ? s / w : 0; };
    const arrow = d => (d > 0 ? '▲' : d < 0 ? '▼' : '–'), names = a => a.map(r => r.tf).join(' · ');

    // trend: structure + EMA + lines (MV.trend) and the side of the MACD histogram
    const bs = wavg(bias, r => 0.7 * r.x.tr.score + 0.3 * Math.sign(r.x.O.hist[r.x.O.hist.length - 1] || 0));
    const bdir = bs >= 0.25 ? 1 : bs <= -0.25 ? -1 : 0;
    why.push({ d: bdir, txt: `Trend ${names(bias)}: ${bdir > 0 ? '▲ hore' : bdir < 0 ? '▼ dole' : '– bočný'} (${bias.map(r => r.tf + ' ' + arrow(r.x.tr.dir)).join(', ')})` });

    // setup: a fresh divergence, what similar situations did, the momentum of the timeframe itself
    let ss = 0, sw = 0;
    for (const r of setup) {
      const x = r.x, n = x.D.c.length, dv = x.dv.list.filter(d => d.i >= n - 1 - 6).pop();
      let v = 0.35 * (x.mom.score || 0);
      if (dv) {
        v += (dv.kind === 'reg' ? 0.9 : 0.6) * dv.dir;
        why.push({ d: dv.dir, txt: `${dv.kind === 'reg' ? 'Divergencia' : 'Skrytá divergencia'} ${arrow(dv.dir)} ${dv.by.join(' + ')} na ${r.tf} (pred ${n - 1 - dv.i} sv.) – ${dv.kind === 'reg' ? (dv.dir > 0 ? 'možné otočenie nahor' : 'možné otočenie nadol') : (dv.dir > 0 ? 'trend hore pokračuje' : 'trend dole pokračuje')}` });
      }
      const m = x.match;
      if (m && m.n >= 4) {
        v += 0.6 * m.dir * Math.abs(2 * m.agree - 1) + 0.15 * Math.max(-1, Math.min(1, m.avg));
        if (m.dir) why.push({ d: m.dir, txt: `≈ ${m.n} podobných situácií k ${r.tf}: ${m.ups}× hore, ${m.n - m.ups}× dole, priemerne ${m.avg > 0 ? '+' : ''}${m.avg} ATR za ${H} sv.` });
      }
      ss += r.w * Math.max(-1.5, Math.min(1.5, v)); sw += r.w;
    }
    ss = sw ? ss / sw : 0;

    // trendlines and levels of every timeframe near the price: a support under it helps a long, a resistance over it a short
    const ref = setup[0].x, atr = ref.O.atr[ref.O.atr.length - 1] || 0, lines = [];
    for (const r of rows) {
      // second charts: too much noise for support / resistance
      const R = r.x.R; if (!R || r.sec < 60) continue; const n = r.x.D.c.length;
      for (const l of R.lines) if (l.ended == null) lines.push({ tf: r.tf, sec: r.sec, kind: l.kind, what: 'čiara', v: R.value(l, n - 1) });
      for (const lv of R.levels || []) if (lv.ended == null && lv.touches >= 2) lines.push({ tf: r.tf, sec: r.sec, kind: lv.price < price ? 'sup' : 'res', what: 'úroveň', v: lv.price });
    }
    let ls = 0;
    const near = lines.filter(l => Math.abs(price - l.v) <= 0.6 * atr).sort((a, b) => b.sec - a.sec)[0];
    if (near) {
      ls = (near.kind === 'sup' ? 1 : -1) * (near.sec >= 1800 ? 0.5 : 0.3);
      why.push({ d: Math.sign(ls), txt: `Cena pri ${near.tf} ${near.kind === 'sup' ? 'podpore' : 'odpore'} (${near.what} ${near.v.toFixed(2)})` });
    }

    // momentum: the second charts (1s the most) – has to point the same way before an entry
    const ts = wavg(fast, r => (r.x.momLive || r.x.mom).score || 0), tdir = ts >= 0.25 ? 1 : ts <= -0.25 ? -1 : 0;
    why.push({ d: tdir, txt: `Momentum ${names(fast)}: ${tdir > 0 ? 'nahor' : tdir < 0 ? 'nadol' : 'bez smeru'} (${fast.map(r => { const m = r.x.momLive || r.x.mom; return `${r.tf} ${arrow(m.dir)} RSI ${m.rsi ?? '–'}${m.cross ? ' MACD×' + arrow(m.cross) : ''}`; }).join(', ')})` });

    const total = 0.3 * bs + 0.45 * ss + 0.1 * ls / 0.5 + 0.15 * ts, dir = total >= 0.22 ? 1 : total <= -0.22 ? -1 : 0;
    const go = dir && tdir === dir, counter = dir && bdir === -dir;
    let label;
    if (!dir) label = 'ČAKAJ – bez výhody';
    else if (go) label = `${dir > 0 ? '🐂 SCALP LONG' : '🐻 SCALP SHORT'}${counter ? ' · proti trendu' : ''}`;
    else label = `PRIPRAV ${dir > 0 ? 'LONG' : 'SHORT'} – čakaj na momentum ${names(fast)}`;

    // stop behind the last swing of the setup timeframe, TP1 = 1 R (counter-trend: take it there), TP2 = the next line / 2 R
    let sl = null, tp1 = null, tp2 = null;
    if (dir && atr > 0) {
      const sw = ref.dv.piv.filter(p => p.kind === (dir > 0 ? 'L' : 'H') && (p.price - price) * dir < 0).pop();
      let stop = sw ? sw.price - dir * 0.15 * atr : price - dir * atr;
      const dist = Math.min(2 * atr, Math.max(0.4 * atr, (price - stop) * dir)); stop = price - dir * dist;
      sl = stop; tp1 = price + dir * dist;
      const nxt = lines.filter(l => (l.v - tp1) * dir > 0.2 * atr && (dir > 0 ? l.kind === 'res' || l.v > price : l.kind === 'sup' || l.v < price))
        .sort((a, b) => (a.v - b.v) * dir)[0];
      tp2 = counter ? null : nxt && Math.abs(nxt.v - price) <= 4 * dist ? nxt.v : price + dir * 2 * dist;
    }
    return { dir: go ? dir : 0, lean: dir, label, go, counter, total: r2(total), bias: r2(bs), setup: r2(ss), trig: r2(ts), why,
      entry: price, sl, tp1, tp2, risk: sl == null ? null : Math.round(Math.abs(price - sl) / pip) };
  }

  return { osc, divergences, momentum, prep, matches, plan, L, H };
})();
