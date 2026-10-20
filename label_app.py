"""KTMA – webová appka na labelovanie alertov.

Spustenie:  python -m ktma label-ui     (alebo: streamlit run label_app.py)
Env: KTMA_DB (iná databáza), KTMA_UI_PASSWORD (heslo), KTMA_CONFIG (iný config).
"""

from __future__ import annotations

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
from ktma.describe import (adx_text, confluence_text, direction_text, rsi_text, setup_text, signal_text, symbol_name,
                           trend_arrow, volume_text)
from ktma.indicators import add_indicators
from ktma.outcomes import trade_result
from ktma.storage import Store
from ktma.structure import StructureEngine, levels_snapshot, lines_snapshot
from ktma.tvchart import CHART_TYPES, SCALES, STYLE_DEFAULTS, THEMES, build_spec, render, style_indicators

_load_env()
st.set_page_config(page_title="KTMA labelovanie", page_icon="📈", layout="wide")

CONFIG_PATH = Path(os.environ.get("KTMA_CONFIG") or ROOT / "config.yaml")
LABELS = {"LONG": "🟢 LONG – dobrý vstup long", "SHORT": "🔴 SHORT – dobrý vstup short",
          "SKIP": "⛔ NEVSTUPOVAŤ", "UNSURE": "❔ NEVIEM"}
CORRECT = {"Áno (TRUE)": 1, "Nie (FALSE)": 0, "Neviem": None}
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


VIEW_DEFAULTS = {"sidebar": True, "header": True, "pills": True, "extras": True,
                 "form": "vedľa grafu", "height": 700}
FORM_MODES = ["vedľa grafu", "pod grafom", "skrytý"]


def view_settings(key: str) -> dict:
    """'👁️ Zobrazenie' popover: what is visible and how tall the chart is. Shared by both chart tabs."""
    v = {**VIEW_DEFAULTS, **st.session_state.get("view", {})}
    with st.popover("👁️ Zobrazenie", use_container_width=True):
        v["sidebar"] = st.toggle("Bočný panel (filtre, meno)", v["sidebar"], key=f"{key}_sb")
        v["header"] = st.toggle("Hlavička alertu", v["header"], key=f"{key}_hd")
        v["pills"] = st.toggle("Prepínače vrstiev nad grafom", v["pills"], key=f"{key}_pl")
        v["extras"] = st.toggle("Výsledky a Claude pod grafom", v["extras"], key=f"{key}_ex")
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
    for k in [k for k in st.session_state if k.startswith(("view_", "layers_label", "layers_live", "style_"))]:
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


def layer_picker(key: str, stacked: bool = False) -> set:
    """On/off switches right above the chart; the choice is shared by both chart tabs."""
    saved = set(st.session_state.get("layers_saved", DEFAULT_LAYERS))
    if not st.session_state.get("view", VIEW_DEFAULTS).get("pills", True):
        return saved
    overlays = [l for l in LAYERS if l not in PANELS]
    c = [st.container(), st.container()] if stacked else st.columns([5, 2])
    on_chart = c[0].pills("Na grafe", overlays, selection_mode="multi",
                          default=[l for l in overlays if l in saved], key=f"{key}_ov")
    panels = c[1].pills("Panely pod grafom", PANELS, selection_mode="multi",
                        default=[l for l in PANELS if l in saved], key=f"{key}_pn")
    picked = set(on_chart) | set(panels)
    st.session_state["layers_saved"] = list(picked)
    return picked


def chart_height(layers: set) -> int:
    """Total chart height stays the same when panels are hidden; the price pane gets the space."""
    return int(st.session_state.get("view", VIEW_DEFAULTS).get("height", 700))


def plan_lines(plan: dict) -> list[dict]:
    return [{"price": v, "color": c, "title": n} for n, v, c in (
        ("Vstup", plan.get("entry"), "#2962ff"), ("SL", plan.get("sl"), "#ef5350"),
        ("TP", plan.get("tp"), "#26a69a"), ("BE", plan.get("be"), "#f9a825")) if v]


