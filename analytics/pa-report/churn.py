"""
churn.py — 4.2 churn analysis on the baseline world.

Churn definition: a membership period is churned if the member did not renew
within 7 days after subscription_expiry. Monthly churn rate = members whose
period expired in month m and churned / members with an active membership on
the 1st of month m.
"""
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

import config as C
from common import load_world, savefig, savetab, update_results, pct

WIN0, WIN1 = pd.Timestamp(C.WINDOW_START), pd.Timestamp(C.WINDOW_END)
BANDS = [(0, 1, "<1"), (1, 2, "1–2"), (2, 3, "2–3"), (3, 4, "3–4"), (4, 99, "4+")]


def monthly_churn(per):
    rows = []
    for m in pd.period_range(C.WINDOW_START, C.WINDOW_END, freq="M"):
        s, e = m.start_time, m.end_time.normalize()
        active = per[(per.membership_start <= s) & (per.membership_end > s)].member_id.nunique()
        ch = per[per.churned & (per.membership_end >= s) & (per.membership_end <= e)].member_id.nunique()
        exp = per[(per.membership_end >= s) & (per.membership_end <= e) & per.renewed.notna()]
        rows.append({"month": str(m), "active_at_start": active, "churned": ch, "monthly_churn_pct": pct(ch / active),
                     "expiring": len(exp), "renewal_rate_pct": pct((exp.renewed == True).mean())})  # noqa: E712
    return pd.DataFrame(rows)


def member_lives(per, mem):
    """One row per member: first start, end of life (last expiry if churned) and event flag."""
    g = per.groupby("member_id")
    last = g.tail(1).set_index("member_id")
    lives = pd.DataFrame({"first_start": pd.to_datetime(g["first_start"].min()),
                          "end": last["membership_end"], "churned": last["churned"]})
    lives["first_plan_months"] = per[per.period_index == 0].set_index("member_id")["plan_months"].reindex(lives.index)
    return lives


def kaplan_meier(durations, events):
    """Hand-rolled Kaplan–Meier estimator. Returns (times, survival) step arrays."""
    d = np.asarray(durations, float)
    e = np.asarray(events, bool)
    times = np.unique(d[e])
    surv, s = [], 1.0
    for t in times:
        at_risk = (d >= t).sum()
        deaths = ((d == t) & e).sum()
        s *= 1 - deaths / at_risk
        surv.append(s)
    return np.concatenate([[0], times]), np.concatenate([[1.0], surv])


