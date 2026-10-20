# KTMA – Research: indikátory, zlato/striebro, labelovanie, ML

Podklad pre [ARCHITEKTURA.md](ARCHITEKTURA.md). Stav k októbru 2026.

---

## 0. Zhrnutie v 10 bodoch

1. **Samotné indikátory (RSI, MACD, MA) nemajú v akademických štúdiách spoľahlivú ziskovosť**, na komoditách
   vychádzajú dokonca najslabšie. Väčšina „backtestov s 70–80 % úspešnosťou“ na internete pochádza od predajcov
   a nemá metodiku. → Indikátory používame ako **generátor kandidátov**, nie ako pravdu. Hodnotu má pridať
   úsudok kamaráta a model, ktorý sa ho naučí.
2. **RSI 80/20 je na zlate rozumná voľba** (zlato je trendové, 70/30 dáva veľa falošných signálov). Prakticky
   všetky zdroje odporúčajú **ADX filter**: pri silnom trende (ADX > 30–35) RSI extrémy nefadovať.
3. **Logovať viac, než hlásiť:** ukladať kandidátov aj pri RSI 70/30 a 75/25, ale notifikovať iba 80/20.
   O tom, ktorý prah je lepší, potom rozhodnú vlastné dáta, nie blogy.
4. **Objem:** skutočný objem má iba COMEX futures (GC/SI). Spot XAU/USD má iba tick volume. VWAP a volume ratio sa
   dajú počítať zo sviečok, **CVD (delta) vyžaduje tickové dáta** so stranou agresora, s yfinance to nejde.
5. **MACD závisí od ceny** (zlato za 2 000 $ vs. 4 000 $), preto do modelu ide **MACD / ATR**, nie surové MACD.
   Všetky features musia byť bezrozmerné.
6. **Multi-timeframe:** dôkazy, že filter vyššieho TF pomáha, sú slabé (iba od predajcov), ale riziko lookahead
   je veľké. → Trend vyšších TF dávame do modelu ako feature (iba uzavreté sviečky) a necháme dáta rozhodnúť.
7. **Zlato reaguje najviac na CPI**, potom na NFP a FOMC. Alert 5 minút pred alebo po CPI je iný alert ako
   v pokojnej ázijskej seanse. → Seansa a vzdialenosť od makro správ sú povinné features.
8. **Akademické ML na smer zlata:** ~55–59 % presnosť na dennom TF a samotné Bollinger pásma dosahujú ~58 %.
   → Model musí vždy poraziť jednoduchý baseline, inak je zbytočný.
9. **Labely:** triple-barrier je lepší ako pevný horizont, trend-scanning je sľubná alternatíva. Pri ručných labeloch
   treba **pravidlá pre labelovanie**, 10 % alertov označiť dvakrát a sledovať zhodu (Cohenovo kappa).
10. **Model na 4 CPU:** LightGBM (hlavný), logistická regresia (baseline), TabPFN (pri malom počte labelov).
    Hlboké siete nie, kým nebudú desaťtisíce labelov.

**Úroveň dôkazov** použitá nižšie: 🟢 recenzovaná štúdia · 🟡 preprint, diplomová práca, konferencia · 🔴 blog, predajca, TradingView skript (iba ilustrácia).

---

## 1. Indikátory jeden po druhom

### 1.1 RSI (Relative Strength Index)
- **Čo meria:** pomer priemerných ziskov a strát (Wilder), rozsah 0–100.
- **Nastavenie pre zlato:** perióda 14 (štandard), na intraday sa skúša aj 9. Prahy 70/30 sú podľa viacerých
  zdrojov na zlate „príliš tesné“. Odporúča sa 75/25 (H1) alebo **80/20** 🔴. Jeden zdroj uvádza profit factor
  1,72 pri RSI(9) a 80/20 oproti horšiemu 70/30, metodika však chýba 🔴.
- **Protidôkaz:** jednoduchá RSI mean-reversion na H1 zlate mala profit factor 0,98 (261 obchodov) 🔴. Zlato je trendové
  aktívum a fadovanie extrémov v trende nefunguje.
- **Filter:** ADX > 30–35 → nefadovať 🔴 (konzistentná rada naprieč zdrojmi).
- **Spôsoby signálu:** (a) vstup do pásma, (b) **návrat z pásma** (menej falošných signálov v trende),
  (c) divergencia (pozri 1.9).
- **Pre KTMA:** alert pri 80/20 vstupe aj návrate. Kandidáti 70/30 a 75/25 iba do DB (bez notifikácie).
  RSI hodnota a jej sklon ako feature na každom TF.

