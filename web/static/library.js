// Library: candlestick patterns, chart patterns, famous strategies and tips, with drawn illustrations.
// LIB.open() shows the full-page room; LIB.init({onPattern(key), onClose()}) connects it to the chart.
// Later the same entries (dir, pat, kind) can drive searching the chart and trade ideas.

const LIB = (() => {
  const { $, $$, esc, LS } = UI;
  const UP = '#089981', DN = '#f23645';

  // ---- candlestick patterns: bars are [open, high, low, close] on a 0–100 price scale -------------------
  // ctx: the trend before the pattern (drawn faded); pat: the detector in studies.js (button "Zobraziť v grafe")
  const CANDLES = [
    { id: 'doji', name: 'Doji', en: 'Doji', dir: 'neutral', kind: 'Nerozhodnosť', n: 1, rel: 1, pat: 'doji', bars: [[50, 64, 36, 50.4]],
      desc: 'Otvorenie a zatvorenie sú takmer rovnaké, telo je len tenká čiara. Kupujúci a predávajúci sú v rovnováhe – trh váha.',
      look: ['Telo je najviac asi 10 % rozpätia sviečky.', 'Knôty môžu byť rôzne dlhé.'],
      trade: ['Sám o sebe nie je signál na vstup.', 'Po silnom trende upozorňuje na únavu – sleduj ďalšiu sviečku.', 'Pri rezistencii / podpore posilňuje šancu na obrat.'],
      tips: ['Na nízkych timeframoch je doji veľmi časté a málo významné.', 'Silnejší je doji po dlhej sérii veľkých sviečok jedným smerom.'] },
    { id: 'longlegdoji', name: 'Dlhonohé doji', en: 'Long-legged doji', dir: 'neutral', kind: 'Nerozhodnosť', n: 1, rel: 1, bars: [[50, 82, 18, 50.4]],
      desc: 'Doji s veľmi dlhými knôtmi na oboch stranách. Cena sa počas sviečky silno hýbala hore aj dole, ale skončila tam, kde začala.',
      look: ['Malé telo v strede.', 'Horný aj dolný knôt sú dlhé.'],
      trade: ['Znamená veľkú neistotu – často pred väčším pohybom.', 'Vstupuj až po prerazení maxima (long) alebo minima (short) tejto sviečky.'],
      tips: ['Typické pred dôležitými správami alebo počas nich.'] },
    { id: 'dragonfly', name: 'Vážka (Dragonfly doji)', en: 'Dragonfly doji', dir: 'bull', kind: 'Obrat', n: 1, rel: 2, ctx: 'down', pat: 'dragonfly', bars: [[50, 51, 18, 50.4]],
      desc: 'Doji bez horného knôtu a s dlhým dolným knôtom. Predávajúci stlačili cenu nízko, ale kupujúci ju vrátili až na otvorenie.',
      look: ['Otvorenie, zatvorenie aj maximum sú takmer na rovnakej úrovni.', 'Dlhý dolný knôt (aspoň 60 % rozpätia).'],
      trade: ['Na podpore po poklese = možný býčí obrat.', 'Vstup nad maximum sviečky, stop loss pod minimum knôtu.'],
      tips: ['Čím dlhší dolný knôt, tým silnejšie odmietnutie nižších cien.'] },
    { id: 'gravestone', name: 'Náhrobok (Gravestone doji)', en: 'Gravestone doji', dir: 'bear', kind: 'Obrat', n: 1, rel: 2, ctx: 'up', pat: 'gravestone', bars: [[50, 82, 49, 50.4]],
      desc: 'Doji s dlhým horným knôtom a bez dolného. Kupujúci vytlačili cenu hore, ale predávajúci ju zrazili späť na otvorenie.',
      look: ['Otvorenie, zatvorenie aj minimum sú takmer rovnaké.', 'Dlhý horný knôt.'],
      trade: ['Na rezistencii po raste = možný medvedí obrat.', 'Vstup pod minimum sviečky, stop loss nad maximum knôtu.'],
      tips: ['Silnejší, ak ho nasleduje medvedia sviečka.'] },
    { id: 'fourprice', name: 'Doji štyroch cien', en: 'Four-price doji', dir: 'neutral', kind: 'Nerozhodnosť', n: 1, rel: 1, bars: [[50, 50.6, 49.4, 50]],
      desc: 'Otvorenie, maximum, minimum aj zatvorenie sú rovnaké – sviečka je len vodorovná čiarka. Takmer žiadne obchodovanie.',
      look: ['Iba vodorovná čiara.'],
      trade: ['Nie je to obchodný signál – znamená veľmi nízku likviditu (sviatky, noc, sekundové grafy).'],
      tips: ['Na sekundových grafoch zlata ich uvidíš často mimo hlavných seancií.'] },
    { id: 'hammer', name: 'Kladivo', en: 'Hammer', dir: 'bull', kind: 'Obrat', n: 1, rel: 2, ctx: 'down', pat: 'hammer', bars: [[40, 46, 16, 45]],
      desc: 'Malé telo hore a dlhý dolný knôt (aspoň 2× telo) po poklese. Trh skúšal nižšie ceny, no kupujúci ich odmietli.',
      look: ['Objavuje sa po klesajúcom trende.', 'Dolný knôt ≥ 2× telo, horný knôt takmer žiadny.', 'Farba tela nie je dôležitá (zelené je o niečo silnejšie).'],
      trade: ['Vstup long nad maximum kladiva alebo po potvrdzujúcej zelenej sviečke.', 'Stop loss pod minimum knôtu.', 'Cieľ: najbližšia rezistencia, alebo 2R.'],
      tips: ['Najlepšie funguje na podpore, okrúhlom čísle alebo spodnej hrane kanála.', 'To isté, ale po raste, je Obesenec (medvedí).'] },
    { id: 'invhammer', name: 'Obrátené kladivo', en: 'Inverted hammer', dir: 'bull', kind: 'Obrat', n: 1, rel: 1, ctx: 'down', pat: 'invhammer', bars: [[22, 48, 21, 27]],
      desc: 'Malé telo dole a dlhý horný knôt po poklese. Kupujúci sa prvýkrát pokúsili zatlačiť cenu hore.',
      look: ['Po klesajúcom trende.', 'Horný knôt ≥ 2× telo, dolný takmer žiadny.'],
      trade: ['Potrebuje potvrdenie – ďalšia sviečka by mala zavrieť vyššie.', 'Vstup nad maximum knôtu, stop pod minimum.'],
      tips: ['Slabší signál ako kladivo – bez potvrdenia ho neobchoduj.'] },
    { id: 'hanging', name: 'Obesenec', en: 'Hanging man', dir: 'bear', kind: 'Obrat', n: 1, rel: 1, ctx: 'up', pat: 'hanging', bars: [[78, 79, 52, 74]],
      desc: 'Vyzerá ako kladivo, ale objaví sa po raste. Dlhý dolný knôt ukazuje, že predávajúci už dokázali cenu výrazne stlačiť.',
      look: ['Po rastúcom trende.', 'Malé telo hore, dolný knôt ≥ 2× telo.'],
      trade: ['Potvrdenie: ďalšia sviečka zavrie pod telom obesenca.', 'Short pod minimum, stop nad maximum.'],
      tips: ['Bez potvrdenia je to často len pauza v trende.'] },
    { id: 'shooting', name: 'Padajúca hviezda', en: 'Shooting star', dir: 'bear', kind: 'Obrat', n: 1, rel: 2, ctx: 'up', pat: 'shooting', bars: [[56, 84, 51, 52]],
      desc: 'Malé telo dole a dlhý horný knôt po raste. Kupujúci vyhnali cenu vysoko, ale do zatvorenia o všetko prišli.',
      look: ['Po rastúcom trende, často s medzerou hore.', 'Horný knôt ≥ 2× telo, dolný takmer žiadny.'],
      trade: ['Short pod minimum sviečky, stop loss nad maximum knôtu.', 'Cieľ: najbližšia podpora.'],
      tips: ['Veľmi silná na rezistencii alebo po falošnom prerazení maxima (výmet likvidity).'] },
    { id: 'marubozubull', name: 'Býčie marubozu', en: 'Bullish marubozu', dir: 'bull', kind: 'Sila / pokračovanie', n: 1, rel: 2, pat: 'marubozubull', bars: [[20, 80, 19.5, 79.6]],
      desc: 'Veľká zelená sviečka bez knôtov. Kupujúci kontrolovali celú periódu od otvorenia po zatvorenie.',
      look: ['Telo ≥ 95 % rozpätia.', 'Otvorenie ≈ minimum, zatvorenie ≈ maximum.'],
      trade: ['V trende: pokračovanie. Pri prerazení rezistencie: potvrdenie breakoutu.', 'Pri vstupe počkaj na malý pullback do polovice sviečky.'],
      tips: ['Po dlhom raste môže znamenať vyčerpanie (posledný nákupný výbuch).'] },
    { id: 'marubozubear', name: 'Medvedie marubozu', en: 'Bearish marubozu', dir: 'bear', kind: 'Sila / pokračovanie', n: 1, rel: 2, pat: 'marubozubear', bars: [[80, 80.4, 20, 20.4]],
      desc: 'Veľká červená sviečka bez knôtov. Predávajúci mali úplnú kontrolu.',
      look: ['Telo ≥ 95 % rozpätia.', 'Otvorenie ≈ maximum, zatvorenie ≈ minimum.'],
      trade: ['V klesajúcom trende: pokračovanie. Pod podporou: potvrdenie prerazenia.'],
      tips: ['Polovica sviečky často slúži ako rezistencia pri návrate.'] },
    { id: 'spinning', name: 'Vlček', en: 'Spinning top', dir: 'neutral', kind: 'Nerozhodnosť', n: 1, rel: 1, pat: 'spinning', bars: [[47, 70, 30, 53]],
      desc: 'Malé telo v strede a knôty na oboch stranách. Ani jedna strana nevyhrala.',
      look: ['Telo 10–30 % rozpätia.', 'Oba knôty sú dlhšie ako telo.'],
      trade: ['Signál spomalenia trendu. Obchoduj až prerazenie jeho maxima / minima.'],
      tips: ['Séria vlčkov = konsolidácia, často pred silnejším pohybom.'] },
    { id: 'beltbull', name: 'Býčí pás (Belt hold)', en: 'Bullish belt hold', dir: 'bull', kind: 'Obrat', n: 1, rel: 1, ctx: 'down', bars: [[20, 58, 19.6, 55]],
      desc: 'Po poklese sa sviečka otvorí na svojom minime a silno rastie. Kupujúci prevzali kontrolu hneď od otvorenia.',
      look: ['Otvorenie = minimum (žiadny dolný knôt).', 'Dlhé zelené telo, malý horný knôt.'],
      trade: ['Long nad maximum, stop pod otvorením.'],
      tips: ['Silnejší, ak sa otvorí s medzerou dole a potom vymaže celý pokles.'] },
    { id: 'beltbear', name: 'Medvedí pás (Belt hold)', en: 'Bearish belt hold', dir: 'bear', kind: 'Obrat', n: 1, rel: 1, ctx: 'up', bars: [[80, 80.4, 42, 45]],
      desc: 'Po raste sa sviečka otvorí na svojom maxime a silno klesá.',
      look: ['Otvorenie = maximum (žiadny horný knôt).', 'Dlhé červené telo.'],
      trade: ['Short pod minimum, stop nad otvorením.'], tips: [] },

    { id: 'engulfbull', name: 'Býčie pohltenie', en: 'Bullish engulfing', dir: 'bull', kind: 'Obrat', n: 2, rel: 3, ctx: 'down', pat: 'engulfbull', bars: [[56, 58, 40, 42], [38, 64, 36, 62]],
      desc: 'Po poklese príde malá červená sviečka a za ňou veľká zelená, ktorej telo úplne pohltí telo predchádzajúcej. Kupujúci prebrali kontrolu.',
      look: ['Prvá sviečka červená, druhá zelená.', 'Telo druhej pokryje celé telo prvej (otvorí nižšie, zavrie vyššie).'],
      trade: ['Long po zatvorení druhej sviečky alebo na pullbacku do jej polovice.', 'Stop loss pod minimum formácie.', 'Cieľ: predchádzajúce maximum / rezistencia.'],
      tips: ['Jeden z najspoľahlivejších sviečkových vzorov – hlavne na podpore a na vyšších timeframoch (1h+).', 'Čím väčšia druhá sviečka oproti prvej, tým lepšie.', 'Na grafoch 24/7 (krypto) bez medzier stačí, aby telo pohltilo telo.'] },
    { id: 'engulfbear', name: 'Medvedie pohltenie', en: 'Bearish engulfing', dir: 'bear', kind: 'Obrat', n: 2, rel: 3, ctx: 'up', pat: 'engulfbear', bars: [[44, 60, 42, 58], [62, 64, 36, 38]],
      desc: 'Po raste malá zelená sviečka, za ňou veľká červená, ktorej telo pohltí celé telo predchádzajúcej.',
      look: ['Prvá zelená, druhá červená.', 'Telo druhej je väčšie a pokryje telo prvej.'],
      trade: ['Short po zatvorení, stop nad maximum formácie.', 'Cieľ: najbližšia podpora.'],
      tips: ['Na rezistencii alebo po výmete nad predchádzajúce maximum je veľmi silné.'] },
    { id: 'haramibull', name: 'Býčie harami', en: 'Bullish harami', dir: 'bull', kind: 'Obrat', n: 2, rel: 1, ctx: 'down', pat: 'haramibull', bars: [[72, 73, 30, 32], [42, 54, 40, 52]],
      desc: '„Harami" je po japonsky tehotná. Po veľkej červenej sviečke príde malá zelená, celá vnútri jej tela. Predaj stráca silu.',
      look: ['Veľká červená sviečka.', 'Malá zelená sviečka vnútri jej tela.'],
      trade: ['Potrebuje potvrdenie: zatvorenie nad maximum druhej sviečky.', 'Stop pod minimum prvej sviečky.'],
      tips: ['Je to vlastne „inside bar" – trh sa zastavil a rozhoduje sa.'] },
    { id: 'haramibear', name: 'Medvedie harami', en: 'Bearish harami', dir: 'bear', kind: 'Obrat', n: 2, rel: 1, ctx: 'up', pat: 'haramibear', bars: [[28, 72, 27, 70], [60, 62, 46, 48]],
      desc: 'Po veľkej zelenej sviečke príde malá červená vnútri jej tela. Nákupy slabnú.',
      look: ['Veľká zelená sviečka.', 'Malá červená vnútri jej tela.'],
      trade: ['Short po zatvorení pod minimum druhej sviečky, stop nad maximum prvej.'], tips: [] },
    { id: 'haramicross', name: 'Harami kríž', en: 'Harami cross', dir: 'bull', kind: 'Obrat', n: 2, rel: 2, ctx: 'down', bars: [[72, 73, 30, 32], [50, 56, 44, 50.4]],
      desc: 'Harami, kde druhá sviečka je doji. Ešte väčšia nerozhodnosť po silnom pohybe – silnejší signál ako obyčajné harami.',
      look: ['Veľká sviečka, za ňou doji vnútri jej tela.'],
      trade: ['Obchoduj smer prerazenia doji; proti predchádzajúcemu trendu je pravdepodobnejší obrat.'],
      tips: ['Existuje býčia (po poklese) aj medvedia (po raste) verzia.'] },
    { id: 'piercing', name: 'Prenikajúca línia', en: 'Piercing line', dir: 'bull', kind: 'Obrat', n: 2, rel: 2, ctx: 'down', pat: 'piercing', bars: [[72, 73, 40, 42], [36, 64, 34, 61]],
      desc: 'Po veľkej červenej sviečke sa ďalšia otvorí ešte nižšie, ale zavrie nad polovicou tela červenej. Kupujúci prenikli do územia predávajúcich.',
      look: ['Druhá sviečka sa otvorí pod minimom / zatvorením prvej.', 'Zatvorí nad 50 % tela prvej (ale nie nad jej otvorením – to by bolo pohltenie).'],
      trade: ['Long nad maximum druhej sviečky, stop pod minimum formácie.'],
      tips: ['Čím vyššie nad polovicu zatvorí, tým silnejší signál.'] },
    { id: 'darkcloud', name: 'Zatiahnutá obloha (Dark cloud cover)', en: 'Dark cloud cover', dir: 'bear', kind: 'Obrat', n: 2, rel: 2, ctx: 'up', pat: 'darkcloud', bars: [[30, 62, 29, 60], [65, 67, 40, 42]],
      desc: 'Po veľkej zelenej sviečke sa ďalšia otvorí vyššie, no zavrie pod polovicou tela zelenej. Mraky nad rastom.',
      look: ['Otvorenie nad maximom / zatvorením prvej.', 'Zatvorenie pod 50 % tela prvej.'],
      trade: ['Short pod minimum druhej sviečky, stop nad maximum.'], tips: ['Zrkadlo prenikajúcej línie.'] },
    { id: 'tweezerbottom', name: 'Pinzeta – dno', en: 'Tweezer bottom', dir: 'bull', kind: 'Obrat', n: 2, rel: 2, ctx: 'down', pat: 'tweezerbottom', bars: [[56, 57, 30, 36], [36, 52, 30.2, 50]],
      desc: 'Dve sviečky s rovnakým minimom. Cena dvakrát narazila na tú istú úroveň a neprerazila ju – vznikla krátkodobá podpora.',
      look: ['Po poklese.', 'Minimá oboch sviečok sú takmer rovnaké; prvá červená, druhá zelená.'],
      trade: ['Long nad maximum druhej sviečky, stop tesne pod spoločné minimum.'],
      tips: ['Na vyššom timeframe je to malé dvojité dno.'] },
    { id: 'tweezertop', name: 'Pinzeta – vrchol', en: 'Tweezer top', dir: 'bear', kind: 'Obrat', n: 2, rel: 2, ctx: 'up', pat: 'tweezertop', bars: [[44, 70, 43, 64], [64, 69.8, 48, 50]],
      desc: 'Dve sviečky s rovnakým maximom po raste. Úroveň dvakrát odolala.',
      look: ['Maximá oboch sviečok sú takmer rovnaké; prvá zelená, druhá červená.'],
      trade: ['Short pod minimum druhej sviečky, stop nad spoločné maximum.'], tips: [] },
    { id: 'kickerbull', name: 'Býčí kopanec (Kicker)', en: 'Bullish kicker', dir: 'bull', kind: 'Obrat', n: 2, rel: 3, ctx: 'down', bars: [[60, 62, 40, 42], [64, 90, 63, 88]],
      desc: 'Červená sviečka, za ňou zelená, ktorá sa otvorí s medzerou NAD otvorením červenej a pokračuje hore. Náhla zmena nálady – často po správach.',
      look: ['Prvá červená, druhá zelená.', 'Druhá sa otvorí nad otvorením prvej (medzera), knôty sa neprekrývajú.'],
      trade: ['Long na pullbacku k medzere, stop pod medzerou.'],
      tips: ['Patrí medzi najsilnejšie vzory, ale na forexe / zlate s nepretržitým obchodovaním je zriedkavý (medzery hlavne po víkende).'] },
    { id: 'kickerbear', name: 'Medvedí kopanec (Kicker)', en: 'Bearish kicker', dir: 'bear', kind: 'Obrat', n: 2, rel: 3, ctx: 'up', bars: [[40, 60, 38, 58], [36, 37, 10, 12]],
      desc: 'Zelená sviečka a za ňou červená, ktorá sa otvorí s medzerou POD otvorením zelenej a padá.',
      look: ['Medzera dole medzi sviečkami, žiadne prekrytie.'], trade: ['Short na návrate k medzere, stop nad ňou.'], tips: [] },
    { id: 'matchinglow', name: 'Rovnaké minimá (Matching low)', en: 'Matching low', dir: 'bull', kind: 'Obrat', n: 2, rel: 1, ctx: 'down', bars: [[62, 63, 34, 35], [48, 50, 33, 35.2]],
      desc: 'Dve červené sviečky s rovnakým zatvorením po poklese. Predávajúci nedokázali stlačiť zatvorenie nižšie.',
      look: ['Dve červené sviečky, zatvorenia na rovnakej cene.'], trade: ['Potvrdenie: zelená sviečka nad maximum druhej.'], tips: [] },
    { id: 'separatingbull', name: 'Oddeľujúce línie (býčie)', en: 'Bullish separating lines', dir: 'bull', kind: 'Pokračovanie', n: 2, rel: 1, ctx: 'up', bars: [[60, 61, 48, 50], [60, 80, 59.6, 78]],
      desc: 'V rastovom trende príde červená sviečka (korekcia), no ďalšia zelená sa otvorí na jej otvorení a pokračuje hore. Trend pokračuje.',
      look: ['Rastúci trend.', 'Červená a zelená sviečka s rovnakým otvorením.'], trade: ['Long po zatvorení zelenej, stop pod jej minimum.'], tips: [] },
    { id: 'onneck', name: 'Na krku (On-neck)', en: 'On-neck', dir: 'bear', kind: 'Pokračovanie', n: 2, rel: 1, ctx: 'down', bars: [[72, 73, 40, 42], [36, 43, 34, 42.2]],
      desc: 'V poklese po veľkej červenej sviečke príde malá zelená, ktorá sa otvorí nižšie a zavrie len na úrovni minima / zatvorenia červenej. Pokus o odraz bol slabý.',
      look: ['Druhá sviečka zavrie na zatvorení prvej, nie vyššie.'], trade: ['Short pod minimum druhej sviečky – pokračovanie poklesu.'], tips: [] },

    { id: 'morning', name: 'Ranná hviezda', en: 'Morning star', dir: 'bull', kind: 'Obrat', n: 3, rel: 3, ctx: 'down', pat: 'morning', bars: [[76, 77, 45, 47], [41, 45, 34, 38], [42, 70, 41, 68]],
      desc: 'Veľká červená sviečka, malá sviečka (hviezda) nižšie a veľká zelená, ktorá zavrie hlboko v tele prvej. Noc končí, prichádza ráno.',
      look: ['1. veľká červená.', '2. malé telo (ľubovoľná farba), ideálne s medzerou dole.', '3. veľká zelená, zatvorí nad polovicou prvej.'],
      trade: ['Long po zatvorení tretej sviečky.', 'Stop loss pod minimum hviezdy.', 'Cieľ: začiatok poklesu (otvorenie prvej sviečky) alebo rezistencia.'],
      tips: ['Patrí k najspoľahlivejším obratovým vzorom.', 'Ak je hviezda doji, volá sa Ranná doji hviezda – ešte silnejšia.'] },
    { id: 'evening', name: 'Večerná hviezda', en: 'Evening star', dir: 'bear', kind: 'Obrat', n: 3, rel: 3, ctx: 'up', pat: 'evening', bars: [[24, 55, 23, 53], [59, 66, 56, 62], [58, 59, 30, 32]],
      desc: 'Veľká zelená, malá hviezda vyššie a veľká červená, ktorá zavrie hlboko v tele zelenej. Deň končí.',
      look: ['1. veľká zelená.', '2. malé telo nad ňou.', '3. veľká červená, zatvorí pod polovicou prvej.'],
      trade: ['Short po zatvorení tretej, stop nad maximum hviezdy.'], tips: ['Na dennom grafe zlata pri historických maximách často označila lokálne vrcholy.'] },
    { id: 'morningdoji', name: 'Ranná doji hviezda', en: 'Morning doji star', dir: 'bull', kind: 'Obrat', n: 3, rel: 3, ctx: 'down', bars: [[76, 77, 45, 47], [39, 44, 34, 39.3], [42, 70, 41, 68]],
      desc: 'Ranná hviezda, kde prostredná sviečka je doji. Úplná nerozhodnosť na dne a potom jasná výhra kupujúcich.',
      look: ['Prostredná sviečka je doji.'], trade: ['Ako ranná hviezda – long po tretej sviečke, stop pod doji.'], tips: [] },
    { id: 'eveningdoji', name: 'Večerná doji hviezda', en: 'Evening doji star', dir: 'bear', kind: 'Obrat', n: 3, rel: 3, ctx: 'up', bars: [[24, 55, 23, 53], [61, 66, 56, 61.3], [58, 59, 30, 32]],
      desc: 'Večerná hviezda s doji v strede.', look: ['Prostredná sviečka je doji nad prvou.'], trade: ['Short po tretej sviečke, stop nad doji.'], tips: [] },
    { id: 'soldiers', name: 'Traja bieli vojaci', en: 'Three white soldiers', dir: 'bull', kind: 'Obrat / sila', n: 3, rel: 3, ctx: 'down', pat: 'soldiers', bars: [[20, 37, 19, 35], [33, 52, 32, 50], [48, 67, 47, 65]],
      desc: 'Tri veľké zelené sviečky za sebou, každá sa otvorí v tele predchádzajúcej a zavrie vyššie. Kupujúci postupujú krok za krokom.',
      look: ['Tri zelené sviečky s veľkými telami a malými knôtmi.', 'Každé zatvorenie vyššie, otvorenie v tele predchádzajúcej.'],
      trade: ['Po poklese = obrat. Vstupuj radšej na pullbacku – po troch sviečkach býva cena natiahnutá.', 'Stop pod minimum druhej sviečky.'],
      tips: ['Ak sa sviečky zmenšujú a rastú horné knôty, ide o „Odpor dopredu" (Advance block) – sila slabne.'] },
    { id: 'crows', name: 'Tri čierne vrany', en: 'Three black crows', dir: 'bear', kind: 'Obrat / sila', n: 3, rel: 3, ctx: 'up', pat: 'crows', bars: [[80, 81, 63, 65], [67, 68, 48, 50], [52, 53, 33, 35]],
      desc: 'Tri veľké červené sviečky za sebou, každá zavrie nižšie. Silný nástup predávajúcich.',
      look: ['Tri červené sviečky s veľkými telami.', 'Každá sa otvorí v tele predchádzajúcej a zavrie blízko minima.'],
      trade: ['Short na návrate k telu druhej / tretej sviečky, stop nad maximum druhej.'], tips: [] },
    { id: 'threeinsideup', name: 'Tri vnútri hore', en: 'Three inside up', dir: 'bull', kind: 'Obrat', n: 3, rel: 2, ctx: 'down', bars: [[70, 71, 35, 37], [42, 55, 40, 53], [53, 74, 51, 72]],
      desc: 'Býčie harami, ktoré potvrdí tretia zelená sviečka zatvorením nad otvorením prvej.',
      look: ['1. veľká červená, 2. malá zelená vnútri, 3. zelená zatvorí nad prvou.'], trade: ['Long po tretej sviečke, stop pod minimum prvej.'], tips: ['Potvrdená verzia harami – spoľahlivejšia.'] },
    { id: 'threeinsidedown', name: 'Tri vnútri dole', en: 'Three inside down', dir: 'bear', kind: 'Obrat', n: 3, rel: 2, ctx: 'up', bars: [[30, 65, 29, 63], [58, 60, 45, 47], [47, 49, 26, 28]],
      desc: 'Medvedie harami potvrdené treťou červenou sviečkou pod otvorením prvej.', look: ['1. veľká zelená, 2. malá červená vnútri, 3. červená zatvorí pod prvou.'],
      trade: ['Short po tretej sviečke, stop nad maximum prvej.'], tips: [] },
    { id: 'threeoutsideup', name: 'Tri von hore', en: 'Three outside up', dir: 'bull', kind: 'Obrat', n: 3, rel: 3, ctx: 'down', bars: [[56, 58, 40, 42], [38, 63, 36, 61], [61, 76, 59, 74]],
      desc: 'Býčie pohltenie a za ním ďalšia zelená sviečka s vyšším zatvorením. Potvrdené pohltenie.',
      look: ['1–2 = býčie pohltenie, 3. zelená zatvorí vyššie.'], trade: ['Long po tretej sviečke alebo na pullbacku, stop pod minimum formácie.'], tips: [] },
    { id: 'threeoutsidedown', name: 'Tri von dole', en: 'Three outside down', dir: 'bear', kind: 'Obrat', n: 3, rel: 3, ctx: 'up', bars: [[44, 60, 42, 58], [62, 64, 37, 39], [39, 41, 24, 26]],
      desc: 'Medvedie pohltenie potvrdené treťou červenou sviečkou.', look: ['1–2 = medvedie pohltenie, 3. červená zatvorí nižšie.'], trade: ['Short, stop nad maximum formácie.'], tips: [] },
    { id: 'babybull', name: 'Opustené dieťa (býčie)', en: 'Bullish abandoned baby', dir: 'bull', kind: 'Obrat', n: 3, rel: 3, ctx: 'down', bars: [[76, 77, 46, 48], [39, 41, 35, 39.3], [45, 72, 44, 70]],
      desc: 'Doji osamotené medzerami na oboch stranách – pod predchádzajúcou aj nasledujúcou sviečkou. Veľmi silný, ale vzácny obrat.',
      look: ['Celé doji (aj knôty) je pod minimom 1. aj 3. sviečky.'], trade: ['Long po tretej sviečke, stop pod doji.'],
      tips: ['Na trhoch obchodovaných nonstop vzniká hlavne cez víkendové medzery.'] },
    { id: 'babybear', name: 'Opustené dieťa (medvedie)', en: 'Bearish abandoned baby', dir: 'bear', kind: 'Obrat', n: 3, rel: 3, ctx: 'up', bars: [[24, 54, 23, 52], [61, 65, 59, 61.3], [55, 56, 28, 30]],
      desc: 'Doji osamotené medzerami nad predchádzajúcou aj nasledujúcou sviečkou.', look: ['Celé doji je nad maximom 1. aj 3. sviečky.'], trade: ['Short po tretej sviečke, stop nad doji.'], tips: [] },
    { id: 'twocrows', name: 'Dve vrany s medzerou', en: 'Upside gap two crows', dir: 'bear', kind: 'Obrat', n: 3, rel: 1, ctx: 'up', bars: [[30, 60, 29, 58], [66, 68, 62, 63], [69, 70, 59, 60]],
      desc: 'Po veľkej zelenej sviečke dve červené nad ňou; druhá pohltí prvú, ale stále zavrie nad zelenou. Rast ochabuje.',
      look: ['Medzera hore, dve červené sviečky, druhá väčšia.'], trade: ['Short až po prerazení minima tretej sviečky.'], tips: [] },
    { id: 'sandwich', name: 'Sendvič (Stick sandwich)', en: 'Stick sandwich', dir: 'bull', kind: 'Obrat', n: 3, rel: 1, ctx: 'down', bars: [[62, 63, 40, 42], [45, 62, 44, 60], [62, 63, 41, 42.2]],
      desc: 'Dve červené sviečky s rovnakým zatvorením a medzi nimi zelená. Rovnaké zatvorenie tvorí podporu.',
      look: ['Červená – zelená – červená, zatvorenia červených na rovnakej cene.'], trade: ['Long nad maximum zelenej, stop pod spoločné zatvorenie.'], tips: [] },
    { id: 'risingthree', name: 'Rastúce tri metódy', en: 'Rising three methods', dir: 'bull', kind: 'Pokračovanie', n: 5, rel: 2, ctx: 'up', bars: [[20, 53, 19, 51], [48, 50, 43, 45], [45, 47, 39, 41], [41, 46, 37, 43], [43, 74, 42, 72]],
      desc: 'Veľká zelená, tri malé korekčné sviečky vnútri jej rozpätia a znova veľká zelená s novým maximom. Krátky oddych v rastúcom trende.',
      look: ['1. veľká zelená.', '2–4. malé sviečky (hlavne červené) v rozpätí prvej.', '5. veľká zelená zatvorí nad maximom prvej.'],
      trade: ['Long po piatej sviečke, stop pod minimum korekcie.'], tips: ['Je to malá býčia vlajka zložená zo sviečok.'] },
    { id: 'fallingthree', name: 'Klesajúce tri metódy', en: 'Falling three methods', dir: 'bear', kind: 'Pokračovanie', n: 5, rel: 2, ctx: 'down', bars: [[80, 81, 47, 49], [52, 57, 50, 55], [55, 61, 53, 59], [59, 63, 54, 57], [57, 58, 26, 28]],
      desc: 'Veľká červená, tri malé korekčné sviečky v jej rozpätí a znova veľká červená s novým minimom.',
      look: ['1. a 5. veľké červené, 2–4. malé sviečky v rozpätí prvej.'], trade: ['Short po piatej sviečke, stop nad maximum korekcie.'], tips: [] },
    { id: 'tasukiup', name: 'Tasuki medzera hore', en: 'Upside tasuki gap', dir: 'bull', kind: 'Pokračovanie', n: 3, rel: 1, ctx: 'up', bars: [[30, 51, 29, 49], [54, 71, 53, 69], [66, 67, 55, 57]],
      desc: 'Dve zelené sviečky s medzerou medzi nimi a tretia červená, ktorá medzeru čiastočne zaplní, ale nezavrie. Trend pokračuje.',
      look: ['Medzera hore medzi 1. a 2. sviečkou.', '3. červená sa otvorí v tele druhej a zavrie v medzere.'], trade: ['Long, stop pod spodnú hranu medzery.'], tips: ['Ak sa medzera úplne zavrie, signál neplatí.'] },
  ];

  // ---- chart patterns: price path pts [x, y] (0–100), lines [x1, y1, x2, y2, kind], labels [x, y, text] ---------
  // line kinds: neck (krk), sup (podpora), res (rezistencia), tgt (cieľ), aux (pomocná)
  const flipY = (p, extra) => ({ ...p, pts: p.pts.map(([x, y]) => [x, 100 - y]), lines: (p.lines || []).map(([a, b, c, d, k]) => [a, 100 - b, c, 100 - d, k === 'sup' ? 'res' : k === 'res' ? 'sup' : k]),
    labels: (p.labels || []).map(([x, y, t]) => [x, 100 - y, t]), ...extra });
  const cup = (x0, x1, top, bottom, step = 4) => { const out = []; for (let x = x0; x <= x1; x += step) out.push([x, top - (top - bottom) * Math.sin(Math.PI * (x - x0) / (x1 - x0))]); return out; };

  const HS = { id: 'hs', name: 'Hlava a ramená', en: 'Head and shoulders', dir: 'bear', kind: 'Obrat', rel: 3,
    pts: [[0, 22], [10, 40], [18, 60], [28, 43], [42, 80], [56, 44], [68, 60], [80, 45], [88, 36], [100, 12]],
    lines: [[8, 42.3, 100, 45.6, 'neck'], [84, 45, 84, 9, 'tgt']], labels: [[18, 66, 'Ľ. rameno'], [42, 86, 'Hlava'], [68, 66, 'P. rameno'], [22, 37, 'Krk'], [91, 26, 'cieľ']],
    desc: 'Najznámejšia obratová formácia. Po raste vzniknú tri vrcholy – prostredný (hlava) najvyšší, dva bočné (ramená) nižšie a približne rovnaké. Spojnica dvoch dien medzi nimi je „krk" (neckline).',
    look: ['Rastúci trend pred formáciou.', 'Ľavé rameno → vyššia hlava → pravé rameno nižšie ako hlava.', 'Objem býva najvyšší pri ľavom ramene a slabne pri pravom.', 'Krk môže byť vodorovný alebo mierne šikmý.'],
    trade: ['Vstup short pri zatvorení pod krkom, alebo konzervatívne na retest krku zospodu.', 'Stop loss nad pravé rameno.', 'Cieľ = výška hlavy nad krkom, odmeraná od prerazenia dole.'],
    tips: ['Kým krk nie je prerazený, formácia nie je hotová – veľa „hláv a ramien" sa nikdy nedokončí.', 'Šikmo klesajúci krk = slabší trh, silnejší signál.', 'Ak cena po prerazení rýchlo vystúpi späť nad krk, je to silný signál opačným smerom.'] };
  const DT = { id: 'doubletop', name: 'Dvojitý vrchol (M)', en: 'Double top', dir: 'bear', kind: 'Obrat', rel: 3,
    pts: [[0, 18], [22, 72], [37, 47], [52, 72], [66, 47], [78, 34], [92, 20]], lines: [[30, 47, 100, 47, 'neck'], [70, 47, 70, 22, 'tgt'], [14, 72, 60, 72, 'res']],
    labels: [[22, 78, 'Vrchol 1'], [52, 78, 'Vrchol 2'], [37, 41, 'Krk'], [76, 26, 'cieľ']],
    desc: 'Cena dvakrát narazí na rovnakú rezistenciu a nedokáže ju prekonať. Tvar písmena M.',
    look: ['Dva vrcholy na približne rovnakej cene (rozdiel do ~3 %).', 'Medzi nimi zreteľný pokles (dno = krk).', 'Druhý vrchol často so slabším objemom alebo divergenciou RSI.'],
    trade: ['Short pri zatvorení pod krkom (dnom medzi vrcholmi).', 'Stop nad druhý vrchol.', 'Cieľ = výška formácie od krku dole.'],
    tips: ['Ak druhý vrchol mierne prerazí prvý a vráti sa (výmet likvidity), signál je ešte silnejší.', 'Agresívny vstup: odmietnutie na druhom vrchole (padajúca hviezda, medvedie pohltenie).'] };
  const TT = { id: 'tripletop', name: 'Trojitý vrchol', en: 'Triple top', dir: 'bear', kind: 'Obrat', rel: 2,
    pts: [[0, 18], [16, 70], [28, 48], [42, 70], [54, 48], [68, 70], [80, 48], [90, 32], [100, 22]], lines: [[22, 48, 100, 48, 'neck'], [10, 70, 74, 70, 'res']],
    labels: [[16, 76, '1'], [42, 76, '2'], [68, 76, '3'], [30, 42, 'Krk']],
    desc: 'Tri neúspešné pokusy o prerazenie rovnakej rezistencie. Ako dvojitý vrchol, len s ďalším testom.',
    look: ['Tri vrcholy na podobnej úrovni, dve dna medzi nimi na podobnej úrovni.'], trade: ['Short pod krkom, stop nad vrcholmi, cieľ = výška formácie.'],
    tips: ['Čím viac testov, tým je úroveň slabšia – štvrtý test už často prerazí. Preto počkaj na prerazenie krku.'] };
  const ASC = { id: 'asctri', name: 'Rastúci trojuholník', en: 'Ascending triangle', dir: 'bull', kind: 'Pokračovanie / prerazenie', rel: 3,
    pts: [[0, 28], [12, 70], [24, 40], [36, 70], [48, 50], [60, 70], [70, 58], [78, 70], [86, 76], [96, 92]], lines: [[6, 70, 90, 70, 'res'], [0, 28, 80, 62, 'sup'], [88, 70, 88, 98, 'tgt']],
    labels: [[40, 76, 'vodorovná rezistencia'], [30, 33, 'stúpajúce minimá'], [93, 84, 'cieľ']],
    desc: 'Vodorovná rezistencia a čoraz vyššie minimá. Kupujúci sú stále netrpezlivejší, až rezistenciu prerazia.',
    look: ['Aspoň 2 dotyky rezistencie a 2 stúpajúce minimá.', 'Objem počas formácie klesá, pri prerazení stúpne.'],
    trade: ['Long pri zatvorení nad rezistenciou alebo na retest zhora.', 'Stop pod posledné minimum.', 'Cieľ = výška najširšej časti trojuholníka.'],
    tips: ['Prerazenie býva najsilnejšie v 2/3 až 3/4 dĺžky trojuholníka.', 'Ak cena prerazí spodnú čiaru, formácia zlyhala – môže nasledovať prudký pokles.'] };
  const SYM = { id: 'symtri', name: 'Symetrický trojuholník', en: 'Symmetrical triangle', dir: 'neutral', kind: 'Pokračovanie / prerazenie', rel: 2,
    pts: [[0, 86], [12, 24], [26, 74], [40, 36], [54, 64], [66, 44], [76, 57], [84, 50], [92, 66], [100, 82]], lines: [[0, 88, 88, 54, 'res'], [12, 24, 88, 52, 'sup']],
    labels: [[30, 82, 'klesajúce maximá'], [44, 28, 'stúpajúce minimá']],
    desc: 'Klesajúce maximá a stúpajúce minimá sa zbiehajú do špičky. Volatilita sa sťahuje pred výbuchom.',
    look: ['Aspoň 2 + 2 dotyky.', 'Volatilita a objem klesajú.'],
    trade: ['Obchoduj smer prerazenia (častejšie v smere predchádzajúceho trendu).', 'Stop za opačnú stranu trojuholníka.', 'Cieľ = výška začiatku trojuholníka.'],
    tips: ['Prerazenie tesne pri špičke býva slabé.', 'Pozor na falošné prerazenie – čakaj na zatvorenie sviečky mimo.'] };
  const FLAG = { id: 'bullflag', name: 'Býčia vlajka', en: 'Bull flag', dir: 'bull', kind: 'Pokračovanie', rel: 3,
    pts: [[0, 18], [22, 72], [30, 63], [37, 69], [45, 59], [52, 65], [60, 55], [67, 61], [78, 80], [92, 96]], lines: [[22, 73, 70, 61, 'res'], [27, 64, 66, 54, 'sup'], [72, 62, 72, 100, 'tgt']],
    labels: [[8, 50, 'žrď'], [46, 76, 'vlajka'], [80, 98, 'cieľ = žrď']],
    desc: 'Prudký rast (žrď) a za ním krátka, mierne klesajúca konsolidácia v kanáli (vlajka). Trh si oddýchne a pokračuje.',
    look: ['Silný, takmer kolmý rast.', 'Korekcia v úzkom kanáli proti trendu, ideálne do 38–50 % žrde.', 'Objem v korekcii klesá.'],
    trade: ['Long pri prerazení hornej hrany vlajky.', 'Stop pod spodnú hranu vlajky.', 'Cieľ = dĺžka žrde od miesta prerazenia.'],
    tips: ['Jedna z najspoľahlivejších pokračovacích formácií.', 'Ak korekcia zájde hlbšie ako 50 % žrde, už to nie je vlajka.'] };
  const PEN = { id: 'bullpennant', name: 'Býčia vlajočka (Pennant)', en: 'Bull pennant', dir: 'bull', kind: 'Pokračovanie', rel: 2,
    pts: [[0, 18], [22, 74], [30, 60], [37, 70], [44, 63], [50, 68], [56, 65], [64, 80], [80, 96]], lines: [[22, 75, 60, 66, 'res'], [30, 60, 60, 65.5, 'sup']],
    labels: [[8, 50, 'žrď'], [42, 80, 'vlajočka']],
    desc: 'Ako vlajka, ale konsolidácia má tvar malého symetrického trojuholníka.', look: ['Silná žrď.', 'Krátky zbiehajúci sa trojuholník.'],
    trade: ['Long pri prerazení hore, stop pod vlajočku, cieľ = dĺžka žrde.'], tips: ['Vlajočka by mala byť krátka – ak trvá dlho, stáva sa z nej obyčajný trojuholník.'] };
  const FW = { id: 'fallingwedge', name: 'Klesajúci klin', en: 'Falling wedge', dir: 'bull', kind: 'Obrat / pokračovanie', rel: 3,
    pts: [[0, 90], [10, 60], [20, 78], [32, 45], [42, 62], [54, 35], [62, 48], [72, 30], [78, 40], [86, 60], [96, 80]], lines: [[0, 91, 80, 37, 'res'], [10, 60, 78, 27, 'sup']],
    labels: [[40, 72, 'zbiehavé čiary'], [86, 68, 'prerazenie']],
    desc: 'Obe čiary klesajú, ale zbiehajú sa – minimá klesajú stále pomalšie. Predávajúci strácajú silu.',
    look: ['Klesajúce maximá aj minimá, horná čiara strmšia ako dolná.', 'Aspoň 3 dotyky na každej strane je ideál.'],
    trade: ['Long pri prerazení hornej čiary.', 'Stop pod posledné minimum.', 'Cieľ = začiatok klinu (najvyššie maximum).'],
    tips: ['Často s býčou divergenciou RSI.', 'Funguje ako obrat po poklese aj ako korekcia v rastúcom trende.'] };
  const CUP = { id: 'cup', name: 'Hrnček s uškom', en: 'Cup and handle', dir: 'bull', kind: 'Pokračovanie', rel: 3,
    pts: [[0, 50], ...cup(6, 62, 72, 30), [68, 64], [74, 67], [80, 61], [86, 73], [96, 92]], lines: [[6, 72, 90, 72, 'res'], [88, 72, 88, 100, 'tgt']],
    labels: [[34, 24, 'hrnček (oblé dno)'], [76, 56, 'uško'], [92, 98, 'cieľ']],
    desc: 'Zaoblená korekcia v tvare U (hrnček) a malá konsolidácia pri jeho okraji (uško). Popularizoval ju William O\'Neil.',
    look: ['Oblé, nie ostré dno.', 'Okraje hrnčeka na podobnej úrovni.', 'Uško je krátke a plytké (horná tretina hrnčeka).'],
    trade: ['Long pri prerazení maxima uška / okraja hrnčeka.', 'Stop pod minimum uška.', 'Cieľ = hĺbka hrnčeka od prerazenia.'],
    tips: ['Ostré V namiesto U je slabšie.', 'Uško hlbšie ako polovica hrnčeka = varovanie.'] };
  const RB = { id: 'roundbottom', name: 'Zaoblené dno (Tanierik)', en: 'Rounding bottom', dir: 'bull', kind: 'Obrat', rel: 2,
    pts: [[0, 82], ...Array.from({ length: 19 }, (_, i) => { const x = 5 + i * 5; return [x, 25 + 55 * ((x - 50) / 45) ** 2]; })], lines: [[5, 78, 100, 78, 'res']],
    labels: [[50, 18, 'pomalý prechod z poklesu do rastu']],
    desc: 'Pomalý, plynulý prechod z klesajúceho trendu do rastúceho. Predávajúci postupne miznú a kupujúci pomaly preberajú kontrolu.',
    look: ['Tvar U, trvá dlhšie (týždne až mesiace na dennom grafe).', 'Objem často kopíruje tvar – na dne najmenší.'],
    trade: ['Long pri prerazení úrovne, kde pokles začal, alebo na retest.'], tips: ['Častejšie na vyšších timeframoch.'] };
  const RECT = { id: 'rectangle', name: 'Obdĺžnik (Range)', en: 'Rectangle', dir: 'neutral', kind: 'Pokračovanie / prerazenie', rel: 2,
    pts: [[0, 10], [10, 70], [22, 36], [34, 70], [46, 36], [58, 70], [70, 36], [82, 70], [90, 82], [100, 94]], lines: [[6, 70, 92, 70, 'res'], [16, 36, 92, 36, 'sup']],
    labels: [[45, 76, 'rezistencia'], [45, 30, 'podpora']],
    desc: 'Cena sa odráža medzi vodorovnou podporou a rezistenciou. Rovnováha, ktorá skončí prerazením.',
    look: ['Aspoň 2 dotyky hore aj dole.', 'Hranice sú približne vodorovné.'],
    trade: ['V obdĺžniku: kupuj pri podpore, predávaj pri rezistencii (stop za hranicou).', 'Pri prerazení: obchoduj smer prerazenia, cieľ = výška obdĺžnika.'],
    tips: ['Častý trik: falošné prerazenie jednej strany (vybratie stopov) a potom silný pohyb na druhú stranu.'] };
  const BROAD = { id: 'broadening', name: 'Rozširujúca sa formácia (Megafón)', en: 'Broadening formation', dir: 'bear', kind: 'Obrat', rel: 1,
    pts: [[0, 50], [12, 60], [22, 42], [34, 68], [46, 34], [58, 76], [70, 26], [82, 84], [94, 40]], lines: [[0, 56, 86, 86, 'res'], [10, 46, 74, 24, 'sup']],
    labels: [[30, 82, 'vyššie maximá'], [40, 24, 'nižšie minimá']],
    desc: 'Vyššie maximá a nižšie minimá – volatilita rastie, trh je emotívny a neistý. Často pri vrcholoch.',
    look: ['Dve rozbiehajúce sa čiary, aspoň 3 dotyky.'], trade: ['Ťažko obchodovateľná. Radšej obchoduj odraz od hraníc s malou pozíciou, alebo ju vynechaj.'],
    tips: ['Pri tejto formácii sa často vyberajú stop lossy na oboch stranách.'] };
  const DIA = { id: 'diamond', name: 'Diamant', en: 'Diamond top', dir: 'bear', kind: 'Obrat', rel: 2,
    pts: [[0, 22], [8, 52], [20, 59], [28, 44], [50, 76], [60, 43], [70, 63], [78, 48], [84, 55], [88, 52], [96, 30]],
    lines: [[8, 52, 50, 77, 'aux'], [50, 77, 88, 52, 'aux'], [8, 52, 45, 38, 'aux'], [45, 38, 88, 52, 'aux']], labels: [[50, 82, 'rozšírenie → zúženie']],
    desc: 'Najprv rozširujúca sa formácia, potom zbiehajúci sa trojuholník – spolu tvar diamantu. Vzácny obrat na vrchole.',
    look: ['Ľavá polovica: vyššie maximá a nižšie minimá; pravá polovica: zbiehanie.'], trade: ['Short pri prerazení pravej dolnej hrany, stop nad posledné maximum.'], tips: [] };
  const CH = { id: 'channelup', name: 'Rastúci kanál', en: 'Ascending channel', dir: 'bull', kind: 'Trend', rel: 2,
    pts: [[0, 20], [12, 46], [22, 31], [36, 58], [46, 43], [60, 70], [70, 55], [84, 82], [94, 67]], lines: [[0, 20, 100, 70, 'sup'], [0, 40, 100, 90, 'res']],
    labels: [[60, 84, 'horná hrana – výber zisku'], [60, 38, 'dolná hrana – nákup']],
    desc: 'Trend ohraničený dvoma rovnobežnými čiarami. Cena sa pohybuje vo vlnách od jednej hrany k druhej.',
    look: ['Aspoň 2 dotyky na každej čiare, čiary rovnobežné.'],
    trade: ['Kupuj pri dolnej hrane (v smere trendu), stop pod ňou.', 'Výber zisku pri hornej hrane.', 'Prerazenie dolnej hrany = možný koniec trendu.'],
    tips: ['Ak cena prestane dosahovať hornú hranu, trend slabne.'] };
  const VREV = { id: 'vbottom', name: 'V-obrat', en: 'V reversal (spike)', dir: 'bull', kind: 'Obrat', rel: 1,
    pts: [[0, 85], [10, 75], [20, 68], [30, 55], [40, 40], [48, 18], [56, 40], [66, 58], [76, 70], [90, 86]], labels: [[48, 10, 'kapitulácia']],
    desc: 'Prudký pokles a okamžitý prudký rast bez konsolidácie. Často po kapitulácii alebo správach.',
    look: ['Ostré dno, takmer bez zaváhania.', 'Vysoký objem na dne.'], trade: ['Ťažko sa chytá – vstupuj až po prvej korekcii (vyššie minimum).'], tips: ['Nikdy nechytaj padajúci nôž – počkaj na štruktúru.'] };
  const QM = { id: 'quasimodo', name: 'Quasimodo (Over & under)', en: 'Quasimodo', dir: 'bear', kind: 'Obrat', rel: 2,
    pts: [[0, 20], [12, 60], [22, 45], [34, 76], [46, 36], [60, 61], [72, 40], [84, 24]], lines: [[12, 60, 66, 60, 'res']],
    labels: [[12, 66, 'L'], [22, 39, 'H'], [34, 82, 'HH'], [46, 30, 'LL'], [60, 67, 'vstup QM']],
    desc: 'Cena urobí vyššie maximum (HH), potom prerazí predchádzajúce minimum (LL) – zmena štruktúry. Návrat k úrovni ľavého ramena (L) je miesto na short.',
    look: ['L → H → HH → LL (pod H).', 'Úroveň L je zóna vstupu.'],
    trade: ['Limitný short na úrovni L, stop nad HH.', 'Cieľ: LL a nižšie.'], tips: ['Obľúbený vzor price-action a SMC obchodníkov – podobný hlave a ramenám.'] };
  const SFP = { id: 'sfp', name: 'Výmet likvidity (Swing failure)', en: 'Swing failure pattern / liquidity sweep', dir: 'bear', kind: 'Obrat', rel: 2,
    pts: [[0, 40], [14, 72], [26, 52], [40, 70], [50, 55], [60, 78], [64, 66], [74, 48], [88, 30]], lines: [[14, 72, 72, 72, 'res']],
    labels: [[60, 84, 'výmet nad maximum'], [30, 77, 'stop lossy nad maximami']],
    desc: 'Cena krátko prerazí jasné maximum (kde ležia stop lossy a čakajúce príkazy), ale sviečka zavrie späť pod ním. Veľkí hráči „pozbierali likviditu" a idú opačne.',
    look: ['Výrazné maximum / dvojité maximum.', 'Knôt nad ním, telo zatvorí pod ním.'],
    trade: ['Short po zatvorení sviečky späť pod úrovňou, stop nad knôt.', 'Cieľ: protiľahlá strana rozsahu.'],
    tips: ['Na zlate typické pri otvorení Londýna a New Yorku.', 'Rovnaký princíp funguje zrkadlovo pod minimami (býčí výmet).'] };
  const ABCD = { id: 'abcd', name: 'AB=CD', en: 'AB=CD harmonic', dir: 'bull', kind: 'Harmonická', rel: 2,
    pts: [[5, 85], [30, 35], [48, 66], [80, 15], [92, 40]], lines: [[5, 85, 48, 66, 'aux'], [30, 35, 80, 15, 'aux']],
    labels: [[5, 91, 'A'], [30, 28, 'B'], [48, 72, 'C'], [80, 8, 'D'], [20, 64, '61,8–78,6 %'], [60, 30, '127–161,8 %']],
    desc: 'Základný harmonický vzor: pohyb AB, korekcia BC a pohyb CD rovnako dlhý ako AB (v cene aj čase). V bode D sa čaká obrat.',
    look: ['BC = 61,8–78,6 % z AB.', 'CD = 127–161,8 % z BC, ideálne CD ≈ AB.'],
    trade: ['Long v bode D, stop kúsok pod D.', 'Ciele: 38,2 % a 61,8 % pohybu CD.'], tips: ['Použi nástroj Fibonacci na meranie.'] };
  const GART = { id: 'gartley', name: 'Gartley', en: 'Gartley', dir: 'bull', kind: 'Harmonická', rel: 2,
    pts: [[0, 15], [22, 85], [38, 42], [54, 65], [78, 30], [92, 52]], lines: [[0, 15, 38, 42, 'aux'], [0, 15, 78, 30, 'aux'], [22, 85, 78, 30, 'aux']],
    labels: [[0, 9, 'X'], [22, 91, 'A'], [38, 36, 'B'], [54, 71, 'C'], [78, 23, 'D'], [26, 40, 'B = 61,8 % XA'], [62, 22, 'D = 78,6 % XA']],
    desc: 'Harmonický vzor H. M. Gartleyho (1935). Bod D je na 78,6 % retracemente pohybu XA – tam sa očakáva obrat.',
    look: ['B = 61,8 % XA.', 'C = 38,2–88,6 % AB.', 'D = 78,6 % XA a 127–161,8 % BC.'],
    trade: ['Long v D, stop pod X.', 'Ciele: 38,2 % a 61,8 % AD.'], tips: ['Medvedia verzia je zrkadlová (tvar M).'] };
  const BFLY = { id: 'butterfly', name: 'Motýľ (Butterfly)', en: 'Butterfly', dir: 'bull', kind: 'Harmonická', rel: 2,
    pts: [[0, 40], [20, 85], [36, 50], [52, 72], [80, 18], [92, 44]], lines: [[0, 40, 100, 40, 'aux'], [20, 85, 80, 18, 'aux']],
    labels: [[0, 34, 'X'], [20, 91, 'A'], [36, 44, 'B'], [52, 78, 'C'], [80, 11, 'D'], [60, 34, 'D = 127–161,8 % XA']],
    desc: 'Harmonický vzor, kde bod D presahuje začiatok X – obrat nastáva na predĺžení 127–161,8 % XA.',
    look: ['B = 78,6 % XA.', 'D = 127–161,8 % XA (pod X).'], trade: ['Long v D, stop o kúsok nižšie (napr. pod 161,8 %).'], tips: [] };
  const ELL = { id: 'elliott', name: 'Elliottove vlny', en: 'Elliott wave', dir: 'neutral', kind: 'Vlny', rel: 1,
    pts: [[0, 10], [14, 40], [22, 25], [42, 78], [52, 60], [66, 88], [76, 66], [84, 76], [96, 45]],
    labels: [[14, 46, '1'], [22, 19, '2'], [42, 84, '3'], [52, 54, '4'], [66, 94, '5'], [76, 60, 'A'], [84, 82, 'B'], [96, 39, 'C']],
    desc: 'R. N. Elliott: trh sa hýbe v 5 vlnách v smere trendu (1–5) a 3 korekčných vlnách (A–B–C). Vlny sú fraktálne – každá sa skladá z menších.',
    look: ['Vlna 2 nikdy neklesne pod začiatok vlny 1.', 'Vlna 3 nie je najkratšia (často najdlhšia, 161,8 % vlny 1).', 'Vlna 4 nevstúpi do územia vlny 1.'],
    trade: ['Najlepší obchod: vstup na konci vlny 2 alebo 4 v smere trendu.', 'Na konci vlny 5 (často s divergenciou) vyber zisky.'],
    tips: ['Počítanie vĺn je subjektívne – používaj ho s inými nástrojmi.'] };
  const WYA = { id: 'wyckoffacc', name: 'Wyckoff – akumulácia', en: 'Wyckoff accumulation', dir: 'bull', kind: 'Obrat', rel: 2,
    pts: [[0, 92], [6, 60], [11, 30], [18, 62], [26, 38], [34, 56], [42, 36], [48, 24], [54, 50], [62, 43], [70, 66], [76, 58], [86, 80], [96, 94]],
    lines: [[11, 62, 72, 62, 'res'], [11, 31, 60, 31, 'sup']],
    labels: [[11, 24, 'SC'], [18, 68, 'AR'], [26, 32, 'ST'], [48, 18, 'Spring'], [70, 72, 'SOS'], [76, 52, 'LPS'], [90, 98, 'markup']],
    desc: 'Richard Wyckoff: veľkí hráči nakupujú v obchodnom pásme po poklese. Fázy: SC (výpredaj), AR (odraz), ST (test), Spring (falošný pokles pod pásmo), SOS (znak sily), LPS (posledná podpora), potom rast.',
    look: ['Pásmo po dlhom poklese.', 'Spring = krátke prerazenie podpory s rýchlym návratom.', 'SOS = silné prerazenie hornej hranice s objemom.'],
    trade: ['Long po Springu (návrat do pásma) alebo na LPS po SOS.', 'Stop pod Spring.'], tips: ['Pozri aj stratégiu „Wyckoffova metóda".'] };

  const CHARTS = [HS, flipY(HS, { id: 'ihs', name: 'Obrátená hlava a ramená', en: 'Inverse head and shoulders', dir: 'bull',
      desc: 'Zrkadlová hlava a ramená na dne: tri minimá, prostredné najnižšie. Prerazenie krku smerom hore signalizuje koniec poklesu.',
      look: ['Klesajúci trend pred formáciou.', 'Ľavé rameno → nižšia hlava → pravé rameno vyššie ako hlava.', 'Objem by mal pri prerazení krku stúpnuť.'],
      trade: ['Long pri zatvorení nad krkom alebo na retest krku zhora.', 'Stop pod pravé rameno.', 'Cieľ = hĺbka hlavy pod krkom, odmeraná od prerazenia hore.'],
      tips: ['Na dne je potvrdenie objemom dôležitejšie ako na vrchole.', 'Retest krku po prerazení je ideálne miesto na vstup s malým stopom.'] }),
    DT, flipY(DT, { id: 'doublebottom', name: 'Dvojité dno (W)', en: 'Double bottom', dir: 'bull', labels: [[22, 22, 'Dno 1'], [52, 22, 'Dno 2'], [37, 59, 'Krk'], [76, 74, 'cieľ']],
      desc: 'Cena dvakrát odrazí od rovnakej podpory. Tvar písmena W.',
      look: ['Dve dná na podobnej cene.', 'Medzi nimi rast (vrchol = krk).', 'Druhé dno často s býčou divergenciou RSI.'],
      trade: ['Long pri zatvorení nad krkom.', 'Stop pod druhé dno.', 'Cieľ = výška formácie od krku hore.'],
      tips: ['Druhé dno mierne pod prvým (výmet stopov) býva silnejšie.'] }),
    TT, flipY(TT, { id: 'triplebottom', name: 'Trojité dno', en: 'Triple bottom', dir: 'bull', labels: [[16, 24, '1'], [42, 24, '2'], [68, 24, '3'], [30, 58, 'Krk']],
      desc: 'Tri odrazy od rovnakej podpory.', look: ['Tri dná na podobnej úrovni.'], trade: ['Long nad krkom, stop pod dnami, cieľ = výška formácie.'], tips: [] }),
    ASC, flipY(ASC, { id: 'desctri', name: 'Klesajúci trojuholník', en: 'Descending triangle', dir: 'bear', labels: [[40, 24, 'vodorovná podpora'], [30, 67, 'klesajúce maximá'], [93, 16, 'cieľ']],
      desc: 'Vodorovná podpora a čoraz nižšie maximá. Predávajúci tlačia, kým podporu neprerazia.',
      look: ['Aspoň 2 dotyky podpory a 2 klesajúce maximá.'], trade: ['Short pri zatvorení pod podporou, stop nad posledné maximum, cieľ = výška trojuholníka.'], tips: [] }),
    SYM, FLAG, flipY(FLAG, { id: 'bearflag', name: 'Medvedia vlajka', en: 'Bear flag', dir: 'bear', labels: [[8, 50, 'žrď'], [46, 24, 'vlajka'], [80, 2, 'cieľ = žrď']],
      desc: 'Prudký pokles (žrď) a krátka, mierne stúpajúca konsolidácia. Potom pokles pokračuje.',
      look: ['Silný pokles, korekcia v úzkom stúpajúcom kanáli.'], trade: ['Short pri prerazení spodnej hrany, stop nad vlajku, cieľ = dĺžka žrde.'], tips: [] }),
    PEN, flipY(PEN, { id: 'bearpennant', name: 'Medvedia vlajočka', en: 'Bear pennant', dir: 'bear', labels: [[8, 50, 'žrď'], [42, 20, 'vlajočka']],
      desc: 'Prudký pokles a krátky zbiehajúci sa trojuholník, potom pokračovanie dole.', look: [], trade: ['Short pri prerazení dole, stop nad vlajočku.'], tips: [] }),
    FW, flipY(FW, { id: 'risingwedge', name: 'Rastúci klin', en: 'Rising wedge', dir: 'bear', labels: [[40, 28, 'zbiehavé čiary'], [86, 32, 'prerazenie']],
      desc: 'Obe čiary rastú, ale zbiehajú sa – maximá rastú stále pomalšie. Kupujúci strácajú silu.',
      look: ['Stúpajúce maximá aj minimá, dolná čiara strmšia.'], trade: ['Short pri prerazení dolnej čiary, stop nad posledné maximum, cieľ = začiatok klinu.'],
      tips: ['Často s medveďou divergenciou RSI na konci rastu.'] }),
    CUP, flipY(CUP, { id: 'invcup', name: 'Obrátený hrnček s uškom', en: 'Inverted cup and handle', dir: 'bear', labels: [[34, 76, 'obrátený hrnček'], [76, 44, 'uško']],
      desc: 'Zrkadlový hrnček – oblý vrchol a malá konsolidácia pri okraji. Medvedí signál.', look: [], trade: ['Short pod minimum uška, stop nad uško.'], tips: [] }),
    RB, flipY(RB, { id: 'roundtop', name: 'Zaoblený vrchol', en: 'Rounding top', dir: 'bear', labels: [[50, 82, 'pomalý prechod z rastu do poklesu']],
      desc: 'Pomalý prechod z rastu do poklesu v tvare obráteného U.', look: [], trade: ['Short pri prerazení úrovne, kde rast začal.'], tips: [] }),
    RECT, BROAD, DIA, CH, flipY(CH, { id: 'channeldown', name: 'Klesajúci kanál', en: 'Descending channel', dir: 'bear', labels: [[60, 16, 'dolná hrana – výber zisku'], [60, 62, 'horná hrana – predaj']],
      desc: 'Klesajúci trend medzi dvoma rovnobežnými čiarami.', look: [], trade: ['Predávaj pri hornej hrane, stop nad ňou; výber zisku pri dolnej.', 'Prerazenie hornej hrany = možný koniec poklesu.'], tips: [] }),
    VREV, flipY(VREV, { id: 'vtop', name: 'Obrátené V (vrchol)', en: 'Inverted V', dir: 'bear', labels: [[48, 90, 'eufória']],
      desc: 'Prudký rast a okamžitý prudký pokles.', look: [], trade: ['Short až po prvej korekcii (nižšie maximum).'], tips: [] }),
    { id: 'island', name: 'Ostrovný obrat', en: 'Island reversal', dir: 'bear', kind: 'Obrat', rel: 2, bars: [[20, 30, 18, 28], [28, 38, 26, 36], [36, 46, 34, 44], [52, 60, 50, 58], [58, 62, 54, 56], [56, 60, 51, 54], [44, 46, 34, 36], [36, 38, 28, 30]],
      desc: 'Skupina sviečok oddelená medzerou hore aj dole – „ostrov". Kto kúpil na ostrove, je uväznený v strate.',
      look: ['Medzera hore, niekoľko sviečok, medzera dole na podobnej úrovni.'], trade: ['Short po druhej medzere, stop nad maximum ostrova.'], tips: ['Býčia verzia je zrkadlová (ostrov na dne).'] },
    { id: 'gaps', name: 'Medzery (Gaps)', en: 'Gaps', dir: 'neutral', kind: 'Prerazenie', rel: 2, bars: [[40, 46, 38, 44], [44, 47, 39, 41], [41, 46, 38, 45], [52, 64, 51, 62], [62, 70, 60, 68], [74, 84, 73, 82], [82, 86, 76, 78], [70, 72, 60, 62]],
      desc: 'Medzera = cena sa otvorí mimo rozsahu predchádzajúcej sviečky. Druhy: prerazová (z konsolidácie, silná), pokračovacia (v strede trendu), vyčerpávajúca (na konci trendu, rýchlo sa zavrie) a bežná (v pásme, zavrie sa).',
      look: ['Prerazová: z konsolidácie s objemom.', 'Pokračovacia: v polovici rýchleho trendu – odhad cieľa = zrkadlo.', 'Vyčerpávajúca: po dlhom trende, cena sa rýchlo vráti.'],
      trade: ['Prerazová: obchoduj v smere medzery, stop pod medzerou.', 'Vyčerpávajúca: obchoduj proti trendu po zavretí medzery.'],
      tips: ['Na zlate a forexe sú medzery hlavne po víkende; krypto (BTC) má medzery na CME futures.'] },
    QM, SFP, ABCD, GART, BFLY, ELL, WYA, flipY(WYA, { id: 'wyckoffdist', name: 'Wyckoff – distribúcia', en: 'Wyckoff distribution', dir: 'bear',
      labels: [[11, 76, 'BC'], [18, 32, 'AR'], [26, 68, 'ST'], [48, 82, 'UTAD'], [70, 28, 'SOW'], [76, 48, 'LPSY'], [90, 2, 'markdown']],
      desc: 'Zrkadlo akumulácie: veľkí hráči predávajú v pásme po raste. BC (vyvrcholenie nákupov), AR, ST, UTAD (falošné prerazenie nad pásmo), SOW (znak slabosti), LPSY (posledný bod ponuky), potom pokles.',
      look: ['Pásmo po dlhom raste.', 'UTAD = krátke prerazenie rezistencie s rýchlym návratom.'], trade: ['Short po UTAD alebo na LPSY po SOW, stop nad UTAD.'], tips: [] }),
  ];

  // ---- famous strategies -------------------------------------------------------------------------------
  const STRATS = [
    { id: 'dow', name: 'Dowova teória', who: 'Charles Dow (1900)', ic: '🏛', style: 'Trend', tf: 'Všetky',
      desc: 'Základ technickej analýzy. Trh má tri trendy (hlavný, vedľajší, malý), trend trvá, kým nedá jasný signál obratu, a cena už zohľadňuje všetky informácie.',
      rules: ['Rastúci trend = vyššie maximá a vyššie minimá (HH, HL).', 'Klesajúci trend = nižšie maximá a nižšie minimá (LH, LL).', 'Trend končí až prerazením posledného minima (v raste) / maxima (v poklese).', 'Objem by mal potvrdzovať trend.'],
      trade: ['Obchoduj iba v smere hlavného trendu.', 'Vstup na korekcii (HL v raste), stop pod ňu.'], tips: ['Väčšina moderných metód (SMC, price action) stavia na Dowovej štruktúre.'] },
    { id: 'turtle', name: 'Korytnačky (Turtle trading)', who: 'Richard Dennis a William Eckhardt (1983)', ic: '🐢', style: 'Trend / prerazenie', tf: 'Denný',
      desc: 'Slávny experiment – Dennis naučil začiatočníkov presné pravidlá a tí zarobili milióny. Mechanický systém prerazenia Donchianovho kanála.',
      rules: ['Systém 1: long pri prerazení 20-dňového maxima, short pri 20-dňovom minime.', 'Systém 2: to isté s 55 dňami.', 'Veľkosť pozície podľa volatility: 1 jednotka = 1 % účtu / ATR(20) („N").', 'Stop loss 2N od vstupu.', 'Pridávanie: ďalšia jednotka každých ½N v zisku, max. 4 jednotky.', 'Výstup: 10-dňové opačné minimum (S1) / 20-dňové (S2).'],
      trade: ['Na zlate: Donchian 20 na dennom grafe, stop 2× ATR.'], tips: ['Väčšina obchodov je stratových, zisk prinášajú zriedkavé veľké trendy – nutná disciplína.', 'Systém 1 preskočí signál, ak bol predchádzajúci obchod ziskový.'] },
    { id: 'ma', name: 'Kríženie kĺzavých priemerov', who: 'Klasika trend-followingu', ic: '〰', style: 'Trend', tf: '1h – denný',
      desc: 'Rýchly priemer kríži pomalý. Zlatý kríž (50 nad 200) = býčí, smrtiaci kríž (50 pod 200) = medvedí.',
      rules: ['Rýchly EMA (9/20/50) nad pomalým (21/50/200) = trend hore.', 'Vstup pri krížení alebo na pullbacku k rýchlemu priemeru.', 'Výstup pri opačnom krížení.'],
      trade: ['Filter: obchoduj long iba ak je cena nad 200 EMA.', 'Pullback k 20/21 EMA v silnom trende je klasický vstup.'], tips: ['V bočnom trhu dáva veľa falošných signálov – použi ADX > 20 ako filter.'] },
    { id: 'wyckoff', name: 'Wyckoffova metóda', who: 'Richard D. Wyckoff (1930)', ic: '🏗', style: 'Štruktúra / objem', tf: 'Všetky',
      desc: 'Trh riadi „Composite Man" – veľký hráč, ktorý akumuluje (nakupuje) a distribuuje (predáva). Cyklus: akumulácia → rast → distribúcia → pokles.',
      rules: ['Zákon ponuky a dopytu: cena rastie, keď dopyt > ponuka.', 'Zákon príčiny a následku: dĺžka pásma (príčina) určuje veľkosť pohybu (následok).', 'Zákon úsilia a výsledku: objem (úsilie) má zodpovedať pohybu ceny (výsledok).'],
      trade: ['Long po Springu alebo na LPS; short po UTAD alebo na LPSY.', 'Pozri formácie Wyckoff – akumulácia / distribúcia.'], tips: ['Veľký objem bez pohybu ceny = niekto absorbuje príkazy.'] },
    { id: 'smc', name: 'Smart Money Concepts / ICT', who: 'Michael J. Huddleston (ICT) a komunita', ic: '🏦', style: 'Štruktúra / likvidita', tf: '1m – 4h',
      desc: 'Moderná price-action metóda: inštitúcie hľadajú likviditu (stop lossy), zanechávajú nerovnováhy a bloky príkazov.',
      rules: ['BOS (break of structure) = pokračovanie trendu; CHoCH (change of character) = prvý znak obratu.', 'Likvidita: rovnaké maximá/minimá, maximá dňa/týždňa, okrúhle čísla.', 'Order block = posledná opačná sviečka pred silným pohybom.', 'FVG (fair value gap) = medzera medzi knôtom 1. a 3. sviečky silného pohybu – cena sa k nej často vracia.', 'Premium / discount: kupuj pod 50 % rozsahu, predávaj nad 50 %.'],
      trade: ['Model: výmet likvidity → CHoCH na nižšom TF → vstup v FVG / order bloku → cieľ protiľahlá likvidita.', 'Killzones pre zlato: Londýn 8–11, New York 14–17 (SEČ/SELČ).'], tips: ['Veľa pojmov je premenovaná klasika (supply/demand, Wyckoff) – podstatná je disciplína a riadenie rizika.'] },
    { id: 'pa', name: 'Price action: S/R + sviečkový signál', who: 'Al Brooks, Nial Fuller a ďalší', ic: '🕯', style: 'Price action', tf: '15m – denný',
      desc: 'Bez indikátorov: nájdi dôležitú úroveň a čakaj na sviečkový signál, ktorý potvrdí odmietnutie ceny.',
      rules: ['Zakresli horizontálne S/R z vyššieho TF (denné, 4h).', 'Čakaj, kým cena úroveň otestuje.', 'Signál: pin bar, pohltenie, inside bar, ranná/večerná hviezda.', 'Vstup v smere vyššieho trendu.'],
      trade: ['Vstup nad/pod signálnu sviečku, stop za knôt, cieľ ďalšia úroveň (min. 1:2).'], tips: ['Pôvodná rezistencia po prerazení býva podporou (polarita).', 'Menej je viac – 2–3 kvalitné úrovne stačia.'] },
    { id: 'orb', name: 'Prerazenie otváracieho rozsahu (ORB)', who: 'Toby Crabel (1990)', ic: '⏰', style: 'Prerazenie / intraday', tf: '1m – 15m',
      desc: 'Prvých 15–60 minút seancie vytvorí rozsah. Prerazenie tohto rozsahu často určí smer dňa.',
      rules: ['Zaznač maximum a minimum prvých 15/30/60 minút (napr. od 15:30 SEČ pre US akcie, 9:00 Londýn).', 'Long nad maximum, short pod minimum.', 'Stop na opačnej strane rozsahu alebo v jeho polovici.'],
      trade: ['Cieľ: 1–2× výška rozsahu, alebo trailing stop.'], tips: ['Na zlate funguje s ázijským rozsahom pred otvorením Londýna (London breakout).'] },
    { id: 'asian', name: 'Ázijský rozsah a London breakout (zlato)', who: 'Intraday stratégia na XAU/USD a forex', ic: '🌏', style: 'Prerazenie / intraday', tf: '5m – 15m',
      desc: 'Počas ázijskej seancie sa zlato hýbe v úzkom pásme. Pri otvorení Londýna príde volatilita – často najprv falošné prerazenie, potom skutočný pohyb.',
      rules: ['Zakresli maximum a minimum ázijskej seancie (cca 1:00–8:00 SEČ).', 'Variant A: obchoduj prerazenie po 8:00–9:00.', 'Variant B (Judas swing): čakaj na výmet jednej strany a návrat do pásma, obchoduj na opačnú stranu.'],
      trade: ['Stop za opačnou stranou pásma alebo za výmetom.', 'Cieľ: 1–2× šírka pásma, uzavri do otvorenia NY.'], tips: ['Pri dôležitých správach (NFP, CPI) stratégiu nepoužívaj.'] },
    { id: 'bbmr', name: 'Návrat k priemeru: Bollinger + RSI', who: 'John Bollinger', ic: '↔', style: 'Návrat k priemeru', tf: '5m – 4h',
      desc: 'V bočnom trhu cena často odskočí od vonkajších Bollingerových pásiem späť k strednej čiare.',
      rules: ['Bollinger (20, 2), RSI (14).', 'Long: sviečka zatvorí pod dolným pásmom a RSI < 30, ďalšia zatvorí späť nad pásmom.', 'Short: zrkadlovo nad horným pásmom a RSI > 70.'],
      trade: ['Cieľ: stredná čiara (SMA 20). Stop za extrém.'], tips: ['V silnom trende cena „jazdí po pásme" – nepoužívaj proti trendu.', 'Zúženie pásiem (squeeze) varuje pred silným pohybom.'] },
    { id: 'rsi2', name: 'RSI(2) stratégia', who: 'Larry Connors', ic: '📉', style: 'Návrat k priemeru', tf: 'Denný',
      desc: 'Krátkodobé prepredanie v dlhodobom raste: kúp extrémny pokles, predaj odraz.',
      rules: ['Cena nad SMA 200 (dlhodobý rast).', 'RSI(2) pod 10 (lepšie pod 5) = kúpiť na zatvorenie.', 'Predať, keď cena zavrie nad SMA 5.'],
      trade: ['Short verzia: cena pod SMA 200, RSI(2) nad 90.'], tips: ['Pôvodne na akciových indexoch; pred použitím na zlate / BTC otestuj.'] },
    { id: 'fib', name: 'Fibonacciho korekcie', who: 'Leonardo Fibonacci (matematika), použitie v trading-u', ic: '🌀', style: 'Trend / pullback', tf: 'Všetky',
      desc: 'Korekcie v trende sa často zastavia na úrovniach 38,2 %, 50 % a 61,8 % predchádzajúceho pohybu.',
      rules: ['Natiahni Fibonacci od začiatku po koniec impulzu.', 'Zlatá zóna: 50–61,8 % (OTE pri ICT: 62–79 %).', 'Čakaj na sviečkový signál v zóne.'],
      trade: ['Stop za 78,6 % alebo začiatok impulzu.', 'Ciele: predchádzajúce maximum, rozšírenia 127,2 % a 161,8 %.'], tips: ['Najsilnejšie, keď sa Fibonacci prekrýva s S/R alebo kĺzavým priemerom (konfluencia).'] },
    { id: 'ichimoku', name: 'Ichimoku Kinko Hyo', who: 'Goichi Hosoda (1969)', ic: '☁', style: 'Trend', tf: '1h – denný',
      desc: 'Japonský systém „rovnováha na prvý pohľad": trend, podpora/rezistencia a momentum v jednom indikátore.',
      rules: ['Cena nad oblakom (Kumo) = rastúci trend.', 'Tenkan (9) prekríži Kijun (26) nad oblakom = býčí signál.', 'Chikou span nad cenou spred 26 periód = potvrdenie.', 'Budúci oblak zelený = býčie prostredie.'],
      trade: ['Stop pod Kijun alebo pod oblak.'], tips: ['V bočnom trhu (cena v oblaku) neobchoduj.'] },
    { id: 'div', name: 'Divergencie (RSI / MACD)', who: 'Klasická technická analýza', ic: '↗↘', style: 'Obrat', tf: '15m – denný',
      desc: 'Cena urobí nové maximum, ale oscilátor nie (alebo naopak) – momentum slabne.',
      rules: ['Medvedia: vyššie maximum ceny, nižšie maximum RSI.', 'Býčia: nižšie minimum ceny, vyššie minimum RSI.', 'Skrytá divergencia = pokračovanie trendu (vyššie minimum ceny, nižšie minimum RSI v raste).'],
      trade: ['Vstup až po potvrdení (prerazenie trendovej čiary, sviečkový signál).'], tips: ['Divergencia môže trvať dlho – nie je to signál na okamžitý vstup.'] },
    { id: 'vwap', name: 'VWAP stratégia', who: 'Inštitucionálni obchodníci', ic: '⚖', style: 'Intraday', tf: '1m – 15m',
      desc: 'VWAP = priemerná cena dňa vážená objemom. Inštitúcie ho používajú ako „férovú cenu".',
      rules: ['Cena nad VWAP = kupujúci majú navrch, hľadaj long.', 'Pullback k VWAP v trende = vstup.', 'Odmietnutie od VWAP zospodu = short.'],
      trade: ['Stop za VWAP o malý buffer, cieľ predchádzajúce maximum dňa.'], tips: ['VWAP sa resetuje každý deň – najlepšie funguje počas likvidných hodín.'] },
    { id: 'darvas', name: 'Darvasove boxy', who: 'Nicolas Darvas (1950s)', ic: '📦', style: 'Prerazenie / momentum', tf: 'Denný',
      desc: 'Tanečník, ktorý zarobil 2 milióny dolárov: kupoval akcie pri prerazení „boxov" – konsolidácií pri nových maximách.',
      rules: ['Hľadaj trh pri nových maximách.', 'Box = rozsah, v ktorom sa cena zastaví (vrch nie je prekonaný 3 dni).', 'Long pri prerazení vrchu boxu s objemom.', 'Stop pod spodok boxu, posúvaj ho s novými boxmi.'],
      trade: [], tips: ['Jednoduchý trend-following s jasným stopom.'] },
    { id: 'vcp', name: 'VCP – sťahovanie volatility', who: 'Mark Minervini', ic: '🔻', style: 'Prerazenie / momentum', tf: 'Denný',
      desc: 'Pred silným rastom sa korekcie postupne zmenšujú (napr. 20 % → 10 % → 5 %) a objem vysychá. Potom príde prerazenie.',
      rules: ['Trh v rastovom trende (nad 50 a 200 SMA).', '2–4 zmenšujúce sa korekcie.', 'Long pri prerazení poslednej, najužšej konsolidácie.'],
      trade: ['Stop pod minimum poslednej korekcie (malé riziko).'], tips: ['Malý stop a veľký potenciálny pohyb = výborný pomer R:R.'] },
    { id: 'canslim', name: 'CAN SLIM', who: 'William O\'Neil', ic: '📰', style: 'Fundamenty + graf', tf: 'Denný / týždenný',
      desc: 'Metóda výberu akcií: rastúce zisky, nový produkt, dopyt inštitúcií, vodca odvetvia a rastúci trh. Vstup pri formácii hrnček s uškom.',
      rules: ['C – aktuálne zisky +25 %.', 'A – ročné zisky rastú.', 'N – niečo nové (produkt, maximum).', 'S – ponuka a dopyt (objem).', 'L – vodca, nie zaostávajúci.', 'I – nákupy inštitúcií.', 'M – smer trhu.'],
      trade: ['Stop loss max. 7–8 % pod nákupom.'], tips: ['Pre zlato/krypto platí hlavne časť „M" a technický vstup.'] },
    { id: 'livermore', name: 'Livermorove pivoty a pyramídovanie', who: 'Jesse Livermore', ic: '🎩', style: 'Trend / prerazenie', tf: 'Denný',
      desc: 'Legendárny špekulant: kupuj pri prerazení dôležitých úrovní („pivotal points") a pridávaj, iba keď obchod zarába.',
      rules: ['Čakaj na prerazenie kľúčovej úrovne – nehádaj vopred.', 'Začni malou pozíciou, pridaj až keď je v zisku.', 'Nikdy nepriemeruj stratu.', 'Peniaze sa zarábajú sedením, nie obchodovaním.'],
      trade: [], tips: ['„Trh nikdy nemá pravdu ani nepravdu – pravdu má iba cena."'] },
    { id: 'sd', name: 'Ponuka a dopyt (Supply & Demand zóny)', who: 'Sam Seiden a ďalší', ic: '🧱', style: 'Zóny', tf: '15m – denný',
      desc: 'Zóny, odkiaľ cena prudko odišla, obsahujú nevyplnené príkazy. Pri návrate sa z nich často odrazí.',
      rules: ['Dopytová zóna: báza (pár malých sviečok) a z nej silný rast (rally-base-rally, drop-base-rally).', 'Ponuková zóna: báza a silný pokles.', 'Najsilnejší je prvý návrat do zóny (čerstvá zóna).'],
      trade: ['Limitný príkaz na hrane zóny, stop za zónou, cieľ protiľahlá zóna.'], tips: ['Čím rýchlejšie cena zo zóny odišla, tým je silnejšia.'] },
    { id: 'elder', name: 'Trojitý filter (Triple screen)', who: 'Alexander Elder', ic: '🔭', style: 'Viac timeframov', tf: 'Kombinácia',
      desc: 'Pozri sa na trh troma „obrazovkami": vyšší TF určí smer, stredný nájde korekciu, nižší časuje vstup.',
      rules: ['1. obrazovka (napr. týždenný / 4h): trend podľa MACD alebo EMA.', '2. obrazovka (denný / 1h): oscilátor proti trendu – hľadaj prepredanie v raste.', '3. obrazovka: vstup pri prerazení maxima predchádzajúcej sviečky.'],
      trade: ['Pomer timeframov približne 1 : 5 (napr. 4h – 1h – 15m).'], tips: ['Nikdy neobchoduj proti 1. obrazovke.'] },
    { id: 'vp', name: 'Volume profile / Market profile', who: 'J. Peter Steidlmayer (CBOT, 1985)', ic: '📶', style: 'Objem', tf: 'Intraday',
      desc: 'Objem rozložený podľa ceny ukáže, kde trh považuje cenu za férovú (POC, value area) a kde ju odmieta.',
      rules: ['POC = cena s najväčším objemom – magnet.', 'Value area = 70 % objemu; mimo nej je cena „lacná / drahá".', 'Návrat do value area často dôjde až na druhú stranu (80 % pravidlo).', 'Miesta s malým objemom (LVN) cena prechádza rýchlo.'],
      trade: [], tips: ['Pri zlate (spot) je objem z brokerov iba tikový – presnejší je objem z futures (GC).'] },
    { id: 'news', name: 'Obchodovanie správ', who: 'Fundamentálni a event traderi', ic: '📣', style: 'Fundamenty', tf: '1m – 15m',
      desc: 'Zlato prudko reaguje na americké dáta: NFP, CPI, FOMC, PCE. Silnejší dolár a vyššie výnosy = slabšie zlato.',
      rules: ['Pozri kalendár (📰 Správy → Kalendár).', 'Pred správou zmenši alebo zavri pozície – spread a sklz sa zväčšia.', 'Obchoduj až reakciu po prvých 5–15 minútach, keď je smer jasný.'],
      trade: [], tips: ['Prvý pohyb po správe býva často falošný.'] },
  ];

  // ---- tips and tricks -----------------------------------------------------------------------------------
  const TIPS = [
    { id: 'orderflow', name: 'Objem, delta a tok príkazov', ic: '🫧',
      text: ['Každý obchod má kupujúceho aj predávajúceho – objem je preto vždy rovnaký na oboch stranách. Rozhoduje, KTO bol agresívny.',
        'Limitný príkaz (pasívny) čaká v knihe príkazov. Trhový príkaz (agresívny) ho okamžite „zje“. Agresívny kupujúci zaplatí cenu predávajúceho (ask), agresívny predávajúci predá za cenu kupujúceho (bid).',
        'Delta = objem agresívnych nákupov − objem agresívnych predajov. Kladná delta: kupujúci tlačia cenu hore. Záporná: predávajúci tlačia dole.',
        'CVD (kumulatívna delta) sčítava deltu sviečku po sviečke. Rastúca cena + klesajúca CVD = rast bez skutočných kupujúcich (divergencia, varovanie).',
        'Absorpcia: veľká záporná delta, ale cena neklesá → niekto veľký limitnými príkazmi nakupuje všetko, čo predávajúci pošlú. Často pred obratom hore (a naopak).',
        'Bubliny v grafe: veľkosť = objem v danom čase, zelený výsek = podiel kupujúcich, červený = predávajúcich, číslo = delta. Veľká bublina na maxime/minime = boj o úroveň.',
        'Páska obchodov (🌊) ukazuje každý obchod naživo: čas, cenu a veľkosť v lotoch. Séria veľkých ▲ obchodov = niekto agresívne nakupuje (robot alebo inštitúcia).',
        'Lot pri zlate = 100 uncí, pri striebre 5 000 uncí, pri BTC tu rátame 1 BTC.',
        'Pozor: dáta sú z Binance (XAUUSDT, XAGUSDT, BTCUSDT). Pri zlate je to len časť svetového trhu, takže delta ukazuje náladu na Binance, nie na celom trhu (CME futures, spot u bánk).'] },
    { id: 'anatomy', name: 'Anatómia sviečky', ic: '🕯', pic: 'anatomy',
      text: ['Telo = rozdiel medzi otvorením a zatvorením. Zelené: zatvorenie vyššie ako otvorenie; červené: nižšie.', 'Horný knôt = maximum nad telom, dolný knôt = minimum pod telom.', 'Dlhý knôt = odmietnutie ceny na tej strane.', 'Veľké telo = sila, malé telo = nerozhodnosť.', 'Sviečka je hotová až po zatvorení – dovtedy sa môže úplne zmeniť.'] },
    { id: 'risk', name: 'Riskuj max. 1–2 % na obchod', ic: '🛡',
      text: ['Pri 1 % riziku vydržíš aj 10 strát za sebou a stratíš len ~10 % účtu.', 'Pri 10 % riziku ťa 5 strát za sebou zníži o 41 %.', 'Strata 50 % potrebuje +100 % na návrat.'] },
    { id: 'size', name: 'Výpočet veľkosti pozície', ic: '🧮',
      text: ['Veľkosť = (účet × riziko %) ÷ (vzdialenosť stop lossu × hodnota bodu).', 'Príklad zlato: účet 10 000 $, riziko 1 % = 100 $, stop 5 $ → 100 ÷ 5 = 20 uncí = 0,2 lota (1 lot = 100 oz).', 'Najprv urči stop podľa grafu, až potom veľkosť pozície – nikdy naopak.'] },
    { id: 'rr', name: 'Pomer riziko : zisk (R:R)', ic: '⚖',
      text: ['R = riziko jedného obchodu. Cieľ 2R = zisk dvojnásobný oproti riziku.', 'Pri 1:2 stačí úspešnosť 34 % na nulu, pri 1:3 len 25 %.', 'Očakávaná hodnota = úspešnosť × priemerný zisk − neúspešnosť × priemerná strata.'] },
    { id: 'stop', name: 'Kam dať stop loss', ic: '🛑',
      text: ['Za miesto, kde sa tvoja myšlienka ukáže ako nesprávna (za knôt, za štruktúru), nie na okrúhle číslo.', 'Pridaj buffer podľa volatility – napr. 0,5–1× ATR.', 'Stop nikdy neposúvaj ďalej od vstupu.', 'Po 1R zisku môžeš stop posunúť na break-even.'] },
    { id: 'htf', name: 'Najprv vyšší timeframe', ic: '🔭',
      text: ['Urči trend na 4h / dennom grafe, vstup hľadaj na 5m–15m v jeho smere.', 'Úroveň z vyššieho TF má prednosť pred úrovňou z nižšieho.', 'Formácia proti trendu vyššieho TF má nižšiu úspešnosť.'] },
    { id: 'confluence', name: 'Konfluencia – viac dôvodov naraz', ic: '🎯',
      text: ['Najlepšie obchody majú 3+ dôvody: úroveň S/R + trendová čiara + sviečkový vzor + Fibonacci + divergencia.', 'Tento graf to robí automaticky: hviezdičky ★ pri ⚡ nápadoch sú počet potvrdení.'] },
    { id: 'close', name: 'Čakaj na zatvorenie sviečky', ic: '⏳',
      text: ['Prerazenie počas sviečky nie je prerazenie – knôt sa môže vrátiť.', 'Na prerazenie úrovne použi zatvorenie aspoň na timeframe, z ktorého úroveň je.'] },
    { id: 'fake', name: 'Falošné prerazenia', ic: '🪤',
      text: ['Jasné úrovne priťahujú stop lossy – veľkí hráči ich často „vyberú" a cena sa otočí.', 'Ak cena prerazí a do 1–3 sviečok sa vráti dovnútra, obchoduj opačný smer.', 'Bezpečnejší vstup: retest prerazenej úrovne.'] },
    { id: 'polarity', name: 'Podpora sa mení na rezistenciu', ic: '🔁',
      text: ['Prerazená rezistencia sa často stane podporou (a naopak).', 'Retest prerazenej úrovne je jeden z najlepších vstupov s malým stopom.'] },
    { id: 'round', name: 'Okrúhle čísla', ic: '💯',
      text: ['Zlato reaguje na celé desiatky a stovky (napr. 2400, 2450, 2500).', 'Príkazy sa hromadia pri okrúhlych číslach – take profit daj kúsok pred ne, stop kúsok za ne.'] },
    { id: 'sessions', name: 'Obchodné seancie (SEČ/SELČ)', ic: '🕘',
      text: ['Ázia ~1:00–9:00: pokojnejšia, tvorí rozsah.', 'Londýn ~9:00–17:30: rast volatility, často určí smer dňa.', 'New York ~14:30–22:00: dáta z USA, najväčšia volatilita pri prekrytí s Londýnom (14:30–17:30).', 'Piatok večer a sviatky: nízka likvidita, väčší spread.'] },
    { id: 'goldmacro', name: 'Čo hýbe zlatom', ic: '🥇',
      text: ['Silný dolár (DXY) = zvyčajne slabšie zlato.', 'Reálne úroky (výnosy mínus inflácia) hore = zlato dole.', 'Strach, vojny, krízy = dopyt po bezpečnom prístave.', 'Nákupy centrálnych bánk podporujú cenu dlhodobo.', 'Striebro sa hýbe podobne, ale volatilnejšie (aj priemyselný kov).'] },
    { id: 'journal', name: 'Obchodný denník', ic: '📓',
      text: ['Zapisuj vstup, stop, cieľ, dôvod, screenshot a emócie.', 'Po 30–50 obchodoch uvidíš, čo funguje a čo nie.', 'Na to slúži aj labelovanie v okne 💡 Nápad.'] },
    { id: 'psych', name: 'Psychológia', ic: '🧠',
      text: ['FOMO (strach, že niečo zmeškáš) → vstupy bez plánu. Ďalšia príležitosť príde vždy.', 'Pomstychtivé obchodovanie po strate → väčšie straty. Po 2–3 stratách prestaň na deň.', 'Plán obchodu urob pred vstupom, nie počas neho.'] },
    { id: 'overtrade', name: 'Menej obchodov, viac kvality', ic: '✂',
      text: ['Čakanie je tiež pozícia.', 'Stanov si max. počet obchodov za deň (napr. 3).', 'Obchoduj iba svoj setup – nie všetko, čo sa hýbe.'] },
    { id: 'partial', name: 'Čiastočné výbery a trailing stop', ic: '🪜',
      text: ['Vyber časť zisku pri 1R–2R, zvyšok nechaj bežať s posúvaným stopom.', 'Trailing stop: pod posledné vyššie minimum, pod EMA 20, alebo 2× ATR (chandelier).'] },
    { id: 'atr', name: 'ATR – meraj volatilitu', ic: '📏',
      text: ['ATR = priemerný rozsah sviečky. Pri vyššom ATR daj širší stop a menšiu pozíciu.', 'Cieľ, ktorý je ďalej ako 2–3 denné ATR, je na jeden deň nereálny.'] },
    { id: 'backtest', name: 'Otestuj si to v Replay', ic: '⏯',
      text: ['V tomto grafe: ⏯ Replay → klikni na sviečku → budúcnosť sa skryje.', 'Krokuj šípkou → a obchoduj na papieri, kým nemáš aspoň 30–50 obchodov.', 'Až potom stratégiu používaj s reálnymi peniazmi.'] },
    { id: 'weekend', name: 'Víkendy a medzery', ic: '📅',
      text: ['Zlato a forex sa cez víkend neobchodujú – v pondelok môže prísť medzera cez tvoj stop.', 'Pred víkendom zvážiť zmenšenie pozícií.', 'Krypto (BTC) sa obchoduje nonstop, ale cez víkend má nižšiu likviditu.'] },
  ];

  const TABS = [['candles', '🕯 Sviečkové formácie', CANDLES], ['charts', '📐 Grafické formácie', CHARTS], ['strats', '♟ Stratégie', STRATS], ['tips', '💡 Tipy a triky', TIPS]];
  const DIRS = { bull: ['Býčia', 'bull'], bear: ['Medvedia', 'bear'], neutral: ['Neutrálna', 'neutral'] };
  const REL = r => '★'.repeat(r) + '☆'.repeat(3 - r);

  // ---- drawings ------------------------------------------------------------------------------------------
  function ctxBars(dir, first) {
    if (!dir) return [];
    const out = [];
    for (let k = 0; k < 3; k++) {
      if (dir === 'down') { const end = Math.max(first[0], first[3]) + 3, c = end + (2 - k) * 9, o = c + 8; out.push([o, o + 2, c - 2, c]); }
      else { const end = Math.min(first[0], first[3]) - 3, c = end - (2 - k) * 9, o = c - 8; out.push([o, c + 2, o - 2, c]); }
    }
    return out;
  }
  function candlesSvg(bars, ctx, W, H, big) {
    const all = [...ctxBars(ctx, bars[0]), ...bars], nc = all.length - bars.length;
    const lo = Math.min(...all.map(b => b[2])), hi = Math.max(...all.map(b => b[1])), pad = big ? 14 : 3;
    const Y = p => pad + (hi - p) * (H - 2 * pad) / (hi - lo || 1);
    const slot = Math.min(big ? 46 : 12, (W - 2 * pad) / all.length), x0 = (W - slot * all.length) / 2, bw = slot * 0.58;
    let s = '';
    if (big && nc) s += `<rect x="${x0 + nc * slot - 4}" y="2" width="${bars.length * slot + 8}" height="${H - 4}" rx="6" fill="rgba(41,98,255,.08)" stroke="rgba(41,98,255,.35)" stroke-dasharray="4 3"/>`;
    all.forEach(([o, h, l, c], i) => {
      const cx = x0 + i * slot + slot / 2, col = Math.abs(c - o) < 0.8 ? '#9598a1' : c > o ? UP : DN, op = i < nc ? 0.35 : 1;
      const top = Y(Math.max(o, c)), bh = Math.max(big ? 2 : 1, Math.abs(Y(o) - Y(c)));
      s += `<g opacity="${op}"><line x1="${cx}" x2="${cx}" y1="${Y(h)}" y2="${Y(l)}" stroke="${col}" stroke-width="${big ? 2 : 1}"/><rect x="${cx - bw / 2}" y="${top}" width="${bw}" height="${bh}" fill="${col}" rx="${big ? 1.5 : 0.5}"/></g>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" width="${big ? '100%' : W}" height="${big ? 'auto' : H}">${s}</svg>`;
  }
  const LCOL = { neck: '#5b9cf6', sup: UP, res: DN, tgt: '#ffb74d', aux: '#787b86' };
  function chartSvg(p, W, H, big) {
    if (p.bars) return candlesSvg(p.bars, null, W, H, big);
    const pad = big ? 16 : 3, X = x => pad + x * (W - 2 * pad) / 100, Y = y => H - pad - y * (H - 2 * pad) / 100;
    let s = '';
    for (const [x1, y1, x2, y2, k] of p.lines || []) {
      if (!big && k === 'tgt') continue;
      s += `<line x1="${X(x1)}" y1="${Y(y1)}" x2="${X(x2)}" y2="${Y(y2)}" stroke="${LCOL[k] || LCOL.aux}" stroke-width="${big ? 1.6 : 1}" stroke-dasharray="${k === 'tgt' || k === 'aux' ? '5 4' : ''}" ${k === 'tgt' && big ? 'marker-end="url(#ar)"' : ''}/>`;
    }
    const col = p.dir === 'bull' ? UP : p.dir === 'bear' ? DN : '#d1d4dc';
    s += `<polyline points="${p.pts.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' ')}" fill="none" stroke="${big ? '#d1d4dc' : col}" stroke-width="${big ? 2.4 : 1.4}" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (big) {
      s += p.pts.map(([x, y]) => `<circle cx="${X(x)}" cy="${Y(y)}" r="2.6" fill="#d1d4dc"/>`).join('');
      s += (p.labels || []).map(([x, y, t]) => `<text x="${X(x)}" y="${Y(y) + 4}" text-anchor="middle" font-size="12" fill="#b2b5be" style="paint-order:stroke;stroke:#1e222d;stroke-width:3px">${esc(t)}</text>`).join('');
    }
    return `<svg viewBox="0 0 ${W} ${H}" width="${big ? '100%' : W}" height="${big ? 'auto' : H}">${big ? '<defs><marker id="ar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="#ffb74d"/></marker></defs>' : ''}${s}</svg>`;
  }
  function anatomySvg() {
    const t = (x, y, s, a = "start") => `<text x="${x}" y="${y}" font-size="12" fill="#b2b5be" text-anchor="${a}">${s}</text>`;
    const ln = (x1, y, x2) => `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#787b86" stroke-dasharray="3 3"/>`;
    const candle = (x, col) => `<line x1="${x}" x2="${x}" y1="20" y2="190" stroke="${col}" stroke-width="2"/><rect x="${x - 18}" y="60" width="36" height="90" fill="${col}" rx="2"/>`;
    return `<svg viewBox="0 0 520 215" width="100%">${candle(130, UP)}${candle(370, DN)}
      ${t(90, 40, "horný knôt", "end")}${t(90, 109, "telo", "end")}${t(90, 175, "dolný knôt", "end")}
      ${ln(132, 20, 175)}${t(180, 24, "maximum (high)")}${ln(148, 60, 175)}${t(180, 64, "zatvorenie (close)")}${ln(148, 150, 175)}${t(180, 154, "otvorenie (open)")}${ln(132, 190, 175)}${t(180, 194, "minimum (low)")}
      ${ln(372, 20, 405)}${t(410, 24, "maximum")}${ln(388, 60, 405)}${t(410, 64, "otvorenie")}${ln(388, 150, 405)}${t(410, 154, "zatvorenie")}${ln(372, 190, 405)}${t(410, 194, "minimum")}
      ${t(130, 210, "rastúca (zelená)", "middle")}${t(370, 210, "klesajúca (červená)", "middle")}</svg>`;
  }
  const thumb = (tab, x) => tab === 'candles' ? candlesSvg(x.bars, null, 46, 30, false) : tab === 'charts' ? chartSvg(x, 46, 30, false) : `<span style="width:46px;text-align:center;font-size:20px">${x.ic || '•'}</span>`;

  // ---- page ----------------------------------------------------------------------------------------------
  const st = { tab: 'candles', sel: null, q: '', dir: 'all', ...LS.get('nx-lib', {}) };
  let hooks = {}, el = null;
  const store = () => LS.set('nx-lib', { tab: st.tab, sel: st.sel, dir: st.dir });
  const list = () => TABS.find(t => t[0] === st.tab)[2];
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  function filtered() {
    const q = norm(st.q.trim());
    return list().filter(x => (st.dir === 'all' || x.dir === st.dir) && (!q || norm([x.name, x.en, x.desc, x.kind, x.style, x.who].join(' ')).includes(q)));
  }
  const groupOf = x => st.tab === 'candles' ? (x.n === 1 ? 'Jedna sviečka' : x.n === 2 ? 'Dve sviečky' : 'Tri a viac sviečok') : st.tab === 'charts' ? x.kind : st.tab === 'strats' ? x.style : 'Tipy';
  function paint() {
    const items = filtered(), sel = items.find(x => x.id === st.sel) || null;
    const hasDir = st.tab === 'candles' || st.tab === 'charts';
    el.innerHTML = `<div class="lib-head"><span class="tt">📚 Knižnica</span><span class="lib-tabs">${TABS.map(([k, n, l]) => `<span data-lt="${k}" class="${k === st.tab ? 'on' : ''}">${n}<small>${l.length}</small></span>`).join('')}</span>
        <span class="grow" style="flex:1"></span><input id="libQ" placeholder="🔍 Hľadať (napr. pohltenie, vlajka, RSI)…" value="${esc(st.q)}"><button class="btn sm" id="libTech" title="Súhrn indikátorov, pivoty a nápady pre všetky timeframy">📊 Technicals</button><button class="btn sm" id="libBack">📈 Späť na graf</button></div>
      <div class="lib-main"><div class="lib-list">
        ${hasDir ? `<div class="lib-filter">${[['all', 'Všetko'], ['bull', '▲ Býčie'], ['bear', '▼ Medvedie'], ['neutral', '◆ Neutrálne']].map(([k, n]) => `<span data-ld="${k}" class="${st.dir === k ? 'on' : ''}">${n}</span>`).join('')}</div>` : ''}
        <div class="lib-it ${sel ? '' : 'on'}" data-li=""><span style="width:46px;text-align:center">▦</span><span class="nm"><b>Prehľad všetkého</b><small>${items.length} položiek</small></span></div>
        ${[...new Set(items.map(groupOf))].map(g => `<div class="lib-grp">${esc(g)}</div>${items.filter(x => groupOf(x) === g).map(x => `<div class="lib-it ${sel === x ? 'on' : ''}" data-li="${x.id}">${thumb(st.tab, x)}
          <span class="nm"><b>${esc(x.name)}</b><small>${esc(x.en || x.who || '')}</small></span>${x.dir ? `<i class="lib-dot ${x.dir}" title="${DIRS[x.dir][0]}"></i>` : ''}</div>`).join('')}`).join('') || '<div class="muted" style="padding:10px">Nič sa nenašlo.</div>'}
      </div><div class="lib-det" id="libDet">${sel ? detail(sel, items) : overview(items)}</div></div>`;
    $$('[data-lt]', el).forEach(x => x.onclick = () => { st.tab = x.dataset.lt; st.sel = null; st.dir = 'all'; store(); paint(); });
    $$('[data-ld]', el).forEach(x => x.onclick = () => { st.dir = x.dataset.ld; store(); paint(); });
    $$('[data-li]', el).forEach(x => x.onclick = () => { st.sel = x.dataset.li || null; store(); paint(); $('#libDet').scrollTop = 0; });
    $$('[data-card]', el).forEach(x => x.onclick = () => { st.sel = x.dataset.card; store(); paint(); });
    $$('[data-go]', el).forEach(x => x.onclick = () => { st.sel = x.dataset.go; store(); paint(); const it = $('.lib-it.on', el); if (it) it.scrollIntoView({ block: 'nearest' }); });
    const pt = $('[data-pat]', el); if (pt) pt.onclick = () => hooks.onPattern && hooks.onPattern(pt.dataset.pat);
    const q = $('#libQ'); q.oninput = () => { st.q = q.value; const pos = q.selectionStart; paint(); const q2 = $('#libQ'); q2.focus(); q2.selectionStart = q2.selectionEnd = pos; };
    $('#libBack').onclick = close;
    $('#libTech').onclick = () => { close(); hooks.onTech && hooks.onTech(); };
  }
  function overview(items) {
    if (st.tab === 'tips' || st.tab === 'strats') return `<div class="lib-cards">${items.map(x => `<div class="lib-card" data-card="${x.id}"><div style="font-size:26px">${x.ic}</div><b>${esc(x.name)}</b><small>${esc(x.who || x.text[0].slice(0, 80) + '…')}</small></div>`).join('')}</div>`;
    return `<div class="lib-cards">${items.map(x => `<div class="lib-card" data-card="${x.id}">${st.tab === 'candles' ? candlesSvg(x.bars, x.ctx, 200, 110, true) : chartSvg(x, 200, 110, true).replace(/<text[^>]*>[^<]*<\/text>/g, '')}
      <b>${esc(x.name)}</b><small><i class="lib-dot ${x.dir}" style="display:inline-block;margin-right:4px"></i>${DIRS[x.dir][0]} · ${esc(x.kind)}</small></div>`).join('')}</div>`;
  }
  const ul = (h, a) => (a && a.length ? `<div class="lib-sec"><h3>${h}</h3><ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '');
  function detail(x, items) {
    const i = items.indexOf(x), prev = items[i - 1], next = items[i + 1];
    const nav = `<div class="lib-nav">${prev ? `<button class="btn" data-go="${prev.id}">‹ ${esc(prev.name)}</button>` : ''}<span class="grow"></span>${next ? `<button class="btn" data-go="${next.id}">${esc(next.name)} ›</button>` : ''}</div>`;
    if (st.tab === 'tips') return `<h2>${x.ic} ${esc(x.name)}</h2>${x.pic === 'anatomy' ? `<div class="lib-pic">${anatomySvg()}</div>` : ''}${ul('Ako na to', x.text)}${nav}`;
    if (st.tab === 'strats') return `<h2>${x.ic} ${esc(x.name)}</h2><div class="sub">${esc(x.who)}</div>
      <div class="lib-tags"><span class="lib-tag">${esc(x.style)}</span><span class="lib-tag">⏱ ${esc(x.tf)}</span></div>
      <div class="lib-sec">${esc(x.desc)}</div>${ul('Pravidlá', x.rules)}${ul('Obchod', x.trade)}${ul('Tipy', x.tips)}${nav}`;
    const pic = st.tab === 'candles' ? candlesSvg(x.bars, x.ctx, 520, 230, true) : chartSvg(x, 640, 300, true);
    return `<h2>${esc(x.name)}</h2><div class="sub">${esc(x.en)}${x.n ? ` · ${x.n === 1 ? '1 sviečka' : x.n + ' sviečky'}` : ''}</div>
      <div class="lib-tags"><span class="lib-tag ${x.dir}">${x.dir === 'bull' ? '▲' : x.dir === 'bear' ? '▼' : '◆'} ${DIRS[x.dir][0]}</span><span class="lib-tag">${esc(x.kind)}</span>
        <span class="lib-tag" title="Spoľahlivosť (orientačne)">Spoľahlivosť ${REL(x.rel)}</span>${x.ctx ? `<span class="lib-tag">po ${x.ctx === 'down' ? 'poklese' : 'raste'}</span>` : ''}
        ${x.pat ? `<button class="btn sm pri" data-pat="${x.pat}" title="Pridá detektor tohto vzoru do grafu – značky ukážu, kde sa vyskytol">📈 Nájsť v grafe</button>` : ''}</div>
      <div class="lib-pic">${pic}</div>
      <div class="lib-sec">${esc(x.desc)}</div>${ul('Ako ju spoznať', x.look)}${ul('Ako obchodovať', x.trade)}${ul('Tipy', x.tips)}${nav}`;
  }
  function keys(e) {
    if (!el || !el.classList.contains('open') || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.altKey || e.ctrlKey) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = filtered(), i = items.findIndex(x => x.id === st.sel), j = Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
    if (items[j]) { e.preventDefault(); st.sel = items[j].id; store(); paint(); const it = $('.lib-it.on', el); if (it) it.scrollIntoView({ block: 'nearest' }); }
  }
  function open() { el = el || $('#libPage'); el.classList.add('open'); $('#bLib').classList.add('on'); paint(); }
  function close() { if (!el) return; el.classList.remove('open'); $('#bLib').classList.remove('on'); if (hooks.onClose) hooks.onClose(); }
  const isOpen = () => !!el && el.classList.contains('open');
  document.addEventListener('keydown', keys, true);
  function show(tab, id) { st.tab = tab; st.sel = id; st.dir = 'all'; st.q = ''; store(); if (isOpen()) paint(); else open(); }
  return { CANDLES, CHARTS, STRATS, TIPS, init(h) { hooks = h || {}; }, open, close, isOpen, show, toggle() { isOpen() ? close() : open(); } };
})();
