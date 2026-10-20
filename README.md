# KTMA – technické alerty na zlato a striebro + labelovanie pre ML

Systém, ktorý **neobchoduje**, iba hlási technické signály na **XAU/USD** (spotové zlato, neskôr XAG/USD striebro) na
**1m, 5m a 15m** (kontext 1h a 4h). Ku každému alertu uloží kompletný stav trhu a pošle ho na Telegram.
Kamarát-trader potom v prehliadači označí, či to bol správny vstup (LONG/SHORT/NEVSTUPOVAŤ, TRUE/FALSE, vstup, SL,
TP, BE). Z týchto labelov sa neskôr natrénuje model.

**Signály:** RSI 80/20 (+ kandidáti 70/30 a 75/25 iba do DB), MACD, EMA 9/21 a 50/200, cena × EMA 200, objem,
VWAP (± 2σ), Donchian 20/55, regresný kanál, **automatické trendové čiary a kanály** (dotyk, prerazenie,
bez prekresľovania). Stratégie: **Holy Grail**, **Opening Range Breakout**, **Hitchhiker**.

| Dokument | Obsah |
|---|---|
| [docs/ARCHITEKTURA.md](docs/ARCHITEKTURA.md) | návrh systému, rozhodnutia, fázy |
| [docs/RESEARCH.md](docs/RESEARCH.md) | research indikátorov, trendových čiar, zlata/striebra, labelovania a ML |
| [docs/SLOVNIK.md](docs/SLOVNIK.md) | slovník skratiek (SL, TP, BE, R, EV, RSI, VWAP…) a čo robiť v nastaveniach |

Pôvodný projekt (sumarizácia správ cez LLM) je v [legacy/news_summarizer/](legacy/news_summarizer/).

---

## Nasadenie na VPS (Docker + existujúci Caddy)

### 1. Kód a nastavenia
```bash
git clone https://github.com/davidchomo/KTMA.git ~/ktma && cd ~/ktma
git checkout claude/ta-alerts-labeling
cp .env.example .env && nano .env         # Telegram token, chat id, KTMA_LABEL_URL
mkdir -p data
```

**Dáta XAU/USD:** predvolene z **Binance** (zlatý kontrakt XAUUSDT). Netreba žiadny účet ani kľúč, je real-time
a má skutočný objem obchodov. Cena sleduje spotové XAU/USD, rozdiel oproti brokerovi býva pár dolárov. Sviečky mimo
obchodných hodín zlata (víkend, denná pauza 17–18 h New York) sa zahadzujú. Iné zdroje v `config.yaml`:
`oanda` (spot od brokera, treba demo účet a token) alebo `yfinance` s `GC=F` (futures, oneskorené ≥ 10 min).

**Telegram bot:** v Telegrame napíš `@BotFather` → `/newbot` → dostaneš `TELEGRAM_BOT_TOKEN`.
Napíš svojmu botovi ľubovoľnú správu, otvor `https://api.telegram.org/bot<TOKEN>/getUpdates` a z `"chat":{"id":…}`
skopíruj `TELEGRAM_CHAT_ID` (pre skupinu pridaj bota do skupiny, id začína `-`).
Potom v `config.yaml` nastav `notify.telegram: true`.

### 2. Spustenie
```bash
docker compose build
docker compose run --rm scanner python -m ktma test-telegram   # príde skúšobná správa?
docker compose run --rm scanner python -m ktma backfill         # história + historické alerty na labelovanie
docker compose up -d                                            # skener + appka, štartujú aj po reštarte VPS
docker compose logs -f scanner
```

### 3. Pridanie do existujúceho Caddy (bez reštartu, mirasolen.eu beží ďalej)
1. V DNS pridaj **A záznam** `ktma.mirasolen.eu` → IP VPS.
2. Zisti, kde má tvoj Caddy konfiguráciu a akú sieť používa:
   ```bash
   docker inspect valheim-caddy --format '{{.HostConfig.NetworkMode}}'
   docker inspect valheim-caddy --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
   ```
3. Vytvor heslo pre kamaráta:
   ```bash
   docker exec valheim-caddy caddy hash-password --plaintext 'SILNE_HESLO'
   ```
4. Na **koniec** svojho Caddyfile (cesta z kroku 2) pridaj blok z [deploy/Caddyfile.ktma](deploy/Caddyfile.ktma)
   a vlož do neho hash. Ostatné bloky (mirasolen.eu, valheim) nemeň.
   - Sieť `host` → nechaj `reverse_proxy 127.0.0.1:8501`.
   - Iná sieť (bridge) → daj Caddy kontajner do siete `ktma_default`
     (`docker network connect ktma_default valheim-caddy`) a použi `reverse_proxy label-ui:8501`.