### 1.2 MACD (12, 26, 9)
- **Čo meria:** rozdiel EMA12 a EMA26 (momentum), signálna čiara EMA9, histogram.
- **Dôkazy:** porovnávacia štúdia MACD stratégií 🟡 (arXiv 2206.12282). Na indických komoditách (zlato, striebro, ropa)
  optimalizované Bollingerove pásma prekonali RSI aj MACD 🟢 (SAGE 2025). Nový preprint navrhuje
  **MACD upravené o objem a cenu** (VPA-MACD) s kalibráciou citlivosti 🟡 (arXiv 2604.26063, akciové indexy).
- **Problém:** MACD je v dolároch, takže pri cene 4 000 $ sú hodnoty 2× väčšie ako pri 2 000 $ 🟡 (arXiv 2603.13638).
- **Pre KTMA:** alerty pri prekrížení signálnej čiary (voliteľne nuly). Do modelu ide **MACD/ATR,
  histogram/ATR a zmena histogramu**.

### 1.3 Kĺzavé priemery (EMA/SMA)
- **Signály:** EMA 9/21 (krátkodobé), 50/200 (golden/death cross), cena cez MA200.
- **Dôkazy:** v starších štúdiách vychádzal jednoduchý MA lepšie ako dvojitý MA aj RSI 🟡, na komoditách však slabo 🟡 (Lund).
- **Problém:** oneskorenie a „pílenie“ v bočnom trhu (veľa prekrížení tam a späť).
- **Pre KTMA:** alerty pri prekríženiach. Do modelu ide **vzdialenosť ceny od MA v násobkoch ATR,
  sklon MA a počet prekrížení za posledných N sviečok** (miera „pílenia“).

### 1.4 Objem (volume)
| Nástroj | Čo dáva | Potrebné dáta | Pre KTMA |
|---|---|---|---|
| **Volume ratio** (objem / priemer 20) | spike, potvrdenie pohybu | OHLCV | ✅ fáza 1, alert + feature |
| **OBV** | divergencia objem vs. cena | OHLCV | ✅ feature (sklon OBV) |
| **VWAP** (ukotvený na CME seansu) | „férová cena“ dňa, intraday bias | OHLCV (1m) | ✅ feature: vzdialenosť od VWAP / ATR |
| **Volume Profile** (POC, VAH, VAL) | kde sa obchodovalo najviac, úrovne | 1m alebo ticky | fáza 4, feature (vzdialenosť od POC) |
| **CVD / delta** | agresívni kupci vs. predajcovia | **tickové dáta so stranou agresora** | ❌ s yfinance nie, iba s Databento |

- Zdroje sa zhodujú, že Volume Profile funguje na **centralizovanom objeme futures** a je reaktívny, nie
  prediktívny 🔴. Na spot forexe je to iba tick volume 🔴.
- **Pre KTMA:** volume ratio sa ukladá ku každému alertu. Filter „iba s potvrdením objemu“ ovplyvní iba
  notifikácie, dáta sa ukladajú vždy.

### 1.5 Volatilita: ATR, Bollinger, Keltner
- **ATR:** základ na normalizáciu (vzdialenosti, TP/SL bariéry). Ako feature v percentách z ceny (ATR %) 🔴.
- **Bollinger Bands:** v štúdii z indických komodít najlepší z testovaných 🟢. V dennom preprinte na XAU/USD
  dosahujú samotné ~57,5 % presnosť smeru, takmer toľko ako Random Forest (59,5 %) 🟡.
  → **%B a šírka pásma (squeeze)** ako features, neskôr možno aj alert.
- **Keltner:** v kombinácii s Bollingerom „squeeze“ (BB vnútri KC). Ide iba do modelu, nie ako alert.

### 1.6 ADX / DI (sila trendu)
- **Kľúčový filter režimu:** trend (ADX vysoký) vs. bočný trh. Jeden backtest na dennom zlate: prekríženie ADX DI
  dalo PF 1,54 (101 obchodov) vs. Bollinger 1,14 (51 obchodov) 🔴, malá vzorka.
- **Pre KTMA:** ADX a +DI/−DI ako feature na každom TF, prípadne voliteľný filter notifikácií pre RSI.

### 1.7 Stochastic, Supertrend, Ichimoku, Donchian
- Dôkazy sú iba 🔴 a navzájom si odporujú (jeden zdroj radí Ichimoku a ADX vyššie, Stochastic a Bollinger nižšie).
  Pozitívne výsledky kombinácií bývajú na 6–12 obchodoch, čo je bezcenné.
