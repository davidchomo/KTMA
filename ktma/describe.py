"""Human-readable (Slovak) descriptions of signals and indicator values,
shared by the label UI and Telegram messages."""

from __future__ import annotations

import re

SYMBOL_NAMES = {
    "XAUUSD": "XAU/USD · zlato", "XAGUSD": "XAG/USD · striebro",
    "GC=F": "GC=F · zlato (futures)", "SI=F": "SI=F · striebro (futures)",
}

# (regex, title, explanation); {0}, {1} are regex groups.
_SIGNALS = [
    (r"RSI_ABOVE_(\d+)", "RSI vystúpilo nad {0}", "Trh je prekúpený, rast môže slabnúť (alebo je to silný trend)."),
    (r"RSI_BELOW_(\d+)", "RSI kleslo pod {0}", "Trh je prepredaný, pokles môže slabnúť (alebo je to silný trend)."),
    (r"RSI_EXIT_ABOVE_(\d+)", "RSI sa vrátilo pod {0}", "Koniec prekúpenia, rast stráca silu."),
    (r"RSI_EXIT_BELOW_(\d+)", "RSI sa vrátilo nad {0}", "Koniec prepredania, pokles stráca silu."),
    (r"MACD_BULL_CROSS", "MACD prekrížilo signál nahor", "Momentum sa otáča hore."),
    (r"MACD_BEAR_CROSS", "MACD prekrížilo signál nadol", "Momentum sa otáča dole."),
    (r"MACD_ZERO_UP", "MACD nad nulou", "Krátkodobý trend je nad dlhodobým."),
    (r"MACD_ZERO_DOWN", "MACD pod nulou", "Krátkodobý trend je pod dlhodobým."),
    (r"MA_(\d+)_(\d+)_GOLDEN", "EMA {0} prekrížila EMA {1} nahor", "Golden cross, trend sa otáča hore."),
    (r"MA_(\d+)_(\d+)_DEATH", "EMA {0} prekrížila EMA {1} nadol", "Death cross, trend sa otáča dole."),
    (r"PRICE_ABOVE_MA_(\d+)", "Cena prerazila nad EMA {0}", "Cena je nad dlhodobým priemerom."),
    (r"PRICE_BELOW_MA_(\d+)", "Cena prerazila pod EMA {0}", "Cena je pod dlhodobým priemerom."),
    (r"VOLUME_SPIKE_UP", "Veľký objem na rastovej sviečke", "Výrazný záujem kupujúcich."),
    (r"VOLUME_SPIKE_DOWN", "Veľký objem na klesajúcej sviečke", "Výrazný záujem predávajúcich."),
    (r"VWAP_CROSS_UP", "Cena prekrížila VWAP nahor", "Cena je nad priemernou cenou dňa, navrch majú kupujúci."),
    (r"VWAP_CROSS_DOWN", "Cena prekrížila VWAP nadol", "Cena je pod priemernou cenou dňa, navrch majú predávajúci."),
    (r"VWAP_UPPER_(.+)SD", "Cena na hornom pásme VWAP (+{0}σ)", "Cena je ďaleko nad priemerom dňa, natiahnutá smerom hore."),
    (r"VWAP_LOWER_(.+)SD", "Cena na dolnom pásme VWAP (−{0}σ)", "Cena je ďaleko pod priemerom dňa, natiahnutá smerom dole."),
    (r"TL_BREAK_UP", "Prerazenie rezistencie (trendovej čiary)", "Cena zatvorila nad čiarou, ktorá ju doteraz brzdila."),
    (r"TL_BREAK_DOWN", "Prerazenie podpory (trendovej čiary)", "Cena zatvorila pod čiarou, ktorá ju doteraz držala."),
    (r"TL_TOUCH_RESISTANCE", "Odraz od rezistencie", "Cena sa dotkla čiary zhora a odrazila sa dole."),
    (r"TL_TOUCH_SUPPORT", "Odraz od podpory", "Cena sa dotkla čiary zdola a odrazila sa hore."),
    (r"CHANNEL_BREAK_UP", "Výbeh nad regresný kanál", "Cena vybehla nad horný okraj trendového kanála."),
    (r"CHANNEL_BREAK_DOWN", "Výbeh pod regresný kanál", "Cena vybehla pod dolný okraj trendového kanála."),
    (r"DONCHIAN_BREAK_UP_(\d+)", "Nové {0}-sviečkové maximum", "Cena prerazila najvyššiu cenu za posledných {0} sviečok."),
    (r"DONCHIAN_BREAK_DOWN_(\d+)", "Nové {0}-sviečkové minimum", "Cena prerazila najnižšiu cenu za posledných {0} sviečok."),
]


def symbol_name(symbol: str) -> str:
    return SYMBOL_NAMES.get(symbol, symbol)


def signal_text(signal: str) -> tuple[str, str]:
    for pattern, title, expl in _SIGNALS:
        m = re.fullmatch(pattern, signal)
        if m:
            return title.format(*m.groups()), expl.format(*m.groups())
    return signal, ""


def direction_text(direction: str) -> str:
    return {"bullish": "🟢 možný LONG", "bearish": "🔴 možný SHORT"}.get(direction, "⚪ bez smeru")


def rsi_text(rsi) -> str:
    if rsi is None:
        return "–"
    if rsi >= 80:
        return "silne prekúpené"
    if rsi >= 70:
        return "prekúpené"
    if rsi <= 20:
        return "silne prepredané"
    if rsi <= 30:
        return "prepredané"
    return "neutrálne"


def volume_text(vr) -> str:
    if vr is None:
        return "–"
    if vr >= 2:
        return "silný objem"
    if vr >= 1.3:
        return "nadpriemerný"
    if vr >= 0.8:
        return "bežný"
    return "slabý"


def adx_text(adx) -> str:
    if adx is None:
        return "–"
    if adx >= 30:
        return "silný trend"
    if adx >= 20:
        return "slabý trend"
    return "bez trendu (do strán)"


def trend_arrow(v) -> str:
    if v is None:
        return "–"
    return "↑ rastie" if v > 0 else ("↓ klesá" if v < 0 else "↔ do strán")

