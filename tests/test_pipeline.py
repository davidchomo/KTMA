import numpy as np
import pandas as pd
import pytest

from ktma.config import load_config, tf_ms
from ktma.data import SyntheticProvider, resample
from ktma.features import aligned_index, derive_features
from ktma.indicators import add_indicators, rsi
from ktma.notify import Notifier, format_alert
from ktma.outcomes import barrier, compute_outcome, trade_result
from ktma.scanner import Scanner
from ktma.signals import detect, should_notify
from ktma.storage import Store
from ktma.structure import StructureEngine, zigzag

END = 1_760_000_000_000 // 60_000 * 60_000


@pytest.fixture(scope="module")
def cfg():
    c = load_config()
    c["notify"] = {"console": False, "telegram": False}
    return c


@pytest.fixture(scope="module")
def m5(cfg):
    return SyntheticProvider(days=8, end_ms=END).fetch("GC=F", "5m")


def test_rsi_extremes():
    up = pd.Series(np.arange(1.0, 60.0))
    assert rsi(up).iloc[-1] == pytest.approx(100.0)
    flat = pd.Series(np.full(40, 5.0))
    assert rsi(flat).iloc[-1] == pytest.approx(50.0)


def test_resample_only_complete_buckets():
    t0 = 1_700_000_100_000 // 300_000 * 300_000
    df = pd.DataFrame({"open_time": t0 + 60_000 * np.arange(12), "open": 1.0, "high": np.arange(12) + 2.0,
                       "low": 0.5, "close": np.arange(12) + 1.0, "volume": 1.0})
    out = resample(df, "5m")
    assert len(out) == 2  # 12 minutes = 2 full 5m buckets + 1 incomplete
    assert out["high"].iloc[0] == 6.0 and out["close"].iloc[1] == 10.0 and out["volume"].iloc[0] == 5.0


def test_zigzag_never_repaints(cfg, m5):
    f = add_indicators(m5, cfg)
    h, l, a = f["high"].to_numpy(), f["low"].to_numpy(), f["atr"].to_numpy()
    full = zigzag(h, l, a, 2.0)
    m = len(f) * 2 // 3
    prefix = zigzag(h[:m], l[:m], a[:m], 2.0)
    assert prefix == [p for p in full if p.confirm_idx < m]
    assert len(full) > 10


def test_structure_no_lookahead(cfg, m5):
    f = add_indicators(m5, cfg)
    eng = StructureEngine(cfg["structure"], 2.0)
    full = eng.run(f)
    m = len(f) * 2 // 3
    part = eng.run(f.iloc[:m].reset_index(drop=True))
    key = lambda e: (e["i"], e["signal"], round(e["line"]["value"], 6))
    assert [key(e) for e in part["events"]] == [key(e) for e in full["events"] if e["i"] < m]
    for k, arr in part["state"].items():
        np.testing.assert_allclose(arr, full["state"][k][:m], equal_nan=True)
    assert any(e["signal"].startswith("TL_BREAK") for e in full["events"])


def test_signals_and_features_no_lookahead(cfg, m5):
    full = add_indicators(m5, cfg)
    m = len(m5) * 3 // 4
    part = add_indicators(m5.iloc[:m].reset_index(drop=True), cfg)
    ev_full = [(e["i"], e["signal"]) for e in detect(full, cfg) if e["i"] < m]
    ev_part = [(e["i"], e["signal"]) for e in detect(part, cfg)]
    assert ev_full == ev_part and len(ev_part) > 50
    eng = StructureEngine(cfg["structure"], 2.0)
    for frame in (full, part):
        for k, v in eng.run(frame)["state"].items():
            frame[k] = v
    pd.testing.assert_frame_equal(derive_features(full, cfg).iloc[:m], derive_features(part, cfg))


def test_aligned_index_uses_closed_bars_only():
    opens = np.array([0, 3_600_000, 7_200_000])  # 1h bars
    assert aligned_index(opens, "1h", 3_600_000) == 0       # bar 0 closed at 1:00
    assert aligned_index(opens, "1h", 3_600_000 + 900_000) == 0  # 1:15 -> bar 1 still open
    assert aligned_index(opens, "1h", 7_200_000) == 1
    assert aligned_index(opens, "1h", 0) == -1