- **Pre KTMA:** Stochastic %K/%D, smer Supertrendu a pozícia v Donchian kanáli ako **features fázy 3**.
  Nie ako alerty. Nechceme zahltiť kamaráta.

### 1.8 Úrovne
- predchádzajúci denný/týždenný high/low, okrúhle čísla (zlato: násobky 50 $ a 100 $), London fix.
- **Pre KTMA:** vzdialenosť od týchto úrovní v násobkoch ATR ako feature (fáza 3).

### 1.9 Divergencie (RSI/MACD vs. cena)
- Detekcia cez pivoty (typicky 5 sviečok vľavo/vpravo). **Pivot sa potvrdí až po N sviečkach**, takže
  backtest, ktorý to ignoruje, „vidí budúcnosť“ 🔴.
- Jediné čísla sú z malých vzoriek (12 signálov za 3 roky) 🔴.
- **Pre KTMA:** fáza 3. Alert až po potvrdení pivotu a s časom oneskorenia uloženým pri alerte.

### 1.10 Súhrn: rola každého indikátora

| Indikátor | Alert | Feature | Filter | Fáza |
|---|---|---|---|---|
| RSI 80/20 (+ kandidáti 70/30, 75/25 iba do DB) | ✅ | ✅ | | 1 |
| MACD cross (signál, nula) | ✅ | ✅ (÷ATR) | | 1 |
| EMA 9/21, 50/200, cena × MA200 | ✅ | ✅ (÷ATR, sklon) | | 1 |
| Volume spike / ratio | ✅ | ✅ | ✅ (voliteľne) | 1 |
| ATR | | ✅ | | 1 |
| ADX, ±DI | | ✅ | ✅ (pre RSI) | 1 |
| Bollinger %B, šírka | | ✅ | | 1 |
| OBV sklon, VWAP vzdialenosť | | ✅ | | 2 |
| Seansa, hodina, deň, makro správy | | ✅ | | 2 |
| Stochastic, Supertrend, Donchian, Keltner | | ✅ | | 3 |
| Divergencie RSI/MACD | ✅ | ✅ | | 3 |
| Úrovne (PDH/PDL, okrúhle čísla) | | ✅ | | 3 |
| Volume Profile, CVD | | ✅ | | 4 (lepšie dáta) |

---

## 2. Zlato: špecifiká trhu

### 2.1 Štruktúra trhu
- **COMEX GC:** CME Globex nedeľa až piatok, **denná prestávka 60 min od 16:00 CT** 🟢 (CME). Kontrakty sú mesačné
  (26 mesiacov dopredu), obchodovanie končí 3. posledný pracovný deň mesiaca 🟢.
- **Rollovanie:** kontinuálny `GC=F` preskakuje na ďalší kontrakt, čo spôsobí **cenovú medzeru**, ktorá nie je
  skutočný pohyb. Treba ju detegovať a sviečky cez roll vylúčiť z outcomes.
- **Oneskorenie dát:** bezplatné CME dáta na webe sú štandardne **oneskorené aspoň o 10 minút**
  (CME, TradingView, dxFeed) 🟢. Pri yfinance to treba predpokladať. Pre 5m alerty je to podstatné, pre 1h/4h menej.
- **Cenový režim:** zlato sa v októbri 2026 obchoduje okolo 4 000–4 500 $. Žiadne pevné dolárové prahy,
  všetko v % alebo v ATR.

### 2.2 Seanse a čas dňa
- Najaktívnejší je **prekryv Londýn–New York (~13:00–17:00 UTC)**. Ázia je pokojnejšia a často tvorí range 🔴.
- London fix: AM 10:30, PM 15:00 (londýnsky čas) 🔴.
- Pozor na letný čas: UTC časy sa posúvajú. Seansy treba počítať v lokálnom čase burzy (`Europe/London`, `America/New_York`).
- Rigorózna štúdia podľa hodín pre XAU/USD sa nenašla. **Urobíme ju sami** z našich 1m dát (volatilita podľa hodiny).

### 2.3 Makro udalosti
- **CPI má na zlato najväčší vplyv v 5- a 30-minútovom okne**, nasleduje NFP a nezamestnanosť 🟡 (Wu, Atlantis Press).
- Zlato reaguje o niečo silnejšie na slabé NFP ako na silné a efekt sa do 4 hodín vytráca 🔴 (FXStreet, 32 releasov).
- CPI a NFP vychádzajú 13:30 UTC (v zime) a FOMC o 19:00 UTC (v zime).
- **Pre KTMA:** kalendár udalostí (CPI, NFP, FOMC, PCE) → features `minút_od_poslednej` / `minút_do_ďalšej`
  a príznak „alert v okne ±30 min od správy“.