def past_labels(store, symbol: str, tf: str, w: pd.DataFrame, exclude_id: int | None = None) -> list[dict]:
    """Labels already given to alerts inside the chart window (L / S / ✕ / ?)."""
    t0, t1 = int(w["open_time"].iloc[0]), int(w["open_time"].iloc[-1])
    rows = store.conn.execute(
        "SELECT a.id, a.bar_time, l.label FROM labels l JOIN alerts a ON a.id = l.alert_id "
        "WHERE a.symbol=? AND a.timeframe=? AND a.bar_time BETWEEN ? AND ?", (symbol, tf, t0, t1)).fetchall()
    times = w["open_time"].to_numpy()
    return [{"i": int(np.searchsorted(times, bt)), "label": lab} for aid, bt, lab in rows if aid != exclude_id]


def chart(cfg, store, alert, blind: bool, before: int, after: int, plan: dict, layers=DEFAULT_LAYERS):
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
                      price_lines=plan_lines(plan), reg_channel=cfg["structure"].get("regression_channel"),
                      style=chart_style(), label_marks=past_labels(store, alert["symbol"], alert["timeframe"], w, alert["id"]),
                      levels=(alert.get("details") or {}).get("levels"))
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
    layers = layer_picker("layers_live")

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


def alert_header(alert: dict):
    """Compact one-liner above the chart; the full plain-language description is in a popup."""
    title, expl = signal_text(alert["signal"])
    feats = alert.get("features") or {}
    d = alert.get("details") or {}
    tf = alert["timeframe"]
    view = st.session_state.get("view", VIEW_DEFAULTS)
    top = st.columns([6, 1.2])
    if view["header"]:
        top[0].markdown(f"#### {direction_text(alert['direction'])} · {title}")
    trend = " ".join(f"{t}{trend_arrow(feats.get(f'{t}__swing_trend'))[:1]}" for t in ("1h", "4h"))
    parts = [f"**{symbol_name(alert['symbol'])}**", tf, local_time(alert["bar_time"]), f"cena **{alert['price']:.2f}**"]
    if alert["rsi"] is not None:
        parts.append(f"RSI {alert['rsi']:.0f}")
    if alert["volume_ratio"] is not None:
        parts.append(f"objem {alert['volume_ratio']:.1f}×")
    if d.get("adx") is not None:
        parts.append(f"ADX {d['adx']:.0f}")
    n_conf = len((d.get("confluence") or {}).get("families", []))
    if n_conf >= 2:
        parts.append(f"🧩 {n_conf} stratégie súhlasia")
    parts += [f"trend {trend}", f"#{alert['id']}"]
    if view["header"]:
        st.markdown(" · ".join(parts))

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
        sup, res = feats.get(f"{tf}__sup_dist_atr"), feats.get(f"{tf}__res_dist_atr")
        if sup is not None:
            rows.append(("Podpora", f"{sup:.1f} ATR", "pod cenou"))
        if res is not None:
            rows.append(("Rezistencia", f"{res:.1f} ATR", "nad cenou"))
        st.table(pd.DataFrame(rows, columns=["", "hodnota", "význam"]).set_index(""))
        if d.get("candidate_only"):
            st.caption("ℹ️ iba uložený kandidát (nešiel na Telegram)")


QUICK_QUESTIONS = ["Je to dobrý vstup? Prečo áno / nie?", "Kam by si dal SL a TP a prečo?",
                   "Čo hovoria trendové čiary a vyšší timeframe?", "Aké je tu najväčšie riziko?"]


