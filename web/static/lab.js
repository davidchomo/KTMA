// Nexus Lab: the second chart system. Tabs of charts (each its own market and timeframe), a scanner of market moves
// (volume spikes with a big price change, trendline touches / breaks, breaks of established ranges), moves you save by
// hand, nearest-neighbour suggestions and the Electricals statistics. The maths is in lab-core.js (LAB).
(() => {
  const LW = window.LightweightCharts, $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const LSK = 'nxlab', load = () => { try { return JSON.parse(localStorage.getItem(LSK)) || null; } catch (e) { return null; } };
  const DEF = { tabs: [{ id: 't1', symbol: 'XAUUSD', tf: '1h', panels: ['rsi', 'macd'] }], active: 't1', side: 'learn', bars: 3000,
                show: { event: true, tl: true, range: true, case: true, match: true, lines: true }, el: { kind: 'event' }, scanned: {} };
  const S = Object.assign(JSON.parse(JSON.stringify(DEF)), load() || {});
  const save = () => { try { localStorage.setItem(LSK, JSON.stringify(S)); } catch (e) {} };
  const author = (() => { try { return JSON.parse(localStorage.getItem('nx2') || '{}').labeler || ''; } catch (e) { return ''; } })();
  const TFS = s => { const m = /^(\d+)([smhdwM])$/.exec(s); return m ? +m[1] * { s: 1, m: 60, h: 3600, d: 86400, w: 604800, M: 2592000 }[m[2]] : 3600; };
  const tab = () => S.tabs.find(t => t.id === S.active) || S.tabs[0];
  const status = t => { $('#labStatus').textContent = t || ''; };
  let META = { symbols: [], timeframes: [] }, SYM = {};
  let chart = null, main = null, markers = null, layer = null, cur = null, recs = [], allRecs = null, pick = null, matches = [], sugg = null;
  const fmt = p => (Number.isFinite(p) ? p.toFixed(SYM[tab().symbol] ? SYM[tab().symbol].digits : 2) : '–');
  const when = t => new Date(t * 1000).toLocaleString('sk-SK', { dateStyle: 'short', timeStyle: 'short' });

  // ---- data ------------------------------------------------------------------------------------------------
  async function bars(symbol, tf, limit) {
    const r = await fetch(`api/candles?${new URLSearchParams({ symbol, tf, limit: String(limit), hours: 'true' })}`);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.status);
    const b = (await r.json()).bars;
    return { t: b.map(x => x[0]), o: b.map(x => x[1]), h: b.map(x => x[2]), l: b.map(x => x[3]), c: b.map(x => x[4]), v: b.map(x => x[5]), bv: b.map(x => x[6] ?? NaN) };
  }
  const key = r => `${r.kind}|${r.t0}|${r.dir}`;
  async function loadTab() {
    const T = tab(); status(`Načítavam ${T.symbol} ${T.tf}…`);
    let D; try { D = await bars(T.symbol, T.tf, S.bars); } catch (e) { status('Dáta sa nepodarilo načítať: ' + e.message); return; }
    if (D.t.length < 100) { status('Málo dát pre tento trh a timeframe.'); return; }
    status('Počítam všetky indikátory…');
    await new Promise(r => setTimeout(r, 20));
    const A = LAB.analyse(D, { symbol: T.symbol, tf: T.tf }, { closed: D.t.length - 1, tfSec: TFS(T.tf) });
    cur = { D, A, T };
    // what the server already knows for this chart (saved moves and older scans) plus the fresh scan
    let stored = []; try { stored = await LAB.api.list({ symbol: T.symbol, tf: T.tf }); } catch (e) {}
    const m = new Map(stored.map(r => [key(r), r])); for (const r of A.recs) if (!m.has(key(r)) || r.kind !== 'case') m.set(key(r), { ...m.get(key(r)), ...r });
    recs = [...m.values()].sort((a, b) => a.t0 - b.t0);
    const k = `${T.symbol}|${T.tf}`;
    if (!S.scanned[k] || Date.now() - S.scanned[k] > 3600e3) scan(false);      // keep the statistics fresh, at most once an hour per chart
    learn(); draw(); side();
    status(`${T.symbol} ${T.tf} · ${D.t.length} sviečok · ${A.recs.length} pohybov na grafe`);
  }
  async function scan(loud = true) {
    if (!cur) return;
    const T = cur.T, rs = cur.A.recs.filter(r => r.outcome);
    try { const r = await LAB.api.save(rs); S.scanned[`${T.symbol}|${T.tf}`] = Date.now(); save(); allRecs = null; if (loud) status(`Uložené do štatistík: ${r.saved} pohybov (${T.symbol} ${T.tf})`); pushSummary(); }
    catch (e) { if (loud) status('Uloženie zlyhalo: ' + e.message); }
  }
  async function scanAll() {
    const jobs = META.symbols.flatMap(s => ['15m', '1h', '4h'].map(tf => [s.id, tf])), btn = $('#labScanAll');
    btn.disabled = true; let k = 0, saved = 0;
    for (const [sym, tf] of jobs) {
      k++; status(`Skenujem ${sym} ${tf} (${k}/${jobs.length})…`);
      try { const D = await bars(sym, tf, 3000); if (D.t.length < 200) continue; await new Promise(r => setTimeout(r, 10));
        const A = LAB.analyse(D, { symbol: sym, tf }, { closed: D.t.length - 1, tfSec: TFS(tf) });
        saved += (await LAB.api.save(A.recs)).saved; S.scanned[`${sym}|${tf}`] = Date.now(); } catch (e) {}
    }
    save(); btn.disabled = false; allRecs = null; status(`Hotovo: ${saved} pohybov z ${jobs.length} grafov uložených do Electricals.`);
    await pushSummary(); if (S.side === 'stats') side();
  }
  async function all() { if (!allRecs) allRecs = await LAB.api.list(); return allRecs; }
  async function pushSummary() { try { const rs = await all(); await LAB.api.summary(LAB.summary(rs)); } catch (e) {} }

  // ---- learning: the latest closed bar against everything stored ----------------------------------------
  async function learn() {
    if (!cur) return;
    const { A, D, T } = cur, i = A.end - 1, f = LAB.featuresAt(A.F, i);
    let pool = recs; try { pool = [...(await all()).filter(r => r.timeframe === T.tf || r.kind === 'case'), ...recs.filter(r => !r.id)]; } catch (e) {}
    pool = pool.filter(r => r.t0 < D.t[i] - LAB.H * TFS(r.timeframe) || r.kind === 'case');     // only finished moves
    sugg = { i, f, ...LAB.suggest(f, pool, A.F.meta), now: recs.filter(r => r.t0 === D.t[i]) };
    const cases = pool.filter(r => r.kind === 'case');
    matches = cases.length ? LAB.caseMatches(A.F, cases, Math.max(60, A.end - 1500), 72) : [];
    draw(); if (S.side === 'learn') side();
  }

  // ---- chart -------------------------------------------------------------------------------------------------
  const OUT = r => (!r.outcome || !r.outcome.done ? '#ffb300' : r.outcome.hit > 0 ? '#26a69a' : r.outcome.hit < 0 ? '#ef5350' : '#9598a1');
  class Layer {
    attached(p) { this.p = p; } detached() { this.p = null; }
    updateAllViews() {} update() { this.p && this.p.requestUpdate(); }
    paneViews() { return [{ zOrder: () => 'bottom', renderer: () => ({ draw: t => this.draw(t) }) }]; }
    draw(target) {
      if (!this.p || !cur) return;
      const ts = this.p.chart.timeScale(), se = this.p.series, X = i => ts.logicalToCoordinate(i), Y = p => se.priceToCoordinate(p), { A, D } = cur;
      const idx = t => { let lo = 0, hi = D.t.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (D.t[m] < t) lo = m + 1; else hi = m; } return lo; };
      target.useMediaCoordinateSpace(({ context: ctx }) => {
        ctx.font = '600 11px system-ui';
        if (S.show.range) for (const r of A.ranges) {                                // established ranges only (both edges tested 3+ times)
          const x0 = X(r.i0), x1 = X(r.live ? D.t.length + 5 : r.i1), yt = Y(r.top), yb = Y(r.bot); if ([x0, x1, yt, yb].some(v => v === null)) continue;
          const col = r.brk > 0 ? '38,166,154' : r.brk < 0 ? '239,83,80' : '91,156,246';
          ctx.fillStyle = `rgba(${col},.09)`; ctx.fillRect(x0, yt, x1 - x0, yb - yt);
          ctx.strokeStyle = `rgba(${col},.85)`; ctx.lineWidth = 1.5; ctx.setLineDash(r.live ? [6, 4] : []); ctx.strokeRect(x0, yt, x1 - x0, yb - yt); ctx.setLineDash([]);
          ctx.fillStyle = `rgba(${col},1)`; ctx.fillText(`Range ${r.testsTop}×/${r.testsBot}× dotykov`, x0 + 4, yt - 4);
        }
        if (S.show.lines) for (const ln of A.tl.lines) {                            // trendlines with 3+ touches, thicker the more touches
          if (ln.touches < 3) continue;
          const e = ln.ended ?? D.t.length - 1, x0 = X(ln.i1), x1 = X(e), y0 = Y(A.tl.value(ln, ln.i1)), y1 = Y(A.tl.value(ln, e)); if ([x0, x1, y0, y1].some(v => v === null)) continue;
          ctx.strokeStyle = ln.kind === 'sup' ? 'rgba(38,166,154,.8)' : 'rgba(239,83,80,.8)'; ctx.lineWidth = Math.min(4, 0.5 + ln.touches * 0.5);
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
          ctx.fillStyle = ctx.strokeStyle; ctx.fillText(`${ln.touches}×`, x1 + 3, y1 + 4);
        }
        if (S.show.case) for (const c of recs.filter(r => r.kind === 'case')) {     // saved moves as shaded blocks
          const i0 = idx(c.t0), i1 = idx(c.t1), x0 = X(i0), x1 = X(i1); if (x0 === null || x1 === null) continue;
          const hi = Math.max(...D.h.slice(i0, i1 + 1)), lo = Math.min(...D.l.slice(i0, i1 + 1)), yt = Y(hi), yb = Y(lo); if (yt === null || yb === null) continue;
          ctx.fillStyle = 'rgba(171,71,188,.12)'; ctx.fillRect(x0, yt, x1 - x0, yb - yt); ctx.strokeStyle = 'rgba(171,71,188,.9)'; ctx.lineWidth = 1; ctx.strokeRect(x0, yt, x1 - x0, yb - yt);
          ctx.fillStyle = '#ce93d8'; ctx.fillText(`✂ ${c.dir > 0 ? '▲' : '▼'} ${c.outcome.move} ATR${c.note ? ' · ' + c.note.slice(0, 30) : ''}`, x0 + 3, yt - 4);
        }
        if (pick && pick.i0 !== undefined) { const x = X(pick.i0); if (x !== null) { ctx.strokeStyle = '#34d399'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 4000); ctx.stroke(); ctx.setLineDash([]); } }
      });
    }
  }
  function draw() {
    const T = tab(), el = $('#labChart');
    if (!cur || cur.T !== T) return;
    const range = chart ? chart.timeScale().getVisibleLogicalRange() : null;
    if (chart) chart.remove();
    chart = LW.createChart(el, { autoSize: true, layout: { background: { color: '#161a25' }, textColor: '#d1d4dc', panes: { separatorColor: '#2a2e39' } },
      grid: { vertLines: { color: 'rgba(42,46,57,.5)' }, horzLines: { color: 'rgba(42,46,57,.5)' } }, timeScale: { timeVisible: true, borderColor: '#2a2e39' }, rightPriceScale: { borderColor: '#2a2e39' },
      crosshair: { mode: 0 } });
    const { D } = cur;
    main = chart.addSeries(LW.CandlestickSeries, { upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350',
      priceFormat: { type: 'price', precision: SYM[T.symbol] ? SYM[T.symbol].digits : 2, minMove: 1 / 10 ** (SYM[T.symbol] ? SYM[T.symbol].digits : 2) } });
    main.setData(D.t.map((t, i) => ({ time: t, open: D.o[i], high: D.h[i], low: D.l[i], close: D.c[i] })));
    const vol = chart.addSeries(LW.HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    const vx = cur.A.F.cols['vol.x'];
    vol.setData(D.t.map((t, i) => ({ time: t, value: D.v[i], color: vx[i] >= 2.5 ? (D.c[i] >= D.o[i] ? 'rgba(0,230,118,.9)' : 'rgba(255,82,82,.9)') : D.c[i] >= D.o[i] ? 'rgba(38,166,154,.35)' : 'rgba(239,83,80,.35)' })));
    // indicator panels
    T.panels.forEach((type, k) => {
      const def = KS.STUDIES[type]; if (!def) return;
      const s = KS.normalize({ type }), r = def.calc(D, s), pane = k + 1;
      for (const p of def.plots) {
        const arr = r[p.k]; if (!Array.isArray(arr)) continue;
        if (p.kind === 'hist') chart.addSeries(LW.HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pane)
          .setData(D.t.map((t, i) => [t, arr[i], arr[i - 1]]).filter(([, v]) => Number.isFinite(v)).map(([time, v, pv]) => ({ time, value: v, color: v >= 0 ? (v >= pv ? '#26a69a' : '#b2dfdb') : (v <= pv ? '#ff5252' : '#ffcdd2') })));
        else if (p.kind === 'line' || !p.kind) chart.addSeries(LW.LineSeries, { color: p.color, lineWidth: p.width || 1, priceLineVisible: false, lastValueVisible: true }, pane)
          .setData(D.t.map((t, i) => (Number.isFinite(arr[i]) ? { time: t, value: arr[i] } : { time: t })));
      }
      const lv = def.inputs.filter(i => /upper|lower|level/i.test(i.k)).map(i => s.inputs[i.k]).filter(Number.isFinite);
      const ser = chart.panes()[pane] && chart.panes()[pane].getSeries()[0];
      if (ser) lv.forEach(v => ser.createPriceLine({ price: v, color: '#787b86', lineStyle: 2, lineWidth: 1, axisLabelVisible: false }));
    });
    const P = chart.panes(); if (P.length > 1) P.forEach((p, i) => p.setStretchFactor(i ? 1 : Math.max(2, 5 - P.length)));
    layer = new Layer(); main.attachPrimitive(layer);
    markers = LW.createSeriesMarkers(main, marks());
    chart.subscribeClick(onClick);
    chart.subscribeCrosshairMove(p => legend(p && p.logical !== undefined ? Math.round(p.logical) : null));
    if (range) chart.timeScale().setVisibleLogicalRange(range); else chart.timeScale().setVisibleLogicalRange({ from: D.t.length - 200, to: D.t.length + 5 });
    legend(null);
  }
  function marks() {
    const out = [], { D } = cur, at = new Map(D.t.map((t, i) => [t, i]));
    for (const r of recs) {
      if (!at.has(r.t0) || !S.show[r.kind] || r.kind === 'case') continue;
      const o = r.outcome || {}, up = r.dir > 0;
      if (r.kind === 'event') out.push({ time: r.t0, position: up ? 'belowBar' : 'aboveBar', shape: up ? 'arrowUp' : 'arrowDown', color: OUT(r), text: `V×${o.volx}` });
      else if (r.kind === 'tl') out.push({ time: r.t0, position: up ? 'belowBar' : 'aboveBar', shape: 'circle', color: OUT(r), text: `${o.touches}×`, size: 0.6 });
      else if (r.kind === 'range') out.push({ time: r.t0, position: up ? 'belowBar' : 'aboveBar', shape: 'square', color: OUT(r), text: 'BOS' });
    }
    if (S.show.match) for (const m of matches) out.push({ time: D.t[m.i], position: 'aboveBar', shape: m.c.dir > 0 ? 'arrowUp' : 'arrowDown', color: '#ce93d8', text: `🎯${m.s}%` });
    if (sugg && sugg.dir) out.push({ time: D.t[sugg.i], position: sugg.dir > 0 ? 'belowBar' : 'aboveBar', shape: sugg.dir > 0 ? 'arrowUp' : 'arrowDown', color: '#34d399', text: `Lab ${sugg.dir > 0 ? 'LONG' : 'SHORT'} ${Math.round(100 * (sugg.dir > 0 ? sugg.pUp : 1 - sugg.pUp))}%`, size: 2 });
    return out.sort((a, b) => a.time - b.time);
  }
  function legend(i) {
    if (!cur) return;
    const { D, A } = cur; i = i === null || !(i >= 0 && i < D.t.length) ? A.end - 1 : i;
    const f = A.F.cols, v = k => (f[k] && Number.isFinite(f[k][i]) ? f[k][i] : null), n = (x, d = 1) => (x === null ? '–' : x.toFixed(d));
    const ms = v('macd.state'), here = recs.filter(r => r.t0 === D.t[i]);
    $('#labLegend').innerHTML = `<b>${esc(tab().symbol)} ${esc(tab().tf)}</b> · ${when(D.t[i])} · O ${fmt(D.o[i])} H ${fmt(D.h[i])} L ${fmt(D.l[i])} C ${fmt(D.c[i])}<br>
      RSI <b>${n(v('rsi.rsi'))}</b> · MACD <b>${ms === null ? '–' : ['', 'pod 0, slabne', 'pod 0, silnie', '', 'nad 0, slabne', 'nad 0, silnie'][ms + 3]}</b> · Stoch <b>${n(v('stoch.k'))}</b> · ADX <b>${n(v('adx.adx'))}</b> · CCI <b>${n(v('cci.cci'), 0)}</b> · MFI <b>${n(v('mfi.mfi'))}</b> · Objem <b>${n(v('vol.x'), 2)}×</b>
      ${here.map(r => `<br><span style="color:${OUT(r)}">${LAB.KINDS[r.kind]}: ${r.dir > 0 ? '▲' : '▼'} ${r.kind === 'tl' ? esc(LAB.SIG[r.outcome.sig] || '') + ' · ' + r.outcome.touches + ' dotykov' : ''} → ${res(r)}</span>`).join('')}`;
  }
  const res = r => { const o = r.outcome || {}; if (r.kind === 'case') return `${o.move} ATR za ${o.bars} sviečok`; if (!o.done) return 'ešte beží'; return `${o.hit > 0 ? '✓ pokračoval' : o.hit < 0 ? '✗ otočil' : '· nič'} (max ${o.mfe} / ${o.mae} ATR, po 10 sv. ${o.r10 ?? '–'})`; };
  function onClick(p) {
    if (!pick || !p || p.logical === undefined) return;
    const i = Math.max(0, Math.min(cur.D.t.length - 1, Math.round(p.logical)));
    if (pick.i0 === undefined) { pick.i0 = i; hint('Teraz klikni na sviečku, kde pohyb skončil'); layer.update(); return; }
    pick.i1 = i; if (pick.i1 < pick.i0) [pick.i0, pick.i1] = [pick.i1, pick.i0];
    if (pick.i1 - pick.i0 < 1) { pick.i1 = undefined; return; }
    hint(''); $('#labChart').classList.remove('picking'); S.side = 'cases'; side();
  }
  const hint = t => { const h = $('#labHint'); h.textContent = t; h.style.display = t ? 'block' : 'none'; };
  const focus = t => { if (!cur || !chart) return; const i = cur.D.t.indexOf(t); if (i < 0) return; chart.timeScale().setVisibleLogicalRange({ from: i - 80, to: i + 40 }); legend(i); };

  // ---- side panel --------------------------------------------------------------------------------------
  const SIDE = [['learn', '🧠 Učenie'], ['moves', '⚡ Pohyby'], ['cases', '✂ Uložené'], ['stats', '🔌 Electricals']];
  async function side() {
    $('#labSideTabs').innerHTML = SIDE.map(([k, n]) => `<span data-st="${k}" class="${S.side === k ? 'on' : ''}">${n}</span>`).join('');
    $$('#labSideTabs [data-st]').forEach(x => x.onclick = () => { S.side = x.dataset.st; save(); side(); });
    document.body.classList.toggle('lab-wide', S.side === 'stats');
    const B = $('#labSideBody');
    if (S.side === 'learn') {
      if (!sugg) { B.innerHTML = '<p class="muted">Počítam…</p>'; return; }
      const s = sugg, a = cur.A.F.atr[s.i], c = cur.D.c[s.i], p = Math.round(100 * (s.dir > 0 ? s.pUp : 1 - s.pUp));
      const best = matches.filter(m => m.i >= cur.A.end - 3).sort((x, y) => y.s - x.s)[0];
      B.innerHTML = `<div class="lab-card"><h4>Posledná uzavretá sviečka · ${when(cur.D.t[s.i])}</h4>
        ${s.n < 8 ? `<p class="muted">Ešte málo naučených pohybov (${s.n}). Daj <b>🌐 Skenovať všetko</b> alebo ulož pár pohybov cez <b>✂ Uložiť pohyb</b>.</p>` : s.dir
          ? `<div class="lab-big ${s.dir > 0 ? 'up' : 'dn'}">${s.dir > 0 ? '▲ LONG' : '▼ SHORT'} · ${p} % podobných pohybov išlo týmto smerom</div>
             <div>Vstup <b>${fmt(c)}</b> · SL <b class="dn">${fmt(c - s.dir * a)}</b> (1 ATR) · TP <b class="up">${fmt(c + s.dir * s.tp * a)}</b> (${s.tp.toFixed(1)} ATR – medián pohybu podobných)</div>`
          : `<div class="lab-big">Bez jasnej výhody</div><div class="muted">Podobné situácie išli hore ${Math.round(100 * s.pUp)} % a dole ${100 - Math.round(100 * s.pUp)} % – návrh dávam od 62 %.</div>`}
        <div class="muted" style="margin-top:6px">Podľa ${s.n} najpodobnejších uložených pohybov (všetkých ${Object.keys(s.f).length} indikátorov naraz), priemerná podobnosť ${s.sim ?? '–'} %. Uložené pohyby (✂) majú trojnásobnú váhu. Nie je to istota – je to štatistika minulosti.</div></div>
        ${best ? `<div class="lab-card"><h4>🎯 Vyzerá to ako tvoj uložený pohyb</h4>${best.c.symbol} ${best.c.timeframe} ${when(best.c.t0)} ${best.c.dir > 0 ? '▲' : '▼'} ${best.c.outcome.move} ATR – podobnosť <b>${best.s} %</b>${best.c.note ? `<br><i>${esc(best.c.note)}</i>` : ''}</div>` : ''}
        ${s.now.length ? `<div class="lab-card"><h4>Na tejto sviečke</h4>${s.now.map(r => `${LAB.KINDS[r.kind]} ${r.dir > 0 ? '▲' : '▼'}`).join('<br>')}</div>` : ''}
        <div class="sec">Najpodobnejšie situácie z minulosti</div>
        ${(s.near || []).slice(0, 12).map(({ r, d }) => `<div class="lab-row" data-go="${r.symbol}|${r.timeframe}|${r.t0}"><span class="k">${{ event: '⚡', tl: '📐', range: '▭', case: '✂' }[r.kind]}</span>
          <span>${r.symbol} ${r.timeframe} · ${when(r.t0)} ${r.dir > 0 ? '▲' : '▼'}</span><span class="muted">${LAB.simPct(d)} %</span><span class="res" style="color:${OUT(r)}">${res(r)}</span></div>`).join('')}
        <div class="sec">Podobné ako uložené pohyby v histórii grafu (🎯)</div>
        <div class="muted">${matches.length ? `${matches.length} sviečok s podobnosťou ≥ 72 %. Pozri na grafe, či z nich išla cena ako v tvojom pohybe.` : 'Žiadne – ulož pohyb cez ✂ Uložiť pohyb.'}</div>`;
    } else if (S.side === 'moves') {
      const list = recs.filter(r => r.kind !== 'case').slice(-300).reverse();
      B.innerHTML = `<div class="muted" style="margin-bottom:6px">Pohyby nájdené na tomto grafe (najnovšie hore). Klik = ukáž na grafe. Zelená = pokračoval o 1 ATR, červená = otočil, oranžová = ešte beží.</div>
        ${list.map(r => `<div class="lab-row" data-go="${r.symbol}|${r.timeframe}|${r.t0}"><span class="k">${{ event: '⚡', tl: '📐', range: '▭' }[r.kind]}</span><span>${when(r.t0)} ${r.dir > 0 ? '▲' : '▼'}
          <small class="muted">${r.kind === 'event' ? `objem ${r.outcome.volx}× · ${r.outcome.move} ATR` : r.kind === 'tl' ? `${esc(LAB.SIG[r.outcome.sig] || '')} · ${r.outcome.touches} dotykov` : `range ${r.outcome.len} sv. · ${r.outcome.tests}× dotykov`} · RSI ${r.features['rsi.rsi'] ?? '–'}</small></span>
          <span class="res" style="color:${OUT(r)}">${res(r)}</span></div>`).join('') || '<p class="muted">Žiadne.</p>'}`;
    } else if (S.side === 'cases') {
      const mine = recs.filter(r => r.kind === 'case');
      B.innerHTML = `${pick && pick.i1 !== undefined ? `<div class="lab-card lab-form"><h4>Uložiť pohyb ${when(cur.D.t[pick.i0])} → ${when(cur.D.t[pick.i1])}</h4>
          <div>${pick.i1 - pick.i0} sviečok · ${(100 * (cur.D.c[pick.i1] - cur.D.c[pick.i0]) / cur.D.c[pick.i0]).toFixed(2)} %</div>
          <textarea id="labNote" rows="2" placeholder="Poznámka – čo sa stalo, prečo je to dobrý setup (nepovinné)"></textarea>
          <div><button class="btn sm pri" id="labSaveCase">💾 Uložiť</button> <button class="btn sm" id="labCancel">Zrušiť</button></div></div>` : ''}
        <div class="lab-card"><h4>✂ Ako to funguje</h4><div class="muted">Klikni <b>✂ Uložiť pohyb</b>, potom na sviečku kde pohyb začal a kde skončil. Lab si uloží hodnoty všetkých indikátorov na začiatku pohybu.
          Potom na každom grafe hľadá sviečky, ktoré vyzerajú rovnako (🎯 na grafe) a v Učení dáva návrh vstupu.</div></div>
        <div class="sec">Uložené na tomto grafe (${mine.length})</div>
        ${mine.map(c => `<div class="lab-row" data-go="${c.symbol}|${c.timeframe}|${c.t0}"><span class="k">✂</span><span>${when(c.t0)} ${c.dir > 0 ? '▲' : '▼'} ${c.outcome.move} ATR · ${c.outcome.bars} sv.<br><small class="muted">${esc(c.note || '')} ${esc(c.author || '')}</small></span>
          <span class="res">${c.id && c.author === author ? `<button class="btn sm" data-del="${c.id}">🗑</button>` : ''}</span></div>`).join('') || '<p class="muted">Zatiaľ nič.</p>'}`;
      const sv = $('#labSaveCase'); if (sv) sv.onclick = saveCase;
      const cn = $('#labCancel'); if (cn) cn.onclick = () => { pick = null; layer && layer.update(); side(); };
      $$('[data-del]', B).forEach(x => x.onclick = async e => { e.stopPropagation(); await LAB.api.del(+x.dataset.del, author); allRecs = null; loadTab(); });
    } else {
      B.innerHTML = '<p class="muted">Načítavam štatistiky…</p>';
      let rs; try { rs = await all(); } catch (e) { B.innerHTML = '<p class="muted">Nepodarilo sa načítať.</p>'; return; }
      S.el.del = async id => { await LAB.api.del(id, author); allRecs = null; side(); };
      S.el.open = r => go(r.symbol, r.timeframe, r.t0);
      LAB.render(B, rs, S.el, () => { save(); side(); });
    }
    $$('[data-go]', B).forEach(x => x.onclick = () => { const [s, tf, t] = x.dataset.go.split('|'); go(s, tf, +t); });
  }
  async function saveCase() {
    const T = cur.T, r = LAB.caseRecord(cur.A.F, { symbol: T.symbol, tf: T.tf }, pick.i0, pick.i1, author, $('#labNote').value.trim());
    if (!author) status('Tip: meno si nastav v Nexuse (Účet) – pohyb sa uloží bez mena.');
    await LAB.api.save([r]); pick = null; allRecs = null; await loadTab(); pushSummary(); S.side = 'cases'; side();
  }
  // open a move: the same chart scrolls there, another market or timeframe opens in a new tab
  async function go(symbol, tf, t) {
    const T = tab();
    if (T.symbol !== symbol || T.tf !== tf) {
      let x = S.tabs.find(q => q.symbol === symbol && q.tf === tf);
      if (!x) { x = { id: 't' + Date.now().toString(36), symbol, tf, panels: [...T.panels] }; S.tabs.push(x); }
      S.active = x.id; save(); tabs(); bar();
    }
    if (!cur || cur.T !== tab()) await loadTab();
    focus(t);
  }

  // ---- tabs and toolbar --------------------------------------------------------------------------------
  function tabs() {
    $('#labTabs').innerHTML = S.tabs.map(t => `<span class="lab-tab ${t.id === S.active ? 'on' : ''}" data-tab="${t.id}">${esc((SYM[t.symbol] || {}).name || t.symbol)} ${esc(t.tf)}${S.tabs.length > 1 ? `<span class="x" data-tx="${t.id}">✕</span>` : ''}</span>`).join('')
      + '<span class="lab-tab add" id="labNewTab" title="Nový graf v novej karte">＋</span>';
    $$('[data-tab]').forEach(x => x.onclick = e => { if (e.target.dataset.tx) return; S.active = x.dataset.tab; save(); tabs(); bar(); loadTab(); });
    $$('[data-tx]').forEach(x => x.onclick = () => { S.tabs = S.tabs.filter(t => t.id !== x.dataset.tx); if (!S.tabs.some(t => t.id === S.active)) S.active = S.tabs[0].id; save(); tabs(); bar(); loadTab(); });
    $('#labNewTab').onclick = () => { const T = tab(), n = { ...JSON.parse(JSON.stringify(T)), id: 't' + Date.now().toString(36) }; S.tabs.push(n); S.active = n.id; save(); tabs(); bar(); loadTab(); };
  }
  const SHOW = [['event', '⚡ Objem'], ['tl', '📐 Dotyky'], ['lines', '📏 Čiary 3+'], ['range', '▭ Range'], ['case', '✂ Uložené'], ['match', '🎯 Podobné']];
  function bar() {
    const T = tab();
    $('#labSym').innerHTML = META.symbols.map(s => `<option value="${s.id}" ${s.id === T.symbol ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
    $('#labTf').innerHTML = META.timeframes.map(t => `<option ${t === T.tf ? 'selected' : ''}>${t}</option>`).join('');
    $('#labBars').value = String(S.bars);
    $('#labPanels').innerHTML = T.panels.map(p => `<span class="lab-chip on">${esc((KS.STUDIES[p] || {}).name || p)} <span class="x" data-rp="${p}">✕</span></span>`).join('');
    $('#labAddPanel').innerHTML = '<option value="">＋ panel…</option>' + Object.entries(KS.STUDIES).filter(([k, d]) => d.pane === true && !d.custom && !T.panels.includes(k)).map(([k, d]) => `<option value="${k}">${esc(d.name)}</option>`).join('');
    $('#labShow').innerHTML = SHOW.map(([k, n]) => `<span class="lab-chip ${S.show[k] ? 'on' : ''}" data-sh="${k}">${n}</span>`).join('');
    $$('[data-rp]').forEach(x => x.onclick = () => { T.panels = T.panels.filter(p => p !== x.dataset.rp); save(); bar(); draw(); });
    $$('[data-sh]').forEach(x => x.onclick = () => { S.show[x.dataset.sh] = !S.show[x.dataset.sh]; save(); bar(); if (markers) markers.setMarkers(marks()); layer && layer.update(); });
  }
  $('#labSym').onchange = e => { tab().symbol = e.target.value; save(); tabs(); loadTab(); };
  $('#labTf').onchange = e => { tab().tf = e.target.value; save(); tabs(); loadTab(); };
  $('#labBars').onchange = e => { S.bars = +e.target.value; save(); loadTab(); };
  $('#labAddPanel').onchange = e => { if (e.target.value) { tab().panels.push(e.target.value); save(); bar(); draw(); } };
  $('#labScan').onclick = () => scan(true);
  $('#labScanAll').onclick = scanAll;
  $('#labCase').onclick = () => { if (!cur) return; pick = {}; $('#labChart').classList.add('picking'); hint('Klikni na sviečku, kde pohyb začal (Esc = zrušiť)'); };
  addEventListener('keydown', e => { if (e.key === 'Escape' && pick) { pick = null; hint(''); $('#labChart').classList.remove('picking'); layer && layer.update(); } });

  (async () => {
    try { META = await (await fetch('api/meta')).json(); } catch (e) { status('Server neodpovedá.'); return; }
    if (META.structure) TL.configure(META.structure);
    SYM = Object.fromEntries(META.symbols.map(s => [s.id, s]));
    // ?symbol=&tf=&t= opens that move (links from Electricals in Nexus)
    const q = new URLSearchParams(location.search);
    S.tabs = S.tabs.filter(t => SYM[t.symbol]); if (!S.tabs.length) S.tabs = JSON.parse(JSON.stringify(DEF.tabs));
    if (!S.tabs.some(t => t.id === S.active)) S.active = S.tabs[0].id;
    tabs(); bar();
    if (q.get('symbol') && SYM[q.get('symbol')]) { await go(q.get('symbol'), q.get('tf') || '1h', +q.get('t') || 0); history.replaceState(null, '', location.pathname); }
    else await loadTab();
  })();
})();
