# KTMA – návrh architektúry (na schválenie pred písaním kódu)

**Cieľ:** systém, ktorý **neobchoduje**, iba **hlási** technické signály na zlate (neskôr striebre),
ku každému signálu **uloží kompletný stav trhu** a umožní kamarátovi-traderovi označiť,
či to bol správny vstup alebo nie. Z týchto označení sa neskôr natrénuje model, ktorý
pri ďalších alertoch povie, ako veľmi signálu veriť. Model musí bežať na **4 CPU jadrách**,
trénovať sa môže na RunPode.

Podrobný research (indikátor po indikátore, zlato/striebro, labelovanie, ML, open-source) je v [RESEARCH.md](RESEARCH.md).

---

## 1. Celkový tok dát

```
                 ┌──────────────┐
  dáta (1m)  ──▶ │ 1. Ingest    │  sťahuje 1m sviečky GC=F (SI=F), ukladá surové dáta
                 └──────┬───────┘
                        ▼
                 ┌──────────────┐
                 │ 2. Resampler │  z 1m poskladá 5m/15m/1h/4h/1d (vždy rovnako, bez lookahead)
                 └──────┬───────┘
                        ▼
                 ┌──────────────┐
                 │ 3. Indikátory│  RSI, MACD, MA, ATR, objem – na každom timeframe
                 └──────┬───────┘
                        ▼
                 ┌──────────────┐        ┌──────────────┐
                 │ 4. Pravidlá  │ ─────▶ │ 5. Snapshot  │  zamrazí všetky features zo všetkých TF
                 │  (alerty)    │        │  + uloženie  │  v momente alertu (+ verzia pravidiel)
                 └──────────────┘        └──────┬───────┘
                                                ├──────────────▶ 6. Notifikácia (Telegram/Discord)
                                                ├──────────────▶ 7. Skóre modelu (ak existuje)
                                                ▼
                                  ┌──────────────────────────┐
         po N sviečkach ────────▶ │ 8. Outcome engine        │  čo sa stalo potom (TP/SL, MFE/MAE)
                                  └────────────┬─────────────┘
                                               ▼
                                  ┌──────────────────────────┐
             kamarát ───────────▶ │ 9. Label UI (prehliadač) │  graf pred/po alerte + tlačidlá
                                  └────────────┬─────────────┘
                                               ▼
                                  ┌──────────────────────────┐
                                  │ 10. Dataset → tréning    │  purged walk-forward CV
                                  │     (lokálne / RunPod)   │  → models/model.joblib
                                  └──────────────────────────┘
```

Celé je to **jeden malý Python projekt**, nie framework. Dva procesy: `scanner` (beží stále)
a `label-ui` (webová stránka pre kamaráta). Tréning sa spúšťa ručne.

---

## 2. Kľúčové architektonické rozhodnutia

| # | Rozhodnutie | Prečo |
|---|---|---|
| A | **Ukladať iba 1m sviečky, vyššie TF skladať samy** | Konzistentné sviečky, 4h je dostupné aj keď ho zdroj nemá, žiadne rozdiely medzi živým behom a históriou. |
| B | **Signály iba na uzavretých sviečkach** | Žiadne „prekresľovanie“: alert sa už nezmení, keď sviečka dobehne. |
| C | **Snapshot features sa zamrazí pri vzniku alertu** a uloží s `feature_version` a `rules_hash` | Keď neskôr zmeníte pravidlá alebo features, staré labely zostanú použiteľné a viete, s čím boli vytvorené. |
| D | **Jedna funkcia na výpočet features** pre živý beh aj tréning | Najčastejšia chyba ML v tradingu: v tréningu iné features ako naživo. |
| E | **Multi-TF zarovnanie podľa času zatvorenia sviečky** | Alert na 15m o 10:15 smie vidieť iba 1h sviečku, ktorá sa uzavrela do 10:00, nie tú, ktorá končí o 11:00 (lookahead). |
| F | **Pravidlá = primárny model, ML = filter (meta-labeling)** | Pravidlá (RSI 80/20, MACD, MA, objem) navrhnú, model iba povie „toto ber / toto nie“. Pri malom počte labelov to funguje oveľa lepšie, než keby sa model učil obchodovať od nuly. |
| G | **Historický backfill alertov** | Kamarát môže začať označovať hneď na histórii, netreba čakať týždne na živé alerty. |
| H | **Kamarát môže označiť aj „premeškaný vstup“** (miesto bez alertu) | Inak dataset obsahuje iba to, čo pravidlá našli, a neviete, čo im uniká. |

