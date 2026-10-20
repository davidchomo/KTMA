## 📖 Slovník skratiek a pojmov

### Obchod a labely
| Skratka | Význam | Čo s tým robiť |
|---|---|---|
| **Symbol** | označenie inštrumentu. `XAUUSD` = zlato (spot XAU/USD), `XAGUSD` = striebro; `GC=F`/`SI=F` = futures z Yahoo | mení sa v nastaveniach v `symbols` |
| **LONG** | nákup, zarábaš keď cena **rastie** | label „dobrý vstup long“ |
| **SHORT** | predaj, zarábaš keď cena **klesá** | label „dobrý vstup short“ |
| **NEVSTUPOVAŤ** (SKIP) | signál nestojí za obchod | tiež dôležitý label, model sa učí aj z neho |
| **NEVIEM** (UNSURE) | nedá sa povedať | pri tréningu sa vynechá |
| **TRUE / FALSE** | bol signál **správny**? (smer alertu sa potvrdil) | otázka „Bol signál správny?“ pri každom alerte |
| **Istota 1–3** | 1 = tipujem, 3 = úplne jasné | model dá istejším labelom väčšiu váhu |
| **Entry / vstup** (IP – vstupná cena) | cena, za ktorú by si vstúpil | predvyplnená = zatváracia cena sviečky alertu |
| **SL** – stop loss | cena, kde obchod uzavrieš so stratou | predvyplnený 1× ATR od vstupu, posuň podľa grafu |
| **TP** – take profit | cena, kde vyberieš zisk | predvyplnený 2× ATR od vstupu |
| **BE** – break-even | cena, pri ktorej by si posunul SL na vstup (obchod už nemôže prerobiť) | voliteľné, 0 = nepoužívaš |
| **R** | jednotka rizika = vzdialenosť vstup → SL. Zisk 2R = dvojnásobok rizika | výsledky sa merajú v R, nie v dolároch |
| **R:R** (risk:reward) | pomer rizika a zisku, napr. 1:2 | appka počíta automaticky |
| **EV** (expected value) | očakávaný výsledok na obchod v R = priemer všetkých výsledkov. EV > 0 = signál sa oplatí | záložka Štatistiky a EV |
| **Win rate** | % obchodov v zisku | pri R:R 1:2 stačí ~34 % na EV > 0 |
| **saw_future** | videl si pri labelovaní, čo sa stalo potom? | režim „Naslepo“ ho vypne |

### Indikátory
| Skratka | Význam | Typické čítanie |
|---|---|---|
| **TF** | timeframe, dĺžka jednej sviečky: `1m`, `5m`, `15m`, `1h`, `4h` | alerty na 1m/5m/15m, 1h/4h je kontext |
| **OHLCV** | Open, High, Low, Close, Volume = otvorenie, maximum, minimum, zatvorenie, objem sviečky | |
| **RSI** | Relative Strength Index, sila pohybu 0–100 | > 80 prekúpené, < 20 prepredané (na zlate) |
| **MACD** | rozdiel EMA 12 a EMA 26 + signálna čiara (EMA 9) + histogram | prekríženie signálnej čiary = zmena momenta |
| **MA / EMA / SMA** | kĺzavý priemer / exponenciálny / jednoduchý | EMA 9/21 krátkodobý, 50/200 dlhodobý trend |
| **Golden / Death cross** | rýchla MA prekríži pomalú nahor / nadol | |
| **ATR** | Average True Range, priemerná veľkosť sviečky (volatilita) | všetky vzdialenosti sú v násobkoch ATR |
| **ADX, +DI, −DI** | sila trendu (ADX) a jeho smer (DI) | ADX > 25–30 = silný trend, nefadovať RSI |
| **BB, %B** | Bollingerove pásma (± 2σ okolo SMA 20), %B = kde je cena v pásme (0 = spodok, 1 = vrch) | |
| **VWAP** | Volume Weighted Average Price, priemerná cena dňa vážená objemom (od 17:00 Chicago) | nad VWAP = kupci majú navrch; ± 2σ pásma = natiahnuté |
| **OBV** | On-Balance Volume, kumulatívny objem podľa smeru | divergencia s cenou = slabnúci pohyb |
| **Vol ×** (volume ratio) | objem sviečky / priemer predch. 20 sviečok (pri XAU/USD tick volume = počet zmien ceny) | 2× a viac = volume spike |
| **Donchian 20/55** | najvyššie maximum / najnižšie minimum posledných 20/55 sviečok | prerazenie = nové maximum/minimum |

### Trendové čiary a kanály
| Pojem | Význam |
|---|---|
| **Opening range** | rozsah (max/min) prvých minút po otvorení seansy |
| **Pullback** | dočasný návrat ceny proti trendu (napr. k EMA 20) |
| **Pivot / swing** | lokálne maximum (H) alebo minimum (L), potvrdené až keď sa cena otočí o k × ATR (ATR ZigZag) |
| **HH / HL / LH / LL** | Higher High, Higher Low (rastový trend) / Lower High, Lower Low (klesajúci trend) |
| **TL** | trendline, trendová čiara cez 2+ pivoty |
| **Support / podpora** | čiara pod cenou (cez minimá) |
| **Resistance / rezistencia** | čiara nad cenou (cez maximá) |
| **Dotyky (touches)** | koľko pivotov leží na čiare; 3+ = silnejšia čiara |
| **Paralelný kanál** | trendová čiara + rovnobežka cez opačný extrém (bodkovaná v grafe) |
| **Regresný kanál** | priamka najmenších štvorcov cez posledných 100 zatvorení ± 2σ (sivá prerušovaná) |
| **Repainting** | indikátor spätne mení minulosť. KTMA to nerobí: čiara vzniká až po potvrdení pivotu |

