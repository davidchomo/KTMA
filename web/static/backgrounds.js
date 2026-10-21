// Chart backgrounds: landscapes drawn as SVG in the browser (no image files, no licences), one per season
// and a few more, plus colour themes. BG.svg(id) returns an SVG string, BG.url(id) a data: URL.

const BG = (() => {
  const W = 1920, H = 1080;
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // A jagged ridge line: control points (x, y) refined by midpoint displacement.
  function ridge(r, ctrl, rough, depth = 7) {
    let pts = ctrl.map(([x, y]) => [x, y]);
    for (let d = 0; d < depth; d++) {
      const nx = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], len = x1 - x0;
        nx.push([(x0 + x1) / 2 + (r() - 0.5) * len * 0.15, (y0 + y1) / 2 + (r() - 0.5) * len * rough], pts[i]);
      }
      pts = nx;
    }
    return pts;
  }
  const poly = (pts, base = H) => `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}L${W},${base}L0,${base}Z`;
  // Shadowed faces: from every prominent peak down its right flank to the next valley.
  function shadows(pts) {
    let out = '';
    for (let i = 1; i < pts.length - 1; i++) {
      if (!(pts[i][1] < pts[i - 1][1] && pts[i][1] <= pts[i + 1][1])) continue;
      let j = i + 1; while (j < pts.length - 1 && pts[j + 1][1] >= pts[j][1] - 2) j++;
      const peak = pts[i], val = pts[j];
      if (val[1] - peak[1] < 70) continue;
      const seg = pts.slice(i, j + 1), foot = [peak[0] + (val[0] - peak[0]) * 0.25, val[1] + (val[1] - peak[1]) * 0.5];
      out += `M${seg.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}L${foot[0].toFixed(1)},${foot[1].toFixed(1)}Z`;
    }
    return out;
  }
  function stars(r, n, maxY, op = 0.9) {
    let s = '';
    for (let i = 0; i < n; i++) { const big = r() < 0.06; s += `<circle cx="${(r() * W).toFixed(0)}" cy="${(r() * r() * maxY).toFixed(0)}" r="${big ? 1.6 : 0.4 + r() * 0.8}" fill="#fff" opacity="${(0.3 + r() * 0.7) * op}"/>`; }
    return s;
  }
  function trees(r, y0, y1, n, color, h0 = 30, h1 = 70) {
    const list = Array.from({ length: n }, () => { const y = y0 + r() * (y1 - y0); return { x: r() * W, y, h: (h0 + r() * (h1 - h0)) * (0.6 + 0.4 * (y - y0) / (y1 - y0 || 1)), o: 0.75 + r() * 0.25 }; }).sort((p, q) => p.y - q.y);
    return list.map(({ x, y, h, o }) => { const w = h * 0.32;
      return `<path d="M${x.toFixed(0)},${(y - h).toFixed(0)}L${(x + w * 0.55).toFixed(0)},${(y - h * 0.5).toFixed(0)}L${(x + w * 0.3).toFixed(0)},${(y - h * 0.5).toFixed(0)}L${(x + w).toFixed(0)},${y.toFixed(0)}L${(x - w).toFixed(0)},${y.toFixed(0)}L${(x - w * 0.3).toFixed(0)},${(y - h * 0.5).toFixed(0)}L${(x - w * 0.55).toFixed(0)},${(y - h * 0.5).toFixed(0)}Z" fill="${color}" opacity="${o.toFixed(2)}"/>`; }).join('');
  }
  // A mountain layer: rock with a height gradient, shadowed faces, and snow caps above a ragged snow line
  // (high peaks are white down to the snow line, lower ridges get a thin cap).
  let uid = 0;
  function layer(id, pts, base, rock, rockDark, snow, snowLine, shade) {
    const top = Math.min(...pts.map(p => p[1])), r = rng(pts.length * 31 + Math.round(top));
    let defs = `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${top}" x2="0" y2="${base}"><stop offset="0" stop-color="${rock}"/><stop offset="1" stop-color="${rockDark}"/></linearGradient>`;
    let body = `<path d="${poly(pts, base)}" fill="url(#${id})"/>` + (shade ? `<path d="${shadows(pts)}" fill="${shade}"/>` : '');
    if (snow) {
      const line = top + (base - top) * snowLine, win = 14;
      const smooth = pts.map((_, i) => Math.min(...pts.slice(Math.max(0, i - win), i + win + 1).map(p => p[1])));
      const sy = pts.map(([x], i) => Math.max(line, smooth[i] + 26) + 16 * Math.sin(x / 41) + 9 * Math.sin(x / 13 + 1) + r() * 14);
      const fwd = pts.map(([x, y], i) => [x, Math.min(y, sy[i])]), back = pts.map(([x], i) => [x, sy[i]]).reverse();
      const g = id + 's' + (uid++);
      defs += `<linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="0" y1="${top}" x2="0" y2="${line + 60}"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="${snow}"/></linearGradient>`;
      body += `<path d="M${[...fwd, ...back].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}Z" fill="url(#${g})"/>`;
      if (shade) body += `<path d="${shadows(fwd)}" fill="${shade}" opacity=".7"/>`;
    }
    return { defs, body };
  }
  const wrap = (defs, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs>${body}</svg>`;
  const sky = (id, stops) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
  const fog = (id, y, h, color, op) => ({ defs: `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity="0"/><stop offset=".5" stop-color="${color}" stop-opacity="${op}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient>`,
                                          body: `<rect x="0" y="${y}" width="${W}" height="${h}" fill="url(#${id})"/>` });

  function scene(build) {
    let defs = '', body = '';
    const add = x => { if (typeof x === 'string') body += x; else { defs += x.defs || ''; body += x.body || ''; } };
    build(add, d => { defs += d; });
    return wrap(defs, body);
  }

  const SCENES = {
    // Very steep snowy peaks at dawn
    winter: { name: 'Zima · zasnežené štíty', season: 'Zima', svg: () => scene((add, def) => {
      const r = rng(7);
      def(sky('sk', [[0, '#0b1830'], [0.45, '#3b5b8c'], [0.75, '#c9a6b8'], [1, '#f2d4c4']]));
      add('<rect width="100%" height="100%" fill="url(#sk)"/>' + stars(r, 120, 380, 0.6));
      add(layer('m1', ridge(r, [[0, 640], [380, 470], [700, 560], [1060, 300], [1400, 520], [1720, 420], [W, 560]], 0.32), H, '#7d8fb0', '#4a5878', '#f4f7fb', 0.28, 'rgba(40,55,90,.28)'));
      add(fog('f1', 560, 260, '#dfe6f2', 0.45));
      add(layer('m2', ridge(r, [[0, 720], [260, 560], [620, 760], [940, 470], [1180, 140], [1330, 520], [1640, 600], [W, 700]], 0.45), H, '#55648a', '#262f4b', '#ffffff', 0.34, 'rgba(25,35,70,.35)'));
      add(fog('f2', 760, 220, '#eef2f8', 0.35));
      add(layer('m3', ridge(r, [[0, 860], [420, 800], [820, 900], [1300, 820], [W, 880]], 0.18), H, '#e9eef6', '#c3cfe0', null, 0, null));
      add(trees(r, 900, 1080, 70, '#1d2b3f', 40, 110));
    }) },
    aurora: { name: 'Polárna žiara', season: 'Zima', svg: () => scene((add, def) => {
      const r = rng(21);
      def(sky('sk', [[0, '#020611'], [0.6, '#0b1f33'], [1, '#12324a']]) + '<filter id="bl"><feGaussianBlur stdDeviation="28"/></filter>');
      add('<rect width="100%" height="100%" fill="url(#sk)"/>' + stars(r, 260, 700));
      add(`<g filter="url(#bl)" opacity=".85"><path d="M-100,420 C300,200 600,520 960,300 S1500,160 2050,330 L2050,420 C1500,260 1300,420 960,410 S300,330 -100,520Z" fill="#28e0a0" opacity=".55"/>
        <path d="M-100,300 C400,140 700,360 1100,200 S1700,120 2050,220 L2050,280 C1700,200 1400,330 1100,280 S400,230 -100,380Z" fill="#7b5cff" opacity=".35"/></g>`);
      add(layer('m1', ridge(r, [[0, 760], [300, 600], [640, 700], [980, 480], [1260, 680], [1600, 560], [W, 720]], 0.38), H, '#33415c', '#141b2b', '#dbe7f5', 0.25, 'rgba(0,0,20,.35)'));
      add(layer('m2', ridge(r, [[0, 900], [500, 840], [1000, 920], [1500, 850], [W, 910]], 0.15), H, '#c9d7e8', '#7f93ad', null, 0, null));
      add(trees(r, 930, 1080, 60, '#06101c', 50, 120));
    }) },
    spring: { name: 'Jar · rozkvitnuté kopce', season: 'Jar', svg: () => scene((add, def) => {
      const r = rng(5);
      def(sky('sk', [[0, '#6fb4ff'], [0.7, '#cfe8ff'], [1, '#f4fbff']]));
      add('<rect width="100%" height="100%" fill="url(#sk)"/>');
      add('<g fill="#fff" opacity=".85"><ellipse cx="420" cy="200" rx="160" ry="38"/><ellipse cx="520" cy="180" rx="110" ry="44"/><ellipse cx="1400" cy="260" rx="190" ry="40"/><ellipse cx="1500" cy="236" rx="120" ry="46"/></g>');
      add(layer('m1', ridge(r, [[0, 600], [500, 380], [900, 520], [1300, 340], [W, 560]], 0.25), H, '#a7b9d6', '#8aa1c4', '#f6f9ff', 0.16, null));
      add(layer('m2', ridge(r, [[0, 760], [600, 640], [1200, 720], [W, 650]], 0.08, 6), H, '#7cc36a', '#3f8a3a', null, 0, null));
      add(layer('m3', ridge(r, [[0, 880], [700, 820], [1300, 900], [W, 840]], 0.06, 6), H, '#5fae4c', '#2f6e2b', null, 0, null));
      let petals = ''; for (let i = 0; i < 160; i++) petals += `<circle cx="${(r() * W).toFixed(0)}" cy="${(820 + r() * 260).toFixed(0)}" r="${2 + r() * 4}" fill="${['#ffd1e8', '#ff9ec9', '#fff3a6', '#ffffff'][i % 4]}" opacity=".9"/>`;
      add(petals);
    }) },
    summer: { name: 'Leto · západ slnka nad morom', season: 'Leto', svg: () => scene((add, def) => {
      const r = rng(11);
      def(sky('sk', [[0, '#1b1446'], [0.35, '#7a2f6b'], [0.6, '#ff7a4d'], [0.72, '#ffc46b'], [1, '#ffc46b']]) +
          sky('sea', [[0, '#ff9c5c'], [0.15, '#7a3d6e'], [1, '#160f33']]) + '<radialGradient id="sun"><stop offset="0" stop-color="#fff6c8"/><stop offset=".6" stop-color="#ffd27a"/><stop offset="1" stop-color="#ffb35c" stop-opacity="0"/></radialGradient>');
      add('<rect width="100%" height="100%" fill="url(#sk)"/><circle cx="960" cy="720" r="210" fill="url(#sun)"/>');
      add(layer('m1', ridge(r, [[0, 700], [320, 560], [620, 690], [1500, 700], [1700, 580], [W, 660]], 0.3), 780, '#3d1f4f', '#2a1238', null, 0, null));
      add('<rect x="0" y="770" width="1920" height="310" fill="url(#sea)"/>');
      let lines = ''; for (let i = 0; i < 40; i++) { const y = 780 + i * i * 0.2 + i * 2, w = 200 - i * 3 + r() * 60; lines += `<rect x="${960 - w / 2 + (r() - 0.5) * 40}" y="${y.toFixed(0)}" width="${w.toFixed(0)}" height="${1 + i * 0.08}" fill="#ffe2a0" opacity="${0.6 - i * 0.012}"/>`; }
      add(lines);
    }) },
    autumn: { name: 'Jeseň · hmla nad lesom', season: 'Jeseň', svg: () => scene((add, def) => {
      const r = rng(3);
      def(sky('sk', [[0, '#3a2a40'], [0.5, '#c46a3c'], [1, '#f2c18a']]));
      add('<rect width="100%" height="100%" fill="url(#sk)"/>');
      add(layer('m1', ridge(r, [[0, 560], [400, 380], [800, 500], [1250, 300], [1600, 460], [W, 400]], 0.35), H, '#8a5a6a', '#5c3a4c', null, 0, 'rgba(40,10,30,.2)'));
      add(fog('f1', 470, 260, '#f6d2a8', 0.5));
      add(layer('m2', ridge(r, [[0, 700], [500, 600], [900, 700], [1400, 580], [W, 680]], 0.2), H, '#a8452a', '#5a2416', null, 0, 'rgba(30,5,0,.2)'));
      add(trees(r, 720, 860, 90, '#7a2e18', 30, 70));
      add(fog('f2', 760, 200, '#f2c18a', 0.45));
      add(layer('m3', ridge(r, [[0, 880], [700, 840], [1300, 900], [W, 850]], 0.1), H, '#6b2a14', '#2e120a', null, 0, null));
      add(trees(r, 900, 1080, 70, '#3a1308', 50, 120));
    }) },
    night: { name: 'Noc · hory v mesačnom svetle', season: 'Celý rok', svg: () => scene((add, def) => {
      const r = rng(9);
      def(sky('sk', [[0, '#05070f'], [0.7, '#142038'], [1, '#22324f']]) + '<radialGradient id="moon"><stop offset="0" stop-color="#fffbe8"/><stop offset=".25" stop-color="#f3eed6"/><stop offset=".27" stop-color="#f3eed6" stop-opacity=".25"/><stop offset="1" stop-color="#f3eed6" stop-opacity="0"/></radialGradient>');
      add('<rect width="100%" height="100%" fill="url(#sk)"/>' + stars(r, 300, 800) + '<circle cx="1450" cy="230" r="230" fill="url(#moon)"/>');
      add(layer('m1', ridge(r, [[0, 700], [350, 520], [700, 640], [1000, 380], [1250, 600], [1600, 480], [W, 640]], 0.4), H, '#2b3650', '#121828', '#aebcd6', 0.22, 'rgba(0,0,15,.35)'));
      add(layer('m2', ridge(r, [[0, 860], [600, 760], [1200, 860], [W, 780]], 0.2), H, '#141c2e', '#080c16', null, 0, null));
    }) },
    space: { name: 'Vesmír · hmlovina', season: 'Celý rok', svg: () => scene((add, def) => {
      const r = rng(17);
      def('<filter id="bl"><feGaussianBlur stdDeviation="60"/></filter>');
      add('<rect width="100%" height="100%" fill="#03040a"/>');
      add('<g filter="url(#bl)"><ellipse cx="700" cy="500" rx="520" ry="260" fill="#5b2a86" opacity=".55"/><ellipse cx="1150" cy="560" rx="420" ry="220" fill="#1f5f9e" opacity=".5"/><ellipse cx="980" cy="430" rx="260" ry="140" fill="#c2477e" opacity=".35"/></g>');
      add(stars(r, 600, 1080));
    }) },
    desert: { name: 'Púšť · duny', season: 'Leto', svg: () => scene((add, def) => {
      const r = rng(13);
      def(sky('sk', [[0, '#2a5c8f'], [0.6, '#e9b979'], [1, '#f6d8a6']]));
      add('<rect width="100%" height="100%" fill="url(#sk)"/>');
      add(layer('d1', ridge(r, [[0, 700], [600, 600], [1100, 680], [W, 620]], 0.05, 6), H, '#d99a5b', '#a8693a', null, 0, null));
      add(layer('d2', ridge(r, [[0, 860], [500, 780], [1200, 880], [W, 800]], 0.05, 6), H, '#c97f45', '#7d4524', null, 0, 'rgba(90,40,10,.25)'));
    }) },
  };
  const SEASON_BY_MONTH = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'];
  const cache = {};
  function svg(id) { return cache[id] || (cache[id] = SCENES[id] ? SCENES[id].svg() : ''); }
  const url = id => (SCENES[id] ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg(id)).replace(/'/g, '%27')}` : '');
  const bySeason = (d = new Date()) => SEASON_BY_MONTH[d.getMonth()];

  // Colour themes for the chart and the panel (look + panel colours).
  const THEMES = {
    dark: { name: 'Tmavá (predvolená)', look: { bg: '#161a25', bg2: '#161a25', text: '#d1d4dc', up: '#089981', down: '#f23645' }, grid: '#1f2433', panel: { bg: '#1e222d', text: '#d1d4dc', accent: '#2962ff' } },
    midnight: { name: 'Polnoc', look: { bg: '#0b0e17', bg2: '#131a2c', text: '#b2b5be', up: '#26a69a', down: '#ef5350' }, grid: '#161c2b', panel: { bg: '#10141f', text: '#c3c6ce', accent: '#7b61ff' } },
    ocean: { name: 'Oceán', look: { bg: '#0d1b2a', bg2: '#1b263b', text: '#cfe3f2', up: '#2ec4b6', down: '#ff6b6b' }, grid: '#1c2d42', panel: { bg: '#13233a', text: '#dbeaf6', accent: '#00b4d8' } },
    forest: { name: 'Les', look: { bg: '#0f1a14', bg2: '#16261d', text: '#d3e4d6', up: '#7bd389', down: '#e76f51' }, grid: '#1b2b21', panel: { bg: '#15241b', text: '#dcebe0', accent: '#52b788' } },
    snow: { name: 'Sneh (svetlá)', look: { bg: '#ffffff', bg2: '#eef3fa', text: '#131722', up: '#089981', down: '#f23645' }, grid: '#e6ebf2', panel: { bg: '#f4f6fa', text: '#131722', accent: '#2962ff' } },
    sepia: { name: 'Sépia', look: { bg: '#f4ecd8', bg2: '#efe2c4', text: '#4a3b2a', up: '#2e7d32', down: '#b23c17' }, grid: '#e6d9bb', panel: { bg: '#eadfc4', text: '#4a3b2a', accent: '#a0522d' } },
  };
  return { SCENES, THEMES, svg, url, bySeason };
})();
