// Technicals: TradingView-style ratings (oscillators, moving averages, summary) and pivot points.
// Rules follow TradingView's "Technical Ratings" description; each indicator votes Buy (+1), Sell (−1) or Neutral (0)
// and a group's rating is the average of its votes (−1 … +1). D = {t, o, h, l, c, v} arrays, oldest first.

const TA = (() => {
  const fin = Number.isFinite;
  const last = (x, k = 0) => x[x.length - 1 - k];
  const rollMax = (x, p) => x.map((_, i) => (i < p - 1 ? NaN : Math.max(...x.slice(i - p + 1, i + 1))));
  const rollMin = (x, p) => x.map((_, i) => (i < p - 1 ? NaN : Math.min(...x.slice(i - p + 1, i + 1))));
  const hma = (x, p) => { const a = KS.wma(x, Math.round(p / 2)), b = KS.wma(x, p); return KS.wma(a.map((v, i) => 2 * v - b[i]), Math.round(Math.sqrt(p))); };
  const vwma = (D, p) => { const pv = KS.sma(D.c.map((c, i) => c * D.v[i]), p), vv = KS.sma(D.v, p); return pv.map((a, i) => (vv[i] ? a / vv[i] : NaN)); };
  const stochK = (src, hi, lo, p) => { const H = rollMax(hi, p), L = rollMin(lo, p); return src.map((c, i) => (fin(H[i]) && H[i] !== L[i] ? 100 * (c - L[i]) / (H[i] - L[i]) : NaN)); };
  const vote = v => (v > 0 ? 'Buy' : v < 0 ? 'Sell' : 'Neutral');

  function oscillators(D) {
    const { h, l, c } = D, out = [];
    const add = (name, value, v) => out.push({ name, value, v, action: vote(v) });
    const rsi = KS.rsi(c, 14), r = last(rsi), r1 = last(rsi, 1);
    add('Relative Strength Index (14)', r, r < 30 && r > r1 ? 1 : r > 70 && r < r1 ? -1 : 0);
    const st = KS.stoch(D, 14, 3, 3), k = last(st.k), d = last(st.d);
    add('Stochastic %K (14, 3, 3)', k, k < 20 && k > d ? 1 : k > 80 && k < d ? -1 : 0);
    const cci = KS.cci(D, 20), cc = last(cci), cc1 = last(cci, 1);
    add('Commodity Channel Index (20)', cc, cc < -100 && cc > cc1 ? 1 : cc > 100 && cc < cc1 ? -1 : 0);
    const dmi = KS.dmi(D, 14), adx = last(dmi.adx), p = last(dmi.pdi), m = last(dmi.mdi), p1 = last(dmi.pdi, 1), m1 = last(dmi.mdi, 1);
    add('Average Directional Index (14)', adx, adx > 20 && p > m && p1 <= m1 ? 1 : adx > 20 && p < m && p1 >= m1 ? -1 : 0);
    const hl2 = h.map((x, i) => (x + l[i]) / 2), aoS = KS.sma(hl2, 5), aoL = KS.sma(hl2, 34), ao = aoS.map((x, i) => x - aoL[i]);
    const a0 = last(ao), a1 = last(ao, 1), a2 = last(ao, 2);
    const saucerUp = a0 > 0 && a1 > 0 && a2 > 0 && a1 < a2 && a0 > a1, saucerDn = a0 < 0 && a1 < 0 && a2 < 0 && a1 > a2 && a0 < a1;
    add('Awesome Oscillator', a0, saucerUp || (a0 > 0 && a1 <= 0) ? 1 : saucerDn || (a0 < 0 && a1 >= 0) ? -1 : 0);
    const mom = c.map((x, i) => (i >= 10 ? x - c[i - 10] : NaN)), mo = last(mom), mo1 = last(mom, 1);
    add('Momentum (10)', mo, mo > mo1 ? 1 : mo < mo1 ? -1 : 0);
    const md = KS.macd(c, 12, 26, 9), ml = last(md.macd), ms = last(md.signal);
    add('MACD Level (12, 26)', ml, ml > ms ? 1 : ml < ms ? -1 : 0);
    const kr = KS.sma(stochK(rsi, rsi, rsi, 14), 3), dr = KS.sma(kr, 3), skr = last(kr), sdr = last(dr);
    add('Stochastic RSI Fast (3, 3, 14, 14)', skr, skr < 20 && sdr < 20 && skr > sdr ? 1 : skr > 80 && sdr > 80 && skr < sdr ? -1 : 0);
    const wr = stochK(c, h, l, 14).map(x => x - 100), w = last(wr), w1 = last(wr, 1);
    add('Williams Percent Range (14)', w, w < -80 && w > w1 ? 1 : w > -20 && w < w1 ? -1 : 0);
    const e13 = KS.ema(c, 13), bull = h.map((x, i) => x - e13[i]), bear = l.map((x, i) => x - e13[i]);
    const up = last(e13) > last(e13, 1), bbp = last(bull) + last(bear);
    add('Bull Bear Power', bbp, up && last(bear) < 0 && last(bear) > last(bear, 1) ? 1 : !up && last(bull) > 0 && last(bull) < last(bull, 1) ? -1 : 0);
    const bp = c.map((x, i) => (i ? x - Math.min(l[i], c[i - 1]) : NaN)), tr = c.map((x, i) => (i ? Math.max(h[i], c[i - 1]) - Math.min(l[i], c[i - 1]) : NaN));
    const avg = p2 => { const b = KS.sma(bp, p2), t = KS.sma(tr, p2); return b.map((x, i) => x / t[i]); };
    const a7 = avg(7), a14 = avg(14), a28 = avg(28), uo = last(a7) * 400 / 7 + last(a14) * 200 / 7 + last(a28) * 100 / 7;
    add('Ultimate Oscillator (7, 14, 28)', uo, uo > 70 ? 1 : uo < 30 ? -1 : 0);
    return out;
  }

  function movingAverages(D) {
    const { c } = D, price = last(c), out = [];
    const add = (name, value) => out.push({ name, value, v: fin(value) ? (value < price ? 1 : value > price ? -1 : 0) : 0, action: fin(value) ? vote(value < price ? 1 : value > price ? -1 : 0) : 'Neutral' });
    for (const p of [10, 20, 30, 50, 100, 200]) { add(`Exponential Moving Average (${p})`, last(KS.ema(c, p))); add(`Simple Moving Average (${p})`, last(KS.sma(c, p))); }
    const hi = p => rollMax(D.h, p), lo = p => rollMin(D.l, p), mid = p => hi(p).map((x, i) => (x + lo(p)[i]) / 2);
    const tenkan = last(mid(9)), kijun = last(mid(26)), mb = mid(52);
    const t26 = mid(9), k26 = mid(26), A = (last(t26, 25) + last(k26, 25)) / 2, B = last(mb, 25);
    const ich = kijun < price && tenkan > kijun && A > B && price > Math.max(A, B) ? 1 : kijun > price && tenkan < kijun && A < B && price < Math.min(A, B) ? -1 : 0;
    out.push({ name: 'Ichimoku Base Line (9, 26, 52, 26)', value: kijun, v: ich, action: vote(ich) });
    add('Volume Weighted Moving Average (20)', last(vwma(D, 20)));
    add('Hull Moving Average (9)', last(hma(c, 9)));
    return out;
  }

  const rating = list => { const n = list.filter(x => fin(x.value)).length || 1; return list.reduce((s, x) => s + x.v, 0) / n; };
  const counts = list => ({ sell: list.filter(x => x.v < 0).length, neutral: list.filter(x => x.v === 0).length, buy: list.filter(x => x.v > 0).length });
  const label = r => (r < -0.5 ? 'Strong sell' : r < -0.1 ? 'Sell' : r <= 0.1 ? 'Neutral' : r <= 0.5 ? 'Buy' : 'Strong buy');
  const SK = { 'Strong sell': 'Silný predaj', Sell: 'Predaj', Neutral: 'Neutrálne', Buy: 'Nákup', 'Strong buy': 'Silný nákup' };

  function compute(D) {
    const osc = oscillators(D), ma = movingAverages(D), ro = rating(osc), rm = rating(ma), rs = (ro + rm) / 2;
    return { osc, ma, groups: { osc: { r: ro, label: label(ro), ...counts(osc) }, ma: { r: rm, label: label(rm), ...counts(ma) },
             sum: { r: rs, label: label(rs), ...counts([...osc, ...ma]) } } };
  }

  // Pivot points from the previous period's bar {o, h, l, c}. TradingView "Auto": up to 15m → day, up to 12h → week, 1d/3d → month, longer → year.
  const pivotPeriod = sec => (sec <= 900 ? '1d' : sec < 86400 ? '1w' : sec < 604800 ? '1M' : '12M');
  function pivots(b) {
    if (!b) return null;
    const { o, h, l, c } = b, r = h - l, P = (h + l + c) / 3;
    const classic = { R3: P + 2 * r, R2: P + r, R1: 2 * P - l, P, S1: 2 * P - h, S2: P - r, S3: P - 2 * r };
    const fib = { R3: P + r, R2: P + 0.618 * r, R1: P + 0.382 * r, P, S1: P - 0.382 * r, S2: P - 0.618 * r, S3: P - r };
    const cam = { R3: c + 1.1 * r / 4, R2: c + 1.1 * r / 6, R1: c + 1.1 * r / 12, P, S1: c - 1.1 * r / 12, S2: c - 1.1 * r / 6, S3: c - 1.1 * r / 4 };
    const Pw = (h + l + 2 * c) / 4;
    const woodie = { R3: h + 2 * (Pw - l), R2: Pw + r, R1: 2 * Pw - l, P: Pw, S1: 2 * Pw - h, S2: Pw - r, S3: l - 2 * (h - Pw) };
    const X = c < o ? h + 2 * l + c : c > o ? 2 * h + l + c : h + l + 2 * c;
    const dm = { R3: NaN, R2: NaN, R1: X / 2 - l, P: X / 4, S1: X / 2 - h, S2: NaN, S3: NaN };
    return { Classic: classic, Fibonacci: fib, Camarilla: cam, Woodie: woodie, DM: dm };
  }
  return { compute, pivots, pivotPeriod, label, SK };
})();
if (typeof module !== 'undefined') module.exports = TA;