---

## 3. Zdroje dát pre zlato a striebro

Pri zlate je dôležitý **objem**: spot XAU/USD (forex) nemá centrálny objem, iba „tick volume“.
Skutočný objem majú **futures na COMEX** (GC = zlato, SI = striebro, MGC = mikro zlato).

| Zdroj | Inštrument | Cena | Objem | História | Real-time | Poznámka |
|---|---|---|---|---|---|---|
| **yfinance** | `GC=F`, `SI=F` | zadarmo | skutočný (futures) | 1m ~7 dní, 5–30m ~60 dní, 1h ~2 roky | nie, bezplatné CME dáta sú štandardne oneskorené ≥ 10 min | neoficiálne API, na MVP stačí |
| **OANDA v20** | `XAU_USD`, `XAG_USD` | zadarmo (demo účet) | tick volume | roky, 5000 sviečok/request | áno | dobré na živé ceny |
| **Dukascopy** (`tick-vault`) | `XAUUSD`, `XAGUSD` | zadarmo | tick volume | ticky ~15+ rokov | nie | ideálne na hromadnú históriu na tréning |
| **Databento** | CME `GC`, `SI`, `MGC` | platené, $125 kredit zadarmo | skutočný, presný | 15+ rokov, 1s/1m | áno (platené) | najkvalitnejšie dáta |
| **ccxt** (krypto burzy) | `PAXG/USDT`, `XAUT/USDT` | zadarmo | skutočný, ale krypto trh | podľa burzy | áno, 24/7 | iný trh, iné správanie, iba ako doplnok |

**Odporúčanie:**
- **Fáza 1 (MVP):** yfinance `GC=F`. Zadarmo, skutočný objem. Skener **ukladá každú 1m sviečku**,
  takže si postupne budujete vlastnú históriu a obídete limit 7 dní.
- **Fáza 2:** na živé ceny OANDA (real-time), objem naďalej z `GC=F`.
  Na tréning stiahnuť roky histórie z Dukascopy alebo z Databento (kredit $125 na začiatok stačí).
- Zdroj dát je za jedným rozhraním (`DataProvider`), takže sa dá vymeniť bez zmeny ostatného kódu.

Pozor na **rollovanie futures** (GC=F preskočí na ďalší kontrakt → cenová medzera; detegovať a vylúčiť z outcomes) a na
**obchodné hodiny CME** (nedeľa až piatok, denná prestávka 1 h). Denné sviečky skladať podľa CME
session (začiatok 17:00 Chicago), nie podľa polnoci UTC.

---

## 4. Ukladanie dát

**Fáza 1: jeden súbor SQLite** (v režime WAL). 1m zlata za 10 rokov ≈ 3,5 mil. riadkov, to SQLite zvládne.
Záloha = skopírovať jeden súbor. Ak dáta neskôr narastú (veľa symbolov, ticky), sviečky sa presunú do
**Parquet + DuckDB** a alerty/labely zostanú v SQLite.

Tabuľky:

| Tabuľka | Obsah |
|---|---|
| `candles_1m` | symbol, open_time, OHLCV, source |
| `alerts` | id, symbol, timeframe, bar_time, signal, direction, price, volume_ratio, `features` (JSON), `feature_version`, `rules_hash`, `model_score`, `model_version`, source (live/backfill), created_at. UNIQUE (symbol, tf, bar_time, signal) |
| `outcomes` | alert_id, výsledok triple-barrier pre long aj short, výnosy po 5/10/20 sviečkach, MFE, MAE |
| `labels` | alert_id, labeler, label, confidence, note, `saw_future` (videl, čo sa stalo potom), created_at. Viac ľudí môže označiť ten istý alert |
| `events` | makro kalendár (CPI, NFP, FOMC, PCE): čas, typ |
| `manual_marks` | „premeškané vstupy“: symbol, tf, bar_time, smer, labeler, poznámka |

**Taxonómia labelov** (na doladenie s kamarátom):
`LONG` (dobrý vstup long) · `SHORT` (dobrý vstup short) · `NEVSTUPOVAŤ` · `NEVIEM`
\+ istota 1–3 + voliteľná poznámka (prečo).

