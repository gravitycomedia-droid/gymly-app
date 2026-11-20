# RESULTS — Gymloop Product Analytics (23OE0022)

> All numbers come from `results.json` (synthetic data, SEED = 42, window 2026-01-01 → 2026-10-31). No production data or PII was used.

## Summary

- **North Star (WAM, ≥2 check-ins/week):** baseline 4,598 → 6,984 members/week; strategy world averages **+28.8%** WAM over the last 8 weeks (6,622 → 8,528).
- **Funnel (4.1):** 3,000 landing visits → 21 paid subscriptions (0.70% overall). Largest drop: `first_plan_created → first_member_added` (69.2% lost); second: `checkout_viewed → subscription_paid` (52.3%).
- **Churn (4.2):** baseline monthly churn averages **14.3%** (range 12.9–15.6%); members visiting <1×/week in the last 30 days churn 84% vs 5% for 4+×/week. Median member survival 91 days.
- **Issues (4.4):**
  - (a) **Owners stall at adding their first member** — 69.2% of owners who created a plan never added a member (conversion 30.9%), the largest drop in the funnel; median 36 h between the two steps for those who did, and new gyms took a median 100 days to enter their existing roster one member at a time. *Fix:* Bulk CSV/Excel member import (map name/phone/plan/expiry columns) plus an onboarding checklist that makes 'import your members' the next step after the first plan.
  - (b) **Silent churn — attendance decays before expiry and nobody is notified** — 52% of churners (vs 5% of renewers) showed a >50% attendance decay in the 2 weeks before expiry, and 48% had a 10+ day gap with no check-in in their last 4 weeks — yet 0 renewal reminders or at-risk alerts were sent in the baseline. *Fix:* Automated WhatsApp renewal reminders at expiry −7d / −1d / +3d, and an at-risk alert to the owner when a member has 10+ days with no check-in.
  - (c) **Checkout abandonment on the Gymloop subscription** — 52.3% of owners who opened checkout did not pay (conversion 47.7%), the second-largest funnel drop; abandonment is highest in the low tier (64%). *Fix:* Redesigned checkout (checkout_variant = new_design): one-screen plan summary with UPI-first Razorpay, monthly price and trial terms up front, fewer fields — validated by the 4.7 A/B test.