### 2.4 Makro drivery
- Reálne výnosy (↑ = negatívne pre zlato) a DXY (↑ = väčšinou negatívne). Vzťah k reálnym výnosom bol jasný
  2009–2020, **odvtedy sa narušil** 🔴. Korelácia s DXY sa tiež dočasne rozpadá.
- **Pre KTMA (fáza 4):** zmena DXY, US10Y (^TNX), reálny výnos (FRED DFII10) a S&P 500 za posledný deň/hodinu
  ako features. Model sám zistí, či pomáhajú. Nepredpokladať pevný vzťah.

---

## 3. Striebro

- **Volatilita 2–3× vyššia ako zlato** (iShares, Morgan Stanley) 🔴. Rovnaké ATR násobky teda znamenajú
  iné veľkosti pohybov, preto sa používajú normalizované features.
- **Pomer zlato/striebro (GSR):** bežný rozsah 50–80, extrémy > 80 / < 50 sa berú ako signál 🔴. Historicky však
  17 až 125 (COVID 2020), takže nie je spoľahlivý na časovanie. V októbri 2026 ~73.
- **Pre KTMA:** striebro = ďalší symbol s rovnakými pravidlami. Model buď spoločný s featurom `symbol`, alebo
  samostatný, rozhodne validácia. GSR a jeho z-skóre ako feature pre oba kovy.

---

## 4. Multi-timeframe (MTF)

- Myšlienka „obchoduj v smere vyššieho TF“ (Elderov Triple Screen, 1986) je rozšírená, **dôkazy sú však iba od predajcov** 🔴.
  Jeden predajca dokonca ukazuje takmer rovnakú úspešnosť na 1H aj 4H.
- **Najväčšie riziko je lookahead:** hodnota vyššieho TF je platná až po uzavretí sviečky. Používať **poslednú uzavretú**
  sviečku vyššieho TF (vectorbt PRO to rieši rovnako) 🔴.
- **Pre KTMA:** pre každý alert uložiť stav všetkých TF (RSI, MACD/ATR, trend MA, ADX) zarovnaný podľa času uzavretia.
  Žiadne pevné MTF pravidlo. Model sa naučí, kedy vyšší TF pomáha.

---

## 5. Labelovanie

### 5.1 Automatické labely (z budúcich cien)
| Metóda | Ako | Výhody / nevýhody |
|---|---|---|
| Pevný horizont | znamienko výnosu po N sviečkach | jednoduché, ignoruje cestu a volatilitu |
| **Triple-barrier** (López de Prado) | ktorá bariéra sa dotkne prvá: TP / SL / čas | zohľadňuje cestu, bariéry v ATR |
| **Trend-scanning** | horizont s najväčšou t-štatistikou sklonu regresie | nepotrebuje pevný horizont |

- Jediné priame porovnanie (MQL5, jedna stratégia, mimo vzorky): Sharpe pevný horizont −3,7, triple-barrier −1,7,
  trend-scanning +2,6 🔴. Je to anekdota, ale smer zodpovedá teórii.
- **Pre KTMA:** počítať triple-barrier (long aj short, TP 2×ATR, SL 1×ATR, max 20 sviečok) **a** trend-scanning.
  Oba sa zobrazia kamarátovi a slúžia na predtréning.

### 5.2 Ručné labely (kamarát)
- **Pravidlá pre labelovanie** (krátky dokument): čo znamená „dobrý vstup“, aký horizont, aký risk/reward,
  čo s alertmi tesne pred správami. Bez toho labely driftujú v čase.
- **Kontrola kvality:** ~10 % alertov ukázať znova (naslepo) alebo druhému človeku a merať zhodu (Cohenovo kappa).
  Pri finančných textoch dosahovali experti κ ≈ 0,69 🟡, pri ťažších úlohách sa zhoda pohybuje okolo 0,43–0,49 🟡.
- **Spätný pohľad (hindsight):** kamarát vidí aj to, čo sa stalo potom. To je v poriadku (chceme „bol to správny vstup?“),
  ale treba uložiť, **či videl budúcnosť**. Neskôr sa dá urobiť aj režim „naslepo“ (vidí iba minulosť), ktorý
  meria, čo by spoznal naživo.
- **Active learning:** keď už existuje model, ukazovať kamarátovi najprv alerty, pri ktorých si model **nie je istý**.
  Ušetrí to labelovanie, ale posúva to pomer tried 🟡, preto treba časť alertov vyberať aj náhodne.