**Kvalita labelov:** krátke písomné pravidlá „čo je dobrý vstup“ (horizont, R:R, správy), ~10 % alertov
ukázať znova naslepo a merať zhodu (Cohenovo kappa). Keď existuje model, časť alertov vyberať podľa neistoty
modelu (active learning) a časť náhodne.

---

## 5. Signály (primárne pravidlá)

Na každom TF (5m, 15m, 1h, 4h, 1d), všetko konfigurovateľné v `config.yaml`:

- **RSI(14)**: vstup nad 80 / pod 20 aj návrat z pásma. **Kandidáti pri 70/30 a 75/25 sa ukladajú do DB bez
  notifikácie**, takže vlastné dáta neskôr ukážu, ktorý prah je na zlate lepší. Voliteľný ADX filter notifikácií (ADX > 30 → RSI extrém nehlásiť)
- **MACD(12,26,9)**: prekríženie signálnej čiary, voliteľne prekríženie nuly
- **MA**: EMA 9/21, 50/200 (golden/death cross), cena cez MA200
- **Objem**: spike ≥ 2× priemer posledných 20 sviečok; ku každému alertu sa ukladá `volume_ratio`
  a dá sa nastaviť filter „hlás iba s potvrdením objemom“ (alert sa uloží vždy, filter ovplyvní iba notifikáciu)
- Neskôr: konfluencia (viac signálov naraz / naprieč TF), divergencie RSI/MACD (až po potvrdení pivotu)
- Princíp: **logovať viac, než hlásiť.** Do DB ide každý kandidát, notifikácia iba pre to, čo prejde filtrami.

---

## 6. Outcome engine (čo sa stalo po alerte)

Pre každý alert, keď je k dispozícii dosť budúcich sviečok:
- **Triple-barrier** (López de Prado): TP = 2× ATR, SL = 1× ATR, timeout 20 sviečok, pre long aj short
- **Trend-scanning**: horizont s najsilnejším trendom (t-štatistika sklonu) a jeho smer
- sviečky cez roll futures sa vylúčia
- výnos po 5/10/20 sviečkach, **MFE/MAE** (max. zisk / max. strata počas držania)

Načo:
1. kamarát to vidí v UI ako pomôcku,
2. **automatické labely** na predtréning, kým nie je dosť ručných,
3. porovnanie: v čom sa kamarát líši od mechanického TP/SL (to je presne tá pridaná hodnota, ktorú sa má model naučiť).

---

## 7. ML model (beží na 4 CPU)

Úloha: **klasifikácia tabuľkových dát** (features v momente alertu → `vstúpiť / nevstúpiť`, prípadne `long/short/skip`).
Labelov bude spočiatku málo (stovky). To rozhoduje o výbere modelu:

| Model | Kedy | CPU inferencia | Poznámka |
|---|---|---|---|
| **Logistická regresia** | < 500 labelov, baseline | µs | vždy ako porovnanie, ťažko sa preučí |
| **LightGBM** ⭐ | ≥ 500 labelov | < 1 ms | štandard pre tabuľkové dáta a meta-labeling, rýchly tréning na CPU; pri malých dátach silná regularizácia |
| **TabPFN v2 / 2.5** | 100 – 10 000 (až 50 000) riadkov | sekundy na CPU | predtrénovaný transformer na malé tabuľky, často presnejší ako boosting pri malých dátach; tu sa oplatí GPU na RunPode |
| **MiniRocket** (sktime) | neskôr, z „surových“ okien sviečok | ms | veľmi rýchla klasifikácia časových radov na CPU, doplnok k ručným features |
| Chronos-Bolt tiny / IBM TTM | voliteľne, fáza 3+ | 10–100 ms | predpovedajú cenu, neklasifikujú; dajú sa použiť iba ako extra feature |
| LSTM / veľký Transformer | **neodporúčam** | – | na stovky labelov sa preučia; potrebujú desaťtisíce príkladov |

**Odporúčanie:** logreg (baseline) + **LightGBM** (hlavný model) + **TabPFN** na porovnanie, kým je labelov málo.
Všetky tri bežia na 4 jadrách bez problémov. Inferencia je pri jednom alerte zanedbateľná.

**Realistické očakávania:** akademické práce na smer zlata dosahujú ~55–59 % a samotné Bollinger pásma ~58 %.
Cieľ modelu nie je „predpovedať trh“, ale **odfiltrovať alerty, ktoré by kamarát zamietol**.