def test_barrier_and_trade_result():
    h = np.array([10.5, 11.0, 13.0])
    l = np.array([9.5, 9.0, 10.0])
    assert barrier(h, l, 10, 12, 8, +1, 5) == (1, 3)
    assert barrier(h, l, 10, 8, 11, -1, 5) == (-1, 2)
    candles = pd.DataFrame({"open_time": [0, 1, 2, 3], "open": 10.0, "high": [10, 10.5, 11, 13],
                            "low": [10, 9.5, 9.0, 10], "close": 10.0, "volume": 1.0})
    r = trade_result(candles, 0, 10.0, 8.0, 12.0)
    assert r["result"] == 1 and r["r_multiple"] == pytest.approx(1.0) and r["rr"] == pytest.approx(1.0)


def test_end_to_end_scanner(cfg, tmp_path):
    c = {**cfg, "db_path": str(tmp_path / "t.sqlite"), "window_bars": 800}
    store = Store(c["db_path"])
    prov = SyntheticProvider(days=10, end_ms=END)  # >= 50 bars of 4h context
    sent = []

    class FakeNotifier:
        def send(self, alert):
            sent.append(alert)
            return True

    s = Scanner(c, store, prov, FakeNotifier())
    s.ingest("GC=F", bootstrap=True)
    first = s.scan_symbol("GC=F", live=False)
    assert first and not sent  # backfill never notifies
    assert {a["timeframe"] for a in first} == {"1m", "5m", "15m"}
    a = store.alert(first[-1]["id"])
    assert a["features"]["time__weekday"] is not None
    assert any(k.startswith("4h__") for k in a["features"])
    # Re-scanning the same data must not create duplicates.
    assert s.scan_symbol("GC=F", live=True) == []
    assert s.update_outcomes() > 0
    store.save_label({"alert_id": a["id"], "labeler": "x", "label": "LONG", "correct": 1, "confidence": 2})
    store.save_label({"alert_id": a["id"], "labeler": "x", "label": "SKIP", "correct": 0, "confidence": 3})
    assert len(store.labels()) == 1 and store.labels()["label"].iloc[0] == "SKIP"


def test_notify_filters(cfg):
    row = pd.Series({"volume_ratio": 1.0, "adx": 40.0})
    assert not should_notify({"signal": "RSI_ABOVE_70", "candidate": True}, row, "5m", cfg)
    assert not should_notify({"signal": "MACD_BULL_CROSS"}, row, "1m", cfg)  # not in only_on for 1m
    assert should_notify({"signal": "MACD_BULL_CROSS"}, row, "5m", cfg)
    assert not should_notify({"signal": "TL_BREAK_UP", "line": {"touches": 2}}, row, "5m", cfg)
    assert should_notify({"signal": "TL_BREAK_UP", "line": {"touches": 3}}, row, "5m", cfg)
    assert not should_notify({"signal": "VOLUME_SPIKE_UP"}, row, "5m", cfg)


def test_telegram_message_and_token_not_logged(cfg, monkeypatch, caplog):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "SECRET123")
    monkeypatch.setenv("TELEGRAM_CHAT_ID", "42")
    c = {**cfg, "notify": {"console": False, "telegram": True}}
    calls = []

    class Resp:
        def raise_for_status(self):
            import requests
            raise requests.HTTPError("https://api.telegram.org/botSECRET123/sendMessage 400")

    monkeypatch.setattr("ktma.notify.requests.post", lambda url, json, timeout: calls.append(json) or Resp())
    alert = {"id": 1, "symbol": "GC=F", "timeframe": "5m", "signal": "RSI_ABOVE_80", "direction": "bearish",
             "price": 4123.4, "rsi": 81.2, "volume_ratio": 2.3, "atr": 3.1, "bar_time": 0,
             "details": {"adx": 22.0}, "features": {"1h__swing_trend": 1.0}}
    assert Notifier(c).send(alert) is False
    assert "RSI 81 (silne prekúpené)" in calls[0]["text"] and "1h ↑ rastie" in calls[0]["text"]
    assert "SECRET123" not in caplog.text
    assert "možný SHORT" in format_alert(alert) and "RSI vystúpilo nad 80" in format_alert(alert)


