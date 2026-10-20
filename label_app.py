"""KTMA – webová appka na labelovanie alertov.

Spustenie:  python -m ktma label-ui     (alebo: streamlit run label_app.py)
Env: KTMA_DB (iná databáza), KTMA_UI_PASSWORD (heslo), KTMA_CONFIG (iný config).
"""

from __future__ import annotations

import os
from pathlib import Path

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st
import yaml
from plotly.subplots import make_subplots

from ktma.cli import _load_env
from ktma.config import ROOT, load_config, tf_ms
from ktma.data import resample
from ktma.dataset import build_dataset, ev_table
from ktma.indicators import add_indicators
from ktma.outcomes import trade_result
from ktma.storage import Store

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


def chart(cfg, store, alert, blind: bool, before: int, after: int, plan: dict):
    df = candles(store, alert["symbol"], alert["timeframe"])
    times = df["open_time"].to_numpy()
    ai = int(np.searchsorted(times, alert["bar_time"]))
    lo = max(0, ai - before - 300)              # extra bars to warm up indicators
    hi = ai + 1 if blind else min(len(df), ai + after + 1)
    w = add_indicators(df.iloc[lo:hi].reset_index(drop=True), cfg)
    start = ai - lo - before if ai - lo - before > 0 else 0
    w = w.iloc[start:].reset_index(drop=True)
    x = np.arange(len(w))
    a_x = ai - lo - start
    labels = [fmt_time(t)[5:] for t in w["open_time"]]

    fig = make_subplots(rows=4, cols=1, shared_xaxes=True, vertical_spacing=0.02,
                        row_heights=[0.58, 0.12, 0.15, 0.15])
    fig.add_trace(go.Candlestick(x=x, open=w["open"], high=w["high"], low=w["low"], close=w["close"],
                                 name="cena", text=labels, showlegend=False), row=1, col=1)
    for p, color in ((21, "#f2a900"), (50, "#3b82f6"), (200, "#a855f7")):
        if f"ma_{p}" in w:
            fig.add_trace(go.Scatter(x=x, y=w[f"ma_{p}"], name=f"EMA {p}", line=dict(width=1, color=color)), row=1, col=1)
    if "vwap" in w:
        fig.add_trace(go.Scatter(x=x, y=w["vwap"], name="VWAP", line=dict(width=1, color="#14b8a6", dash="dot")), row=1, col=1)
    rc = cfg["structure"].get("regression_channel")
    if rc and a_x + 1 >= rc["period"]:
        # Straight channel fitted on the last `period` closes up to the alert bar (what the scanner saw).
        xs = np.arange(a_x + 1 - rc["period"], a_x + 1)
        b, a0 = np.polyfit(xs, w["close"].to_numpy()[xs], 1)
        sd = np.std(w["close"].to_numpy()[xs] - (a0 + b * xs))
        for k, dash in ((rc["std"], "dash"), (0, "dot"), (-rc["std"], "dash")):
            fig.add_trace(go.Scatter(x=xs[[0, -1]], y=a0 + b * xs[[0, -1]] + k * sd, mode="lines",
                                     name="regresný kanál", showlegend=k > 0,
                                     line=dict(width=1, color="#94a3b8", dash=dash)), row=1, col=1)

    # Trendlines exactly as the scanner knew them at alert time.
    wt = w["open_time"].to_numpy()
    for ln in alert.get("lines") or []:
        x1 = int(np.searchsorted(wt, ln["t1"]))
        if x1 >= len(wt) or wt[x1] != ln["t1"]:
            x1 = a_x - ln["bars_from_t1"]
        x_end = min(len(w) - 1, a_x + (0 if ln["ended_here"] else 40))
        xs = np.array([max(x1, 0), x_end])   # clip to the visible window
        ys = ln["p1"] + ln["slope_per_bar"] * (xs - x1)
        color = "#ef4444" if ln["kind"] == "resistance" else "#22c55e"
        fig.add_trace(go.Scatter(x=xs, y=ys, mode="lines", line=dict(color=color, width=2),
                                 name=f"{ln['kind']} ({ln['touches']}×)"), row=1, col=1)
        if ln.get("channel_offset"):
            fig.add_trace(go.Scatter(x=xs, y=ys + ln["channel_offset"], mode="lines", showlegend=False,
                                     line=dict(color=color, width=1, dash="dot")), row=1, col=1)

    marker_y = alert["price"]
    fig.add_trace(go.Scatter(x=[a_x], y=[marker_y], mode="markers", name="alert",
                             marker=dict(size=14, symbol="triangle-up" if alert["direction"] == "bullish" else "triangle-down",
                                         color="#22c55e" if alert["direction"] == "bullish" else "#ef4444",
                                         line=dict(width=1, color="black"))), row=1, col=1)
    fig.add_vline(x=a_x, line=dict(color="#64748b", width=1, dash="dot"))
    for name, val, color in (("Vstup", plan.get("entry"), "#0ea5e9"), ("SL", plan.get("sl"), "#ef4444"),
                             ("TP", plan.get("tp"), "#22c55e"), ("BE", plan.get("be"), "#eab308")):
        if val:
            fig.add_shape(type="line", x0=a_x, x1=len(w) - 1, y0=val, y1=val, line=dict(color=color, width=1, dash="dash"),
                          row=1, col=1)
            fig.add_annotation(x=len(w) - 1, y=val, text=name, showarrow=False, xanchor="left",
                               font=dict(color=color, size=10), row=1, col=1)

    vol_colors = np.where(w["close"] >= w["open"], "#22c55e", "#ef4444")
    fig.add_trace(go.Bar(x=x, y=w["volume"], marker_color=vol_colors, name="objem", showlegend=False), row=2, col=1)
    fig.add_trace(go.Scatter(x=x, y=w["rsi"], name="RSI", line=dict(color="#a855f7", width=1)), row=3, col=1)
    r = cfg["indicators"]["rsi"]
    for lvl in (r["overbought"], r["oversold"]):
        fig.add_hline(y=lvl, line=dict(color="#94a3b8", width=1, dash="dash"), row=3, col=1)
    fig.add_trace(go.Bar(x=x, y=w["macd_hist"], name="MACD hist", marker_color="#94a3b8", showlegend=False), row=4, col=1)
    fig.add_trace(go.Scatter(x=x, y=w["macd"], name="MACD", line=dict(color="#3b82f6", width=1)), row=4, col=1)
    fig.add_trace(go.Scatter(x=x, y=w["macd_signal"], name="signál", line=dict(color="#f97316", width=1)), row=4, col=1)

    # Y axis follows the candles (+ trade plan), so far-away lines don't squash the chart.
    ys = [w["low"].min(), w["high"].max()] + [v for v in plan.values() if v]
    pad = (max(ys) - min(ys)) * 0.05
    fig.update_yaxes(range=[min(ys) - pad, max(ys) + pad], row=1, col=1)
    step = max(1, len(x) // 10)
    fig.update_xaxes(tickvals=x[::step], ticktext=labels[::step], rangeslider_visible=False)
    fig.update_layout(height=780, margin=dict(l=10, r=60, t=10, b=10), hovermode="x unified",
                      legend=dict(orientation="h", y=1.02, x=0))
    return fig, df


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
    c = st.columns([3, 1, 1, 1])
    dir_txt = {"bullish": "🟢 býčí (LONG?)", "bearish": "🔴 medvedí (SHORT?)"}.get(alert["direction"], alert["direction"])
    c[0].subheader(f"#{alert['id']} · {alert['symbol']} {alert['timeframe']} · {alert['signal']}")
    c[1].metric("Cena", f"{alert['price']:.2f}")
    c[2].metric("RSI", f"{alert['rsi']:.1f}" if alert["rsi"] is not None else "–")
    c[3].metric("Objem", f"{alert['volume_ratio']:.1f}×" if alert["volume_ratio"] is not None else "–")
    st.write(f"{dir_txt} · {fmt_time(alert['bar_time'])} UTC · ATR {alert['atr'] or 0:.2f}"
             + (" · *iba kandidát (bez notifikácie)*" if (alert["details"] or {}).get("candidate_only") else ""))

    atr = alert["atr"] or 0.0
    existing = store.label_for(alert["id"], f["labeler"]) or {}
    key = f"a{alert['id']}"
    default_dir = existing.get("label") or ("LONG" if alert["direction"] == "bullish" else "SHORT")

    left, right = st.columns([3, 1])
    with right:
        label = st.radio("Label", list(LABELS), format_func=LABELS.get, key=f"{key}_label",
                         index=list(LABELS).index(default_dir) if default_dir in LABELS else 0)
        correct_opts = list(CORRECT)
        correct_default = {1: 0, 0: 1}.get(existing.get("correct"), 2)
        correct = st.radio("Bol signál správny? (TRUE/FALSE)", correct_opts, index=correct_default,
                           key=f"{key}_correct", horizontal=True)
        conf = st.slider("Istota", 1, 3, existing.get("confidence") or 2, key=f"{key}_conf")
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
        lq = st.selectbox("Trendové čiary na grafe", list(LINES_Q), key=f"{key}_lq",
                          index=list(LINES_Q.values()).index(existing.get("lines_quality")) if existing.get("lines_quality") in LINES_Q.values() else 0)
        note = st.text_area("Poznámka (prečo)", value=existing.get("note") or "", key=f"{key}_note", height=80)
        b1, b2 = st.columns(2)
        save = b1.button("💾 Uložiť a ďalší", type="primary", use_container_width=True)
        skip = b2.button("⏭ Preskočiť", use_container_width=True)

    plan = {"entry": entry, "sl": sl, "tp": tp, "be": be or None} if label in ("LONG", "SHORT") else {}
    with left:
        fig, df = chart(cfg, store, alert, f["blind"], f["before"], f["after"], plan)
        st.plotly_chart(fig, use_container_width=True)
        if not f["blind"]:
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
        with st.expander("Všetky uložené dáta alertu (features, čiary, indikátory)"):
            st.json({"details": alert["details"], "lines": alert["lines"], "features": alert["features"]}, expanded=False)

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

    tabs = st.tabs(["🏷️ Labelovanie", "➕ Premeškaný vstup", "📊 Štatistiky a EV", "⚙️ Nastavenia a slovník"])
    with tabs[0]:
        page_label(cfg, store, f)
    with tabs[1]:
        page_manual(cfg, store, f)
    with tabs[2]:
        page_stats(cfg, store)
    with tabs[3]:
        page_settings(cfg)


main()