**Validácia (kritické, inak budú výsledky klamať):**
- **purged walk-forward CV s embargom**: trénovať na minulosti, testovať na budúcnosti a vyhodiť
  vzorky, ktorých budúce okno (max_bars) zasahuje do testu,
- žiadne náhodné miešanie riadkov,
- metriky: precision pri top-k skóre, balanced accuracy, kalibrácia a hlavne
  **„keby som bral iba alerty so skóre > θ“ vs. „všetky alerty“** (zlepšuje model vôbec niečo?),
- poradie podľa času, oddelený záverečný test na najnovších dátach,
- **SHAP** vysvetlenie ku každému skóre (kamarát vidí, prečo model hovorí áno/nie).

**Features (pre zlato):**
- na každom TF: RSI, MACD / ATR, histogram / ATR, vzdialenosť ceny od MA v násobkoch ATR, sklon MA,
  volume_ratio, ATR %, **ADX ±DI, Bollinger %B a šírka**, výnosy 1/5/20 sviečok, pozícia v rozsahu posledných N sviečok
- fáza 2: **sklon OBV, vzdialenosť od VWAP** (ukotvený na CME seansu); fáza 3: Stochastic, Supertrend, Donchian,
  Keltner squeeze, divergencie, úrovne (predch. denný high/low, okrúhle čísla)
- kontext vyšších TF (trend na 1h/4h/1d)
- čas: hodina, deň, session (Ázia / Londýn / New York, počítané v lokálnom čase burzy kvôli letnému času)
- **makro kalendár:** minúty od/do CPI, NFP, FOMC (CPI má na zlato najväčší krátkodobý vplyv)
- **fáza 2, makro:** DXY, US10Y, reálne výnosy (FRED DFII10), pomer zlato/striebro, S&P 500,
  vzdialenosť od dôležitých správ (CPI, NFP, FOMC). Vzťah zlata k reálnym výnosom a k doláru
  sa v čase mení, preto ich treba overiť na vlastných dátach, nie predpokladať.

---

## 8. RunPod

Úprimne: **logreg a LightGBM sa na 4 CPU natrénujú za sekundy až minúty**, RunPod na ne netreba.
RunPod (GPU) sa oplatí na:
- TabPFN na väčších datasetoch,
- hromadné ladenie hyperparametrov (Optuna),
- predtréning na rokoch 1m histórie s automatickými labelmi,
- neskôr MiniRocket alebo fine-tuning Chronos.

Postup: `export` datasetu (Parquet) → Docker image s rovnakým kódom → `train` na RunPode →
`models/model.joblib` + `metrics.json` späť → skener ho načíta. Kód tréningu je ten istý lokálne aj na RunPode.

---

## 9. Open-source projekty: čo použiť a čo nie

| Projekt | Licencia | Využitie pre nás |
|---|---|---|
| **freqtrade + FreqAI** | GPL-3 | inšpirácia (pipeline features, pravidelný pretrénovanie); zameraný na krypto a obchodovanie, na CME zlato a „iba alerty“ zbytočne veľký |
| **Microsoft Qlib** | MIT | inšpirácia pre features (Alpha158) a LightGBM workflow; zameraný na akcie |
| **NautilusTrader** | LGPL | profesionálny engine, keby ste raz chceli automatické obchodovanie; teraz zbytočný |
| **vectorbt / backtesting.py** | – | rýchle overenie, či filter modelu zlepšuje výsledky |
| **Label Studio** | Apache-2 | vie labelovať časové rady, ale **nie sviečkový graf**, preto radšej vlastné UI |
| **streamlit + lightweight-charts** (TradingView) | Apache-2 | ⭐ UI na labelovanie: graf ako na TradingView, značky alertov, tlačidlá |
| **tick-vault** | – | sťahovanie histórie z Dukascopy |
| **LightGBM, scikit-learn, TabPFN, sktime** | MIT/BSD/… | modely |

**Odporúčanie:** neprebrať celý framework. Všetky sú postavené okolo zadávania obchodov, a to
nechceme. Malý vlastný pipeline (rádovo 1–2 tisíc riadkov) z overených knižníc je jednoduchší na
pochopenie aj na úpravy. Triple-barrier a purged CV sú ~50 riadkov každé, napíšeme ich sami
(knižnice ako mlfinlab sú dnes platené alebo neudržiavané).

---

## 10. Nasadenie

