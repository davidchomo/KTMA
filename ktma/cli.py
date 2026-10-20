"""Command line: python -m ktma <command>"""

from __future__ import annotations

import argparse
import logging
import os
import subprocess
import sys
from pathlib import Path

from .config import DEFAULT_CONFIG, ROOT, load_config


def _load_env():
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def _scanner(cfg, config_path=None):
    from .data import get_provider
    from .notify import Notifier
    from .scanner import Scanner
    from .storage import Store

    return Scanner(cfg, Store(cfg["db_path"]), get_provider(cfg), Notifier(cfg), config_path)


def main(argv=None):
    _load_env()
    p = argparse.ArgumentParser(prog="ktma", description="KTMA – technické alerty + labelovanie")
    p.add_argument("--config", default=os.environ.get("KTMA_CONFIG"))
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("backfill", help="stiahne históriu a vytvorí historické alerty (bez notifikácií)")
    sc = sub.add_parser("scan", help="živý skener (každú minútu)")
    sc.add_argument("--once", action="store_true", help="iba jeden prechod")
    sub.add_parser("outcomes", help="dopočíta, čo sa stalo po alertoch")
    sub.add_parser("stats", help="počty sviečok, alertov a labelov")
    ex = sub.add_parser("export", help="dataset pre tréning (CSV)")
    ex.add_argument("--out", default="data/dataset.csv")
    sub.add_parser("test-telegram", help="pošle skúšobnú správu na Telegram")
    bk = sub.add_parser("backup", help="záloha databázy (bezpečná aj počas behu skenera)")
    bk.add_argument("--out", default=None)
    dm = sub.add_parser("demo", help="offline demo so syntetickými dátami (data/demo.sqlite)")
    dm.add_argument("--days", type=int, default=10)
    lu = sub.add_parser("label-ui", help="spustí webovú appku na labelovanie")
    lu.add_argument("--port", default="8501")
    args = p.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    cfg = load_config(args.config)

    if args.cmd == "demo":
        cfg["data"] = {"provider": "synthetic", "synthetic": {"days": args.days}}
        cfg["db_path"] = str(ROOT / "data" / "demo.sqlite")
        cfg["symbols"] = ["GC=F"]
        cfg["notify"] = {"console": False, "telegram": False}
        s = _scanner(cfg)
        s.backfill()
        _print_stats(s.store)
        print(f"\nHotovo. Appka na labelovanie nad demo dátami:\n  KTMA_DB={cfg['db_path']} python -m ktma label-ui")
        return

    if args.cmd == "label-ui":
        app = Path(__file__).resolve().parent.parent / "label_app.py"
        cmd = [sys.executable, "-m", "streamlit", "run", str(app), "--server.port", args.port,
               "--server.headless", "true"]
        sys.exit(subprocess.call(cmd))

    if args.cmd == "test-telegram":
        from .notify import Notifier

        cfg["notify"]["telegram"] = True
        n = Notifier(cfg)
        ok = n.telegram and n.send({"symbol": "TEST", "timeframe": "5m", "signal": "TEST_SPRAVA",
                                    "direction": "neutral", "price": 0.0, "bar_time": 0, "id": 0})
        print("OK" if ok else "Nepodarilo sa – skontroluj TELEGRAM_BOT_TOKEN a TELEGRAM_CHAT_ID v .env")
        return

    s = _scanner(cfg, args.config or DEFAULT_CONFIG)
    if args.cmd == "backfill":
        s.backfill()
        _print_stats(s.store)
    elif args.cmd == "scan":
        s.run_forever(once=args.once)
    elif args.cmd == "outcomes":
        print("dopočítané:", s.update_outcomes())
    elif args.cmd == "backup":
        import sqlite3
        from datetime import datetime, timezone

        out = Path(args.out) if args.out else ROOT / "data" / "backups" / \
            f"ktma-{datetime.now(timezone.utc):%Y%m%d-%H%M}.sqlite"
        out.parent.mkdir(parents=True, exist_ok=True)
        dst = sqlite3.connect(out)
        s.store.conn.backup(dst)
        dst.close()
        print(f"Záloha: {out}")
    elif args.cmd == "stats":
        _print_stats(s.store)
    elif args.cmd == "export":
        from .dataset import build_dataset

        ds = build_dataset(s.store, s.candles)
        out = ROOT / args.out if not Path(args.out).is_absolute() else Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        ds.to_csv(out, index=False)
        print(f"{len(ds)} riadkov -> {out}")


def _print_stats(store):
    q = store.conn.execute
    print("\nSviečky:")
    for r in q("SELECT symbol, timeframe, COUNT(*), MIN(open_time), MAX(open_time) FROM candles GROUP BY 1,2"):
        print(f"  {r[0]:6} {r[1]:4} {r[2]:7}")
    print("Alerty podľa TF (spolu / na notifikáciu):")
    for r in q("SELECT timeframe, COUNT(*), SUM(notify) FROM alerts GROUP BY 1 ORDER BY 1"):
        print(f"  {r[0]:4} {r[1]:6} / {r[2]}")
    print("Najčastejšie signály:")
    for r in q("SELECT signal, COUNT(*) c FROM alerts GROUP BY 1 ORDER BY c DESC LIMIT 12"):
        print(f"  {r[0]:28} {r[1]}")
    n_out = q("SELECT COUNT(*) FROM outcomes").fetchone()[0]
    n_lab = q("SELECT COUNT(*) FROM labels").fetchone()[0]
    print(f"Outcomes: {n_out} · Labely: {n_lab}")


if __name__ == "__main__":
    main()
