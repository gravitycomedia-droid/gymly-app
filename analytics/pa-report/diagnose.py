"""diagnose.py — 4.4: exactly three product issues, each with metric, evidence, chart and proposed fix."""
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

import config as C
from common import load_results, load_world, savefig, savetab, update_results, pct

WIN0 = pd.Timestamp(C.WINDOW_START)


def run():
    res = load_results()
    fun = res["funnel"]
    w = load_world("baseline")
    per, att, ev = w["memberships"], w["attendance_logs"], w["funnel_events"]
    issues = []

    # ── (a) member-add drop-off in onboarding ──────────────────────────────────
    steps = pd.DataFrame(fun["steps"]).iloc[1:]
    fig, ax = plt.subplots(figsize=(8, 3.8))
    x = np.arange(len(steps))
    col = [C.PALETTE["critical"] if s == "first_member_added" else (C.PALETTE["secondary"] if s == "subscription_paid" else C.PALETTE["muted"]) for s in steps.step]
    ax.bar(x, steps.drop_off_pct, color=col, width=0.65, edgecolor="white", linewidth=2)
    for xi, v in zip(x, steps.drop_off_pct):
        ax.text(xi, v + 1, f"{v:.0f}%", ha="center", fontsize=8.5, color=C.PALETTE["ink2"])
    ax.set_xticks(x, [f"→ {s.replace('_', ' ')}" for s in steps.step], rotation=35, ha="right")
    ax.set_ylabel("Drop-off from previous step (%)")
    ax.set_ylim(0, 85)
    ax.grid(axis="x", visible=False)
    fa = savefig(fig, "4_4", "issue_a_member_add_dropoff", "Issue (a): drop-off at every funnel step; first plan → first member (red) is the largest, checkout → paid (orange) second.")
    ld = fun["largest_drop"]
    # gyms that did add members: how long did the roster take to enter? (manual one-by-one entry)
    mem = w["members"]
    new_g = w["gyms"][w["gyms"].origin == "funnel_2026"].gym_id
    roster = mem[mem.gym_id.isin(new_g) & (mem.member_source == "roster_import")]
    g = roster.groupby("gym_id").start_date.agg(["min", "max"])
    roster_days = float(((g["max"] - g["min"]).dt.days).median())
    issues.append({
        "id": "a", "title": "Owners stall at adding their first member",
        "metric": "first_plan_created → first_member_added step conversion",
        "evidence": f"{ld['drop_off_pct']:.1f}% of owners who created a plan never added a member (conversion {ld['step_conversion_pct']:.1f}%), "
                    f"the largest drop in the funnel; median {ld['median_hours']:.0f} h between the two steps for those who did, and new gyms took a median "
                    f"{roster_days:.0f} days to enter their existing roster one member at a time.",
        "evidence_numbers": {"drop_off_pct": ld["drop_off_pct"], "step_conversion_pct": ld["step_conversion_pct"],
                             "median_hours_to_first_member": ld["median_hours"], "median_days_to_enter_roster": roster_days},
        "chart": fa,
        "fix": "Bulk CSV/Excel member import (map name/phone/plan/expiry columns) plus an onboarding checklist that makes 'import your members' the next step after the first plan.",
    })

    # ── (b) silent churn: attendance decays before expiry, nobody is notified ──
    dec = per[per.renewed.notna() & (per.membership_end >= WIN0 + pd.Timedelta(days=42)) & (per.duration_days >= 90)].copy()
    a = att[["member_id", "date"]].merge(dec[["member_id", "membership_end", "payment_id", "churned"]], on="member_id")
    a["d"] = (a.membership_end - a.date).dt.days
    a = a[(a.d >= 1) & (a.d <= 42)]
    a["wk"] = (a.d - 1) // 7      # 0 = last week before expiry
    wk = a.groupby(["payment_id", "wk"]).size().unstack(fill_value=0).reindex(dec.payment_id, fill_value=0)
    wk = wk.reindex(columns=range(6), fill_value=0)
    dec = dec.set_index("payment_id")
    traj = wk.groupby(dec.churned).mean().T          # avg visits per week by weeks before expiry
    traj.index.name = "weeks_before_expiry"
    tab = traj.rename(columns={False: "renewed", True: "churned"}).reset_index()
    tab["weeks_before_expiry"] = tab.weeks_before_expiry + 1
    savetab(tab, "4_4", "visits_before_expiry")
    last2 = wk[[0, 1]].sum(axis=1) / 2
    prior = wk[[2, 3, 4, 5]].sum(axis=1) / 4
    decayed = (last2 < 0.5 * prior) & (prior > 0)
    ch = dec.churned
    share_decay_churn = float(decayed[ch].mean())
    share_decay_renew = float(decayed[~ch].mean())
    # alertable: a 10+ day gap with no check-in inside the last 28 days before expiry
    a2 = a[a.d <= 28].groupby("payment_id").d.apply(lambda s: np.diff(np.sort(np.concatenate([[0], s.values, [29]]))).max())
    gap = a2.reindex(dec.index).fillna(29)
    alertable = float((gap > 10)[ch].mean())
    churners = int(ch.sum())
    fig, ax = plt.subplots(figsize=(7, 3.8))
    xx = tab.weeks_before_expiry
    ax.plot(xx, tab.renewed, marker="o", lw=2, color=C.PALETTE["primary"], label="renewed")
    ax.plot(xx, tab.churned, marker="o", lw=2, color=C.PALETTE["secondary"], label="churned")
    ax.invert_xaxis()
    ax.set_xticks(xx, [f"-{int(v)}" for v in xx])
    ax.set_xlabel("Week before subscription_expiry (quarterly+ plans)")
    ax.set_ylabel("Avg check-ins per member per week")
    ax.set_ylim(0)
    ax.legend(loc="lower left")
    fb = savefig(fig, "4_4", "issue_b_silent_churn", "Issue (b): weekly check-ins in the 6 weeks before expiry — churners' attendance decays for 2–4 weeks while renewers stay flat.")
    reminders = int(per.reminders_sent.sum())
    issues.append({
        "id": "b", "title": "Silent churn — attendance decays before expiry and nobody is notified",
        "metric": "share of churners whose check-ins in the last 2 weeks fell below 50% of their prior 4-week rate",
        "evidence": f"{100 * share_decay_churn:.0f}% of churners (vs {100 * share_decay_renew:.0f}% of renewers) showed a >50% attendance decay in the 2 weeks before expiry, "
                    f"and {100 * alertable:.0f}% had a 10+ day gap with no check-in in their last 4 weeks — yet {reminders} renewal reminders or at-risk alerts were sent in the baseline.",
        "evidence_numbers": {"churners_analysed": churners, "decay_share_churners_pct": pct(share_decay_churn),
                             "decay_share_renewers_pct": pct(share_decay_renew), "alertable_gap10_share_churners_pct": pct(alertable),
                             "reminders_sent_baseline": reminders,
                             "visits_last_week_churned": float(tab.churned.iloc[0]), "visits_last_week_renewed": float(tab.renewed.iloc[0])},
        "chart": fb,
        "fix": "Automated WhatsApp renewal reminders at expiry −7d / −1d / +3d, and an at-risk alert to the owner when a member has 10+ days with no check-in.",
    })

    # ── (c) checkout abandonment ──────────────────────────────────────────────
    sd = fun["second_drop"]
    rows = []
    for t in C.TIERS:
        bt = {r["step"]: r["count"] for r in fun["by_tier"][t]}
        rows.append({"gym_tier": t, "checkout_viewed": bt["checkout_viewed"], "subscription_paid": bt["subscription_paid"],
                     "conversion_pct": pct(bt["subscription_paid"] / bt["checkout_viewed"]) if bt["checkout_viewed"] else None})
    ct = pd.DataFrame(rows)
    savetab(ct, "4_4", "checkout_by_tier")
    cv = ev[ev.event == "checkout_viewed"].groupby("plan_tier").size()
    pdd = ev[ev.event == "subscription_paid"].groupby("plan_tier").size()
    byplan = pd.DataFrame({"checkout_viewed": cv, "subscription_paid": pdd}).fillna(0).astype(int)
    byplan["conversion_pct"] = (100 * byplan.subscription_paid / byplan.checkout_viewed).round(1)
    byplan["price_inr"] = byplan.index.map(C.SAAS_PLAN_PRICE)
    byplan = byplan.sort_values("price_inr").reset_index().rename(columns={"index": "plan_tier"})
    savetab(byplan, "4_4", "checkout_by_plan")
    fig, ax = plt.subplots(figsize=(6.5, 3.8))
    x = np.arange(len(ct))
    ax.bar(x, 100 - ct.conversion_pct, color=[C.TIER_COLOR[t] for t in ct.gym_tier], width=0.55, edgecolor="white", linewidth=2)
    for xi, r in zip(x, ct.itertuples()):
        ax.text(xi, 100 - r.conversion_pct + 1.5, f"{100 - r.conversion_pct:.0f}%\n({r.checkout_viewed - r.subscription_paid}/{r.checkout_viewed})", ha="center", fontsize=8.5, color=C.PALETTE["ink2"])
    ax.set_xticks(x, [f"{t} tier" for t in ct.gym_tier])
    ax.set_ylabel("Checkout abandonment (%)")
    ax.set_ylim(0, 100)
    ax.grid(axis="x", visible=False)
    fc = savefig(fig, "4_4", "issue_c_checkout_abandonment", "Issue (c): share of owners who viewed checkout but did not pay, by gym tier (abandoned / viewed).")
    issues.append({
        "id": "c", "title": "Checkout abandonment on the Gymloop subscription",
        "metric": "checkout_viewed → subscription_paid conversion",
        "evidence": f"{sd['drop_off_pct']:.1f}% of owners who opened checkout did not pay (conversion {sd['step_conversion_pct']:.1f}%), the second-largest funnel drop; "
                    f"abandonment is highest in the low tier ({100 - ct.set_index('gym_tier').conversion_pct['low']:.0f}%).",
        "evidence_numbers": {"drop_off_pct": sd["drop_off_pct"], "step_conversion_pct": sd["step_conversion_pct"],
                             "by_tier": ct.to_dict("records"), "by_plan": byplan.to_dict("records")},
        "chart": fc,
        "fix": "Redesigned checkout (checkout_variant = new_design): one-screen plan summary with UPI-first Razorpay, monthly price and trial terms up front, fewer fields — validated by the 4.7 A/B test.",
    })

    assert len(issues) == 3
    update_results("issues", issues)
    return issues


if __name__ == "__main__":
    run()
