"""SQLite storage: candles, alerts (with frozen feature snapshots), trendlines,
outcomes and human labels. One file, WAL mode, safe for one writer (scanner)
plus readers (label UI)."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

SCHEMA = """
CREATE TABLE IF NOT EXISTS candles (
    symbol TEXT NOT NULL, timeframe TEXT NOT NULL, open_time INTEGER NOT NULL,
    open REAL, high REAL, low REAL, close REAL, volume REAL, source TEXT,
    PRIMARY KEY (symbol, timeframe, open_time)
);
CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL, timeframe TEXT NOT NULL, bar_time INTEGER NOT NULL,
    signal TEXT NOT NULL, direction TEXT NOT NULL, price REAL,
    rsi REAL, volume_ratio REAL, atr REAL,
    notify INTEGER NOT NULL DEFAULT 0, notified INTEGER NOT NULL DEFAULT 0,
    details TEXT, features TEXT, lines TEXT,
    feature_version INTEGER, rules_hash TEXT,
    model_score REAL, model_version TEXT,
    source TEXT, created_at TEXT,
    UNIQUE (symbol, timeframe, bar_time, signal)
);
CREATE INDEX IF NOT EXISTS ix_alerts_time ON alerts (bar_time);
CREATE TABLE IF NOT EXISTS trendlines (
    line_id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL, timeframe TEXT NOT NULL, kind TEXT NOT NULL,
    t1 INTEGER, p1 REAL, t2 INTEGER, p2 REAL, slope_per_bar REAL,
    touches INTEGER, created_time INTEGER, ended_time INTEGER, end_reason TEXT
);
CREATE TABLE IF NOT EXISTS outcomes (
    alert_id INTEGER PRIMARY KEY REFERENCES alerts(id),
    long_result INTEGER, long_bars INTEGER, short_result INTEGER, short_bars INTEGER,
    mfe_atr REAL, mae_atr REAL, trend_scan_t REAL, trend_scan_bars INTEGER,
    gap_flag INTEGER, data TEXT, computed_at TEXT
);
CREATE TABLE IF NOT EXISTS labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_id INTEGER NOT NULL REFERENCES alerts(id),
    labeler TEXT NOT NULL,
    label TEXT NOT NULL,            -- LONG | SHORT | SKIP | UNSURE
    correct INTEGER,                -- was the alert's own direction right? 1/0/NULL
    confidence INTEGER,             -- 1..3
    entry REAL, stop_loss REAL, take_profit REAL, break_even REAL,
    lines_quality TEXT,             -- GOOD | BAD | MISSING | NULL
    note TEXT, saw_future INTEGER, created_at TEXT,
    UNIQUE (alert_id, labeler)
);
CREATE TABLE IF NOT EXISTS manual_marks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT, timeframe TEXT, bar_time INTEGER, direction TEXT,
    entry REAL, stop_loss REAL, take_profit REAL, labeler TEXT, note TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS assistant_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_id INTEGER, labeler TEXT, question TEXT, answer TEXT, model TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS prefs (
    key TEXT PRIMARY KEY, value TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS scan_state (
    symbol TEXT, timeframe TEXT, last_bar_time INTEGER,
    PRIMARY KEY (symbol, timeframe)
);
"""

ALERT_COLUMNS = [
    "symbol", "timeframe", "bar_time", "signal", "direction", "price", "rsi", "volume_ratio", "atr",
    "notify", "details", "features", "lines", "feature_version", "rules_hash",
    "model_score", "model_version", "source", "created_at",
]


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Store:
    def __init__(self, path: str | Path):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(path), timeout=30, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA synchronous=NORMAL")
        self.conn.executescript(SCHEMA)
        self.conn.commit()

    def close(self):
        self.conn.close()

    # ---- candles -------------------------------------------------------
    def upsert_candles(self, symbol: str, timeframe: str, df: pd.DataFrame, source: str,
                       replace: bool = True) -> int:
        if df.empty:
            return 0
        verb = "INSERT OR REPLACE" if replace else "INSERT OR IGNORE"
        rows = [
            (symbol, timeframe, int(r.open_time), float(r.open), float(r.high), float(r.low),
             float(r.close), float(r.volume) if pd.notna(r.volume) else None, source)
            for r in df.itertuples(index=False)
        ]
        self.conn.executemany(f"{verb} INTO candles VALUES (?,?,?,?,?,?,?,?,?)", rows)
        self.conn.commit()
        return len(rows)

    def candles(self, symbol: str, timeframe: str, start: int | None = None, end: int | None = None,
                limit: int | None = None) -> pd.DataFrame:
        q = "SELECT open_time, open, high, low, close, volume FROM candles WHERE symbol=? AND timeframe=?"
        args: list = [symbol, timeframe]
        if start is not None:
            q += " AND open_time >= ?"
            args.append(start)
        if end is not None:
            q += " AND open_time <= ?"
            args.append(end)
        if limit is not None:
            q = f"SELECT * FROM ({q} ORDER BY open_time DESC LIMIT ?) ORDER BY open_time"
            args.append(limit)
        else:
            q += " ORDER BY open_time"
        return pd.read_sql_query(q, self.conn, params=args)

    def last_candle_time(self, symbol: str, timeframe: str) -> int | None:
        row = self.conn.execute(
            "SELECT MAX(open_time) FROM candles WHERE symbol=? AND timeframe=?", (symbol, timeframe)
        ).fetchone()
        return row[0]

    # ---- alerts --------------------------------------------------------
    def insert_alert(self, alert: dict) -> int | None:
        """Insert; returns the new id, or None if this alert already exists."""
        row = {k: alert.get(k) for k in ALERT_COLUMNS}
        for k in ("details", "features", "lines"):
            if row[k] is not None and not isinstance(row[k], str):
                row[k] = json.dumps(row[k], separators=(",", ":"))
        row["notify"] = int(bool(row["notify"]))
        row["created_at"] = row["created_at"] or utcnow_iso()
        cur = self.conn.execute(
            f"INSERT OR IGNORE INTO alerts ({','.join(ALERT_COLUMNS)}) VALUES ({','.join('?' * len(ALERT_COLUMNS))})",
            [row[k] for k in ALERT_COLUMNS],
        )
        self.conn.commit()
        return cur.lastrowid if cur.rowcount else None

    def mark_notified(self, alert_id: int):
        self.conn.execute("UPDATE alerts SET notified=1 WHERE id=?", (alert_id,))
        self.conn.commit()

    def alerts(self, where: str = "1=1", args: tuple = ()) -> pd.DataFrame:
        return pd.read_sql_query(f"SELECT * FROM alerts WHERE {where} ORDER BY bar_time", self.conn, params=args)

    def alert(self, alert_id: int) -> dict | None:
        row = self.conn.execute("SELECT * FROM alerts WHERE id=?", (alert_id,)).fetchone()
        if row is None:
            return None
        d = dict(row)
        for k in ("details", "features", "lines"):
            d[k] = json.loads(d[k]) if d[k] else None
        return d

    # ---- trendlines ----------------------------------------------------
    def upsert_lines(self, symbol: str, timeframe: str, lines: list[dict]):
        rows = [
            (l["line_id"], symbol, timeframe, l["kind"], l["t1"], l["p1"], l["t2"], l["p2"],
             l["slope_per_bar"], l["touches"], l["created_time"], l.get("ended_time"), l.get("end_reason"))
            for l in lines
        ]
        self.conn.executemany("INSERT OR REPLACE INTO trendlines VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)
        self.conn.commit()

    # ---- outcomes ------------------------------------------------------
    def alerts_without_outcome(self) -> pd.DataFrame:
        return pd.read_sql_query(
            "SELECT a.* FROM alerts a LEFT JOIN outcomes o ON o.alert_id = a.id WHERE o.alert_id IS NULL",
            self.conn,
        )

    def save_outcome(self, alert_id: int, o: dict):
        self.conn.execute(
            "INSERT OR REPLACE INTO outcomes VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (alert_id, o["long_result"], o["long_bars"], o["short_result"], o["short_bars"],
             o["mfe_atr"], o["mae_atr"], o["trend_scan_t"], o["trend_scan_bars"], int(o["gap_flag"]),
             json.dumps(o["data"]), utcnow_iso()),
        )
        self.conn.commit()

    def outcome(self, alert_id: int) -> dict | None:
        row = self.conn.execute("SELECT * FROM outcomes WHERE alert_id=?", (alert_id,)).fetchone()
        if row is None:
            return None
        d = dict(row)
        d["data"] = json.loads(d["data"]) if d["data"] else {}
        return d

    # ---- labels --------------------------------------------------------
    def save_label(self, label: dict):
        cols = ["alert_id", "labeler", "label", "correct", "confidence", "entry", "stop_loss",
                "take_profit", "break_even", "lines_quality", "note", "saw_future", "created_at"]
        label = {**label, "created_at": utcnow_iso()}
        self.conn.execute(
            f"INSERT OR REPLACE INTO labels ({','.join(cols)}) VALUES ({','.join('?' * len(cols))})",
            [label.get(c) for c in cols],
        )
        self.conn.commit()

    def labels(self) -> pd.DataFrame:
        return pd.read_sql_query("SELECT * FROM labels ORDER BY created_at", self.conn)

    def label_for(self, alert_id: int, labeler: str) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM labels WHERE alert_id=? AND labeler=?", (alert_id, labeler)
        ).fetchone()
        return dict(row) if row else None

    def save_manual_mark(self, mark: dict):
        cols = ["symbol", "timeframe", "bar_time", "direction", "entry", "stop_loss", "take_profit",
                "labeler", "note", "created_at"]
        mark = {**mark, "created_at": utcnow_iso()}
        self.conn.execute(
            f"INSERT INTO manual_marks ({','.join(cols)}) VALUES ({','.join('?' * len(cols))})",
            [mark.get(c) for c in cols],
        )
        self.conn.commit()

    # ---- assistant -----------------------------------------------------
    def save_assistant(self, alert_id: int, labeler: str, question: str, answer: str, model: str):
        self.conn.execute(
            "INSERT INTO assistant_log (alert_id, labeler, question, answer, model, created_at) VALUES (?,?,?,?,?,?)",
            (alert_id, labeler, question, answer, model, utcnow_iso()))
        self.conn.commit()

    def assistant_history(self, alert_id: int) -> list[tuple[str, str]]:
        rows = self.conn.execute(
            "SELECT question, answer FROM assistant_log WHERE alert_id=? ORDER BY id", (alert_id,)).fetchall()
        return [(q, a) for q, a in rows]

    def assistant_count_last_hour(self) -> int:
        since = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat(timespec="seconds")
        return self.conn.execute("SELECT COUNT(*) FROM assistant_log WHERE created_at >= ?", (since,)).fetchone()[0]

    # ---- UI preferences (chart style, view, layers) per labeler -------
    def get_pref(self, key: str) -> dict | None:
        row = self.conn.execute("SELECT value FROM prefs WHERE key=?", (key,)).fetchone()
        return json.loads(row[0]) if row else None

    def set_pref(self, key: str, value: dict):
        self.conn.execute("INSERT OR REPLACE INTO prefs VALUES (?,?,?)", (key, json.dumps(value), utcnow_iso()))
        self.conn.commit()

    # ---- scan state ----------------------------------------------------
    def get_state(self, symbol: str, timeframe: str) -> int | None:
        row = self.conn.execute(
            "SELECT last_bar_time FROM scan_state WHERE symbol=? AND timeframe=?", (symbol, timeframe)
        ).fetchone()
        return row[0] if row else None

    def set_state(self, symbol: str, timeframe: str, last_bar_time: int):
        self.conn.execute("INSERT OR REPLACE INTO scan_state VALUES (?,?,?)", (symbol, timeframe, last_bar_time))
        self.conn.commit()
