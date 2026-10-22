// NOL – Nexus Overgrown Lab: one market on many timeframes at once. Trendlines and levels are drawn on all of them, each timeframe
// gets its trend and a BUY / SELL verdict, and the moves are listed: where buyers or sellers stepped in (a break of a trendline, level,
// range or of the structure), how many pips and minutes the move ran, on how much volume, how one-sided the trades were and how sharp.
// Own workspaces (tabs, 1–10 charts each, any timeframe per chart), live prices from the Binance trade stream, indicators for all
// charts of a workspace or for one chart.
(() => {
  const { $, $$, esc, LS, toast, openMenu, closeMenu } = UI;
  const LW = LightweightCharts, ALL_TFS = ['5m', '15m', '1h'];
  const TF_SEC = { '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '2h': 7200, '4h': 14400, '6h': 21600, '12h': 43200, '1d': 86400, '1w': 604800 };
  const TF_LIST = Object.keys(TF_SEC), DEF_TFS = ['1m', '5m', '15m', '1h', '4h', '1d', '3m', '30m', '2h', '6h'];
  const W = { '1m': 0.6, '3m': 0.8, '5m': 1, '15m': 1.3, '30m': 1.45, '1h': 1.6, '2h': 1.8, '4h': 2, '6h': 2.05, '12h': 2.1, '1d': 2.2, '1w': 2.4 };
  const S = Object.assign({ symbol: 'XAUUSD', minAtr: 3, minPips: 0, auto: true, live: true, indAllWs: false, ws: null, wsId: null }, LS.get('nxog', {}));
  S.show = { lines: true, levels: false, marks: true, vol: true, ...(S.show || {}) };
  if (!S.lv0) { S.lv0 = 1; S.show.levels = false; }      // the orange level lines are off (⚙ Grafy can bring them back)
  if (!Array.isArray(S.ws) || !S.ws.length) S.ws = [{ id: 'w1', name: 'Všetky TF', symbol: S.symbol, tfs: DEF_TFS.slice(0, 6), ind: [], cind: {} }];
  const save = () => LS.set('nxog', S);
  const WS = () => S.ws.find(w => w.id === S.wsId) || S.ws[(S.wsId = S.ws[0].id, 0)];
  const sym = () => WS().symbol;
  const tz = (LS.get('nx2', {}) || {}).tz || 'Europe/Bratislava';
  const fmtT = new Intl.DateTimeFormat('sk-SK', { timeZone: tz, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const when = t => fmtT.format(new Date(t * 1000));
  let SYM = {}, META = { symbols: [] }, data = {}, charts = {}, autoT = null, seen = new Set(), scanTok = 0;
  const status = t => { $('#ogStatus').textContent = t; };
  const digits = s => (SYM[s] ? SYM[s].digits : 2) ?? 2;
  const fmtP = (v, s = sym()) => v == null ? '–' : v.toLocaleString('sk-SK', { minimumFractionDigits: digits(s), maximumFractionDigits: digits(s) });

  async function fetchBars(symbol, tf, limit) {
    const r = await fetch(`api/candles?${new URLSearchParams({ symbol, tf, limit: String(limit), hours: 'true', spot: 'true' })}`);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.status);
    const j = await r.json();
    return { off: j.offset || 0, bars: j.bars.map(b => ({ time: b[0], open: b[1], high: b[2], low: b[3], close: b[4], volume: b[5], buy: b[6] ?? NaN })) };
  }
  // everything for one market and timeframe (the analysis uses closed bars only, the chart also shows the forming one)
  async function analyse(symbol, tf, limit = 800) {
    const { bars, off } = await fetchBars(symbol, tf, limit), closed = bars.slice(0, -1);
    if (!bars.length) throw new Error('žiadne dáta');
    // too short for lines and moves (gold has only ~50 weekly bars on Binance): just the candles
    if (closed.length < 120) return { D: MV.toD(closed), R: null, mv: { moves: [], starting: [] }, bars, off, thin: true };
    const D = MV.toD(closed), R = TL.run(D, { k: TL.zigK(tf, TF_SEC[tf]) });
    const mv = MV.moves(D, { tf, tfSec: TF_SEC[tf], digits: digits(symbol), minAtr: S.minAtr, minPips: S.minPips, R });
    return { D, R, mv, bars, off, tr: MV.trend(D, R), vd: MV.verdict(D, tf, { tfSec: TF_SEC[tf] }) };
  }

  // ---- workspaces (tabs) ---------------------------------------------------------------------------------------------
  function tabs() {
    $('#ogTabs').innerHTML = S.ws.map((w, i) => `<button class="og-tab ${w.id === WS().id ? 'on' : ''}" data-ws="${w.id}" title="${esc(w.name)} · ${w.tfs.length} ${w.tfs.length === 1 ? 'graf' : w.tfs.length < 5 ? 'grafy' : 'grafov'} · dvojklik = premenovať"><b>${i + 1}</b>${esc(w.name)}<small>${w.tfs.length}▦</small>${S.ws.length > 1 ? '<i data-wx title="Zavrieť plochu">✕</i>' : ''}</button>`).join('')
      + '<button class="og-tab add" data-wnew title="Nová plocha – vyber počet grafov (1 – 10)">＋</button>';
  }
  function switchWs(id) {
    if (id === WS().id) return;
    S.wsId = id; save(); data = {}; tabs(); $('#ogSym').value = sym(); grid(); connectLive(); scan();
  }
  function newWsMenu(anchor) {
    openMenu(anchor, `<div class="sec">Nová plocha · počet grafov</div><div class="og-nums">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<span data-n="${n}">${n}</span>`).join('')}</div>
      <div class="sec">Timeframy</div><div class="it" style="cursor:default"><small class="muted">${DEF_TFS.join(' · ')} – v poradí; každý graf zmeníš v jeho hlavičke</small></div>`, m => {
      $$('[data-n]', m).forEach(x => x.onclick = () => {
        const n = +x.dataset.n, id = 'w' + Date.now().toString(36);
        S.ws.push({ id, name: `Plocha ${S.ws.length + 1}`, symbol: sym(), tfs: DEF_TFS.slice(0, n), ind: S.indAllWs ? clone(WS().ind) : [], cind: {} });
        closeMenu(); switchWs(id);
      });
    });
  }
  function setCount(n) {
    const w = WS(); n = Math.max(1, Math.min(10, n));
    w.tfs = w.tfs.length >= n ? w.tfs.slice(0, n) : w.tfs.concat(DEF_TFS.filter(t => !w.tfs.includes(t)).concat(DEF_TFS)).slice(0, n);
    Object.keys(w.cind).forEach(k => { if (+k >= n) delete w.cind[k]; });
    save(); tabs(); grid(); scan();
  }
  const clone = o => JSON.parse(JSON.stringify(o));

  // ---- the grid of charts ------------------------------------------------------------------------------------------
  function grid() {
    Object.values(charts).forEach(c => c.ch.remove()); charts = {};
    const w = WS(), n = w.tfs.length, cols = n <= 3 ? n : n === 4 ? 2 : n <= 6 || n === 9 ? 3 : n <= 8 ? 4 : 5;
    const g = $('#ogGrid'); g.style.setProperty('--og-cols', cols); g.style.setProperty('--og-rows', Math.ceil(n / cols));
    g.innerHTML = w.tfs.map((tf, i) => `<div class="og-cell" data-i="${i}"><div class="og-h"><select data-ctf title="Timeframe tohto grafu">${TF_LIST.map(t => `<option ${t === tf ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <b class="og-px" data-px></b><span class="og-b" data-tr></span><span class="og-b" data-vd></span><span class="og-ci" data-ci></span><span class="grow"></span><span class="og-b" data-st></span>
      <button class="og-add" data-cadd title="Indikátor len pre tento graf">＋📈</button></div><div class="og-ch"></div></div>`).join('');
    $$('.og-cell', g).forEach(cell => {
      const i = +cell.dataset.i;
      $('[data-ctf]', cell).onchange = async e => {
        const tf = e.target.value; w.tfs[i] = tf; save(); tabs();
        if (!data[tf]) { data[tf] = null; draw(i); try { data[tf] = await analyse(sym(), tf); } catch (er) { data[tf] = { err: String(er.message || er) }; } }
        draw(i); side();
      };
      $('[data-cadd]', cell).onclick = e => indMenu(e.currentTarget, i);
      cell.addEventListener('click', e => { const x = e.target.closest('[data-cix]'); if (!x) return; (w.cind[i] || []).splice(+x.dataset.cix, 1); save(); draw(i); });
    });
    for (let i = 0; i < n; i++) draw(i);
  }
  function draw(i) {
    const w = WS(), tf = w.tfs[i], x = data[tf], cell = $(`.og-cell[data-i="${i}"]`); if (!cell) return;
    const old = charts[i], keep = old && old.tf === tf && old.n ? old.ch.timeScale().getVisibleLogicalRange() : null;
    if (old) { old.ch.remove(); delete charts[i]; }
    const cind = w.cind[i] || [];
    $('[data-ci]', cell).innerHTML = cind.map((s, k) => `<span class="og-chip" title="Len tento graf · klik = odobrať" data-cix="${k}">${esc(KS.STUDIES[s.type] ? KS.STUDIES[s.type].label(s) : s.type)} ✕</span>`).join('');
    if (!x || x.err) { $('.og-ch', cell).innerHTML = `<div class="muted" style="padding:20px">${esc(x ? x.err : 'načítavam…')}</div>`; return; }
    $('.og-ch', cell).innerHTML = '';
    const ch = LW.createChart($('.og-ch', cell), { autoSize: true, layout: { background: { color: 'transparent' }, textColor: '#b2b5be', fontSize: 10, attributionLogo: false, panes: { separatorColor: '#23302a' } },
      grid: { vertLines: { color: 'rgba(42,46,57,.35)' }, horzLines: { color: 'rgba(42,46,57,.35)' } }, timeScale: { timeVisible: true, borderColor: '#2a2e39', rightOffset: 4 },
      rightPriceScale: { borderColor: '#2a2e39' }, crosshair: { mode: 0 }, localization: { timeFormatter: when } });
    const { D, R, mv, bars } = x, dg = digits(sym()), n = D.t.length;
    const main = ch.addSeries(LW.CandlestickSeries, { upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350',
      priceFormat: { type: 'price', precision: dg, minMove: 1 / 10 ** dg } });
    main.setData(bars.map(b => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })));
    let vol = null;
    if (S.show.vol) {
      vol = ch.addSeries(LW.HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false });
      vol.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
      vol.setData(bars.map(volBar));
    }
    // trendlines: the active ones and those that ended in the last 150 bars, the strongest first
    if (S.show.lines && R) for (const l of R.lines.filter(l => l.ended == null || l.ended > n - 150).sort((a, b) => b.score - a.score).slice(0, 8)) {
      const end = l.ended == null ? n - 1 : l.ended, s = ch.addSeries(LW.LineSeries, { color: l.kind === 'sup' ? 'rgba(38,166,154,.85)' : 'rgba(239,83,80,.85)', lineWidth: l.ended == null ? 2 : 1,
        lineStyle: l.ended == null ? 0 : 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, autoscaleInfoProvider: () => null });
      s.setData([{ time: D.t[l.i1], value: R.value(l, l.i1) }, { time: D.t[end], value: R.value(l, end) }]);
    }
    // levels with 3+ touches still alive
    if (S.show.levels && R) for (const lv of R.levels.filter(v => v.ended == null && v.touches >= 3).slice(-6)) main.createPriceLine({ price: lv.price, color: 'rgba(255,183,77,.6)', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: `${lv.touches}×` });
    if (S.show.marks) {
      const marks = mv.moves.filter(m => m.i > n - 400).map(m => ({ time: m.t, position: m.dir > 0 ? 'belowBar' : 'aboveBar', shape: m.dir > 0 ? 'arrowUp' : 'arrowDown',
        color: m.dir > 0 ? '#00e676' : '#ff5252', text: `${m.pips} p${'★'.repeat(Math.min(3, m.stars))}`, size: 1 + Math.min(1.5, m.stars / 3) }));
      for (const m of mv.starting) marks.push({ time: m.t, position: m.dir > 0 ? 'belowBar' : 'aboveBar', shape: 'circle', color: '#ffd600', text: 'ZAČÍNA', size: 2 });
      marks.sort((a, b) => a.time - b.time);
      LW.createSeriesMarkers(main, marks);
    }
    const c = charts[i] = { ch, main, vol, tf, n: bars.length, ind: [] };
    indicators(c, [...w.ind, ...cind], bars);
    if (keep) ch.timeScale().setVisibleLogicalRange(keep); else ch.timeScale().setVisibleLogicalRange({ from: bars.length - 160, to: bars.length + 3 });
    x.chart = ch;
    const B = (k, html) => { $(`[data-${k}]`, cell).innerHTML = html; };
    B('px', fmtP(bars[bars.length - 1].close));
    if (x.thin) { B('tr', badge(0, 'málo histórie – len sviečky')); B('vd', ''); B('st', ''); return; }
    B('tr', badge(x.tr.dir, x.tr.dir > 0 ? 'trend ▲' : x.tr.dir < 0 ? 'trend ▼' : 'trend –'));
    B('vd', badge(x.vd.dir, `${x.vd.dir > 0 ? '🐂 BUY' : x.vd.dir < 0 ? '🐻 SELL' : 'NEUTRÁL'} ${Math.round(Math.abs(x.vd.score) * 100)} %`));
    B('st', mv.starting.length ? badge(mv.starting[0].dir, `⚡ začína ${mv.starting[0].dir > 0 ? '▲' : '▼'}`) : '');
  }
  const volBar = b => ({ time: b.time, value: b.volume, color: b.close >= b.open ? 'rgba(38,166,154,.35)' : 'rgba(239,83,80,.35)' });
  const badge = (d, t) => `<span class="og-bd ${d > 0 ? 'b' : d < 0 ? 's' : 'n'}">${t}</span>`;

  // ---- indicators (KS.STUDIES): lines on the price or in their own pane under it ----------------------------------------
  function indicators(c, list, bars) {
    let pane = 0;
    for (const s of list) {
      const def = KS.STUDIES[s.type]; if (!def || def.cat === 'pattern' || s.visible === false) continue;
      const p = def.pane ? ++pane : 0, ser = {};
      for (const pl of def.plots) {
        const st = s.plots[pl.k] || {}; if (st.visible === false) continue;
        if (pl.kind === 'hist') ser[pl.k] = c.ch.addSeries(LW.HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, p);
        else if (!pl.kind || pl.kind === 'line') ser[pl.k] = c.ch.addSeries(LW.LineSeries, { color: KS.rgba(st.color || pl.color, st.opacity ?? 100), lineWidth: st.width || 1, lineStyle: st.style || 0,
          priceLineVisible: false, lastValueVisible: !!def.pane, crosshairMarkerVisible: false }, p);
        else if (pl.kind === 'level') {
          const first = Object.values(ser)[0];
          if (first) for (const k of ['upper', 'middle', 'lower']) if (s.inputs[k] !== undefined) first.createPriceLine({ price: s.inputs[k], color: 'rgba(120,123,134,.6)', lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
        }
      }
      c.ind.push({ s, def, ser });
    }
    if (pane) { const P = c.ch.panes(); P[0].setStretchFactor(2 + pane); for (let k = 1; k < P.length; k++) P[k].setStretchFactor(1); }
    indData(c, bars);
  }
  function indData(c, bars) {
    if (!c.ind.length) return;
    const D = MV.toD(bars);
    for (const { s, def, ser } of c.ind) {
      let out = {}; try { out = def.calc(D, s) || {}; } catch (e) {}
      for (const [k, se] of Object.entries(ser)) {
        const a = out[k] || [], pl = def.plots.find(x => x.k === k), st = s.plots[k] || {};
        se.setData(D.t.map((t, j) => { const v = a[j]; if (v == null || !Number.isFinite(v)) return { time: t };
          return pl.kind === 'hist' ? { time: t, value: v, color: KS.rgba(v >= 0 ? st.color || pl.color : st.color2 || pl.color2 || pl.color, 70) } : { time: t, value: v }; }));
      }
    }
  }

  function indMenu(anchor, ci) {
    const w = WS(), local = ci != null, list = () => local ? (w.cind[ci] = w.cind[ci] || []) : w.ind;
    const CATS = [['ma', 'Kĺzavé priemery'], ['band', 'Pásma a kanály'], ['trend', 'Trend'], ['osc', 'Oscilátory'], ['vol', 'Objem'], ['other', 'Ostatné']];
    const all = Object.entries(KS.STUDIES).filter(([, d]) => d.cat !== 'pattern');
    let q = '';
    const rows = () => CATS.map(([c, name]) => {
      const it = all.filter(([, d]) => (CATS.some(x => x[0] === d.cat) ? d.cat : 'other') === c && (!q || (d.name + ' ' + (d.title || '')).toLowerCase().includes(q)));
      return it.length ? `<div class="sec">${name}</div>${it.map(([k, d]) => `<div class="it" data-add="${k}"><span class="grow">${esc(d.name)} <small class="muted">${esc(d.title || '')}</small></span><small class="muted">${d.pane ? 'pod grafom' : 'na cene'}</small></div>`).join('')}` : '';
    }).join('') || '<div class="it muted">nič sa nenašlo</div>';
    const html = () => `<div class="sec">${local ? `📈 Len graf ${w.tfs[ci]}` : `📈 Všetky grafy na ploche „${esc(w.name)}“`} · aktívne</div>
      ${list().length ? list().map((s, k) => { const d = KS.STUDIES[s.type]; if (!d) return ''; const per = d.inputs.find(x => x.k === 'period');
        return `<div class="it" style="cursor:default"><span class="ic" style="color:${(s.plots[d.plots[0].k] || {}).color || d.plots[0].color}">●</span><span class="grow">${esc(d.label(s))}</span>
        ${per ? `<input type="number" min="${per.min || 1}" max="${per.max || 1000}" value="${s.inputs.period}" data-per="${k}" title="Perióda" style="width:56px">` : ''}<button class="ib" data-rm="${k}" title="Odobrať">✕</button></div>`; }).join('') : '<div class="it muted" style="cursor:default">žiadne</div>'}
      ${local ? '' : `<label class="it"><input type="checkbox" data-allws ${S.indAllWs ? 'checked' : ''}><span class="grow">Pridávať a odoberať na všetkých plochách</span></label>
      <div class="it" data-copy><span class="ic">⧉</span><span class="grow">Skopírovať tieto indikátory na všetky plochy</span></div>`}
      <div class="it" style="cursor:default"><input data-q placeholder="Hľadať indikátor…" style="width:100%"></div><div data-rows>${rows()}</div>`;
    const changed = () => { save(); if (local) draw(ci); else WS().tfs.forEach((_, i) => draw(i)); };
    const others = () => S.ws.filter(x => x !== w);
    const bindAdd = m => $$('[data-add]', m).forEach(x => x.onclick = () => {
        const s = KS.normalize({ type: x.dataset.add }); list().push(s);
        if (!local && S.indAllWs) others().forEach(o => o.ind.push(clone(s)));
        changed(); toast(`📈 ${KS.STUDIES[s.type].label(s)} – ${local ? 'graf ' + w.tfs[ci] : S.indAllWs ? 'všetky grafy na všetkých plochách' : 'všetky grafy na ploche'}`); m.innerHTML = html(); bind(m);
      });
    const bind = m => {
      bindAdd(m);
      $$('[data-rm]', m).forEach(x => x.onclick = () => {
        const [s] = list().splice(+x.dataset.rm, 1);
        if (!local && S.indAllWs) others().forEach(o => { const j = o.ind.findIndex(y => y.type === s.type && y.inputs.period === s.inputs.period); if (j >= 0) o.ind.splice(j, 1); });
        changed(); m.innerHTML = html(); bind(m);
      });
      $$('[data-per]', m).forEach(x => x.onchange = () => { const s = list()[+x.dataset.per]; s.inputs.period = Math.max(1, +x.value || s.inputs.period); changed(); m.innerHTML = html(); bind(m); });
      const al = $('[data-allws]', m); if (al) al.onchange = () => { S.indAllWs = al.checked; save(); };
      const cp = $('[data-copy]', m); if (cp) cp.onclick = () => { others().forEach(o => { o.ind = clone(w.ind); }); save(); toast('⧉ Indikátory skopírované na všetky plochy'); };
      const qi = $('[data-q]', m); qi.value = q; qi.oninput = () => { q = qi.value.trim().toLowerCase(); $('[data-rows]', m).innerHTML = rows(); bindAdd(m); };
    };
    openMenu(anchor, html(), bind, { cls: 'og-menu' });
  }

  // ---- ⚙ chart options: apply to every chart (all workspaces) ------------------------------------------------------------
  function viewMenu(anchor) {
    const w = WS();
    const html = () => `<div class="sec">Na všetkých grafoch</div>
      ${[['lines', 'Trendové čiary'], ['levels', 'Úrovne (3+ dotyky)'], ['marks', 'Šípky pohybov a ZAČÍNA'], ['vol', 'Objem']].map(([k, n]) => `<label class="it"><input type="checkbox" data-sh="${k}" ${S.show[k] ? 'checked' : ''}><span class="grow">${n}</span></label>`).join('')}
      <label class="it"><input type="checkbox" data-live ${S.live ? 'checked' : ''}><span class="grow">Živá cena (Binance, každý obchod)</span></label>
      <div class="sec">Počet grafov na ploche „${esc(w.name)}“</div><div class="og-nums">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<span data-n="${n}" class="${w.tfs.length === n ? 'on' : ''}">${n}</span>`).join('')}</div>
      <div class="sec">Plochy</div>
      <div class="it" data-symall><span class="ic">⇄</span><span class="grow">Trh ${esc((SYM[sym()] || {}).name || sym())} na všetkých plochách</span></div>
      <div class="it" data-ren><span class="ic">✎</span><span class="grow">Premenovať plochu</span></div>`;
    const bind = m => {
      $$('[data-sh]', m).forEach(x => x.onchange = () => { S.show[x.dataset.sh] = x.checked; save(); WS().tfs.forEach((_, i) => draw(i)); });
      $('[data-live]', m).onchange = e => { S.live = e.target.checked; save(); connectLive(); };
      $$('[data-n]', m).forEach(x => x.onclick = () => { setCount(+x.dataset.n); m.innerHTML = html(); bind(m); });
      $('[data-symall]', m).onclick = () => { S.ws.forEach(o => { o.symbol = sym(); }); save(); toast('⇄ Všetky plochy: ' + sym()); closeMenu(); };
      $('[data-ren]', m).onclick = () => { closeMenu(); rename(w); };
    };
    openMenu(anchor, html(), bind, { cls: 'og-menu' });
  }
  function rename(w) { const n = prompt('Názov plochy', w.name); if (n && n.trim()) { w.name = n.trim().slice(0, 40); save(); tabs(); } }

  // ---- live: every trade from Binance moves the forming bar of every timeframe ------------------------------------------
  let ws = null, wsT = null, dirty = false, lastInd = 0;
  const nyFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', hourCycle: 'h23' });
  function goldOpen(t) {
    const p = Object.fromEntries(nyFmt.formatToParts(new Date(t * 1000)).map(x => [x.type, x.value])), wd = p.weekday, h = +p.hour;
    return !(wd === 'Sat' || (wd === 'Sun' && h < 18) || (wd === 'Fri' && h >= 17) || (['Mon', 'Tue', 'Wed', 'Thu'].includes(wd) && h === 17));
  }
  function connectLive() {
    if (ws) { ws.onclose = null; ws.close(); ws = null; } clearTimeout(wsT);
    $('#ogPx').classList.remove('live');
    const sy = SYM[sym()]; if (!S.live || !sy) { $('#ogPx').textContent = ''; return; }
    const base = sy.market === 'spot' ? 'wss://stream.binance.com:9443/ws/' : 'wss://fstream.binance.com/market/ws/', want = sym();
    ws = new WebSocket(base + sy.ticker.toLowerCase() + '@aggTrade');
    ws.onopen = () => $('#ogPx').classList.add('live');
    ws.onclose = () => { $('#ogPx').classList.remove('live'); wsT = setTimeout(connectLive, 3000); };
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data); if (m.e !== 'aggTrade' || want !== sym()) return;
      const anyX = Object.values(data).find(x => x && x.bars), p = +m.p + (anyX ? anyX.off : 0), q = +m.q, t = Math.floor(m.T / 1000);
      if (sy.hours === 'gold' && !goldOpen(t)) return;
      for (const [tf, x] of Object.entries(data)) {
        if (!x || !x.bars) continue;
        const sec = TF_SEC[tf], last = x.bars[x.bars.length - 1];
        if (sec >= 604800 || t < last.time + sec) { last.high = Math.max(last.high, p); last.low = Math.min(last.low, p); last.close = p; last.volume += q; }
        else x.bars.push({ time: Math.floor(t / sec) * sec, open: p, high: p, low: p, close: p, volume: q, buy: NaN });
      }
      $('#ogPx').textContent = fmtP(p); dirty = true;
    };
  }
  setInterval(() => {
    if (!dirty || document.hidden) return; dirty = false;
    const ind = Date.now() - lastInd > 2000; if (ind) lastInd = Date.now();
    for (const [i, c] of Object.entries(charts)) {
      const x = data[c.tf]; if (!x || !x.bars) continue;
      const b = x.bars[x.bars.length - 1];
      try { c.main.update({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close }); if (c.vol) c.vol.update(volBar(b)); } catch (e) {}
      if (ind || x.bars.length !== c.n) { c.n = x.bars.length; indData(c, x.bars); }
      const px = $(`.og-cell[data-i="${i}"] [data-px]`); if (px) px.textContent = fmtP(b.close);
    }
  }, 400);

  // ---- side panel: trend on every timeframe, who is in control, moves starting now, the list of moves ---------------
  const wtfs = () => [...new Set(WS().tfs)].sort((a, b) => TF_SEC[a] - TF_SEC[b]);
  function side() {
    const rows = wtfs().map(tf => [tf, data[tf]]).filter(([, x]) => x && !x.err && !x.thin);
    let w = 0, buy = 0, tsum = 0;
    for (const [tf, x] of rows) { w += W[tf]; buy += W[tf] * (x.vd.score + 1) / 2; tsum += W[tf] * x.tr.score; }
    const bp = w ? Math.round(100 * buy / w) : 50, td = w ? tsum / w : 0;
    $('#ogTrend').innerHTML = `<h4>🌱 ${esc((SYM[sym()] || {}).name || sym())} – ${rows.length === 1 ? rows[0][0] : 'všetky timeframy'}</h4>
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
    for (const m of now.filter(m => m.strong)) { const k = `${sym()}${m.tf}${m.t}${m.dir}`; if (!seen.has(k)) { seen.add(k); toast(`⚡ ${sym()} ${m.tf}: ${m.name} – pohyb sa začína ${m.dir > 0 ? 'nahor' : 'nadol'} (objem ${m.volX}×)`, 7000); } }
  }
  const moveRow = (m, now) => `<div class="og-mv ${m.dir > 0 ? 'b' : 's'}" data-go="${m.tf}|${m.t}"><div><b>${m.dir > 0 ? '▲' : '▼'} ${m.tf}</b> ${esc(m.name)} <span class="og-st">${'★'.repeat(m.stars)}${'☆'.repeat(5 - m.stars)}</span>${m.live ? ' <span class="og-bd n">beží</span>' : ''}</div>
    <small>${when(m.t)} · <b>${m.pips.toLocaleString('sk-SK')} pips</b> (${m.moveAtr} ATR) za ${m.minutes >= 120 ? (m.minutes / 60).toFixed(1) + ' h' : m.minutes + ' min'} · ${m.sharp} · objem ${m.volX ?? '–'}×${m.delta !== null ? ` · ${m.delta > 0 ? 'kupujúci' : 'predávajúci'} ${Math.abs(m.delta)} %` : ''}${now && m.strong ? ' · <b>silný štart</b>' : ''}</small></div>`;
  function focus(tf, t) {
    const i = WS().tfs.indexOf(tf), c = charts[i], x = data[tf]; if (!c || !x) return;
    const k = x.bars.findIndex(b => b.time >= t); if (k < 0) return;
    c.ch.timeScale().setVisibleLogicalRange({ from: k - 60, to: k + 60 });
    const cell = $(`.og-cell[data-i="${i}"]`); cell.classList.add('flash'); setTimeout(() => cell.classList.remove('flash'), 700);
  }

  async function scan() {
    const tok = ++scanTok, s = sym(), tfs = wtfs(); status('skenujem…');
    let left = tfs.length;
    await Promise.all(tfs.map(async tf => {
      let x; try { x = await analyse(s, tf); } catch (e) { x = { err: String(e.message || e) }; }
      if (tok !== scanTok) return;
      data[tf] = x; WS().tfs.forEach((t, i) => { if (t === tf) draw(i); }); status(`skenujem… ${--left}`);
    }));
    if (tok !== scanTok) return;
    side(); status('aktualizované ' + new Date().toLocaleTimeString('sk-SK'));
  }
  async function scanAll() {
    const out = [], syms = META.symbols.map(s => s.id), jobs = [];
    for (const s of syms) for (const tf of ALL_TFS) jobs.push([s, tf]);
    const d = UI.openDialog(`<div class="dlg-h"><span>🌐 Všetky trhy – kde sa začína pohyb</span><button class="ib" data-x>✕</button></div><div class="dlg-b"><div id="ogAllBody" class="muted">skenujem ${jobs.length} grafov…</div></div>
      <div class="dlg-f"><span class="grow"></span><button class="btn pri" data-x>Hotovo</button></div>`, null, 'wide');
    $$('[data-x]', d).forEach(x => x.onclick = UI.closeDialog);
    const work = async () => { while (jobs.length) { const [s, tf] = jobs.shift();
      try { const x = await analyse(s, tf, 600); if (!x.thin) out.push({ s, tf, x }); } catch (e) {} } };
    await Promise.all([work(), work(), work()]);
    const rows = out.map(({ s, tf, x }) => ({ s, tf, st: x.mv.starting[0], last: x.mv.moves[x.mv.moves.length - 1], tr: x.tr, vd: x.vd }))
      .sort((a, b) => (!!b.st - !!a.st) || Math.abs(b.vd.score) - Math.abs(a.vd.score));
    const body = $('#ogAllBody'); if (!body) return;
    body.classList.remove('muted');
    body.innerHTML = `<table class="og-t"><tr><th>Trh</th><th>TF</th><th>Trend</th><th>Signál</th><th>Teraz</th><th>Posledný veľký pohyb</th></tr>${rows.map(r => `<tr data-sym="${r.s}"><td><b>${esc((SYM[r.s] || {}).name || r.s)}</b></td><td>${r.tf}</td>
      <td>${badge(r.tr.dir, r.tr.dir > 0 ? '▲' : r.tr.dir < 0 ? '▼' : '–')}</td><td>${badge(r.vd.dir, `${r.vd.dir > 0 ? 'BUY' : r.vd.dir < 0 ? 'SELL' : '–'} ${Math.round(Math.abs(r.vd.score) * 100)} %`)}</td>
      <td>${r.st ? badge(r.st.dir, `⚡ ${r.st.dir > 0 ? '▲' : '▼'} ${esc(r.st.name)}${r.st.strong ? ' · objem' : ''}`) : '<span class="muted">–</span>'}</td>
      <td>${r.last ? `${r.last.dir > 0 ? '▲' : '▼'} ${r.last.pips.toLocaleString('sk-SK')} pips · ${when(r.last.t)}` : '–'}</td></tr>`).join('')}</table><div class="muted" style="font-size:11px;margin-top:6px">Klik na riadok otvorí trh.</div>`;
    $$('[data-sym]', body).forEach(r => r.onclick = () => { UI.closeDialog(); setSym(r.dataset.sym); });
  }
  function setSym(s) { WS().symbol = s; $('#ogSym').value = s; save(); data = {}; grid(); connectLive(); scan(); }
  function schedule() { clearInterval(autoT); autoT = S.auto ? setInterval(() => { if (!document.hidden) scan(); }, 60000) : null; }

  (async () => {
    try { META = await (await fetch('api/meta')).json(); } catch (e) { status('server neodpovedá'); }
    SYM = Object.fromEntries((META.symbols || []).map(s => [s.id, s]));
    if (TL.configure) TL.configure(META.structure);
    const first = (META.symbols[0] || {}).id || 'XAUUSD';
    S.ws.forEach(w => { if (!SYM[w.symbol]) w.symbol = first; w.ind = (w.ind || []).map(KS.normalize).filter(Boolean); w.cind = w.cind || {};
      for (const k of Object.keys(w.cind)) w.cind[k] = (w.cind[k] || []).map(KS.normalize).filter(Boolean); w.tfs = (w.tfs || DEF_TFS.slice(0, 6)).filter(t => TF_SEC[t]).slice(0, 10); if (!w.tfs.length) w.tfs = ['1h']; });
    $('#ogSym').innerHTML = (META.symbols || []).map(s => `<option value="${s.id}" ${s.id === sym() ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
    $('#ogAtr').value = S.minAtr; $('#ogPips').value = S.minPips; $('#ogAuto').checked = !!S.auto;
    $('#ogSym').onchange = e => setSym(e.target.value);
    $('#ogAtr').onchange = e => { S.minAtr = Math.max(0.5, +e.target.value || 3); save(); scan(); };
    $('#ogPips').onchange = e => { S.minPips = Math.max(0, +e.target.value || 0); save(); scan(); };
    $('#ogAuto').onchange = e => { S.auto = e.target.checked; save(); schedule(); };
    $('#ogRe').onclick = scan; $('#ogAll').onclick = scanAll;
    $('#ogInd').onclick = e => indMenu(e.currentTarget, null);
    $('#ogView').onclick = e => viewMenu(e.currentTarget);
    const T = $('#ogTabs');
    T.addEventListener('click', e => {
      const x = e.target.closest('[data-wx]'), b = e.target.closest('[data-ws]');
      if (x && b) { const k = S.ws.findIndex(w => w.id === b.dataset.ws); if (confirm(`Zavrieť plochu „${S.ws[k].name}“?`)) { const was = WS().id === b.dataset.ws; S.ws.splice(k, 1); if (was) { S.wsId = null; S.wsId = WS().id; data = {}; $('#ogSym').value = sym(); grid(); connectLive(); scan(); } save(); tabs(); } return; }
      if (b) return switchWs(b.dataset.ws);
      if (e.target.closest('[data-wnew]')) newWsMenu(e.target.closest('[data-wnew]'));
    });
    T.addEventListener('dblclick', e => { const b = e.target.closest('[data-ws]'); if (b) rename(S.ws.find(w => w.id === b.dataset.ws)); });
    addEventListener('keydown', e => { if (e.altKey && /^[1-9]$/.test(e.key) && S.ws[+e.key - 1]) { e.preventDefault(); switchWs(S.ws[+e.key - 1].id); } });
    save(); tabs(); grid(); schedule(); connectLive(); scan();
  })();
})();
