"""strategy_eval.py — 4.6: baseline vs strategy world, side by side (same seeds, interventions on)."""
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

import config as C
from churn import monthly_churn
from common import load_results, load_world, savefig, savetab, update_results, pct

WIN0, WIN1 = pd.Timestamp(C.WINDOW_START), pd.Timestamp(C.WINDOW_END)


def kpis(world, res):
    w = load_world(world, with_attendance=False)
    per, mem, gyms = w["memberships"], w["members"], w["gyms"]
    mc = monthly_churn(per)
    dec = per[per.renewed.notna() & (per.membership_end >= WIN0) & (per.membership_end <= WIN1)]
    steps = {r["step"]: r for r in res["funnel"]["steps" if world == "baseline" else "strategy_steps"]}
    nsm = res["nsm"][world]
    rev = per[(per.membership_start >= WIN0) & (per.membership_start <= WIN1)].final_amount.sum()
    return mc, {
        "member_add_conversion_pct": steps["first_member_added"]["step_conversion_pct"],
        "gyms_onboarded_2026": int((gyms.origin == "funnel_2026").sum()),
        "paid_subscriptions": steps["subscription_paid"]["count"],
        "avg_monthly_churn_pct": float(mc.monthly_churn_pct.mean()),
        "renewal_rate_pct": pct((dec.renewed == True).mean()),  # noqa: E712
        "members_in_window": int(len(mem)),
        "active_members_oct31": int((mem.status == "active").sum()),
        "wam_avg_last8": nsm["wam_avg_last8"],
        "member_fee_revenue_inr": int(rev),
        "saved_by_reminder": int((per.saved_by == "renewal_reminder").sum()),
        "saved_by_alert": int((per.saved_by == "at_risk_alert").sum()),
        "reminders_sent": int(per.reminders_sent.sum()),
        "at_risk_alerts": int(per.at_risk_alerted.sum()),
        "alert_returns": int(per.returned_after_alert.sum()),
    }


def run():
    res = load_results()
    mb, kb = kpis("baseline", res)
    ms, ks = kpis("strategy", res)
    comp = pd.DataFrame({"metric": list(kb), "baseline": list(kb.values()), "strategy": [ks[k] for k in kb]})
    comp["delta"] = comp.strategy - comp.baseline
    comp["delta_pct"] = np.where(comp.baseline != 0, 100 * comp.delta / comp.baseline.replace(0, np.nan), np.nan).round(1)
    savetab(comp, "4_6", "strategy_vs_baseline")
    mm = mb[["month", "monthly_churn_pct"]].merge(ms[["month", "monthly_churn_pct"]], on="month", suffixes=("_baseline", "_strategy"))
    savetab(mm, "4_6", "monthly_churn_compare")

    fig, ax = plt.subplots(figsize=(8, 3.8))
    x = np.arange(len(mm))
    wdt = 0.38
    ax.bar(x - wdt / 2 - 0.01, mm.monthly_churn_pct_baseline, wdt, color=C.WORLD_COLOR["baseline"], label="baseline", edgecolor="white", linewidth=2)
    ax.bar(x + wdt / 2 + 0.01, mm.monthly_churn_pct_strategy, wdt, color=C.WORLD_COLOR["strategy"], label="strategy", edgecolor="white", linewidth=2)
    ax.set_xticks(x, pd.PeriodIndex(mm.month, freq="M").strftime("%b"))
    ax.set_ylabel("Monthly churn (%)")
    ax.legend(loc="upper right", ncol=2)
    ax.grid(axis="x", visible=False)
    savefig(fig, "4_6", "churn_baseline_vs_strategy", "Monthly churn, baseline vs strategy world (reminders + at-risk alerts + bulk import switched on from Jan 2026).")

    show = ["member_add_conversion_pct", "renewal_rate_pct", "avg_monthly_churn_pct", "wam_avg_last8", "active_members_oct31", "member_fee_revenue_inr"]
    lab = {"member_add_conversion_pct": "Plan → member conversion", "renewal_rate_pct": "Renewal rate",
           "avg_monthly_churn_pct": "Monthly churn", "wam_avg_last8": "WAM (last 8 wk avg)",
           "active_members_oct31": "Active members (31 Oct)", "member_fee_revenue_inr": "Member-fee revenue"}
    c = comp.set_index("metric").loc[show]
    fig, ax = plt.subplots(figsize=(7, 3.6))
    y = np.arange(len(c))[::-1]
    col = [C.PALETTE["secondary"] if v >= 0 else C.PALETTE["primary"] for v in c.delta_pct]
    ax.barh(y, c.delta_pct, color=col, height=0.6, edgecolor="white", linewidth=2)
    for yi, v in zip(y, c.delta_pct):
        ax.text(v + (0.8 if v >= 0 else -0.8), yi, f"{v:+.1f}%", va="center", ha="left" if v >= 0 else "right", fontsize=8.5, color=C.PALETTE["ink2"])
    ax.axvline(0, color=C.PALETTE["ink2"], lw=0.8)
    ax.set_yticks(y, [lab[k] for k in show])
    ax.set_xlabel("Strategy vs baseline (relative change, %)")
    lim = max(abs(c.delta_pct).max() * 1.3, 5)
    ax.set_xlim(-lim, lim)
    ax.grid(axis="y", visible=False)
    savefig(fig, "4_6", "strategy_kpi_deltas", "Relative change in key metrics, strategy world vs baseline.")

    payload = {"interventions": C.STRATEGY, "baseline": kb, "strategy": ks,
               "delta_pct": dict(zip(comp.metric, comp.delta_pct)),
               "monthly_churn": mm.to_dict("records")}
    update_results("strategy", payload)
    return payload


if __name__ == "__main__":
    run()
