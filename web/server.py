"""Nexus chart (branch2): a minimal full-screen chart with a "trading idea" window for labelling.

Backend only: candles straight from Binance for every symbol and timeframe (1s … 1M; seconds on the
gold/silver futures are built from trades because Binance has no second klines there), and the
scanner's alerts and human labels from the same SQLite the scanner writes.

Run:  uvicorn web.server:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import os
import threading
import time
from pathlib import Path

import pandas as pd
import requests
from fastapi import Body, FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from ktma.config import ROOT, load_config
from ktma.data import gold_market_open
from ktma.describe import (adx_text, confluence_text, direction_text, rsi_text, setup_text, signal_text,
                           symbol_name, trend_arrow, volume_text)
from ktma.storage import Store

STATIC = Path(__file__).parent / "static"
CFG = load_config(os.environ.get("KTMA_CONFIG") or None)
STORE = Store(os.environ.get("KTMA_DB") or CFG["db_path"])

# Symbols in the top-left menu; add more here (Binance futures or spot pairs).
SYMBOLS = {
    "XAUUSD": {"name": "XAU/USD", "desc": "Zlato · spot cena (Binance XAUUSDT)", "market": "futures",
               "ticker": "XAUUSDT", "hours": "gold", "digits": 2},
    "XAGUSD": {"name": "XAG/USD", "desc": "Striebro · spot cena (Binance XAGUSDT)", "market": "futures",
               "ticker": "XAGUSDT", "hours": "gold", "digits": 3},
    "BTCUSD": {"name": "BTC/USD", "desc": "Bitcoin (Binance BTCUSDT)", "market": "spot",
               "ticker": "BTCUSDT", "hours": None, "digits": 2},
}
SECONDS = {"1s": 1, "5s": 5, "15s": 15, "30s": 30}
NATIVE = {"1m": 60, "3m": 180, "5m": 300, "15m": 900, "30m": 1800, "1h": 3600, "2h": 7200, "4h": 14400,
          "6h": 21600, "8h": 28800, "12h": 43200, "1d": 86400, "3d": 259200, "1w": 604800, "1M": 2592000}
TIMEFRAMES = {**SECONDS, **NATIVE}
API = {"futures": ("https://fapi.binance.com/fapi/v1", 1500), "spot": ("https://api.binance.com/api/v3", 1000)}
MAX_REQUESTS = 15          # per candles call: keeps Binance far below its rate limits

app = FastAPI(title="Nexus chart", docs_url=None, redoc_url=None)
http = requests.Session()
_cache: dict = {}
_lock = threading.Lock()


def _get(url: str, params: dict) -> list:
    r = http.get(url, params=params, timeout=20)
    if r.status_code != 200:
        raise HTTPException(502, f"Binance {r.status_code}: {r.text[:200]}")
    return r.json()


def _klines(sym: dict, interval: str, end_ms: int | None, limit: int) -> list[list]:
    """Native Binance klines, newest `limit` bars ending at `end_ms`, oldest first."""
    base, page = API[sym["market"]]
    rows: list[list] = []
    end = end_ms
    for _ in range(MAX_REQUESTS):
        params = {"symbol": sym["ticker"], "interval": interval, "limit": min(page, limit - len(rows))}
        if end is not None:
            params["endTime"] = end
        batch = _get(f"{base}/klines", params)
        if not batch:
            break
        rows = [[int(k[0]), float(k[1]), float(k[2]), float(k[3]), float(k[4]), float(k[5])] for k in batch] + rows
        if len(rows) >= limit or len(batch) < params["limit"]:
            break
        end = int(batch[0][0]) - 1
    return rows


def _bucket(rows, sec: int) -> list[list]:
    """[(t_ms, price/open, high, low, close, volume)] -> `sec`-second OHLCV bars."""
    out: dict[int, list] = {}
    step = sec * 1000
    for t, o, h, l, c, v in rows:
        b = t // step * step
        bar = out.get(b)
        if bar is None:
            out[b] = [b, o, h, l, c, v]
        else:
            bar[2], bar[3], bar[4], bar[5] = max(bar[2], h), min(bar[3], l), c, bar[5] + v
    return [out[k] for k in sorted(out)]


def _seconds(sym: dict, sec: int, end_ms: int | None, limit: int) -> list[list]:
    if sym["market"] == "spot":       # spot has 1s klines
        return _bucket(_klines(sym, "1s", end_ms, min(limit * sec, MAX_REQUESTS * 1000)), sec)
    # Futures: build the bars from aggregated trades, paging backwards by trade id from the newest one.
    base, _ = API["futures"]
    url, ticker = f"{base}/aggTrades", sym["ticker"]
    want_from = (end_ms or int(time.time() * 1000)) - limit * sec * 1000
    budget = MAX_REQUESTS
    if end_ms is None:
        trades = _get(url, {"symbol": ticker, "limit": 1000})           # the newest 1000 trades
        budget -= 1
    else:                                                                # the trades just before `end_ms`
        trades = _get(url, {"symbol": ticker, "startTime": end_ms - 3_600_000, "endTime": end_ms, "limit": 1000})
        budget -= 1
        while len(trades) and budget > 0 and int(trades[-1]["T"]) < end_ms:
            more = [t for t in _get(url, {"symbol": ticker, "fromId": trades[-1]["a"] + 1, "limit": 1000})
                    if int(t["T"]) <= end_ms]
            budget -= 1
            if not more:
                break
            trades = (trades + more)[-1000:]
    while trades and budget > 0 and int(trades[0]["T"]) > want_from and trades[0]["a"] > 0:
        older = _get(url, {"symbol": ticker, "fromId": max(0, trades[0]["a"] - 1000), "limit": 1000})
        budget -= 1
        older = [t for t in older if t["a"] < trades[0]["a"]]
        if not older:
            break
        trades = older + trades
    rows = [(int(t["T"]), float(t["p"]), float(t["p"]), float(t["p"]), float(t["p"]), float(t["q"]))
            for t in trades if int(t["T"]) >= want_from]
    return _bucket(rows, sec)


def _market_hours(sym: dict, tf: str, rows: list[list]) -> list[list]:
    """Gold/silver: drop weekend and daily-break bars of the 24/7 Binance contract (like the scanner)."""
    if sym["hours"] != "gold" or TIMEFRAMES[tf] >= 86400 or not rows:
        return rows
    keep = gold_market_open(pd.Series([r[0] for r in rows])).to_numpy()
    return [r for r, k in zip(rows, keep) if k]


@app.get("/api/meta")
def meta():
    return {"symbols": [{"id": k, **{x: v[x] for x in ("name", "desc", "digits", "market", "ticker", "hours")}} for k, v in SYMBOLS.items()],
            "timeframes": list(TIMEFRAMES), "alertTimeframes": CFG["alert_timeframes"],
            # the scanner's trendline settings, so the in-browser auto lines are exactly the scanner's
            "structure": CFG.get("structure", {}),
            "minTouches": {"line": CFG.get("notify_filters", {}).get("min_line_touches", 3),
                           "level": CFG.get("notify_filters", {}).get("min_level_touches", 2)}}


@app.get("/api/candles")
def candles(symbol: str, tf: str, end: int | None = None, limit: int = Query(1000, ge=10, le=5000),
            hours: bool = True):
    """Bars oldest first as [time_s, open, high, low, close, volume]; the last one may still be forming."""
    sym = SYMBOLS.get(symbol)
    if sym is None or tf not in TIMEFRAMES:
        raise HTTPException(404, "neznámy symbol alebo timeframe")
    key = (symbol, tf, end, limit, hours)
    with _lock:
        hit = _cache.get(key)
        if hit and time.time() - hit[0] < (3 if end is None else 300):
            return hit[1]
    if tf in SECONDS:
        rows = _seconds(sym, SECONDS[tf], end, limit)
    else:
        rows = _klines(sym, tf, end, limit)
    if hours:
        rows = _market_hours(sym, tf, rows)
    out = {"symbol": symbol, "tf": tf, "bars": [[r[0] // 1000, *r[1:]] for r in rows]}
    with _lock:
        if len(_cache) > 300:
            _cache.clear()
        _cache[key] = (time.time(), out)
    return out


# ---- alerts and labels (same tables as the Streamlit label UI) ---------------------------------
@app.get("/api/alerts")
def alert_queue(labeler: str = "", unlabeled: bool = True, notified: bool = True, order: str = "new",
                tfs: str = "", symbol: str = ""):
    where, args = ["1=1"], []
    if tfs:
        t = tfs.split(",")
        where.append(f"timeframe IN ({','.join('?' * len(t))})")
        args += t
    if symbol:
        where.append("symbol=?")
        args.append(symbol)
    if notified:
        where.append("notify=1")
    if unlabeled:
        where.append("id NOT IN (SELECT alert_id FROM labels WHERE labeler=?)")
        args.append(labeler)
    ordering = {"new": "bar_time DESC", "old": "bar_time ASC", "random": "RANDOM()"}.get(order, "bar_time DESC")
    rows = STORE.conn.execute(
        f"SELECT id, symbol, timeframe, bar_time, signal, direction FROM alerts WHERE {' AND '.join(where)} "
        f"ORDER BY {ordering} LIMIT 500", args).fetchall()
    return [dict(r) for r in rows]


@app.get("/api/alerts/{alert_id}")
def alert(alert_id: int, labeler: str = ""):
    a = STORE.alert(alert_id)
    if a is None:
        raise HTTPException(404, "alert neexistuje")
    d, feats = a.get("details") or {}, a.get("features") or {}
    title, why = signal_text(a["signal"])
    idea = {
        "title": title, "why": why, "direction": direction_text(a["direction"]), "symbol": symbol_name(a["symbol"]),
        "facts": [
            ["Cena", f"{a['price']:.2f}", f"ATR {a['atr'] or 0:.2f}"],
            ["RSI", f"{a['rsi']:.0f}" if a["rsi"] is not None else "–", rsi_text(a["rsi"])],
            ["Objem", f"{a['volume_ratio']:.1f}×" if a["volume_ratio"] is not None else "–", volume_text(a["volume_ratio"])],
            ["ADX", f"{d['adx']:.0f}" if d.get("adx") is not None else "–", adx_text(d.get("adx"))],
            *[[f"Trend {t}", trend_arrow(feats.get(f"{t}__swing_trend")), ""] for t in ("1h", "4h")],
        ],
        "confluence": confluence_text(d.get("confluence")), "setup": setup_text(d.get("setup")),
        "plan": d.get("plan"),
    }
    outcome = STORE.outcome(alert_id)
    return {"id": a["id"], "symbol": a["symbol"], "timeframe": a["timeframe"], "bar_time": a["bar_time"] // 1000,
            "signal": a["signal"], "direction": a["direction"], "price": a["price"], "atr": a["atr"],
            "idea": idea, "label": STORE.label_for(alert_id, labeler) if labeler else None,
            "outcome": {k: outcome.get(k) for k in ("long_result", "short_result", "mfe_atr", "mae_atr")} if outcome else None}


@app.post("/api/labels")
def save_label(label: dict = Body(...)):
    if not label.get("labeler") or not label.get("alert_id") or label.get("label") not in ("LONG", "SHORT", "SKIP", "UNSURE"):
        raise HTTPException(400, "chýba meno, alert alebo rozhodnutie")
    STORE.save_label(label)
    return {"ok": True, **progress(label["labeler"])}


@app.post("/api/marks")
def save_mark(mark: dict = Body(...)):
    """A trading idea on any bar (no alert): direction + entry / SL / TP."""
    if not mark.get("labeler") or mark.get("direction") not in ("bullish", "bearish"):
        raise HTTPException(400, "chýba meno alebo smer")
    STORE.save_manual_mark(mark)
    return {"ok": True}


@app.get("/api/progress")
def progress(labeler: str):
    today = pd.Timestamp.now(tz="UTC").strftime("%Y-%m-%d")
    total, day = STORE.conn.execute(
        "SELECT COUNT(*), COALESCE(SUM(created_at >= ?), 0) FROM labels WHERE labeler=?", (today, labeler)).fetchone()
    return {"total": total, "today": day}


# ---- per-person settings (indicators, drawings, chart look) so they follow you to any device --------
@app.get("/api/prefs/{name}")
def get_prefs(name: str):
    return STORE.get_pref(f"web:{name.strip().lower()}") or {}


@app.put("/api/prefs/{name}")
def put_prefs(name: str, value: dict = Body(...)):
    STORE.set_pref(f"web:{name.strip().lower()}", value)
    return {"ok": True}


# ---- chat: notes for the developers and trading ideas ------------------------------------------------
STORE.conn.execute("""CREATE TABLE IF NOT EXISTS web_chat (
    id INTEGER PRIMARY KEY AUTOINCREMENT, author TEXT, kind TEXT, text TEXT,
    symbol TEXT, timeframe TEXT, bar_time INTEGER, price REAL, created_at TEXT)""")
STORE.conn.commit()
CHAT_KINDS = ("msg", "dev", "idea", "bug")


@app.get("/api/chat")
def chat_list(after: int = 0, limit: int = Query(300, ge=1, le=1000)):
    rows = STORE.conn.execute("SELECT * FROM (SELECT * FROM web_chat WHERE id > ? ORDER BY id DESC LIMIT ?) ORDER BY id",
                              (after, limit)).fetchall()
    return [dict(r) for r in rows]


@app.post("/api/chat")
def chat_post(msg: dict = Body(...)):
    author, text = str(msg.get("author") or "").strip()[:40], str(msg.get("text") or "").strip()[:4000]
    if not author or not text:
        raise HTTPException(400, "chýba meno alebo text")
    kind = msg.get("kind") if msg.get("kind") in CHAT_KINDS else "msg"
    sym = msg.get("symbol") if msg.get("symbol") in SYMBOLS else None
    tf = msg.get("timeframe") if msg.get("timeframe") in TIMEFRAMES else None
    num = lambda k, t: t(msg[k]) if isinstance(msg.get(k), (int, float)) else None
    cur = STORE.conn.execute(
        "INSERT INTO web_chat (author, kind, text, symbol, timeframe, bar_time, price, created_at) VALUES (?,?,?,?,?,?,?,?)",
        (author, kind, text, sym, tf, num("bar_time", int) if sym else None, num("price", float) if sym else None,
         pd.Timestamp.now(tz="UTC").isoformat(timespec="seconds")))
    STORE.conn.commit()
    return dict(STORE.conn.execute("SELECT * FROM web_chat WHERE id=?", (cur.lastrowid,)).fetchone())


@app.delete("/api/chat/{msg_id}")
def chat_delete(msg_id: int, author: str):
    n = STORE.conn.execute("DELETE FROM web_chat WHERE id=? AND lower(author)=lower(?)", (msg_id, author.strip())).rowcount
    STORE.conn.commit()
    if not n:
        raise HTTPException(403, "zmazať môžeš iba vlastnú správu")
    return {"ok": True}


# ---- static page ---------------------------------------------------------------------------------
@app.get("/")
def index():
    return FileResponse(STATIC / "index.html", headers={"Cache-Control": "no-cache"})


@app.get("/index.html")
def index_redirect():
    return RedirectResponse("./")


app.mount("/lib", StaticFiles(directory=ROOT / "static"), name="lib")
app.mount("/static", StaticFiles(directory=STATIC), name="static")
