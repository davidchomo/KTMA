// Order flow: the live tape of trades (time & sales) from Binance, buyers vs sellers in lots, delta over 1 / 5 / 15 minutes
// and the biggest trades. FLOW.open(symbol), FLOW.close(), FLOW.setSymbol(symbol); symbol = {id, name, ticker, market, digits}.

const FLOW = (() => {
  const { $, $$, esc, LS } = UI;
  // contract size of one standard lot (what forex / CFD brokers call 1 lot)
  const LOT = { XAUUSD: [100, 'oz'], XAGUSD: [5000, 'oz'], XPTUSD: [100, 'oz'], XPDUSD: [100, 'oz'], EURUSD: [100000, 'EUR'], BTCUSD: [1, 'BTC'], ETHUSD: [1, 'ETH'], SOLUSD: [1, 'SOL'], BNBUSD: [1, 'BNB'], XRPUSD: [1, 'XRP'], ADAUSD: [1, 'ADA'], DOGEUSD: [1, 'DOGE'] };
  const st = { unit: 'lots', big: 0, ...LS.get('nx-flow', {}) };
  let sym = null, ws = null, retry = null, trades = [], seed = [], paintT = null, el = null, open = false;
  const lot = () => (LOT[sym && sym.id] || [1, ''])[0];
  const unitName = () => (st.unit === 'lots' ? 'lot' : (LOT[sym && sym.id] || [1, 'ks'])[1]);
  const size = q => (st.unit === 'lots' ? q / lot() : q);
  const fmtQ = q => { const v = size(q); return v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v >= 0.01 ? v.toFixed(3) : v > 0 ? +v.toPrecision(2) + '' : '0'; };
  const fmtP = p => (+p).toFixed(sym ? sym.digits ?? 2 : 2);
  const hms = t => { const d = new Date(t); return d.toLocaleTimeString('sk-SK', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0').slice(0, 2); };

  function connect() {
    disconnect();
    if (!sym || !open) return;
    const base = sym.market === 'spot' ? 'wss://stream.binance.com:9443/ws/' : 'wss://fstream.binance.com/market/ws/';
    ws = new WebSocket(base + sym.ticker.toLowerCase() + '@aggTrade');
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.e !== 'aggTrade') return;
      trades.push({ t: m.T, p: +m.p, q: +m.q, buy: !m.m });
      const cut = Date.now() - 15 * 60 * 1000;
      if (trades.length > 6000 || (trades.length && trades[0].t < cut)) trades = trades.filter(x => x.t >= cut).slice(-6000);
      if (!paintT) paintT = setTimeout(() => { paintT = null; paint(); }, 250);
    };
    ws.onclose = () => { ws = null; if (open) retry = setTimeout(connect, 3000); };
  }
  function disconnect() { clearTimeout(retry); if (ws) { ws.onclose = null; ws.close(); ws = null; } }

  // 1-minute candles (with buyer volume) fill the time before the window was opened
  async function loadSeed() {
    seed = [];
    try {
      const r = await (await fetch(`api/candles?symbol=${sym.id}&tf=1m&limit=16&hours=false`)).json();
      seed = r.bars.filter(b => Number.isFinite(b[6])).map(b => ({ t: b[0] * 1000, v: b[5], bv: b[6] }));
    } catch (e) {}
    paint();
  }
  function stats(ms) {
    const from = Date.now() - ms, first = trades.length ? trades[0].t : Date.now(); let b = 0, s = 0, n = 0;
    for (let i = trades.length - 1; i >= 0 && trades[i].t >= from; i--) { if (trades[i].buy) b += trades[i].q; else s += trades[i].q; n++; }
    for (const x of seed) if (x.t >= from && x.t + 60000 <= first) { b += x.bv; s += x.v - x.bv; }
    return { b, s, n, d: b - s, pct: b + s ? (100 * b) / (b + s) : 50 };
  }
  function paint() {
    if (!open || !el) return;
    const body = $('#flowBody');
    if (!trades.length) { body.innerHTML = `<div class="muted" style="padding:14px">Čakám na obchody ${esc(sym ? sym.name : '')}…</div>`; return; }
    const rows = [['1 min', 60e3], ['5 min', 300e3], ['15 min', 900e3]].map(([n, ms]) => {
      const x = stats(ms);
      return `<div class="fl-row"><span class="fl-n">${n}</span><div class="fl-bar"><i style="width:${x.pct.toFixed(1)}%"></i></div>
        <span class="fl-v up">▲ ${fmtQ(x.b)}</span><span class="fl-v dn">▼ ${fmtQ(x.s)}</span><b class="fl-d ${x.d >= 0 ? 'up' : 'dn'}">Δ ${x.d >= 0 ? '+' : '−'}${fmtQ(Math.abs(x.d))}</b></div>`;
    }).join('');
    const recent = trades.slice(-400), qs = recent.map(x => x.q).sort((a, b) => a - b);
    const bigCut = st.big > 0 ? st.big * (st.unit === 'lots' ? lot() : 1) : qs[Math.floor(qs.length * 0.97)] || Infinity;
    const big = trades.filter(x => x.q >= bigCut).slice(-12).reverse();
    const maxQ = qs[qs.length - 1] || 1, last = trades.slice(-70).reverse();
    body.innerHTML = `<div class="fl-sec">Kupujúci vs. predávajúci <small class="muted">(${unitName()})</small></div>${rows}
      <div class="fl-sec">🐋 Veľké obchody <small class="muted">${st.big > 0 ? `≥ ${st.big} ${unitName()}` : 'najväčšie 3 %'}</small></div>
      <div class="fl-big">${big.map(x => `<span class="${x.buy ? 'up' : 'dn'}" title="${hms(x.t)} · ${fmtP(x.p)}">${x.buy ? '▲' : '▼'} ${fmtQ(x.q)} @ ${fmtP(x.p)}</span>`).join('') || '<span class="muted">zatiaľ žiadne</span>'}</div>
      <div class="fl-sec">Páska obchodov <small class="muted">najnovšie hore</small></div>
      <div class="fl-tape">${last.map(x => `<div class="${x.buy ? 'up' : 'dn'} ${x.q >= bigCut ? 'big' : ''}"><span>${hms(x.t)}</span><span>${fmtP(x.p)}</span><span>${fmtQ(x.q)}</span>
        <i style="width:${Math.max(2, (100 * Math.sqrt(x.q / maxQ))).toFixed(0)}%"></i></div>`).join('')}</div>`;
  }
  let bound = false;
  function frame() {
    el = $('#flowWin');
    $('#flowTitle').textContent = '🌊 ' + (sym ? sym.name : 'Tok obchodov');
    $('#flUnit').innerHTML = [['lots', 'Loty'], ['raw', LOT[sym && sym.id] ? LOT[sym.id][1] : 'kusy']].map(([k, n]) => `<option value="${k}" ${st.unit === k ? 'selected' : ''}>${n}</option>`).join('');
    $('#flBig').value = st.big || '';
    $('#flowFoot').innerHTML = `Každý riadok = obchod, kde niekto <b class="up">kúpil ▲</b> (zaplatil cenu predávajúceho) alebo <b class="dn">predal ▼</b> <b>trhovým príkazom</b>.
      1 lot = ${lot()} ${LOT[sym && sym.id] ? LOT[sym.id][1] : ''}. Zdroj: Binance ${esc(sym ? sym.ticker : '')} – nie celý svetový trh.`;
    if (bound) return;
    bound = true;
    $('#flUnit').onchange = e => { st.unit = e.target.value; LS.set('nx-flow', st); paint(); };
    $('#flBig').onchange = e => { st.big = +e.target.value || 0; LS.set('nx-flow', st); paint(); };
    $('#flowMin').onclick = () => el.classList.toggle('min');
    $('#flowClose').onclick = () => api.close();
  }
  const api = {
    open(s) { sym = s; open = true; trades = []; frame(); el.classList.add('open'); paint(); connect(); loadSeed(); api.onToggle && api.onToggle(true); },
    close() { open = false; disconnect(); if (el) el.classList.remove('open'); api.onToggle && api.onToggle(false); },
    setSymbol(s) { if (!open || (sym && s.id === sym.id)) { sym = s; return; } sym = s; trades = []; frame(); paint(); connect(); loadSeed(); },
    isOpen: () => open,
    onToggle: null,
  };
  return api;
})();