- **Premeškané vstupy:** kamarát môže kliknúť na graf a označiť vstup, ktorý žiadne pravidlo nenašlo.
- **Koľko labelov:** < 300 = iba baseline a TabPFN, 500–2 000 = LightGBM začne dávať zmysel, 10 000+ = sekvenčné modely.

---

## 6. ML: čo hovorí výskum a čo z toho vyplýva

### 6.1 Výsledky na zlate
- Denný smer XAU/USD (07/2023–03/2026): Random Forest 59,5 %, Gradient Boosting 55,9 %, XGBoost 54,5 %,
  **samotné Bollinger 57,5 %** 🟡 (Zenodo).
- Walk-forward validácia (RSI, MACD, BB): Random Forest AUC 0,786, autori upozorňujú, že **iné štúdie nafukuje
  časový leakage**. Najdôležitejšie features: momentum a volatilita 🟡 (Sakarya Univ. J.).
- XGBoost + SHAP: makro (inflácia, sadzby) a sentiment hrajú veľkú rolu 🟢 (Springer 2021) 🟡 (SciTePress 2024).
- **Záver:** reálne zlepšenia sú malé. Kto hlási 80–90 % presnosť, má takmer isto leakage.

### 6.2 Výber modelu (4 CPU)
| Model | Labelov | Tréning | Inferencia | Poznámka |
|---|---|---|---|---|
| Logistická regresia | od 100 | sekundy | µs | baseline, interpretovateľný |
| **LightGBM** | 500+ | sekundy–minúty | < 1 ms | štandard pre tabuľky a meta-labeling. Pri < 500 vzorkách sa leaf-wise rast preučí, treba silnú regularizáciu 🔴 |
| **TabPFN v2 / 2.5** | 100–10 000 (2.5: do 50 000) | žiadny (in-context) | sekundy na CPU | Nature 2025 🟢, HW: CPU, GPU voliteľné |
| MiniRocket | 1 000+ okien | minúty | ms | klasifikácia časových radov, 1 jadro stačí 🟡 |
| Chronos-Bolt tiny (9M) / TTM (~1M) | – | – | 10–100 ms | predpoveď ceny, iba extra feature |
| LSTM / Transformer | 10 000+ | GPU | – | teraz nie |

Odporúčané nastavenie LightGBM pre malé dáta: `num_leaves` 7–15, `min_data_in_leaf` 20–50, `feature_fraction` 0,7,
`bagging_fraction` 0,8, `lambda_l2` > 0, `max_depth` 4–6, early stopping na validačnom folde.

### 6.3 Features: pravidlá
- **Bezrozmerné:** RSI, %B a ADX sú ohraničené, MACD a vzdialenosti treba deliť ATR 🟡 (arXiv 2603.13638).
- **Rolling z-skóre** pre neohraničené veličiny (objem, ATR %) 🔴.
- Normalizácia a scaler sa fitujú **iba na tréningových dátach** 🔴.
- **SHAP** namiesto bežnej dôležitosti features (tá je citlivá na korelované features ako ATR a MA) 🟡 (arXiv 2107.14092).
  SHAP sa dá ukázať aj kamarátovi: „model hovorí NIE, hlavne kvôli ADX na 4h“.

### 6.4 Kontrolný zoznam proti leakage
- [ ] signály iba na uzavretých sviečkach
- [ ] vyšší TF iba z poslednej **uzavretej** sviečky
- [ ] divergencie a pivoty až po potvrdení
- [ ] purged walk-forward CV s embargom = max_bars outcome okna
- [ ] žiadne náhodné miešanie a záverečný test na najnovších mesiacoch
- [ ] scaler a výber features fitované iba na tréningu
- [ ] sviečky cez roll futures vylúčené z outcomes
- [ ] porovnanie s baseline (všetky alerty / samotný indikátor)

---

## 7. Open-source projekty

