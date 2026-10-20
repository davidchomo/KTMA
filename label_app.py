"""KTMA – webová appka na labelovanie alertov.

Spustenie:  python -m ktma label-ui     (alebo: streamlit run label_app.py)
Env: KTMA_DB (iná databáza), KTMA_UI_PASSWORD (heslo), KTMA_CONFIG (iný config).
"""

from __future__ import annotations

import html
import os
from pathlib import Path

import numpy as np
import pandas as pd
import streamlit as st
import yaml

from ktma.assistant import AssistantError, ClaudeAssistant, build_context
from ktma.cli import _load_env
from ktma.config import ROOT, load_config, tf_ms
from ktma.data import resample
from ktma.dataset import build_dataset, ev_table
from ktma.describe import (FAMILY_NAMES, adx_text, confluence_text, direction_text, rsi_text, setup_text, signal_text, symbol_name,
                           trend_arrow, volume_text)
from ktma.indicators import add_indicators
from ktma.outcomes import trade_result
from ktma.plan import suggest_plan
from ktma.storage import Store
from ktma.structure import StructureEngine, levels_snapshot, lines_snapshot
from ktma.tvchart import CHART_TYPES, SCALES, STYLE_DEFAULTS, THEMES, build_spec, render, style_indicators

_load_env()
st.set_page_config(page_title="Nexus", page_icon="◆", layout="wide")

CSS = """<style>
.nx-cards { display: flex; gap: 8px; flex-wrap: wrap; margin: 2px 0 10px; }
.nx-card { flex: 1 1 110px; background: #1e222d; border: 1px solid #2a2e39; border-radius: 8px; padding: 6px 10px; }
.nx-l { font-size: 11px; color: #787b86; text-transform: uppercase; letter-spacing: .04em; }
.nx-v { font-size: 20px; font-weight: 600; color: #d1d4dc; line-height: 1.3; }
.nx-h { font-size: 11px; color: #9598a1; }
.nx-rr { display: flex; flex-direction: column; background: #1e222d; border: 1px solid #2a2e39; border-radius: 8px;
         padding: 6px 10px; margin: 4px 0 6px; }
.nx-rrv { font-size: 24px; font-weight: 700; line-height: 1.2; }
.nx-brand { font-size: 22px; font-weight: 700; letter-spacing: .06em; color: #131722; }
.nx-brand b { color: #2962ff; }
.st-key-nx_chat_fab { position: fixed; right: 28px; bottom: 24px; z-index: 1000; width: auto !important; }
.st-key-nx_chat_fab button { border-radius: 28px; padding: 10px 18px; font-size: 20px; background: #2962ff;
                              color: #fff; border: none; box-shadow: 0 6px 20px rgba(0,0,0,.45); }
.st-key-nx_chat_fab button:hover { background: #1e53e5; color: #fff; }
</style>"""

CONFIG_PATH = Path(os.environ.get("KTMA_CONFIG") or ROOT / "config.yaml")
LABELS = {"LONG": "🟢 LONG – dobrý vstup long", "SHORT": "🔴 SHORT – dobrý vstup short",
          "SKIP": "⛔ NEVSTUPOVAŤ", "UNSURE": "❔ NEVIEM"}
LABEL_CHIPS = {"LONG": "🟢 LONG", "SHORT": "🔴 SHORT", "SKIP": "⛔ Nevstupovať", "UNSURE": "❔ Neviem"}
CORRECT = {"✔ správny": 1, "✘ nesprávny": 0, "? neviem": None}
LINES_Q = {"—": None, "Čiary sú dobré": "GOOD", "Čiary sú zlé": "BAD", "Chýba dôležitá čiara": "MISSING"}


# ---------------------------------------------------------------- helpers
def password_ok() -> bool:
    pw = os.environ.get("KTMA_UI_PASSWORD")
    if not pw or st.session_state.get("auth"):
        return True
    entered = st.text_input("Heslo", type="password")
    if entered and entered == pw:
        st.session_state["auth"] = True
        st.rerun()
    elif entered:
        st.error("Nesprávne heslo")
    return False


@st.cache_resource
def get_store(path: str) -> Store:
    return Store(path)


def candles(store: Store, symbol: str, tf: str) -> pd.DataFrame:
    if tf == "4h":
        h1 = store.candles(symbol, "1h")
        return resample(h1, "4h", int(h1["open_time"].iloc[-1]) + tf_ms("1h")) if len(h1) else h1
    return store.candles(symbol, tf)


def fmt_time(ms: int) -> str:
    return pd.Timestamp(int(ms), unit="ms", tz="UTC").strftime("%Y-%m-%d %H:%M")


LAYERS = ["Čiary", "S/R", "Dotyky", "Rovnobežky", "Kanál", "EMA", "EMA dlhá", "VWAP",
          "Alerty", "Labely", "Objem", "RSI", "MACD"]
DEFAULT_LAYERS = ["Čiary", "S/R", "Dotyky", "Kanál", "EMA", "Alerty", "Labely", "Objem", "RSI", "MACD"]
PANELS = ["Objem", "RSI", "MACD"]


VIEW_DEFAULTS = {"sidebar": True, "header": True, "extras": True,
                 "form": "vedľa grafu", "height": 700}
FORM_MODES = ["vedľa grafu", "pod grafom", "skrytý"]