5. Skontroluj a načítaj **bez výpadku**:
   ```bash
   docker exec valheim-caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
   docker exec valheim-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
   ```
   `reload` načíta novú konfiguráciu za behu. Keď je v nej chyba, Caddy ju odmietne a pobeží ďalej so starou.

Appka potom beží na `https://ktma.mirasolen.eu`. Certifikát vybaví Caddy sám.

### Prechod z GC=F na XAU/USD
Ak už beží verzia s `GC=F` a ešte nemáte labely, začnite s čistou databázou:
```bash
docker compose down
mv data/ktma.sqlite data/ktma-gcf-old.sqlite; rm -f data/ktma.sqlite-wal data/ktma.sqlite-shm
git pull && docker compose build
docker compose run --rm scanner python -m ktma backfill
docker compose up -d
```

### 💬 Opýtaj sa Clauda (voliteľné)
V appke je pri každom alerte panel, kde sa dá Clauda pýtať na konkrétny alert („je to dobrý vstup?“, „kam SL/TP?“).
Používa váš Claude Code s predplatným, ale **iba na text**: všetky nástroje sú vypnuté (`--tools ""`, `--restricted`),
takže Claude nemôže spúšťať príkazy ani čítať súbory na serveri. Vidí iba dáta alertu, ktoré mu appka pošle.
Počet otázok je obmedzený (`assistant.max_questions_per_hour` v `config.yaml`).

1. Vytvor token (Claude Code je už v Docker image, netreba ho inštalovať na server):
   ```bash
   docker compose run --rm label-ui claude setup-token
   ```
   Otvor vypísaný odkaz v prehliadači, prihlás sa, skopíruj kód späť do terminálu. Vypíše sa token.
2. Vlož ho do `.env`: `CLAUDE_CODE_OAUTH_TOKEN=...`
3. `docker compose up -d` (alebo `--build` po aktualizácii).

Token platí rok a vie iba posielať otázky modelu. Používanie predplatného pre druhú osobu si over v podmienkach
svojho plánu.

### 4. Údržba
```bash
docker compose run --rm scanner python -m ktma stats     # počty sviečok, alertov, labelov
docker compose run --rm scanner python -m ktma backup    # záloha do data/backups/
docker compose run --rm scanner python -m ktma export    # dataset na tréning -> data/dataset.csv
git pull && docker compose up -d --build                 # aktualizácia
```
Denná záloha cez cron: `0 4 * * * cd ~/ktma && docker compose run --rm scanner python -m ktma backup`

---

## Lokálne / bez siete
```bash
pip install -r requirements.txt
python -m ktma demo                                       # syntetické dáta -> data/demo.sqlite
KTMA_DB=data/demo.sqlite python -m ktma label-ui           # http://localhost:8501
python -m pytest -q                                       # testy (vrátane testov „nevidí do budúcnosti“)
```

## Štruktúra
```
ktma/data.py        zdroje dát (Binance, OANDA, yfinance, synthetic), skladanie vyšších TF z 1m
ktma/describe.py    zrozumiteľné popisy signálov a hodnôt (appka aj Telegram)
ktma/indicators.py  RSI, MACD, EMA, ATR, ADX, Bollinger, OBV, VWAP, Donchian, regresný kanál
ktma/structure.py   ATR ZigZag swingy, trendové čiary, paralelné kanály (bez prekresľovania)
ktma/signals.py     pravidlá alertov + filtre notifikácií
ktma/setups.py      stratégie: Holy Grail, Opening Range Breakout, Hitchhiker
ktma/tvchart.py     graf v štýle TradingView (Lightweight Charts)
ktma/assistant.py   💬 Opýtaj sa Clauda (Claude Code bez nástrojov)
ktma/features.py    snapshot features zo všetkých TF (zarovnané podľa uzavretia sviečky)
ktma/outcomes.py    triple-barrier, MFE/MAE, trend-scanning, výsledok plánu (R)
ktma/scanner.py     celý pipeline (živý sken aj backfill)
ktma/storage.py     SQLite (sviečky, alerty, čiary, výsledky, labely)
ktma/notify.py      Telegram
label_app.py        webová appka na labelovanie (Streamlit)
config.yaml         všetky nastavenia (dajú sa meniť aj v appke)
```

## Ďalšia fáza: model
Keď bude ~300–500 labelov: `python -m ktma export` → tréning (logistická regresia ako baseline, LightGBM,
TabPFN) s purged walk-forward validáciou → `models/model.joblib`. Skener potom ku každému alertu pridá skóre.
Podrobnosti v [docs/ARCHITEKTURA.md §7](docs/ARCHITEKTURA.md).
