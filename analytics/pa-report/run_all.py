"""
run_all.py — regenerate everything from scratch:
synthetic worlds -> analyses -> results.json -> RESULTS.md -> pa_report_outputs.zip

    python run_all.py
"""
import shutil
import sys
import time
import zipfile

import config as C
import common
from common import load_results, save_results

STEPS = []


def step(name):
    def deco(fn):
        STEPS.append((name, fn))
        return fn
    return deco


@step("generate_baseline (4.3)")
def _gb():
    from generate_baseline import build_world
    build_world(strategy=False)


@step("generate_strategy (4.6)")
def _gs():
    from generate_baseline import build_world
    build_world(strategy=True)


@step("funnel (4.1)")
def _f():
    import funnel
    funnel.run()


@step("nsm (Ch.3)")
def _n():
    import nsm
    nsm.run()


@step("churn (4.2)")
def _c():
    import churn
    churn.run()


@step("diagnose (4.4)")
def _d():
    import diagnose
    diagnose.run()


@step("strategy_eval (4.6)")
def _s():
    import strategy_eval
    strategy_eval.run()


@step("ab_test (4.7)")
def _a():
    import ab_test
    ab_test.run()


@step("model (4.8 + 4.9)")
def _m():
    import model
    model.run()


@step("export_import (4.3)")
def _e():
    import export_import
    export_import.run()


def assumptions():
    keys = ["SEED", "WINDOW_START", "WINDOW_END", "BURN_IN_START", "CHURN_GRACE_DAYS", "CITY", "N_ESTABLISHED_GYMS", "TIER_SHARE",
            "GYM_SIZE_MIN", "GYM_SIZE_MAX", "NEW_GYM_SIZE_MULT", "PLAN_MIX", "PLAN_PRICE_MULT", "MONTHLY_PRICE_RANGE", "JOIN_RATE_PER_MONTH",
            "JOIN_SEASON", "ROSTER_ENTRY_DAYS_BASELINE", "VISITS_PER_WEEK_MEAN", "WEEKDAY_FACTOR", "MONTH_FACTOR", "DECAY_DAYS_RANGE",
            "DECAY_FLOOR", "B0", "B_ENG", "B_PLAN", "B_TENURE", "B_TIER", "B_JAN", "N_LANDING", "FUNNEL_CONV", "FUNNEL_TIER_MULT",
            "SAAS_PLAN_PRICE", "STRATEGY", "AB", "MODEL"]
    out = {k: getattr(C, k) for k in keys}
    out["data_note"] = ("All data is synthetic, generated with SEED=42 to mirror the real Gymloop Firestore schema (RECON.md). "
                        "No production data or PII was read. checkout_variant is a proposed Remote Config flag.")
    return out


def fmt_inr(x):
    x = float(x)
    if x >= 1e7:
        return f"₹{x / 1e7:.2f} cr"
    if x >= 1e5:
        return f"₹{x / 1e5:.1f} lakh"
    return f"₹{x:,.0f}"


