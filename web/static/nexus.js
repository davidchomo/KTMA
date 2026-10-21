// Nexus: the floating ◆ NEXUS button and the base page behind it – profile, paper trading account (positions,
// history, balance), the SMA robot that watches every timeframe, trading ideas, chat folders, quotes and tips.
// NEXUS.init(ctx) connects it to the chart app; all data lives in the app state (synced with your name).

const NEXUS = (() => {
  const { $, $$, esc, LS } = UI;
  const LOT = { XAUUSD: 100, XAGUSD: 5000, BTCUSD: 1 };
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
  const A = () => S().account;
  function openPos(o) {
    const p = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), time: Date.now(), ...o };
    A().positions.push(p); ctx.save(); return p;
  }
  function closePos(p, price, reason) {
    const a = A(); if (!a.positions.includes(p)) return;
    a.positions = a.positions.filter(x => x !== p);
    a.history.unshift({ ...p, exit: price, exitTime: Date.now(), pnl: pnlOf(p, price), reason });
    if (a.history.length > 500) a.history.length = 500;
    ctx.save();
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
        for (const p of [...A().positions].filter(x => x.symbol === id)) {
          const hitSL = p.sl && (p.dir > 0 ? b.low <= p.sl : b.high >= p.sl), hitTP = p.tp && (p.dir > 0 ? b.high >= p.tp : b.low <= p.tp);
          if (hitSL) { closePos(p, p.sl, 'stop loss'); ctx.toast(`🛑 ${sym(id).name}: stop loss ${f2(p.sl, id)}`); }
          else if (hitTP) { closePos(p, p.tp, 'take profit'); ctx.toast(`🎯 ${sym(id).name}: take profit ${f2(p.tp, id)}`); }
        }
      } catch (e) {}
    }
    if (page && page.classList.contains('open')) paintLive();
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

  // ---- HUD button --------------------------------------------------------------------------------------
  function hud() {
    const b = $('#nexusHud'), N = S().nexus;
    const place = () => {
      if (N.hudX === null || N.hudX === undefined) { b.style.left = '50%'; b.style.top = ''; b.style.bottom = '14px'; b.style.transform = 'translateX(-50%)'; return; }
      b.style.transform = ''; b.style.bottom = '';
      b.style.left = Math.max(0, Math.min(innerWidth - b.offsetWidth, N.hudX)) + 'px'; b.style.top = Math.max(0, Math.min(innerHeight - b.offsetHeight, N.hudY)) + 'px';
    };
    let d = null, moved = false;
    b.addEventListener('pointerdown', e => { const r = b.getBoundingClientRect(); d = { x: e.clientX - r.left, y: e.clientY - r.top, sx: e.clientX, sy: e.clientY }; moved = false; b.setPointerCapture(e.pointerId); });
    b.addEventListener('pointermove', e => {
      if (!d) return;
      if (!moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 5) return;
      moved = true; N.hudX = e.clientX - d.x; N.hudY = e.clientY - d.y; place();
    });
    b.addEventListener('pointerup', () => { if (!d) return; d = null; if (moved) ctx.save(); else toggle(); });
    b.addEventListener('dblclick', e => e.preventDefault());
    b.addEventListener('contextmenu', e => { e.preventDefault(); N.hudX = N.hudY = null; place(); ctx.save(); ctx.toast('◆ NEXUS vrátený dole do stredu'); });
    window.addEventListener('resize', place);
    place();
  }

  // ---- page ----------------------------------------------------------------------------------------------
  function avatarHtml(size) {
    const N = S().nexus, name = S().labeler || '?';
    return N.avatar ? `<img class="nx-av" src="${esc(N.avatar)}" style="width:${size}px;height:${size}px" alt="">`
      : `<span class="nx-av" style="width:${size}px;height:${size}px;font-size:${size / 2.4}px">${esc(name.slice(0, 1).toUpperCase())}</span>`;
  }
  function card(id, title, body, extra) { return `<section class="nx-card" id="${id}"><header><span>${title}</span><span class="grow"></span>${extra || ''}</header><div class="nx-cb">${body}</div></section>`; }
  function paint() {
    if (!page) return;
    const R = S().robot, a = A(), name = S().labeler;
    page.innerHTML = `<div class="nx-head">${avatarHtml(46)}<div><div class="nx-name">${esc(name || 'Bez mena')}</div><div class="muted" id="nxHeadSum"></div></div><span class="grow"></span>
        <button class="btn sm" id="nxChat">💬 Chat</button><button class="btn sm" id="nxLib">📚 Knižnica</button><button class="btn sm" id="nxClose">📈 Späť na graf</button></div>
      <div class="nx-grid">
        ${card('nxAcc', '👤 Účet', `<div class="nx-prof"><label class="nx-avbox" title="Klikni a vyber obrázok">${avatarHtml(84)}<input type="file" accept="image/*" id="nxAvatar" hidden><small>zmeniť fotku</small></label>
            <div class="nx-pf"><label>Meno<input class="idea-in" id="nxName" value="${esc(name)}" placeholder="Tvoje meno"></label>
            <label>Počiatočný zostatok ($)<input class="idea-in" id="nxStart" type="number" min="0" step="100" value="${a.start}"></label></div></div>
          <div class="nx-stats" id="nxStats"></div>
          <div class="muted" style="font-size:11px;margin-top:6px">Papierový (demo) účet – žiadne skutočné peniaze ani broker. Slúži na tréning a sledovanie nápadov.</div>
          <div style="margin-top:6px"><button class="btn sm" id="nxReset">♻ Vynulovať účet</button></div>`)}
        ${card('nxPos', '📈 Otvorené pozície', `<div class="nx-new">
            <select id="npSym">${ctx.symbols().map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
            <input id="npLots" type="number" min="0.01" step="0.01" value="0.1" title="Loty"><input id="npSL" type="number" step="any" placeholder="SL"><input id="npTP" type="number" step="any" placeholder="TP">
            <button class="btn sm buy" data-np="1">▲ Kúpiť</button><button class="btn sm sell" data-np="-1">▼ Predať</button></div>
          <div id="nxPosList"></div>`)}
        ${card('nxBot', `🤖 Robot SMA${R.period}`, `<div class="nx-bot-cfg">
            <label class="ctl"><input type="checkbox" id="rbOn" ${R.on ? 'checked' : ''}> <b>Zapnutý</b></label>
            <label class="inl">Priemer SMA <input id="rbPer" type="number" min="2" max="200" value="${R.period}"></label>
            <span class="nx-chips">${ctx.symbols().map(s => `<span data-rs="${s.id}" class="${R.symbols.includes(s.id) ? 'on' : ''}">${esc(s.name)}</span>`).join('')}</span>
            <span class="nx-chips">${['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d'].map(t => `<span data-rt="${t}" class="${R.tfs.includes(t) ? 'on' : ''}">${t}</span>`).join('')}</span>
            <label class="inl">Prudký pohyb = <input id="rbN" type="number" min="2" max="10" value="${R.sharpBars}"> sviečky za sebou a ≥ <input id="rbK" type="number" min="0.5" max="10" step="0.5" value="${R.sharpAtr}"> × ATR</label>
            <label class="inl">Pri prudkom pohybe <select id="rbSharp">${[['both', 'v smere: vybrať zisk · proti: otočiť'], ['take', 'iba vybrať zisk'], ['flip', 'iba otočiť pri pohybe proti'], ['off', 'nič – iba SMA']].map(([k, n]) => `<option value="${k}" ${R.onSharp === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
            <label class="ctl"><input type="checkbox" id="rbPaper" ${R.paper ? 'checked' : ''}> Obchodovať na papierovom účte, <input id="rbLots" type="number" min="0.01" step="0.01" value="${R.lots}"> lotu</label>
          </div><div id="nxBotTable"></div><div class="nx-sub">Denník robota <button class="btn sm" id="rbClear">vymazať</button></div><div id="nxBotLog" class="nx-log"></div>
          <div class="muted" style="font-size:11px;margin-top:6px">Robot kontroluje trh každých 30 s a koná raz za každú uzavretú sviečku daného timeframu. Beží, kým je stránka otvorená.</div>`)}
        ${card('nxHist', '📜 História obchodov', '<div id="nxHistList"></div>')}
        ${card('nxIdeas', '💡 Obchodné nápady', '<div id="nxIdeaList"></div>')}
        ${card('nxFold', '📁 Chat a priečinky', '<div id="nxFolders"></div>')}
        ${card('nxQuote', '✨ Motivácia a tipy', '<div id="nxQuoteBox"></div>', '<button class="ib" id="nxNext" title="Ďalší">↻</button>')}
      </div>`;
    bind(); paintLive(); paintFolders(); paintIdeas(); paintQuote();
  }
  function paintLive() {
    if (!page || !page.classList.contains('open')) return;
    const T = totals(), a = A(), R = S().robot;
    const st = $('#nxStats');
    if (st) st.innerHTML = [['Zostatok', usd(T.balance)], ['Equity', usd(T.equity)], ['Otvorený P/L', usd(T.open), T.open], ['Celkový P/L', usd(T.equity - a.start), T.equity - a.start],
      ['Úspešnosť', T.win === null ? '—' : (100 * T.win).toFixed(0) + ' %'], ['Obchodov', T.n]].map(([n, v, c]) => `<div><small>${n}</small><b class="${c > 0 ? 'up' : c < 0 ? 'dn' : ''}">${v}</b></div>`).join('');
    const hs = $('#nxHeadSum'); if (hs) hs.innerHTML = `Equity <b>${usd(T.equity)}</b> · otvorené pozície ${a.positions.length} · robot ${R.on ? '<b class="up">beží</b>' : 'vypnutý'}`;
    const pl = $('#nxPosList');
    if (pl) {
      pl.innerHTML = a.positions.length ? `<table class="tt nx-t"><tr><th>Symbol</th><th>Smer</th><th>Loty</th><th>Vstup</th><th>Teraz</th><th>SL / TP</th><th>P/L</th><th></th></tr>
        ${a.positions.map(p => { const v = pnlOf(p, prices[p.symbol]); return `<tr><td>${esc(sym(p.symbol).name)}${p.src === 'robot' ? ' <small class="muted">🤖 ' + esc(p.note || '') + '</small>' : ''}</td>
          <td><span class="pill ${p.dir > 0 ? 'win' : 'loss'}">${p.dir > 0 ? 'LONG' : 'SHORT'}</span></td><td>${p.lots}</td><td>${f2(p.entry, p.symbol)}</td><td>${f2(prices[p.symbol], p.symbol)}</td>
          <td>${p.sl ? f2(p.sl, p.symbol) : '–'} / ${p.tp ? f2(p.tp, p.symbol) : '–'}</td><td class="${v >= 0 ? 'up' : 'dn'}"><b>${usd(v)}</b></td><td><button class="btn sm" data-cl="${p.id}">Zavrieť</button></td></tr>`; }).join('')}</table>`
        : '<div class="muted">Žiadne otvorené pozície.</div>';
      $$('[data-cl]', pl).forEach(b => b.onclick = () => { const p = a.positions.find(x => x.id === b.dataset.cl); if (p) { closePos(p, prices[p.symbol] ?? p.entry, 'ručne'); paintLive(); } });
    }
    const hl = $('#nxHistList');
    if (hl) hl.innerHTML = a.history.length ? `<table class="tt nx-t"><tr><th>Zavreté</th><th>Symbol</th><th>Smer</th><th>Loty</th><th>Vstup → výstup</th><th>P/L</th><th>Dôvod</th></tr>
      ${a.history.slice(0, 60).map(h => `<tr><td>${when(h.exitTime)}</td><td>${esc(sym(h.symbol).name)}${h.src === 'robot' ? ' 🤖' : ''}</td><td><span class="pill ${h.dir > 0 ? 'win' : 'loss'}">${h.dir > 0 ? 'LONG' : 'SHORT'}</span></td>
        <td>${h.lots}</td><td>${f2(h.entry, h.symbol)} → ${f2(h.exit, h.symbol)}</td><td class="${h.pnl >= 0 ? 'up' : 'dn'}"><b>${usd(h.pnl)}</b></td><td class="muted">${esc(h.reason || '')}</td></tr>`).join('')}</table>`
      : '<div class="muted">Zatiaľ žiadne uzavreté obchody.</div>';
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
    const box = $('#nxIdeas .nx-cb'); if (!box) return;
    const ideas = ctx.chatMsgs().filter(m => m.kind === 'idea').slice(-15).reverse(), live = ctx.liveIdeas();
    box.innerHTML = `${live.length ? `<div class="nx-sub">⚡ Posledné nápady zo skenera / grafu</div>${live.slice(0, 8).map(x => `<div class="nx-idea" data-li="${x.i}"><span class="pill ${x.dir > 0 ? 'win' : 'loss'}">${x.dir > 0 ? 'LONG' : 'SHORT'}</span>
        <b>${esc(sym(x.symbol).name)} ${esc(x.tf)}</b> ${esc(x.name)} · vstup ${f2(x.entry, x.symbol)} · SL ${f2(x.sl, x.symbol)} · TP ${f2(x.tp, x.symbol)} <small class="muted">${'★'.repeat(x.score || 0)}</small></div>`).join('')}` : ''}
      <div class="nx-sub">💡 Nápady z chatu</div>${ideas.map(m => `<div class="nx-fi" style="--kc:#ffca28"><small class="muted">${esc(m.author)} · ${esc(new Date(m.created_at).toLocaleString('sk-SK'))}</small><div>${esc(m.text).slice(0, 300)}</div></div>`).join('') || '<div class="muted">Zatiaľ žiadne – v chate zvoľ kategóriu 💡 Obchodný nápad.</div>'}`;
    $$('[data-li]', box).forEach(x => x.onclick = () => { const it = live.find(y => String(y.i) === x.dataset.li); if (it) { close(); ctx.jumpTo(it); } });
  }
  function paintQuote() {
    const box = $('#nxQuoteBox'); if (!box) return;
    const q = QUOTES[tipIdx % QUOTES.length], tips = LIB.TIPS, t = tips[tipIdx % tips.length], s = LIB.STRATS[tipIdx % LIB.STRATS.length];
    box.innerHTML = `<blockquote class="nx-q">„${esc(q[0])}“<cite>— ${esc(q[1])}</cite></blockquote>
      <div class="nx-sub">${t.ic} Tip: ${esc(t.name)}</div><ul class="nx-tip">${t.text.slice(0, 3).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      <div class="nx-sub">${s.ic} Stratégia na dnes: ${esc(s.name)}</div><div class="muted">${esc(s.desc)}</div>
      <div style="margin-top:6px"><button class="btn sm" data-more="${t.id}">Viac v knižnici</button></div>`;
    $('[data-more]', box).onclick = () => { close(); LIB.show('tips', t.id); };
  }
  function bind() {
    $('#nxClose').onclick = close;
    $('#nxChat').onclick = () => ctx.openChat();
    $('#nxLib').onclick = () => { close(); LIB.open(); };
    $('#nxNext').onclick = () => { tipIdx++; paintQuote(); };
    $('#nxName').onchange = e => { ctx.setName(e.target.value.trim()); paint(); };
    $('#nxStart').onchange = e => { A().start = Math.max(0, +e.target.value || 0); ctx.save(); paintLive(); };
    $('#nxReset').onclick = () => { if (confirm('Vynulovať papierový účet? Zmažú sa pozície aj história.')) { Object.assign(A(), { positions: [], history: [] }); ctx.save(); paintLive(); } };
    $('#nxAvatar').onchange = e => {
      const file = e.target.files[0]; if (!file) return;
      const img = new Image(), u = URL.createObjectURL(file);
      img.onload = () => { const c = document.createElement('canvas'), k = 160 / Math.min(img.width, img.height); c.width = c.height = 160;
        c.getContext('2d').drawImage(img, (160 - img.width * k) / 2, (160 - img.height * k) / 2, img.width * k, img.height * k); URL.revokeObjectURL(u);
        S().nexus.avatar = c.toDataURL('image/jpeg', 0.82); ctx.save(); paint(); };
      img.src = u;
    };
    $$('[data-np]', page).forEach(b => b.onclick = () => {
      const s = $('#npSym').value, price = prices[s];
      if (!Number.isFinite(price)) { ctx.toast('Cena sa ešte načítava…'); return; }
      const lots = Math.max(0.01, +$('#npLots').value || 0.1), sl = +$('#npSL').value || null, tp = +$('#npTP').value || null, dir = +b.dataset.np;
      openPos({ symbol: s, dir, lots, entry: price, sl, tp, src: 'ručne' }); ctx.toast(`${dir > 0 ? '▲ Kúpené' : '▼ Predané'} ${lots} lotu ${sym(s).name} @ ${f2(price, s)}`); paintLive(); pollPrices();
    });
    const R = S().robot, upd = () => { ctx.save(); paintLive(); };
    $('#rbOn').onchange = e => { R.on = e.target.checked; if (R.on) { log(R, (R.symbols[0] || '') + '|', 'robot zapnutý', ''); robotTick(); } else { clearTimeout(robotT); log(R, (R.symbols[0] || '') + '|', 'robot vypnutý (otvorené pozície ostávajú)', ''); } upd(); ctx.onRobot(R.on); };
    $('#rbPer').onchange = e => { R.period = Math.max(2, Math.min(200, +e.target.value || 10)); R.state = {}; paint(); upd(); };
    $('#rbN').onchange = e => { R.sharpBars = Math.max(2, Math.min(10, +e.target.value || 3)); upd(); };
    $('#rbK').onchange = e => { R.sharpAtr = Math.max(0.5, +e.target.value || 2); upd(); };
    $('#rbSharp').onchange = e => { R.onSharp = e.target.value; upd(); };
    $('#rbPaper').onchange = e => { R.paper = e.target.checked; upd(); };
    $('#rbLots').onchange = e => { R.lots = Math.max(0.01, +e.target.value || 0.1); upd(); };
    $('#rbClear').onclick = () => { R.log = []; upd(); };
    $$('[data-rs]', page).forEach(x => x.onclick = () => { const k = x.dataset.rs; R.symbols = R.symbols.includes(k) ? R.symbols.filter(y => y !== k) : [...R.symbols, k]; x.classList.toggle('on'); upd(); if (R.on) robotTick(); });
    $$('[data-rt]', page).forEach(x => x.onclick = () => { const k = x.dataset.rt; R.tfs = R.tfs.includes(k) ? R.tfs.filter(y => y !== k) : [...R.tfs, k]; x.classList.toggle('on'); upd(); if (R.on) robotTick(); });
  }
  function open() { page.classList.add('open'); $('#nexusHud').classList.add('on'); paint(); pollPrices(); }
  function close() { page.classList.remove('open'); $('#nexusHud').classList.remove('on'); }
  function toggle() { if (page.classList.contains('open')) close(); else open(); }
  return {
    init(c) {
      ctx = c; S = c.S; page = $('#nexusPage');
      hud(); pollPrices();
      if (S().robot.on) robotTick();
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && page.classList.contains('open') && !UI.dialogOpen() && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) { e.stopImmediatePropagation(); close(); } }, true);
    },
    open, close, toggle, isOpen: () => page && page.classList.contains('open'),
    refresh() { if (page && page.classList.contains('open')) { paintFolders(); paintIdeas(); } },
  };
})();
