"""Notifications: console and Telegram."""

from __future__ import annotations

import html
import logging
import os
import re

import pandas as pd
import requests

from .describe import (adx_text, confluence_text, direction_text, rsi_text, setup_text, signal_text, symbol_name, trend_arrow,
                       volume_text)

log = logging.getLogger(__name__)

def format_alert(alert: dict, label_url: str | None = None) -> str:
    title, expl = signal_text(alert["signal"])
    d = alert.get("details") or {}
    f = alert.get("features") or {}
    t = pd.Timestamp(alert["bar_time"], unit="ms", tz="UTC").tz_convert("Europe/Bratislava").strftime("%d.%m. %H:%M")
    out = [
        f"{direction_text(alert['direction'])} · <b>{html.escape(symbol_name(alert['symbol']))}</b> · {alert['timeframe']}",
        f"<b>{html.escape(title)}</b>",
    ]
    if expl:
        out.append(html.escape(expl))
    out.append("")
    vals = [f"Cena <b>{alert['price']:.2f}</b>"]
    if alert.get("rsi") is not None:
        vals.append(f"RSI {alert['rsi']:.0f} ({rsi_text(alert['rsi'])})")
    if alert.get("volume_ratio") is not None:
        vals.append(f"Objem {alert['volume_ratio']:.1f}× ({volume_text(alert['volume_ratio'])})")
    out.append(" · ".join(vals))
    ctx = []
    if d.get("adx") is not None:
        ctx.append(f"ADX {d['adx']:.0f} ({adx_text(d['adx'])})")
    for tf in ("1h", "4h"):
        st = f.get(f"{tf}__swing_trend")
        if st is not None:
            ctx.append(f"{tf} {trend_arrow(st)}")
    if ctx:
        out.append(" · ".join(ctx))
    if d.get("line"):
        ln = d["line"]
        kind = "rezistencia" if ln["kind"] == "resistance" else "podpora"
        out.append(f"📏 Čiara: {kind}, {ln['touches']} dotyky, {ln['value']:.2f}")
    if d.get("level"):
        out.append(f"📏 Úroveň: {d['level']['price']:.2f} ({d['level']['touches']} dotyky)")
    if setup_text(d.get("setup")):
        out.append(f"🎯 {setup_text(d.get('setup'))}")
    plan = d.get("plan")
    if plan and plan.get("rr") is not None:
        out.append(f"🎯 Návrh: SL {plan['sl']:.2f} · TP {plan['tp']:.2f} · <b>R:R 1:{plan['rr']:.1f}</b>")
    conf = d.get("confluence") or {}
    if len(conf.get("families", [])) >= 2:
        out.append(f"🧩 Súlad: {confluence_text(conf)}")
    if alert.get("model_score") is not None:
        out.append(f"🤖 Model: {alert['model_score'] * 100:.0f} %")
    out.append(f"🕒 {t} (SK čas) · #{alert.get('id', '?')}")
    if label_url:
        out.append(f'<a href="{html.escape(label_url)}">👉 Označiť</a>')
    return "\n".join(out)


class Notifier:
    def __init__(self, cfg: dict):
        n = cfg.get("notify", {})
        self.console = n.get("console", True)
        self.telegram = n.get("telegram", False)
        self.token = os.environ.get("TELEGRAM_BOT_TOKEN")
        self.chat_id = os.environ.get("TELEGRAM_CHAT_ID")
        self.label_url = os.environ.get("KTMA_LABEL_URL")
        if self.telegram and not (self.token and self.chat_id):
            log.warning("Telegram je zapnutý, ale chýba TELEGRAM_BOT_TOKEN alebo TELEGRAM_CHAT_ID")
            self.telegram = False

    def send(self, alert: dict) -> bool:
        url = f"{self.label_url.rstrip('/')}/?alert={alert.get('id')}" if self.label_url else None
        text = format_alert(alert, url)
        if self.console:
            print("\n" + html.unescape(re.sub(r"<[^>]+>", "", text)), flush=True)
        if self.telegram:
            try:
                r = requests.post(
                    f"https://api.telegram.org/bot{self.token}/sendMessage",
                    json={"chat_id": self.chat_id, "text": text, "parse_mode": "HTML",
                          "disable_web_page_preview": True},
                    timeout=10,
                )
                r.raise_for_status()
            except requests.RequestException as e:
                # Don't log the exception text: its URL contains the bot token.
                log.error("Telegram zlyhal: %s", type(e).__name__)
                return False
        return True
