from __future__ import annotations

from pathlib import Path

import yaml

DEFAULT_CONFIG = Path(__file__).resolve().parent.parent / "config.yaml"

_TF_UNITS = {"m": 60, "h": 3600, "d": 86400, "w": 604800}


def load_config(path: str | Path | None = None) -> dict:
    with open(path or DEFAULT_CONFIG, encoding="utf-8") as f:
        return yaml.safe_load(f)


def tf_ms(timeframe: str) -> int:
    """'15m' -> 900000. Supports m, h, d, w."""
    return int(timeframe[:-1]) * _TF_UNITS[timeframe[-1]] * 1000