- **Strategy (4.6):** plan→member conversion 30.9% → 40.0%, monthly churn 14.3% → 11.9%, renewal rate 61.5% → 68.8%; 2,984 renewals saved by reminders and 1,110 by at-risk alerts; member-fee revenue ₹14.85 cr → ₹18.60 cr.
- **A/B test (4.7, `checkout_variant`):** n = 641 / 662; conversion 50.7% vs 54.7% (lift +4.0 pp, +7.9% rel.), p = 0.150, 95% CI [-1.4, +9.4] pp. Pre-test sample size 612/arm (MDE 8 pp, α 0.05, power 0.8) → 42 days at the assumed 32/day (≈23 years at today's baseline traffic). SRM p = 0.56; guardrail (payment failures) 5.8% vs 8.1% (not cleared: 95% CI upper bound +6.0 pp exceeds the +3 pp tolerance). **Decision:** Inconclusive: lift not significant at alpha=0.05 — keep control, extend the test or re-power for a smaller MDE.
- **Churn model (4.8):** selected **LogisticRegression** — RandomForest has the highest validation PR-AUC (0.680) but LogisticRegression is within the 0.005 tie margin (0.678), so the simpler, more explainable model is preferred for owner-facing risk scores. Test ROC-AUC 0.791, PR-AUC 0.661. At the validation-chosen threshold 0.43: precision 0.61, recall 0.72, F1 0.66.
- **Predictions (4.9):** High: 2,985 members, 65% churned; Medium: 2,840 members, 32% churned; Low: 2,456 members, 10% churned. Acting on High/Medium saves ≈622 members ≈ ₹27.0 lakh over the test months (≈₹1.16 cr/year).

## Leakage check (churn model)

- Prediction point: **membership_end - 14 days**; every attendance feature uses only `attendance_logs` rows with `date < cutoff` (asserted in `model.py`).
- Label = renewal within 7 days after expiry (memberships.renewed) — not an input feature.
- Excluded post-cutoff fields: `renewed`, `renewal_date`, `renewal_gap_days`, `churned`, `status`, `last_seen`, `attendance_count`, `members.renewal_count`, `reminders_sent`, `at_risk_alerted`.
- Time-based split: train expiry < 2026-06-15, validation 2026-06-15 → 2026-08-01, test expiry ≥ 2026-08-01 (no random split). Model selection and the threshold use validation only; test is touched once.
- Sanity check: the strongest single feature reaches AUC 0.759 (< 0.95), so `churned` is not derivable from any one feature.

## Figures

| File | What it shows |
|---|---|
| `figures/fig_4_1_funnel.png` | Owner activation funnel (baseline): owners reaching each step with step conversion; the largest drop (first plan → first member) is highlighted. |
| `figures/fig_4_1_funnel_by_tier.png` | Funnel split by gym tier: share of each tier's landing visits that reach every step (log scale). |
| `figures/fig_3_wam_trend.png` | North Star Metric: Weekly Active Members per week, baseline vs strategy world (Jan–Oct 2026). |
| `figures/fig_4_2_monthly_churn.png` | Baseline monthly churn rate (members not renewing within 7 days of expiry / active members at month start). |
| `figures/fig_4_2_cohort_retention.png` | Cohort retention heatmap: % of each 2026 join-month cohort still a member after k months (blank = not yet observable). |
| `figures/fig_4_2_churn_by_plan.png` | Churn by plan length: share of expiring memberships not renewed, and the equivalent monthly churn rate. |
| `figures/fig_4_2_churn_by_attendance.png` | Churn at expiry by attendance band (visits/week in the 30 days before expiry). |
| `figures/fig_4_2_survival_km.png` | Kaplan–Meier survival of members who joined in 2026, overall and by first plan length (censored at 31 Oct). |
| `figures/fig_4_4_issue_a_member_add_dropoff.png` | Issue (a): drop-off at every funnel step; first plan → first member (red) is the largest, checkout → paid (orange) second. |
| `figures/fig_4_4_issue_b_silent_churn.png` | Issue (b): weekly check-ins in the 6 weeks before expiry — churners' attendance decays for 2–4 weeks while renewers stay flat. |
| `figures/fig_4_4_issue_c_checkout_abandonment.png` | Issue (c): share of owners who viewed checkout but did not pay, by gym tier (abandoned / viewed). |
| `figures/fig_4_6_churn_baseline_vs_strategy.png` | Monthly churn, baseline vs strategy world (reminders + at-risk alerts + bulk import switched on from Jan 2026). |
| `figures/fig_4_6_strategy_kpi_deltas.png` | Relative change in key metrics, strategy world vs baseline. |
| `figures/fig_4_7_ab_conversion_ci.png` | A/B test on checkout_variant: checkout → paid conversion per arm with 95% confidence intervals. |
| `figures/fig_4_7_ab_cumulative.png` | Cumulative checkout → paid conversion by test day per arm (shaded: 95% CI); early peeks are noisy, the gap stabilises late. |
| `figures/fig_4_8_roc_curves.png` | ROC curves on the held-out test months (expiries Aug–Oct 2026) for the three models. |
| `figures/fig_4_8_pr_curves.png` | Precision–recall curves on the test months; dotted line = churn base rate. |
| `figures/fig_4_8_confusion_matrix.png` | Confusion matrix of the selected model (LogisticRegression) on the test months at threshold 0.43 (chosen on validation). |
| `figures/fig_4_8_feature_importance.png` | Permutation feature importance of the selected model (LogisticRegression) on the test months. |
| `figures/fig_4_9_risk_buckets.png` | Test-set members bucketed by predicted churn risk (LogisticRegression): actual churn rate and size per bucket. |

_Generated by `python run_all.py` in 61 s._
