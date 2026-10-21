// Market structure drawn automatically: trading ranges with their break (BOS) and pitchforks along the trend.
// Like autotl.js the result for bar i uses only bars <= i (no repainting); D = {t, o, h, l, c, v} oldest first.

const ST = (() => {
  // how many separate tests of a level (bars at least `gap` apart) are inside [i0, i1]
  function tests(arr, i0, i1, hit, gap = 3) {
    let n = 0, last = -1e9;
    for (let j = i0; j <= i1; j++) if (hit(arr[j]) && j - last >= gap) { n++; last = j; }
    return n;
  }

  // Ranges: the price stays inside a box no taller than maxAtr × ATR for at least minLen bars and tests both edges.
  // The box is fixed once confirmed; a close beyond an edge by brk × ATR is the break of structure (BOS).
  function ranges(D, o = {}) {
    const O = { minLen: 15, maxAtr: 3.5, brk: 0.1, minTests: 2, ...o }, { h, l, c } = D, n = c.length, atr = KS.atr(D, 14), out = [];
    let s = -1, cur = null;
    for (let i = 0; i < n; i++) {
      const a = atr[i];
      if (!Number.isFinite(a)) continue;
      if (s < 0) s = i;
      if (cur) {
        if (c[i] > cur.top + O.brk * a || c[i] < cur.bot - O.brk * a) {
          cur.i1 = i; cur.brk = c[i] > cur.top ? 1 : -1; out.push(cur); cur = null; s = i; continue;
        }
        cur.i1 = i;
        continue;
      }
      let top = -Infinity, bot = Infinity;
      const span = () => { top = -Infinity; bot = Infinity; for (let j = s; j <= i; j++) { if (h[j] > top) top = h[j]; if (l[j] < bot) bot = l[j]; } };
      span();
      while (top - bot > O.maxAtr * a && s < i) { s++; span(); }
      if (i - s + 1 < O.minLen) continue;
      const tol = Math.max(0.2 * (top - bot), 0.15 * a);
      const up = tests(h, s, i, x => x >= top - tol), dn = tests(l, s, i, x => x <= bot + tol);
      if (up >= O.minTests && dn >= O.minTests) cur = { i0: s, i1: i, conf: i, top, bot, brk: 0, testsTop: up, testsBot: dn, atr: a };
    }
    if (cur) { cur.live = true; out.push(cur); }
    return out;
  }

  // Pitchforks from three alternating swings: low → high → higher low = fork up, high → low → lower high = fork down.
  // type: 'andrews' (median from P0), 'schiff' (from halfway P0–P1 in price), 'mschiff' (halfway in time and price).
  function forks(D, o = {}) {
    const O = { k: 2, count: 1, type: 'andrews', ...o }, atr = KS.atr(D, 14), piv = TL.zigzag(D.h, D.l, atr, O.k).filter(p => p.conf < D.c.length), out = [];
    for (let j = piv.length - 1; j >= 2 && out.length < O.count; j--) {
      const [p0, p1, p2] = [piv[j - 2], piv[j - 1], piv[j]];
      const dir = p0.kind === 'L' && p2.kind === 'L' && p2.price > p0.price ? 1 : p0.kind === 'H' && p2.kind === 'H' && p2.price < p0.price ? -1 : 0;
      if (!dir) continue;
      const o0 = O.type === 'andrews' ? { i: p0.idx, p: p0.price } : O.type === 'schiff' ? { i: p0.idx, p: (p0.price + p1.price) / 2 } : { i: (p0.idx + p1.idx) / 2, p: (p0.price + p1.price) / 2 };
      const mid = { i: (p1.idx + p2.idx) / 2, p: (p1.price + p2.price) / 2 }, slope = (mid.p - o0.p) / (mid.i - o0.i || 1);
      out.push({ dir, p0, p1, p2, o: o0, mid, slope, conf: p2.conf, at: (base, i) => base.p + slope * (i - base.i) });
      j--;                                       // the next fork starts from older swings, so forks don't share all three points
    }
    return out;
  }

  return { ranges, forks };
})();