### Výsledky a ML
| Pojem | Význam |
|---|---|
| **Alert** | jeden signál, ktorý skener našiel |
| **Kandidát** | alert, ktorý sa iba ukladá (napr. RSI 70/30), na Telegram nejde |
| **Backfill** | spätné vytvorenie alertov z histórie, aby sa dalo hneď labelovať |
| **Outcome** | čo sa stalo po alerte (automaticky) |
| **Triple-barrier** | čo cena dosiahla skôr: TP (2 ATR), SL (1 ATR), alebo vypršal čas (20 sviečok) |
| **MFE / MAE** | Maximum Favorable / Adverse Excursion, najväčší pohyb v prospech / proti (v ATR) |
| **Trend-scanning** | horizont s najsilnejším trendom po alerte (t-štatistika) |
| **Gap / roll** | skok ceny pri prechode futures na ďalší kontrakt, výsledok sa označí ⚠️ |
| **Feature** | jedno číslo, ktoré model vidí (napr. `5m__rsi`, `1h__adx`) |
| **Meta-labeling** | pravidlá navrhnú alert, model povie, či ho brať |
| **Model score** | pravdepodobnosť (%), že alert je dobrý vstup (fáza 3) |
| **Kappa** | miera zhody dvoch labelovaní (1 = úplná, 0 = náhoda) |
| **Seansy** | Ázia, Londýn (8–17 Londýn), prekryv Londýn+NY, New York |

### Názvy signálov
| Signál | Kedy |
|---|---|
| `RSI_ABOVE_80` / `RSI_BELOW_20` | RSI vstúpi nad 80 / pod 20 |
| `RSI_EXIT_ABOVE_80` / `RSI_EXIT_BELOW_20` | RSI sa vráti z pásma |
| `RSI_ABOVE_70`, `RSI_BELOW_25`, … | kandidáti iných prahov (iba do DB) |
| `MACD_BULL_CROSS` / `MACD_BEAR_CROSS` | MACD prekríži signálnu čiaru nahor / nadol |
| `MA_9_21_GOLDEN` / `_DEATH`, `MA_50_200_…` | prekríženie kĺzavých priemerov |
| `PRICE_ABOVE_MA_200` / `PRICE_BELOW_MA_200` | cena prekríži EMA 200 |
| `VOLUME_SPIKE_UP` / `_DOWN` | objem ≥ 2× priemer, rastová / klesajúca sviečka |
| `VWAP_CROSS_UP` / `_DOWN` | cena prekríži VWAP |
| `VWAP_UPPER_2SD` / `VWAP_LOWER_2SD` | cena sa dotkne pásma VWAP ± 2σ |
| `TL_BREAK_UP` / `TL_BREAK_DOWN` | zatvorenie nad rezistenciou / pod podporou |
| `TL_TOUCH_RESISTANCE` / `TL_TOUCH_SUPPORT` | dotyk čiary a odraz |
| `CHANNEL_BREAK_UP` / `_DOWN` | zatvorenie mimo regresného kanála |
| `DONCHIAN_BREAK_UP_55` / `_DOWN_55` | nové 55-sviečkové maximum / minimum (20 iba do DB) |
| `HOLY_GRAIL_LONG` / `_SHORT` | Holy Grail: silný trend (ADX > 30), pullback k EMA 20, prerazenie max/min sviečky dotyku |
| `ORB_UP_NY`, `ORB_DOWN_LONDON`, … | Opening Range Breakout: zatvorenie nad/pod rozsahom prvých 15 min seansy |
| `HITCHHIKER_LONG_NY`, … | Hitchhiker: ranný ťah, tesná konsolidácia, jej prerazenie (1m, 5m) |

---

## ⚙️ Čo robiť v nastaveniach

Nastavenia sú v `config.yaml` (záložka ⚙️ v appke). Po uložení si ich skener načíta do minúty.
Pred uložením sa urobí záloha `data/config.yaml.bak`.

| Chcem… | Zmeň |
|---|---|
| pridať striebro | v `symbols` odkomentuj `- XAGUSD` (odstráň `#`) |
| menej správ na Telegram | zvýš `notify_filters.cooldown_bars`, nastav `min_volume_ratio: 1.5`, alebo uber predpony v `only_on` |
| iba alerty potvrdené objemom | `notify_filters.min_volume_ratio: 1.5` (pre 1m `min_volume_ratio_1m`) |
| nehlásiť RSI proti silnému trendu | `notify_filters.rsi_max_adx: 30` |
| iné prahy RSI | `indicators.rsi.overbought / oversold` (kandidáti v `candidate_levels`) |
| iba silné trendové čiary | `notify_filters.min_line_touches: 3` (alebo 4) |
| viac / menej trendových čiar | `structure.zigzag_atr` pre daný TF: väčšie číslo = menej, väčšie swingy |
| citlivejší dotyk čiary | `structure.touch_atr` (0,25 = do štvrtiny ATR) |
| vypnúť skupinu signálov | v `signals` daj `false` (napr. `vwap_band_touch: false`) |
| zapnúť/vypnúť stratégie | `setups.holy_grail.enabled`, `setups.orb.enabled`, `setups.hitchhiker.enabled` |
| ORB z 30 minút namiesto 15 | `setups.orb.range_minutes: 30` |
| iný TP/SL pre automatické výsledky | `outcomes.take_profit_atr / stop_loss_atr` |
| zapnúť Telegram | `notify.telegram: true` + `TELEGRAM_BOT_TOKEN` a `TELEGRAM_CHAT_ID` v súbore `.env` na serveri |

**Pozor:** zmena v `indicators`, `structure` alebo `signals` zmení `rules_hash`. Staré alerty a labely zostanú,
iba budú označené, s akými pravidlami vznikli.
