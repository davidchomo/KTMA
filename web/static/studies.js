// Indicators and candlestick patterns for the Nexus chart, computed in the browser.
// Core formulas match ktma/indicators.py (pandas ewm adjust=False, Wilder smoothing, ddof=0 std),
// so RSI/MACD/ATR/ADX/VWAP with the scanner's periods show exactly what the scanner computed.
// D = {t, o, h, l, c, v, s?} arrays (oldest first); null/NaN = no value; outputs use NaN.

const KS = (() => {
  const bad = v => v === null || v === undefined || Number.isNaN(v);
  const nan = n => new Array(n).fill(NaN);

  // ---- building blocks ------------------------------------------------------------------------
  function ewm(x, alpha, minP) {               // pandas .ewm(alpha, adjust=False, min_periods)
    const out = nan(x.length);
    let m = NaN, n = 0;
    for (let i = 0; i < x.length; i++) {
      const v = x[i];
      if (!bad(v)) { m = n === 0 ? v : alpha * v + (1 - alpha) * m; n++; }
      if (n >= minP) out[i] = m;
    }
    return out;
  }
  const ema = (x, p) => ewm(x, 2 / (p + 1), p);
  const rma = (x, p) => ewm(x, 1 / p, p);      // Wilder / SMMA
  function rolling(x, p, fn) {
    const out = nan(x.length);
    for (let i = p - 1; i < x.length; i++) {
      const win = x.slice(i - p + 1, i + 1);
      if (win.some(bad)) continue;
      out[i] = fn(win, i);
    }
    return out;
  }
  const sum = a => a.reduce((s, v) => s + v, 0);
  const sma = (x, p) => rolling(x, p, w => sum(w) / p);
  const msum = (x, p) => rolling(x, p, sum);
  const wma = (x, p) => rolling(x, p, w => sum(w.map((v, i) => v * (i + 1))) / (p * (p + 1) / 2));
  const stdev = (x, p) => rolling(x, p, w => { const m = sum(w) / p; return Math.sqrt(sum(w.map(v => (v - m) ** 2)) / p); });
  const rmax = (x, p) => rolling(x, p, w => Math.max(...w));
  const rmin = (x, p) => rolling(x, p, w => Math.min(...w));
  const zip = (a, b, fn) => a.map((v, i) => (bad(v) || bad(b[i]) ? NaN : fn(v, b[i], i)));
  const map = (a, fn) => a.map((v, i) => (bad(v) ? NaN : fn(v, i)));
  const lag = (x, k) => x.map((_, i) => (i - k >= 0 && i - k < x.length ? x[i - k] : NaN));   // value k bars ago (k<0: ahead)
  const diff = (x, k = 1) => zip(x, lag(x, k), (a, b) => a - b);
  const linreg = (x, p, off = 0) => rolling(x, p, w => {
    const n = w.length, xm = (n - 1) / 2, ym = sum(w) / n;
    let sxy = 0, sxx = 0;
    w.forEach((y, i) => { sxy += (i - xm) * (y - ym); sxx += (i - xm) ** 2; });
    const b = sxy / sxx;
    return ym + b * (n - 1 - off - xm);
  });
  const barsSince = (x, p, cmp) => rolling(x, p + 1, w => { let best = 0; w.forEach((v, i) => { if (cmp(v, w[best])) best = i; }); return p - best; });

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
  function trueRange(D) {
    const { h, l, c } = D;
    return h.map((v, i) => (i ? Math.max(v - l[i], Math.abs(v - c[i - 1]), Math.abs(l[i] - c[i - 1])) : v - l[i]));
  }
  const atr = (D, p) => rma(trueRange(D), p);

  // ---- indicators (same formulas as the scanner where it has them) ------------------------------
  function rsi(x, p) {
    const d = diff(x);
    const g = rma(map(d, v => Math.max(v, 0)), p), ls = rma(map(d, v => Math.max(-v, 0)), p);
    return g.map((a, i) => { const b = ls[i]; if (bad(a) || bad(b)) return NaN; if (a === 0 && b === 0) return 50; return 100 - 100 / (1 + a / b); });
  }
  function macd(x, fast, slow, signal) {
    const line = zip(ema(x, fast), ema(x, slow), (a, b) => a - b);
    const sig = ewm(line, 2 / (signal + 1), signal);
    return { macd: line, signal: sig, hist: zip(line, sig, (a, b) => a - b) };
  }
  function dmi(D, p) {
    const { h, l } = D;
    const pdm = h.map((v, i) => { const up = i ? v - h[i - 1] : NaN, dn = i ? l[i - 1] - l[i] : NaN; return up > dn && up > 0 ? up : 0; });
    const mdm = h.map((v, i) => { const up = i ? v - h[i - 1] : NaN, dn = i ? l[i - 1] - l[i] : NaN; return dn > up && dn > 0 ? dn : 0; });
    const tr = rma(trueRange(D), p);
    const pdi = zip(rma(pdm, p), tr, (a, b) => 100 * a / b), mdi = zip(rma(mdm, p), tr, (a, b) => 100 * a / b);
    const dx = zip(pdi, mdi, (a, b) => 100 * Math.abs(a - b) / (a + b));
    return { adx: rma(dx, p), pdi, mdi };
  }
  function bollinger(x, p, mult) {
    const mid = sma(x, p), sd = stdev(x, p);
    return { basis: mid, upper: zip(mid, sd, (m, s) => m + mult * s), lower: zip(mid, sd, (m, s) => m - mult * s) };
  }
  function vwap(D, x) {                         // session-anchored, volume-weighted σ bands
    const { h, l, c, v, t } = D;
    const sess = D.s || t.map(z => Math.floor(z / 86400));
    const vw = nan(c.length), sd = nan(c.length);
    let cur = null, cv = 0, cpv = 0, cp2v = 0;
    for (let i = 0; i < c.length; i++) {
      if (sess[i] !== cur) { cur = sess[i]; cv = 0; cpv = 0; cp2v = 0; }
      const tp = x ? x[i] : (h[i] + l[i] + c[i]) / 3, vol = bad(v[i]) ? 0 : v[i];
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
  function stochOf(x, k, smooth, d) {
    const hh = rmax(x, k), ll = rmin(x, k);
    const raw = x.map((v, i) => (bad(hh[i]) || bad(v) || hh[i] === ll[i] ? NaN : 100 * (v - ll[i]) / (hh[i] - ll[i])));
    const kk = sma(raw, smooth);
    return { k: kk, d: sma(kk, d) };
  }
  function cci(D, p) {
    const tp = source(D, 'hlc3'), ma = sma(tp, p);
    const md = rolling(tp, p, w => { const m = sum(w) / p; return sum(w.map(v => Math.abs(v - m))) / p; });
    return tp.map((v, i) => (bad(ma[i]) || !md[i] ? NaN : (v - ma[i]) / (0.015 * md[i])));
  }
  const dema = (x, p) => { const e = ema(x, p); return zip(e, ema(e, p), (a, b) => 2 * a - b); };
  const tema = (x, p) => { const e1 = ema(x, p), e2 = ema(e1, p), e3 = ema(e2, p); return e1.map((a, i) => 3 * a - 3 * e2[i] + e3[i]); };
  const hma = (x, p) => wma(zip(wma(x, Math.max(1, Math.round(p / 2))), wma(x, p), (a, b) => 2 * a - b), Math.max(1, Math.round(Math.sqrt(p))));
  const vwma = (D, x, p) => zip(sma(x.map((v, i) => v * D.v[i]), p), sma(D.v, p), (a, b) => (b ? a / b : NaN));
  const zlema = (x, p) => ema(zip(x, lag(x, Math.floor((p - 1) / 2)), (a, b) => 2 * a - b), p);
  function kama(x, p, fast = 2, slow = 30) {
    const out = nan(x.length), f = 2 / (fast + 1), s = 2 / (slow + 1);
    for (let i = p; i < x.length; i++) {
      let vol = 0;
      for (let j = i - p + 1; j <= i; j++) vol += Math.abs(x[j] - x[j - 1]);
      const er = vol ? Math.abs(x[i] - x[i - p]) / vol : 0, sc = (er * (f - s) + s) ** 2;
      out[i] = bad(out[i - 1]) ? x[i] : out[i - 1] + sc * (x[i] - out[i - 1]);
    }
    return out;
  }
  function alma(x, p, offset = 0.85, sigma = 6) {
    const m = offset * (p - 1), s = p / sigma;
    const w = Array.from({ length: p }, (_, i) => Math.exp(-((i - m) ** 2) / (2 * s * s))), ws = sum(w);
    return rolling(x, p, win => sum(win.map((v, i) => v * w[i])) / ws);
  }
  function mcginley(x, p) {
    const out = nan(x.length);
    for (let i = 0; i < x.length; i++) {
      if (bad(x[i])) continue;
      const prev = out[i - 1];
      out[i] = bad(prev) ? x[i] : prev + (x[i] - prev) / (p * (x[i] / prev) ** 4);
    }
    return out;
  }
  function psar(D, start = 0.02, inc = 0.02, max = 0.2) {
    const { h, l } = D, out = nan(h.length);
    if (h.length < 2) return out;
    let up = h[1] > h[0], sar = up ? l[0] : h[0], ep = up ? h[1] : l[1], af = start;
    for (let i = 1; i < h.length; i++) {
      sar = sar + af * (ep - sar);
      if (up) {
        sar = Math.min(sar, l[i - 1], i > 1 ? l[i - 2] : l[i - 1]);
        if (l[i] < sar) { up = false; sar = ep; ep = l[i]; af = start; }
        else if (h[i] > ep) { ep = h[i]; af = Math.min(max, af + inc); }
      } else {
        sar = Math.max(sar, h[i - 1], i > 1 ? h[i - 2] : h[i - 1]);
        if (h[i] > sar) { up = true; sar = ep; ep = h[i]; af = start; }
        else if (l[i] < ep) { ep = l[i]; af = Math.min(max, af + inc); }
      }
      out[i] = sar;
    }
    return out;
  }
  function supertrend(D, p, mult) {
    const a = atr(D, p), hl2 = source(D, 'hl2'), n = D.c.length;
    const up = nan(n), dn = nan(n), line = nan(n), dir = nan(n);
    for (let i = 0; i < n; i++) {
      if (bad(a[i])) continue;
      let u = hl2[i] - mult * a[i], d = hl2[i] + mult * a[i];
      if (!bad(up[i - 1]) && D.c[i - 1] > up[i - 1]) u = Math.max(u, up[i - 1]);
      if (!bad(dn[i - 1]) && D.c[i - 1] < dn[i - 1]) d = Math.min(d, dn[i - 1]);
      up[i] = u; dn[i] = d;
      const pd = bad(dir[i - 1]) ? 1 : dir[i - 1];
      dir[i] = pd === -1 && D.c[i] > dn[i - 1] ? 1 : pd === 1 && D.c[i] < up[i - 1] ? -1 : pd;
      line[i] = dir[i] === 1 ? u : d;
    }
    return { st: line, dir };
  }
  function ichimoku(D, conv, base, spanB, disp) {
    const mid = p => zip(rmax(D.h, p), rmin(D.l, p), (a, b) => (a + b) / 2);
    const tenkan = mid(conv), kijun = mid(base);
    const a = zip(tenkan, kijun, (x, y) => (x + y) / 2), b = mid(spanB);
    return { tenkan, kijun, spanA: lag(a, disp - 1), spanB: lag(b, disp - 1), chikou: lag(D.c, -(disp - 1)) };
  }
  function pivots(D, kind) {                    // daily (UTC) pivot points from the previous day
    const n = D.c.length, keys = ['p', 'r1', 'r2', 'r3', 's1', 's2', 's3'], out = Object.fromEntries(keys.map(k => [k, nan(n)]));
    let day = null, prev = null, cur = null;
    for (let i = 0; i < n; i++) {
      const d = Math.floor(D.t[i] / 86400);
      if (d !== day) { prev = cur; cur = { h: D.h[i], l: D.l[i], c: D.c[i] }; day = d; }
      else { cur.h = Math.max(cur.h, D.h[i]); cur.l = Math.min(cur.l, D.l[i]); cur.c = D.c[i]; }
      if (!prev) continue;
      const { h, l, c } = prev, p = (h + l + c) / 3, r = h - l;
      const lv = kind === 'fib'
        ? { p, r1: p + 0.382 * r, r2: p + 0.618 * r, r3: p + r, s1: p - 0.382 * r, s2: p - 0.618 * r, s3: p - r }
        : kind === 'camarilla'
          ? { p, r1: c + r * 1.1 / 12, r2: c + r * 1.1 / 6, r3: c + r * 1.1 / 4, s1: c - r * 1.1 / 12, s2: c - r * 1.1 / 6, s3: c - r * 1.1 / 4 }
          : { p, r1: 2 * p - l, r2: p + r, r3: h + 2 * (p - l), s1: 2 * p - h, s2: p - r, s3: l - 2 * (h - p) };
      for (const k of keys) out[k][i] = lv[k];
    }
    return out;
  }
  function zigzag(D, devPct, depth) {           // pivots that moved at least devPct %; values only at pivots
    const n = D.c.length, out = nan(n), dev = devPct / 100;
    if (!n) return out;
    let dir = 0, pi = 0, pv = 0, hiI = 0, hiV = D.h[0], loI = 0, loV = D.l[0];
    for (let i = 1; i < n; i++) {
      const h = D.h[i], l = D.l[i];
      if (dir === 0) {                           // until the first swing is clear
        if (h > hiV) { hiV = h; hiI = i; }
        if (l < loV) { loV = l; loI = i; }
        if (hiV >= loV * (1 + dev)) {
          if (hiI > loI) { out[loI] = loV; dir = 1; pv = hiV; pi = hiI; } else { out[hiI] = hiV; dir = -1; pv = loV; pi = loI; }
        }
      } else if (dir === 1) {
        if (h > pv) { pv = h; pi = i; } else if (l < pv * (1 - dev) && i - pi >= depth) { out[pi] = pv; dir = -1; pv = l; pi = i; }
      } else if (l < pv) { pv = l; pi = i; } else if (h > pv * (1 + dev) && i - pi >= depth) { out[pi] = pv; dir = 1; pv = h; pi = i; }
    }
    if (dir !== 0) out[pi] = pv;
    return out;
  }
  function regressionChannel(x, p, dev) {       // the last `p` bars only, like TradingView's channel
    const n = x.length, mid = nan(n), up = nan(n), lo = nan(n);
    if (n < p) return { mid, up, lo };
    const w = x.slice(n - p), xm = (p - 1) / 2, ym = sum(w) / p;
    let sxy = 0, sxx = 0;
    w.forEach((y, i) => { sxy += (i - xm) * (y - ym); sxx += (i - xm) ** 2; });
    const b = sxy / sxx, a = ym - b * xm, sd = Math.sqrt(sum(w.map((y, i) => (y - (a + b * i)) ** 2)) / p);
    for (let i = 0; i < p; i++) { const v = a + b * i; mid[n - p + i] = v; up[n - p + i] = v + dev * sd; lo[n - p + i] = v - dev * sd; }
    return { mid, up, lo };
  }
  const adLine = D => { let s = 0; return D.c.map((c, i) => { const r = D.h[i] - D.l[i]; s += r ? ((c - D.l[i]) - (D.h[i] - c)) / r * (D.v[i] || 0) : 0; return s; }); };
  const obv = D => { let s = 0; return D.c.map((c, i) => { if (i) s += c > D.c[i - 1] ? (D.v[i] || 0) : c < D.c[i - 1] ? -(D.v[i] || 0) : 0; return s; }); };
  const pvt = D => { let s = 0; return D.c.map((c, i) => { if (i && D.c[i - 1]) s += (c - D.c[i - 1]) / D.c[i - 1] * (D.v[i] || 0); return s; }); };
  function mfi(D, p) {
    const tp = source(D, 'hlc3'), mf = tp.map((v, i) => v * (D.v[i] || 0));
    const pos = tp.map((v, i) => (i && v > tp[i - 1] ? mf[i] : 0)), neg = tp.map((v, i) => (i && v < tp[i - 1] ? mf[i] : 0));
    return zip(msum(pos, p), msum(neg, p), (a, b) => (b === 0 ? 100 : 100 - 100 / (1 + a / b)));
  }
  function ultimate(D, a, b, c) {
    const bp = D.c.map((v, i) => v - Math.min(D.l[i], i ? D.c[i - 1] : D.l[i])), tr = trueRange(D);
    const avg = p => zip(msum(bp, p), msum(tr, p), (x, y) => (y ? x / y : NaN));
    const A = avg(a), B = avg(b), C = avg(c);
    return A.map((x, i) => 100 * (4 * x + 2 * B[i] + C[i]) / 7);
  }
  function vortex(D, p) {
    const vp = D.h.map((h, i) => (i ? Math.abs(h - D.l[i - 1]) : NaN)), vm = D.l.map((l, i) => (i ? Math.abs(l - D.h[i - 1]) : NaN));
    const tr = msum(trueRange(D), p);
    return { vip: zip(msum(vp, p), tr, (a, b) => a / b), vim: zip(msum(vm, p), tr, (a, b) => a / b) };
  }
  function tsi(x, long, short) {
    const m = diff(x), ds = y => ema(ema(y, long), short);
    return zip(ds(m), ds(map(m, Math.abs)), (a, b) => (b ? 100 * a / b : NaN));
  }
  function fisher(D, p) {
    const hl2 = source(D, 'hl2'), hh = rmax(hl2, p), ll = rmin(hl2, p), out = nan(hl2.length);
    let v = 0, f = 0;
    for (let i = 0; i < hl2.length; i++) {
      if (bad(hh[i])) continue;
      const r = hh[i] - ll[i];
      v = 0.66 * ((r ? (hl2[i] - ll[i]) / r : 0.5) - 0.5) + 0.67 * v;
      v = Math.max(-0.999, Math.min(0.999, v));
      f = 0.5 * Math.log((1 + v) / (1 - v)) + 0.5 * f;
      out[i] = f;
    }
    return { fisher: out, trigger: lag(out, 1) };
  }
  function kst(x) {
    const roc = p => map(x, (v, i) => (i >= p ? 100 * (v / x[i - p] - 1) : NaN));
    const k = sma(roc(10), 10).map((a, i) => a + 2 * sma(roc(15), 10)[i] + 3 * sma(roc(20), 10)[i] + 4 * sma(roc(30), 15)[i]);
    return { kst: k, signal: sma(k, 9) };
  }
  function chop(D, p) {
    const s = msum(trueRange(D), p), hh = rmax(D.h, p), ll = rmin(D.l, p);
    return s.map((v, i) => (bad(v) || hh[i] === ll[i] ? NaN : 100 * Math.log10(v / (hh[i] - ll[i])) / Math.log10(p)));
  }
  function rvi(D, p) {
    const num = D.c.map((c, i) => c - D.o[i]), den = D.h.map((h, i) => h - D.l[i]);
    const sw = y => y.map((v, i) => (i >= 3 ? (v + 2 * y[i - 1] + 2 * y[i - 2] + y[i - 3]) / 6 : NaN));
    const r = zip(sma(sw(num), p), sma(sw(den), p), (a, b) => (b ? a / b : NaN));
    return { rvi: r, signal: sw(r) };
  }

  // ---- candlestick patterns (markers on the bars) -------------------------------------------------
  const body = (D, i) => Math.abs(D.c[i] - D.o[i]), range = (D, i) => D.h[i] - D.l[i] || 1e-12;
  const upper = (D, i) => D.h[i] - Math.max(D.c[i], D.o[i]), lower = (D, i) => Math.min(D.c[i], D.o[i]) - D.l[i];
  const bull = (D, i) => D.c[i] > D.o[i], bear = (D, i) => D.c[i] < D.o[i];
  const trendDown = (D, i) => i >= 5 && D.c[i - 1] < D.c[i - 5], trendUp = (D, i) => i >= 5 && D.c[i - 1] > D.c[i - 5];
  const PATTERNS = {
    doji: ['Doji', 0, (D, i) => body(D, i) <= 0.1 * range(D, i)],
    dragonfly: ['Dragonfly doji', 1, (D, i) => body(D, i) <= 0.1 * range(D, i) && upper(D, i) <= 0.1 * range(D, i) && lower(D, i) >= 0.6 * range(D, i)],
    gravestone: ['Gravestone doji', -1, (D, i) => body(D, i) <= 0.1 * range(D, i) && lower(D, i) <= 0.1 * range(D, i) && upper(D, i) >= 0.6 * range(D, i)],
    hammer: ['Kladivo (Hammer)', 1, (D, i) => trendDown(D, i) && lower(D, i) >= 2 * body(D, i) && upper(D, i) <= 0.3 * body(D, i) + 0.05 * range(D, i) && body(D, i) > 0.05 * range(D, i)],
    invhammer: ['Obrátené kladivo', 1, (D, i) => trendDown(D, i) && upper(D, i) >= 2 * body(D, i) && lower(D, i) <= 0.3 * body(D, i) + 0.05 * range(D, i) && body(D, i) > 0.05 * range(D, i)],
    hanging: ['Obesenec (Hanging man)', -1, (D, i) => trendUp(D, i) && lower(D, i) >= 2 * body(D, i) && upper(D, i) <= 0.3 * body(D, i) + 0.05 * range(D, i) && body(D, i) > 0.05 * range(D, i)],
    shooting: ['Padajúca hviezda', -1, (D, i) => trendUp(D, i) && upper(D, i) >= 2 * body(D, i) && lower(D, i) <= 0.3 * body(D, i) + 0.05 * range(D, i) && body(D, i) > 0.05 * range(D, i)],
    engulfbull: ['Býčie pohltenie', 1, (D, i) => i > 0 && bear(D, i - 1) && bull(D, i) && D.c[i] >= D.o[i - 1] && D.o[i] <= D.c[i - 1] && body(D, i) > body(D, i - 1)],
    engulfbear: ['Medvedie pohltenie', -1, (D, i) => i > 0 && bull(D, i - 1) && bear(D, i) && D.o[i] >= D.c[i - 1] && D.c[i] <= D.o[i - 1] && body(D, i) > body(D, i - 1)],
    haramibull: ['Býčie harami', 1, (D, i) => i > 0 && bear(D, i - 1) && bull(D, i) && D.o[i] > D.c[i - 1] && D.c[i] < D.o[i - 1] && body(D, i) < 0.6 * body(D, i - 1)],
    haramibear: ['Medvedie harami', -1, (D, i) => i > 0 && bull(D, i - 1) && bear(D, i) && D.o[i] < D.c[i - 1] && D.c[i] > D.o[i - 1] && body(D, i) < 0.6 * body(D, i - 1)],
    piercing: ['Prenikanie (Piercing)', 1, (D, i) => i > 0 && bear(D, i - 1) && bull(D, i) && D.o[i] < D.l[i - 1] && D.c[i] > (D.o[i - 1] + D.c[i - 1]) / 2 && D.c[i] < D.o[i - 1]],
    darkcloud: ['Tmavý mrak', -1, (D, i) => i > 0 && bull(D, i - 1) && bear(D, i) && D.o[i] > D.h[i - 1] && D.c[i] < (D.o[i - 1] + D.c[i - 1]) / 2 && D.c[i] > D.o[i - 1]],
    morning: ['Ranná hviezda', 1, (D, i) => i > 1 && bear(D, i - 2) && body(D, i - 1) < 0.3 * body(D, i - 2) && bull(D, i) && D.c[i] > (D.o[i - 2] + D.c[i - 2]) / 2],
    evening: ['Večerná hviezda', -1, (D, i) => i > 1 && bull(D, i - 2) && body(D, i - 1) < 0.3 * body(D, i - 2) && bear(D, i) && D.c[i] < (D.o[i - 2] + D.c[i - 2]) / 2],
    soldiers: ['Traja bieli vojaci', 1, (D, i) => i > 1 && [0, 1, 2].every(k => bull(D, i - k) && body(D, i - k) > 0.5 * range(D, i - k)) && D.c[i] > D.c[i - 1] && D.c[i - 1] > D.c[i - 2]],
    crows: ['Tri čierne vrany', -1, (D, i) => i > 1 && [0, 1, 2].every(k => bear(D, i - k) && body(D, i - k) > 0.5 * range(D, i - k)) && D.c[i] < D.c[i - 1] && D.c[i - 1] < D.c[i - 2]],
    tweezerbottom: ['Pinzeta dno', 1, (D, i) => i > 0 && trendDown(D, i) && bear(D, i - 1) && bull(D, i) && Math.abs(D.l[i] - D.l[i - 1]) <= 0.05 * range(D, i)],
    tweezertop: ['Pinzeta vrchol', -1, (D, i) => i > 0 && trendUp(D, i) && bull(D, i - 1) && bear(D, i) && Math.abs(D.h[i] - D.h[i - 1]) <= 0.05 * range(D, i)],
    marubozubull: ['Marubozu býčie', 1, (D, i) => bull(D, i) && body(D, i) >= 0.95 * range(D, i)],
    marubozubear: ['Marubozu medvedie', -1, (D, i) => bear(D, i) && body(D, i) >= 0.95 * range(D, i)],
    spinning: ['Vlčok (Spinning top)', 0, (D, i) => body(D, i) <= 0.3 * range(D, i) && body(D, i) > 0.1 * range(D, i) && upper(D, i) > body(D, i) && lower(D, i) > body(D, i)],
  };

  // ---- registry: what the indicator menu offers -------------------------------------------------
  // inputs: {k, label, def, min, max, step?, type?: 'source'}
  // plots:  {k, label, color, opacity?, width?, style?, kind?}
  //   kind 'line'  – a line (colour, opacity, width, style, line type)
  //        'hist'  – histogram coloured by sign (colour = above 0, color2 = below 0)
  //        'color' – colour + opacity only
  //        'fill'  – area between two plots (`between`, '=input' = a constant); color2 = when the 2nd is above
  //        'level' – horizontal lines at the study's level inputs
  //        'dual'  – optional rising/falling colouring of another line (`of`)
  // cat: 'ma' | 'band' | 'osc' | 'vol' | 'trend' | 'other' — for the menu; pane: true = own pane under the chart
  const P = (k, label, color, extra) => ({ k, label, color, opacity: 100, width: 1, style: 0, kind: 'line', ...(extra || {}) });
  const F = (k, label, color, opacity, between, color2) => ({ k, label, color, color2, opacity, kind: 'fill', between });
  const H = (k, label, color, color2) => ({ k, label, color, color2, opacity: 100, kind: 'hist' });
  const LV = color => P('levels', 'Úrovne', color || '#787b86', { kind: 'level', style: 2 });
  const SRC = { k: 'source', label: 'Zdroj', type: 'source', def: 'close' };
  const LEN = (def, label) => ({ k: 'period', label: label || 'Perióda', def, min: 1, max: 1000 });
  const LEVELS = (u, l, min = 0, max = 100) => [{ k: 'upper', label: 'Horná úroveň', def: u, min, max }, { k: 'lower', label: 'Dolná úroveň', def: l, min, max }];
  const RED = '#f23645', GREEN = '#089981', GREY = '#787b86', BLUE = '#2962ff', ORANGE = '#ff6d00';
  const S = {};
  const ma = (k, name, title, color, fn, extraInputs) => {
    S[k] = { name, title, cat: 'ma', pane: false, inputs: [LEN(k === 'sma' ? 50 : 20), SRC, ...(extraInputs || [])],
      plots: [P('ma', name, color)], label: s => `${name} ${s.inputs.period}`,
      calc: (D, s) => ({ ma: fn(source(D, s.inputs.source), s.inputs.period, D, s) }) };
  };
  ma('ema', 'EMA', 'Exponenciálny kĺzavý priemer', '#f2a900', ema);
  ma('sma', 'SMA', 'Jednoduchý kĺzavý priemer', '#ff9800', sma);
  ma('wma', 'WMA', 'Vážený kĺzavý priemer', '#00bcd4', wma);
  ma('dema', 'DEMA', 'Dvojitý exponenciálny priemer', '#e91e63', dema);
  ma('tema', 'TEMA', 'Trojitý exponenciálny priemer', '#9c27b0', tema);
  ma('hma', 'HMA', 'Hullov kĺzavý priemer', '#4caf50', hma);
  ma('rma', 'SMMA (RMA)', 'Vyhladený kĺzavý priemer (Wilder)', '#795548', rma);
  ma('vwma', 'VWMA', 'Objemom vážený kĺzavý priemer', '#3f51b5', (x, p, D) => vwma(D, x, p));
  ma('zlema', 'ZLEMA', 'Kĺzavý priemer bez oneskorenia', '#009688', zlema);
  ma('kama', 'KAMA', 'Kaufmanov adaptívny kĺzavý priemer', '#607d8b', kama);
  ma('alma', 'ALMA', 'Arnaud Legoux kĺzavý priemer', '#ff5722', (x, p, D, s) => alma(x, p, s.inputs.offset, s.inputs.sigma),
     [{ k: 'offset', label: 'Offset', def: 0.85, min: 0, max: 1, step: 0.05 }, { k: 'sigma', label: 'Sigma', def: 6, min: 1, max: 50 }]);
  ma('lsma', 'LSMA', 'Lineárna regresia (Least Squares MA)', '#8bc34a', (x, p) => linreg(x, p));
  ma('mcginley', 'McGinley', 'McGinley Dynamic', '#cddc39', mcginley);
  S.ribbon = { name: 'MA stuha', title: 'Stuha EMA 20 · 50 · 100 · 200', cat: 'ma', pane: false, inputs: [SRC],
    plots: [P('a', 'EMA 20', '#ffeb3b'), P('b', 'EMA 50', '#ff9800'), P('c', 'EMA 100', '#f57c00'), P('d', 'EMA 200', '#e65100', { width: 2 })],
    label: () => 'MA stuha', calc: (D, s) => { const x = source(D, s.inputs.source); return { a: ema(x, 20), b: ema(x, 50), c: ema(x, 100), d: ema(x, 200) }; } };

  S.bb = { name: 'Bollinger', title: 'Bollingerove pásma', cat: 'band', pane: false,
    inputs: [LEN(20), { k: 'mult', label: 'Násobok σ', def: 2, min: 0.1, max: 10, step: 0.1 }, SRC],
    plots: [P('basis', 'Stred', ORANGE), P('upper', 'Horné', BLUE), P('lower', 'Dolné', BLUE), F('fill', 'Výplň', BLUE, 5, ['upper', 'lower'])],
    label: s => `BB ${s.inputs.period} ${s.inputs.mult}`, calc: (D, s) => bollinger(source(D, s.inputs.source), s.inputs.period, s.inputs.mult) };
  S.keltner = { name: 'Keltner', title: 'Keltnerov kanál (EMA ± ATR)', cat: 'band', pane: false,
    inputs: [LEN(20), { k: 'mult', label: 'Násobok ATR', def: 2, min: 0.1, max: 10, step: 0.1 }, { k: 'atr', label: 'ATR perióda', def: 10, min: 1, max: 500 }],
    plots: [P('basis', 'Stred', BLUE), P('upper', 'Horné', BLUE), P('lower', 'Dolné', BLUE), F('fill', 'Výplň', BLUE, 5, ['upper', 'lower'])],
    label: s => `KC ${s.inputs.period} ${s.inputs.mult}`,
    calc: (D, s) => { const m = ema(D.c, s.inputs.period), a = atr(D, s.inputs.atr);
      return { basis: m, upper: zip(m, a, (x, y) => x + s.inputs.mult * y), lower: zip(m, a, (x, y) => x - s.inputs.mult * y) }; } };
  S.donchian = { name: 'Donchian', title: 'Donchianov kanál', cat: 'band', pane: false, inputs: [LEN(20)],
    plots: [P('upper', 'Horné', BLUE), P('basis', 'Stred', ORANGE, { style: 2 }), P('lower', 'Dolné', BLUE), F('fill', 'Výplň', BLUE, 5, ['upper', 'lower'])],
    label: s => `DC ${s.inputs.period}`,
    calc: (D, s) => { const u = rmax(D.h, s.inputs.period), lo = rmin(D.l, s.inputs.period); return { upper: u, lower: lo, basis: zip(u, lo, (a, b) => (a + b) / 2) }; } };
  S.envelope = { name: 'Obálka', title: 'Obálka kĺzavého priemeru (± %)', cat: 'band', pane: false,
    inputs: [LEN(20), { k: 'pct', label: 'Percento', def: 1, min: 0.01, max: 50, step: 0.1 }, SRC],
    plots: [P('basis', 'Stred', ORANGE), P('upper', 'Horné', BLUE), P('lower', 'Dolné', BLUE), F('fill', 'Výplň', BLUE, 4, ['upper', 'lower'])],
    label: s => `Env ${s.inputs.period} ${s.inputs.pct}%`,
    calc: (D, s) => { const m = sma(source(D, s.inputs.source), s.inputs.period); return { basis: m, upper: map(m, v => v * (1 + s.inputs.pct / 100)), lower: map(m, v => v * (1 - s.inputs.pct / 100)) }; } };
  S.linreg = { name: 'Regresný kanál', title: 'Lineárna regresia posledných N sviečok ± σ', cat: 'band', pane: false,
    inputs: [LEN(100), { k: 'dev', label: 'Odchýlka (σ)', def: 2, min: 0.1, max: 10, step: 0.1 }],
    plots: [P('mid', 'Stred', GREY, { style: 2 }), P('up', 'Horné', BLUE), P('lo', 'Dolné', BLUE), F('fill', 'Výplň', BLUE, 6, ['up', 'lo'])],
    label: s => `LinReg ${s.inputs.period}`, calc: (D, s) => regressionChannel(D.c, s.inputs.period, s.inputs.dev) };

  const vwapPlots = [P('vwap', 'VWAP', '#ffffff', { width: 2 }),
    { k: 'dir', label: 'Farba VWAP podľa smeru', kind: 'dual', of: 'vwap', color: GREEN, color2: RED, opacity: 100, visible: false }];
  for (let n = 1; n <= 5; n++) {
    const o = n === 1 ? { style: 1, opacity: 70 } : { opacity: 60 };
    vwapPlots.push(P(`u${n}`, `Horné pásmo ${n}`, n === 1 ? GREY : RED, o), P(`l${n}`, `Dolné pásmo ${n}`, n === 1 ? GREY : GREEN, o));
  }
  for (let n = 1; n <= 4; n++) {
    vwapPlots.push(F(`ob${n}`, `Výplň prekúpené ${n} (draho)`, RED, 6 + 4 * n, [`u${n}`, `u${n + 1}`]),
                   F(`os${n}`, `Výplň prepredané ${n} (lacno)`, GREEN, 6 + 4 * n, [`l${n}`, `l${n + 1}`]));
  }
  vwapPlots.push(F('mup', 'Výplň stred hore', GREY, 7, ['vwap', 'u1']), F('mdn', 'Výplň stred dole', GREY, 7, ['l1', 'vwap']));
  S.vwap = { name: 'VWAP', title: 'VWAP seansy s pásmami σ a farebnými zónami', cat: 'band', pane: false, legend: ['vwap'], sessionBreaks: true,
    inputs: [{ ...SRC, def: 'hlc3' }, ...[1, 2, 3, 4, 5].map(n => ({ k: `b${n}`, label: `Pásmo ${n} (σ, 0 = vyp.)`, def: [1, 2, 3, 0, 0][n - 1], min: 0, max: 10, step: 0.25 }))],
    plots: vwapPlots, label: () => 'VWAP',
    calc: (D, s) => {
      const r = vwap(D, source(D, s.inputs.source));
      const band = (k, sign) => (k > 0 ? zip(r.vwap, r.sd, (m, x) => m + sign * k * x) : nan(D.c.length));
      const out = { vwap: r.vwap };
      for (let n = 1; n <= 5; n++) { out[`u${n}`] = band(s.inputs[`b${n}`], 1); out[`l${n}`] = band(s.inputs[`b${n}`], -1); }
      return out;
    } };
  S.ichimoku = { name: 'Ichimoku', title: 'Ichimoku Kinko Hyo (oblak)', cat: 'trend', pane: false,
    inputs: [{ k: 'conv', label: 'Tenkan', def: 9, min: 1, max: 200 }, { k: 'base', label: 'Kijun', def: 26, min: 1, max: 200 },
             { k: 'spanB', label: 'Senkou B', def: 52, min: 1, max: 400 }, { k: 'disp', label: 'Posun', def: 26, min: 1, max: 200 }],
    plots: [P('tenkan', 'Tenkan-sen', BLUE), P('kijun', 'Kijun-sen', '#b71c1c'), P('chikou', 'Chikou span', '#43a047'),
            P('spanA', 'Senkou A', '#a5d6a7'), P('spanB', 'Senkou B', '#ef9a9a'), F('cloud', 'Oblak', '#43a047', 15, ['spanA', 'spanB'], '#f44336')],
    label: s => `Ichimoku ${s.inputs.conv} ${s.inputs.base} ${s.inputs.spanB}`, calc: (D, s) => ichimoku(D, s.inputs.conv, s.inputs.base, s.inputs.spanB, s.inputs.disp) };
  S.psar = { name: 'Parabolic SAR', title: 'Parabolický SAR', cat: 'trend', pane: false,
    inputs: [{ k: 'start', label: 'Štart', def: 0.02, min: 0.001, max: 1, step: 0.01 }, { k: 'inc', label: 'Krok', def: 0.02, min: 0.001, max: 1, step: 0.01 },
             { k: 'max', label: 'Maximum', def: 0.2, min: 0.01, max: 1, step: 0.01 }],
    plots: [P('sar', 'SAR', BLUE, { type: 3 })], label: () => 'SAR', calc: (D, s) => ({ sar: psar(D, s.inputs.start, s.inputs.inc, s.inputs.max) }) };
  S.supertrend = { name: 'Supertrend', title: 'Supertrend (ATR)', cat: 'trend', pane: false,
    inputs: [{ k: 'period', label: 'ATR perióda', def: 10, min: 1, max: 500 }, { k: 'mult', label: 'Násobok', def: 3, min: 0.1, max: 20, step: 0.1 }],
    plots: [P('st', 'Supertrend', GREEN, { width: 2 }), { k: 'dir', label: 'Farba podľa trendu', kind: 'dual', of: 'st', trend: 'dir', color: GREEN, color2: RED, opacity: 100 }],
    label: s => `Supertrend ${s.inputs.period} ${s.inputs.mult}`, calc: (D, s) => supertrend(D, s.inputs.period, s.inputs.mult) };
  S.alligator = { name: 'Alligator', title: 'Williamsov Alligator', cat: 'trend', pane: false, inputs: [],
    plots: [P('jaw', 'Čeľusť', '#2962ff'), P('teeth', 'Zuby', '#e91e63'), P('lips', 'Pery', '#66bb6a')], label: () => 'Alligator',
    calc: D => { const x = source(D, 'hl2'); return { jaw: lag(rma(x, 13), 8), teeth: lag(rma(x, 8), 5), lips: lag(rma(x, 5), 3) }; } };
  S.pivots = { name: 'Pivot body', title: 'Denné pivot body (štandard / Fibonacci / Camarilla)', cat: 'trend', pane: false, sessionBreaks: 'day',
    inputs: [{ k: 'kind', label: 'Typ (0 = štandard, 1 = Fib, 2 = Camarilla)', def: 0, min: 0, max: 2 }],
    plots: [P('p', 'P', '#ff9800'), P('r1', 'R1', RED), P('r2', 'R2', RED), P('r3', 'R3', RED), P('s1', 'S1', GREEN), P('s2', 'S2', GREEN), P('s3', 'S3', GREEN)],
    label: () => 'Pivoty', calc: (D, s) => pivots(D, ['std', 'fib', 'camarilla'][s.inputs.kind] || 'std') };
  S.zigzag = { name: 'ZigZag', title: 'ZigZag (pohyby nad X %)', cat: 'trend', pane: false, connect: true,
    inputs: [{ k: 'dev', label: 'Odchýlka %', def: 0.5, min: 0.01, max: 50, step: 0.05 }, { k: 'depth', label: 'Hĺbka (sviečky)', def: 5, min: 1, max: 100 }],
    plots: [P('zz', 'ZigZag', ORANGE, { width: 2 })], label: s => `ZigZag ${s.inputs.dev}%`, calc: (D, s) => ({ zz: zigzag(D, s.inputs.dev, s.inputs.depth) }) };

  S.volume = { name: 'Objem', title: 'Objem (v spodnej časti grafu)', cat: 'vol', pane: 'volume',
    inputs: [{ k: 'ma', label: 'Priemer objemu (0 = vyp.)', def: 0, min: 0, max: 500 }],
    plots: [P('up', 'Rastúca sviečka', '#26a69a', { kind: 'color', opacity: 50 }), P('down', 'Klesajúca sviečka', '#ef5350', { kind: 'color', opacity: 50 }), P('vma', 'Priemer', '#ff9800')],
    label: () => 'Objem', calc: (D, s) => ({ vol: D.v, vma: s.inputs.ma > 0 ? sma(D.v, s.inputs.ma) : nan(D.c.length) }) };

  // drawn by the chart itself (custom layers in app.js): volume profile and heatmaps
  S.vprofile = { name: 'Profil objemu (VPVR)', title: 'Objem podľa ceny vo viditeľnom úseku: POC, value area, kupujúci / predávajúci', cat: 'vol', pane: false, custom: 'vprofile',
    inputs: [{ k: 'rows', label: 'Počet riadkov', def: 70, min: 10, max: 300 }, { k: 'width', label: 'Šírka (% grafu)', def: 28, min: 5, max: 90 },
             { k: 'va', label: 'Value area (%)', def: 70, min: 10, max: 95 }, { k: 'side', label: 'Strana (0 = vpravo, 1 = vľavo)', def: 0, min: 0, max: 1 }],
    plots: [P('buy', 'Kupujúci', '#26a69a', { kind: 'color', opacity: 55 }), P('sell', 'Predávajúci', '#ef5350', { kind: 'color', opacity: 55 }),
            P('va', 'Value area (zvýraznenie)', '#5b9cf6', { kind: 'color', opacity: 85 }), P('poc', 'POC (najväčší objem)', '#ffeb3b', { width: 2 })],
    label: s => `VPVR ${s.inputs.rows}`, calc: () => ({}) };
  S.vheat = { name: 'Heatmapa objemu', title: 'Kde sa obchodovalo najviac – čas × cena (kĺzavý profil objemu)', cat: 'vol', pane: false, custom: 'vheat',
    inputs: [{ k: 'rows', label: 'Riadkov', def: 60, min: 10, max: 200 }, { k: 'win', label: 'Okno (sviečok)', def: 50, min: 5, max: 500 }, { k: 'opacity', label: 'Krytie (%)', def: 45, min: 5, max: 100 }], plots: [],
    label: () => 'Heatmapa objemu', calc: () => ({}) };
  S.obheat = { name: 'Heatmapa knihy príkazov (naživo)', title: 'Limitné príkazy v knihe Binance – zbiera sa, kým je graf otvorený', cat: 'vol', pane: false, custom: 'obheat',
    inputs: [{ k: 'rows', label: 'Riadkov', def: 90, min: 20, max: 300 }, { k: 'opacity', label: 'Krytie (%)', def: 70, min: 5, max: 100 }], plots: [],
    label: () => 'Heatmapa knihy príkazov', calc: () => ({}) };

  const osc = (k, def) => { S[k] = { cat: 'osc', pane: true, ...def }; };
  osc('rsi', { name: 'RSI', title: 'Index relatívnej sily', inputs: [LEN(14), SRC, ...LEVELS(70, 30)],
    plots: [P('rsi', 'RSI', '#7e57c2'), LV(), F('bg', 'Pozadie medzi úrovňami', '#7e57c2', 8, ['=upper', '=lower'])],
    label: s => `RSI ${s.inputs.period}`, calc: (D, s) => ({ rsi: rsi(source(D, s.inputs.source), s.inputs.period) }) });
  osc('stoch', { name: 'Stochastic', title: 'Stochastický oscilátor',
    inputs: [{ k: 'k', label: '%K perióda', def: 14, min: 1, max: 500 }, { k: 'smooth', label: '%K vyhladenie', def: 3, min: 1, max: 100 },
             { k: 'd', label: '%D perióda', def: 3, min: 1, max: 100 }, ...LEVELS(80, 20)],
    plots: [P('k', '%K', BLUE), P('d', '%D', ORANGE), LV(), F('bg', 'Pozadie medzi úrovňami', BLUE, 6, ['=upper', '=lower'])],
    label: s => `Stoch ${s.inputs.k} ${s.inputs.smooth} ${s.inputs.d}`, calc: (D, s) => stoch(D, s.inputs.k, s.inputs.smooth, s.inputs.d) });
  osc('stochrsi', { name: 'Stoch RSI', title: 'Stochastické RSI',
    inputs: [{ k: 'rsi', label: 'RSI perióda', def: 14, min: 1, max: 500 }, { k: 'k', label: 'Stoch perióda', def: 14, min: 1, max: 500 },
             { k: 'smooth', label: '%K vyhladenie', def: 3, min: 1, max: 100 }, { k: 'd', label: '%D', def: 3, min: 1, max: 100 }, SRC, ...LEVELS(80, 20)],
    plots: [P('k', '%K', BLUE), P('d', '%D', ORANGE), LV(), F('bg', 'Pozadie', BLUE, 6, ['=upper', '=lower'])],
    label: s => `Stoch RSI ${s.inputs.rsi} ${s.inputs.k}`, calc: (D, s) => stochOf(rsi(source(D, s.inputs.source), s.inputs.rsi), s.inputs.k, s.inputs.smooth, s.inputs.d) });
  osc('macd', { name: 'MACD', title: 'MACD', alpha: 55,
    inputs: [{ k: 'fast', label: 'Rýchla', def: 12, min: 1, max: 500 }, { k: 'slow', label: 'Pomalá', def: 26, min: 1, max: 500 }, { k: 'signal', label: 'Signál', def: 9, min: 1, max: 500 }, SRC],
    plots: [P('macd', 'MACD', BLUE), P('signal', 'Signál', ORANGE),
            P('h1', 'Histogram rastie nad 0', '#26a69a', { kind: 'color' }), P('h2', 'Histogram klesá nad 0', '#b2dfdb', { kind: 'color' }),
            P('h3', 'Histogram rastie pod 0', '#ffcdd2', { kind: 'color' }), P('h4', 'Histogram klesá pod 0', '#ff5252', { kind: 'color' })],
    histogram4: 'hist', label: s => `MACD ${s.inputs.fast} ${s.inputs.slow} ${s.inputs.signal}`,
    calc: (D, s) => macd(source(D, s.inputs.source), s.inputs.fast, s.inputs.slow, s.inputs.signal) });
  osc('ppo', { name: 'PPO', title: 'Percentuálny cenový oscilátor',
    inputs: [{ k: 'fast', label: 'Rýchla', def: 12, min: 1, max: 500 }, { k: 'slow', label: 'Pomalá', def: 26, min: 1, max: 500 }, { k: 'signal', label: 'Signál', def: 9, min: 1, max: 500 }, SRC],
    plots: [P('ppo', 'PPO', BLUE), P('signal', 'Signál', ORANGE), H('hist', 'Histogram', '#26a69a', '#ef5350')],
    label: s => `PPO ${s.inputs.fast} ${s.inputs.slow}`,
    calc: (D, s) => { const x = source(D, s.inputs.source), p = zip(ema(x, s.inputs.fast), ema(x, s.inputs.slow), (a, b) => 100 * (a - b) / b), sg = ema(p, s.inputs.signal);
      return { ppo: p, signal: sg, hist: zip(p, sg, (a, b) => a - b) }; } });
  osc('apo', { name: 'APO', title: 'Absolútny cenový oscilátor', inputs: [{ k: 'fast', label: 'Rýchla', def: 10, min: 1, max: 500 }, { k: 'slow', label: 'Pomalá', def: 21, min: 1, max: 500 }, SRC],
    plots: [P('apo', 'APO', BLUE), LV()], label: s => `APO ${s.inputs.fast} ${s.inputs.slow}`,
    calc: (D, s) => { const x = source(D, s.inputs.source); return { apo: zip(ema(x, s.inputs.fast), ema(x, s.inputs.slow), (a, b) => a - b) }; } });
  osc('cci', { name: 'CCI', title: 'Commodity Channel Index', inputs: [LEN(20), ...LEVELS(100, -100, -500, 500)],
    plots: [P('cci', 'CCI', '#26c6da'), LV(), F('bg', 'Pozadie', '#26c6da', 6, ['=upper', '=lower'])], label: s => `CCI ${s.inputs.period}`, calc: (D, s) => ({ cci: cci(D, s.inputs.period) }) });
  osc('willr', { name: 'Williams %R', title: 'Williamsovo %R', inputs: [LEN(14), ...LEVELS(-20, -80, -100, 0)],
    plots: [P('wr', '%R', '#7e57c2'), LV(), F('bg', 'Pozadie', '#7e57c2', 6, ['=upper', '=lower'])], label: s => `%R ${s.inputs.period}`,
    calc: (D, s) => { const hh = rmax(D.h, s.inputs.period), ll = rmin(D.l, s.inputs.period); return { wr: D.c.map((c, i) => (bad(hh[i]) || hh[i] === ll[i] ? NaN : -100 * (hh[i] - c) / (hh[i] - ll[i]))) }; } });
  osc('mom', { name: 'Momentum', title: 'Momentum (zmena za N sviečok)', inputs: [LEN(10), SRC], plots: [P('mom', 'Momentum', BLUE)],
    label: s => `Mom ${s.inputs.period}`, calc: (D, s) => ({ mom: diff(source(D, s.inputs.source), s.inputs.period) }) });
  osc('roc', { name: 'ROC', title: 'Rýchlosť zmeny (%)', inputs: [LEN(9), SRC], plots: [P('roc', 'ROC', BLUE), LV()],
    label: s => `ROC ${s.inputs.period}`, calc: (D, s) => { const x = source(D, s.inputs.source); return { roc: zip(x, lag(x, s.inputs.period), (a, b) => 100 * (a / b - 1)) }; } });
  osc('atr', { name: 'ATR', title: 'Priemerný skutočný rozsah', inputs: [LEN(14)], plots: [P('atr', 'ATR', '#ef5350')], label: s => `ATR ${s.inputs.period}`, calc: (D, s) => ({ atr: atr(D, s.inputs.period) }) });
  osc('adx', { name: 'ADX / DMI', title: 'Sila trendu (ADX, +DI, −DI)', inputs: [LEN(14), { k: 'level', label: 'Úroveň silného trendu', def: 25, min: 0, max: 100 }],
    plots: [P('adx', 'ADX', '#ff9800', { width: 2 }), P('pdi', '+DI', '#26a69a'), P('mdi', '−DI', '#ef5350'), LV()], label: s => `ADX ${s.inputs.period}`, calc: (D, s) => dmi(D, s.inputs.period) });
  osc('adxr', { name: 'ADXR', title: 'Hodnotenie ADX (priemer ADX teraz a pred N)', inputs: [LEN(14)], plots: [P('adxr', 'ADXR', '#ff9800')],
    label: s => `ADXR ${s.inputs.period}`, calc: (D, s) => { const a = dmi(D, s.inputs.period).adx; return { adxr: zip(a, lag(a, s.inputs.period), (x, y) => (x + y) / 2) }; } });
  osc('aroon', { name: 'Aroon', title: 'Aroon hore / dole', inputs: [LEN(14)], plots: [P('up', 'Aroon hore', ORANGE), P('dn', 'Aroon dole', BLUE)],
    label: s => `Aroon ${s.inputs.period}`, calc: (D, s) => { const p = s.inputs.period;
      return { up: map(barsSince(D.h, p, (a, b) => a >= b), v => 100 * (p - v) / p), dn: map(barsSince(D.l, p, (a, b) => a <= b), v => 100 * (p - v) / p) }; } });
  osc('aroonosc', { name: 'Aroon oscilátor', title: 'Aroon hore − dole', inputs: [LEN(14)], plots: [P('osc', 'Aroon osc', BLUE), LV()],
    label: s => `Aroon osc ${s.inputs.period}`, calc: (D, s) => { const a = S.aroon.calc(D, s); return { osc: zip(a.up, a.dn, (x, y) => x - y) }; } });
  osc('ao', { name: 'Awesome oscilátor', title: 'Bill Williams AO (SMA 5 − SMA 34 z hl2)', inputs: [], plots: [H('ao', 'AO', '#26a69a', '#ef5350')],
    label: () => 'AO', calc: D => { const x = source(D, 'hl2'); return { ao: zip(sma(x, 5), sma(x, 34), (a, b) => a - b) }; } });
  osc('ac', { name: 'Akcelerácia (AC)', title: 'Accelerator oscilátor (AO − SMA5 z AO)', inputs: [], plots: [H('ac', 'AC', '#26a69a', '#ef5350')],
    label: () => 'AC', calc: D => { const x = source(D, 'hl2'), ao = zip(sma(x, 5), sma(x, 34), (a, b) => a - b); return { ac: zip(ao, sma(ao, 5), (a, b) => a - b) }; } });
  osc('bop', { name: 'Balance of Power', title: 'Sila kupujúcich vs predávajúcich', inputs: [LEN(14, 'Vyhladenie')], plots: [P('bop', 'BOP', '#ef5350')],
    label: () => 'BOP', calc: (D, s) => ({ bop: sma(D.c.map((c, i) => (D.h[i] - D.l[i] ? (c - D.o[i]) / (D.h[i] - D.l[i]) : 0)), s.inputs.period) }) });
  osc('bbpct', { name: 'Bollinger %B', title: 'Poloha ceny v Bollingerových pásmach', inputs: [LEN(20), { k: 'mult', label: 'Násobok σ', def: 2, min: 0.1, max: 10, step: 0.1 }, SRC],
    plots: [P('pb', '%B', '#26a69a'), LV()], label: s => `%B ${s.inputs.period}`,
    calc: (D, s) => { const x = source(D, s.inputs.source), b = bollinger(x, s.inputs.period, s.inputs.mult); return { pb: x.map((v, i) => (b.upper[i] - b.lower[i] ? (v - b.lower[i]) / (b.upper[i] - b.lower[i]) : NaN)) }; } });
  osc('bbw', { name: 'Bollinger šírka', title: 'Bollinger Bandwidth', inputs: [LEN(20), { k: 'mult', label: 'Násobok σ', def: 2, min: 0.1, max: 10, step: 0.1 }, SRC],
    plots: [P('bw', 'Šírka', BLUE)], label: s => `BBW ${s.inputs.period}`,
    calc: (D, s) => { const b = bollinger(source(D, s.inputs.source), s.inputs.period, s.inputs.mult); return { bw: b.basis.map((m, i) => (m ? (b.upper[i] - b.lower[i]) / m : NaN)) }; } });
  osc('cmf', { name: 'Chaikin Money Flow', title: 'Tok peňazí (Chaikin)', inputs: [LEN(20)], plots: [P('cmf', 'CMF', '#43a047'), LV()],
    label: s => `CMF ${s.inputs.period}`, calc: (D, s) => { const mfv = D.c.map((c, i) => (D.h[i] - D.l[i] ? ((c - D.l[i]) - (D.h[i] - c)) / (D.h[i] - D.l[i]) * (D.v[i] || 0) : 0));
      return { cmf: zip(msum(mfv, s.inputs.period), msum(D.v, s.inputs.period), (a, b) => (b ? a / b : NaN)) }; } });
  osc('chaikin', { name: 'Chaikin oscilátor', title: 'EMA 3 − EMA 10 z akumulácie/distribúcie', inputs: [], plots: [P('co', 'Chaikin', '#ef5350'), LV()],
    label: () => 'Chaikin', calc: D => { const ad = adLine(D); return { co: zip(ema(ad, 3), ema(ad, 10), (a, b) => a - b) }; } });
  osc('cmo', { name: 'Chande Momentum', title: 'Chande Momentum oscilátor', inputs: [LEN(9), SRC, ...LEVELS(50, -50, -100, 100)], plots: [P('cmo', 'CMO', BLUE), LV()],
    label: s => `CMO ${s.inputs.period}`, calc: (D, s) => { const d = diff(source(D, s.inputs.source)), u = msum(map(d, v => Math.max(v, 0)), s.inputs.period), dn = msum(map(d, v => Math.max(-v, 0)), s.inputs.period);
      return { cmo: zip(u, dn, (a, b) => (a + b ? 100 * (a - b) / (a + b) : 0)) }; } });
  osc('mfi', { name: 'MFI', title: 'Money Flow Index (RSI s objemom)', inputs: [LEN(14), ...LEVELS(80, 20)], plots: [P('mfi', 'MFI', '#7e57c2'), LV(), F('bg', 'Pozadie', '#7e57c2', 6, ['=upper', '=lower'])],
    label: s => `MFI ${s.inputs.period}`, calc: (D, s) => ({ mfi: mfi(D, s.inputs.period) }) });
  osc('obv', { name: 'OBV', title: 'On Balance Volume', cat: 'vol', inputs: [], plots: [P('obv', 'OBV', BLUE)], label: () => 'OBV', calc: D => ({ obv: obv(D) }) });
  osc('ad', { name: 'Akumulácia / distribúcia', title: 'Accumulation/Distribution', cat: 'vol', inputs: [], plots: [P('ad', 'A/D', '#999999')], label: () => 'A/D', calc: D => ({ ad: adLine(D) }) });
  osc('pvt', { name: 'PVT', title: 'Price Volume Trend', cat: 'vol', inputs: [], plots: [P('pvt', 'PVT', BLUE)], label: () => 'PVT', calc: D => ({ pvt: pvt(D) }) });
  osc('netvol', { name: 'Čistý objem', title: 'Objem so znamienkom podľa smeru sviečky', cat: 'vol', inputs: [], plots: [H('nv', 'Čistý objem', '#26a69a', '#ef5350')],
    label: () => 'Čistý objem', calc: D => ({ nv: D.c.map((c, i) => (c >= D.o[i] ? 1 : -1) * (D.v[i] || 0)) }) });
  // Delta: aggressive buyers (market buys hitting the ask) minus aggressive sellers, per bar, from Binance taker volume.
  const delta = D => D.v.map((v, i) => (Number.isFinite(D.bv[i]) ? 2 * D.bv[i] - v : NaN));
  osc('delta', { name: 'Delta (kupujúci − predávajúci)', title: 'Objem agresívnych nákupov mínus predajov v každej sviečke', cat: 'vol', inputs: [],
    plots: [H('d', 'Delta', '#26a69a', '#ef5350')], label: () => 'Delta', calc: D => ({ d: delta(D) }) });
  osc('cvd', { name: 'Kumulatívna delta (CVD)', title: 'Súčet delty – kto má navrch dlhodobo; reset každú seanciu (voliteľne)', cat: 'vol',
    inputs: [{ k: 'reset', label: 'Reset každú seanciu (1 = áno)', def: 1, min: 0, max: 1 }], plots: [P('cvd', 'CVD', '#00bcd4', { width: 2 }), LV()],
    label: () => 'CVD', calc: (D, st) => { const d = delta(D); let c = 0; return { cvd: d.map((v, i) => { if (st.inputs.reset && i && D.s[i] !== D.s[i - 1]) c = 0; c += Number.isFinite(v) ? v : 0; return c; }) }; } });
  osc('volosc', { name: 'Objemový oscilátor', title: 'Rozdiel EMA objemu (%)', cat: 'vol', inputs: [{ k: 'fast', label: 'Rýchla', def: 5, min: 1, max: 200 }, { k: 'slow', label: 'Pomalá', def: 10, min: 1, max: 400 }],
    plots: [P('vo', 'Vol osc', BLUE), LV()], label: s => `VolOsc ${s.inputs.fast} ${s.inputs.slow}`, calc: (D, s) => ({ vo: zip(ema(D.v, s.inputs.fast), ema(D.v, s.inputs.slow), (a, b) => (b ? 100 * (a - b) / b : NaN)) }) });
  osc('efi', { name: 'Elder Force Index', title: 'Sila pohybu (zmena × objem)', cat: 'vol', inputs: [LEN(13)], plots: [P('efi', 'EFI', '#ef5350'), LV()],
    label: s => `EFI ${s.inputs.period}`, calc: (D, s) => ({ efi: ema(map(diff(D.c), (v, i) => v * (D.v[i] || 0)), s.inputs.period) }) });
  osc('eom', { name: 'Ease of Movement', title: 'Ľahkosť pohybu', cat: 'vol', inputs: [LEN(14)], plots: [P('eom', 'EOM', '#43a047'), LV()],
    label: s => `EOM ${s.inputs.period}`, calc: (D, s) => { const m = source(D, 'hl2');
      return { eom: sma(m.map((v, i) => (i && D.v[i] && D.h[i] - D.l[i] ? (v - m[i - 1]) / ((D.v[i] / 10000) / (D.h[i] - D.l[i])) : NaN)), s.inputs.period) }; } });
  osc('trix', { name: 'TRIX', title: 'Zmena trojitej EMA (%)', inputs: [LEN(18), SRC], plots: [P('trix', 'TRIX', '#ef5350'), LV()],
    label: s => `TRIX ${s.inputs.period}`, calc: (D, s) => { const e = ema(ema(ema(source(D, s.inputs.source), s.inputs.period), s.inputs.period), s.inputs.period); return { trix: zip(e, lag(e, 1), (a, b) => 10000 * (a / b - 1)) }; } });
  osc('uo', { name: 'Ultimate oscilátor', title: 'Larry Williams 7 · 14 · 28', inputs: [{ k: 'a', label: 'Krátka', def: 7, min: 1, max: 100 }, { k: 'b', label: 'Stredná', def: 14, min: 1, max: 200 }, { k: 'c', label: 'Dlhá', def: 28, min: 1, max: 400 }, ...LEVELS(70, 30)],
    plots: [P('uo', 'UO', '#f44336'), LV()], label: () => 'UO', calc: (D, s) => ({ uo: ultimate(D, s.inputs.a, s.inputs.b, s.inputs.c) }) });
  osc('dpo', { name: 'DPO', title: 'Oscilátor bez trendu (Detrended Price)', inputs: [LEN(21), SRC], plots: [P('dpo', 'DPO', '#43a047'), LV()],
    label: s => `DPO ${s.inputs.period}`, calc: (D, s) => { const x = source(D, s.inputs.source), m = sma(x, s.inputs.period); return { dpo: zip(lag(x, Math.floor(s.inputs.period / 2) + 1), m, (a, b) => a - b) }; } });   // no look-ahead
  osc('coppock', { name: 'Coppock krivka', title: 'WMA 10 zo súčtu ROC 14 a ROC 11', inputs: [SRC], plots: [P('cc', 'Coppock', BLUE), LV()],
    label: () => 'Coppock', calc: (D, s) => { const x = source(D, s.inputs.source), r = p => zip(x, lag(x, p), (a, b) => 100 * (a / b - 1)); return { cc: wma(zip(r(14), r(11), (a, b) => a + b), 10) }; } });
  osc('hv', { name: 'Historická volatilita', title: 'Ročná volatilita z log výnosov (%)', inputs: [LEN(10), { k: 'year', label: 'Sviečok za rok', def: 365, min: 1, max: 600000 }],
    plots: [P('hv', 'HV', '#2196f3')], label: s => `HV ${s.inputs.period}`,
    calc: (D, s) => ({ hv: map(stdev(zip(D.c, lag(D.c, 1), (a, b) => Math.log(a / b)), s.inputs.period), v => 100 * v * Math.sqrt(s.inputs.year)) }) });
  osc('stdev', { name: 'Smerodajná odchýlka', title: 'Standard deviation', inputs: [LEN(20), SRC], plots: [P('sd', 'σ', '#2196f3')], label: s => `StDev ${s.inputs.period}`,
    calc: (D, s) => ({ sd: stdev(source(D, s.inputs.source), s.inputs.period) }) });
  osc('vortex', { name: 'Vortex', title: 'Vortex indikátor (+VI / −VI)', inputs: [LEN(14)], plots: [P('vip', '+VI', BLUE), P('vim', '−VI', '#e91e63')],
    label: s => `VI ${s.inputs.period}`, calc: (D, s) => vortex(D, s.inputs.period) });
  osc('kst', { name: 'Know Sure Thing', title: 'KST (Pring)', inputs: [SRC], plots: [P('kst', 'KST', '#089981'), P('signal', 'Signál', RED), LV()], label: () => 'KST',
    calc: (D, s) => kst(source(D, s.inputs.source)) });
  osc('tsi', { name: 'True Strength Index', title: 'TSI (dvojito vyhladené momentum)', inputs: [{ k: 'long', label: 'Dlhá', def: 25, min: 1, max: 200 }, { k: 'short', label: 'Krátka', def: 13, min: 1, max: 200 }, { k: 'signal', label: 'Signál', def: 13, min: 1, max: 200 }, SRC],
    plots: [P('tsi', 'TSI', BLUE), P('signal', 'Signál', RED), LV()], label: s => `TSI ${s.inputs.long} ${s.inputs.short}`,
    calc: (D, s) => { const t = tsi(source(D, s.inputs.source), s.inputs.long, s.inputs.short); return { tsi: t, signal: ema(t, s.inputs.signal) }; } });
  osc('fisher', { name: 'Fisher transformácia', title: 'Fisher Transform (Ehlers)', inputs: [LEN(9)], plots: [P('fisher', 'Fisher', BLUE), P('trigger', 'Spúšť', ORANGE), LV()],
    label: s => `Fisher ${s.inputs.period}`, calc: (D, s) => fisher(D, s.inputs.period) });
  osc('massi', { name: 'Mass index', title: 'Mass index (Dorsey)', inputs: [LEN(10, 'Súčet za')], plots: [P('mi', 'Mass', '#e91e63')], label: s => `Mass ${s.inputs.period}`,
    calc: (D, s) => { const r = D.h.map((h, i) => h - D.l[i]), e1 = ema(r, 9), e2 = ema(e1, 9); return { mi: msum(zip(e1, e2, (a, b) => a / b), s.inputs.period) }; } });
  osc('chop', { name: 'Choppiness index', title: 'Index trhu do strán (vysoký = bez trendu)', inputs: [LEN(14), ...LEVELS(61.8, 38.2)], plots: [P('chop', 'CHOP', '#2962ff'), LV(), F('bg', 'Pozadie', '#2962ff', 6, ['=upper', '=lower'])],
    label: s => `CHOP ${s.inputs.period}`, calc: (D, s) => ({ chop: chop(D, s.inputs.period) }) });
  osc('rvi', { name: 'Relative Vigor Index', title: 'Relatívna sila pohybu', inputs: [LEN(10)], plots: [P('rvi', 'RVI', '#089981'), P('signal', 'Signál', RED)],
    label: s => `RVGI ${s.inputs.period}`, calc: (D, s) => rvi(D, s.inputs.period) });
  osc('elder', { name: 'Elder Ray', title: 'Sila býkov a medveďov (od EMA)', inputs: [LEN(13)], plots: [H('bull', 'Býci', '#26a69a', '#26a69a'), H('bear', 'Medvede', '#ef5350', '#ef5350')],
    label: s => `Elder ${s.inputs.period}`, calc: (D, s) => { const e = ema(D.c, s.inputs.period); return { bull: zip(D.h, e, (a, b) => a - b), bear: zip(D.l, e, (a, b) => a - b) }; } });
  osc('ulcer', { name: 'Ulcer index', title: 'Hĺbka a dĺžka prepadov', inputs: [LEN(14)], plots: [P('ui', 'Ulcer', '#e91e63')], label: s => `Ulcer ${s.inputs.period}`,
    calc: (D, s) => { const hh = rmax(D.c, s.inputs.period), dd = zip(D.c, hh, (c, h) => (100 * (c - h) / h) ** 2); return { ui: map(sma(dd, s.inputs.period), Math.sqrt) }; } });

  for (const [k, [name, dir]] of Object.entries(PATTERNS)) {
    S[`pat_${k}`] = { name, title: dir > 0 ? 'býčí sviečkový vzor' : dir < 0 ? 'medvedí sviečkový vzor' : 'sviečkový vzor', cat: 'pattern', pane: false, pattern: k, inputs: [],
      plots: [P('mark', 'Značka', dir > 0 ? '#26a69a' : dir < 0 ? '#ef5350' : '#ffb74d', { kind: 'color' })], label: () => name, calc: () => ({}) };
  }
  const STUDIES = S;
  function patternMarks(D, s) {
    const [name, dir, fn] = PATTERNS[STUDIES[s.type].pattern], out = [];
    for (let i = 0; i < D.c.length; i++) {
      let hit = false;
      try { hit = fn(D, i); } catch (e) { hit = false; }
      if (hit) out.push({ i, dir, text: name.split(' (')[0] });
    }
    return out;
  }

  const TIMEFRAMES = ['1s', '5s', '15s', '30s', '1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M'];
  const num = (v, d) => (v !== '' && v !== null && v !== undefined && Number.isFinite(+v) ? +v : d);
  let seq = 0;
  // Complete an instance (saved or new) with everything its type defines.
  function normalize(x) {
    const def = STUDIES[x && x.type];
    if (!def) return null;
    const inputs = {}, plots = {}, tfs = {};
    const stale = (x.v || 1) < (def.v || 1);
    for (const i of def.inputs) {
      const v = x.inputs && x.inputs[i.k];
      inputs[i.k] = i.type === 'source' ? (typeof v === 'string' ? v : i.def) : num(v, i.def);
    }
    for (const p of def.plots) {
      const v = (!stale && x.plots && x.plots[p.k]) || {};
      plots[p.k] = { color: v.color || p.color, opacity: num(v.opacity, p.opacity ?? 100), width: num(v.width, p.width || 1),
                     style: num(v.style, p.style || 0), type: num(v.type, p.type || 0),
                     visible: v.visible !== undefined ? v.visible !== false : p.visible !== false };
      if (p.color2) plots[p.k].color2 = v.color2 || p.color2;
    }
    for (const tf of TIMEFRAMES) tfs[tf] = !(x.tfs && x.tfs[tf] === false);
    const o = x.out || {};
    return { uid: x.uid || `s${Date.now().toString(36)}${(seq++).toString(36)}`, type: x.type, v: def.v || 1, visible: x.visible !== false,
             inputs, plots, tfs, temp: !!x.temp, above: !!x.above, alpha: num(x.alpha, def.alpha ?? 100), overlay: !!x.overlay, ovH: num(x.ovH, 30),
             float: x.float === undefined || x.float === null ? undefined : !!x.float,
             box: x.box && typeof x.box === 'object' ? { x: num(x.box.x, 1), y: num(x.box.y, 70), w: num(x.box.w, 43), h: num(x.box.h, 25) } : undefined,
             out: { precision: o.precision ?? 'auto', priceLabels: !!o.priceLabels, legendValues: o.legendValues !== false } };
  }
  function rgba(hex, opacity) {
    const h = (hex || '#000000').replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h.slice(0, 6), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(100, opacity ?? 100)) / 100})`;
  }

  return { ewm, ema, sma, wma, rma, rsi, macd, atr, dmi, bollinger, vwap, stoch, cci, source, trueRange,
           STUDIES, PATTERNS, TIMEFRAMES, normalize, rgba, patternMarks };
})();
if (typeof module !== 'undefined') module.exports = KS;
