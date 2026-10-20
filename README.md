# KTMA – technické alerty na zlato a striebro + labelovanie pre ML

Systém, ktorý **neobchoduje**, iba hlási technické signály (RSI 80/20, MACD, kĺzavé priemery, objem) na
viacerých timeframoch, ukladá kompletný stav trhu ku každému alertu a umožní traderovi označiť, či to bol
správny vstup. Z labelov sa natrénuje model (meta-labeling), ktorý beží na 4 CPU jadrách.

**Stav:** fáza 0, návrh architektúry na schválenie. `ktma/` a `config.yaml` sú iba prvý návrh (indikátory, signály) a po schválení architektúry sa prepíšu.

- [docs/ARCHITEKTURA.md](docs/ARCHITEKTURA.md): návrh systému, rozhodnutia, plán po fázach, otvorené otázky
- [docs/RESEARCH.md](docs/RESEARCH.md): research indikátorov, zlata/striebra, labelovania, ML modelov a open-source projektov

Pôvodný projekt (sumarizácia finančných správ cez LLM) je presunutý v [legacy/news_summarizer/](legacy/news_summarizer/).
