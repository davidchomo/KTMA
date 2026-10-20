"""Notifications: console and Telegram."""

from __future__ import annotations

import html
import logging
import os

import pandas as pd
import requests

log = logging.getLogger(__name__)

ARROW = {"bullish": "🟢 LONG?", "bearish": "🔴 SHORT?", "neutral": "⚪"}


def format_alert(alert: dict, label_url: str | None = None) -> str:
    t = pd.Timestamp(alert["bar_time"], unit="ms", tz="UTC").strftime("%Y-%m-%d %H:%M")
    d = alert.get("details") or {}
    f = alert.get("features") or {}
    tf = alert["timeframe"]
    lines = [
        f"<b>{html.escape(alert['symbol'])} {tf}</b> · {html.escape(alert['signal'])}",
        f"{ARROW.get(alert['direction'], '')} · cena <b>{alert['price']:.2f}</b>",
    ]
    vals = []
    if alert.get("rsi") is not None:
        vals.append(f"RSI {alert['rsi']:.1f}")
    if alert.get("volume_ratio") is not None:
        vals.append(f"Vol {alert['volume_ratio']:.1f}×")
    if d.get("adx") is not None:
        vals.append(f"ADX {d['adx']:.0f}")
    if alert.get("atr") is not None:
        vals.append(f"ATR {alert['atr']:.2f}")
    if vals:
        lines.append(" · ".join(vals))
    if d.get("line"):
        ln = d["line"]
        lines.append(f"Čiara: {ln['kind']} · dotyky {ln['touches']} · úroveň {ln['value']:.2f}")
    trend = []
    for ctx in ("1h", "4h"):
        st = f.get(f"{ctx}__swing_trend")
        if st is not None:
            trend.append(f"{ctx} {'↑' if st > 0 else '↓' if st < 0 else '↔'}")
    if trend:
        lines.append("Trend: " + " · ".join(trend))
    if alert.get("model_score") is not None:
        lines.append(f"Model: {alert['model_score'] * 100:.0f} %")
    lines.append(f"{t} UTC (začiatok sviečky) · #{alert.get('id', '?')}")
    if label_url:
        lines.append(f'<a href="{html.escape(label_url)}">Označiť</a>')
    return "\n".join(lines)


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
        url = f"{self.label_url}?alert={alert.get('id')}" if self.label_url else None
        text = format_alert(alert, url)
        if self.console:
            print("\n" + html.unescape(text.replace("<b>", "").replace("</b>", "")), flush=True)
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