def test_live_scan_notifies_only_new_recent_alerts(cfg, tmp_path):
    c = {**cfg, "db_path": str(tmp_path / "live.sqlite"), "window_bars": 800}
    store = Store(c["db_path"])
    sent = []

    class FakeNotifier:
        def send(self, alert):
            sent.append(alert)
            return True

    hour = 3_600_000
    s = Scanner(c, store, SyntheticProvider(days=10, end_ms=END - 3 * hour), FakeNotifier())
    s.ingest("GC=F", bootstrap=True)
    s.scan_symbol("GC=F", live=False)
    before = store.get_state("GC=F", "5m")
    s.provider = SyntheticProvider(days=10, end_ms=END)  # three more hours of data arrive
    s.ingest("GC=F")
    new = s.scan_symbol("GC=F", live=True)
    assert new and all(a["bar_time"] > store.alerts("id=?", (a["id"],))["bar_time"].iloc[0] - 1 for a in new)
    assert all(a["bar_time"] > before for a in new if a["timeframe"] == "5m")
    assert sent and all(a["notify"] for a in sent)
    assert store.get_state("GC=F", "5m") > before


def test_oanda_provider_paginates_and_skips_incomplete(monkeypatch):
    from ktma.data import OandaProvider, now_ms

    step = 60_000
    end = (now_ms() // step) * step - 10 * step
    start = end - 7000 * step
    calls = []

    class Resp:
        status_code = 200

        def __init__(self, candles):
            self._c = candles

        def json(self):
            return {"candles": self._c}

    def fake_get(url, params, timeout, headers):
        assert "XAU_USD" in url and headers["Authorization"] == "Bearer T"
        calls.append(params)
        t0 = int(params["from"]) * 1000
        n = min(params["count"], (end - t0) // step + 1)
        out = [{"complete": True, "volume": 5, "time": f"{(t0 + k * step) / 1000:.9f}",
                "mid": {"o": "1", "h": "2", "l": "0.5", "c": "1.5"}} for k in range(n)]
        if n < params["count"]:
            out[-1]["complete"] = False   # the forming candle
        return Resp(out)

    monkeypatch.setattr("requests.get", fake_get)
    p = OandaProvider(token="T", env="practice")
    assert p.instrument("XAUUSD") == "XAU_USD" and p.instrument("XAG_USD") == "XAG_USD"
    df = p.fetch("XAUUSD", "1m", since_ms=start)
    assert len(calls) == 2                       # 7001 candles -> two pages of max 5000
    assert len(df) == 7000                       # incomplete last candle dropped
    assert df["open_time"].is_monotonic_increasing and df["open_time"].iloc[0] == start


def test_binance_provider_paginates_and_drops_off_hours(monkeypatch):
    from ktma.data import BinanceGoldProvider, gold_market_open

    step = 60_000
    # Wed 2026-10-14 12:00 UTC .. +3000 min (crosses the 17:00 NY daily break twice)
    start = int(pd.Timestamp("2026-10-14 12:00", tz="UTC").value // 1_000_000)
    end = start + 3000 * step
    calls = []

    class Resp:
        status_code = 200

        def __init__(self, rows):
            self._r = rows

        def json(self):
            return self._r

    def fake_get(url, timeout, params):
        assert params["symbol"] == "XAUUSDT" and "fapi.binance.com" in url
        calls.append(params)
        t0 = params["startTime"]
        n = max(0, min(params["limit"], (end - t0) // step))
        return Resp([[t0 + k * step, "1", "2", "0.5", "1.5", "10", t0 + (k + 1) * step - 1] for k in range(n)])

    monkeypatch.setattr("requests.get", fake_get)
    df = BinanceGoldProvider().fetch("XAUUSD", "1m", since_ms=start)
    assert len(calls) == 3                         # 3000 candles -> pages of 1500
    assert len(df) == 3000 - 2 * 60                # two daily breaks (17:00-18:00 NY) removed
    assert gold_market_open(df["open_time"]).all()
    sat = pd.Series([int(pd.Timestamp("2026-10-17 12:00", tz="UTC").value // 1_000_000)])
    assert not gold_market_open(sat).iloc[0]
