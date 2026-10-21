// Nexus Overgrown Lab: one market on every timeframe at once. Trendlines and levels are drawn on all of them, each timeframe gets
// its trend and a BUY / SELL verdict, and the moves are listed: where buyers or sellers stepped in (a break of a trendline, level,
// range or of the structure), how many pips and minutes the move ran, on how much volume, how one-sided the trades were and how sharp.
(() => {
  const { $, $$, esc, LS, toast } = UI;
  const LW = LightweightCharts, TFS = ['1m', '5m', '15m', '1h', '4h', '1d'], ALL_TFS = ['5m', '15m', '1h'];
  const SEC = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 }, W = { '1m': 0.6, '5m': 1, '15m': 1.3, '1h': 1.6, '4h': 2, '1d': 2.2 };
  const S = Object.assign({ symbol: 'XAUUSD', minAtr: 3, minPips: 0, auto: true }, LS.get('nxog', {}));
  const save = () => LS.set('nxog', S);
  const tz = (LS.get('nx2', {}) || {}).tz || 'Europe/Bratislava';
  const fmtT = new Intl.DateTimeFormat('sk-SK', { timeZone: tz, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const when = t => fmtT.format(new Date(t * 1000));
  let SYM = {}, META = { symbols: [] }, data = {}, charts = {}, autoT = null, seen = new Set(), busy = false;
  const status = t => { $('#ogStatus').textContent = t; };
  const digits = s => (SYM[s] ? SYM[s].digits : 2) ?? 2;

  async function fetchBars(symbol, tf, limit) {
    const r = await fetch(`api/candles?${new URLSearchParams({ symbol, tf, limit: String(limit), hours: 'true', spot: 'true' })}`);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.status);
    return (await r.json()).bars.map(b => ({ time: b[0], open: b[1], high: b[2], low: b[3], close: b[4], volume: b[5], buy: b[6] ?? NaN }));
  }
  // everything for one market and timeframe (closed bars only)
  async function analyse(symbol, tf, limit = 800) {
    const bars = await fetchBars(symbol, tf, limit), closed = bars.slice(0, -1);
    if (closed.length < 220) throw new Error('málo dát');
    const D = MV.toD(closed), R = TL.run(D, { k: TL.zigK(tf, SEC[tf]) });
    const mv = MV.moves(D, { tf, tfSec: SEC[tf], digits: digits(symbol), minAtr: S.minAtr, minPips: S.minPips, R });
    return { D, R, mv, tr: MV.trend(D, R), vd: MV.verdict(D, tf, { tfSec: SEC[tf] }), live: bars[bars.length - 1] };
  }

  // ---- the grid of charts ------------------------------------------------------------------------------------------
  function grid() {
    $('#ogGrid').innerHTML = TFS.map(tf => `<div class="og-cell" data-tf="${tf}"><div class="og-h"><b>${tf}</b><span class="og-b" data-tr></span><span class="og-b" data-vd></span><span class="grow"></span><span class="og-b" data-st></span></div><div class="og-ch"></div></div>`).join('');
  }
  function draw(tf) {
    const x = data[tf], cell = $(`.og-cell[data-tf="${tf}"]`); if (!cell) return;
    if (charts[tf]) { charts[tf].remove(); delete charts[tf]; }
    if (!x || x.err) { $('.og-ch', cell).innerHTML = `<div class="muted" style="padding:20px">${esc(x ? x.err : 'načítavam…')}</div>`; return; }
    $('.og-ch', cell).innerHTML = '';
    const ch = charts[tf] = LW.createChart($('.og-ch', cell), { autoSize: true, layout: { background: { color: 'transparent' }, textColor: '#b2b5be', fontSize: 10, attributionLogo: false },
      grid: { vertLines: { color: 'rgba(42,46,57,.35)' }, horzLines: { color: 'rgba(42,46,57,.35)' } }, timeScale: { timeVisible: true, borderColor: '#2a2e39', rightOffset: 4 },
      rightPriceScale: { borderColor: '#2a2e39' }, crosshair: { mode: 0 }, localization: { timeFormatter: when } });
    const { D, R, mv } = x, dg = digits(S.symbol), n = D.t.length;
    const main = ch.addSeries(LW.CandlestickSeries, { upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350',
      priceFormat: { type: 'price', precision: dg, minMove: 1 / 10 ** dg } });
    main.setData(D.t.map((t, i) => ({ time: t, open: D.o[i], high: D.h[i], low: D.l[i], close: D.c[i] })));
    const vol = ch.addSeries(LW.HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    vol.setData(D.t.map((t, i) => ({ time: t, value: D.v[i], color: D.c[i] >= D.o[i] ? 'rgba(38,166,154,.35)' : 'rgba(239,83,80,.35)' })));
    // trendlines: the active ones and those that ended in the last 150 bars, the strongest first
    const lines = R.lines.filter(l => l.ended == null || l.ended > n - 150).sort((a, b) => b.score - a.score).slice(0, 8);
    for (const l of lines) {
      const end = l.ended == null ? n - 1 : l.ended, s = ch.addSeries(LW.LineSeries, { color: l.kind === 'sup' ? 'rgba(38,166,154,.85)' : 'rgba(239,83,80,.85)', lineWidth: l.ended == null ? 2 : 1,
        lineStyle: l.ended == null ? 0 : 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, autoscaleInfoProvider: () => null });
      s.setData([{ time: D.t[l.i1], value: R.value(l, l.i1) }, { time: D.t[end], value: R.value(l, end) }]);
    }
    // levels with 3+ touches still alive
    for (const lv of R.levels.filter(v => v.ended == null && v.touches >= 3).slice(-6)) main.createPriceLine({ price: lv.price, color: 'rgba(255,183,77,.6)', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: `${lv.touches}×` });
    const marks = mv.moves.filter(m => m.i > n - 400).map(m => ({ time: m.t, position: m.dir > 0 ? 'belowBar' : 'aboveBar', shape: m.dir > 0 ? 'arrowUp' : 'arrowDown',
      color: m.dir > 0 ? '#00e676' : '#ff5252', text: `${m.pips} p${'★'.repeat(Math.min(3, m.stars))}`, size: 1 + Math.min(1.5, m.stars / 3) }));
    for (const m of mv.starting) marks.push({ time: m.t, position: m.dir > 0 ? 'belowBar' : 'aboveBar', shape: 'circle', color: '#ffd600', text: 'ZAČÍNA', size: 2 });
    marks.sort((a, b) => a.time - b.time);
    LW.createSeriesMarkers(main, marks);
    ch.timeScale().setVisibleLogicalRange({ from: n - 160, to: n + 3 });
    x.chart = ch;
    const B = (k, html) => { $(`[data-${k}]`, cell).innerHTML = html; };
    B('tr', badge(x.tr.dir, x.tr.dir > 0 ? 'trend ▲' : x.tr.dir < 0 ? 'trend ▼' : 'trend –'));
    B('vd', badge(x.vd.dir, `${x.vd.dir > 0 ? '🐂 BUY' : x.vd.dir < 0 ? '🐻 SELL' : 'NEUTRÁL'} ${Math.round(Math.abs(x.vd.score) * 100)} %`));
    B('st', mv.starting.length ? badge(mv.starting[0].dir, `⚡ začína ${mv.starting[0].dir > 0 ? '▲' : '▼'}`) : '');
  }
  const badge = (d, t) => `<span class="og-bd ${d > 0 ? 'b' : d < 0 ? 's' : 'n'}">${t}</span>`;

  // ---- side panel: trend on every timeframe, who is in control, moves starting now, the list of moves ---------------
  function side() {
    const rows = TFS.map(tf => [tf, data[tf]]).filter(([, x]) => x && !x.err);
    let w = 0, buy = 0, tsum = 0;
    for (const [tf, x] of rows) { w += W[tf]; buy += W[tf] * (x.vd.score + 1) / 2; tsum += W[tf] * x.tr.score; }
    const bp = w ? Math.round(100 * buy / w) : 50, td = w ? tsum / w : 0;
    $('#ogTrend').innerHTML = `<h4>🌱 ${esc((SYM[S.symbol] || {}).name || S.symbol)} – všetky timeframy</h4>
      <div class="og-pow"><span class="b" style="width:${bp}%">🐂 ${bp} %</span><span class="s" style="width:${100 - bp}%">${100 - bp} % 🐻</span></div>
      <div class="og-sum">Celkovo: ${badge(bp >= 58 ? 1 : bp <= 42 ? -1 : 0, bp >= 58 ? '🐂 prevaha kupujúcich' : bp <= 42 ? '🐻 prevaha predávajúcich' : '⚖ vyrovnané – trh sa točí')} · trend ${td >= 0.3 ? '▲ hore' : td <= -0.3 ? '▼ dole' : '– bočný'}</div>
      <table class="og-t"><tr><th>TF</th><th>Trend</th><th>Štruktúra</th><th>EMA</th><th>Čiary ▲/▼</th><th>Signál</th></tr>${rows.map(([tf, x]) => `<tr><td><b>${tf}</b></td><td>${badge(x.tr.dir, x.tr.dir > 0 ? '▲' : x.tr.dir < 0 ? '▼' : '–')}</td>
        <td>${x.tr.structure > 0 ? 'HH / HL' : x.tr.structure < 0 ? 'LH / LL' : '–'}</td><td>${x.tr.ema > 0 ? '▲' : x.tr.ema < 0 ? '▼' : '–'}</td><td>${x.tr.sup} / ${x.tr.res}</td>
        <td>${badge(x.vd.dir, `${x.vd.dir > 0 ? 'BUY' : x.vd.dir < 0 ? 'SELL' : '–'} ${Math.round(Math.abs(x.vd.score) * 100)} %`)}</td></tr>`).join('')}</table>`;
    const now = rows.flatMap(([tf, x]) => x.mv.starting.map(m => ({ ...m, tf })));
    $('#ogNow').innerHTML = `<h4>⚡ Práve sa začína</h4>${now.length ? now.map(m => moveRow(m, true)).join('') : '<div class="muted">Teraz žiadny nový prieraz s pokračovaním. Čakaj na zlom čiary, range alebo štruktúry.</div>'}`;
    const list = rows.flatMap(([tf, x]) => x.mv.moves.map(m => ({ ...m, tf }))).sort((a, b) => b.t - a.t).slice(0, 80);
    $('#ogMoves').innerHTML = list.map(m => moveRow(m)).join('') || '<div class="muted">Žiadne pohyby nad nastavené minimum.</div>';
    $$('[data-go]', $('#ogSide')).forEach(e => e.onclick = () => { const [tf, t] = e.dataset.go.split('|'); focus(tf, +t); });
    for (const m of now.filter(m => m.strong)) { const k = `${S.symbol}${m.tf}${m.t}${m.dir}`; if (!seen.has(k)) { seen.add(k); toast(`⚡ ${S.symbol} ${m.tf}: ${m.name} – pohyb sa začína ${m.dir > 0 ? 'nahor' : 'nadol'} (objem ${m.volX}×)`, 7000); } }
  }
  const moveRow = (m, now) => `<div class="og-mv ${m.dir > 0 ? 'b' : 's'}" data-go="${m.tf}|${m.t}"><div><b>${m.dir > 0 ? '▲' : '▼'} ${m.tf}</b> ${esc(m.name)} <span class="og-st">${'★'.repeat(m.stars)}${'☆'.repeat(5 - m.stars)}</span>${m.live ? ' <span class="og-bd n">beží</span>' : ''}</div>
    <small>${when(m.t)} · <b>${m.pips.toLocaleString('sk-SK')} pips</b> (${m.moveAtr} ATR) za ${m.minutes >= 120 ? (m.minutes / 60).toFixed(1) + ' h' : m.minutes + ' min'} · ${m.sharp} · objem ${m.volX ?? '–'}×${m.delta !== null ? ` · ${m.delta > 0 ? 'kupujúci' : 'predávajúci'} ${Math.abs(m.delta)} %` : ''}${now && m.strong ? ' · <b>silný štart</b>' : ''}</small></div>`;
  function focus(tf, t) {
    const x = data[tf]; if (!x || !x.chart) return;
    const i = x.D.t.findIndex(v => v >= t); if (i < 0) return;
    x.chart.timeScale().setVisibleLogicalRange({ from: i - 60, to: i + 60 });
    const c = $(`.og-cell[data-tf="${tf}"]`); c.classList.add('flash'); setTimeout(() => c.classList.remove('flash'), 700);
  }

  async function scan() {
    if (busy) return; busy = true; status('skenujem…');
    let left = TFS.length;
    await Promise.all(TFS.map(async tf => {
      try { data[tf] = await analyse(S.symbol, tf); } catch (e) { data[tf] = { err: String(e.message || e) }; }
      draw(tf); status(`skenujem… ${--left}`);
    }));
    side(); busy = false; status('aktualizované ' + new Date().toLocaleTimeString('sk-SK'));
  }
  async function scanAll() {
    const out = [], syms = META.symbols.map(s => s.id), jobs = [];
    for (const s of syms) for (const tf of ALL_TFS) jobs.push([s, tf]);
    const d = UI.openDialog(`<div class="dlg-h"><span>🌐 Všetky trhy – kde sa začína pohyb</span><button class="ib" data-x>✕</button></div><div class="dlg-b"><div id="ogAllBody" class="muted">skenujem ${jobs.length} grafov…</div></div>
      <div class="dlg-f"><span class="grow"></span><button class="btn pri" data-x>Hotovo</button></div>`, null, 'wide');
    $$('[data-x]', d).forEach(x => x.onclick = UI.closeDialog);
    const work = async () => { while (jobs.length) { const [s, tf] = jobs.shift();
      try { const x = await analyse(s, tf, 600); out.push({ s, tf, x }); } catch (e) {} } };
    await Promise.all([work(), work(), work()]);
    const rows = out.map(({ s, tf, x }) => ({ s, tf, st: x.mv.starting[0], last: x.mv.moves[x.mv.moves.length - 1], tr: x.tr, vd: x.vd }))
      .sort((a, b) => (!!b.st - !!a.st) || Math.abs(b.vd.score) - Math.abs(a.vd.score));
    const body = $('#ogAllBody'); if (!body) return;
    body.classList.remove('muted');
    body.innerHTML = `<table class="og-t"><tr><th>Trh</th><th>TF</th><th>Trend</th><th>Signál</th><th>Teraz</th><th>Posledný veľký pohyb</th></tr>${rows.map(r => `<tr data-sym="${r.s}"><td><b>${esc((SYM[r.s] || {}).name || r.s)}</b></td><td>${r.tf}</td>
      <td>${badge(r.tr.dir, r.tr.dir > 0 ? '▲' : r.tr.dir < 0 ? '▼' : '–')}</td><td>${badge(r.vd.dir, `${r.vd.dir > 0 ? 'BUY' : r.vd.dir < 0 ? 'SELL' : '–'} ${Math.round(Math.abs(r.vd.score) * 100)} %`)}</td>
      <td>${r.st ? badge(r.st.dir, `⚡ ${r.st.dir > 0 ? '▲' : '▼'} ${esc(r.st.name)}${r.st.strong ? ' · objem' : ''}`) : '<span class="muted">–</span>'}</td>
      <td>${r.last ? `${r.last.dir > 0 ? '▲' : '▼'} ${r.last.pips.toLocaleString('sk-SK')} pips · ${when(r.last.t)}` : '–'}</td></tr>`).join('')}</table><div class="muted" style="font-size:11px;margin-top:6px">Klik na riadok otvorí trh.</div>`;
    $$('[data-sym]', body).forEach(r => r.onclick = () => { UI.closeDialog(); S.symbol = r.dataset.sym; $('#ogSym').value = S.symbol; save(); scan(); });
  }
  function schedule() { clearInterval(autoT); autoT = S.auto ? setInterval(() => { if (!document.hidden) scan(); }, 60000) : null; }

  (async () => {
    try { META = await (await fetch('api/meta')).json(); } catch (e) { status('server neodpovedá'); }
    SYM = Object.fromEntries((META.symbols || []).map(s => [s.id, s]));
    if (TL.configure) TL.configure(META.structure);
    if (!SYM[S.symbol]) S.symbol = (META.symbols[0] || {}).id || 'XAUUSD';
    $('#ogSym').innerHTML = (META.symbols || []).map(s => `<option value="${s.id}" ${s.id === S.symbol ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
    $('#ogAtr').value = S.minAtr; $('#ogPips').value = S.minPips; $('#ogAuto').checked = !!S.auto;
    $('#ogSym').onchange = e => { S.symbol = e.target.value; save(); scan(); };
    $('#ogAtr').onchange = e => { S.minAtr = Math.max(0.5, +e.target.value || 3); save(); scan(); };
    $('#ogPips').onchange = e => { S.minPips = Math.max(0, +e.target.value || 0); save(); scan(); };
    $('#ogAuto').onchange = e => { S.auto = e.target.checked; save(); schedule(); };
    $('#ogRe').onclick = scan; $('#ogAll').onclick = scanAll;
    grid(); schedule(); scan();
  })();
})();
