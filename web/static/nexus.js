// Nexus: the floating ◆ NEXUS button and the base page behind it – profile, paper trading account (positions,
// history, balance), the SMA robot that watches every timeframe, trading ideas, chat folders, quotes and tips.
// NEXUS.init(ctx) connects it to the chart app; all data lives in the app state (synced with your name).

const NEXUS = (() => {
  const { $, $$, esc, LS } = UI;
  const LOT = { XAUUSD: 100, XAGUSD: 5000, XPTUSD: 100, XPDUSD: 100, EURUSD: 100000, BTCUSD: 1 };   // contract size of one lot; other coins: 1 coin
  const QUOTES = [
    ['Nikdy to nebolo moje premýšľanie, čo mi zarobilo veľké peniaze. Vždy to bolo moje sedenie.', 'Jesse Livermore'],
    ['Na Wall Street nie je nič nové. Ani nemôže byť, pretože špekulácia je stará ako hory.', 'Jesse Livermore'],
    ['Nesústreď sa na zarábanie peňazí, sústreď sa na ochranu toho, čo máš.', 'Paul Tudor Jones'],
    ['Porazení priemerujú porazených.', 'Paul Tudor Jones'],
    ['Prvky dobrého obchodovania sú: obmedzovanie strát, obmedzovanie strát a obmedzovanie strát.', 'Ed Seykota'],
    ['Vyhraj alebo prehraj – každý dostane od trhu to, čo chce.', 'Ed Seykota'],
    ['Pravidlo č. 1: nikdy nestrácaj peniaze. Pravidlo č. 2: nikdy nezabudni na pravidlo č. 1.', 'Warren Buffett'],
    ['Akciový trh je nástroj na presun peňazí od netrpezlivých k trpezlivým.', 'Warren Buffett'],
    ['Nie je dôležité, či máš pravdu, ale koľko zarobíš, keď ju máš, a koľko stratíš, keď ju nemáš.', 'George Soros'],
    ['Tvrdá realita obchodovania je, že každý obchod má neistý výsledok.', 'Mark Douglas'],
    ['Ak nestavíš, nemôžeš vyhrať. Ak prídeš o všetky žetóny, nemôžeš stavať.', 'Larry Hite'],
    ['Trh môže zostať iracionálny dlhšie, ako ty dokážeš zostať solventný.', 'pripisované J. M. Keynesovi'],
    ['Jednoducho počkám, kým v kúte neležia peniaze, a potom tam stačí ísť a zdvihnúť ich.', 'Jim Rogers'],
    ['Hlavným problémom investora – a dokonca jeho najhorším nepriateľom – je pravdepodobne on sám.', 'Benjamin Graham'],
    ['Vedz, čo vlastníš, a vedz, prečo to vlastníš.', 'Peter Lynch'],
    ['Neobchoduješ trh, obchoduješ svoje presvedčenie o trhu.', 'Van K. Tharp'],
    ['Naplánuj obchod a obchoduj podľa plánu.', 'príslovie obchodníkov'],
    ['Trend je tvoj priateľ – až kým sa neohne.', 'príslovie obchodníkov'],
  ];
  let ctx = null, S = null, page = null, prices = {}, priceT = null, robotT = null, robotBusy = false, tipIdx = Math.floor(Math.random() * 1000);
  const sym = id => (ctx.symbols().find(s => s.id === id) || { id, name: id, digits: 2 });
  const f2 = (v, id) => (Number.isFinite(v) ? (+v).toLocaleString('en-US', { minimumFractionDigits: sym(id).digits ?? 2, maximumFractionDigits: sym(id).digits ?? 2 }) : '—');
  const usd = v => (Number.isFinite(v) ? (v < 0 ? '−' : '') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
  const pnlOf = (p, price) => (Number.isFinite(price) ? (price - p.entry) * p.dir * p.lots * (LOT[p.symbol] || 1) : NaN);
  const when = t => new Date(t).toLocaleString('sk-SK', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  // ---- paper account -------------------------------------------------------------------------------
  // several paper accounts; the highlighted one gets the new trades (the old single account becomes the first one)
  function A() {
    const s = S();
    if (!Array.isArray(s.accounts) || !s.accounts.length) { s.accounts = [{ id: 'main', name: 'Hlavný účet', start: s.account.start, positions: s.account.positions, history: s.account.history }]; s.accountId = 'main'; }
    return s.accounts.find(x => x.id === s.accountId) || s.accounts[0];
  }
  // ---- shared accounts: kept on the server; a friend joins with a code (view only or trade) ------------------------
  // The account is saved whenever it differs from the last synced copy; if the friend saved first (409),
  // both versions are merged: histories are united, open positions taken from both, closed ones dropped.
  const me = () => (S().labeler || '').trim();
  const dataOf = a => ({ start: a.start, positions: a.positions, history: a.history });
  const sigOf = a => JSON.stringify(dataOf(a));
  const canTrade = (a = A()) => !a.shared || a.shared.role === 'owner' || a.shared.role === 'trade';
  function guard() { if (canTrade()) return true; ctx.toast(`👀 Účet „${A().name}“ môžeš iba sledovať`); return false; }
  function mergeAcc(local, server) {
    const key = h => h.id + '|' + h.exitTime, hist = [...(server.history || [])], seen = new Set(hist.map(key));
    for (const h of local.history) if (!seen.has(key(h))) hist.push(h);
    hist.sort((p, q) => q.exitTime - p.exitTime);
    const closed = new Set(hist.filter(h => !/\(časť\)/.test(h.reason || '')).map(h => h.id)), pos = new Map();
    for (const p of server.positions || []) pos.set(p.id, p);
    for (const p of local.positions) pos.set(p.id, p);
    return { start: local.start, positions: [...pos.values()].filter(p => !closed.has(p.id)), history: hist.slice(0, 500) };
  }
  const applyServer = (a, r) => { Object.assign(a, r.data ? { start: r.data.start ?? a.start, positions: r.data.positions || [], history: r.data.history || [] } : {});
    a.shared = { ...a.shared, id: r.id, rev: r.rev, role: r.role, owner: r.owner, members: r.members, code_view: r.code_view || a.shared.code_view, code_trade: r.code_trade || a.shared.code_trade };
    a.shared.sig = sigOf(a); a.name = r.name || a.name; };
  let pushing = false;
  async function syncShared() {
    for (const a of S().accounts.filter(x => x.shared)) {
      try {
        if (canTrade(a) && sigOf(a) !== a.shared.sig && !pushing) {
          pushing = true;
          let r = await fetch(`api/accounts/${a.shared.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: me(), rev: a.shared.rev, data: dataOf(a) }) });
          if (r.status === 409) {
            const srv = (await r.json()).detail, merged = mergeAcc(a, srv.data);
            r = await fetch(`api/accounts/${a.shared.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: me(), rev: srv.rev, data: merged }) });
          }
          if (r.ok) applyServer(a, await r.json());
          pushing = false;
        } else if (sigOf(a) === a.shared.sig) {
          const r = await fetch(`api/accounts/${a.shared.id}?name=${encodeURIComponent(me())}`);
          if (r.ok) { const d = await r.json(); if (d.rev !== a.shared.rev) { applyServer(a, d); if (a === A()) { paintCards(); ctx.onTrades(true); paintLive(); } } }
        }
      } catch (e) { pushing = false; }
    }
    ctx.save();
  }
  async function shareAccount(a) {
    if (!me()) { ctx.toast('Najprv zadaj svoje meno (Účet → Meno)'); return; }
    const r = await fetch('api/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ owner: me(), name: a.name, data: dataOf(a) }) });
    if (!r.ok) { ctx.toast('Zdieľanie zlyhalo'); return; }
    a.shared = {}; applyServer(a, await r.json()); ctx.save(); ctx.toast('🔗 Účet je zdieľaný – pošli kamarátovi kód');
  }
  async function joinAccount(code) {
    if (!me()) { ctx.toast('Najprv zadaj svoje meno (Účet → Meno)'); return; }
    const r = await fetch('api/accounts/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: me(), code }) });
    if (!r.ok) { ctx.toast((await r.json().catch(() => ({}))).detail || 'Neplatný kód'); return; }
    const d = await r.json(), ex = S().accounts.find(x => x.shared && x.shared.id === d.id);
    const a = ex || { id: 'sh' + d.id, name: d.name, start: 10000, positions: [], history: [], shared: {} };
    applyServer(a, d);
    if (!ex) S().accounts.push(a);
    S().accountId = a.id; ctx.save();
    ctx.toast(`🔗 Pripojený k účtu „${a.name}“ (${a.shared.role === 'trade' ? 'môžeš obchodovať' : 'iba sledovanie'})`);
  }
  // a trade from the Algo window (paper account)
  function algoTrade(o) {
    if (!canTrade()) return;
    const price = priceOf(o.symbol) ?? prices[o.symbol];
    const go = px => { openPos({ symbol: o.symbol, dir: o.dir, lots: o.lots, lots0: o.lots, entry: px, sl: o.sl, tp: o.tp, src: 'algo', note: o.note }); ctx.onTrades(true); };
    if (Number.isFinite(price)) go(price);
    else ctx.fetchBars(o.symbol, '1m', null, 10).then(b => b.length && go(b[b.length - 1].close)).catch(() => {});
  }
  function openPos(o) {
    if (!guard()) return null;
    const p = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), time: Date.now(), by: me(), ...o };
    p.lots0 = p.lots0 || p.lots;
    A().positions.push(p); ctx.save(); if (layer) paintCards(); return p;
  }
  function closePos(p, price, reason) {
    const a = A(); if (!a.positions.includes(p)) return;
    a.positions = a.positions.filter(x => x !== p);
    a.history.unshift({ ...p, exit: price, exitTime: Date.now(), pnl: pnlOf(p, price), reason });
    if (a.history.length > 500) a.history.length = 500;
    ctx.save();
    if (layer) paintCards();
  }
  function totals() {
    const a = A(), realized = a.history.reduce((s, h) => s + (Number.isFinite(h.pnl) ? h.pnl : 0), 0);
    const open = a.positions.reduce((s, p) => s + (Number.isFinite(pnlOf(p, prices[p.symbol])) ? pnlOf(p, prices[p.symbol]) : 0), 0);
    const done = a.history.filter(h => Number.isFinite(h.pnl)), wins = done.filter(h => h.pnl > 0).length;
    return { balance: a.start + realized, equity: a.start + realized + open, open, realized, win: done.length ? wins / done.length : null, n: done.length };
  }
  // last prices (and stop loss / take profit checks) every few seconds while something needs them
  async function pollPrices() {
    clearTimeout(priceT);
    const need = new Set([...A().positions.map(p => p.symbol), ...(page && page.classList.contains('open') ? ctx.symbols().map(s => s.id) : [])]);
    for (const id of need) {
      try {
        const bars = await ctx.fetchBars(id, '1m', null, 10), b = bars[bars.length - 1];
        if (!b) continue;
        prices[id] = b.close;
        if (!Number.isFinite(ctx.livePrice(id))) checkHits(id, b.close, b.close);   // the open chart is checked on every tick
      } catch (e) {}
    }
    if (page && page.classList.contains('open')) paintLive();
    paintCards();
    priceT = setTimeout(pollPrices, need.size ? 5000 : 20000);
  }

  // ---- SMA robot: above the average = buy, below = sell; a sharp run takes profit or flips -------------------
  const sma = (c, n, i) => { if (i < n - 1) return NaN; let s = 0; for (let k = i - n + 1; k <= i; k++) s += c[k]; return s / n; };
  function atr(b, n, i) { let s = 0, k = 0; for (let j = Math.max(1, i - n + 1); j <= i; j++, k++) s += Math.max(b[j].high - b[j].low, Math.abs(b[j].high - b[j - 1].close), Math.abs(b[j].low - b[j - 1].close)); return k ? s / k : NaN; }
  function log(R, key, text, kind) { R.log.unshift({ t: Date.now(), key, text, kind }); if (R.log.length > 200) R.log.length = 200; }
  function robotTrade(R, key, symbol, tf, dir, price, reason) {
    const st = R.state[key];
    if (st.pos) {
      const res = (price - st.entry) * st.pos;
      log(R, key, `${st.pos > 0 ? 'LONG' : 'SHORT'} zavretý @ ${f2(price, symbol)} (${res >= 0 ? '+' : ''}${f2(res, symbol)}) – ${reason}`, res >= 0 ? 'win' : 'loss');
      if (R.paper) { const p = A().positions.find(x => x.robot === key); if (p) closePos(p, price, 'robot: ' + reason); }
      st.pos = 0;
    }
    if (dir) {
      Object.assign(st, { pos: dir, entry: price, since: Date.now() });
      log(R, key, `${dir > 0 ? 'KÚPA (LONG)' : 'PREDAJ (SHORT)'} @ ${f2(price, symbol)} – ${reason}`, dir > 0 ? 'buy' : 'sell');
      if (R.paper) openPos({ symbol, dir, lots: R.lots, entry: price, src: 'robot', robot: key, note: `SMA${R.period} ${tf}` });
    }
  }
  async function robotTick() {
    clearTimeout(robotT);
    const R = S().robot;
    if (!R.on) return;
    if (!robotBusy) {
      robotBusy = true;
      for (const symbol of R.symbols) for (const tf of R.tfs) {
        const key = symbol + '|' + tf;
        try {
          const bars = await ctx.fetchBars(symbol, tf, null, Math.max(60, R.period * 3 + 20));
          if (bars.length < R.period + 20) continue;
          const live = bars[bars.length - 1], closed = bars.slice(0, -1), i = closed.length - 1, c = closed.map(b => b.close);
          const avg = sma(c, R.period, i), a = atr(closed, 14, i), sig = c[i] > avg ? 1 : c[i] < avg ? -1 : 0;
          const st = R.state[key] = R.state[key] || { pos: 0, entry: 0, wait: 0, bar: 0 };
          Object.assign(st, { price: live.close, sma: avg, sig, atr: a, checked: Date.now() });
          prices[symbol] = live.close;
          if (st.bar === closed[i].time) continue;                 // act once per closed candle of that timeframe
          const first = !st.bar; st.bar = closed[i].time;
          // a sharp, continuous run: the last N candles all one colour and together more than K × ATR
          const N = R.sharpBars, run = closed.slice(-N), dirs = run.map(b => Math.sign(b.close - b.open));
          const sharp = dirs.every(d => d === dirs[0] && d !== 0) && Math.abs(run[N - 1].close - run[0].open) >= R.sharpAtr * a ? dirs[0] : 0;
          st.sharp = sharp;
          if (first && !st.pos) { if (sig) robotTrade(R, key, symbol, tf, sig, live.close, `štart: cena ${sig > 0 ? 'nad' : 'pod'} SMA${R.period}`); continue; }
          if (st.pos && sharp === st.pos && (R.onSharp === 'take' || R.onSharp === 'both')) {
            robotTrade(R, key, symbol, tf, 0, live.close, `prudký pohyb v smere (${N} sviečky, ${(Math.abs(run[N - 1].close - run[0].open) / a).toFixed(1)}× ATR) – výber zisku`);
            st.wait = sharp; continue;
          }
          if (st.pos && sharp === -st.pos && (R.onSharp === 'flip' || R.onSharp === 'both')) {
            robotTrade(R, key, symbol, tf, sharp, live.close, `prudký pohyb proti pozícii – zmena smeru`); st.wait = 0; continue;
          }
          if (!st.pos) {
            if (st.wait && sig === -st.wait) st.wait = 0;               // after taking profit: wait until the price crosses the average again
            if (sig && !st.wait) robotTrade(R, key, symbol, tf, sig, live.close, `cena ${sig > 0 ? 'nad' : 'pod'} SMA${R.period}`);
          } else if (sig === -st.pos) robotTrade(R, key, symbol, tf, sig, live.close, `cena prekrížila SMA${R.period} – obrat`);
        } catch (e) { const st = R.state[key]; if (st) st.err = String(e.message || e); }
      }
      robotBusy = false;
      ctx.save();
      if (page && page.classList.contains('open')) paintLive();
    }
    robotT = setTimeout(robotTick, 30000);
  }

  // ---- ◆ NEXUS diamond: drag it anywhere, mouse wheel or right click to resize ----------------------------
  const DIAMOND = `<svg class="nx-dia" viewBox="0 0 100 90" aria-hidden="true">
    <defs><linearGradient id="nxDg" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#30343e"/><stop offset=".55" stop-color="#121419"/><stop offset="1" stop-color="#050608"/></linearGradient></defs>
    <path d="M4 31 L27 7 L73 7 L96 31 L50 86 Z" fill="url(#nxDg)"/>
    <path d="M27 7 L50 7 L38 31 Z" fill="rgba(255,255,255,.16)"/><path d="M4 31 L27 7 L19 31 Z" fill="rgba(255,255,255,.07)"/>
    <path d="M62 31 L73 7 L81 31 Z" fill="rgba(255,255,255,.05)"/><path d="M19 31 L38 31 L50 86 Z" fill="rgba(255,255,255,.06)"/>
    <g fill="none" stroke="#e9e9e9" stroke-linejoin="round" stroke-linecap="round">
      <path d="M4 31 L27 7 L73 7 L96 31 L50 86 Z" stroke-width="2.4"/>
      <g stroke-width="1" opacity=".72"><path d="M4 31 H96"/><path d="M27 7 L19 31 M27 7 L38 31 L50 7 L62 31 L73 7 L81 31"/>
        <path d="M19 31 L50 86 M38 31 L50 86 M62 31 L50 86 M81 31 L50 86"/><path d="M4 31 L30 55 M96 31 L70 55" opacity=".6"/></g>
    </g></svg><span class="nx-hud-t">NEXUS</span>`;
  function hud() {
    const b = $('#nexusHud'), N = S().nexus;
    b.innerHTML = DIAMOND;
    const size = () => Math.max(36, Math.min(220, N.hudSize || 64));
    const place = () => {
      const w = size(), h = Math.round(w * 0.9) + 16;
      b.style.width = w + 'px'; b.style.height = h + 'px'; b.style.fontSize = Math.max(8, w / 7) + 'px';
      const x = N.hudX ?? (innerWidth - w) / 2, y = N.hudY ?? innerHeight - h - 10;
      b.style.left = Math.max(0, Math.min(innerWidth - w, x)) + 'px'; b.style.top = Math.max(0, Math.min(innerHeight - h, y)) + 'px';
    };
    let d = null, saveT = null;
    const later = () => { clearTimeout(saveT); saveT = setTimeout(ctx.save, 400); };
    b.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const r = b.getBoundingClientRect();
      d = { dx: e.clientX - r.left, dy: e.clientY - r.top, sx: e.clientX, sy: e.clientY, moved: false };
      b.setPointerCapture(e.pointerId); e.preventDefault();
    });
    b.addEventListener('pointermove', e => {
      if (!d) return;
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
      d.moved = true; b.classList.add('drag');
      N.hudX = e.clientX - d.dx; N.hudY = e.clientY - d.dy; place();
    });
    const end = () => { if (!d) return; const m = d.moved; d = null; b.classList.remove('drag'); if (m) ctx.save(); else toggle(); };
    b.addEventListener('pointerup', end);
    b.addEventListener('pointercancel', () => { d = null; b.classList.remove('drag'); });
    b.addEventListener('wheel', e => {
      e.preventDefault();
      const r = b.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      N.hudSize = Math.round(Math.max(36, Math.min(220, size() * (e.deltaY < 0 ? 1.1 : 0.9))));
      N.hudX = cx - size() / 2; N.hudY = cy - (size() * 0.9 + 16) / 2; place(); later();
    }, { passive: false });
    b.addEventListener('contextmenu', e => {
      e.preventDefault();
      const m = UI.openMenu(b, `<div class="sec">◆ NEXUS</div><div class="lbl" style="padding:0 12px">Veľkosť</div>
        <span class="op" style="padding:0 12px 8px"><input type="range" min="36" max="220" value="${size()}" data-hs><b>${size()} px</b></span>
        <div class="it" data-ho><span class="ic">◆</span><span class="grow">Otvoriť Nexus</span></div>
        <div class="it" data-ht><span class="ic">💹</span><span class="grow">${PL().open ? 'Skryť' : 'Zobraziť'} obchodný panel (kúpiť / predať)</span></div>
        <div class="it" data-hr><span class="ic">↺</span><span class="grow">Vrátiť dole do stredu, pôvodná veľkosť</span></div>`, null, { side: b.getBoundingClientRect().top > innerHeight / 2 ? 'up' : undefined });
      if (!m) return;
      const r = $('[data-hs]', m);
      r.oninput = () => { N.hudSize = +r.value; r.nextElementSibling.textContent = r.value + ' px'; place(); later(); };
      $('[data-ho]', m).onclick = () => { UI.closeMenu(); open(); };
      $('[data-ht]', m).onclick = () => { UI.closeMenu(); const P = PL(); P.open = !P.open; ctx.save(); paintTicket(); ctx.onTrades(); };
      $('[data-hr]', m).onclick = () => { N.hudX = N.hudY = null; N.hudSize = 64; place(); ctx.save(); UI.closeMenu(); };
    });
    window.addEventListener('resize', place);
    place();
    hud.place = place;
  }

  // ---- positions on the chart: draggable cards with live P/L, close all / part, stop loss to break-even ----
  const CARD_DEF = { scale: 100, color: '#2962ff', opacity: 94, lines: false, robot: true, all: false };
  const CC = () => { const N = S().nexus, c = N.card = N.card || {}; for (const k in CARD_DEF) if (c[k] === undefined) c[k] = CARD_DEF[k]; return c; };
  const UIP = id => { const m = S().nexus.cards = S().nexus.cards || {}; return (m[id] = m[id] || {}); };
  let layer = null, lineSig = '';
  function closePart(p, lots, price, reason) {
    if (!guard()) return;
    lots = Math.round(Math.min(lots, p.lots) * 100) / 100;
    if (lots >= p.lots - 1e-9) return closePos(p, price, reason);
    A().history.unshift({ ...p, lots, exit: price, exitTime: Date.now(), pnl: pnlOf({ ...p, lots }, price), reason: reason + ' (časť)' });
    p.lots = Math.round((p.lots - lots) * 100) / 100;
    ctx.save();
  }
  const priceOf = id => { const l = ctx.livePrice(id); return Number.isFinite(l) ? l : prices[id]; };
  function shownPositions() {
    const C = CC(), cur = ctx.chartSymbol();
    return A().positions.filter(p => (C.all || p.symbol === cur) && (C.robot || p.src !== 'robot'));
  }
  function cardShell(p) {
    const s = sym(p.symbol);
    return `<div class="pc-h" data-drag><span class="pc-dir ${p.dir > 0 ? 'l' : 's'}">${p.dir > 0 ? '▲ LONG' : '▼ SHORT'}</span><b>${esc(s.name)}</b><small class="pc-lots"></small>
        <span class="grow"></span><b class="pc-mini"></b><button data-a="min" title="Zbaliť / rozbaliť">–</button><button data-a="cfg" title="Vzhľad (veľkosť, farba, čiary)">⚙</button></div>
      <div class="pc-body"><div class="pc-pnl"></div><div class="pc-sub"></div>
        <div class="pc-stats"><span title="Najväčší zisk počas obchodu">▲ <b class="pc-best"></b></span><span title="Najväčšia strata počas obchodu">▼ <b class="pc-worst"></b></span><span title="Ako dlho je obchod otvorený">⏱ <b class="pc-dur"></b></span></div>
        <div class="pc-sltp"><label>SL <input data-f="sl" type="number" step="any"></label><label>TP <input data-f="tp" type="number" step="any"></label></div>
        <div class="pc-add"><button data-a="addsl" title="Pridať stop loss (potom ho ťaháš v grafe)">+ SL</button><button data-a="addtp" title="Pridať take profit">+ TP</button><button data-a="addptp" title="Čiastočný take profit – zavrie časť pozície">+ čiastočný TP</button></div>
        <div class="pc-ptps"></div><div class="pc-exp"></div>
        <div class="pc-btns"><button data-a="be" title="Posunúť stop loss na vstupnú cenu (break-even)">SL → BE</button><button data-a="part" title="Zavrieť časť pozície">Časť ▾</button><button data-a="close" class="pc-x">Zavrieť</button></div>
        <div class="pc-part"><button data-p="25">25 %</button><button data-p="50">50 %</button><button data-p="75">75 %</button><input data-pl type="number" step="0.01" min="0.01" placeholder="lotov"><button data-p="lots">OK</button></div>
        ${p.src === 'robot' || p.src === 'algo' ? `<div class="pc-note">${p.src === 'algo' ? '🧠' : '🤖'} ${esc(p.note || 'robot')}</div>` : ''}${p.by && p.by !== me() ? `<div class="pc-note">👤 otvoril ${esc(p.by)}</div>` : ''}</div>`;
  }
  function paintCards() {
    if (!layer) return;
    const C = CC(), list = shownPositions(), ids = new Set(list.map(p => p.id));
    $$('.pcard', layer).forEach(el => { if (!ids.has(el.dataset.id)) el.remove(); });
    list.forEach((p, i) => {
      let el = layer.querySelector(`.pcard[data-id="${p.id}"]`);
      const u = UIP(p.id);
      if (!el) {
        el = document.createElement('div'); el.className = 'pcard'; el.dataset.id = p.id; el.innerHTML = cardShell(p); layer.appendChild(el); bindCard(el, p);
        if (u.x === undefined) { u.x = 70 + (i % 4) * 24; u.y = 120 + i * 34; }
      }
      const price = priceOf(p.symbol), v = pnlOf(p, price), pts = Number.isFinite(price) ? (price - p.entry) * p.dir : NaN;
      el.style.left = Math.max(0, Math.min(innerWidth - 60, u.x)) + 'px'; el.style.top = Math.max(0, Math.min(innerHeight - 30, u.y)) + 'px';
      el.style.setProperty('--pc', u.color || C.color); el.style.setProperty('--pco', C.opacity / 100);
      el.style.transform = `scale(${C.scale / 100})`;
      el.classList.toggle('min', !!u.min); el.classList.toggle('win', v > 0); el.classList.toggle('loss', v < 0);
      $('.pc-lots', el).textContent = `${p.lots} lot`;
      const cash = Number.isFinite(v) ? (v >= 0 ? '+' : '') + usd(v) : '…';
      $('.pc-pnl', el).textContent = cash; $('.pc-mini', el).textContent = cash;
      $('.pc-sub', el).textContent = `${f2(p.entry, p.symbol)} → ${f2(price, p.symbol)} · ${Number.isFinite(pts) ? (pts >= 0 ? '+' : '') + f2(pts, p.symbol) + ' b' : ''}`;
      for (const k of ['sl', 'tp']) { const inp = $(`[data-f=${k}]`, el); if (document.activeElement !== inp) inp.value = p[k] == null ? '' : (+p[k]).toFixed(sym(p.symbol).digits ?? 2); }
      $('.pc-best', el).textContent = money(p.best); $('.pc-worst', el).textContent = money(p.worst); $('.pc-dur', el).textContent = dur(Date.now() - p.time);
      $('[data-a=addsl]', el).style.display = p.sl ? 'none' : ''; $('[data-a=addtp]', el).style.display = p.tp ? 'none' : '';
      const pt = $('.pc-ptps', el), sig = JSON.stringify(p.tps || []);
      // rebuilt only when the partial targets change (a rebuild under the mouse would swallow clicks)
      if (pt.dataset.sig !== sig && !pt.contains(document.activeElement)) {
        pt.dataset.sig = sig;
        pt.innerHTML = (p.tps || []).map((t, k) => `<div>TP${k + 1} <b>${f2(t.price, p.symbol)}</b> <input type="number" min="1" max="100" value="${t.pct}" data-pct="${k}"> % · ${ptpLots(p, t)} lot · <b class="up">${money(lotsAt(p, ptpLots(p, t))(t.price))}</b><button data-dt="${k}" title="Zmazať">✕</button></div>`).join('');
      }
      const e = expected(p);
      $('.pc-exp', el).innerHTML = e.sl !== null || e.tp !== null ? `Pri SL <b class="dn">${e.sl === null ? '—' : money(e.sl)}</b> · pri TP <b class="up">${e.tp === null ? '—' : money(e.tp)}</b>${e.rr ? ` · R:R 1:${e.rr.toFixed(2)}` : ''}` : '<span class="muted">Bez SL a TP – pridaj ich a ťahaj čiary v grafe</span>';
    });
    // the chart layer redraws the SL / TP lines; markers only when trades change
    const ms = JSON.stringify(chartMarkers(ctx.chartSymbol()));
    ctx.onTrades(ms !== lineSig); lineSig = ms;
  }
  function bindCard(el, p) {
    const u = UIP(p.id), head = $('[data-drag]', el);
    let d = null;
    head.addEventListener('pointerdown', e => {
      if (e.target.closest('button, input')) return;
      d = { x: e.clientX - u.x, y: e.clientY - u.y }; head.setPointerCapture(e.pointerId); e.preventDefault(); el.classList.add('drag');
    });
    head.addEventListener('pointermove', e => { if (!d) return; u.x = e.clientX - d.x; u.y = e.clientY - d.y; el.style.left = u.x + 'px'; el.style.top = u.y + 'px'; });
    head.addEventListener('pointerup', () => { if (d) { d = null; el.classList.remove('drag'); ctx.save(); } });
    head.addEventListener('dblclick', e => { if (!e.target.closest('button, input')) { u.min = !u.min; ctx.save(); paintCards(); } });
    const now = () => priceOf(p.symbol);
    el.addEventListener('click', e => {
      const a = e.target.dataset.a, pp = e.target.dataset.p;
      if (a === 'min') { u.min = !u.min; ctx.save(); paintCards(); }
      else if (a === 'addsl') addLevel(p, 'sl');
      else if (a === 'addtp') addLevel(p, 'tp');
      else if (a === 'addptp') addLevel(p, 'ptp');
      else if (e.target.dataset.dt !== undefined) { p.tps.splice(+e.target.dataset.dt, 1); ctx.save(); paintCards(); }
      else if (a === 'cfg') cardSettings(p);
      else if (a === 'part') el.classList.toggle('parting');
      else if (a === 'be') {
        const price = now();
        if (Number.isFinite(price) && (price - p.entry) * p.dir <= 0) { ctx.toast('Pozícia nie je v zisku – SL na vstupe by sa hneď spustil'); return; }
        p.sl = p.entry; ctx.save(); paintCards(); ctx.toast(`🛡 SL posunutý na break-even ${f2(p.entry, p.symbol)}`);
      } else if (a === 'close') {
        const price = now(); if (!Number.isFinite(price)) return;
        const v = pnlOf(p, price); closePos(p, price, 'ručne (graf)'); ctx.toast(`Zavreté ${sym(p.symbol).name} · ${v >= 0 ? '+' : ''}${usd(v)}`); paintCards(); paintLive();
      } else if (pp) {
        const price = now(); if (!Number.isFinite(price)) return;
        const lots = pp === 'lots' ? +$('[data-pl]', el).value : p.lots * +pp / 100;
        if (!(lots > 0)) { ctx.toast('Zadaj počet lotov'); return; }
        const part = Math.round(Math.min(Math.max(0.01, lots), p.lots) * 100) / 100;
        closePart(p, part, price, 'ručne (graf)'); el.classList.remove('parting'); ctx.toast(`Zavretá časť: ${part} lot`); paintCards(); paintLive();
      }
    });
    el.addEventListener('change', e => { const k = e.target.dataset.pct; if (k === undefined) return; p.tps[+k].pct = Math.max(1, Math.min(100, Math.round(+e.target.value || 50))); ctx.save(); $('.pc-ptps', el).dataset.sig = ''; e.target.blur(); paintCards(); });
    $$('[data-f]', el).forEach(inp => inp.onchange = () => { const v = +inp.value; p[inp.dataset.f] = inp.value === '' || !Number.isFinite(v) ? null : v; ctx.save(); paintCards(); });
  }
  function cardSettings(p) {
    const C = CC(), u = UIP(p.id), COLORS = ['#2962ff', '#7b61ff', '#26c6da', '#089981', '#ffb300', '#ff7043', '#f23645', '#e0e3eb', '#5d606b'];
    const d = UI.openDialog(`<div class="dlg-h"><span>⚙ Pozície v grafe</span><button class="ib" data-x>✕</button></div><div class="dlg-b">
      <div class="sec2">Všetky karty</div>
      <div class="fld"><span>Veľkosť</span><span class="op" style="width:240px"><input type="range" min="60" max="220" value="${C.scale}" data-cs="scale"><b>${C.scale} %</b></span></div>
      <div class="fld"><span>Krytie pozadia</span><span class="op" style="width:240px"><input type="range" min="30" max="100" value="${C.opacity}" data-cs="opacity"><b>${C.opacity} %</b></span></div>
      <div class="fld"><span>Farba</span><span class="ctl">${COLORS.map(c => `<button class="pc-sw ${C.color === c ? 'on' : ''}" data-cc="${c}" style="background:${c}"></button>`).join('')}<input type="color" value="${C.color}" data-ccp></span></div>
      <div class="fld"><label class="ctl"><input type="checkbox" data-cb="lines" ${C.lines ? 'checked' : ''}> Čiary vstupu, SL a TP v grafe</label></div>
      <div class="fld"><label class="ctl"><input type="checkbox" data-cb="robot" ${C.robot ? 'checked' : ''}> Zobraziť aj pozície robota 🤖</label></div>
      <div class="fld"><label class="ctl"><input type="checkbox" data-cb="all" ${C.all ? 'checked' : ''}> Pozície všetkých symbolov (nielen otvoreného grafu)</label></div>
      <div class="fld"><span>Rozmiestnenie</span><button class="btn sm" data-stack>Zoradiť karty pod seba</button></div>
      <div class="sec2">Iba táto pozícia (${esc(sym(p.symbol).name)} ${p.dir > 0 ? 'LONG' : 'SHORT'})</div>
      <div class="fld"><span>Vlastná farba</span><span class="ctl">${COLORS.map(c => `<button class="pc-sw ${u.color === c ? 'on' : ''}" data-uc="${c}" style="background:${c}"></button>`).join('')}<button class="btn sm" data-uc="">Ako ostatné</button></span></div>
      </div><div class="dlg-f"><span class="grow"></span><button class="btn pri" data-x>Hotovo</button></div>`);
    const upd = () => { ctx.save(); paintCards(); };
    $$('[data-cs]', d).forEach(x => x.oninput = () => { C[x.dataset.cs] = +x.value; x.nextElementSibling.textContent = x.value + ' %'; upd(); });
    $$('[data-cc]', d).forEach(x => x.onclick = () => { C.color = x.dataset.cc; $$('[data-cc]', d).forEach(y => y.classList.toggle('on', y === x)); upd(); });
    $('[data-ccp]', d).oninput = e => { C.color = e.target.value; upd(); };
    $$('[data-cb]', d).forEach(x => x.onchange = () => { C[x.dataset.cb] = x.checked; upd(); });
    $$('[data-uc]', d).forEach(x => x.onclick = () => { u.color = x.dataset.uc || undefined; $$('[data-uc]', d).forEach(y => y.classList.toggle('on', y === x)); upd(); });
    $('[data-stack]', d).onclick = () => { shownPositions().forEach((q, i) => Object.assign(UIP(q.id), { x: 70, y: 110 + i * (UIP(q.id).min ? 40 : 160) * C.scale / 100 })); upd(); };
    $$('[data-x]', d).forEach(x => x.onclick = UI.closeDialog);
  }

  // ---- trade tracking: best / worst P/L during the trade, partial take profits, expected results ------------
  const dur = ms => { const m = Math.max(0, Math.round(ms / 60000)); return m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h`; };
  const money = v => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + usd(v) : '—');
  const tickOf = id => 1 / 10 ** (sym(id).digits ?? 2);
  const rnd = (id, v) => +(+v).toFixed(sym(id).digits ?? 2);   // a price on the symbol's tick, without float noise
  const lotsAt = (p, lots) => (price) => (price - p.entry) * p.dir * lots * (LOT[p.symbol] || 1);
  const ptpLots = (p, t) => Math.round((p.lots0 || p.lots) * t.pct) / 100;
  let trackSave = 0;
  function track(p, price) {
    const v = pnlOf(p, price);
    if (!Number.isFinite(v)) return;
    if (p.best === undefined || v > p.best) { p.best = v; p.bestPx = price; }
    if (p.worst === undefined || v < p.worst) { p.worst = v; p.worstPx = price; }
    if (Date.now() - trackSave > 5000) { trackSave = Date.now(); ctx.save(); }
  }
  // what the trade makes if the stop loss is hit, and if every take profit is hit (partials first)
  function expected(p) {
    const parts = (p.tps || []).reduce((s, t) => s + ptpLots(p, t), 0), rest = Math.max(0, Math.round((p.lots - parts) * 100) / 100);
    const sl = p.sl ? lotsAt(p, p.lots)(p.sl) : null;
    const tp = p.tp || (p.tps || []).length ? (p.tps || []).reduce((s, t) => s + lotsAt(p, ptpLots(p, t))(t.price), 0) + (p.tp ? lotsAt(p, rest)(p.tp) : 0) : null;
    return { sl, tp, rr: sl && tp ? tp / Math.abs(sl) : null, rest };
  }
  // hi / lo = the highest and lowest price since the last check
  function checkHits(id, hi, lo) {
    if (!canTrade()) return;                     // the account owner's / trader's app closes the trades
    for (const p of [...A().positions].filter(x => x.symbol === id)) {
      track(p, hi); track(p, lo);
      if (p.sl && (p.dir > 0 ? lo <= p.sl : hi >= p.sl)) { closePos(p, p.sl, 'stop loss'); ctx.toast(`🛑 ${sym(id).name}: stop loss ${f2(p.sl, id)}`); continue; }
      for (const t of [...(p.tps || [])]) {
        if (!(p.dir > 0 ? hi >= t.price : lo <= t.price)) continue;
        p.tps = p.tps.filter(x => x !== t);
        const lots = Math.min(p.lots, ptpLots(p, t));
        closePart(p, lots, t.price, `čiastočný TP ${t.pct} %`); ctx.toast(`🎯 ${sym(id).name}: čiastočný TP ${f2(t.price, id)} · ${lots} lot`);
        if (!A().positions.includes(p)) break;
      }
      if (!A().positions.includes(p)) continue;
      if (p.tp && (p.dir > 0 ? hi >= p.tp : lo <= p.tp)) { closePos(p, p.tp, 'take profit'); ctx.toast(`🎯 ${sym(id).name}: take profit ${f2(p.tp, id)}`); }
    }
  }

  // ---- what the chart draws: SL / TP / partial TP lines (draggable), entries and exits -----------------------
  function chartLines(symbol) {
    const out = [], C = CC(), now = priceOf(symbol);
    for (const p of A().positions.filter(x => x.symbol === symbol)) {
      const col = UIP(p.id).color || C.color, e = expected(p), tag = `${p.dir > 0 ? 'BUY' : 'SELL'} ${p.lots}`;
      if (C.lines) out.push({ pid: p.id, kind: 'entry', price: p.entry, color: col, text: `${tag} · ${money(pnlOf(p, now))}`, solid: true });
      if (p.sl) out.push({ pid: p.id, kind: 'sl', price: p.sl, color: '#f23645', text: `SL ${tag} · ${money(e.sl)}`, drag: true, del: true });
      (p.tps || []).forEach((t, i) => out.push({ pid: p.id, kind: 'ptp', idx: i, price: t.price, color: '#26c6da', text: `TP${i + 1} ${t.pct} % · ${money(lotsAt(p, ptpLots(p, t))(t.price))}`, drag: true, del: true }));
      if (p.tp) out.push({ pid: p.id, kind: 'tp', price: p.tp, color: '#089981', text: `TP ${tag} · ${money(lotsAt(p, e.rest)(p.tp))}`, drag: true, del: true });
    }
    const P = PL();
    if (P.open && symbol === ctx.chartSymbol() && Number.isFinite(now)) {
      const pv = planView(now);
      if (P.slOn) out.push({ pid: 'plan', kind: 'sl', price: pv.sl, color: '#ff8a65', text: `Plán SL · ${pv.dir > 0 ? 'BUY' : 'SELL'} ${P.lots} · ${money(pv.slMoney)}`, drag: true, plan: true });
      if (P.tpOn) out.push({ pid: 'plan', kind: 'tp', price: pv.tp, color: '#69f0ae', text: `Plán TP · ${pv.dir > 0 ? 'BUY' : 'SELL'} ${P.lots} · ${money(pv.tpMoney)}`, drag: true, plan: true });
    }
    return out;
  }
  function chartTrades(symbol) {
    return A().history.filter(h => h.symbol === symbol && Number.isFinite(h.exit)).slice(0, 80)
      .map(h => ({ t1: h.time / 1000, p1: h.entry, t2: h.exitTime / 1000, p2: h.exit, win: h.pnl > 0, dir: h.dir }));
  }
  function chartMarkers(symbol) {
    const out = [];
    for (const p of A().positions.filter(x => x.symbol === symbol)) out.push({ time: p.time / 1000, dir: p.dir, kind: 'in', text: `${p.dir > 0 ? 'BUY' : 'SELL'} ${p.lots0 || p.lots}` });
    for (const h of A().history.filter(x => x.symbol === symbol).slice(0, 80)) {
      out.push({ time: h.time / 1000, dir: h.dir, kind: 'in', text: `${h.dir > 0 ? 'BUY' : 'SELL'} ${h.lots}` });
      out.push({ time: h.exitTime / 1000, dir: h.dir, kind: 'out', win: h.pnl > 0, text: `✕ ${money(h.pnl)}` });
    }
    return out;
  }
  function moveLine(pid, kind, idx, price, final) {
    if (pid !== 'plan' && !canTrade()) return;
    const sy = pid === 'plan' ? ctx.chartSymbol() : (A().positions.find(x => x.id === pid) || {}).symbol;
    if (!sy) return;
    const tk = tickOf(sy); price = rnd(sy, price);
    if (pid === 'plan') { const P = PL(), now = priceOf(sy); P[kind + 'D'] = Math.abs(price - now); P[kind + 'Side'] = Math.sign(price - now) || 1; if (final) ctx.save(); paintTicket(); return; }
    const p = A().positions.find(x => x.id === pid), now = priceOf(p.symbol);
    // a stop or a target on the wrong side of the price would fire at once: keep it on its own side
    if (Number.isFinite(now)) {
      if (kind === 'sl') price = p.dir > 0 ? Math.min(price, now - tk) : Math.max(price, now + tk);
      else price = p.dir > 0 ? Math.max(price, now + tk) : Math.min(price, now - tk);
    }
    price = rnd(p.symbol, price);
    if (kind === 'ptp') p.tps[idx].price = price; else p[kind] = price;
    if (final) ctx.save();
    paintCards();
  }
  function removeLine(pid, kind, idx) {
    if (pid !== 'plan' && !guard()) return;
    if (pid === 'plan') { PL()[kind + 'On'] = false; ctx.save(); paintTicket(); return; }
    const p = A().positions.find(x => x.id === pid); if (!p) return;
    if (kind === 'ptp') p.tps.splice(idx, 1); else p[kind] = null;
    ctx.save(); paintCards();
  }
  // default distance for a new stop / target: 0.3 % / 0.6 % of the price, or the last one you dragged
  function addLevel(p, kind) {
    if (!guard()) return;
    const now = priceOf(p.symbol); if (!Number.isFinite(now)) return;
    const d = now * (kind === 'sl' ? 0.003 : 0.006);
    if (kind === 'sl') p.sl = now - p.dir * d;
    else if (kind === 'tp') p.tp = now + p.dir * d;
    else {
      p.tps = p.tps || []; p.lots0 = p.lots0 || p.lots;
      const far = p.tp || now + p.dir * d;
      p.tps.push({ price: now + (far - now) / 2, pct: 50 });
    }
    ['sl', 'tp'].forEach(k => { if (p[k]) p[k] = rnd(p.symbol, p[k]); });
    (p.tps || []).forEach(t => { t.price = rnd(p.symbol, t.price); });
    ctx.save(); paintCards();
  }

  // ---- trade ticket: lot size, BUY / SELL, stop loss and target planned by dragging lines on the chart -----------
  const PLAN_DEF = { open: true, lots: 0.1, slOn: false, tpOn: false, slD: 0, tpD: 0, slSide: -1, tpSide: 1, x: null, y: null, scale: 100, min: false };
  const PL = () => { const N = S().nexus, c = N.plan = N.plan || {}; for (const k in PLAN_DEF) if (c[k] === undefined) c[k] = PLAN_DEF[k]; return c; };
  // the planned lines keep their distance from the moving price; their side says whether it is a BUY or a SELL plan
  function planView(now) {
    const P = PL(), sy = ctx.chartSymbol(), tk = tickOf(sy);
    if (!P.slD) P.slD = now * 0.003; if (!P.tpD) P.tpD = now * 0.006;
    const dir = P.slOn ? -P.slSide : P.tpOn ? P.tpSide : 1;
    const sl = rnd(sy, now - dir * P.slD), tp = rnd(sy, now + dir * P.tpD);
    const lot = (LOT[sy] || 1) * P.lots;
    return { dir, sl, tp, slMoney: (sl - now) * dir * lot, tpMoney: (tp - now) * dir * lot };
  }
  let ticket = null;
  function buildTicket() {
    ticket = document.createElement('div'); ticket.id = 'ticket';
    ticket.innerHTML = `<div class="tk-h" data-drag><span class="tk-sym"></span><span class="grow"></span><button data-t="min" title="Zbaliť">–</button><button data-t="cfg" title="Veľkosť panelu">⚙</button><button data-t="x" title="Skryť (vrátiš ho pravým klikom na ◆ NEXUS)">✕</button></div>
      <div class="tk-b"><div class="tk-lots"><button data-l="-">−</button><input data-lots type="number" min="0.01" step="0.01"><button data-l="+">+</button><span class="muted">lot</span></div>
        <div class="tk-q">${[0.01, 0.05, 0.1, 0.5, 1].map(v => `<span data-q="${v}">${v}</span>`).join('')}</div>
        <div class="tk-bs"><button class="tk-sell" data-side="-1"><small>PREDAŤ</small><b data-px></b></button><button class="tk-buy" data-side="1"><small>KÚPIŤ</small><b data-px></b></button></div>
        <div class="tk-lv"><label><input type="checkbox" data-on="slOn"> Stop loss</label><label><input type="checkbox" data-on="tpOn"> Take profit</label></div>
        <div class="tk-exp"></div><div class="tk-hint muted">Čiary SL / TP ťaháš myšou v grafe. Strana SL určuje smer (pod cenou = BUY).</div></div>`;
    layer.appendChild(ticket);
    const P = PL(), head = $('[data-drag]', ticket);
    let d = null;
    head.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; const r = ticket.getBoundingClientRect(); d = { x: e.clientX - r.left, y: e.clientY - r.top }; head.setPointerCapture(e.pointerId); e.preventDefault(); });
    head.addEventListener('pointermove', e => { if (!d) return; P.x = e.clientX - d.x; P.y = e.clientY - d.y; placeTicket(); });
    head.addEventListener('pointerup', () => { if (d) { d = null; ctx.save(); } });
    ticket.addEventListener('wheel', e => { if (!e.target.closest('[data-drag]')) return; e.preventDefault(); P.scale = Math.max(60, Math.min(200, P.scale + (e.deltaY < 0 ? 10 : -10))); placeTicket(); ctx.save(); }, { passive: false });
    const lotsIn = $('[data-lots]', ticket);
    const setLots = v => { P.lots = Math.max(0.01, Math.round(v * 100) / 100); lotsIn.value = P.lots; ctx.save(); paintTicket(); };
    lotsIn.onchange = () => setLots(+lotsIn.value || 0.01);
    ticket.addEventListener('click', e => {
      const t = e.target.closest('[data-t],[data-l],[data-q],[data-side]'); if (!t) return;
      if (t.dataset.t === 'min') { P.min = !P.min; placeTicket(); ctx.save(); }
      else if (t.dataset.t === 'x') { P.open = false; ctx.save(); paintTicket(); ctx.onTrades(); }
      else if (t.dataset.t === 'cfg') ticketSettings();
      else if (t.dataset.l) setLots(P.lots + (t.dataset.l === '+' ? 1 : -1) * (P.lots >= 1 ? 0.1 : 0.01));
      else if (t.dataset.q) setLots(+t.dataset.q);
      else if (t.dataset.side) placeOrder(+t.dataset.side);
    });
    $$('[data-on]', ticket).forEach(c => c.onchange = () => {
      P[c.dataset.on] = c.checked;
      // a new plan line goes on the side that matches the other one (or below the price = a BUY plan)
      if (c.checked && c.dataset.on === 'slOn') P.slSide = P.tpOn ? -P.tpSide : -1;
      if (c.checked && c.dataset.on === 'tpOn') P.tpSide = P.slOn ? -P.slSide : 1;
      ctx.save(); paintTicket(); ctx.onTrades();
    });
  }
  function ticketSettings() {
    const P = PL();
    const d = UI.openDialog(`<div class="dlg-h"><span>⚙ Obchodný panel</span><button class="ib" data-x>✕</button></div><div class="dlg-b">
      <div class="fld"><span>Veľkosť panelu</span><span class="op" style="width:240px"><input type="range" min="60" max="200" value="${P.scale}" data-ts><b>${P.scale} %</b></span></div>
      <div class="fld"><span>Pôvodná poloha</span><button class="btn sm" data-tr>Vrátiť vpravo dole</button></div>
      <div class="muted" style="font-size:11px">Koliesko myši nad hlavičkou panelu tiež mení veľkosť.</div></div>
      <div class="dlg-f"><span class="grow"></span><button class="btn pri" data-x>Hotovo</button></div>`);
    $('[data-ts]', d).oninput = e => { P.scale = +e.target.value; e.target.nextElementSibling.textContent = P.scale + ' %'; placeTicket(); ctx.save(); };
    $('[data-tr]', d).onclick = () => { P.x = P.y = null; placeTicket(); ctx.save(); };
    $$('[data-x]', d).forEach(x => x.onclick = UI.closeDialog);
  }
  function placeTicket() {
    if (!ticket) return;
    const P = PL();
    ticket.style.transform = `scale(${P.scale / 100})`; ticket.classList.toggle('min', !!P.min);
    const w = ticket.offsetWidth * P.scale / 100, h = ticket.offsetHeight * P.scale / 100;
    const x = P.x ?? 16, y = P.y ?? innerHeight - h - 50;
    ticket.style.left = Math.max(0, Math.min(innerWidth - 40, x)) + 'px'; ticket.style.top = Math.max(0, Math.min(innerHeight - 30, y)) + 'px';
  }
  function paintTicket() {
    if (!layer) return;
    const P = PL();
    if (!P.open) { if (ticket) ticket.style.display = 'none'; return; }
    if (!ticket) buildTicket();
    ticket.style.display = '';
    const sy = ctx.chartSymbol(), now = priceOf(sy);
    $('.tk-sym', ticket).textContent = '💹 ' + sym(sy).name;
    const li = $('[data-lots]', ticket); if (document.activeElement !== li) li.value = P.lots;
    $$('[data-px]', ticket).forEach(b => { b.textContent = f2(now, sy); });
    $$('[data-on]', ticket).forEach(c => { c.checked = !!P[c.dataset.on]; });
    $$('[data-q]', ticket).forEach(q => q.classList.toggle('on', +q.dataset.q === P.lots));
    const ex = $('.tk-exp', ticket);
    if (Number.isFinite(now) && (P.slOn || P.tpOn)) {
      const v = planView(now);
      ex.innerHTML = `<b class="${v.dir > 0 ? 'up' : 'dn'}">${v.dir > 0 ? 'Plán BUY' : 'Plán SELL'}</b>${P.slOn ? ` · SL <b class="dn">${money(v.slMoney)}</b>` : ''}${P.tpOn ? ` · TP <b class="up">${money(v.tpMoney)}</b>` : ''}${P.slOn && P.tpOn ? ` · R:R 1:${(Math.abs(v.tpMoney / v.slMoney) || 0).toFixed(2)}` : ''}`;
    } else ex.innerHTML = `<span class="muted">1 pip pohybu = ${usd(tickOf(sy) * (LOT[sy] || 1) * P.lots)} · zapni SL / TP a ťahaj čiary v grafe</span>`;
    placeTicket();
  }
  function placeOrder(dir) {
    if (!guard()) return;
    const P = PL(), sy = ctx.chartSymbol(), now = priceOf(sy);
    if (!Number.isFinite(now)) { ctx.toast('Cena sa ešte načítava…'); return; }
    let sl = null, tp = null;
    if (P.slOn || P.tpOn) {
      const v = planView(now);
      // the plan was drawn for the other direction: mirror the levels around the price
      sl = P.slOn ? (v.dir === dir ? v.sl : 2 * now - v.sl) : null;
      tp = P.tpOn ? (v.dir === dir ? v.tp : 2 * now - v.tp) : null;
      if (v.dir !== dir) { P.slSide = -dir; P.tpSide = dir; }
    }
    openPos({ symbol: sy, dir, lots: P.lots, lots0: P.lots, entry: now, sl, tp, src: 'ručne' });
    ctx.toast(`${dir > 0 ? '▲ KÚPENÉ' : '▼ PREDANÉ'} ${P.lots} lot ${sym(sy).name} @ ${f2(now, sy)}${sl ? ' · SL ' + f2(sl, sy) : ''}${tp ? ' · TP ' + f2(tp, sy) : ''}`);
    P.slOn = P.tpOn = false; ctx.save(); paintTicket(); ctx.onTrades(); pollPrices();
  }

  // ---- page ----------------------------------------------------------------------------------------------
  function avatarHtml(size) {
    const N = S().nexus, name = S().labeler || '?';
    return N.avatar ? `<img class="nx-av" src="${esc(N.avatar)}" style="width:${size}px;height:${size}px" alt="">`
      : `<span class="nx-av" style="width:${size}px;height:${size}px;font-size:${size / 2.4}px">${esc(name.slice(0, 1).toUpperCase())}</span>`;
  }

  // ---- Nexus home screen: app icons you open as windows, drag anywhere or hide; a quote cloud --------------
  const ICO = {
    acc: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
    pos: '<path d="M3 17l5-5 4 4 8-9"/><path d="M15 7h5v5"/>',
    hist: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/><path d="M3 12h2"/>',
    bot: '<rect x="5" y="8" width="14" height="11" rx="2"/><path d="M12 4v4M9 13h.01M15 13h.01M9 16h6"/><circle cx="12" cy="3.5" r="1"/>',
    ideas: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>',
    fold: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    board: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    lib: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M8 7h7"/>',
    ticket: '<path d="M4 18V9M10 18V5M16 18v-7M22 18H2"/>',
  };
  const APPS = {
    acc: ['Účet', 'linear-gradient(135deg,#3b82f6,#6d28d9)', 'Profil, zostatok a prepínanie účtov'],
    pos: ['Pozície', 'linear-gradient(135deg,#10b981,#047857)', 'Otvorené obchody'],
    hist: ['História', 'linear-gradient(135deg,#f59e0b,#b45309)', 'Uzavreté obchody a štatistiky'],
    bot: ['Robot', 'linear-gradient(135deg,#64748b,#1e293b)', 'SMA robot na všetkých timeframoch'],
    ideas: ['Nápady', 'linear-gradient(135deg,#facc15,#a16207)', 'Nápady zo skenera a z chatu'],
    fold: ['Priečinky', 'linear-gradient(135deg,#38bdf8,#1d4ed8)', 'Kategórie a priečinky chatu'],
    board: ['Nástenka', 'linear-gradient(135deg,#f472b6,#be185d)', 'Poznámky a zoznamy úloh'],
    chat: ['Chat', 'linear-gradient(135deg,#22d3ee,#0e7490)', 'Otvorí okno chatu'],
    lib: ['Knižnica', 'linear-gradient(135deg,#a78bfa,#5b21b6)', 'Formácie, stratégie, tipy'],
    ticket: ['Obchod', 'linear-gradient(135deg,#ef4444,#16a34a)', 'Zobrazí / skryje obchodný panel v grafe'],
  };
  const ACTIONS = { chat: () => ctx.openChat(), lib: () => { close(); LIB.open(); }, ticket: () => { const P = PL(); P.open = !P.open; ctx.save(); paintTicket(); ctx.onTrades(); ctx.toast(P.open ? '💹 Obchodný panel zobrazený v grafe' : 'Obchodný panel skrytý'); } };
  const DK = () => {
    const N = S().nexus, d = N.desk = N.desk || {};
    d.icons = d.icons || {}; d.wins = d.wins || {}; d.z = d.z || 10;
    Object.keys(APPS).forEach((k, i) => { if (!d.icons[k]) d.icons[k] = { x: 28 + (i % 2) * 104, y: 24 + Math.floor(i / 2) * 112 }; });
    if (!d.icons.cloud) d.icons.cloud = { x: 260, y: 24 };
    return d;
  };
  const badge = id => ({ pos: A().positions.length, hist: A().history.length, bot: S().robot.on ? '●' : '', board: (S().board.notes || []).length }[id] || '');
  function iconHtml(id) {
    const [name, bg, hint] = APPS[id], b = badge(id), p = DK().icons[id];
    return `<div class="nx-app" data-app="${id}" style="left:${p.x}px;top:${p.y}px" title="${esc(hint)}"><div class="nx-tile" style="background:${bg}">
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICO[id]}</svg>${b !== '' ? `<i class="nx-badge">${b}</i>` : ''}</div><span>${esc(name)}</span></div>`;
  }
  function cloudHtml() {
    const p = DK().icons.cloud, q = QUOTES[tipIdx % QUOTES.length], t = LIB.TIPS[tipIdx % LIB.TIPS.length], s = LIB.STRATS[tipIdx % LIB.STRATS.length];
    return `<div class="nx-cloud" style="left:${p.x}px;top:${p.y}px"><div class="nx-cl-shape" data-drag>
      <svg viewBox="0 0 120 70" class="nx-cl-svg"><path d="M30 62h62a20 20 0 0 0 2-40 26 26 0 0 0-49-6A18 18 0 0 0 30 62z"/></svg><span class="nx-cl-t">✨ Motivácia</span></div>
      <div class="nx-cl-more"><blockquote class="nx-q">„${esc(q[0])}“<cite>— ${esc(q[1])}</cite></blockquote>
        <div class="nx-sub">${t.ic} Tip: ${esc(t.name)}</div><ul class="nx-tip">${t.text.slice(0, 3).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
        <div class="nx-sub">${s.ic} Stratégia na dnes: ${esc(s.name)}</div><div class="muted">${esc(s.desc)}</div>
        <div class="nx-cl-btns"><button class="btn sm" data-cl-next>↻ Ďalší</button><button class="btn sm" data-cl-lib="${t.id}">Viac v knižnici</button></div></div></div>`;
  }

  // ---- app windows ------------------------------------------------------------------------------------
  const BODY = {
    acc: () => { const a = A(), name = S().labeler;
      return `<div class="nx-prof"><label class="nx-avbox" title="Klikni a vyber obrázok">${avatarHtml(76)}<input type="file" accept="image/*" id="nxAvatar" hidden><small>zmeniť fotku</small></label>
        <div class="nx-pf"><label>Meno<input class="idea-in" id="nxName" value="${esc(name)}" placeholder="Tvoje meno"></label>
        <label>Počiatočný zostatok účtu „${esc(a.name)}“ ($)<input class="idea-in" id="nxStart" type="number" min="0" step="100" value="${a.start}"></label></div></div>
        <div class="nx-stats" id="nxStats"></div>
        <div class="nx-sub">Účty <span class="grow"></span><button class="btn sm" id="acNew">＋ Nový účet</button></div>
        <div class="nx-accs">${S().accounts.map(x => { const r = x.history.reduce((s2, h) => s2 + (Number.isFinite(h.pnl) ? h.pnl : 0), 0), sh = x.shared;
          return `<div class="nx-acc ${x === a ? 'on' : ''}" data-ac="${x.id}"><b>${esc(x.name)} ${sh ? `<span class="nx-shb">🔗 ${sh.role === 'owner' ? 'zdieľaný' : sh.role === 'trade' ? 'obchodujem' : 'sledujem'}</span>` : ''}</b><span class="priv">${usd(x.start + r)}</span>
            <small>${x.positions.length} otvorené · ${x.history.length} obchodov${sh ? ` · vlastník ${esc(sh.owner)}${(sh.members || []).length ? ' · ' + sh.members.map(m => `${esc(m.name)} (${m.role === 'trade' ? 'obchoduje' : 'sleduje'})`).join(', ') : ''}` : ''}</small>
            ${sh && sh.role === 'owner' ? `<div class="nx-codes">Kód na sledovanie <code data-copy="${sh.code_view}">${sh.code_view}</code> · na obchodovanie <code data-copy="${sh.code_trade}">${sh.code_trade}</code></div>` : ''}
            <span class="nx-acc-b">${sh ? '' : `<button class="ib" data-acs="${x.id}" title="Zdieľať s kamarátom">🔗</button>`}<button class="ib" data-acr="${x.id}" title="Premenovať">✎</button>${S().accounts.length > 1 ? `<button class="ib" data-acd="${x.id}" title="Odstrániť účet">🗑</button>` : ''}</span></div>`; }).join('')}</div>
        <div class="nx-sub">Pripojiť sa k účtu kamaráta</div><div class="nx-new"><input class="idea-in" id="acCode" placeholder="Kód od kamaráta (napr. 3F9A1C2B)" style="flex:1"><button class="btn sm pri" id="acJoin">🔗 Pripojiť</button></div>
        <div class="muted" style="font-size:11px;margin-top:8px">Papierové (demo) účty – žiadne skutočné peniaze ani broker. Nové obchody idú na zvýraznený účet.</div>
        <div style="margin-top:6px"><button class="btn sm" id="nxReset">♻ Vynulovať tento účet</button></div>`; },
    pos: () => `<div class="nx-new"><select id="npSym">${ctx.symbols().map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
        <input id="npLots" type="number" min="0.01" step="0.01" value="0.1" title="Loty"><input id="npSL" type="number" step="any" placeholder="SL"><input id="npTP" type="number" step="any" placeholder="TP">
        <button class="btn sm buy" data-np="1">▲ Kúpiť</button><button class="btn sm sell" data-np="-1">▼ Predať</button></div><div id="nxPosList"></div>`,
    hist: () => `<div class="nx-hsum" id="nxHistSum"></div><div class="nx-hcurve" id="nxCurve"></div>
        <div class="nx-hfil">${[['all', 'Všetky'], ['win', '✓ Ziskové'], ['loss', '✗ Stratové'], ['robot', '🤖 Robot'], ['hand', '✋ Ručné']].map(([k, n]) => `<span data-hf="${k}" class="${histFilter === k ? 'on' : ''}">${n}</span>`).join('')}</div>
        <div id="nxHistList"></div>`,
    bot: () => { const R = S().robot;
      return `<div class="nx-bot-cfg"><label class="ctl"><input type="checkbox" id="rbOn" ${R.on ? 'checked' : ''}> <b>Zapnutý</b></label>
        <label class="inl">Priemer SMA <input id="rbPer" type="number" min="2" max="200" value="${R.period}"></label>
        <span class="nx-chips">${ctx.symbols().map(s => `<span data-rs="${s.id}" class="${R.symbols.includes(s.id) ? 'on' : ''}">${esc(s.name)}</span>`).join('')}</span>
        <span class="nx-chips">${['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d'].map(t => `<span data-rt="${t}" class="${R.tfs.includes(t) ? 'on' : ''}">${t}</span>`).join('')}</span>
        <label class="inl">Prudký pohyb = <input id="rbN" type="number" min="2" max="10" value="${R.sharpBars}"> sviečky za sebou a ≥ <input id="rbK" type="number" min="0.5" max="10" step="0.5" value="${R.sharpAtr}"> × ATR</label>
        <label class="inl">Pri prudkom pohybe <select id="rbSharp">${[['both', 'v smere: vybrať zisk · proti: otočiť'], ['take', 'iba vybrať zisk'], ['flip', 'iba otočiť pri pohybe proti'], ['off', 'nič – iba SMA']].map(([k, n]) => `<option value="${k}" ${R.onSharp === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="ctl"><input type="checkbox" id="rbPaper" ${R.paper ? 'checked' : ''}> Obchodovať na papierovom účte, <input id="rbLots" type="number" min="0.01" step="0.01" value="${R.lots}"> lotu</label>
        </div><div id="nxBotTable"></div><div class="nx-sub">Denník robota <button class="btn sm" id="rbClear">vymazať</button></div><div id="nxBotLog" class="nx-log"></div>
        <div class="muted" style="font-size:11px;margin-top:6px">Robot kontroluje trh každých 30 s a koná raz za každú uzavretú sviečku daného timeframu. Beží, kým je stránka otvorená.</div>`; },
    ideas: () => '<div id="nxIdeaBox"></div>',
    fold: () => '<div id="nxFolders"></div>',
    board: () => '<div class="bd-bar"><button class="btn sm" data-bd="note">＋ Poznámka</button><button class="btn sm" data-bd="list">＋ Zoznam úloh</button><span class="grow"></span><span class="muted" id="bdCount"></span></div><div class="bd-area" id="bdArea"></div>',
  };
  const WIN_SIZE = { acc: [430, 560], pos: [760, 380], hist: [820, 560], bot: [820, 560], ideas: [480, 460], fold: [480, 520], board: [880, 600] };
  let histFilter = 'all';
  function winHtml(id) {
    const w = DK().wins[id], [name, bg] = APPS[id], [dw, dh] = WIN_SIZE[id] || [500, 420];
    return `<section class="nx-win ${w.max ? 'max' : ''}" data-win="${id}" style="left:${w.x}px;top:${w.y}px;width:${w.w || dw}px;height:${w.h || dh}px;z-index:${w.z || 10}">
      <header data-wdrag><span class="nx-wico" style="background:${bg}"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICO[id]}</svg></span>
        <b>${esc(name)}</b><span class="grow"></span><button class="ib" data-wz="-" title="Menšie písmo">A−</button><button class="ib" data-wz="+" title="Väčšie písmo">A+</button>
        <button class="ib" data-wmax title="Maximalizovať">⤢</button><button class="ib" data-wx title="Zavrieť">✕</button></header>
      <div class="nx-wb" style="${w.zoom && w.zoom !== 100 ? `zoom:${w.zoom / 100}` : ''}">${BODY[id]()}</div></section>`;
  }
  function openApp(id) {
    if (ACTIONS[id]) { ACTIONS[id](); return; }
    const D = DK(), w = D.wins[id] = D.wins[id] || {};
    const desk = $('#nxDesk'), r = desk.getBoundingClientRect(), [dw, dh] = WIN_SIZE[id] || [500, 420];
    if (w.x === undefined) { const n = Object.values(D.wins).filter(x => x.open).length; w.x = Math.max(230, Math.min(r.width - dw - 20, 240 + n * 34)); w.y = Math.max(10, Math.min(r.height - dh - 10, 20 + n * 30)); }
    w.open = true; w.z = ++D.z; ctx.save();
    const old = $(`.nx-win[data-win="${id}"]`, desk);
    if (old) { old.style.zIndex = w.z; old.classList.add('flash'); setTimeout(() => old.classList.remove('flash'), 400); return; }
    desk.insertAdjacentHTML('beforeend', winHtml(id));
    bindWin($(`.nx-win[data-win="${id}"]`, desk), id);
    paintApp(id);
  }
  function closeApp(id) { const w = DK().wins[id]; if (w) w.open = false; const el = $(`.nx-win[data-win="${id}"]`, page); if (el) el.remove(); ctx.save(); }
  function bindWin(el, id) {
    const D = DK(), w = D.wins[id], head = $('[data-wdrag]', el), body = $('.nx-wb', el);
    el.addEventListener('pointerdown', () => { if (+el.style.zIndex !== D.z) { w.z = ++D.z; el.style.zIndex = w.z; } }, true);
    let d = null;
    head.addEventListener('pointerdown', e => { if (e.target.closest('button') || w.max) return; d = { x: e.clientX - el.offsetLeft, y: e.clientY - el.offsetTop }; head.setPointerCapture(e.pointerId); e.preventDefault(); });
    head.addEventListener('pointermove', e => { if (!d) return; w.x = Math.max(-40, e.clientX - d.x); w.y = Math.max(0, e.clientY - d.y); el.style.left = w.x + 'px'; el.style.top = w.y + 'px'; });
    head.addEventListener('pointerup', () => { if (d) { d = null; ctx.save(); } });
    head.addEventListener('dblclick', e => { if (!e.target.closest('button')) { w.max = !w.max; el.classList.toggle('max', w.max); ctx.save(); } });
    const dr = $('#nxDesk').getBoundingClientRect();
    UI.edges(el, r => { w.x = r.x - dr.left; w.y = r.y - dr.top; w.w = r.w; w.h = r.h; Object.assign(el.style, { left: w.x + 'px', top: w.y + 'px', width: w.w + 'px', height: w.h + 'px' }); }, ctx.save);
    $$('[data-wz]', el).forEach(b => b.onclick = () => { w.zoom = Math.max(60, Math.min(180, (w.zoom || 100) + (b.dataset.wz === '+' ? 10 : -10))); body.style.zoom = w.zoom / 100; ctx.save(); });
    $('[data-wmax]', el).onclick = () => { w.max = !w.max; el.classList.toggle('max', w.max); ctx.save(); };
    $('[data-wx]', el).onclick = () => closeApp(id);
    BIND[id] && BIND[id](el);
  }
  function paintApp(id) {
    if (id === 'fold') paintFolders();
    else if (id === 'ideas') paintIdeas();
    else if (id === 'board') paintBoard();
    else paintLive();
  }
  function paint() {
    if (!page) return;
    const N = S().nexus, a = A(), D = DK(), hidden = Object.keys(APPS).filter(k => D.icons[k].hidden);
    page.classList.toggle('private', !!N.private);
    const view = N.view || 'mobile', design = N.design || 'glass';
    page.className = page.className.replace(/d-w+/g, '').trim() + ' d-' + design;
    page.innerHTML = `<div class="nx-head">${avatarHtml(38)}<div><div class="nx-name">${esc(S().labeler || 'Bez mena')} <small class="muted">· ${esc(a.name)}</small></div><div class="muted" id="nxHeadSum"></div></div><span class="grow"></span>
        <span class="nx-size"><label>Veľkosť <input type="range" min="60" max="160" value="${N.zoom || 100}" data-nz="zoom"></label><label>◆ <input type="range" min="36" max="220" value="${N.hudSize || 64}" data-nz="hudSize"></label></span>
        <select id="nxView" class="nx-sel" title="Vzhľad Nexusu"><option value="mobile" ${view === 'mobile' ? 'selected' : ''}>📱 Mobil (ikony)</option><option value="classic" ${view === 'classic' ? 'selected' : ''}>🗂 Klasický (karty)</option></select>
        <select id="nxDesign" class="nx-sel" title="Dizajn celého hubu">${DESIGNS.map(([k, n]) => `<option value="${k}" ${design === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <button class="btn sm ${N.private ? 'pri' : ''}" id="nxPriv" title="Skryť sumy a údaje účtu (napr. pri zdieľaní obrazovky)">${N.private ? '🙈 Údaje skryté' : '👁 Skryť údaje'}</button>
        <button class="btn sm" id="nxEdit">▦ Plocha${hidden.length ? ` (${hidden.length} skryté)` : ''}</button><button class="btn sm" id="nxClose">📈 Späť na graf</button></div>
      <div class="nx-desk" id="nxDesk" style="zoom:${(N.zoom || 100) / 100}">${view === 'classic' ? classicHtml() : `
        ${Object.keys(APPS).filter(k => !D.icons[k].hidden).map(iconHtml).join('')}${D.icons.cloud.hidden ? '' : cloudHtml()}
        ${Object.keys(D.wins).filter(k => D.wins[k].open && BODY[k]).map(winHtml).join('')}`}
      </div>`;
    bindDesk();
    if (view === 'classic') $$('.nx-card[data-cls]', page).forEach(el => BIND[el.dataset.cls] && BIND[el.dataset.cls](el));
    else Object.keys(D.wins).filter(k => D.wins[k].open && BODY[k]).forEach(k => { bindWin($(`.nx-win[data-win="${k}"]`, page), k); });
    paintLive(); paintFolders(); paintIdeas(); paintBoard();
  }
  // the classic view: every app as a card in a grid (the first Nexus look)
  const DESIGNS = [['glass', '🔷 Sklo (predvolený)'], ['neon', '🌈 Neón'], ['gold', '🥇 Zlato a čierna'], ['terminal', '🖥 Terminál'], ['aurora', '🌌 Polárna žiara'], ['ocean', '🌊 Oceán'], ['minimal', '⬜ Minimal (svetlý)']];
  function classicHtml() {
    const q = QUOTES[tipIdx % QUOTES.length];
    return `<div class="nx-classic">${Object.keys(BODY).map(id => { const [name, bg] = APPS[id];
      return `<section class="nx-card nx-c-${id}" data-cls="${id}"><header><span class="nx-wico" style="background:${bg}"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICO[id]}</svg></span><b>${esc(name)}</b></header><div class="nx-cb">${BODY[id]()}</div></section>`; }).join('')}
      <section class="nx-card"><header><span class="nx-wico" style="background:linear-gradient(135deg,#a78bfa,#6d28d9)">✨</span><b>Motivácia</b></header><div class="nx-cb"><blockquote class="nx-q">„${esc(q[0])}“<cite>— ${esc(q[1])}</cite></blockquote></div></section></div>`;
  }
  function bindDesk() {
    const D = DK(), N = S().nexus, desk = $('#nxDesk');
    $('#nxClose').onclick = close;
    $('#nxView').onchange = e => { N.view = e.target.value; ctx.save(); paint(); };
    $('#nxDesign').onchange = e => { N.design = e.target.value; ctx.save(); paint(); };
    $('#nxPriv').onclick = () => { N.private = !N.private; ctx.save(); paint(); };
    $$('[data-nz]', page).forEach(x => x.oninput = () => {
      N[x.dataset.nz] = +x.value;
      if (x.dataset.nz === 'hudSize') hud.place && hud.place(); else desk.style.zoom = (N.zoom || 100) / 100;
      clearTimeout(bindDesk.t); bindDesk.t = setTimeout(ctx.save, 400);
    });
    $('#nxEdit').onclick = e => {
      const hidden = [...Object.keys(APPS), 'cloud'].filter(k => D.icons[k].hidden);
      UI.openMenu(e.currentTarget, `<div class="sec">Plocha</div>${hidden.length ? hidden.map(k => `<div class="it" data-show="${k}"><span class="ic">＋</span><span class="grow">Zobraziť: ${esc(k === 'cloud' ? 'Motivácia (obláčik)' : APPS[k][0])}</span></div>`).join('') : '<div class="it muted">Všetky ikony sú na ploche</div>'}
        <div class="sep"></div><div class="it" data-arr><span class="ic">⊞</span><span class="grow">Zoradiť ikony</span></div><div class="it" data-closeall><span class="ic">✕</span><span class="grow">Zavrieť všetky okná</span></div>
        <div class="muted" style="font-size:11px;padding:4px 12px 8px">Ikonu skryješ pravým klikom na ňu. Ikony aj okná ťaháš kamkoľvek.</div>`, m => {
        $$('[data-show]', m).forEach(x => x.onclick = () => { D.icons[x.dataset.show].hidden = false; UI.closeMenu(); ctx.save(); paint(); });
        $('[data-arr]', m).onclick = () => { Object.keys(APPS).forEach((k, i) => Object.assign(D.icons[k], { x: 28 + (i % 2) * 104, y: 24 + Math.floor(i / 2) * 112 })); Object.assign(D.icons.cloud, { x: 260, y: 24 }); UI.closeMenu(); ctx.save(); paint(); };
        $('[data-closeall]', m).onclick = () => { Object.values(D.wins).forEach(w => (w.open = false)); UI.closeMenu(); ctx.save(); paint(); };
      });
    };
    // icons: click = open, drag = move, right click = hide
    $$('.nx-app', desk).forEach(el => {
      const id = el.dataset.app, p = D.icons[id];
      let d = null;
      el.addEventListener('pointerdown', e => { if (e.button !== 0) return; d = { x: e.clientX, y: e.clientY, ox: p.x, oy: p.y, moved: false }; el.setPointerCapture(e.pointerId); e.preventDefault(); });
      el.addEventListener('pointermove', e => {
        if (!d) return; const z = (N.zoom || 100) / 100, dx = (e.clientX - d.x) / z, dy = (e.clientY - d.y) / z;
        if (!d.moved && Math.hypot(dx, dy) < 4) return;
        d.moved = true; el.classList.add('drag'); p.x = Math.max(0, d.ox + dx); p.y = Math.max(0, d.oy + dy); el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
      });
      el.addEventListener('pointerup', () => { if (!d) return; const m = d.moved; d = null; el.classList.remove('drag'); if (m) ctx.save(); else openApp(id); });
      el.addEventListener('contextmenu', e => {
        e.preventDefault();
        UI.openMenu(el, `<div class="sec">${esc(APPS[id][0])}</div><div class="it" data-o><span class="ic">↗</span><span class="grow">Otvoriť</span></div><div class="it" data-h><span class="ic">🙈</span><span class="grow">Skryť z plochy</span></div>`, m => {
          $('[data-o]', m).onclick = () => { UI.closeMenu(); openApp(id); };
          $('[data-h]', m).onclick = () => { UI.closeMenu(); p.hidden = true; closeApp(id); ctx.save(); paint(); };
        });
      });
    });
    // the cloud: hover = grows with the quote, tip and strategy; drag by the cloud; right click = hide
    const cl = $('.nx-cloud', desk);
    if (cl) {
      const p = D.icons.cloud, sh = $('[data-drag]', cl);
      let d = null;
      sh.addEventListener('pointerdown', e => { if (e.button !== 0) return; d = { x: e.clientX, y: e.clientY, ox: p.x, oy: p.y }; sh.setPointerCapture(e.pointerId); e.preventDefault(); });
      sh.addEventListener('pointermove', e => { if (!d) return; const z = (N.zoom || 100) / 100; p.x = Math.max(0, d.ox + (e.clientX - d.x) / z); p.y = Math.max(0, d.oy + (e.clientY - d.y) / z); cl.style.left = p.x + 'px'; cl.style.top = p.y + 'px'; });
      sh.addEventListener('pointerup', () => { if (d) { d = null; ctx.save(); } });
      cl.addEventListener('contextmenu', e => { e.preventDefault(); p.hidden = true; ctx.save(); paint(); ctx.toast('Obláčik skrytý – vrátiš ho cez ▦ Plocha'); });
      $('[data-cl-next]', cl).onclick = () => { tipIdx++; const was = cl.matches(':hover'); cl.outerHTML = cloudHtml(); bindDesk.cloudAgain = was; bindDesk(); };
      $('[data-cl-lib]', cl).onclick = e => { close(); LIB.show('tips', e.target.dataset.clLib); };
      if (bindDesk.cloudAgain) { cl.classList.add('open'); bindDesk.cloudAgain = false; cl.addEventListener('mouseleave', () => cl.classList.remove('open'), { once: true }); }
    }
  }
  const BIND = {
    acc: el => {
      $('#nxName', el).onchange = e => { ctx.setName(e.target.value.trim()); paint(); };
      $('#nxStart', el).onchange = e => { A().start = Math.max(0, +e.target.value || 0); ctx.save(); paintLive(); };
      $('#nxReset', el).onclick = () => { if (confirm(`Vynulovať účet „${A().name}“? Zmažú sa jeho pozície aj história.`)) { Object.assign(A(), { positions: [], history: [] }); ctx.save(); paint(); paintCards(); ctx.onTrades(true); } };
      $('#nxAvatar', el).onchange = e => {
        const file = e.target.files[0]; if (!file) return;
        const img = new Image(), u = URL.createObjectURL(file);
        img.onload = () => { const c = document.createElement('canvas'), k = 160 / Math.min(img.width, img.height); c.width = c.height = 160;
          c.getContext('2d').drawImage(img, (160 - img.width * k) / 2, (160 - img.height * k) / 2, img.width * k, img.height * k); URL.revokeObjectURL(u);
          S().nexus.avatar = c.toDataURL('image/jpeg', 0.82); ctx.save(); paint(); };
        img.src = u;
      };
      const after = () => { ctx.save(); paint(); paintCards(); ctx.onTrades(true); };
      $$('[data-acs]', el).forEach(x => x.onclick = () => shareAccount(S().accounts.find(y => y.id === x.dataset.acs)).then(() => paint()));
      $$('[data-copy]', el).forEach(x => x.onclick = e => { e.stopPropagation(); navigator.clipboard && navigator.clipboard.writeText(x.dataset.copy); ctx.toast('📋 Kód skopírovaný: ' + x.dataset.copy); });
      $('#acJoin', el).onclick = () => { const c = $('#acCode', el).value.trim(); if (c) joinAccount(c).then(() => { paint(); paintCards(); ctx.onTrades(true); }); };
      $('#acNew', el).onclick = () => { const n = prompt('Názov nového účtu', `Účet ${S().accounts.length + 1}`); if (!n) return; const id = Date.now().toString(36);
        S().accounts.push({ id, name: n.trim().slice(0, 40), start: 10000, positions: [], history: [] }); S().accountId = id; ctx.toast(`Nový účet „${n}“ je aktívny`); after(); };
      $$('[data-ac]', el).forEach(x => x.onclick = e => { if (e.target.closest('button')) return; S().accountId = x.dataset.ac; ctx.toast(`Aktívny účet: ${A().name}`); after(); });
      $$('[data-acr]', el).forEach(x => x.onclick = () => { const ac = S().accounts.find(y => y.id === x.dataset.acr), n = prompt('Nový názov účtu', ac.name); if (n && n.trim()) { ac.name = n.trim().slice(0, 40); after(); } });
      $$('[data-acd]', el).forEach(x => x.onclick = () => { const ac = S().accounts.find(y => y.id === x.dataset.acd); if (!confirm(`Zmazať účet „${ac.name}“ aj s jeho históriou?`)) return;
        S().accounts = S().accounts.filter(y => y !== ac); if (S().accountId === ac.id) S().accountId = S().accounts[0].id; after(); });
    },
    pos: el => $$('[data-np]', el).forEach(b => b.onclick = () => {
      const s = $('#npSym', el).value, price = prices[s];
      if (!Number.isFinite(price)) { ctx.toast('Cena sa ešte načítava…'); pollPrices(); return; }
      const lots = Math.max(0.01, +$('#npLots', el).value || 0.1), sl = +$('#npSL', el).value || null, tp = +$('#npTP', el).value || null, dir = +b.dataset.np;
      openPos({ symbol: s, dir, lots, entry: price, sl, tp, src: 'ručne' }); ctx.toast(`${dir > 0 ? '▲ Kúpené' : '▼ Predané'} ${lots} lotu ${sym(s).name} @ ${f2(price, s)}`); paintLive(); pollPrices(); ctx.onTrades(true);
    }),
    hist: el => $$('[data-hf]', el).forEach(x => x.onclick = () => { histFilter = x.dataset.hf; $$('[data-hf]', el).forEach(y => y.classList.toggle('on', y === x)); paintLive(); }),
    bot: el => {
      const R = S().robot, upd = () => { ctx.save(); paintLive(); };
      $('#rbOn', el).onchange = e => { R.on = e.target.checked; if (R.on) { log(R, (R.symbols[0] || '') + '|', 'robot zapnutý', ''); robotTick(); } else { clearTimeout(robotT); log(R, (R.symbols[0] || '') + '|', 'robot vypnutý (otvorené pozície ostávajú)', ''); } upd(); ctx.onRobot(R.on); };
      $('#rbPer', el).onchange = e => { R.period = Math.max(2, Math.min(200, +e.target.value || 10)); R.state = {}; upd(); };
      $('#rbN', el).onchange = e => { R.sharpBars = Math.max(2, Math.min(10, +e.target.value || 3)); upd(); };
      $('#rbK', el).onchange = e => { R.sharpAtr = Math.max(0.5, +e.target.value || 2); upd(); };
      $('#rbSharp', el).onchange = e => { R.onSharp = e.target.value; upd(); };
      $('#rbPaper', el).onchange = e => { R.paper = e.target.checked; upd(); };
      $('#rbLots', el).onchange = e => { R.lots = Math.max(0.01, +e.target.value || 0.1); upd(); };
      $('#rbClear', el).onclick = () => { R.log = []; upd(); };
      $$('[data-rs]', el).forEach(x => x.onclick = () => { const k = x.dataset.rs; R.symbols = R.symbols.includes(k) ? R.symbols.filter(y => y !== k) : [...R.symbols, k]; x.classList.toggle('on'); upd(); if (R.on) robotTick(); });
      $$('[data-rt]', el).forEach(x => x.onclick = () => { const k = x.dataset.rt; R.tfs = R.tfs.includes(k) ? R.tfs.filter(y => y !== k) : [...R.tfs, k]; x.classList.toggle('on'); upd(); if (R.on) robotTick(); });
    },
    board: el => {
      $$('[data-bd]', el).forEach(b => b.onclick = () => {
        const B = S().board, n = B.notes.length, list = b.dataset.bd === 'list';
        B.notes.push({ id: Date.now().toString(36), x: 16 + (n % 5) * 26, y: 14 + (n % 5) * 22, w: 240, h: list ? 250 : 190, color: BD_COLORS[n % BD_COLORS.length],
          title: list ? 'Zoznam úloh' : 'Poznámka', text: '', items: list ? [] : null, created: Date.now() });
        ctx.save(); paintBoard(); refreshBadges();
      });
    },
  };
  const refreshBadges = () => Object.keys(APPS).forEach(k => { const t = $(`.nx-app[data-app="${k}"] .nx-tile`, page); if (!t) return; const b = badge(k), i = $('.nx-badge', t);
    if (b === '') { if (i) i.remove(); } else if (i) i.textContent = b; else t.insertAdjacentHTML('beforeend', `<i class="nx-badge">${b}</i>`); });

  // ---- board: sticky notes and to-do lists ---------------------------------------------------------------
  const BD_COLORS = ['#facc15', '#38bdf8', '#4ade80', '#f472b6', '#a78bfa', '#fb923c', '#94a3b8'];
  function paintBoard() {
    const area = $('#bdArea'); if (!area) return;
    const B = S().board, notes = B.notes;
    const cnt = $('#bdCount'); if (cnt) { const items = notes.flatMap(n => n.items || []); cnt.textContent = `${notes.length} lístkov${items.length ? ` · úlohy ${items.filter(i => i.done).length}/${items.length}` : ''}`; }
    area.innerHTML = notes.map(n => { const it = n.items, done = it ? it.filter(i => i.done).length : 0;
      return `<div class="bd-note" data-n="${n.id}" style="left:${n.x}px;top:${n.y}px;width:${n.w}px;height:${n.h}px;--nc:${n.color}">
        <div class="bd-h" data-nd><input class="bd-t" value="${esc(n.title)}" data-nt><span class="bd-tools"><button data-nc title="Farba">◐</button><button data-ndel title="Zmazať">✕</button></span></div>
        ${it ? `<div class="bd-prog"><i style="width:${it.length ? (100 * done / it.length).toFixed(0) : 0}%"></i></div><div class="bd-items">${it.map((x, k) => `<label class="bd-it ${x.done ? 'done' : ''}"><input type="checkbox" data-ic="${k}" ${x.done ? 'checked' : ''}><span>${esc(x.t)}</span><button data-idel="${k}" title="Zmazať úlohu">✕</button></label>`).join('')}</div>
          <input class="bd-add" placeholder="+ pridať úlohu a Enter" data-iadd>` : `<textarea class="bd-x" placeholder="Píš sem…" data-ntext>${esc(n.text)}</textarea>`}
        <small class="bd-d">${new Date(n.created).toLocaleDateString('sk-SK')}${it ? ` · ${done}/${it.length}` : ''}</small><i class="bd-rs" data-nrs></i></div>`; }).join('') || '<div class="bd-empty">Nástenka je prázdna – pridaj poznámku alebo zoznam úloh.</div>';
    $$('.bd-note', area).forEach(el => {
      const n = notes.find(x => x.id === el.dataset.n), save = () => ctx.save();
      const drag = (handle, onMove) => {
        let d = null;
        handle.addEventListener('pointerdown', e => { if (e.target.closest('button, input:not([data-nt]), textarea') || (e.target.matches('[data-nt]') && document.activeElement === e.target)) return; d = { x: e.clientX, y: e.clientY, n: { ...n } }; handle.setPointerCapture(e.pointerId); });
        handle.addEventListener('pointermove', e => { if (!d) return; const z = (S().nexus.zoom || 100) / 100 * ((DK().wins.board || {}).zoom || 100) / 100; if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 3) { e.preventDefault(); onMove((e.clientX - d.x) / z, (e.clientY - d.y) / z, d.n); } });
        handle.addEventListener('pointerup', () => { if (d) { d = null; save(); } });
      };
      drag($('[data-nd]', el), (dx, dy, o) => { n.x = Math.max(0, o.x + dx); n.y = Math.max(0, o.y + dy); el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; });
      drag($('[data-nrs]', el), (dx, dy, o) => { n.w = Math.max(170, o.w + dx); n.h = Math.max(120, o.h + dy); el.style.width = n.w + 'px'; el.style.height = n.h + 'px'; });
      el.addEventListener('pointerdown', () => { if (notes[notes.length - 1] !== n) { notes.splice(notes.indexOf(n), 1); notes.push(n); area.appendChild(el); } });
      $('[data-nt]', el).onchange = e => { n.title = e.target.value.slice(0, 60); save(); };
      const tx = $('[data-ntext]', el); if (tx) tx.oninput = () => { n.text = tx.value; clearTimeout(n._t); n._t = setTimeout(save, 600); };
      $('[data-nc]', el).onclick = () => { n.color = BD_COLORS[(BD_COLORS.indexOf(n.color) + 1) % BD_COLORS.length]; el.style.setProperty('--nc', n.color); save(); };
      $('[data-ndel]', el).onclick = () => { if ((n.text || (n.items || []).length) && !confirm('Zmazať tento lístok?')) return; B.notes = notes.filter(x => x !== n); save(); paintBoard(); refreshBadges(); };
      $$('[data-ic]', el).forEach(c => c.onchange = () => { n.items[+c.dataset.ic].done = c.checked; save(); paintBoard(); });
      $$('[data-idel]', el).forEach(c => c.onclick = e => { e.preventDefault(); n.items.splice(+c.dataset.idel, 1); save(); paintBoard(); });
      const add = $('[data-iadd]', el); if (add) add.onkeydown = e => { if (e.key === 'Enter' && add.value.trim()) { n.items.push({ t: add.value.trim().slice(0, 200), done: false }); save(); paintBoard(); const a2 = $(`.bd-note[data-n="${n.id}"] [data-iadd]`, area); if (a2) a2.focus(); } };
    });
  }
  function paintLive() {
    if (!page || !page.classList.contains('open')) return;
    const T = totals(), a = A(), R = S().robot;
    const st = $('#nxStats');
    if (st) st.innerHTML = [['Zostatok', usd(T.balance)], ['Equity', usd(T.equity)], ['Otvorený P/L', usd(T.open), T.open], ['Celkový P/L', usd(T.equity - a.start), T.equity - a.start],
      ['Úspešnosť', T.win === null ? '—' : (100 * T.win).toFixed(0) + ' %'], ['Obchodov', T.n]].map(([n, v, c]) => `<div><small>${n}</small><b class="priv ${c > 0 ? 'up' : c < 0 ? 'dn' : ''}">${v}</b></div>`).join('');
    refreshBadges();
    const hs = $('#nxHeadSum'); if (hs) hs.innerHTML = `Equity <b class="priv">${usd(T.equity)}</b> · otvorené pozície ${a.positions.length} · robot ${R.on ? '<b class="up">beží</b>' : 'vypnutý'}`;
    const pl = $('#nxPosList');
    if (pl) {
      pl.innerHTML = a.positions.length ? `<table class="tt nx-t"><tr><th>Symbol</th><th>Smer</th><th>Loty</th><th>Vstup</th><th>Teraz</th><th>SL / TP</th><th>Pri SL / TP</th><th>Max ▲ / ▼</th><th>Čas</th><th>P/L</th><th></th></tr>
        ${a.positions.map(p => { const v = pnlOf(p, prices[p.symbol]); return `<tr><td>${esc(sym(p.symbol).name)}${p.src === 'robot' ? ' <small class="muted">🤖 ' + esc(p.note || '') + '</small>' : ''}</td>
          <td><span class="pill ${p.dir > 0 ? 'win' : 'loss'}">${p.dir > 0 ? 'LONG' : 'SHORT'}</span></td><td>${p.lots}</td><td>${f2(p.entry, p.symbol)}</td><td>${f2(prices[p.symbol], p.symbol)}</td>
          <td>${p.sl ? f2(p.sl, p.symbol) : '–'} / ${p.tp ? f2(p.tp, p.symbol) : '–'}</td><td>${(e => `<span class="dn">${e.sl === null ? '–' : money(e.sl)}</span> / <span class="up">${e.tp === null ? '–' : money(e.tp)}</span>`)(expected(p))}</td>
          <td><span class="up">${money(p.best)}</span> / <span class="dn">${money(p.worst)}</span></td><td>${dur(Date.now() - p.time)}</td><td class="${v >= 0 ? 'up' : 'dn'}"><b>${usd(v)}</b></td><td><button class="btn sm" data-cl="${p.id}">Zavrieť</button></td></tr>`; }).join('')}</table>`
        : '<div class="muted">Žiadne otvorené pozície.</div>';
      $$('[data-cl]', pl).forEach(b => b.onclick = () => { const p = a.positions.find(x => x.id === b.dataset.cl); if (p) { closePos(p, prices[p.symbol] ?? p.entry, 'ručne'); paintLive(); } });
    }
    const hl = $('#nxHistList');
    if (hl) {
      const all = a.history.filter(h => Number.isFinite(h.pnl));
      const list = all.filter(h => histFilter === 'all' || (histFilter === 'win' ? h.pnl > 0 : histFilter === 'loss' ? h.pnl <= 0 : histFilter === 'robot' ? h.src === 'robot' : h.src !== 'robot'));
      const wins = all.filter(h => h.pnl > 0), losses = all.filter(h => h.pnl <= 0), sum = all.reduce((s2, h) => s2 + h.pnl, 0);
      const gw = wins.reduce((s2, h) => s2 + h.pnl, 0), gl = -losses.reduce((s2, h) => s2 + h.pnl, 0);
      const best = all.reduce((m, h) => (!m || h.pnl > m.pnl ? h : m), null), worst = all.reduce((m, h) => (!m || h.pnl < m.pnl ? h : m), null);
      const avgDur = all.length ? all.reduce((s2, h) => s2 + (h.exitTime - h.time), 0) / all.length : 0;
      const hs2 = $('#nxHistSum');
      if (hs2) hs2.innerHTML = [['Celkový P/L', money(sum), sum], ['Úspešnosť', all.length ? Math.round(100 * wins.length / all.length) + ' %' : '—'], ['Profit faktor', gl ? (gw / gl).toFixed(2) : wins.length ? '∞' : '—'],
        ['Obchodov', `${all.length} <small>(${wins.length} ✓ · ${losses.length} ✗)</small>`], ['Najlepší', best ? money(best.pnl) : '—', 1], ['Najhorší', worst ? money(worst.pnl) : '—', -1],
        ['Priem. zisk', wins.length ? money(gw / wins.length) : '—', 1], ['Priem. strata', losses.length ? money(-gl / losses.length) : '—', -1], ['Priem. trvanie', all.length ? dur(avgDur) : '—']]
        .map(([n, v, c]) => `<div><small>${n}</small><b class="priv ${c > 0 ? 'up' : c < 0 ? 'dn' : ''}">${v}</b></div>`).join('');
      // equity curve of the closed trades, oldest to newest
      const cv = $('#nxCurve');
      if (cv) {
        const pts = [a.start]; [...all].reverse().forEach(h => pts.push(pts[pts.length - 1] + h.pnl));
        if (pts.length < 2) cv.innerHTML = '';
        else {
          const lo = Math.min(...pts), hi = Math.max(...pts), W = 600, H = 90, X = i => (i / (pts.length - 1)) * W, Y = v => H - 6 - ((v - lo) / (hi - lo || 1)) * (H - 12);
          const line = pts.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' '), up = pts[pts.length - 1] >= a.start;
          cv.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs><linearGradient id="nxEq" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${up ? '#10b981' : '#ef4444'}" stop-opacity=".35"/><stop offset="1" stop-color="${up ? '#10b981' : '#ef4444'}" stop-opacity="0"/></linearGradient></defs>
            <line x1="0" x2="${W}" y1="${Y(a.start)}" y2="${Y(a.start)}" stroke="rgba(255,255,255,.18)" stroke-dasharray="4 4"/>
            <polygon points="0,${H} ${line} ${W},${H}" fill="url(#nxEq)"/><polyline points="${line}" fill="none" stroke="${up ? '#10b981' : '#ef4444'}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>
            <span class="nx-cv-l">Krivka zostatku · ${pts.length - 1} obchodov</span>`;
        }
      }
      hl.innerHTML = list.length ? `<table class="tt nx-t nx-ht"><tr><th>Zavreté</th><th>Symbol</th><th>Smer</th><th>Loty</th><th>Vstup → výstup</th><th>P/L</th><th>Max ▲ / ▼</th><th>Trvanie</th><th>Dôvod</th></tr>
        ${list.slice(0, 150).map(h => `<tr class="${h.pnl > 0 ? 'w' : 'l'}"><td>${when(h.exitTime)}</td><td><b>${esc(sym(h.symbol).name)}</b>${h.src === 'robot' ? ' 🤖' : h.src === 'algo' ? ' 🧠' : ''}${h.by && h.by !== me() ? ` <small class="muted">👤 ${esc(h.by)}</small>` : ''}</td><td><span class="pill ${h.dir > 0 ? 'win' : 'loss'}">${h.dir > 0 ? 'BUY' : 'SELL'}</span></td>
          <td>${h.lots}</td><td>${f2(h.entry, h.symbol)} → ${f2(h.exit, h.symbol)}</td><td class="${h.pnl >= 0 ? 'up' : 'dn'}"><b class="priv">${money(h.pnl)}</b></td><td class="priv"><span class="up">${money(h.best)}</span> / <span class="dn">${money(h.worst)}</span></td><td>${dur(h.exitTime - h.time)}</td><td class="muted">${esc(h.reason || '')}</td></tr>`).join('')}</table>`
        : `<div class="muted" style="padding:10px">${a.history.length ? 'Nič podľa filtra.' : 'Zatiaľ žiadne uzavreté obchody.'}</div>`;
    }
    const bt = $('#nxBotTable');
    if (bt) {
      const keys = R.symbols.flatMap(s => R.tfs.map(t => s + '|' + t));
      bt.innerHTML = `<table class="tt nx-t"><tr><th>Trh</th><th>Cena</th><th>SMA${R.period}</th><th>Signál</th><th>Pozícia</th><th>P/L (body)</th><th>Stav</th></tr>${keys.map(k => {
        const [s, t] = k.split('|'), x = R.state[k] || {}, pl2 = x.pos ? (x.price - x.entry) * x.pos : NaN;
        return `<tr><td><b>${esc(sym(s).name)}</b> ${t}</td><td>${f2(x.price, s)}</td><td>${f2(x.sma, s)}</td>
          <td>${x.sig > 0 ? '<span class="pill win">KÚPIŤ</span>' : x.sig < 0 ? '<span class="pill loss">PREDAŤ</span>' : '–'}</td>
          <td>${x.pos ? `<span class="pill ${x.pos > 0 ? 'win' : 'loss'}">${x.pos > 0 ? 'LONG' : 'SHORT'}</span> @ ${f2(x.entry, s)}` : x.wait ? '⏸ čaká na nový prechod' : '–'}</td>
          <td class="${pl2 >= 0 ? 'up' : 'dn'}">${Number.isFinite(pl2) ? (pl2 >= 0 ? '+' : '') + f2(pl2, s) : ''}</td>
          <td class="muted">${x.err ? '⚠ ' + esc(x.err) : x.sharp ? (x.sharp > 0 ? '⚡ prudký rast' : '⚡ prudký pokles') : x.checked ? 'sledujem' : R.on ? 'načítavam…' : ''}</td></tr>`; }).join('')}</table>`;
    }
    const bl = $('#nxBotLog');
    if (bl) bl.innerHTML = R.log.slice(0, 40).map(l => { const [s, t] = l.key.split('|'); return `<div class="${l.kind}"><span class="muted">${when(l.t)}</span> <b>${esc(sym(s).name)} ${t}</b> ${esc(l.text)}</div>`; }).join('') || '<div class="muted">Zatiaľ nič.</div>';
  }
  function paintFolders() {
    const box = $('#nxFolders'); if (!box) return;
    const K = ctx.kinds(), msgs = ctx.chatMsgs(), F = S().folders || [];
    box.innerHTML = `<div class="nx-sub">Kategórie</div><div class="nx-cats">${Object.entries(K).map(([k, [ic, n, col]]) => `<span data-cat="${k}" style="--kc:${col}">${ic} ${n} <b>${msgs.filter(m => m.kind === k).length}</b></span>`).join('')}</div>
      <div class="nx-sub">Moje priečinky</div>
      <div class="nx-new"><input class="idea-in" id="nfName" placeholder="Nový priečinok…"><button class="btn sm" id="nfAdd">➕ Vytvoriť</button>
        <button class="btn sm" id="nfCat" title="Skopíruje všetky správy vybranej kategórie do nového priečinka">📥 Uložiť kategóriu…</button></div>
      ${F.map(f => `<details class="nx-fold" style="--fc:${f.color}"><summary><span class="dot"></span><b>${esc(f.name)}</b> <small class="muted">${f.items.length} správ</small><span class="grow"></span>
          <button class="ib" data-fo="${f.id}" title="Otvoriť v chate">💬</button><button class="ib" data-fr="${f.id}" title="Premenovať">✎</button><button class="ib" data-fc="${f.id}" title="Zmeniť farbu">🎨</button><button class="ib" data-fd="${f.id}" title="Zmazať priečinok">🗑</button></summary>
        ${f.items.slice(-30).reverse().map(m => `<div class="nx-fi" style="--kc:${(K[m.kind] || K.msg)[2]}"><small class="muted">${esc(m.author)} · ${esc(new Date(m.created_at).toLocaleString('sk-SK'))}</small><div>${esc(m.text).slice(0, 400)}</div></div>`).join('') || '<div class="muted">Prázdny – správy pridáš tlačidlom 📁 v chate.</div>'}</details>`).join('') || '<div class="muted">Zatiaľ žiadne priečinky.</div>'}`;
    $$('[data-cat]', box).forEach(x => x.onclick = () => ctx.openChat(x.dataset.cat));
    const add = () => { const v = $('#nfName').value.trim(); if (!v) return; ctx.newFolder(v); paintFolders(); };
    $('#nfAdd').onclick = add; $('#nfName').onkeydown = e => { if (e.key === 'Enter') add(); };
    $('#nfCat').onclick = () => {
      const k = prompt('Ktorú kategóriu uložiť? ' + Object.entries(K).map(([k2, [, n]]) => `${k2} = ${n}`).join(', '), 'idea');
      if (!k || !K[k]) return;
      const f = ctx.newFolder(`${K[k][1]} ${new Date().toLocaleDateString('sk-SK')}`);
      msgs.filter(m => m.kind === k).forEach(m => f.items.push({ id: m.id, author: m.author, kind: m.kind, text: m.text, created_at: m.created_at, symbol: m.symbol, timeframe: m.timeframe, bar_time: m.bar_time, price: m.price }));
      ctx.save(); paintFolders(); ctx.toast(`📁 ${f.name}: ${f.items.length} správ`);
    };
    const fo = id => F.find(f => f.id === id);
    $$('[data-fo]', box).forEach(x => x.onclick = e => { e.preventDefault(); ctx.openChat('f:' + x.dataset.fo); });
    $$('[data-fr]', box).forEach(x => x.onclick = e => { e.preventDefault(); const f = fo(x.dataset.fr), v = prompt('Nový názov priečinka', f.name); if (v && v.trim()) { f.name = v.trim().slice(0, 40); ctx.save(); paintFolders(); } });
    $$('[data-fc]', box).forEach(x => x.onclick = e => { e.preventDefault(); const f = fo(x.dataset.fc), C = ctx.folderColors(); f.color = C[(C.indexOf(f.color) + 1) % C.length]; ctx.save(); paintFolders(); });
    $$('[data-fd]', box).forEach(x => x.onclick = e => { e.preventDefault(); const f = fo(x.dataset.fd); if (confirm(`Zmazať priečinok „${f.name}“? (správy v chate ostanú)`)) { S().folders = F.filter(y => y !== f); ctx.save(); paintFolders(); } });
  }
  function paintIdeas() {
    const box = $('#nxIdeaBox'); if (!box) return;
    const ideas = ctx.chatMsgs().filter(m => m.kind === 'idea').slice(-15).reverse(), live = ctx.liveIdeas();
    box.innerHTML = `${live.length ? `<div class="nx-sub">⚡ Posledné nápady zo skenera / grafu</div>${live.slice(0, 8).map(x => `<div class="nx-idea" data-li="${x.i}"><span class="pill ${x.dir > 0 ? 'win' : 'loss'}">${x.dir > 0 ? 'LONG' : 'SHORT'}</span>
        <b>${esc(sym(x.symbol).name)} ${esc(x.tf)}</b> ${esc(x.name)} · vstup ${f2(x.entry, x.symbol)} · SL ${f2(x.sl, x.symbol)} · TP ${f2(x.tp, x.symbol)} <small class="muted">${'★'.repeat(x.score || 0)}</small></div>`).join('')}` : ''}
      <div class="nx-sub">💡 Nápady z chatu</div>${ideas.map(m => `<div class="nx-fi" style="--kc:#ffca28"><small class="muted">${esc(m.author)} · ${esc(new Date(m.created_at).toLocaleString('sk-SK'))}</small><div>${esc(m.text).slice(0, 300)}</div></div>`).join('') || '<div class="muted">Zatiaľ žiadne – v chate zvoľ kategóriu 💡 Obchodný nápad.</div>'}`;
    $$('[data-li]', box).forEach(x => x.onclick = () => { const it = live.find(y => String(y.i) === x.dataset.li); if (it) { close(); ctx.jumpTo(it); } });
  }
  function open() { page.classList.add('open'); $('#nexusHud').classList.add('on'); paint(); pollPrices(); }
  function close() { page.classList.remove('open'); $('#nexusHud').classList.remove('on'); }
  function toggle() { if (page.classList.contains('open')) close(); else open(); }
  return {
    init(c) {
      ctx = c; S = c.S; page = $('#nexusPage');
      layer = document.createElement('div'); layer.id = 'posLayer'; document.body.appendChild(layer);
      hud(); pollPrices(); paintCards(); paintTicket();
      setInterval(syncShared, 4000);
      if (S().robot.on) robotTick();
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && page.classList.contains('open') && !UI.dialogOpen() && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) { e.stopImmediatePropagation(); close(); } }, true);
    },
    open, close, toggle, isOpen: () => page && page.classList.contains('open'),
    refresh() { if (page && page.classList.contains('open')) { paintFolders(); paintIdeas(); } },
    // live price of the open chart: update the cards and check stop loss / take profit at once
    tick() {
      if (!ctx) return;
      const id = ctx.chartSymbol(), price = ctx.livePrice(id);
      if (Number.isFinite(price)) {
        prices[id] = price;
        checkHits(id, price, price);
      }
      paintCards(); paintTicket();
    },
    chartLines: s => (ctx ? chartLines(s) : []), chartTrades: s => (ctx ? chartTrades(s) : []), chartMarkers: s => (ctx ? chartMarkers(s) : []),
    moveLine, removeLine,
    algoTrade,
    toggleTicket() { const P = PL(); P.open = !P.open; ctx.save(); paintTicket(); ctx.onTrades(); },
    chartChanged() { if (!ctx) return; lineSig = ''; paintCards(); },
  };
})();
window.NEXUS = NEXUS;   // reachable from the extra charts of the multi-chart layout (parent.NEXUS)
