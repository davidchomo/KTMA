// Small shared UI helpers: storage, escaping, dropdown menus, dialogs and the TradingView-like colour popover.

const UI = (() => {
  const $ = (s, root) => (root || document).querySelector(s);
  const $$ = (s, root) => [...(root || document).querySelectorAll(s)];
  const esc = x => String(x ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const LS = {
    get(k, d = null) { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const PALETTE = [
    ['#ffffff', '#ebebeb', '#d6d6d6', '#bfbfbf', '#a8a8a8', '#8f8f8f', '#757575', '#5c5c5c', '#434343', '#000000'],
    ['#f23645', '#ff9800', '#ffeb3b', '#4caf50', '#089981', '#00bcd4', '#2962ff', '#673ab7', '#9c27b0', '#e91e63'],
    ['#fccbcd', '#ffe0b2', '#fff9c4', '#c8e6c9', '#ace5dc', '#b2ebf2', '#bbd9fb', '#d1c4e9', '#e1bee7', '#f8bbd0'],
    ['#faa1a4', '#ffcc80', '#fff59d', '#a5d6a7', '#70ccbd', '#80deea', '#90bff9', '#b39ddb', '#ce93d8', '#f48fb1'],
    ['#f77c80', '#ffb74d', '#fff176', '#81c784', '#42bda8', '#4dd0e1', '#5b9cf6', '#9575cd', '#ba68c8', '#f06292'],
    ['#f7525f', '#ffa726', '#ffee58', '#66bb6a', '#22ab94', '#26c6da', '#3179f5', '#7e57c2', '#ab47bc', '#ec407a'],
    ['#b22833', '#f57c00', '#fbc02d', '#388e3c', '#056656', '#0097a7', '#1848cc', '#512da8', '#7b1fa2', '#c2185b'],
    ['#801922', '#e65100', '#f57f17', '#1b5e20', '#00332a', '#006064', '#0c3299', '#311b92', '#4a148c', '#880e4f']];
  const rgba = (hex, op) => KS.rgba(hex, op);

  // ---- dropdown menu anchored to a toolbar button ----------------------------------------------
  let menuEl = null, menuAnchor = null;
  function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } if (menuAnchor) menuAnchor.classList.remove('open'); menuAnchor = null; }
  function openMenu(anchor, html, bind, opts = {}) {
    if (menuAnchor === anchor) { closeMenu(); return null; }
    closeMenu();
    menuEl = document.createElement('div');
    menuEl.className = 'dd ' + (opts.cls || '');
    menuEl.innerHTML = html;
    document.body.appendChild(menuEl);
    menuAnchor = anchor;
    anchor.classList.add('open');
    place(menuEl, anchor, opts.side);
    if (bind) bind(menuEl);
    return menuEl;
  }
  function place(el, anchor, side) {
    const a = anchor.getBoundingClientRect(), W = innerWidth, Hh = innerHeight;
    el.style.maxHeight = '';
    if (side === 'right') {
      el.style.left = Math.min(a.right + 4, W - el.offsetWidth - 6) + 'px';
      el.style.top = Math.max(6, Math.min(a.top, Hh - el.offsetHeight - 6)) + 'px';
    } else if (side === 'up') {
      el.style.left = Math.max(6, Math.min(a.left, W - el.offsetWidth - 6)) + 'px';
      el.style.maxHeight = (a.top - 12) + 'px';
      el.style.top = Math.max(6, a.top - el.offsetHeight - 4) + 'px';
    } else {
      el.style.left = Math.max(6, Math.min(a.left, W - el.offsetWidth - 6)) + 'px';
      el.style.top = (a.bottom + 4) + 'px';
      el.style.maxHeight = (Hh - a.bottom - 12) + 'px';
    }
  }
  document.addEventListener('mousedown', e => {
    if (menuEl && !menuEl.contains(e.target) && !(menuAnchor && menuAnchor.contains(e.target)) && !e.target.closest('#pop')) closeMenu();
  }, true);

  // ---- modal dialog ------------------------------------------------------------------------------
  let cancelFn = null;
  function openDialog(html, onCancel, cls) {
    closePop();
    const m = $('#modal');
    m.innerHTML = `<div class="dlg ${cls || ''}">${html}</div>`;
    m.classList.add('open');
    cancelFn = onCancel || null;
    const d = m.firstElementChild;
    sizable(d);
    return d;
  }
  // Every dialog: drag by the header, resize from the corner, A− / A+ zoom and maximise; remembered per dialog.
  function sizable(d) {
    const head = $('.dlg-h', d);
    if (!head) return;
    const key = 'nx-dlg:' + ((d.className.split(' ')[1] || '') + ':' + (head.firstElementChild ? head.firstElementChild.textContent : '')).trim().slice(0, 60);
    const st = LS.get(key, {});
    const apply = () => {
      d.classList.toggle('max', !!st.max);
      d.style.zoom = st.zoom && st.zoom !== 100 ? st.zoom / 100 : '';
      if (st.max) { d.style.left = d.style.top = d.style.width = d.style.height = ''; d.style.position = ''; return; }
      if (st.w) { d.style.width = st.w + 'px'; d.style.height = st.h + 'px'; d.style.maxHeight = 'none'; }
      if (st.x !== undefined) { d.style.position = 'fixed'; d.style.left = Math.max(0, Math.min(innerWidth - 120, st.x)) + 'px'; d.style.top = Math.max(0, Math.min(innerHeight - 40, st.y)) + 'px'; }
    };
    const store = () => LS.set(key, st);
    const close = head.querySelector('[data-x], [data-cancel]');
    const tools = document.createElement('span');
    tools.className = 'dlg-tools';
    tools.innerHTML = '<button class="ib" data-z="-" title="Zmenšiť písmo">A−</button><button class="ib" data-z="+" title="Zväčšiť písmo">A+</button><button class="ib" data-z="max" title="Maximalizovať / obnoviť">⤢</button><button class="ib" data-z="reset" title="Pôvodná veľkosť a poloha">↺</button>';
    head.insertBefore(tools, close || null);
    tools.addEventListener('click', e => {
      const z = e.target.dataset.z; if (!z) return;
      if (z === '+' || z === '-') st.zoom = Math.max(70, Math.min(180, (st.zoom || 100) + (z === '+' ? 10 : -10)));
      else if (z === 'max') st.max = !st.max;
      else { for (const k in st) delete st[k]; d.removeAttribute('style'); }
      store(); apply();
    });
    let drag = null;
    head.addEventListener('pointerdown', e => {
      if (e.target.closest('button, input, select') || st.max) return;
      const r = d.getBoundingClientRect(), zm = (st.zoom || 100) / 100;
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, zm }; head.setPointerCapture(e.pointerId); e.preventDefault();
    });
    head.addEventListener('pointermove', e => { if (!drag) return; st.x = (e.clientX - drag.dx) / drag.zm; st.y = (e.clientY - drag.dy) / drag.zm; apply(); });
    head.addEventListener('pointerup', () => { if (drag) { drag = null; store(); } });
    head.addEventListener('dblclick', e => { if (!e.target.closest('button')) { st.max = !st.max; store(); apply(); } });
    let first = true;
    new ResizeObserver(() => {
      if (first) { first = false; return; }
      if (st.max || !d.isConnected) return;
      const w = Math.round(d.offsetWidth), h = Math.round(d.offsetHeight);
      if (Math.abs((st.w || 0) - w) > 2 || Math.abs((st.h || 0) - h) > 2) {
        if (!d.dataset.user) return;               // only sizes the person set with the corner handle
        st.w = w; st.h = h; clearTimeout(d._t); d._t = setTimeout(store, 300);
      }
    }).observe(d);
    d.addEventListener('pointerdown', e => {      // the native resize corner (bottom-right 16 px)
      const r = d.getBoundingClientRect();
      if (e.clientX > r.right - 18 && e.clientY > r.bottom - 18) d.dataset.user = 1;
    });
    apply();
  }
  function closeDialog() { closePop(); const m = $('#modal'); m.classList.remove('open'); m.innerHTML = ''; cancelFn = null; }
  function cancelDialog() { if (cancelFn) cancelFn(); else closeDialog(); }
  const dialogOpen = () => $('#modal').classList.contains('open');

  // ---- colour popover: palette, own colours, opacity, thickness, line style -------------------
  let popClose = null, popAnchor = null;
  function closePop() { const p = $('#pop'); if (!p) return; p.classList.remove('open'); p.innerHTML = ''; popAnchor = null; if (popClose) { const f = popClose; popClose = null; f(); } }
  document.addEventListener('mousedown', e => {
    const p = $('#pop');
    if (p && p.classList.contains('open') && !p.contains(e.target) && !e.target.closest('.sw')) closePop();
  }, true);
  // `st` is edited in place ({color, opacity, width?, style?}); `keys` maps other field names (e.g. fill colours).
  function colorPopover(anchor, st, opt, onChange, keys) {
    const K = { color: 'color', opacity: 'opacity', ...(keys || {}) };
    if (popAnchor === anchor) { closePop(); return; }
    closePop();
    popAnchor = anchor;
    const pop = $('#pop');
    const own = LS.get('nx-own-colors', []);
    const fire = () => { onChange(); const b = anchor.querySelector('b'); if (b) b.style.background = rgba(st[K.color], st[K.opacity]); };
    const cell = c => `<div class="pc ${String(st[K.color]).toLowerCase() === c ? 'sel' : ''}" data-c="${c}" style="background:${c}" title="${c}"></div>`;
    const paint = () => {
      pop.innerHTML = `<div class="pal">${PALETTE[0].map(cell).join('')}</div><div class="pal gap">${PALETTE[1].map(cell).join('')}</div>
        <div class="pal gap">${PALETTE.slice(2).flat().map(cell).join('')}</div><div class="hr"></div>
        <div class="pal">${own.slice(0, 9).map(cell).join('')}<label class="pc plus" title="Vlastná farba">＋<input type="color" value="${String(st[K.color]).slice(0, 7)}"></label></div>
        ${opt.noOpacity ? '' : `<div class="lbl">Priehľadnosť (krytie)</div>
        <div class="op"><input type="range" min="0" max="100" value="${st[K.opacity] ?? 100}"><input type="number" min="0" max="100" value="${st[K.opacity] ?? 100}"><span>%</span></div>`}
        ${opt.width ? `<div class="lbl">Hrúbka</div><div class="seg" data-seg="width">${[1, 2, 3, 4].map(w => `<div class="${st.width === w ? 'on' : ''}" data-v="${w}"><hr style="border-top-width:${w}px"></div>`).join('')}</div>` : ''}
        ${opt.style ? `<div class="lbl">Štýl čiary</div><div class="seg" data-seg="style">${[0, 2, 1].map(v => `<div class="${st.style === v ? 'on' : ''}" data-v="${v}"><hr style="border-top-width:2px;border-top-style:${['solid', 'dotted', 'dashed'][v]}"></div>`).join('')}</div>` : ''}`;
      $$('[data-c]', pop).forEach(c => c.onclick = () => { st[K.color] = c.dataset.c; fire(); paint(); });
      const picker = $('input[type=color]', pop);
      picker.oninput = () => { st[K.color] = picker.value; fire(); };
      picker.onchange = () => { const list = [picker.value, ...own.filter(c => c !== picker.value)].slice(0, 9); LS.set('nx-own-colors', list); own.splice(0, own.length, ...list); paint(); };
      const [rng, numb] = $$('.op input', pop);
      const setOp = v => { st[K.opacity] = Math.max(0, Math.min(100, Math.round(+v || 0))); rng.value = numb.value = st[K.opacity]; fire(); };
      if (rng) { rng.oninput = () => setOp(rng.value); numb.onchange = () => setOp(numb.value); }
      $$('[data-seg] div', pop).forEach(d => d.onclick = () => { st[d.parentElement.dataset.seg] = +d.dataset.v; fire(); paint(); });
    };
    paint();
    pop.classList.add('open');
    const a = anchor.getBoundingClientRect(), h = pop.offsetHeight;
    pop.style.left = Math.max(8, Math.min(a.left, innerWidth - pop.offsetWidth - 8)) + 'px';
    pop.style.top = Math.max(8, a.bottom + 4 + h > innerHeight - 8 ? a.top - h - 4 : a.bottom + 4) + 'px';
    popClose = () => { const b = anchor.querySelector('b'); if (b) b.style.background = rgba(st[K.color], st[K.opacity]); };
  }
  const swatch = (id, color, opacity) => `<button class="sw" data-sw="${id}" title="Farba a priehľadnosť"><i class="chk"><b style="background:${rgba(color, opacity ?? 100)}"></b></i></button>`;
  const opts = (list, cur) => list.map(([label, v]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(label)}</option>`).join('');
  let toastT = null;
  function toast(text, ms = 1800) {
    const t = $('#toast');
    t.textContent = text; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms);
  }
  return { $, $$, esc, LS, PALETTE, openMenu, closeMenu, place, openDialog, closeDialog, cancelDialog, dialogOpen,
           colorPopover, closePop, swatch, opts, toast, rgba };
})();
