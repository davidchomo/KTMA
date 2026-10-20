from __future__ import annotations

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG = ROOT / "config.yaml"

_TF_UNITS = {"m": 60, "h": 3600, "d": 86400, "w": 604800}


def load_config(path: str | Path | None = None) -> dict:
    with open(path or DEFAULT_CONFIG, encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    db = Path(cfg["db_path"])
    if not db.is_absolute():
        cfg["db_path"] = str(ROOT / db)
    model = Path(cfg.get("model", {}).get("path", "models/model.joblib"))
    if not model.is_absolute():
        cfg.setdefault("model", {})["path"] = str(ROOT / model)
    return cfg


def tf_ms(timeframe: str) -> int:
    """'15m' -> 900000. Supports m, h, d, w."""
    return int(timeframe[:-1]) * _TF_UNITS[timeframe[-1]] * 1000


def all_timeframes(cfg: dict) -> list[str]:
    tfs = list(cfg["alert_timeframes"]) + list(cfg.get("context_timeframes", []))
    return sorted(set(tfs), key=tf_ms)