def ask_claude(cfg, store, alert: dict, candles_df: pd.DataFrame, f: dict, label: dict | None):
    """Text-only Q&A about this alert with the owner's Claude Code login (see ktma/assistant.py)."""
    history = store.assistant_history(alert["id"])
    with st.expander(f"💬 Opýtaj sa Clauda ({len(history)})", expanded=bool(history)):
        assistant = ClaudeAssistant(cfg)
        ok, why = assistant.status()
        if not ok:
            st.info(f"{why} Návod je v README v časti „Opýtaj sa Clauda“.")
            return
        for q, a in history:
            st.chat_message("user").write(q)
            st.chat_message("assistant").write(a)
        qcols = st.columns(len(QUICK_QUESTIONS))
        quick = next((q for c, q in zip(qcols, QUICK_QUESTIONS)
                      if c.button(q, key=f"q{alert['id']}{q}", use_container_width=True)), None)
        with st.form(f"ask{alert['id']}", clear_on_submit=True):
            typed = st.text_area("Tvoja otázka", height=70, max_chars=1000,
                                 placeholder="napr. Prečo tu nebrať LONG, keď je RSI pod 20?")
            sent = st.form_submit_button("Opýtať sa")
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

    st.caption(f"Vo fronte: {len(queue)} alertov")
    alert_header(alert)

    atr = alert["atr"] or 0.0
    existing = store.label_for(alert["id"], f["labeler"]) or {}
    key = f"a{alert['id']}"
    default_dir = existing.get("label") or ("LONG" if alert["direction"] == "bullish" else "SHORT")

    view = st.session_state.get("view", VIEW_DEFAULTS)
    big = view["form"] != "vedľa grafu"
    if view["form"] == "vedľa grafu":
        chart_area, right = st.columns([3, 1])
        g1 = g2 = g3 = right
    else:
        chart_area = st.container()
        holder = st.container() if view["form"] == "pod grafom" else st.expander("🏷️ Labelovať tento alert")
        g1, g2, g3 = holder.columns(3)
    with g1:
        label = st.radio("Label", list(LABELS), format_func=LABELS.get, key=f"{key}_label",
                         index=list(LABELS).index(default_dir) if default_dir in LABELS else 0)
        correct_opts = list(CORRECT)
        correct_default = {1: 0, 0: 1}.get(existing.get("correct"), 2)
        correct = st.radio("Bol signál správny? (TRUE/FALSE)", correct_opts, index=correct_default,
                           key=f"{key}_correct", horizontal=True)
        conf = st.slider("Istota", 1, 3, existing.get("confidence") or 2, key=f"{key}_conf")
    with g2:
        side = -1 if label == "SHORT" else 1
        entry = st.number_input("Vstup (entry)", value=float(existing.get("entry") or alert["price"]),
                                format="%.2f", key=f"{key}_entry")
        sl = st.number_input("SL – stop loss", value=float(existing.get("stop_loss") or entry - side * atr * 1.0),
                             format="%.2f", key=f"{key}_sl")
        tp = st.number_input("TP – take profit", value=float(existing.get("take_profit") or entry + side * atr * 2.0),
                             format="%.2f", key=f"{key}_tp")
        be = st.number_input("BE – posun SL na break-even pri cene (0 = nie)",
                             value=float(existing.get("break_even") or 0.0), format="%.2f", key=f"{key}_be")
        risk = abs(entry - sl)
        rr = abs(tp - entry) / risk if risk else 0
        st.caption(f"Riziko {risk:.2f} ({risk / atr if atr else 0:.1f} ATR) · R:R = 1:{rr:.2f}")
    with g3:
        lq = st.selectbox("Trendové čiary na grafe", list(LINES_Q), key=f"{key}_lq",
                          index=list(LINES_Q.values()).index(existing.get("lines_quality")) if existing.get("lines_quality") in LINES_Q.values() else 0)
        note = st.text_area("Poznámka (prečo)", value=existing.get("note") or "", key=f"{key}_note", height=80)
        b1, b2 = st.columns(2)
        save = b1.button("💾 Uložiť a ďalší", type="primary", use_container_width=True)
        skip = b2.button("⏭ Preskočiť", use_container_width=True)

    plan = {"entry": entry, "sl": sl, "tp": tp, "be": be or None} if label in ("LONG", "SHORT") else {}
    with chart_area:
        layers = layer_picker("layers_label", stacked=not big)
        spec, height, df = chart(cfg, store, alert, f["blind"], f["before"], f["after"], plan, layers)
        render(spec, height,
               f"alert{alert['id']}-{int(f['blind'])}-{f['before']}-{f['after']}")
        if not view["extras"]:
            pass
        elif not f["blind"]:
            o = store.outcome(alert["id"])
            if o:
                res = {1: "✅ TP", -1: "❌ SL", 0: "⏱ timeout"}
                st.write(f"**Automaticky (TP {cfg['outcomes']['take_profit_atr']}×ATR / SL {cfg['outcomes']['stop_loss_atr']}×ATR):** "
                         f"LONG {res[o['long_result']]} za {o['long_bars']} sv. · SHORT {res[o['short_result']]} za {o['short_bars']} sv. · "
                         f"MFE {o['mfe_atr']:.1f} ATR · MAE {o['mae_atr']:.1f} ATR"
                         + (" · ⚠️ medzera/roll" if o["gap_flag"] else ""))
            if plan:
                tr = trade_result(df, alert["bar_time"], entry, sl, tp)
                if tr:
                    st.write(f"**Tvoj plán:** {'✅ TP' if tr['result'] == 1 else '❌ SL' if tr['result'] == -1 else '⏱ otvorený'} "
                             f"po {tr['bars']} sviečkach · výsledok **{tr['r_multiple']:+.2f} R**")
        if view["extras"]:
            ask_claude(cfg, store, alert, df, f, existing)
            with st.expander("Všetky uložené dáta alertu (features, čiary, indikátory)"):
                st.json({"details": alert["details"], "lines": alert["lines"], "features": alert["features"]},
                        expanded=False)

    if save:
        if not f["labeler"]:
            st.error("Vyplň meno v ľavom paneli.")
            return
        store.save_label({
            "alert_id": alert["id"], "labeler": f["labeler"], "label": label, "correct": CORRECT[correct],
            "confidence": conf, "entry": entry if plan else None, "stop_loss": sl if plan else None,
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
def main():
    if not password_ok():
        return
    cfg = load_config(CONFIG_PATH)
    db = os.environ.get("KTMA_DB") or cfg["db_path"]
    store = get_store(db)

    with st.sidebar:
        st.title("📈 KTMA")
        labeler = st.text_input("Tvoje meno", value=st.session_state.get("labeler", ""))
        st.session_state["labeler"] = labeler
        syms = [r[0] for r in store.conn.execute("SELECT DISTINCT symbol FROM alerts")]
        tfs = [r[0] for r in store.conn.execute("SELECT DISTINCT timeframe FROM alerts")]
        sigs = [r[0] for r in store.conn.execute("SELECT DISTINCT signal FROM alerts ORDER BY 1")]
        f = {
            "labeler": labeler,
            "symbols": st.multiselect("Symbol", syms),
            "tfs": st.multiselect("Timeframe", tfs),
            "signals": st.multiselect("Signál", sigs),
            "only_unlabeled": st.checkbox("Iba neoznačené", True),
            "only_notified": st.checkbox("Iba tie, čo išli na Telegram", True),
            "order": st.radio("Poradie", ["Najnovšie", "Najstaršie", "Náhodne"], horizontal=True),
            "blind": st.checkbox("Naslepo (skryť, čo bolo potom)", False,
                                 help="Uvidíš iba to, čo bolo známe v čase alertu. Do labelu sa uloží saw_future=0."),
            "before": st.slider("Sviečok pred alertom", 30, 400, 150),
            "after": st.slider("Sviečok po alerte", 0, 200, 60),
        }
        if st.button("Ďalší alert podľa filtrov"):
            st.session_state["current"] = None
            st.rerun()

    load_prefs(store, labeler)
    top = st.columns([7, 1.4, 1.4])
    with top[1]:
        view_settings("view")
    with top[2]:
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
