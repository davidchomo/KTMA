// Algorithmic trading: published, well-known trading systems written as exact rules, plus an honest bar-by-bar backtest
// on our own data: the decision is made on a closed candle, the trade opens at the NEXT candle's open, a spread is paid,
// and when one candle touches both the stop and the target the stop counts first. Nothing is fitted to the data.
// ALGO.run(id, D, {symbol, params}) → {trades, stats, half, open, last}; D = {t, o, h, l, c, v, s} arrays (oldest first).

const ALGO = (() => {
  const fin = Number.isFinite;
  // spread + slippage per side, in price (paper estimate for the Binance contracts)
  const COST = { XAUUSD: 0.25, XAGUSD: 0.02, BTCUSD: 4, EURUSD: 0.00012, GBPUSD: 0.00015, AUDUSD: 0.00015 };
  const hh = (x, p, i) => { let m = -Infinity; for (let k = Math.max(0, i - p + 1); k <= i; k++) m = Math.max(m, x[k]); return m; };
  const ll = (x, p, i) => { let m = Infinity; for (let k = Math.max(0, i - p + 1); k <= i; k++) m = Math.min(m, x[k]); return m; };
  function supertrend(D, p, mult) {
    const a = KS.atr(D, p), n = D.c.length, dir = new Array(n).fill(0), line = new Array(n).fill(NaN);
    let up = NaN, dn = NaN, d = 1;
    for (let i = 0; i < n; i++) {
      if (!fin(a[i])) continue;
      const mid = (D.h[i] + D.l[i]) / 2, bu = mid - mult * a[i], bd = mid + mult * a[i];
      up = fin(up) && D.c[i - 1] > up ? Math.max(bu, up) : bu;
      dn = fin(dn) && D.c[i - 1] < dn ? Math.min(bd, dn) : bd;
      if (d > 0 && D.c[i] < up) d = -1; else if (d < 0 && D.c[i] > dn) d = 1;
      dir[i] = d; line[i] = d > 0 ? up : dn;
    }
    return { dir, line };
  }

  // Each system: prep(D, P) → A (arrays), entry(i, A, D) → +1 / −1 / 0 on the closed candle i,
  // stop(i, A, D, dir, px) → initial stop, target(...) optional, exit(i, A, D, pos) → true = close at this candle's close,
  // trail(i, A, D, pos) → new stop (only moves in the trade's favour); reverse: an opposite entry flips the position.
  const SYS = {
    tsmom: {
      name: 'Time-series momentum', family: 'Trend', icon: '📈',
      src: [['Moskowitz, Ooi, Pedersen (2012), Journal of Financial Economics', 'https://papers.ssrn.com/abstract=2089463'],
            ['Hurst, Ooi, Pedersen (2017), A Century of Evidence on Trend-Following', 'https://www.aqr.com/Insights/Research/Journal-Article/A-Century-of-Evidence-on-Trend-Following-Investing']],
      evidence: 'Najsilnejší akademický dôkaz: 58 trhov, 25+ rokov; potvrdené na 100+ rokoch dát. Po roku 2009 slabšie výsledky pri komoditách.',
      desc: 'Ak cena za posledných N sviečok stúpla, drž LONG; ak klesla, drž SHORT. Pozícia sa otočí, keď sa znamienko zmení.',
      rules: ['Signál = znamienko výnosu za posledných N sviečok (originál: 12 mesiacov).', 'LONG pri kladnom, SHORT pri zápornom; otočenie pri zmene.', 'Ochranný stop 4× ATR (originál stop nemá, riadi sa volatilitou).'],
      params: { look: 100 }, reverse: true, warm: P => P.look + 2,
      prep: (D, P) => ({ atr: KS.atr(D, 20) }),
      entry: (i, A, D, P) => Math.sign(D.c[i] - D.c[i - P.look]),
      stop: (i, A, D, dir, px) => px - dir * 4 * A.atr[i],
    },
    turtle: {
      name: 'Korytnačky (Donchian 20/10)', family: 'Trend / prerazenie', icon: '🐢',
      src: [['Curtis Faith – Way of the Turtle (2007), pravidlá Systému 1', 'https://en.wikipedia.org/wiki/Turtle_trading']],
      evidence: 'Slávny experiment R. Dennisa (1983–88). Systém vyhráva zriedka, ale veľké trendy pokryjú straty – úspešnosť býva 35–45 %.',
      desc: 'Vstup pri prerazení 20-sviečkového maxima / minima, výstup pri opačnom 10-sviečkovom extréme, stop 2N (N = ATR 20).',
      rules: ['LONG: close > max(high, 20 predošlých).', 'SHORT: close < min(low, 20 predošlých).', 'Stop 2 × ATR(20).', 'Výstup: close pod 10-sviečkovým minimom (long) / nad maximom (short).'],
      params: { entry: 20, exit: 10 }, warm: P => P.entry + 21,
      prep: (D, P) => ({ atr: KS.atr(D, 20) }),
      entry: (i, A, D, P) => (D.c[i] > hh(D.h, P.entry, i - 1) ? 1 : D.c[i] < ll(D.l, P.entry, i - 1) ? -1 : 0),
      stop: (i, A, D, dir, px) => px - dir * 2 * A.atr[i],
      exit: (i, A, D, pos, P) => (pos.dir > 0 ? D.c[i] < ll(D.l, P.exit, i - 1) : D.c[i] > hh(D.h, P.exit, i - 1)),
    },
    faber: {
      name: 'Trendový filter SMA 200 (Faber)', family: 'Trend', icon: '〰',
      src: [['Mebane Faber (2007), A Quantitative Approach to Tactical Asset Allocation', 'https://papers.ssrn.com/abstract=962461']],
      evidence: 'Jednoduchý trendový filter znížil prepady pri zachovaní výnosu na akciách, dlhopisoch, komoditách (1973–2012).',
      desc: 'Cena nad SMA 200 = drž LONG, pod ňou = SHORT. Chandelier stop 3 × ATR za najlepšou cenou.',
      rules: ['LONG pri prekrížení close nad SMA(200), SHORT pod ňu.', 'Trailing stop 3 × ATR(22) od najvyššej / najnižšej ceny v obchode.'],
      params: { len: 200 }, reverse: true, warm: P => P.len + 2,
      prep: (D, P) => ({ ma: KS.sma(D.c, P.len), atr: KS.atr(D, 22) }),
      entry: (i, A, D) => (D.c[i] > A.ma[i] && D.c[i - 1] <= A.ma[i - 1] ? 1 : D.c[i] < A.ma[i] && D.c[i - 1] >= A.ma[i - 1] ? -1 : 0),
      stop: (i, A, D, dir, px) => px - dir * 3 * A.atr[i],
      trail: (i, A, D, pos) => (pos.dir > 0 ? pos.best - 3 * A.atr[i] : pos.best + 3 * A.atr[i]),
    },
    rsi2: {
      name: 'Connors RSI(2)', family: 'Návrat k priemeru', icon: '📉',
      src: [['Connors & Alvarez – Short Term Trading Strategies That Work (2008)', 'https://www.tradingview.com/chart/CELG/EVXQPaR9-Larry-Connors-RSI-2-Trading-System-Surprising-Win-Rate/'],
            ['Nezávislý 25-ročný test variantu: úspešnosť ~74 %', 'https://algomatictrading.substack.com/p/strategy-6-my-take-on-larry-connors']],
      evidence: 'Vysoká úspešnosť (často 65–75 %) na akciových indexoch, ale malé zisky na obchod – citlivé na náklady. Na zlate/forexe treba overiť.',
      desc: 'Kupuj krátkodobý výpredaj v dlhodobom raste (RSI 2 < 10 nad SMA 200), predaj, keď sa cena vráti nad SMA 5.',
      rules: ['LONG: close > SMA(200) a RSI(2) < 10.', 'SHORT: close < SMA(200) a RSI(2) > 90.', 'Výstup: close > SMA(5) (long) / < SMA(5) (short).', 'Havarijný stop 3 × ATR (originál bez stopu).'],
      params: { lo: 10, hi: 90 }, warm: () => 202,
      prep: D => ({ ma: KS.sma(D.c, 200), ma5: KS.sma(D.c, 5), r: KS.rsi(D.c, 2), atr: KS.atr(D, 14) }),
      entry: (i, A, D, P) => (D.c[i] > A.ma[i] && A.r[i] < P.lo ? 1 : D.c[i] < A.ma[i] && A.r[i] > P.hi ? -1 : 0),
      stop: (i, A, D, dir, px) => px - dir * 3 * A.atr[i],
      exit: (i, A, D, pos) => (pos.dir > 0 ? D.c[i] > A.ma5[i] : D.c[i] < A.ma5[i]),
    },
    ibs: {
      name: 'Internal Bar Strength (IBS)', family: 'Návrat k priemeru', icon: '🕯',
      src: [['Pagonidis (2013) / Quantpedia – Internal Bar Strength', 'https://quantpedia.com/strategies/internal-bar-strength-in-equity-index-futures/']],
      evidence: 'Zatvorenie pri minime sviečky (IBS < 0,2) predpovedá krátkodobý odraz na indexových futures; slabší efekt na iných trhoch.',
      desc: 'Ak sviečka zavrie pri svojom minime v rastovom trende, kúp; predaj pri prvom zatvorení nad maximom predošlej sviečky.',
      rules: ['IBS = (close − low) / (high − low).', 'LONG: IBS < 0,2 a close > SMA(100). SHORT: IBS > 0,8 a close < SMA(100).', 'Výstup: close nad maximom (long) / pod minimom (short) predošlej sviečky, max. 8 sviečok.', 'Stop 2 × ATR.'],
      params: { lo: 0.2, hi: 0.8, maxBars: 8 }, warm: () => 102,
      prep: D => ({ ma: KS.sma(D.c, 100), atr: KS.atr(D, 14) }),
      entry: (i, A, D, P) => { const r = D.h[i] - D.l[i], ibs = r ? (D.c[i] - D.l[i]) / r : 0.5; return ibs < P.lo && D.c[i] > A.ma[i] ? 1 : ibs > P.hi && D.c[i] < A.ma[i] ? -1 : 0; },
      stop: (i, A, D, dir, px) => px - dir * 2 * A.atr[i],
      exit: (i, A, D, pos, P) => (pos.dir > 0 ? D.c[i] > D.h[i - 1] : D.c[i] < D.l[i - 1]) || i - pos.i0 >= P.maxBars,
    },
    bbmr: {
      name: 'Bollinger návrat v pásme (ADX < 20)', family: 'Návrat k priemeru', icon: '↔',
      src: [['John Bollinger – Bollinger on Bollinger Bands (2001)', 'https://www.bollingerbands.com/bollinger-bands']],
      evidence: 'Funguje v bočnom trhu; ADX filter vyraďuje trendy, v ktorých cena „jazdí po pásme".',
      desc: 'Keď sa cena v bočnom trhu vráti späť do Bollingerovho pásma, obchoduj návrat k strednej čiare.',
      rules: ['Bočný trh: ADX(14) < 20.', 'LONG: predošlá sviečka zavrela pod dolným pásmom (20, 2), táto nad ním.', 'Cieľ: stredná čiara; stop 1,5 × ATR.'],
      params: { len: 20, mult: 2 }, warm: P => P.len + 30,
      prep: (D, P) => ({ bb: KS.bollinger(D.c, P.len, P.mult), adx: KS.dmi(D, 14).adx, atr: KS.atr(D, 14) }),
      entry: (i, A, D) => { if (!(A.adx[i] < 20)) return 0; const b = A.bb; return D.c[i - 1] < b.lower[i - 1] && D.c[i] > b.lower[i] ? 1 : D.c[i - 1] > b.upper[i - 1] && D.c[i] < b.upper[i] ? -1 : 0; },
      stop: (i, A, D, dir, px) => px - dir * 1.5 * A.atr[i],
      target: (i, A) => A.bb.basis[i],
    },
    supertrend: {
      name: 'Supertrend (10, 3)', family: 'Trend', icon: '⚡',
      src: [['Olivier Seban – Supertrend (ATR trailing)', 'https://www.investopedia.com/supertrend-indicator-7976167']],
      evidence: 'Populárny ATR trailing systém; v trendoch silný, v bočnom trhu veľa malých strát.',
      desc: 'Drž smer Supertrendu (ATR 10 × 3). Otoč pozíciu, keď cena prerazí opačnú čiaru.',
      rules: ['LONG, keď close prerazí hornú čiaru; SHORT pod dolnú.', 'Stop = čiara Supertrendu (posúva sa s cenou).'],
      params: { len: 10, mult: 3 }, reverse: true, warm: P => P.len + 3,
      prep: (D, P) => supertrend(D, P.len, P.mult),
      entry: (i, A) => (A.dir[i] !== A.dir[i - 1] ? A.dir[i] : 0),
      stop: (i, A) => A.line[i],
      trail: (i, A) => A.line[i],
    },
    macd: {
      name: 'MACD v smere EMA 200', family: 'Trend / pullback', icon: '🌊',
      src: [['Gerald Appel – MACD (1979); EMA 200 trendový filter', 'https://www.investopedia.com/terms/m/macd.asp']],
      evidence: 'Klasický momentum vstup; filter EMA 200 obchoduje iba v smere hlavného trendu.',
      desc: 'Pri prekrížení MACD so signálnou čiarou pod nulou (v raste nad EMA 200) kúp; cieľ 1,5R.',
      rules: ['LONG: close > EMA(200), MACD prekríži signál nahor pod nulou.', 'SHORT: zrkadlovo.', 'Stop 1,5 × ATR, cieľ 1,5 × riziko.'],
      params: { rr: 1.5 }, warm: () => 202,
      prep: D => ({ ema: KS.ema(D.c, 200), m: KS.macd(D.c, 12, 26, 9), atr: KS.atr(D, 14) }),
      entry: (i, A, D) => { const m = A.m.macd, s = A.m.signal; return D.c[i] > A.ema[i] && m[i] > s[i] && m[i - 1] <= s[i - 1] && m[i] < 0 ? 1 : D.c[i] < A.ema[i] && m[i] < s[i] && m[i - 1] >= s[i - 1] && m[i] > 0 ? -1 : 0; },
      stop: (i, A, D, dir, px) => px - dir * 1.5 * A.atr[i],
      target: (i, A, D, dir, px, sl, P) => px + dir * P.rr * Math.abs(px - sl),
    },
    orb: {
      name: 'Prerazenie otváracieho rozsahu (Crabel)', family: 'Intraday prerazenie', icon: '⏰', intraday: true,
      src: [['Toby Crabel – Day Trading with Short Term Price Patterns and Opening Range Breakout (1990)', 'https://www.investopedia.com/terms/o/openingrangebreakout.asp']],
      evidence: 'Klasika intradenného obchodovania; na zlate súvisí s otvorením Londýna a New Yorku. Iba na minútových grafoch.',
      desc: 'Prvých N sviečok seansy vytvorí rozsah; obchoduj prvé prerazenie, stop na druhej strane, zavri na konci seansy.',
      rules: ['Rozsah = high/low prvých 6 sviečok seansy (deň UTC, pri kovoch CME seansa).', 'Prvé zatvorenie nad / pod rozsahom = vstup.', 'Stop na opačnej strane rozsahu, cieľ 1,5R, výstup najneskôr na konci seansy.'],
      params: { bars: 6, rr: 1.5 }, warm: () => 10,
      prep: (D, P) => {
        const n = D.c.length, s = D.s || D.t.map(t => Math.floor(t / 86400)), hi = new Array(n).fill(NaN), lo = new Array(n).fill(NaN), k = new Array(n).fill(0), last = new Array(n).fill(false);
        let start = 0;
        for (let i = 0; i < n; i++) { if (i && s[i] !== s[i - 1]) start = i; k[i] = i - start; last[i] = i + 1 < n && s[i + 1] !== s[i]; if (k[i] >= P.bars) { hi[i] = hh(D.h, P.bars, start + P.bars - 1); lo[i] = ll(D.l, P.bars, start + P.bars - 1); } }
        return { hi, lo, k, last, s, used: {} };
      },
      entry: (i, A, D) => { if (!fin(A.hi[i]) || A.used[A.s[i]] || A.last[i]) return 0; const d = D.c[i] > A.hi[i] ? 1 : D.c[i] < A.lo[i] ? -1 : 0; if (d) A.used[A.s[i]] = 1; return d; },
      stop: (i, A, D, dir) => (dir > 0 ? A.lo[i] : A.hi[i]),
      target: (i, A, D, dir, px, sl, P) => px + dir * P.rr * Math.abs(px - sl),
      exit: (i, A) => A.last[i],
    },
  };

  function run(id, D, opt = {}) {
    const S = SYS[id], P = { ...S.params, ...(opt.params || {}) }, n = D.c.length, cost = COST[opt.symbol] ?? 0;
    const A = S.prep(D, P), trades = [];
    let pos = null;
    const close = (i, px, why) => {
      const exit = px - pos.dir * cost / 2, ret = pos.dir * (exit - pos.entry) / pos.entry, risk = Math.abs(pos.entry - pos.sl0);
      trades.push({ dir: pos.dir, i0: pos.i0, i1: i, t0: D.t[pos.i0], t1: D.t[i], entry: pos.entry, exit, sl: pos.sl0, tp: pos.tp, ret, R: risk ? pos.dir * (exit - pos.entry) / risk : null, why, bars: i - pos.i0 });
      pos = null;
    };
    const start = Math.max(2, S.warm(P));
    for (let i = start; i < n; i++) {
      if (pos && i >= pos.i0) {
        // 1) stop / target inside this candle (stop first), 2) rule exit at the close, 3) trailing
        const hitSL = pos.dir > 0 ? D.l[i] <= pos.sl : D.h[i] >= pos.sl, hitTP = pos.tp && (pos.dir > 0 ? D.h[i] >= pos.tp : D.l[i] <= pos.tp);
        if (hitSL) close(i, pos.dir > 0 ? Math.min(D.o[i], pos.sl) : Math.max(D.o[i], pos.sl), 'stop');
        else if (hitTP) close(i, pos.tp, 'cieľ');
        else if (S.exit && S.exit(i, A, D, pos, P)) close(i, D.c[i], 'pravidlo');
        else {
          pos.best = pos.dir > 0 ? Math.max(pos.best, D.h[i]) : Math.min(pos.best, D.l[i]);
          if (S.trail) { const t = S.trail(i, A, D, pos, P); if (fin(t)) pos.sl = pos.dir > 0 ? Math.max(pos.sl, t) : Math.min(pos.sl, t); }
        }
      }
      if (i >= n - 1) break;
      const d = S.entry(i, A, D, P);
      if (!d) continue;
      if (pos && S.reverse && d === -pos.dir) close(i, D.c[i], 'otočenie');
      if (pos) continue;
      const px = D.o[i + 1] + d * cost / 2, sl = S.stop(i, A, D, d, px, P);
      if (!fin(sl) || (d > 0 ? sl >= px : sl <= px)) continue;
      const tp = S.target ? S.target(i, A, D, d, px, sl, P) : null;
      pos = { dir: d, i0: i + 1, sig: i, entry: px, sl, sl0: sl, tp: fin(tp) && (d > 0 ? tp > px : tp < px) ? tp : null, best: px };
    }
    return { trades, stats: stats(trades), half: stats(trades.filter(t => t.i0 >= n * 0.7)), open: pos && { ...pos, t0: D.t[pos.i0], sigT: D.t[pos.sig] }, n, P };
  }
  function stats(T) {
    const w = T.filter(t => t.ret > 0), l = T.filter(t => t.ret <= 0), gw = w.reduce((s, t) => s + t.ret, 0), gl = -l.reduce((s, t) => s + t.ret, 0);
    let eq = 1, peak = 1, dd = 0;
    const curve = [1];
    for (const t of T) { eq *= 1 + t.ret; peak = Math.max(peak, eq); dd = Math.max(dd, 1 - eq / peak); curve.push(eq); }
    const Rs = T.filter(t => fin(t.R)).map(t => t.R);
    return { n: T.length, win: T.length ? w.length / T.length : null, pf: gl ? gw / gl : w.length ? Infinity : null, ret: eq - 1, dd,
             avgR: Rs.length ? Rs.reduce((s, v) => s + v, 0) / Rs.length : null, exp: T.length ? T.reduce((s, t) => s + t.ret, 0) / T.length : null,
             bars: T.length ? T.reduce((s, t) => s + t.bars, 0) / T.length : null, curve };
  }
  // a score to rank systems: needs enough trades; rewards profit factor and expectancy, punishes drawdown,
  // and weighs the last 30 % of the data (the check period) heavily so that a lucky stretch does not win
  const score = (s, h) => (!s.n || s.n < 15 || s.pf === null ? -Infinity : Math.min(s.pf, 4) * 10 + (s.avgR || 0) * 5 - s.dd * 20 + Math.min(s.n, 100) / 50
    + (h && h.n >= 5 && h.pf !== null ? (Math.min(h.pf, 3) - 1) * 12 : -6));
  return { SYS, run, stats, score, COST };
})();
