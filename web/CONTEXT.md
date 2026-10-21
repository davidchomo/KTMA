# Nexus chart (branch2, `web/`) – working context

Read this first; it replaces re-reading the whole code. Keep it up to date when you change structure.

## Deploy / run
- Branch `branch2`, repo `C:\Users\kamil\KTMA` (github davidchomo/KTMA, public). Commit + `git push origin branch2`.
- VPS `root@79.143.187.76`: `cd /root/ktma-b2 && git pull -q && docker compose -p ktma-b2 up -d --build web`
  → https://ktma.mirasolen.eu/v2/ (Caddy `handle_path /v2/*` → 127.0.0.1:8502, basic auth). Never touch prod (/root/ktma) or valheim/ai-model.
- Local test: `ssh -N -L 8602:127.0.0.1:8502 root@79.143.187.76` + scratchpad `serve.mjs` (port 8701: static from disk, /api proxied)
  + `cdp.mjs steps.json` (headless Chrome via CDP: goto / eval / wait / shot). Wrap evals in `(()=>{…})()`.
- Bump `?v=N` in index.html on every deploy (cache).

## Files (static/, plain scripts, no build; load order in index.html)
| file | global | what |
|---|---|---|
| lightweight-charts 5.2.1 | `LightweightCharts` | chart lib (`/lib/`) |
| studies.js | `KS` | indicators (`KS.STUDIES`, `osc()`, `P/H/LV` plot helpers), candle patterns (`PATTERNS`) |
| ui.js | `UI` | `$ $$ esc LS openMenu closeMenu place openDialog closeDialog edges colorPopover swatch opts toast rgba` |
| drawings.js | `DR` | drawing tools: `tool(id, group, name, icon, nPoints, geom, extra)`; geom returns prims `line/poly/ell/text/box/img`; groups incl. `text`, `content` (Text button) |
| autotl.js | `TL` | auto trendlines/levels, `TL.ideas()` live trade ideas, `TL.stats()` |
| backgrounds.js | `BG` | drawn SVG scenes, colour THEMES |
| technicals.js | `TA` | TradingView-like ratings, pivots |
| library.js | `LIB` | Knižnica page (candles, chart patterns, STRATS, TIPS); `LIB.show(tab,id)` |
| flow.js | `FLOW` | 🌊 tape window (Binance aggTrade WS) |
| nexus.js | `NEXUS` (also `window.NEXUS`) | ◆ HUD, Nexus home screen (apps/windows/cloud/board, classic view, designs), paper accounts `A()`, robot, position cards, trade ticket, chart lines/markers API |
| app.js | (IIFE) | everything else: state `S`, chart, toolbar, menus, chat, news, scan, replay, layouts/workspaces, styles, animations, videos |

app.js sections (grep `// ---- `): state/save/undo · data (fetchBars, live WS) · CandleView custom series · Bubbles · TradeLines (drag SL/TP) · toolbar · indicator menus · settings(tab) · idea window · replay · auto lines · scan · chat (+folders, ask Claude) · volume menu · workspaces/layout (GRIDS, embed panes) · Text menu · ⊞ launcher (FUNCS) · ws dock · side toolbar · styles/anims/videos · ctx menus · news · technicals · library · keyboard · start.

## State
- `S` = merge(DEF, localStorage `nx2`), synced to `/api/prefs/{labeler}` (debounced). Embed panes use key `nx2:pane<ws>-<n>` and never sync.
- Undo history snapshots S minus `HIST_SKIP` (windows, accounts, board, workspaces, layout…).
- Paper accounts: `S.accounts[]`, `S.accountId` (nexus `A()`), positions {id,symbol,dir,lots,lots0,entry,sl,tp,tps[],best,worst,time,src}.

## Server (server.py, FastAPI)
- `/api/meta`, `/api/candles` (bars `[t,o,h,l,c,v,buyVol]`, Binance klines/aggTrades; futures WS = `wss://fstream.binance.com/market/ws/`), alerts/labels/marks/progress (scanner DB), prefs, chat (+`/api/ask` Claude via ktma/assistant.py), news, calendar.
- SYMBOLS dict at top.

## Conventions / gotchas
- UI text Slovak; code comments English, sparse. Match surrounding style (long one-liners).
- **Editing with node scripts:** `String.replace` treats `$$`/`$&` specially → use `s.split(x).join(y)`. Heredocs with long text break in this shell → write snippet files with the Write tool and splice. Files are LF.
- `const X` in a classic script is NOT `window.X` → export explicitly when needed from iframes.
- `/api/candles` limit ≥ 10.
- Toolbar space is tight: `fitToolbar()` shrinks labels → icons; prefer adding to ⊞ launcher / existing windows.

## Plan / backlog (update as you go)
- [x] Nexus home screen, accounts, board, workspaces (1–10 charts), Text tools, videos, effects.
- [ ] Remove extra crypto/metals symbols; keep XAU, XAG, BTC + forex (EURUSD; others if Binance has them).
- [ ] Toolbar declutter: Štýly → into Nastavenia; Chat + Správy → one window with tabs.
- [ ] 🧠 Algo window: researched strategies (signals + backtest on our data, honest win-rate/PF), auto-run on symbols/TFs, broadcast signals (chat channel, optional Telegram), paper auto-trade.
- [ ] Shared accounts on the server: invite code, roles view/trade, friend sees & trades the same paper account (optimistic `rev`).
