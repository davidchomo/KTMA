"""Training/analysis dataset: alerts + flattened features + outcomes + labels.

One row per alert and labeler; alerts nobody labeled yet are kept with empty
label columns, so the automatic outcomes can be used for pre-training."""

from __future__ import annotations

import json

import pandas as pd

from .outcomes import trade_result
from .storage import Store


def build_dataset(store: Store, candles_fn=None) -> pd.DataFrame:
    alerts = store.alerts()
    if alerts.empty:
        return alerts
    feats = pd.DataFrame([json.loads(f) if f else {} for f in alerts["features"]], index=alerts.index)
    base = alerts.drop(columns=["features", "details", "lines"]).join(feats)
    outcomes = pd.read_sql_query("SELECT * FROM outcomes", store.conn).drop(columns=["data", "computed_at"])
    base = base.merge(outcomes.add_prefix("out_").rename(columns={"out_alert_id": "id"}), on="id", how="left")
    labels = store.labels()
    if labels.empty:
        return base
    labels = labels.rename(columns={"id": "label_id", "created_at": "label_created_at"})
    if candles_fn is not None:
        r = []
        cache: dict = {}
        for lab in labels.itertuples(index=False):
            a = alerts.loc[alerts["id"] == lab.alert_id].iloc[0]
            key = (a.symbol, a.timeframe)
            if key not in cache:
                cache[key] = candles_fn(a.symbol, a.timeframe)
            tr = trade_result(cache[key], int(a.bar_time), lab.entry, lab.stop_loss, lab.take_profit)
            r.append(tr or {})
        trades = pd.DataFrame(r, index=labels.index, columns=["result", "bars", "rr", "r_multiple"])
        labels = labels.join(trades.add_prefix("trade_"))
    # One row per (alert, labeler); unlabeled alerts stay in (auto-labels from outcomes).
    return base.merge(labels, left_on="id", right_on="alert_id", how="left")


def ev_table(ds: pd.DataFrame, by: str = "signal") -> pd.DataFrame:
    """Expected value (in R) of the labeler's trades, grouped by signal or timeframe."""
    if ds.empty or "trade_r_multiple" not in ds:
        return pd.DataFrame()
    t = ds.dropna(subset=["trade_r_multiple"])
    if t.empty:
        return pd.DataFrame()
    g = t.groupby(by)["trade_r_multiple"]
    return pd.DataFrame({
        "obchodov": g.size(),
        "win_rate_%": g.apply(lambda s: (s > 0).mean() * 100).round(1),
        "priem_R (EV)": g.mean().round(2),
        "spolu_R": g.sum().round(2),
    }).sort_values("priem_R (EV)", ascending=False)