def write_results_md(runtime_s):
    r = load_results()
    f, n, ch, iss, st, ab, m, pr = (r[k] for k in ("funnel", "nsm", "churn", "issues", "strategy", "ab_test", "model", "predictions"))
    bm = m["best_model"]
    tm = m["test"][bm]
    lk = m["leakage_checks"]
    L = []
    L.append("# RESULTS — Gymloop Product Analytics (23OE0022)\n")
    L.append("> All numbers come from `results.json` (synthetic data, SEED = 42, window 2026-01-01 → 2026-10-31). "
             "No production data or PII was used.\n")
    L.append("## Summary\n")
    L.append(f"- **North Star (WAM, ≥2 check-ins/week):** baseline {n['baseline']['wam_first_week']:,} → {n['baseline']['wam_last_week']:,} "
             f"members/week; strategy world averages **{n['wam_lift_last8_pct']:+.1f}%** WAM over the last 8 weeks "
             f"({n['baseline']['wam_avg_last8']:,.0f} → {n['strategy']['wam_avg_last8']:,.0f}).")
    L.append(f"- **Funnel (4.1):** {f['landing_visits']:,} landing visits → {f['paid']} paid subscriptions ({f['overall_conversion_pct']:.2f}% overall). "
             f"Largest drop: `{f['largest_drop']['from']} → {f['largest_drop']['to']}` ({f['largest_drop']['drop_off_pct']:.1f}% lost); "
             f"second: `{f['second_drop']['from']} → {f['second_drop']['to']}` ({f['second_drop']['drop_off_pct']:.1f}%).")
    L.append(f"- **Churn (4.2):** baseline monthly churn averages **{ch['avg_monthly_churn_pct']:.1f}%** "
             f"(range {ch['min_monthly_churn_pct']:.1f}–{ch['max_monthly_churn_pct']:.1f}%); members visiting <1×/week in the last 30 days churn "
             f"{ch['by_attendance_band'][0]['churn_pct']:.0f}% vs {ch['by_attendance_band'][-1]['churn_pct']:.0f}% for 4+×/week. "
             f"Median member survival {ch['km']['median_survival_days']:.0f} days.")
    L.append("- **Issues (4.4):**")
    for i in iss:
        L.append(f"  - ({i['id']}) **{i['title']}** — {i['evidence']} *Fix:* {i['fix']}")
    sb, ss = st["baseline"], st["strategy"]
    L.append(f"- **Strategy (4.6):** plan→member conversion {sb['member_add_conversion_pct']:.1f}% → {ss['member_add_conversion_pct']:.1f}%, "
             f"monthly churn {sb['avg_monthly_churn_pct']:.1f}% → {ss['avg_monthly_churn_pct']:.1f}%, renewal rate {sb['renewal_rate_pct']:.1f}% → "
             f"{ss['renewal_rate_pct']:.1f}%; {ss['saved_by_reminder']:,} renewals saved by reminders and {ss['saved_by_alert']:,} by at-risk alerts; "
             f"member-fee revenue {fmt_inr(sb['member_fee_revenue_inr'])} → {fmt_inr(ss['member_fee_revenue_inr'])}.")
    a_c, a_t = ab["arms"]["control"], ab["arms"]["new_design"]
    L.append(f"- **A/B test (4.7, `{ab['flag']}`):** n = {a_c['n']:,} / {a_t['n']:,}; conversion {100 * a_c['conversion']:.1f}% vs "
             f"{100 * a_t['conversion']:.1f}% (lift {100 * ab['lift_abs']:+.1f} pp, {ab['lift_rel_pct']:+.1f}% rel.), p = {ab['p_value']:.3f}, "
             f"95% CI [{100 * ab['ci95_diff'][0]:+.1f}, {100 * ab['ci95_diff'][1]:+.1f}] pp. Pre-test sample size {ab['design']['n_per_arm_required']:,}/arm "
             f"(MDE {100 * ab['design']['mde_abs']:.0f} pp, α 0.05, power 0.8) → {ab['design']['test_days']} days at the assumed "
             f"{ab['design']['assumed_daily_checkout_views']}/day (≈{ab['design']['days_needed_at_current_baseline_traffic'] / 365:.0f} years at today's baseline traffic). "
             f"SRM p = {ab['srm']['p_value']:.2f}; guardrail (payment failures) {100 * ab['guardrail']['control']:.1f}% vs {100 * ab['guardrail']['new_design']:.1f}% "
             f"({'cleared' if ab['guardrail']['passed'] else 'not cleared: 95% CI upper bound ' + format(100 * ab['guardrail']['ci95_diff'][1], '+.1f') + ' pp exceeds the +3 pp tolerance'}). "
             f"**Decision:** {ab['decision']}.")
    L.append(f"- **Churn model (4.8):** selected **{bm}** — {m['justification']} At the validation-chosen threshold {tm['threshold']:.2f}: "
             f"precision {tm['precision']:.2f}, recall {tm['recall']:.2f}, F1 {tm['f1']:.2f}.")
    bands = "; ".join(f"{b['band']}: {b['members']:,} members, {b['actual_churn_pct']:.0f}% churned" for b in pr["bands"])
    L.append(f"- **Predictions (4.9):** {bands}. Acting on High/Medium saves ≈{pr['total_members_saved']:.0f} members ≈ "
             f"{fmt_inr(pr['total_revenue_saved_inr'])} over the test months (≈{fmt_inr(pr['annualised_revenue_saved_inr'])}/year).\n")

    L.append("## Leakage check (churn model)\n")
    L.append(f"- Prediction point: **{lk['cutoff']}**; every attendance feature uses only `attendance_logs` rows with `date < cutoff` "
             f"(asserted in `model.py`).")
    L.append(f"- Label = {lk['label_source']}.")
    L.append(f"- Excluded post-cutoff fields: {', '.join('`' + x + '`' for x in lk['excluded_post_cutoff_fields'])}.")
    L.append(f"- Time-based split: train expiry < {lk['time_split']['train_expiry_lt']}, validation {lk['time_split']['val'][0]} → "
             f"{lk['time_split']['val'][1]}, test expiry ≥ {lk['time_split']['test_expiry_gte']} (no random split). "
             f"Model selection and the threshold use validation only; test is touched once.")
    L.append(f"- Sanity check: the strongest single feature reaches AUC {lk['max_single_feature_auc']:.3f} (< 0.95), so `churned` is not derivable from any one feature.\n")

    L.append("## Figures\n")
    L.append("| File | What it shows |")
    L.append("|---|---|")
    for fn, desc in common.FIGURES:
        L.append(f"| `figures/{fn}` | {desc} |")
    L.append("")
    L.append(f"_Generated by `python run_all.py` in {runtime_s:.0f} s._\n")
    (C.ROOT / "RESULTS.md").write_text("\n".join(L))


def make_zip():
    out = C.ROOT / "pa_report_outputs.zip"
    files = sorted(C.FIG.glob("*.png")) + sorted(C.TAB.glob("*.csv")) + [C.RESULTS_JSON, C.ROOT / "RESULTS.md", C.ROOT / "RECON.md"]
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for p in files:
            info = zipfile.ZipInfo(str(p.relative_to(C.ROOT)), date_time=(2026, 11, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, p.read_bytes())
    return out, len(files)


def main():
    t0 = time.time()
    for d in (C.FIG, C.TAB):
        shutil.rmtree(d, ignore_errors=True)
        d.mkdir(parents=True)
    C.RESULTS_JSON.unlink(missing_ok=True)
    for name, fn in STEPS:
        t = time.time()
        fn()
        print(f"  ✓ {name:<28} {time.time() - t:5.1f}s", flush=True)
    res = load_results()
    res["assumptions"] = assumptions()
    save_results(res)
    runtime = time.time() - t0
    write_results_md(runtime)
    z, nfiles = make_zip()
    print(f"done in {runtime:.0f}s — {len(common.FIGURES)} figures, results.json, RESULTS.md, {z.name} ({nfiles} files)")


if __name__ == "__main__":
    sys.exit(main())
