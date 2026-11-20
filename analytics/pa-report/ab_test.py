"""
ab_test.py — 4.7: simulated A/B test on Remote Config key `checkout_variant`
(control | new_design), 50/50 split on owners who reach checkout_viewed.

NOTE: checkout_variant is a PROPOSED flag (it does not exist in the codebase
today — see RECON.md). Test traffic is an assumption from config.AB.

Design first, then run: the sample size per arm is computed for the stated MDE
(alpha 0.05, power 0.8) from the baseline checkout->paid rate in 4.1, and the
test length is the number of whole weeks needed to reach it.
"""
import math

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy import stats
from statsmodels.stats.power import NormalIndPower
from statsmodels.stats.proportion import proportion_effectsize, proportions_ztest

import config as C
from common import load_results, savefig, savetab, update_results, world_dir, pct, write_csv

AB = C.AB


def sample_size(p0, mde, alpha, power):
    es = proportion_effectsize(p0 + mde, p0)
    return int(math.ceil(NormalIndPower().solve_power(effect_size=abs(es), alpha=alpha, power=power, ratio=1.0, alternative="two-sided")))


def run():
    res = load_results()
    p0 = res["funnel"]["second_drop"]["step_conversion_pct"] / 100.0          # baseline checkout -> paid
    n_per_arm = sample_size(p0, AB["mde_abs"], AB["alpha"], AB["power"])
    test_days = int(math.ceil(2 * n_per_arm / AB["daily_checkout_views"] / 7.0) * 7)
    days_at_current = 2 * n_per_arm / res["funnel"]["checkout_views_per_day"]

    rng = np.random.default_rng([C.SEED, 70])
    daily = rng.poisson(AB["daily_checkout_views"], size=test_days)
    n = int(daily.sum())
    day = np.repeat(np.arange(test_days), daily)
    variant = np.where(rng.random(n) < AB["split"], "control", "new_design")
    u_att, u_fail, u_ref, u_t = rng.random(n), rng.random(n), rng.random(n), rng.random(n)
    attempt = u_att < np.vectorize(AB["attempt_rate"].get)(variant)
    failed = attempt & (u_fail < np.vectorize(AB["payment_fail_rate"].get)(variant))
    paid = attempt & ~failed
    refunded = paid & (u_ref < np.vectorize(AB["refund_rate"].get)(variant))
    t0 = pd.Timestamp(AB["test_start"])
    ts = t0 + pd.to_timedelta(day, unit="D") + pd.to_timedelta(8 + 14 * u_t, unit="h")
    tiers = rng.choice(C.TIERS, size=n, p=C.TIER_SHARE)
    df = pd.DataFrame({"owner_id": [f"own_ab{i + 1:05d}" for i in range(n)], "gym_id": [f"gym_ab{i + 1:05d}" for i in range(n)],
                       "gym_tier": tiers, "checkout_variant": variant, "checkout_viewed_at": ts.strftime("%Y-%m-%dT%H:%M:%S") + C.TZ,
                       "test_day": day + 1, "payment_attempted": attempt, "payment_failed": failed,
                       "subscription_paid": paid, "refunded": refunded})
    write_csv(df, world_dir("ab_test") / "ab_checkout_events.csv")

    g = df.groupby("checkout_variant")
    arms = pd.DataFrame({"n": g.size(), "paid": g.subscription_paid.sum(), "attempts": g.payment_attempted.sum(),
                         "failed": g.payment_failed.sum(), "refunded": g.refunded.sum()})
    arms["conversion"] = arms.paid / arms.n
    arms["payment_fail_rate"] = arms.failed / arms.attempts
    arms["refund_rate"] = arms.refunded / arms.paid
    c, t = arms.loc["control"], arms.loc["new_design"]
    z, p = proportions_ztest([t.paid, c.paid], [t.n, c.n], alternative="two-sided")
    diff = t.conversion - c.conversion
    se = math.sqrt(c.conversion * (1 - c.conversion) / c.n + t.conversion * (1 - t.conversion) / t.n)
    zc = stats.norm.ppf(1 - AB["alpha"] / 2)
    ci = (diff - zc * se, diff + zc * se)
    arm_ci = {v: (r.conversion - zc * math.sqrt(r.conversion * (1 - r.conversion) / r.n), r.conversion + zc * math.sqrt(r.conversion * (1 - r.conversion) / r.n)) for v, r in arms.iterrows()}
    # guardrail: payment-failure rate (two-proportion z-test, should NOT get worse)
    zg, pg = proportions_ztest([t.failed, c.failed], [t.attempts, c.attempts])
    gdiff = t.payment_fail_rate - c.payment_fail_rate
    gse = math.sqrt(c.payment_fail_rate * (1 - c.payment_fail_rate) / c.attempts + t.payment_fail_rate * (1 - t.payment_fail_rate) / t.attempts)
    guard_ci = (gdiff - zc * gse, gdiff + zc * gse)
    guard_ok = guard_ci[1] < 0.03            # pre-registered tolerance: failure rate may not rise by >= 3pp
    # SRM: chi-square goodness of fit vs 50/50
    chi2, p_srm = stats.chisquare([c.n, t.n], [n * AB["split"], n * (1 - AB["split"])])

    out = arms.reset_index().rename(columns={"index": "checkout_variant"})
    out["ci_low"] = out.checkout_variant.map(lambda v: arm_ci[v][0])
    out["ci_high"] = out.checkout_variant.map(lambda v: arm_ci[v][1])
    savetab(out.round(4), "4_7", "ab_arms")

    # ── fig: conversion with 95% CI ──
    fig, ax = plt.subplots(figsize=(5.5, 3.8))
    x = np.arange(2)
    vs = ["control", "new_design"]
    conv = [100 * arms.loc[v].conversion for v in vs]
    err = [[100 * (arms.loc[v].conversion - arm_ci[v][0]) for v in vs], [100 * (arm_ci[v][1] - arms.loc[v].conversion) for v in vs]]
    ax.bar(x, conv, color=[C.VARIANT_COLOR[v] for v in vs], width=0.5, edgecolor="white", linewidth=2)
    ax.errorbar(x, conv, yerr=err, fmt="none", ecolor=C.PALETTE["ink"], capsize=6, lw=1.3)
    for xi, v, cv in zip(x, vs, conv):
        ax.text(xi + 0.27, cv, f"{cv:.1f}%\n(n={int(arms.loc[v].n):,})", va="center", fontsize=8.5, color=C.PALETTE["ink2"])
    ax.set_xticks(x, vs)
    ax.set_ylabel("Checkout → paid conversion (%, 95% CI)")
    ax.set_ylim(0, max(conv) * 1.3)
    ax.set_xlim(-0.5, 1.9)
    ax.grid(axis="x", visible=False)
    savefig(fig, "4_7", "ab_conversion_ci", "A/B test on checkout_variant: checkout → paid conversion per arm with 95% confidence intervals.")

    # ── fig: cumulative conversion over test days ──
    fig, ax = plt.subplots(figsize=(7, 3.8))
    cum_rows = []
    for v in vs:
        d = df[df.checkout_variant == v].groupby("test_day").agg(n=("subscription_paid", "size"), paid=("subscription_paid", "sum")).reindex(range(1, test_days + 1), fill_value=0).cumsum()
        cr = d.paid / d.n
        se_ = np.sqrt(cr * (1 - cr) / d.n)
        ax.plot(d.index, 100 * cr, lw=2, color=C.VARIANT_COLOR[v], label=v)
        ax.fill_between(d.index, 100 * (cr - zc * se_), 100 * (cr + zc * se_), color=C.VARIANT_COLOR[v], alpha=0.12, lw=0)
        cum_rows.append(pd.DataFrame({"test_day": d.index, "variant": v, "cum_n": d.n.values, "cum_paid": d.paid.values, "cum_conversion": cr.values}))
    savetab(pd.concat(cum_rows).round(4), "4_7", "ab_cumulative")
    ax.set_xlabel("Test day")
    ax.set_ylabel("Cumulative conversion (%)")
    ax.set_ylim(0, 100)
    ax.legend(loc="upper right")
    savefig(fig, "4_7", "ab_cumulative", "Cumulative checkout → paid conversion by test day per arm (shaded: 95% CI); early peeks are noisy, the gap stabilises late.")

    sig = p < AB["alpha"]
    payload = {
        "flag": AB["flag"], "variants": AB["variants"], "flag_status": "proposed (not present in codebase; see RECON.md)",
        "population": "owners reaching checkout_viewed, 50/50 random assignment",
        "design": {"baseline_conversion": p0, "mde_abs": AB["mde_abs"], "alpha": AB["alpha"], "power": AB["power"],
                   "n_per_arm_required": n_per_arm, "assumed_daily_checkout_views": AB["daily_checkout_views"],
                   "test_days": test_days, "days_needed_at_current_baseline_traffic": float(days_at_current)},
        "arms": {v: {"n": int(r.n), "paid": int(r.paid), "conversion": float(r.conversion), "ci_low": arm_ci[v][0], "ci_high": arm_ci[v][1],
                     "payment_fail_rate": float(r.payment_fail_rate), "refund_rate": float(r.refund_rate)} for v, r in arms.iterrows()},
        "lift_abs": float(diff), "lift_rel_pct": float(100 * diff / c.conversion),
        "z": float(z), "p_value": float(p), "ci95_diff": list(ci), "significant": bool(sig),
        "guardrail": {"metric": "payment-failure rate (failed / attempted Razorpay payments)", "control": float(c.payment_fail_rate),
                      "new_design": float(t.payment_fail_rate), "diff": float(gdiff), "ci95_diff": list(guard_ci), "p_value": float(pg),
                      "tolerance_abs": 0.03, "passed": bool(guard_ok)},
        "srm": {"control_n": int(c.n), "new_design_n": int(t.n), "chi2": float(chi2), "p_value": float(p_srm), "srm_detected": bool(p_srm < 0.01)},
        "decision": ("Ship new_design" if sig and diff > 0 and guard_ok and p_srm >= 0.01 else
                     ("Do not ship: SRM detected — fix assignment and rerun" if p_srm < 0.01 else
                      ("Inconclusive: lift not significant at alpha=0.05 — keep control, extend the test or re-power for a smaller MDE" if not sig else
                       "Do not ship yet: conversion improved but the payment-failure guardrail is not cleared"))),
    }
    update_results("ab_test", payload)
    return payload


if __name__ == "__main__":
    run()