def view_settings(key: str) -> dict:
    """'👁️ Zobrazenie' popover: what is visible and how tall the chart is. Shared by both chart tabs."""
    v = {**VIEW_DEFAULTS, **st.session_state.get("view", {})}
    with st.popover("👁️ Zobrazenie", use_container_width=True):
        v["sidebar"] = st.toggle("Bočný panel (filtre, meno)", v["sidebar"], key=f"{key}_sb")
        v["header"] = st.toggle("Hlavička alertu", v["header"], key=f"{key}_hd")
        v["extras"] = st.toggle("Výsledok a dáta pod grafom", v["extras"], key=f"{key}_ex")
        v["form"] = st.radio("Formulár na labelovanie", FORM_MODES, index=FORM_MODES.index(v["form"]),
                             key=f"{key}_fm", horizontal=True)
        v["height"] = st.slider("Výška grafu (px)", 400, 1400, v["height"], 50, key=f"{key}_ht")
        st.caption("⛶ v pravom hornom rohu grafu = celá obrazovka (Esc = späť).")
    st.session_state["view"] = v
    if not v["sidebar"]:
        st.markdown("<style>[data-testid='stSidebar'],[data-testid='stSidebarCollapsedControl']"
                    "{display:none}</style>", unsafe_allow_html=True)
    return v


def chart_style() -> dict:
    return {**STYLE_DEFAULTS, **st.session_state.get("chart_style", {})}


def _pref_key(labeler: str) -> str:
    return f"ui:{(labeler or '').strip().lower() or 'default'}"


def load_prefs(store, labeler: str):
    """Load the saved chart/view/layer settings for this name once per session (or when the name changes)."""
    key = _pref_key(labeler)
    if st.session_state.get("prefs_loaded_for") == key:
        return
    st.session_state["prefs_loaded_for"] = key
    saved = store.get_pref(key) or (store.get_pref(_pref_key("")) if labeler else None)
    if not saved:
        return
    for k in [k for k in st.session_state if k.startswith(("view_", "layers_top", "style_"))]:
        del st.session_state[k]   # let widgets re-initialise from the loaded values
    st.session_state["view"] = {**VIEW_DEFAULTS, **saved.get("view", {})}
    st.session_state["layers_saved"] = saved.get("layers", DEFAULT_LAYERS)
    st.session_state["chart_style"] = {**STYLE_DEFAULTS, **saved.get("chart", {})}


def chart_settings(store, labeler: str):
    """'🎨 Graf' popover: chart type, colours, theme, scale, indicator periods, line widths."""
    s = chart_style()
    with st.popover("🎨 Graf", use_container_width=True):
        c = st.columns(2)
        s["type"] = c[0].selectbox("Typ grafu", CHART_TYPES, CHART_TYPES.index(s["type"]), key="style_type")
        s["theme"] = c[1].radio("Pozadie", list(THEMES), list(THEMES).index(s["theme"]), key="style_theme",
                                horizontal=True)
        c = st.columns(3)
        s["up"] = c[0].color_picker("Rastúca", s["up"], key="style_up")
        s["down"] = c[1].color_picker("Klesajúca", s["down"], key="style_down")
        s["grid"] = c[2].toggle("Mriežka", s["grid"], key="style_grid")
        s["scale"] = st.radio("Cenová mierka", list(SCALES), list(SCALES).index(s["scale"]), key="style_scale",
                              horizontal=True)
        st.markdown("**EMA** (vrstvy „EMA“ a „EMA dlhá“)")
        c = st.columns(3)
        for col, k, label in ((c[0], "ema_fast", "rýchla"), (c[1], "ema_slow", "pomalá"), (c[2], "ema_long", "dlhá")):
            s[k] = col.number_input(label, 2, 500, int(s[k]), key=f"style_{k}")
            s[f"{k}_color"] = col.color_picker(f"farba {label}", s[f"{k}_color"], key=f"style_{k}_color",
                                               label_visibility="collapsed")
        st.markdown("**RSI**")
        c = st.columns(3)
        s["rsi_period"] = c[0].number_input("perióda", 2, 100, int(s["rsi_period"]), key="style_rsi_period")
        s["rsi_upper"] = c[1].number_input("horná úroveň", 50, 100, int(s["rsi_upper"]), key="style_rsi_upper")
        s["rsi_lower"] = c[2].number_input("dolná úroveň", 0, 50, int(s["rsi_lower"]), key="style_rsi_lower")
        s["rsi_color"] = st.color_picker("farba RSI", s["rsi_color"], key="style_rsi_color")
        st.markdown("**MACD**")
        c = st.columns(3)
        s["macd_fast"] = c[0].number_input("rýchla", 2, 100, int(s["macd_fast"]), key="style_macd_fast")
        s["macd_slow"] = c[1].number_input("pomalá", 3, 200, int(s["macd_slow"]), key="style_macd_slow")
        s["macd_signal"] = c[2].number_input("signál", 2, 100, int(s["macd_signal"]), key="style_macd_signal")
        c = st.columns(4)
        s["macd_up"] = c[0].color_picker("histogram +", s["macd_up"], key="style_macd_up")
        s["macd_down"] = c[1].color_picker("histogram −", s["macd_down"], key="style_macd_down")
        s["macd_line_color"] = c[2].color_picker("MACD", s["macd_line_color"], key="style_macd_line_color")
        s["macd_signal_color"] = c[3].color_picker("signál", s["macd_signal_color"], key="style_macd_signal_color")
        c = st.columns(2)
        s["line_width"] = c[0].slider("Hrúbka indikátorov", 1, 4, int(s["line_width"]), key="style_line_width")
        s["trendline_width"] = c[1].slider("Hrúbka trendových čiar", 1, 5, int(s["trendline_width"]),
                                           key="style_trendline_width")
        st.caption("Periódy tu menia iba zobrazenie. Skener počíta podľa ⚙️ Nastavení.")
        st.session_state["chart_style"] = s
        c = st.columns(2)
        if c[0].button("💾 Uložiť ako moje", use_container_width=True,
                       help="Graf, zobrazenie a vrstvy sa načítajú pri ďalšom otvorení pod týmto menom."):
            store.set_pref(_pref_key(labeler), {"chart": s, "view": st.session_state.get("view", VIEW_DEFAULTS),
                                                "layers": st.session_state.get("layers_saved", DEFAULT_LAYERS)})
            st.toast(f"Uložené pre „{labeler or 'default'}“ ✅")
        if c[1].button("↺ Predvolené", use_container_width=True):
            st.session_state["chart_style"] = dict(STYLE_DEFAULTS)
            for k in [k for k in st.session_state if k.startswith("style_")]:
                del st.session_state[k]
            st.rerun()