def run():
    w = load_world("baseline")
    per, mem, att = w["memberships"], w["members"], w["attendance_logs"]

    # ── monthly churn ──
    mc = monthly_churn(per)
    savetab(mc, "4_2", "monthly_churn")
    fig, ax = plt.subplots(figsize=(8, 3.8))
    x = np.arange(len(mc))
    ax.bar(x, mc.monthly_churn_pct, color=C.PALETTE["primary"], width=0.65, edgecolor="white", linewidth=2)
    avg = mc.monthly_churn_pct.mean()
    ax.axhline(avg, color=C.PALETTE["neutral"], lw=1.2, ls="--")
    ax.text(len(mc) - 0.45, avg, f"mean\n{avg:.1f}%", ha="left", va="center", fontsize=8.5, color=C.PALETTE["ink2"])
    ax.set_xlim(-0.6, len(mc) + 0.3)
    for xi, v in zip(x, mc.monthly_churn_pct):
        ax.text(xi, v + 0.25, f"{v:.1f}", ha="center", fontsize=8, color=C.PALETTE["ink2"])
    ax.set_xticks(x, pd.PeriodIndex(mc.month, freq="M").strftime("%b"))
    ax.set_ylabel("Monthly churn (% of active members)")
    ax.grid(axis="x", visible=False)
    savefig(fig, "4_2", "monthly_churn", "Baseline monthly churn rate (members not renewing within 7 days of expiry / active members at month start).")

    # ── cohort retention heatmap (join month x months since join) ──
    lives = member_lives(per, mem)
    coh = lives[(lives.first_start >= WIN0) & (lives.first_start <= WIN1)].copy()
    coh["cohort"] = coh.first_start.dt.to_period("M")
    grid = pd.DataFrame(index=pd.period_range(C.WINDOW_START, C.WINDOW_END, freq="M"), columns=range(10), dtype=float)
    sizes = coh.groupby("cohort").size()
    for c, d in coh.groupby("cohort"):
        for k in range(10):
            t = d.first_start + pd.to_timedelta(30 * k, unit="D")
            observable = t <= WIN1
            if not observable.any() or observable.mean() < 0.5:
                continue
            dd, tt = d[observable], t[observable]
            alive = ~(dd.churned & (dd.end <= tt))
            grid.loc[c, k] = 100 * alive.mean()
    grid.index = grid.index.strftime("%Y-%m")
    out = grid.round(1)
    out.insert(0, "cohort_size", sizes.reindex(pd.PeriodIndex(out.index, freq="M")).values)
    savetab(out.reset_index(names="join_month"), "4_2", "cohort_retention")
    fig, ax = plt.subplots(figsize=(8, 4.6))
    im = ax.imshow(grid.values.astype(float), cmap="Blues", vmin=0, vmax=100, aspect="auto")
    for i in range(grid.shape[0]):
        for j in range(grid.shape[1]):
            v = grid.values[i, j]
            if not np.isnan(v):
                ax.text(j, i, f"{v:.0f}", ha="center", va="center", fontsize=7.5, color="white" if v > 60 else C.PALETTE["ink"])
    ax.set_xticks(range(10), [f"M{k}" for k in range(10)])
    ax.set_yticks(range(len(grid)), [f"{pd.Period(p).strftime('%b')} (n={sizes.get(pd.Period(p), 0):,})" for p in grid.index])
    ax.set_xlabel("Months since join (30-day steps)")
    ax.set_ylabel("Join cohort (2026)")
    ax.grid(False)
    cb = fig.colorbar(im, ax=ax, fraction=0.04)
    cb.set_label("% of cohort still a member")
    savefig(fig, "4_2", "cohort_retention", "Cohort retention heatmap: % of each 2026 join-month cohort still a member after k months (blank = not yet observable).")

    # ── churn by plan length (per expiring period, in window) ──
    dec = per[per.renewed.notna() & (per.membership_end >= WIN0) & (per.membership_end <= WIN1)].copy()
    bp = dec.groupby("plan_months").agg(expiring=("churned", "size"), churned=("churned", "sum"))
    bp["churn_at_expiry_pct"] = (100 * bp.churned / bp.expiring).round(2)
    bp["monthly_equiv_churn_pct"] = (100 * (1 - (1 - bp.churned / bp.expiring) ** (1 / bp.index.values))).round(2)
    bp = bp.reset_index()
    bp["plan_name"] = bp.plan_months.map(C.PLAN_NAME)
    savetab(bp, "4_2", "churn_by_plan")
    fig, ax = plt.subplots(figsize=(6.5, 3.8))
    x = np.arange(len(bp))
    wdt = 0.38
    ax.bar(x - wdt / 2 - 0.01, bp.churn_at_expiry_pct, wdt, color=C.PALETTE["primary"], label="churn at expiry", edgecolor="white", linewidth=2)
    ax.bar(x + wdt / 2 + 0.01, bp.monthly_equiv_churn_pct, wdt, color=C.PALETTE["secondary"], label="monthly-equivalent churn", edgecolor="white", linewidth=2)
    for xi, a_, b_ in zip(x, bp.churn_at_expiry_pct, bp.monthly_equiv_churn_pct):
        ax.text(xi - wdt / 2, a_ + 0.6, f"{a_:.0f}%", ha="center", fontsize=8, color=C.PALETTE["ink2"])
        ax.text(xi + wdt / 2, b_ + 0.6, f"{b_:.0f}%", ha="center", fontsize=8, color=C.PALETTE["ink2"])
    ax.set_xticks(x, [f"{n}\n({m} mo)" for n, m in zip(bp.plan_name, bp.plan_months)])
    ax.set_ylabel("Churn (%)")
    ax.legend(loc="upper left")
    ax.grid(axis="x", visible=False)
    savefig(fig, "4_2", "churn_by_plan", "Churn by plan length: share of expiring memberships not renewed, and the equivalent monthly churn rate.")

    # ── churn by attendance band (visits/week in the 30 days before expiry) ──
    a = att[["member_id", "date"]].merge(dec[["member_id", "membership_end", "duration_days", "churned", "payment_id"]], on="member_id")
    a = a[(a.date < a.membership_end) & (a.date >= a.membership_end - pd.Timedelta(days=30))]
    visits = a.groupby("payment_id").size()
    dec = dec[dec.membership_end >= WIN0 + pd.Timedelta(days=30)].copy()
    dec["visits_per_week_last30"] = dec.payment_id.map(visits).fillna(0) / (30 / 7)
    dec["band"] = pd.cut(dec.visits_per_week_last30, [b[0] for b in BANDS] + [99], right=False, labels=[b[2] for b in BANDS])
    ab = dec.groupby("band", observed=False).agg(expiring=("churned", "size"), churned=("churned", "sum")).reset_index()
    ab["churn_pct"] = (100 * ab.churned / ab.expiring).round(2)
    savetab(ab, "4_2", "churn_by_attendance_band")
    fig, ax = plt.subplots(figsize=(6.5, 3.8))
    x = np.arange(len(ab))
    ax.bar(x, ab.churn_pct, color=C.PALETTE["primary"], width=0.6, edgecolor="white", linewidth=2)
    for xi, v, n in zip(x, ab.churn_pct, ab.expiring):
        ax.text(xi, v + 1, f"{v:.0f}%\n(n={n:,})", ha="center", fontsize=8, color=C.PALETTE["ink2"])
    ax.set_xticks(x, ab.band.astype(str))
    ax.set_xlabel("Visits per week in the 30 days before expiry")
    ax.set_ylabel("Churn at expiry (%)")
    ax.set_ylim(0, ab.churn_pct.max() * 1.25)
    ax.grid(axis="x", visible=False)
    savefig(fig, "4_2", "churn_by_attendance", "Churn at expiry by attendance band (visits/week in the 30 days before expiry).")

    # ── Kaplan–Meier survival (members who joined in the window) ──
    km = lives[lives.first_start >= WIN0].copy()
    ev = km.churned & (km.end <= WIN1)
    dur = np.where(ev, (km.end - km.first_start).dt.days, (WIN1 - km.first_start).dt.days)
    fig, ax = plt.subplots(figsize=(7, 4))
    km_out = {}
    t_all, s_all = kaplan_meier(dur, ev)
    ax.step(t_all, s_all, where="post", lw=2.2, color=C.PALETTE["ink"], label="all members")
    for L, col in zip([1, 3, 6], [C.PALETTE["primary"], C.PALETTE["secondary"], C.PALETTE["tertiary"]]):
        msk = (km.first_plan_months == L).values
        t, s_ = kaplan_meier(dur[msk], ev.values[msk])
        ax.step(t, s_, where="post", lw=1.6, color=col, label=f"first plan: {C.PLAN_NAME[L].lower()}")
        km_out[C.PLAN_NAME[L]] = {"n": int(msk.sum()), "surv_90d": float(s_[t <= 90][-1]), "surv_180d": float(s_[t <= 180][-1])}
    median = float(t_all[np.argmax(s_all <= 0.5)]) if (s_all <= 0.5).any() else None
    ax.axhline(0.5, color=C.PALETTE["muted"], lw=1, ls=":")
    ax.set_xlabel("Days since join")
    ax.set_ylabel("Share still a member (Kaplan–Meier)")
    ax.set_ylim(0, 1.02)
    ax.set_xlim(0, 300)
    ax.legend(loc="upper right")
    savefig(fig, "4_2", "survival_km", "Kaplan–Meier survival of members who joined in 2026, overall and by first plan length (censored at 31 Oct).")
    kmt = pd.DataFrame({"days": t_all, "survival": s_all})
    savetab(kmt, "4_2", "km_survival_all")

    payload = {
        "definition": "Churned = did not renew within 7 days after subscription_expiry; monthly churn = churned expiries in month / members active on the 1st",
        "monthly": mc.to_dict("records"),
        "avg_monthly_churn_pct": float(mc.monthly_churn_pct.mean()),
        "min_monthly_churn_pct": float(mc.monthly_churn_pct.min()), "max_monthly_churn_pct": float(mc.monthly_churn_pct.max()),
        "renewal_rate_pct": pct((dec.renewed == True).mean()),  # noqa: E712
        "by_plan": bp.to_dict("records"),
        "by_attendance_band": ab.to_dict("records"),
        "km": {"n": int(len(km)), "events": int(ev.sum()), "median_survival_days": median,
               "surv_90d": float(s_all[t_all <= 90][-1]), "surv_180d": float(s_all[t_all <= 180][-1]), "by_first_plan": km_out},
        "cohort_m3_retention_pct": {k: (None if np.isnan(v) else float(v)) for k, v in grid[3].items()},
    }
    assert 12 <= payload["avg_monthly_churn_pct"] <= 18, "acceptance: baseline monthly churn must be 12–18%"
    update_results("churn", payload)
    return payload


if __name__ == "__main__":
    run()
