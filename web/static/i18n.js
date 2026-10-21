// UI language: the app is written in Slovak; English is a translation layer over the rendered page.
// Text nodes, titles and placeholders are matched as whole phrases (emoji / symbols in front are kept).
// What is not in the dictionary stays Slovak.
const I18N = (() => {
  const EN = {
    // toolbar and windows
    'Indikátory': 'Indicators', 'Kreslenie': 'Drawing', 'Nápad': 'Idea', 'Nastavenia': 'Settings', 'Skenovať': 'Scan', 'Sociálne': 'Social',
    'Sviečky': 'Candles', 'Knižnica': 'Library', 'Funkcie': 'Functions', 'Objem': 'Volume', 'Čiary': 'Lines', 'Auto čiary': 'Auto lines',
    'Späť na živý graf': 'Back to live chart', 'Symbol': 'Symbol', 'Typ grafu': 'Chart type', 'Časový rámec': 'Timeframe', 'Celá obrazovka': 'Full screen',
    'Ďalší': 'Next', 'Predchádzajúci': 'Previous', 'Zavrieť': 'Close', 'Zbaliť': 'Collapse', 'Obnoviť': 'Refresh', 'Jednotky': 'Units', 'Stav dát': 'Data status',
    'Zobraziť panel': 'Show toolbar', 'Skryť panel': 'Hide toolbar', 'Späť': 'Undo', 'Znova': 'Redo', 'Chat': 'Chat', 'Správy': 'News', 'Nástenka': 'Board',
    'Účet': 'Account', 'Pozície': 'Positions', 'História': 'History', 'Robot': 'Robot', 'Plocha': 'Workspace', 'Plochy': 'Workspaces', 'Text': 'Text',
    'Vzory': 'Patterns', 'Šablóny': 'Templates', 'Indikátory a vzory': 'Indicators and patterns', 'Kĺzavé priemery': 'Moving averages', 'Pásma a kanály': 'Bands and channels',
    'Trend': 'Trend', 'Oscilátory': 'Oscillators', 'Vstupy': 'Inputs', 'Štýl': 'Style', 'Viditeľnosť': 'Visibility', 'Rýchle predvoľby': 'Quick presets',
    'Hrúbka': 'Width', 'Krytie': 'Opacity', 'Farba': 'Colour', 'Farby': 'Colours', 'Pridať indikátor': 'Add indicator', 'Pridať ďalší indikátor': 'Add another indicator',
    'Na grafe': 'On chart', 'Odstrániť': 'Remove', 'Zmazať': 'Delete', 'Duplikovať': 'Duplicate', 'Zamknúť': 'Lock', 'Odomknúť': 'Unlock', 'Skryť': 'Hide', 'Zobraziť': 'Show',
    'Otvoriť': 'Open', 'Uložiť': 'Save', 'Zrušiť': 'Cancel', 'Hotovo': 'Done', 'Predvolené': 'Defaults', 'Predvolená': 'Default', 'Áno': 'Yes', 'Nie': 'No', 'Naozaj?': 'Are you sure?',
    'Všetky': 'All', 'Všetko': 'Everything', 'Žiadne': 'None', 'Najnovšie': 'Newest', 'Najstaršie': 'Oldest', 'Náhodne': 'Random', 'Hľadať': 'Search', 'Hľadať…': 'Search…',
    // settings
    'Nastavenia grafu': 'Chart settings', 'Plátno': 'Canvas', 'Legenda': 'Legend', 'Mierka': 'Scale', 'Kurzor': 'Crosshair', 'Čas': 'Time', 'Panel': 'Toolbar', 'Dáta': 'Data',
    'Štýly a pozadia': 'Styles and backgrounds', 'Štýly': 'Styles', 'Jazyk': 'Language', 'Jazyk / Language': 'Language / Jazyk',
    'Telo sviečky': 'Candle body', 'Okraje': 'Borders', 'Knôty': 'Wicks', 'Čiara / plocha (čiarové typy)': 'Line / area (line types)', 'Rovnaké farby pre telo, okraj aj knôt': 'Same colours for body, border and wick',
    'Zjednotiť': 'Sync', 'Veľkosť a tvar sviečok': 'Candle size and shape', 'Šírka tela (% miesta pre sviečku)': 'Body width (% of the bar slot)', 'Hrúbka knôtu': 'Wick width',
    'Zaoblenie rohov': 'Corner radius', 'Rozostup sviečok (priblíženie)': 'Bar spacing (zoom)', 'Normálna': 'Normal', 'Logaritmická': 'Logarithmic', 'Percentá': 'Percent',
    'Indexovaná na 100': 'Indexed to 100', 'Obrátiť mierku': 'Invert scale', 'Čiara poslednej ceny': 'Last price line', 'Voľné miesto vpravo (sviečky)': 'Right offset (bars)',
    'Okraj hore / dole (%)': 'Margin top / bottom (%)', 'Jas celej stránky': 'Page brightness', 'Jas': 'Brightness', 'Pozadie': 'Background', 'Plná farba': 'Solid colour',
    'Prechod (gradient)': 'Gradient', 'Mriežka': 'Grid', 'Zvislé čiary': 'Vertical lines', 'Vodorovné čiary': 'Horizontal lines', 'Rovnaké nastavenie pre obe': 'Same settings for both',
    'Zjednotiť podľa zvislých': 'Copy from vertical', 'Oddeľovače panelov (RSI, MACD…)': 'Pane separators (RSI, MACD…)', 'Mierky': 'Scales', 'Čiary mierok': 'Scale lines',
    'Veľkosť písma': 'Font size', 'Písmo': 'Font', 'Režim': 'Mode', 'Normálny': 'Normal', 'Skrytý': 'Hidden', 'Čiary kurzora': 'Crosshair lines', 'Popisy na osiach': 'Axis labels',
    'Časové pásmo': 'Time zone', 'Timeframe': 'Timeframe', 'Ceny O H L C sviečky pod kurzorom': 'O H L C of the candle under the cursor', 'Zmena a percentuálna zmena': 'Change and % change',
    'Hodnoty indikátorov': 'Indicator values', 'Veľkosť tehly': 'Brick size', 'ATR perióda': 'ATR period', 'Pevná veľkosť': 'Fixed size', 'Percento': 'Percent',
    'Pevná cena': 'Fixed price', 'Percento ceny': 'Percent of price', 'Poloha panelu': 'Toolbar position', 'Hore': 'Top', 'Dole': 'Bottom', 'Vľavo': 'Left', 'Vpravo': 'Right',
    'Panel na boku (vľavo / vpravo)': 'Side toolbar (left / right)', 'Šírka bočného panela': 'Side toolbar width', 'Krytie bočného panela': 'Side toolbar opacity', 'Vzhľad panelu': 'Toolbar look',
    'Šírka tlačidla': 'Button width', 'Výška panelu': 'Toolbar height', 'Ikona + text': 'Icon + text', 'Iba ikony': 'Icons only', 'Iba text': 'Text only', 'Pozadie panelu': 'Toolbar background',
    'Zvýraznenie (aktívne tlačidlá, výber)': 'Accent (active buttons, selection)', 'Vzhľad panelu na predvolený': 'Reset toolbar look', 'Sviečok načítať': 'Bars to load',
    'Tvoje meno (nastavenia na všetkých zariadeniach)': 'Your name (settings on all devices)', 'Zlato a striebro: iba obchodné hodiny (bez víkendu a dennej pauzy)': 'Gold and silver: trading hours only (no weekend, no daily break)',
    'Duté sviečky': 'Hollow candles', 'OHLC bary': 'OHLC bars', 'HLC bary': 'HLC bars', 'Farebné OHLC bary': 'Coloured OHLC bars', 'Farebné HLC bary': 'Coloured HLC bars',
    'Čiara': 'Line', 'Plocha (area)': 'Area', 'Základná línia': 'Baseline', 'Schodová čiara': 'Step line', 'Minúty': 'Minutes', 'Hodiny': 'Hours', 'Dni a viac': 'Days and more', 'Sekundy': 'Seconds',
    // trading
    'Nákup': 'Buy', 'Predaj': 'Sell', 'KÚPA (LONG)': 'BUY (LONG)', 'PREDAJ (SHORT)': 'SELL (SHORT)', 'Kúpiť': 'Buy', 'Predať': 'Sell', 'Zostatok': 'Balance', 'Otvorený P/L': 'Open P/L',
    'Celkový P/L': 'Total P/L', 'Otvorené obchody': 'Open trades', 'Uzavreté obchody a štatistiky': 'Closed trades and statistics', 'Úspešnosť': 'Win rate', 'Obchodov': 'Trades',
    'Obchod': 'Trade', 'Priem. zisk': 'Avg win', 'Priem. strata': 'Avg loss', 'Priem. trvanie': 'Avg duration', 'Profit faktor': 'Profit factor', 'Najlepší': 'Best', 'Najhorší': 'Worst',
    'Obchodný panel': 'Trade ticket', 'Obchodný nápad': 'Trade idea', 'Hlavný účet': 'Main account', 'Zatvoriť': 'Close', 'Zatvoriť polovicu': 'Close half', 'Stop na breakeven': 'Stop to breakeven',
    'Veľkosť': 'Size', 'Loty': 'Lots', 'Vstup': 'Entry', 'Výstup': 'Exit', 'Zisk': 'Profit', 'Strata': 'Loss', 'Smer': 'Direction', 'Zdieľať účet': 'Share account', 'Pripojiť sa': 'Join',
    'Kód na sledovanie': 'View code', 'Kód na obchodovanie': 'Trade code', 'Členovia': 'Members', 'Sledovať jeho graf': "Follow the owner's chart",
    'Zatiaľ žiadne uzavreté obchody.': 'No closed trades yet.', 'Nápady': 'Ideas', 'Stratégie živých nápadov': 'Live idea strategies', 'Stratégia': 'Strategy', 'Potvrdenia': 'Confirmations',
    'Nápadov': 'Ideas', 'Priem.': 'Avg', 'Stop': 'Stop', 'Zapnúť všetky': 'Enable all', 'Vypnúť všetky': 'Disable all', 'Živé nápady zapnuté': 'Live ideas on',
    'Zapnúť auto čiary': 'Turn auto lines on', 'Vypnúť auto čiary': 'Turn auto lines off', 'Horizontálne S/R úrovne': 'Horizontal S/R levels', 'Trendové čiary (podpora / rezistencia)': 'Trendlines (support / resistance)',
    'Rovnobežné kanály': 'Parallel channels', 'Swingy (ZigZag pivoty)': 'Swings (ZigZag pivots)', 'Popisy (počet dotykov)': 'Labels (touch count)', 'Max. trendových čiar': 'Max trendlines', 'Max. úrovní': 'Max levels',
    'Pozadie podľa Technicals': 'Background by Technicals', 'Sýtosť': 'Intensity', 'Silný nákup': 'Strong buy', 'Silný predaj': 'Strong sell', 'Neutrálne': 'Neutral',
    // social / chat / news
    'Komunikácia': 'Communication', 'Priečinky': 'Folders', 'Opýtať sa Clauda': 'Ask Claude', 'Správa': 'Message', 'Napíš správu…': 'Write a message…', 'Odoslať': 'Send',
    'Kalendár': 'Calendar', 'Odkazy': 'Links', 'Iba vysoký vplyv': 'High impact only', 'Vysoký + stredný': 'High + medium', 'Poznámka': 'Note', 'Poznámky a zoznamy úloh': 'Notes and to-do lists',
    'Zoznam úloh': 'To-do list', 'Nová poznámka': 'New note', 'Nový zoznam': 'New list',
    // launcher categories
    'Vzhľad': 'Look', 'Graf': 'Chart', 'Analýza': 'Analysis', 'Obchodovanie': 'Trading', 'Vzdelávanie': 'Education', 'Rozloženie a plochy': 'Layout and workspaces', 'Kreslenie a text': 'Drawing and text',
    'Efekty': 'Effects', 'Príroda': 'Nature', 'Počasie': 'Weather', 'Vesmír': 'Space', 'Zvuk': 'Sound', 'Pridať do panela': 'Add to toolbar', 'Skryť z panela': 'Remove from toolbar',
    'Fotky': 'Photos', 'Kreslené': 'Drawn', 'Animované': 'Animated', 'Videá': 'Videos', 'Farby sviečok': 'Candle colours', 'Témy': 'Themes', 'Bez obrázka': 'No image', 'Vlastný obrázok': 'Custom image',
    // algo
    'Algo': 'Algo', 'Rebríček': 'Ranking', 'Detail': 'Detail', 'Naživo': 'Live', 'Zdroje': 'Sources', 'Kontrolné obdobie': 'Check period', 'Výnos': 'Return', 'Max. prepad': 'Max drawdown',
    'Počítam…': 'Computing…', 'Server neodpovedá': 'Server not responding', 'Uložené ✅': 'Saved ✅', 'Zdieľanie zlyhalo': 'Sharing failed', 'Neplatný kód': 'Invalid code',
    'Odraz od trendovej podpory': 'Bounce off trendline support', 'Odraz od trendovej rezistencie': 'Bounce off trendline resistance',
    'Prerazenie trendovej rezistencie': 'Trendline resistance breakout', 'Prerazenie trendovej podpory': 'Trendline support breakdown',
    'Prerazenie úrovne nahor': 'Level breakout up', 'Prerazenie úrovne nadol': 'Level breakdown', 'Odraz od horizontálnej podpory': 'Bounce off horizontal support',
    'Odraz od horizontálnej rezistencie': 'Bounce off horizontal resistance', 'ako všetky': 'global', 'žiadne': 'none', 'trendová čiara · odraz': 'trendline · bounce',
    'trendová čiara · prerazenie': 'trendline · breakout', 'horizontálna úroveň · odraz': 'horizontal level · bounce', 'horizontálna úroveň · prerazenie': 'horizontal level · breakout',
    'Profil objemu': 'Volume profile', 'Prestať sledovať graf': 'Stop following the chart', 'Späť na môj graf': 'Back to my chart', 'Nákup': 'Buy', 'Neutrál': 'Neutral',
    'Umiestnenie prepínača plôch': 'Workspace switcher position', '🪟 Plávajúci (potiahni kamkoľvek)': '🪟 Floating (drag anywhere)', '▭ Karty hore nad grafom': '▭ Tabs above the chart',
    '▯ Karty v bočnom paneli vľavo': '▯ Tabs in a side panel (left)', 'Veľkosť': 'Size', 'Zobraziť názvy plôch': 'Show workspace names', 'Farebná téma': 'Colour theme', 'Nová plocha': 'New workspace',
    'Čistý graf (prázdne plátno, vlastné nastavenia)': 'Clean chart (empty canvas, own settings)', 'Nexus Lab (druhý grafový systém)': 'Nexus Lab (second chart system)',
    '◻ Čistý graf (prázdne plátno)': '◻ Clean chart (empty canvas)', '🧪 Nexus Lab – druhý grafový systém': '🧪 Nexus Lab – second chart system',
    'Prepínač plôch: veľkosť, farby, karty hore / v bočnom paneli…': 'Workspace switcher: size, colours, tabs on top / side panel…',
    'Auto trendové čiary · nastavenia': 'Auto trendlines · settings', 'Podpora': 'Support', 'Rezistencia': 'Resistance', 'S/R úrovne': 'S/R levels', 'Spoločné': 'Common',
    'Predĺžiť doľava': 'Extend left', 'Predĺžiť doprava': 'Extend right', 'Popisy': 'Labels', 'Ako tvoja kreslená čiara': 'Like your drawn line', '✎ Prevziať štýl mojej trendovej čiary': '✎ Use the style of my trendline',
    'Uložiť ako predvolené': 'Save as default', 'Predvolené': 'Defaults', 'Umiestnenie panelu': 'Panel position', '⬇ Pod grafom': '⬇ Below the chart', '⬆ Nad grafom (hore)': '⬆ Above the chart (top)',
    'Skryť značky obchodov (BUY / SELL / ✕)': 'Hide trade markers (BUY / SELL / ✕)', 'Zobraziť značky obchodov (BUY / SELL / ✕)': 'Show trade markers (BUY / SELL / ✕)',
    'Panel nad graf': 'Panel above the chart', 'Panel pod graf': 'Panel below the chart', 'Posunúť panel vyššie': 'Move panel up', 'Posunúť panel nižšie': 'Move panel down',
    'Druhý grafový systém: karty, skener objemových pohybov, učenie': 'Second chart system: tabs, volume move scanner, learning',
    'Štatistiky: čo sa stalo pri akej hodnote indikátorov': 'Statistics: what happened at which indicator values',
    'Len pevne usadené range (každá hrana 3+ dotyky, aspoň 25 sviečok)': 'Established ranges only (3+ touches on each edge, 25+ bars)',
    '🧪 Otvoriť Nexus Lab': '🧪 Open Nexus Lab', '↻ Obnoviť': '↻ Refresh',
    'Range a BOS': 'Range and BOS', 'Vidly (pitchfork)': 'Pitchfork', 'Dosah dozadu': 'Reach back', 'Krátky': 'Short', 'Stredný': 'Medium', 'Ďaleký (napr. 2h → týždeň)': 'Far (e.g. 2h → a week)',
    'Veľmi ďaleký': 'Very far', 'Aj hlavné čiary z veľkých swingov (dni – týždne)': 'Also major lines from big swings (days – weeks)', 'Ako hľadať range': 'Range detection',
    'Min. dĺžka (sviečok)': 'Min length (bars)', 'Max. výška (× ATR)': 'Max height (× ATR)', 'Min. dotykov každej hrany': 'Min tests of each edge', 'Koľko posledných range ukázať': 'Ranges to show',
    'Značka BOS pri prerazení': 'BOS label at the break', 'Stredná čiara (polovica range)': 'Mid line (range half)', 'Výplň': 'Fill', 'Predĺženie živého range doprava': 'Extend the live range right',
    'Farba range': 'Range colour', 'BOS nahor': 'BOS up', 'BOS nadol': 'BOS down', 'Typ': 'Type', 'Swingy (ZigZag × ATR)': 'Swings (ZigZag × ATR)', 'Počet vidiel': 'Number of pitchforks',
    'Polovičné čiary (medzi stredom a krajmi)': 'Half lines (between median and tines)', 'Dĺžka doprava (sviečok)': 'Length to the right (bars)', 'Farba – hore': 'Colour – up', 'Farba – dole': 'Colour – down',
    // volume layers
    'Profil objemu (VPVR)': 'Volume profile (VPVR)', 'Heatmapa objemu': 'Volume heatmap', 'Heatmapa knihy príkazov (naživo)': 'Order book heatmap (live)', 'Kupujúci': 'Buyers', 'Predávajúci': 'Sellers',
    'Počet riadkov': 'Rows', 'Riadkov': 'Rows', 'Šírka (% grafu)': 'Width (% of chart)', 'Strana (0 = vpravo, 1 = vľavo)': 'Side (0 = right, 1 = left)',
  };
  // phrases inside longer text (applied after an exact miss), longest first
  const PART = Object.entries({
    'Nastavenia': 'Settings', 'Indikátory': 'Indicators', 'indikátory': 'indicators', 'skryť': 'hide', 'Skryť': 'Hide', 'Zobraziť': 'Show', 'Otvoriť': 'Open',
    'Odstrániť': 'Remove', 'Zmazať': 'Delete', 'Predvolené': 'Default', 'nápady': 'ideas', 'Nápady': 'Ideas', 'čiary': 'lines', 'Čiary': 'Lines', 'objem': 'volume', 'Objem': 'Volume',
  }).sort((a, b) => b[0].length - a[0].length);
  const LEAD = /^([^A-Za-zÀ-žĽľ0-9]*)(.*?)([\s:…]*)$/s;
  let lang = 'sk', obs = null;
  const orig = new WeakMap();                  // text node → Slovak original, so switching back restores it
  function tr(s) {
    const m = LEAD.exec(s); if (!m || !m[2]) return s;
    const core = m[2].trim(), hit = EN[core] || EN[core.replace(/…$/, '')];
    if (hit) return s.replace(core, hit);
    if (core.length > 40) return s;
    let out = s; for (const [a, b] of PART) if (out.includes(a)) out = out.split(a).join(b);
    return out;
  }
  function node(n) {
    if (n.nodeType === 3) {
      const p = n.parentNode; if (!p || /^(SCRIPT|STYLE|TEXTAREA)$/.test(p.nodeName) || (p.closest && p.closest('.msg, .bd-area, .news-it, [contenteditable]'))) return;
      const t = n.nodeValue; if (!/[a-zA-Zá-ž]/.test(t)) return;
      if (lang === 'en') { const en = tr(t); if (en !== t) { orig.set(n, t); n.nodeValue = en; } }
      return;
    }
    if (n.nodeType !== 1) return;
    for (const a of ['title', 'placeholder']) {
      const v = n.getAttribute(a); if (!v) continue;
      const k = 'data-sk-' + a;
      if (lang === 'en') { const en = tr(v); if (en !== v) { n.setAttribute(k, v); n.setAttribute(a, en); } }
      else if (n.hasAttribute(k)) { n.setAttribute(a, n.getAttribute(k)); n.removeAttribute(k); }
    }
    for (const c of n.childNodes) node(c);
  }
  function restore(root) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) if (orig.has(n)) { n.nodeValue = orig.get(n); orig.delete(n); }
    node(root);
  }
  function set(l) {
    lang = l === 'en' ? 'en' : 'sk';
    document.documentElement.lang = lang;
    if (obs) { obs.disconnect(); obs = null; }
    if (lang === 'sk') { restore(document.body); return; }
    node(document.body);
    obs = new MutationObserver(list => {
      obs.disconnect();
      for (const r of list) { if (r.type === 'characterData') node(r.target); else r.addedNodes.forEach(node); if (r.type === 'attributes') node(r.target); }
      obs.observe(document.body, OPT);
    });
    obs.observe(document.body, OPT);
  }
  const OPT = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder'] };
  return { set, tr, get lang() { return lang; } };
})();
