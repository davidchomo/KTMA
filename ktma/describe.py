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
    (r"SR_BREAK_UP", "Prerazenie horizontálnej rezistencie", "Cena zatvorila nad úrovňou, kde sa viackrát otočila. "
     "Rezistencia sa môže stať podporou."),
    (r"SR_BREAK_DOWN", "Prerazenie horizontálnej podpory", "Cena zatvorila pod úrovňou, kde sa viackrát otočila. "
     "Podpora sa môže stať rezistenciou."),
    (r"SR_BOUNCE_SUPPORT", "Odraz od horizontálnej podpory", "Cena sa dotkla úrovne zdola nahor a odrazila sa."),
    (r"SR_BOUNCE_RESISTANCE", "Odraz od horizontálnej rezistencie", "Cena sa dotkla úrovne a odrazila sa dole."),
    (r"CONFLUENCE_LONG", "🧩 Súlad stratégií LONG", "Viac rôznych stratégií naraz ukazuje hore."),
    (r"CONFLUENCE_SHORT", "🧩 Súlad stratégií SHORT", "Viac rôznych stratégií naraz ukazuje dole."),
    (r"CHANNEL_BREAK_UP", "Výbeh nad regresný kanál", "Cena vybehla nad horný okraj trendového kanála."),
    (r"CHANNEL_BREAK_DOWN", "Výbeh pod regresný kanál", "Cena vybehla pod dolný okraj trendového kanála."),
    (r"HOLY_GRAIL_LONG", "Holy Grail LONG", "Silný rastový trend (ADX > 30), cena sa vrátila k EMA 20 a teraz prerazila "
     "maximum sviečky dotyku. Pokračovanie trendu (Linda Raschke)."),
    (r"HOLY_GRAIL_SHORT", "Holy Grail SHORT", "Silný klesajúci trend (ADX > 30), cena sa vrátila k EMA 20 a teraz prerazila "
     "minimum sviečky dotyku. Pokračovanie trendu (Linda Raschke)."),
    (r"ORB_UP_(\w+)", "Opening Range Breakout nahor ({0})", "Cena zatvorila nad rozsahom prvých minút seansy {0} (Toby Crabel)."),
    (r"ORB_DOWN_(\w+)", "Opening Range Breakout nadol ({0})", "Cena zatvorila pod rozsahom prvých minút seansy {0} (Toby Crabel)."),
    (r"HITCHHIKER_LONG_(\w+)", "Hitchhiker LONG ({0})", "Ranný ťah hore, tesná konsolidácia pri maxime a jej prerazenie (SMB scalp)."),
    (r"HITCHHIKER_SHORT_(\w+)", "Hitchhiker SHORT ({0})", "Ranný ťah dole, tesná konsolidácia pri minime a jej prerazenie (SMB scalp)."),
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



FAMILY_NAMES = {"RSI": "RSI", "MACD": "MACD", "EMA": "EMA", "VOL": "objem", "VWAP": "VWAP", "TL": "trendová čiara",
                "SR": "S/R úroveň", "CHANNEL": "kanál", "DONCHIAN": "Donchian", "HOLY_GRAIL": "Holy Grail",
                "ORB": "ORB", "HITCHHIKER": "Hitchhiker"}


def confluence_text(conf: dict | None) -> str | None:
    """'3 stratégie: RSI · trendová čiara · VWAP' (+ higher-timeframe trend)."""
    if not conf or not conf.get("families"):
        return None
    names = " · ".join(FAMILY_NAMES.get(f, f) for f in conf["families"])
    txt = f"{len(conf['families'])} stratégie: {names}" if len(conf["families"]) < 5 \
        else f"{len(conf['families'])} stratégií: {names}"
    if conf.get("htf"):
        txt += " · trend " + ", ".join(conf["htf"])
    return txt


def setup_text(setup: dict | None) -> str | None:
    """One line with the key levels of a named setup (from alert details)."""
    if not setup:
        return None
    if "or_high" in setup:
        return f"Opening range {setup['or_minutes']} min: {setup['or_low']:.2f} – {setup['or_high']:.2f}"
    if "setup_high" in setup:
        return f"Sviečka dotyku EMA 20: max {setup['setup_high']:.2f}, ADX {setup['adx']:.0f}"
    if "setup_low" in setup:
        return f"Sviečka dotyku EMA 20: min {setup['setup_low']:.2f}, ADX {setup['adx']:.0f}"
    if "consol_high" in setup:
        return (f"Konsolidácia {setup['consol_low']:.2f} – {setup['consol_high']:.2f}, "
                f"otvorenie seansy {setup['open_price']:.2f}")
    return None