Jeden malý server alebo domáci PC (4 CPU, 4–8 GB RAM):
- `scanner`: beží stále (systemd alebo Docker), každú minútu
- `label-ui`: Streamlit, prístup pre kamaráta cez heslo alebo cez Tailscale (nie otvorený do internetu)
- denná záloha `ktma.sqlite`
- `docker-compose.yml` pre oba procesy

---

## 11. Plán po fázach

| Fáza | Obsah | Výsledok |
|---|---|---|
| **0** | schválenie tejto architektúry | – |
| **1 – MVP** | ingest GC=F 1m, resampler, indikátory, pravidlá, SQLite, Telegram, backfill, outcomes, testy | alerty chodia a ukladajú sa |
| **2 – Labelovanie** | Streamlit UI s grafom, labely + premeškané vstupy, export datasetu | kamarát označí prvých 300–500 alertov |
| **3 – Model** | logreg / LightGBM / TabPFN, purged CV, report, skóre v alertoch | alert s pravdepodobnosťou „dobrý vstup“ |
| **4 – Rozšírenie** | striebro, OANDA real-time, história z Dukascopy/Databento, makro features, RunPod | lepší model |

---

## 12. Otvorené otázky (treba rozhodnúť)

1. **Živé dáta:** stačí na začiatok yfinance (zadarmo, pravdepodobne ~10 min oneskorenie), alebo hneď OANDA demo (real-time)?
2. **Timeframy:** 5m, 15m, 1h, 4h, 1d, alebo aj 1m?
3. **Kde to pobeží:** domáci PC / VPS / RunPod CPU pod?
4. **Labely:** sedí `LONG / SHORT / NEVSTUPOVAŤ / NEVIEM` + istota 1–3? Má kamarát zadávať aj ideálny SL/TP?
5. **Notifikácie:** Telegram, Discord, alebo oboje?

---

### Zdroje
- Meta-labeling: [Wikipedia](https://en.wikipedia.org/wiki/Meta-Labeling), [Jesse docs](https://docs.jesse.trade/docs/research/ml/meta-labeling), [Insper thesis](https://repositorio.insper.edu.br/entities/publication/14261761-ee4f-4466-91e4-771dd445f258/full)
- Purged CV / triple barrier: [quantt.co.uk](https://www.quantt.co.uk/resources/purged-cross-validation), [fynance](https://fynance.readthedocs.io/en/master/_modules/fynance/features/labels.html), [wraquant](https://wraquant.readthedocs.io/en/latest/_modules/wraquant/ml/preprocessing.html)
- TabPFN: [PyPI](https://pypi.org/project/tabpfn/), [Hugging Face](https://huggingface.co/Prior-Labs/TabPFN-v2), [Thoughtworks Radar](https://www.thoughtworks.com/en-us/radar/tools/tabpfn)
- MiniRocket: [arXiv 2012.08791](https://arxiv.org/pdf/2012.08791), [MultiRocket](https://arxiv.org/pdf/2102.00457)
- Chronos-Bolt / TTM: [AutoGluon Chronos](https://auto.gluon.ai/1.5/_modules/autogluon/timeseries/models/chronos/model.html), [chronos-bolt-tiny](https://www.promptlayer.com/models/chronos-bolt-tiny)
- Dáta: [tick-vault](https://github.com/keyhankamyar/TickVault), [oandapyV20](https://github.com/hootnot/oanda-api-v20), [Databento pricing](https://databento.com/pricing), [Databento MGC](https://databento.com/catalog/cme/GLBX.MDP3/futures/MGC)
- Úložisko: [DuckDB vs SQLite](https://www.analyticsvidhya.com/blog/2026/01/duckdb-vs-sqlite/)
- Open-source: [freqtrade](https://www.greptile.com/grepository/freqtrade), [Qlib](https://pypi.org/project/pyqlib), [Label Studio time series](https://labelstud.io/blog/release-080-time-series-labeling.html), [streamlit-lightweight-charts](https://pypi.org/project/streamlit-lightweight-charts/), [lightweight-charts-python](https://github.com/wenli/lightweight-charts-python)
- Makro pre zlato: [Axiory: reálne výnosy a dolár](https://axiory.com/education/metals-trading-series/advanced-guide-to-trading-gold-xau-usd-how-to-use), [FXCM](https://www.fxcm.com/uk/insights/higher-real-yields-continue-to-pressure-gold/)