| Projekt | Čo to je | Využitie |
|---|---|---|
| [freqtrade + FreqAI](https://www.greptile.com/grepository/freqtrade) | krypto bot, GPL-3, ~40k ★, FreqAI pretrénuje model na posuvnom okne | inšpirácia pre pipeline a pretrénovanie, nie pre CME zlato |
| [Microsoft Qlib](https://pypi.org/project/pyqlib) | ML quant platforma, Alpha158 + LightGBM | inšpirácia pre features, akciovo orientované |
| [NautilusTrader](https://pm.wiki/es/compare/nautilustrader-vs-polytrader) | Rust/Python engine, LGPL | iba keby ste raz chceli automatické obchodovanie |
| [vectorbt](https://vectorbt.pro/features/data/multi-timeframe-analysis/) | rýchly backtesting, MTF bez lookahead | overenie filtra modelu |
| [mlfinpy](https://mlfinpy.readthedocs.io/en/latest/Labelling.html) | open-source implementácia AFML (triple-barrier, trend-scanning, …) | referencia pre labelovanie a purged CV |
| [ML4T Engineer](https://ml4trading.io/docs/engineer/user-guide/labeling/) | knižnica k ML4T, ATR triple-barrier | referencia |
| [fynance](https://fynance.readthedocs.io/en/master/_modules/fynance/features/labels.html), [wraquant](https://wraquant.readthedocs.io/en/latest/_modules/wraquant/ml/preprocessing.html) | triple-barrier, purged k-fold s embargom | referencia |
| [Label Studio](https://labelstud.io/blog/release-080-time-series-labeling.html) | labelovanie časových radov | nevie sviečky, preto vlastné UI |
| [streamlit-lightweight-charts](https://pypi.org/project/streamlit-lightweight-charts/), [lightweight-charts-python](https://github.com/wenli/lightweight-charts-python) | TradingView grafy v Pythone | ⭐ labelovacie UI |
| [tick-vault](https://github.com/keyhankamyar/TickVault) | sťahovanie tickov z Dukascopy | história XAU/XAG |
| [TabPFN](https://pypi.org/project/tabpfn/), LightGBM, scikit-learn, sktime | modely | – |

**Záver:** žiadny hotový projekt nerobí „alerty + uloženie snapshotu + ľudské labely + meta-model“.
Frameworky sú postavené na zadávaní obchodov. Postavíme malý vlastný pipeline a výpočty prevezmeme z overených
knižníc. Triple-barrier, trend-scanning a purged CV porovnáme s mlfinpy.

---

## 8. Čo z researchu mení v architektúre

1. Kandidáti na **viacerých prahoch** (RSI 70/30, 75/25, 80/20) sa ukladajú, notifikuje sa iba 80/20.
2. Pribúda **ADX, Bollinger %B a šírka, OBV, VWAP** ako features hneď vo fáze 1–2.
3. **Seansa a makro kalendár** (CPI, NFP, FOMC) sú povinné features.
4. **Detekcia rollu futures** a vylúčenie z outcomes.
5. Okrem triple-barrier aj **trend-scanning** labely.
6. **Pravidlá pre labelovanie, dvojité labelovanie 10 % a kappa**, príznak „videl budúcnosť“.
7. Report modelu vždy obsahuje **porovnanie s baseline** a SHAP.

## 9. Otázky, na ktoré odpovedia až naše dáta
- 80/20 vs. 75/25 vs. 70/30 na GC: ktoré prahy kamarát označuje ako dobré?
- Pomáha ADX filter? Pomáha súlad s vyšším TF?
- V ktorých hodinách sú alerty najkvalitnejšie?
- Zhoduje sa kamarát s triple-barrier? Kde nie, tam je jeho pridaná hodnota.
- Je striebro dosť podobné, aby stačil jeden spoločný model?

---

## Zdroje
**Indikátory:** [Lund – ziskovosť TA](https://lup.lub.lu.se/luur/download?func=downloadFile&recordOId=8905915&fileOId=8905916) ·
[Forecasting gold with TA indicators](https://www.researchgate.net/publication/386486470_Forecasting_gold_price_using_technical_analysis_indicators) ·
[Bollinger na komoditných futures (SAGE 2025)](https://journals.sagepub.com/doi/10.1177/09721509251328555) ·
[Profitability of TA indicators](https://www.pressacademia.org/archives/jefa/v1/i4/9.pdf) ·
[VPA-MACD (arXiv 2604.26063)](https://arxiv.org/pdf/2604.26063) ·
[MACD stratégie (arXiv 2206.12282)](https://arxiv.org/pdf/2206.12282) ·
[RSI nastavenia podľa TF](https://arxum.com/rsi-settings/) ·
[RSI pre zlato](https://goldtradermo.school/blog/how-to-use-rsi-for-gold-trading-complete-tutorial) ·
[Gold mean reversion](https://www.pro-scalper.com/xauusd-strategies/gold-mean-reversion) ·
[XAUUSD 3 stratégie](https://quant-signals.com/xauusd-trading-strategies/) ·
[RSI ADX Bollinger skript](https://www.tradingview.com/script/ft4yDxVX-RSI-ADX-Bollinger-Analysis/) ·
[Porovnanie indikátorov na XAUUSD](https://www.piyushratnu.com/comparison-of-the-most-effective-technical-indicators-on-xauusd-spot-gold-over-the-past-5-years-by-piyush-ratnu/) ·
[TradingView indikátory 2025](https://blog.pickmytrade.trade/best-tradingview-indicators-2025-backtest-results/) ·
[Stochastic+BB EA](https://mql.robotfx.org/2026/10/metatrader-5-expert-advisor-stochastic.html) ·
[Supertrend+ADX+Stoch skript](https://it.tradingview.com/script/6xvs0bee) ·
[Indikátory na 100 rokoch dát](https://www.newtrading.io/best-technical-indicators/) ·
[Divergencie (stratbase)](https://stratbase.ai/en/blog/rsi-macd-combo-strategy) ·
[RSI/MACD divergencia skript](https://ar.tradingview.com/script/szwbjhPr-RSI-and-MACD-Divergence-Indicator) ·
[RSI/MACD backtest repo](https://github.com/Jiian/trading-backtest-portfolio)

**Objem:** [Volume indikátory: VWAP, OBV, CVD](https://algostorm.com/volume-indicators/) ·
[Volume Profile a futures](https://www.quantum-algo.com/blog/guides/best-volume-indicators/) ·
[CVD (Bookmap)](https://bookmap.com/blog/how-cumulative-volume-delta-transform-your-trading-strategy) ·
[Tick volume na forexe](https://fxglory.com/learn/technical-analysis-forex/forex-technical-indicators/forex-volume-indicators/) ·
[Volume analýza](https://neomfunded.com/knowledge/volume-analysis-guide)

**Zlato a striebro:** [CME GC špecifikácia](https://cmegroup.com/trading/metals/precious/gold_contractSpecs_futures) ·
[QuantConnect GC hodiny](https://quantconnect.com/docs/v2/writing-algorithms/securities/asset-classes/futures/market-hours/comex/gc) ·
[Oneskorené vs. real-time dáta](https://nexusfi.com/a/data/real-time-vs-delayed-market-data) ·
[dxFeed COMEX](https://dxfeed.com/de/commodities-exchange-comex) ·
[CME real-time na TradingView](https://help.edgeful.com/en/articles/14436892-enabling-real-time-cme-futures-data-on-tradingview) ·
[Seanse zlata (TMGM)](https://www.tmgm.com/en/academy/trading-academy/gold-trading-hours) ·
[Kedy obchodovať zlato (QuantVPS)](https://www.quantvps.com/blog/when-to-trade-gold) ·
[Seanse (NordFX)](https://nordfx.com/traders-guide/best-time-to-trade-gold-xauusd-sessions-volatility-news) ·
[Wu – US indikátory a zlato](https://www.atlantis-press.com/article/126008582.pdf) ·
[NFP a zlato (FXStreet)](https://www.fxstreet.com/analysis/us-april-nonfarm-payrolls-preview-analyzing-gold-prices-reaction-to-nfp-surprises-202305040914) ·
[Gold News Countdown](https://goldhunts.com/gold-tools/gold-news-countdown) ·
[Zlato pod 4 200 $ (FXStreet, 10/2026)](https://www.fxstreet.com/news/gold-stalls-below-4-200-as-fed-rate-hike-bets-limit-upside-202610191104) ·
[Reálne výnosy a DXY (Axiory)](https://axiory.com/education/metals-trading-series/advanced-guide-to-trading-gold-xau-usd-how-to-use) ·
[FXCM reálne výnosy](https://www.fxcm.com/uk/insights/higher-real-yields-continue-to-pressure-gold/) ·
[Gold vs DXY skript](https://vn.tradingview.com/script/FsuB2iFG-Gold-vs-DXY) ·
[iShares zlato a striebro](https://www.ishares.com/us/insights/inside-the-market/gold-and-silver-investing-in-precious-metals) ·
[GSR 80/50](https://blog.swissamerica.com/gold-to-silver-ratio-when-to-buy/) ·
[GSR graf](https://www.jmbullion.com/charts/gold-silver-ratio/) ·
[GSR dnes](https://www.preciousmetalprices.com/en/gold-silver-ratio/) ·
[GSR na TradingView](https://cn.tradingview.com/chart/GOLDSILVER/InMIPZnm-Capture-Relative-Moves-Gold-vs-Silver)

**MTF:** [Quantified Strategies MTF](https://quantifiedstrategies.substack.com/p/multi-timeframe-analysis-and-strategy) ·
[LuxAlgo HTF filter](https://www.luxalgo.com/library/concept/higher-timeframe-trend-filter/) ·
[vectorbt MTF bez lookahead](https://vectorbt.pro/features/data/multi-timeframe-analysis/) ·
[Botsfolio MTF](https://botsfolio.com/learn/multi-timeframe-analysis) ·
[Trendrider MTF](https://trendrider.net/blog/multi-timeframe-analysis-explained)

**Labelovanie:** [Trend-scanning (MQL5)](https://www.mql5.com/en/articles/19253) ·
[Labeling (MQL5 part 2)](https://www.mql5.com/en/articles/18864) ·
[mlfinpy labelling](https://mlfinpy.readthedocs.io/en/latest/Labelling.html) ·
[ML4T labeling](https://ml4trading.io/docs/engineer/user-guide/labeling/) ·
[Triple-barrier (axlfi)](https://axlfi.com/blog/triple-barrier-method) ·
[Triple-barrier (HMA Quant)](https://hmaquant.substack.com/p/the-triple-barrier-method-labeling) ·
[Meta-labeling (Wikipedia)](https://en.wikipedia.org/wiki/Meta-Labeling) ·
[Meta-labeling (Jesse)](https://docs.jesse.trade/docs/research/ml/meta-labeling) ·
[Meta-labeling (Insper)](https://repositorio.insper.edu.br/entities/publication/14261761-ee4f-4466-91e4-771dd445f258/full) ·
[Purged CV](https://www.quantt.co.uk/resources/purged-cross-validation) ·
[Label-efficient time series (arXiv 2302.06433)](https://arxiv.org/pdf/2302.06433) ·
[Finančné správy – zhoda anotátorov (arXiv 2109.04369)](https://arxiv.org/pdf/2109.04369) ·
[Op-Fed active learning (arXiv 2509.13539)](https://arxiv.org/pdf/2509.13539) ·
[Human vs. LLM active learning (arXiv 2604.13899)](https://arxiv.org/pdf/2604.13899) ·
[Active learning prehľad](https://www.ml4devs.com/what-is/active-learning/)

**ML:** [Smer zlata: ML vs. indikátory (Zenodo)](https://zenodo.org/records/21208574) ·
[Smer zlata walk-forward (Sakarya)](https://dergipark.org.tr/en/pub/saucis/article/1834952) ·
[XGBoost zlato (SciTePress 2024)](https://www.scitepress.org/Papers/2024/132307/132307.pdf) ·
[XGBoost + SHAP zlato (Springer)](https://link.springer.com/article/10.1007/s10479-021-04187-w) ·
[ML zlato (ScienceDirect)](https://www.sciencedirect.com/science/article/abs/pii/S0960077923009803) ·
[KNN/XGBoost/LightGBM zlato a BTC](https://www.researchgate.net/publication/369869141_Gold_and_Bitcoin_Price_Prediction_based_on_KNN_XGBoost_and_LightGBM_Model) ·
[ML zlato finančné indikátory (IIETA)](https://www.iieta.org/journals/ijcmem/paper/10.18280/ijcmem.130120) ·
[Feature importance forex (arXiv 2107.14092)](https://arxiv.org/pdf/2107.14092) ·
[Kauzálne bezrozmerné signály (arXiv 2603.13638)](https://arxiv.org/pdf/2603.13638) ·
[Feature engineering v tradingu](https://www.traidies.com/blog/feature-engineering-best-practices-trading) ·
[LightGBM malé dáta (pickmytrade)](https://pickmytrade.io/de/ai-ml/advanced-guide) ·
[TabPFN PyPI](https://pypi.org/project/tabpfn/) · [TabPFN v2 HF](https://huggingface.co/Prior-Labs/TabPFN-v2) ·
[TabPFN-2.5 (HN)](https://hnrss.org/user?id=onasta) · [Thoughtworks Radar TabPFN](https://www.thoughtworks.com/en-us/radar/tools/tabpfn) ·
[MiniRocket (arXiv 2012.08791)](https://arxiv.org/pdf/2012.08791) · [MultiRocket (arXiv 2102.00457)](https://arxiv.org/pdf/2102.00457) ·
[Chronos-Bolt tiny](https://www.promptlayer.com/models/chronos-bolt-tiny) · [AutoGluon Chronos](https://auto.gluon.ai/1.5/_modules/autogluon/timeseries/models/chronos/model.html)

**Dáta a infra:** [tick-vault](https://github.com/keyhankamyar/TickVault) · [tickterial](https://pypi.org/project/tickterial) ·
[oandapyV20](https://github.com/hootnot/oanda-api-v20) · [Databento pricing](https://databento.com/pricing) ·
[Databento MGC](https://databento.com/catalog/cme/GLBX.MDP3/futures/MGC) · [FirstRate GC](https://firstratedata.com/i/futures/GC) ·
[DuckDB vs SQLite](https://www.analyticsvidhya.com/blog/2026/01/duckdb-vs-sqlite/)