def active_layers() -> set:
    return set(st.session_state.get("layers_saved", DEFAULT_LAYERS))


def layer_picker(key: str) -> set:
    """Layer on/off checkboxes like a filter menu (top-bar '🗂 Vrstvy'). Shared by all charts."""
    saved = active_layers()
    overlays = [l for l in LAYERS if l not in PANELS]
    groups = [("Na grafe", overlays[: (len(overlays) + 1) // 2]), ("", overlays[(len(overlays) + 1) // 2:]),
              ("Panely pod grafom", PANELS)]
    cols = st.columns(3)
    picked = set()
    for col, (title, items) in zip(cols, groups):
        with col:
            st.caption(title or "\u00a0")
            for layer in items:
                if st.checkbox(layer, value=layer in saved, key=f"{key}_{layer}"):
                    picked.add(layer)
    st.session_state["layers_saved"] = list(picked)
    return picked


def chart_height(layers: set) -> int:
    """Total chart height stays the same when panels are hidden; the price pane gets the space."""
    return int(st.session_state.get("view", VIEW_DEFAULTS).get("height", 700))


def past_labels(store, symbol: str, tf: str, w: pd.DataFrame, exclude_id: int | None = None) -> list[dict]:
    """Labels already given to alerts inside the chart window (L / S / ✕ / ?)."""
    t0, t1 = int(w["open_time"].iloc[0]), int(w["open_time"].iloc[-1])
    rows = store.conn.execute(
        "SELECT a.id, a.bar_time, l.label FROM labels l JOIN alerts a ON a.id = l.alert_id "
        "WHERE a.symbol=? AND a.timeframe=? AND a.bar_time BETWEEN ? AND ?", (symbol, tf, t0, t1)).fetchall()
    times = w["open_time"].to_numpy()
    return [{"i": int(np.searchsorted(times, bt)), "label": lab} for aid, bt, lab in rows if aid != exclude_id]


def chart(cfg, store, alert, blind: bool, before: int, after: int, plan: dict, layers=DEFAULT_LAYERS):
    """`plan` = {entry, sl, tp, be} of the labeler (empty for SKIP/UNSURE) -> TradingView-style position zones."""
    df = candles(store, alert["symbol"], alert["timeframe"])
    times = df["open_time"].to_numpy()
    ai = int(np.searchsorted(times, alert["bar_time"]))
    lo = max(0, ai - before - 300)              # extra bars to warm up indicators
    hi = ai + 1 if blind else min(len(df), ai + after + 1)
    w = style_indicators(add_indicators(df.iloc[lo:hi].reset_index(drop=True), cfg), chart_style())
    start = ai - lo - before if ai - lo - before > 0 else 0
    w = w.iloc[start:].reset_index(drop=True)
    a_x = ai - lo - start

    layers = set(layers) | ({"VWAP"} if alert["signal"].startswith("VWAP") else set())
    spec = build_spec(w, layers, alert.get("lines"), focus_i=a_x,
                      markers=[{"i": a_x, "direction": alert["direction"], "size": 2,
                                "text": "LONG?" if alert["direction"] == "bullish" else "SHORT?"}],
                      reg_channel=cfg["structure"].get("regression_channel"),
                      style=chart_style(), label_marks=past_labels(store, alert["symbol"], alert["timeframe"], w, alert["id"]),
                      levels=(alert.get("details") or {}).get("levels"),
                      position=plan or None, bar_seconds=tf_ms(alert["timeframe"]) // 1000)
    return spec, chart_height(layers), df


def live_view(cfg, store, symbol: str, tf: str, bars: int, only_notified: bool, layers=DEFAULT_LAYERS):
    """Current chart with the trendlines the scanner sees right now and recent alerts."""
    raw = candles(store, symbol, tf).tail(cfg["window_bars"]).reset_index(drop=True)
    if len(raw) < 60:
        st.info("Zatiaľ málo dát. Spusti backfill alebo počkaj na skener.")
        return
    f = style_indicators(add_indicators(raw, cfg), chart_style())
    k = cfg["structure"]["zigzag_atr"].get(tf, 2.0)
    struct = StructureEngine(cfg["structure"], k).run(f)
    lines = lines_snapshot(struct["lines"], len(f) - 1, f["open_time"].to_numpy())
    levels = levels_snapshot(struct["levels"], len(f) - 1, f["open_time"].to_numpy(), float(f["close"].iloc[-1]),
                             (cfg["structure"].get("levels") or {}).get("min_touches", 2))
    w = f.tail(bars).reset_index(drop=True)

    t0 = int(w["open_time"].iloc[0])
    q = "SELECT id, bar_time, signal, direction, price, notify FROM alerts WHERE symbol=? AND timeframe=? AND bar_time>=?"
    if only_notified:
        q += " AND notify=1"
    al = pd.read_sql_query(q, store.conn, params=(symbol, tf, t0))
    markers = []
    if not al.empty and "Alerty" in layers:
        xs = np.searchsorted(w["open_time"].to_numpy(), al["bar_time"].to_numpy())
        markers = [{"i": int(x), "direction": r.direction, "size": 1 if r.notify else 0.6,
                    "text": "🧩" if r.signal.startswith("CONFLUENCE") else "",
                    "note": f"#{r.id} {signal_text(r.signal)[0]}"}
                   for x, r in zip(xs, al.itertuples(index=False))]

    c = st.columns(4)
    lt = int(raw["open_time"].iloc[-1])
    age = (pd.Timestamp.now(tz="UTC") - pd.Timestamp(lt + tf_ms(tf), unit="ms", tz="UTC")).total_seconds() / 60
    c[0].metric("Posledná sviečka", local_time(lt), f"pred {age:.0f} min", delta_color="off")
    c[1].metric("Cena", f"{raw['close'].iloc[-1]:.2f}")
    c[2].metric("RSI", f"{f['rsi'].iloc[-1]:.0f}", rsi_text(f["rsi"].iloc[-1]), delta_color="off")
    day = int((pd.Timestamp.now(tz="UTC") - pd.Timedelta(hours=24)).value // 1_000_000)
    n24, s24 = store.conn.execute(
        "SELECT COUNT(*), COALESCE(SUM(notify),0) FROM alerts WHERE symbol=? AND bar_time>=?", (symbol, day)).fetchone()
    c[3].metric("Alerty za 24 h", n24, f"{s24} na Telegram", delta_color="off")
    spec = build_spec(w, layers, lines, extend=15, markers=markers,
                      reg_channel=cfg["structure"].get("regression_channel"),
                      style=chart_style(), label_marks=past_labels(store, symbol, tf, w), levels=levels)
    render(spec, chart_height(layers), f"live-{symbol}-{tf}-{bars}")
    st.caption(f"Čiary a kanál presne tak, ako ich skener vidí teraz (aktívne čiary: {len(lines)}). "
               "Šípky = alerty (popis uvidíš hore, keď prejdeš myšou na sviečku). Obnovuje sa každú minútu.")
    if not al.empty:
        recent = al.sort_values("bar_time", ascending=False).head(15).copy()
        recent["čas"] = recent["bar_time"].map(local_time)
        recent["signál"] = recent["signal"].map(lambda x: signal_text(x)[0])
        recent["smer"] = recent["direction"].map(direction_text)
        recent["označiť"] = "?alert=" + recent["id"].astype(str)
        st.dataframe(recent[["čas", "signál", "smer", "price", "označiť"]], hide_index=True, use_container_width=True,
                     column_config={"označiť": st.column_config.LinkColumn("označiť", display_text="otvoriť"),
                                    "price": st.column_config.NumberColumn("cena", format="%.2f")})


def page_live(cfg, store):
    syms = cfg["symbols"]
    c = st.columns([1, 1, 2, 2])
    symbol = c[0].selectbox("Symbol", syms, key="live_sym")
    tf = c[1].selectbox("Timeframe", cfg["alert_timeframes"], index=min(1, len(cfg["alert_timeframes"]) - 1),
                        key="live_tf")
    bars = c[2].slider("Sviečok", 60, 600, 200, key="live_bars")
    only_notified = c[3].checkbox("Iba alerty z Telegramu", True, key="live_notified")
    layers = active_layers()

    @st.fragment(run_every="60s")
    def _refresh():
        live_view(cfg, store, symbol, tf, bars, only_notified, layers)

    _refresh()


def alert_queue(store, f) -> pd.DataFrame:
    where, args = ["1=1"], []
    if f["symbols"]:
        where.append(f"symbol IN ({','.join('?' * len(f['symbols']))})")
        args += f["symbols"]
    if f["tfs"]:
        where.append(f"timeframe IN ({','.join('?' * len(f['tfs']))})")
        args += f["tfs"]
    if f["signals"]:
        where.append(f"signal IN ({','.join('?' * len(f['signals']))})")
        args += f["signals"]
    if f["only_notified"]:
        where.append("notify=1")
    if f["only_unlabeled"]:
        where.append("id NOT IN (SELECT alert_id FROM labels WHERE labeler=?)")
        args.append(f["labeler"])
    order = {"Najnovšie": "bar_time DESC", "Najstaršie": "bar_time ASC", "Náhodne": "RANDOM()"}[f["order"]]
    q = f"SELECT id, symbol, timeframe, bar_time, signal, direction FROM alerts WHERE {' AND '.join(where)} ORDER BY {order} LIMIT 500"
    return pd.read_sql_query(q, store.conn, params=args)


# ---------------------------------------------------------------- pages
def local_time(ms: int) -> str:
    return pd.Timestamp(int(ms), unit="ms", tz="UTC").tz_convert("Europe/Bratislava").strftime("%d.%m. %H:%M")


def cards_html(cards: list[tuple[str, str, str]]) -> str:
    """Row of small metric cards: (label, value, hint)."""
    items = "".join(
        f'<div class="nx-card"><div class="nx-l">{html.escape(l)}</div><div class="nx-v">{html.escape(v)}</div>'
        f'<div class="nx-h">{html.escape(h)}</div></div>' for l, v, h in cards)
    return f'<div class="nx-cards">{items}</div>'


def alert_header(alert: dict):
    """Title + compact cards with the key numbers; the full plain-language description is in a popup."""
    title, expl = signal_text(alert["signal"])
    feats = alert.get("features") or {}
    d = alert.get("details") or {}
    tf = alert["timeframe"]
    view = st.session_state.get("view", VIEW_DEFAULTS)
    top = st.columns([6, 1.2])
    with top[1].popover("ℹ️ Popis", use_container_width=True):
        st.markdown(f"**{direction_text(alert['direction'])} · {title}**")
        st.write(f"{symbol_name(alert['symbol'])} · sviečka {tf} · {local_time(alert['bar_time'])} (SK čas)")
        if expl:
            st.info(expl)
        rows = [
            ("Cena", f"{alert['price']:.2f}", f"ATR {alert['atr'] or 0:.2f} = bežná veľkosť sviečky"),
            ("RSI", f"{alert['rsi']:.0f}" if alert["rsi"] is not None else "–", rsi_text(alert["rsi"])),
            ("Objem", f"{alert['volume_ratio']:.1f}×" if alert["volume_ratio"] is not None else "–",
             volume_text(alert["volume_ratio"])),
            ("ADX", f"{d['adx']:.0f}" if d.get("adx") is not None else "–", adx_text(d.get("adx"))),
        ] + [(f"Trend {t}", trend_arrow(feats.get(f"{t}__swing_trend")), "podľa swingov (HH/HL vs LH/LL)")
             for t in ("1h", "4h")]
        if d.get("line"):
            ln = d["line"]
            kind = "rezistencia" if ln["kind"] == "resistance" else "podpora"
            rows.append(("Čiara", f"{ln['value']:.2f}", f"{kind}, {ln['touches']} dotyky"))
        if d.get("level"):
            rows.append(("Úroveň", f"{d['level']['price']:.2f}", f"horizontálna, {d['level']['touches']} dotyky"))
        if confluence_text(d.get("confluence")):
            rows.append(("🧩 Súlad", "", confluence_text(d.get("confluence"))))
        if setup_text(d.get("setup")):
            rows.append(("Setup", "", setup_text(d.get("setup"))))
        plan = d.get("plan") or {}
        if plan.get("rr") is not None:
            rows.append(("Návrh", f"1:{plan['rr']:.1f}", f"SL {plan['sl']:.2f} ({plan['sl_reason']}) · "
                                                        f"TP {plan['tp']:.2f} ({plan['tp_reason']})"))
        st.table(pd.DataFrame(rows, columns=["", "hodnota", "význam"]).set_index(""))
        if d.get("candidate_only"):
            st.caption("ℹ️ iba uložený kandidát (nešiel na Telegram)")
    if not view["header"]:
        return
    top[0].markdown(f"#### {direction_text(alert['direction'])} · {title}")
    top[0].caption(f"{symbol_name(alert['symbol'])} · sviečka {tf} · {local_time(alert['bar_time'])} · #{alert['id']}")
    conf = (d.get("confluence") or {}).get("families", [])
    plan = d.get("plan") or {}
    trend = " / ".join(trend_arrow(feats.get(f"{t}__swing_trend"))[:1] for t in ("1h", "4h"))
    cards = [
        ("Cena", f"{alert['price']:.2f}", f"ATR {alert['atr'] or 0:.2f}"),
        ("RSI", f"{alert['rsi']:.0f}" if alert["rsi"] is not None else "–", rsi_text(alert["rsi"])),
        ("Objem", f"{alert['volume_ratio']:.1f}×" if alert["volume_ratio"] is not None else "–",
         volume_text(alert["volume_ratio"])),
        ("ADX", f"{d['adx']:.0f}" if d.get("adx") is not None else "–", adx_text(d.get("adx"))),
        ("Trend 1h / 4h", trend, ""),
        ("🧩 Súlad", str(len(conf)) if conf else "–", ", ".join(FAMILY_NAMES.get(x, x) for x in conf[:3])),
        ("R:R návrh", f"1:{plan['rr']:.1f}" if plan.get("rr") is not None else "–",
         f"SL {plan['sl']:.2f} · TP {plan['tp']:.2f}" if plan.get("rr") is not None else ""),
    ]
    st.markdown(cards_html(cards), unsafe_allow_html=True)


QUICK_QUESTIONS = ["Je to dobrý vstup? Prečo áno / nie?", "Kam by si dal SL a TP a prečo?",
                   "Čo hovoria trendové čiary a vyšší timeframe?", "Aké je tu najväčšie riziko?"]


def ask_claude(cfg, store, alert: dict, candles_df: pd.DataFrame, f: dict, label: dict | None):
    """Text-only Q&A about this alert with the owner's Claude Code login (see ktma/assistant.py)."""
    history = store.assistant_history(alert["id"])
    st.markdown(f"**💬 Claude · alert #{alert['id']}**")
    assistant = ClaudeAssistant(cfg)
    ok, why = assistant.status()
    if not ok:
        st.info(f"{why} Návod je v README v časti „Opýtaj sa Clauda“.")
        return
    with st.container(height=320, border=False):     # scrolling history, newest at the bottom
        for q, a in history:
            st.chat_message("user").write(q)
            st.chat_message("assistant").write(a)
        if not history:
            st.caption("Opýtaj sa na tento alert. Claude vidí iba jeho dáta, nie server.")
    quick = None
    c = st.columns(2)
    for n, q in enumerate(QUICK_QUESTIONS):
        if c[n % 2].button(q, key=f"q{alert['id']}{q}", use_container_width=True):
            quick = q
    with st.form(f"ask{alert['id']}", clear_on_submit=True, border=False):
        fc = st.columns([5, 1])
        typed = fc[0].text_input("Tvoja otázka", max_chars=1000, label_visibility="collapsed",
                                 placeholder="Napíš otázku k tomuto alertu…")
        sent = fc[1].form_submit_button("➤", use_container_width=True)
    question = quick or (typed.strip() if sent else "")
    if not question:
        return
    if store.assistant_count_last_hour() >= assistant.max_per_hour:
        st.warning(f"Limit {assistant.max_per_hour} otázok za hodinu je vyčerpaný, skús neskôr.")
        return
    a_cfg = cfg.get("assistant") or {}
    context = build_context(alert, candles_df, None if f["blind"] else store.outcome(alert["id"]), label,
                            f["blind"], a_cfg.get("context_candles_before", 60), a_cfg.get("context_candles_after", 30))
    with st.spinner("Claude premýšľa…"):
        try:
            answer = assistant.ask(context, history[-6:], question)
        except AssistantError as e:
            st.error(f"Claude nedokázal odpovedať: {e}")
            return
    store.save_assistant(alert["id"], f["labeler"] or "?", question, answer, assistant.model)
    st.rerun()


def page_label(cfg, store, f):
    qp = st.query_params.get("alert")
    queue = alert_queue(store, f)
    if qp and "current" not in st.session_state:
        st.session_state["current"] = int(qp)
    if "current" not in st.session_state or st.session_state["current"] is None:
        if queue.empty:
            st.info("Žiadne alerty na labelovanie pre zvolené filtre. 🎉")
            return
        st.session_state["current"] = int(queue["id"].iloc[0])
    alert = store.alert(st.session_state["current"])
    if alert is None:
        st.session_state["current"] = None
        st.rerun()

    alert_header(alert)

    atr = alert["atr"] or 0.0
    existing = store.label_for(alert["id"], f["labeler"]) or {}
    key = f"a{alert['id']}"
    default_dir = existing.get("label") or ("LONG" if alert["direction"] == "bullish" else "SHORT")

    view = st.session_state.get("view", VIEW_DEFAULTS)
    if view["form"] == "vedľa grafu":
        chart_area, right = st.columns([3, 1])
        g1 = g2 = g3 = right.container(border=True)
    else:
        chart_area = st.container()
        holder = st.container(border=True) if view["form"] == "pod grafom" else st.expander("🏷️ Labelovať tento alert")
        g1, g2, g3 = holder.columns(3)

    # ---- trade ticket: 1 decision · 2 plan with R:R · 3 rating -------------------------
    with g1:
        st.markdown("**1 · Rozhodnutie**")
        label = st.segmented_control("Rozhodnutie", list(LABELS), format_func=LABEL_CHIPS.get, default=default_dir,
                                     key=f"{key}_label", label_visibility="collapsed") or default_dir
    plan: dict = {}
    entry = sl = tp = be = None
    with g2:
        if label in ("LONG", "SHORT"):
            st.markdown("**2 · Plán obchodu**")
            side = 1 if label == "LONG" else -1
            sug = suggest_plan("bullish" if side > 0 else "bearish", alert["price"], atr,
                               alert.get("details") or {}, alert.get("lines"), cfg.get("plan")) or {}
            k_e, k_sl, k_tp = f"{key}_{label}_entry", f"{key}_{label}_sl", f"{key}_{label}_tp"
            if st.button("🎯 Použiť návrh SL/TP", key=f"{key}_sug", use_container_width=True,
                         help=f"SL {sug.get('sl_reason', '')}, TP {sug.get('tp_reason', '')}") and sug:
                st.session_state[k_e], st.session_state[k_sl], st.session_state[k_tp] = sug["entry"], sug["sl"], sug["tp"]
            same_side = existing.get("label") == label
            entry = st.number_input("Vstup", value=float(existing.get("entry") if same_side and existing.get("entry")
                                                         else sug.get("entry", alert["price"])), format="%.2f", key=k_e)
            c = st.columns(2)
            sl = c[0].number_input("SL", value=float(existing.get("stop_loss") if same_side and existing.get("stop_loss")
                                                     else sug.get("sl", entry - side * atr)), format="%.2f", key=k_sl)
            tp = c[1].number_input("TP", value=float(existing.get("take_profit") if same_side and existing.get("take_profit")
                                                     else sug.get("tp", entry + side * 2 * atr)), format="%.2f", key=k_tp)
            risk, reward = abs(entry - sl), abs(tp - entry)
            rr = reward / risk if risk else 0
            wrong = side * (tp - entry) <= 0 or side * (entry - sl) <= 0
            st.markdown(rr_html(rr, risk, atr, wrong), unsafe_allow_html=True)
            plan = {"entry": entry, "sl": sl, "tp": tp}
        else:
            st.markdown("**2 · Plán obchodu**")
            st.caption("Pri NEVSTUPOVAŤ / NEVIEM sa plán nevypĺňa.")
    with g3:
        st.markdown("**3 · Hodnotenie**")
        correct_label = st.segmented_control(
            "Bol signál správny?", list(CORRECT), key=f"{key}_correct",
            default={1: "✔ správny", 0: "✘ nesprávny"}.get(existing.get("correct"), "? neviem"))
        conf = st.segmented_control("Istota", [1, 2, 3], format_func=lambda x: "★" * x,
                                    default=existing.get("confidence") or 2, key=f"{key}_conf") or 2
        with st.expander("Viac: BE, čiary, poznámka", expanded=bool(existing.get("note"))):
            if plan:
                be = st.number_input("BE – posun SL na vstup pri cene (0 = nie)",
                                     value=float(existing.get("break_even") or 0.0), format="%.2f", key=f"{key}_be")
                plan["be"] = be or None
            lq = st.selectbox("Trendové čiary na grafe", list(LINES_Q), key=f"{key}_lq",
                              index=list(LINES_Q.values()).index(existing.get("lines_quality"))
                              if existing.get("lines_quality") in LINES_Q.values() else 0)
            note = st.text_area("Poznámka (prečo)", value=existing.get("note") or "", key=f"{key}_note", height=80)
        b1, b2 = st.columns([2, 1])
        save = b1.button("💾 Uložiť a ďalší", type="primary", use_container_width=True, shortcut="ctrl+enter",
                         help="Ctrl+Enter")
        skip = b2.button("⏭", use_container_width=True, help="Preskočiť (Ctrl+Shift+Enter)",
                         shortcut="ctrl+shift+enter")
        st.caption(f"Vo fronte {len(queue)} · {progress_text(store, f['labeler'])}")

    with chart_area:
        layers = active_layers()
        spec, height, df = chart(cfg, store, alert, f["blind"], f["before"], f["after"], plan, layers)
        render(spec, height, f"alert{alert['id']}-{int(f['blind'])}-{f['before']}-{f['after']}")
        if view["extras"]:
            t_res, t_data = st.tabs(["📈 Výsledok", "🧾 Dáta"])
            with t_res:
                outcome_block(cfg, store, alert, df, plan, f["blind"])
            with t_data:
                st.json({"details": alert["details"], "lines": alert["lines"], "features": alert["features"]},
                        expanded=False)

    with st.container(key="nx_chat_fab"):
        n_hist = len(store.assistant_history(alert["id"]))
        with st.popover(f"💬 {n_hist}" if n_hist else "💬", help="Opýtaj sa Clauda na tento alert"):
            ask_claude(cfg, store, alert, df, f, existing)

    if save:
        if not f["labeler"]:
            st.error("Vyplň meno v ľavom paneli.")
            return
        store.save_label({
            "alert_id": alert["id"], "labeler": f["labeler"], "label": label,
            "correct": CORRECT.get(correct_label), "confidence": conf,
            "entry": entry if plan else None, "stop_loss": sl if plan else None,
            "take_profit": tp if plan else None, "break_even": (be or None) if plan else None,
            "lines_quality": LINES_Q[lq], "note": note or None, "saw_future": int(not f["blind"]),
        })
        st.toast("Uložené ✅")
    if save or skip:
        st.session_state["skipped"] = st.session_state.get("skipped", set()) | {alert["id"]}
        rest = queue[~queue["id"].isin(st.session_state["skipped"])]
        st.session_state["current"] = int(rest["id"].iloc[0]) if not rest.empty else None
        st.query_params.clear()
        st.rerun()


def rr_html(rr: float, risk: float, atr: float, wrong: bool) -> str:
    color = "#ef5350" if wrong or rr < 1 else ("#f9a825" if rr < 1.5 else "#26a69a")
    msg = "SL/TP sú na zlej strane" if wrong else f"riziko {risk:.2f} $ · {risk / atr if atr else 0:.1f} ATR"
    return (f'<div class="nx-rr"><span class="nx-l">Risk : Reward</span>'
            f'<span class="nx-rrv" style="color:{color}">1 : {rr:.2f}</span><span class="nx-h">{msg}</span></div>')


def progress_text(store, labeler: str) -> str:
    if not labeler:
        return "zadaj meno vľavo"
    today = pd.Timestamp.now(tz="UTC").strftime("%Y-%m-%d")
    total, day = store.conn.execute(
        "SELECT COUNT(*), SUM(created_at >= ?) FROM labels WHERE labeler=?", (today, labeler)).fetchone()
    return f"označené dnes {day or 0} · spolu {total}"


def outcome_block(cfg, store, alert, df, plan: dict, blind: bool):
    if blind:
        st.caption("Režim naslepo: výsledok sa ukáže až po vypnutí.")
        return
    o = store.outcome(alert["id"])
    if o:
        res = {1: "✅ TP", -1: "❌ SL", 0: "⏱ timeout"}
        st.write(f"**Automaticky** (TP {cfg['outcomes']['take_profit_atr']}×ATR / SL {cfg['outcomes']['stop_loss_atr']}×ATR): "
                 f"LONG {res[o['long_result']]} za {o['long_bars']} sv. · SHORT {res[o['short_result']]} za {o['short_bars']} sv. · "
                 f"MFE {o['mfe_atr']:.1f} ATR · MAE {o['mae_atr']:.1f} ATR" + (" · ⚠️ medzera/roll" if o["gap_flag"] else ""))
    else:
        st.caption("Výsledok sa dopočíta, keď bude dosť sviečok po alerte.")
    if plan:
        tr = trade_result(df, alert["bar_time"], plan["entry"], plan["sl"], plan["tp"])
        if tr:
            st.write(f"**Tvoj plán:** {'✅ TP' if tr['result'] == 1 else '❌ SL' if tr['result'] == -1 else '⏱ otvorený'} "
                     f"po {tr['bars']} sviečkach · výsledok **{tr['r_multiple']:+.2f} R**")


def page_manual(cfg, store, f):
    st.subheader("Premeškaný vstup")
    st.write("Miesto, kde **mal byť vstup, ale systém nedal žiadny alert**. Pomôže nájsť pravidlá, ktoré chýbajú.")
    with st.form("manual"):
        c = st.columns(3)
        symbol = c[0].selectbox("Symbol", cfg["symbols"])
        tf = c[1].selectbox("Timeframe", cfg["alert_timeframes"])
        direction = c[2].selectbox("Smer", ["LONG", "SHORT"])
        d = st.columns(2)
        day = d[0].date_input("Dátum (UTC)")
        tm = d[1].time_input("Čas sviečky (UTC)")
        e = st.columns(3)
        entry = e[0].number_input("Vstup", format="%.2f")
        sl = e[1].number_input("SL", format="%.2f")
        tp = e[2].number_input("TP", format="%.2f")
        note = st.text_area("Prečo tu mal byť vstup")
        if st.form_submit_button("Uložiť"):
            ts = pd.Timestamp.combine(day, tm).tz_localize("UTC")
            bar = (int(ts.value // 1_000_000) // tf_ms(tf)) * tf_ms(tf)
            store.save_manual_mark({"symbol": symbol, "timeframe": tf, "bar_time": bar, "direction": direction,
                                    "entry": entry or None, "stop_loss": sl or None, "take_profit": tp or None,
                                    "labeler": f["labeler"], "note": note})
            st.success("Uložené")
    marks = pd.read_sql_query("SELECT * FROM manual_marks ORDER BY id DESC LIMIT 50", store.conn)
    if not marks.empty:
        marks["bar_time"] = marks["bar_time"].map(fmt_time)
        st.dataframe(marks, use_container_width=True, hide_index=True)


def page_stats(cfg, store):
    st.subheader("Štatistiky")
    n = store.conn.execute
    c = st.columns(4)
    c[0].metric("Alerty", n("SELECT COUNT(*) FROM alerts").fetchone()[0])
    c[1].metric("Notifikované", n("SELECT COUNT(*) FROM alerts WHERE notify=1").fetchone()[0])
    c[2].metric("Labely", n("SELECT COUNT(*) FROM labels").fetchone()[0])
    c[3].metric("Premeškané vstupy", n("SELECT COUNT(*) FROM manual_marks").fetchone()[0])
    labels = pd.read_sql_query(
        "SELECT a.signal, a.timeframe, l.label, l.correct FROM labels l JOIN alerts a ON a.id = l.alert_id", store.conn)
    if labels.empty:
        st.info("Zatiaľ žiadne labely.")
        return
    st.write("**Labely podľa signálu**")
    st.dataframe(pd.crosstab(labels["signal"], labels["label"], margins=True, margins_name="spolu"),
                 use_container_width=True)
    st.write("**Úspešnosť signálu podľa kamaráta (TRUE %)**")
    acc = labels.dropna(subset=["correct"]).groupby(["signal", "timeframe"])["correct"].agg(["count", "mean"])
    acc["mean"] = (acc["mean"] * 100).round(0)
    st.dataframe(acc.rename(columns={"count": "počet", "mean": "TRUE %"}), use_container_width=True)
    ds = build_dataset(store, lambda s, t: candles(store, s, t))
    st.write("**EV – očakávaný výsledok tvojich plánov (SL/TP) v R**")
    for by in ("signal", "timeframe"):
        t = ev_table(ds, by)
        if not t.empty:
            st.dataframe(t, use_container_width=True)
    if not ds.empty:
        st.download_button("⬇️ Stiahnuť dataset (CSV)", ds.to_csv(index=False).encode(), "ktma_dataset.csv")


def page_settings(cfg):
    st.subheader("Nastavenia")
    st.write("Tu sa mení, čo skener hľadá a čo posiela na Telegram. **Skener si zmeny načíta sám do minúty.** "
             "Vysvetlenie každého parametra a skratky je nižšie v slovníku.")
    text = CONFIG_PATH.read_text(encoding="utf-8")
    new = st.text_area("config.yaml", value=text, height=520)
    if st.button("💾 Uložiť nastavenia", type="primary"):
        try:
            parsed = yaml.safe_load(new)
            assert isinstance(parsed, dict) and "symbols" in parsed and "indicators" in parsed
        except Exception as e:  # noqa: BLE001 - show any YAML problem to the user
            st.error(f"Chyba v nastaveniach, neuložené: {e}")
        else:
            backup = ROOT / "data" / "config.yaml.bak"   # data/ is a persistent volume on the VPS
            backup.write_text(text, encoding="utf-8")
            CONFIG_PATH.write_text(new, encoding="utf-8")
            st.success("Uložené (záloha: data/config.yaml.bak).")
    st.divider()
    glossary = ROOT / "docs" / "SLOVNIK.md"
    if glossary.exists():
        st.markdown(glossary.read_text(encoding="utf-8"))


# ---------------------------------------------------------------- main
def recent_labels(store, labeler: str):
    """Last labels of this person, one click to reopen and fix (undo pattern from labeling tools)."""
    if not labeler:
        return
    rows = store.conn.execute(
        "SELECT l.alert_id, l.label, a.signal, a.timeframe FROM labels l JOIN alerts a ON a.id = l.alert_id "
        "WHERE l.labeler=? ORDER BY l.created_at DESC LIMIT 8", (labeler,)).fetchall()
    if not rows:
        return
    with st.expander("🕘 Posledné labely (oprava)"):
        for aid, lab, sig, tf in rows:
            if st.button(f"{LABEL_CHIPS.get(lab, lab)} · {tf} · {signal_text(sig)[0][:28]}", key=f"recent{aid}",
                         use_container_width=True):
                st.session_state["current"] = aid
                st.rerun()


def main():
    if not password_ok():
        return
    cfg = load_config(CONFIG_PATH)
    db = os.environ.get("KTMA_DB") or cfg["db_path"]
    store = get_store(db)

    st.markdown(CSS, unsafe_allow_html=True)
    with st.sidebar:
        st.markdown('<div class="nx-brand">◆ <b>NEXUS</b></div>', unsafe_allow_html=True)
        st.caption("zlato · alerty · labelovanie")
        labeler = st.text_input("Tvoje meno", value=st.session_state.get("labeler", ""))
        st.session_state["labeler"] = labeler
        syms = [r[0] for r in store.conn.execute("SELECT DISTINCT symbol FROM alerts")]
        tfs = [r[0] for r in store.conn.execute("SELECT DISTINCT timeframe FROM alerts")]
        sigs = [r[0] for r in store.conn.execute("SELECT DISTINCT signal FROM alerts ORDER BY 1")]
        f = {"labeler": labeler}
        with st.expander("🔎 Filtre a poradie"):
            f.update({
                "symbols": st.multiselect("Symbol", syms),
                "tfs": st.multiselect("Timeframe", tfs),
                "signals": st.multiselect("Signál", sigs, format_func=lambda x: signal_text(x)[0]),
                "only_unlabeled": st.checkbox("Iba neoznačené", True),
                "only_notified": st.checkbox("Iba tie, čo išli na Telegram", True),
                "order": st.radio("Poradie", ["Najnovšie", "Najstaršie", "Náhodne"], horizontal=True),
            })
        with st.expander("🕯️ Okno grafu"):
            f["blind"] = st.checkbox("Naslepo (skryť, čo bolo potom)", False,
                                     help="Uvidíš iba to, čo bolo známe v čase alertu. Do labelu sa uloží saw_future=0.")
            f["before"] = st.slider("Sviečok pred alertom", 30, 400, 150)
            f["after"] = st.slider("Sviečok po alerte", 0, 200, 60)
        if st.button("⏭ Ďalší alert podľa filtrov", use_container_width=True):
            st.session_state["current"] = None
            st.rerun()
        recent_labels(store, labeler)

    load_prefs(store, labeler)
    top = st.columns([6, 1.3, 1.5, 1.2])
    with top[1].popover("🗂 Vrstvy", use_container_width=True):
        layer_picker("layers_top")
    with top[2]:
        view_settings("view")
    with top[3]:
        chart_settings(store, labeler)
    tabs = st.tabs(["🏷️ Labelovanie", "📡 Živý graf", "➕ Premeškaný vstup", "📊 Štatistiky a EV",
                    "⚙️ Nastavenia a slovník"])
    with tabs[0]:
        page_label(cfg, store, f)
    with tabs[1]:
        page_live(cfg, store)
    with tabs[2]:
        page_manual(cfg, store, f)
    with tabs[3]:
        page_stats(cfg, store)
    with tabs[4]:
        page_settings(cfg)


main()
