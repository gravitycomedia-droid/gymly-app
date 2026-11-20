"""funnel.py — 4.1 owner activation funnel: counts, step/overall conversion, median time between steps, by tier."""
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

import config as C
from common import load_world, savefig, savetab, update_results, pct

STEPS = C.FUNNEL_STEPS
LABEL = {s: s.replace("_", " ") for s in STEPS}


def funnel_table(ev):
    reached = ev.pivot_table(index="owner_id", columns="event", values="ts", aggfunc="min")
    rows = []
    n0 = reached["landing_visit"].notna().sum()
    for i, s in enumerate(STEPS):
        n = int(reached[s].notna().sum()) if s in reached else 0
        prev = rows[-1]["count"] if rows else n
        med_h = None
        if i > 0 and s in reached:
            both = reached[[STEPS[i - 1], s]].dropna()
            med_h = float(((both[s] - both[STEPS[i - 1]]).dt.total_seconds() / 3600).median())
        rows.append({"step_no": i + 1, "step": s, "ga4_event": C.GA4_EVENT_MAP[s], "count": n,
                     "step_conversion_pct": pct(n / prev) if prev else None,
                     "drop_off_pct": pct(1 - n / prev) if prev and i > 0 else None,
                     "overall_conversion_pct": pct(n / n0),
                     "median_hours_from_prev": None if med_h is None else round(med_h, 2)})
    df = pd.DataFrame(rows)
    df.loc[0, "step_conversion_pct"] = None
    return df


def run():
    ev = load_world("baseline", with_attendance=False)["funnel_events"]
    ev_s = load_world("strategy", with_attendance=False)["funnel_events"]
    tab = funnel_table(ev)
    tab_s = funnel_table(ev_s)
    savetab(tab, "4_1", "funnel_baseline")
    savetab(tab_s, "4_6", "funnel_strategy")

    # by tier
    tier_rows = []
    for t in C.TIERS:
        tt = funnel_table(ev[ev.gym_tier == t])
        tt.insert(0, "gym_tier", t)
        tier_rows.append(tt)
    tiers = pd.concat(tier_rows, ignore_index=True)
    savetab(tiers, "4_1", "funnel_by_tier")

    drops = tab.iloc[1:].sort_values("drop_off_pct", ascending=False)
    largest, second = drops.iloc[0], drops.iloc[1]

    # ── fig: funnel bars ──
    fig, ax = plt.subplots(figsize=(8, 4.8))
    y = np.arange(len(tab))[::-1]
    colors = [C.PALETTE["critical"] if s == largest.step else C.PALETTE["primary"] for s in tab.step]
    ax.barh(y, tab["count"], color=colors, height=0.7, edgecolor="white", linewidth=2)
    for yi, (_, r) in zip(y, tab.iterrows()):
        lab = f"{r['count']:,}" + ("" if pd.isna(r.step_conversion_pct) else f"  ({r.step_conversion_pct:.1f}% of previous)")
        ax.text(r["count"] + 30, yi, lab, va="center", fontsize=8.5, color=C.PALETTE["ink2"])
    ax.set_yticks(y, [LABEL[s] for s in tab.step])
    ax.set_xlabel("Owners reaching step (baseline, Jan–Oct 2026)")
    ax.set_xlim(0, tab["count"].max() * 1.45)
    ax.grid(axis="y", visible=False)
    savefig(fig, "4_1", "funnel", "Owner activation funnel (baseline): owners reaching each step with step conversion; the largest drop (first plan → first member) is highlighted.")

    # ── fig: by tier (% of landing reaching each step) ──
    fig, ax = plt.subplots(figsize=(8, 4.2))
    x = np.arange(len(STEPS))
    for t in C.TIERS:
        d = tiers[tiers.gym_tier == t]
        ax.plot(x, d["overall_conversion_pct"], marker="o", ms=5, lw=2, color=C.TIER_COLOR[t], label=f"{t} tier (n={int(d['count'].iloc[0])})")
    ax.set_yscale("log")
    ax.set_yticks([0.3, 1, 3, 10, 30, 100], ["0.3%", "1%", "3%", "10%", "30%", "100%"])
    ax.set_xticks(x, [LABEL[s] for s in STEPS], rotation=35, ha="right")
    ax.set_ylabel("Share of landing visits reaching step (log scale)")
    ax.legend(loc="lower left")
    savefig(fig, "4_1", "funnel_by_tier", "Funnel split by gym tier: share of each tier's landing visits that reach every step (log scale).")

    payload = {
        "steps": tab.to_dict("records"),
        "strategy_steps": tab_s.to_dict("records"),
        "by_tier": {t: tiers[tiers.gym_tier == t][["step", "count", "step_conversion_pct", "overall_conversion_pct"]].to_dict("records") for t in C.TIERS},
        "landing_visits": int(tab["count"].iloc[0]),
        "paid": int(tab["count"].iloc[-1]),
        "overall_conversion_pct": float(tab["overall_conversion_pct"].iloc[-1]),
        "largest_drop": {"from": STEPS[int(largest.step_no) - 2], "to": largest.step, "drop_off_pct": float(largest.drop_off_pct),
                         "step_conversion_pct": float(largest.step_conversion_pct), "median_hours": largest.median_hours_from_prev},
        "second_drop": {"from": STEPS[int(second.step_no) - 2], "to": second.step, "drop_off_pct": float(second.drop_off_pct),
                        "step_conversion_pct": float(second.step_conversion_pct)},
        "checkout_views_per_day": float(tab.set_index("step").loc["checkout_viewed", "count"] / ((C.WINDOW_END - C.WINDOW_START).days + 1)),
    }
    assert payload["largest_drop"]["to"] == "first_member_added", "acceptance: largest drop must be first_plan_created -> first_member_added"
    update_results("funnel", payload)
    return payload


if __name__ == "__main__":
    run()
