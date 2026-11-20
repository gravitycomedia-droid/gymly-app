"""
export_import.py — 4.3: event files shaped for manual import into Mixpanel and PostHog.

No API calls are made. Contents: the baseline owner-funnel events plus the
simulated checkout_variant A/B events (checkout_viewed / payment_attempted /
subscription_paid / payment_failed, with the variant as a property).
All IDs are synthetic; there is no PII.

  data/mixpanel_events.json  — JSON array, Mixpanel import format:
                               {"event", "properties": {"distinct_id", "time" (unix s), "$insert_id", ...}}
  data/posthog_events.csv    — event, distinct_id, timestamp (ISO 8601), properties (JSON string)
"""
import json

import pandas as pd

import config as C
from common import load_world, update_results


def events():
    ev = load_world("baseline", with_attendance=False)["funnel_events"]
    rows = []
    for r in ev.itertuples(index=False):
        props = {"gym_id": r.gym_id, "gym_tier": r.gym_tier, "city": r.city, "locality": r.locality,
                 "plan_tier": r.plan_tier, "value": r.value, "ga4_event": r.ga4_event, "world": "baseline", "synthetic": True}
        rows.append((r.event, r.owner_id, r.timestamp, props))
    ab = pd.read_csv(C.DATA / "ab_test" / "ab_checkout_events.csv")
    for r in ab.itertuples(index=False):
        base = {"gym_id": r.gym_id, "gym_tier": r.gym_tier, "checkout_variant": r.checkout_variant, "test_day": int(r.test_day),
                "world": "ab_test", "synthetic": True}
        t = pd.Timestamp(r.checkout_viewed_at[:19])
        rows.append(("checkout_viewed", r.owner_id, r.checkout_viewed_at, base))
        if r.payment_attempted:
            rows.append(("payment_attempted", r.owner_id, (t + pd.Timedelta(minutes=2)).strftime("%Y-%m-%dT%H:%M:%S") + C.TZ, base))
        if r.payment_failed:
            rows.append(("payment_failed", r.owner_id, (t + pd.Timedelta(minutes=3)).strftime("%Y-%m-%dT%H:%M:%S") + C.TZ, base))
        if r.subscription_paid:
            rows.append(("subscription_paid", r.owner_id, (t + pd.Timedelta(minutes=3)).strftime("%Y-%m-%dT%H:%M:%S") + C.TZ, base))
    return rows


def clean(props):
    return {k: v for k, v in props.items() if v is not None and not (isinstance(v, float) and pd.isna(v))}


def run():
    rows = events()
    mp, ph = [], []
    for i, (name, did, ts, props) in enumerate(rows):
        p = clean(props)
        unix = int(pd.Timestamp(ts).timestamp())
        mp.append({"event": name, "properties": {"distinct_id": did, "time": unix, "$insert_id": f"gl-{i:07d}", **p}})
        ph.append({"event": name, "distinct_id": did, "timestamp": ts, "properties": json.dumps(p, sort_keys=True)})
    (C.DATA / "mixpanel_events.json").write_text(json.dumps(mp, ensure_ascii=False, indent=None) + "\n")
    pd.DataFrame(ph).to_csv(C.DATA / "posthog_events.csv", index=False)
    counts = pd.Series([r[0] for r in rows]).value_counts().to_dict()
    update_results("exports", {"mixpanel_file": "data/mixpanel_events.json", "posthog_file": "data/posthog_events.csv",
                               "n_events": len(rows), "events_by_name": counts, "api_calls": 0})
    return len(rows)


if __name__ == "__main__":
    run()
