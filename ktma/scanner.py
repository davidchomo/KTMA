"""Pipeline: ingest -> resample -> indicators + structure -> signals ->
feature snapshot -> store -> notify. Same code for live scanning and backfill."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time

import pandas as pd

from .config import all_timeframes, load_config, tf_ms
from .data import resample
from .features import FEATURE_VERSION, build_snapshot, derive_features
from .indicators import add_indicators
from .outcomes import compute_outcome
from .plan import suggest_plan
from .setups import detect_setups
from .confluence import confluence_events
from .signals import detect, should_notify
from .storage import Store
from .structure import StructureEngine, levels_snapshot, line_record, lines_snapshot

log = logging.getLogger(__name__)

STORED_TFS = ["1m", "5m", "15m", "1h"]   # 4h is resampled from 1h on the fly
NATIVE_BOOTSTRAP = ["5m", "15m", "1h"]


def rules_hash(cfg: dict) -> str:
    rules = {k: cfg.get(k) for k in ("indicators", "structure", "signals", "setups", "confluence")}
    return hashlib.sha1(json.dumps(rules, sort_keys=True).encode()).hexdigest()[:10]


def _r(v):
    return None if v is None or pd.isna(v) else round(float(v), 6)


class Scanner:
    def __init__(self, cfg: dict, store: Store, provider, notifier=None, config_path=None):
        self.cfg = cfg
        self.store = store
        self.provider = provider
        self.notifier = notifier
        self.rules_hash = rules_hash(cfg)
        self.config_path = config_path
        self._config_mtime = os.path.getmtime(config_path) if config_path else None

    def reload_config_if_changed(self):
        """Settings edited in the label UI take effect on the next loop."""
        if not self.config_path:
            return
        mtime = os.path.getmtime(self.config_path)
        if mtime == self._config_mtime:
            return
        try:
            cfg = load_config(self.config_path)
        except Exception:
            log.exception("Nové nastavenia sa nedajú načítať, ostávajú staré")
            return
        self._config_mtime = mtime
        self.cfg = cfg
        self.rules_hash = rules_hash(cfg)
        if self.notifier is not None:
            self.notifier = type(self.notifier)(cfg)
        log.info("Nastavenia znovu načítané (rules_hash %s)", self.rules_hash)

    # ---- data ------------------------------------------------------------
    def ingest(self, symbol: str, bootstrap: bool = False) -> int:
        last = self.store.last_candle_time(symbol, "1m")
        since = None if last is None else last - 60 * 60_000
        m1 = self.provider.fetch(symbol, "1m", since_ms=since)
        n = self.store.upsert_candles(symbol, "1m", m1, "provider")
        if bootstrap:
            for tf in NATIVE_BOOTSTRAP:
                native = self.provider.fetch(symbol, tf)
                self.store.upsert_candles(symbol, tf, native, "provider", replace=False)
        if not m1.empty:
            # Rebuild higher TFs from 1m for every bucket the new data touches.
            start = (int(m1["open_time"].iloc[0]) // tf_ms("1h")) * tf_ms("1h")
            src = self.store.candles(symbol, "1m", start=start)
            last_closed = int(src["open_time"].iloc[-1]) + tf_ms("1m")
            for tf in STORED_TFS[1:]:
                self.store.upsert_candles(symbol, tf, resample(src, tf, last_closed), "resample")
        return n

    def candles(self, symbol: str, tf: str, limit: int | None = None) -> pd.DataFrame:
        if tf == "4h":
            h1 = self.store.candles(symbol, "1h", limit=None if limit is None else limit * 4)
            if h1.empty:
                return h1
            return resample(h1, "4h", int(h1["open_time"].iloc[-1]) + tf_ms("1h"))
        return self.store.candles(symbol, tf, limit=limit)

    # ---- analysis ----------------------------------------------------------
    def analyze(self, symbol: str, tf: str, limit: int | None = None):
        raw = self.candles(symbol, tf, limit)
        if len(raw) < 50:
            return None
        f = add_indicators(raw, self.cfg)
        k = self.cfg["structure"]["zigzag_atr"].get(tf, 2.0)
        struct = StructureEngine(self.cfg["structure"], k).run(f)
        for col, arr in struct["state"].items():
            f[col] = arr
        return f, struct, derive_features(f, self.cfg)

    def scan_symbol(self, symbol: str, live: bool = True) -> list[dict]:
        limit = self.cfg["window_bars"] if live else None
        analyzed = {}
        for tf in all_timeframes(self.cfg):
            res = self.analyze(symbol, tf, limit if tf in self.cfg["alert_timeframes"] else
                               (None if not live else max(300, limit // 4)))
            if res is not None:
                analyzed[tf] = res
        frames = {tf: r[0] for tf, r in analyzed.items()}
        feats = {tf: r[2] for tf, r in analyzed.items()}

        new_alerts = []
        for tf in self.cfg["alert_timeframes"]:
            if tf not in analyzed:
                continue
            f, struct, _ = analyzed[tf]
            times = f["open_time"].to_numpy()
            last_done = self.store.get_state(symbol, tf)
            events = detect(f, self.cfg) + struct["events"] + detect_setups(f, tf, self.cfg)
            if (self.cfg.get("confluence") or {}).get("enabled"):
                events += confluence_events(events, self.cfg["confluence"], tf)
            events.sort(key=lambda e: (e["i"], e["signal"]))
            max_age = self.cfg.get("notify_max_age_bars", 15)
            for ev in events:
                i = ev["i"]
                bar_time = int(times[i])
                if last_done is not None and bar_time <= last_done:
                    continue
                row = f.iloc[i]
                alert = self._make_alert(symbol, tf, ev, row, bar_time, frames, feats, struct, times, live)
                alert["notify"] = should_notify(ev, row, tf, self.cfg) and not self._in_cooldown(alert)
                if ev["signal"].startswith("CONFLUENCE") and self.cfg["confluence"].get("require_htf_trend") \
                        and not alert["details"]["confluence"].get("htf"):
                    alert["notify"] = False
                alert_id = self.store.insert_alert(alert)
                if alert_id is None:
                    continue
                alert["id"] = alert_id
                new_alerts.append(alert)
                if live and alert["notify"] and self.notifier and i >= len(f) - max_age:
                    if self.notifier.send(alert):
                        self.store.mark_notified(alert_id)
            self.store.upsert_lines(symbol, tf, [
                {**line_record(l, times), "line_id": f"{symbol}:{tf}:{l.kind}:{int(times[l.i1])}:{int(times[l.i2])}"}
                for l in struct["lines"]
            ])
            self.store.set_state(symbol, tf, int(times[-1]))
        return new_alerts

    def _in_cooldown(self, alert: dict) -> bool:
        bars = self.cfg.get("notify_filters", {}).get("cooldown_bars", 0)
        if not bars:
            return False
        row = self.store.conn.execute(
            "SELECT MAX(bar_time) FROM alerts WHERE symbol=? AND timeframe=? AND signal=? AND notify=1 AND bar_time<?",
            (alert["symbol"], alert["timeframe"], alert["signal"], alert["bar_time"]),
        ).fetchone()
        return row[0] is not None and alert["bar_time"] - row[0] < bars * tf_ms(alert["timeframe"])

    def _make_alert(self, symbol, tf, ev, row, bar_time, frames, feats, struct, times, live) -> dict:
        details = {
            k: _r(row.get(k)) for k in
            ("rsi", "macd", "macd_signal", "macd_hist", "adx", "plus_di", "minus_di", "bb_pctb",
             "vwap", "vwap_sd", "reg_upper", "reg_lower", "atr", "volume")
        }
        details.update({c: _r(row[c]) for c in row.index if c.startswith("ma_")})
        if "line" in ev:
            details["line"] = {k: (round(v, 6) if isinstance(v, float) else v) for k, v in ev["line"].items()}
        if "level" in ev:
            details["level"] = {k: (round(v, 6) if isinstance(v, float) else v) for k, v in ev["level"].items()}
        details["levels"] = levels_snapshot(struct["levels"], ev["i"], times, float(row["close"]),
                                            (self.cfg["structure"].get("levels") or {}).get("min_touches", 2))
        features = build_snapshot(frames, tf, bar_time, feats)
        fams = (ev.get("confluence") or {}).get("families", [])
        want = 1 if ev["direction"] == "bullish" else -1
        htf = [f"{t} {'↑' if want > 0 else '↓'}" for t in ("1h", "4h")
               if features.get(f"{t}__swing_trend") is not None and features[f"{t}__swing_trend"] * want > 0]
        details["confluence"] = {"families": fams, "htf": htf}
        lines_snap = lines_snapshot(struct["lines"], ev["i"], times)
        details["plan"] = suggest_plan(ev["direction"], float(row["close"]), _r(row["atr"]), details, lines_snap,
                                       self.cfg.get("plan"))
        if details["plan"] and details["plan"]["rr"] is not None:
            features["plan__rr"] = details["plan"]["rr"]
            features["plan__risk_atr"] = details["plan"]["risk_atr"]
        features["conf__families"] = len(fams)
        features["conf__htf_agree"] = len(htf)
        if ev.get("extra"):
            details["setup"] = {k: (round(v, 6) if isinstance(v, float) else v) for k, v in ev["extra"].items()}
        details["candidate_only"] = bool(ev.get("candidate"))
        return {
            "symbol": symbol, "timeframe": tf, "bar_time": bar_time,
            "signal": ev["signal"], "direction": ev["direction"],
            "price": float(row["close"]), "rsi": _r(row["rsi"]),
            "volume_ratio": _r(row["volume_ratio"]), "atr": _r(row["atr"]),
            "details": details,
            "features": features,
            "lines": lines_snap,
            "feature_version": FEATURE_VERSION, "rules_hash": self.rules_hash,
            "source": "live" if live else "backfill",
        }

    # ---- outcomes ----------------------------------------------------------
    def update_outcomes(self) -> int:
        pending = self.store.alerts_without_outcome()
        done = 0
        cache: dict = {}
        for a in pending.itertuples(index=False):
            key = (a.symbol, a.timeframe)
            if key not in cache:
                cache[key] = self.candles(a.symbol, a.timeframe)
            o = compute_outcome(cache[key], int(a.bar_time), a.atr, self.cfg)
            if o is not None:
                self.store.save_outcome(int(a.id), o)
                done += 1
        return done

    # ---- loops ---------------------------------------------------------------
    def backfill(self):
        for sym in self.cfg["symbols"]:
            n = self.ingest(sym, bootstrap=True)
            alerts = self.scan_symbol(sym, live=False)
            log.info("%s: %d nových 1m sviečok, %d historických alertov", sym, n, len(alerts))
        log.info("Výsledky (outcomes): %d", self.update_outcomes())

    def run_forever(self, once: bool = False):
        while True:
            started = time.time()
            self.reload_config_if_changed()
            for sym in self.cfg["symbols"]:
                try:
                    self.ingest(sym)
                    alerts = self.scan_symbol(sym, live=True)
                    if alerts:
                        log.info("%s: %d nových alertov", sym, len(alerts))
                except Exception:
                    log.exception("Sken %s zlyhal", sym)
            try:
                self.update_outcomes()
            except Exception:
                log.exception("Outcomes zlyhali")
            if once:
                return
            time.sleep(max(1.0, self.cfg["poll_seconds"] - (time.time() - started)))
