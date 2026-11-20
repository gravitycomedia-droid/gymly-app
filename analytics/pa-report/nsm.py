"""nsm.py — Ch.3 North Star Metric: Weekly Active Members (members with >= 2 check-ins in a week, all gyms)."""
import matplotlib.pyplot as plt
import pandas as pd

import config as C
from common import load_world, savefig, savetab, update_results

FIRST_WEEK = pd.Timestamp("2026-01-05")   # first Monday fully inside the window
LAST_WEEK = pd.Timestamp("2026-10-19")    # last Monday whose week ends inside the window


def weekly(world):
    w = load_world(world)
    att, per, mem = w["attendance_logs"], w["memberships"], w["members"]
    att = att.assign(week=att["date"] - pd.to_timedelta(att["date"].dt.weekday, unit="D"))
    att = att[(att.week >= FIRST_WEEK) & (att.week <= LAST_WEEK)]
    per_member = att.groupby(["week", "member_id"]).size()
    wam = (per_member >= 2).groupby(level=0).sum()
    active_members = per_member.groupby(level=0).size()
    checkins = att.groupby("week").size()
    gyms = att.groupby("week")["gym_id"].nunique()
    mem = mem.assign(week=mem["start_date"] - pd.to_timedelta(mem["start_date"].dt.weekday, unit="D"))
    new = mem.groupby("week").size()
    dec = per[per.renewed.notna()].copy()
    dec["week"] = dec["membership_end"] - pd.to_timedelta(dec["membership_end"].dt.weekday, unit="D")
    ren = dec.groupby("week")["renewed"].apply(lambda s: (s == True).mean())  # noqa: E712
    df = pd.DataFrame({"wam": wam, "active_members": active_members, "active_gyms": gyms,
                       "checkins": checkins}).fillna(0)
    df["checkins_per_active_member"] = df.checkins / df.active_members
    df["new_members_added"] = new.reindex(df.index).fillna(0).astype(int)
    df["renewal_rate"] = ren.reindex(df.index)
    df.index.name = "week_start"
    return df.reset_index()


def run():
    b, s = weekly("baseline"), weekly("strategy")
    out = b.merge(s, on="week_start", suffixes=("_baseline", "_strategy"))
    out["week_start"] = out.week_start.dt.strftime("%Y-%m-%d")
    savetab(out, "3", "nsm_weekly")

    fig, ax = plt.subplots(figsize=(8, 4))
    for world, d in (("baseline", b), ("strategy", s)):
        ax.plot(d.week_start, d.wam, lw=2, color=C.WORLD_COLOR[world], label=f"{world}")
        ax.annotate(f"{int(d.wam.iloc[-1]):,}", (d.week_start.iloc[-1], d.wam.iloc[-1]), xytext=(4, 0),
                    textcoords="offset points", va="center", fontsize=8.5, color=C.PALETTE["ink2"])
    ax.set_ylabel("Weekly Active Members (≥2 check-ins / week)")
    ax.set_xlabel("Week starting (2026)")
    ax.set_ylim(0)
    ax.legend(loc="upper left")
    savefig(fig, "3", "wam_trend", "North Star Metric: Weekly Active Members per week, baseline vs strategy world (Jan–Oct 2026).")

    def summ(d, last=8):
        t = d.tail(last)
        return {
            "wam_first_week": int(d.wam.iloc[0]), "wam_last_week": int(d.wam.iloc[-1]),
            "wam_avg_last8": float(t.wam.mean()), "wam_growth_pct": float(100 * (d.wam.iloc[-1] / d.wam.iloc[0] - 1)),
            "active_gyms_avg_last8": float(t.active_gyms.mean()),
            "checkins_per_active_member_avg_last8": float(t.checkins_per_active_member.mean()),
            "renewal_rate_avg_last8_pct": float(100 * t.renewal_rate.mean()),
            "new_members_per_week_avg_last8": float(t.new_members_added.mean()),
            "wam_share_of_active_members_avg_last8_pct": float(100 * (t.wam / t.active_members).mean()),
        }
    sb, ss = summ(b), summ(s)
    tree = pd.DataFrame([
        ("L0 (NSM)", "Weekly Active Members", "Members with >= 2 check-ins in an ISO week, all gyms", "wam_avg_last8"),
        ("L1 breadth", "Active gyms / week", "Gyms with >= 1 check-in that week", "active_gyms_avg_last8"),
        ("L1 depth", "Check-ins per active member", "Check-ins / members with >= 1 check-in that week", "checkins_per_active_member_avg_last8"),
        ("L1 retention", "Renewal rate (%)", "Expiring memberships renewed within 7 days", "renewal_rate_avg_last8_pct"),
        ("L1 acquisition", "New members added / week", "Members whose start_date falls in the week", "new_members_per_week_avg_last8"),
        ("L2 habit", "WAM share of active members (%)", "WAM / members with >= 1 check-in", "wam_share_of_active_members_avg_last8_pct"),
    ], columns=["level", "metric", "definition", "key"])
    tree["baseline_avg_last8wk"] = tree.key.map(sb).round(2)
    tree["strategy_avg_last8wk"] = tree.key.map(ss).round(2)
    tree["delta_pct"] = (100 * (tree.strategy_avg_last8wk / tree.baseline_avg_last8wk - 1)).round(1)
    savetab(tree.drop(columns="key"), "3", "nsm_input_tree")

    payload = {"definition": "Weekly Active Members (WAM): members with at least 2 check-ins in a week (Mon–Sun), across all gyms",
               "weeks": len(b), "first_week": FIRST_WEEK, "last_week": LAST_WEEK,
               "baseline": sb, "strategy": ss,
               "wam_lift_last8_pct": float(100 * (ss["wam_avg_last8"] / sb["wam_avg_last8"] - 1)),
               "input_tree": tree.drop(columns="key").to_dict("records")}
    update_results("nsm", payload)
    return payload


if __name__ == "__main__":
    run()
