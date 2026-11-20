# Gymloop — Product Analytics report pipeline (23OE0022)

A self-contained, reproducible pipeline that generates **synthetic** Gymloop data
(mirroring the real Firestore schema in `RECON.md`) and produces every chart,
table and number used in the report. It reads no production data, contains no
PII, makes no network or API calls, and changes nothing outside this folder.

## Run

```bash
cd analytics/pa-report
pip install pandas numpy scipy statsmodels scikit-learn xgboost matplotlib
python run_all.py
```

Runtime: about 60 s on 4 cores. Everything is
deterministic (`SEED = 42`): two runs produce a byte-identical `results.json`.

Tested with Python 3.13, pandas 3.0, numpy 2.5, scipy 1.18, statsmodels 0.15,
scikit-learn 1.9, xgboost 3.4 and matplotlib 3.11.

## What `run_all.py` does

| Step | Script | Section | Output |
|---|---|---|---|
| 1 | `generate_baseline.py` | 4.3 | `data/baseline/*` (pre-strategy world) |
| 2 | `generate_strategy.py` | 4.6 | `data/strategy/*` (same seeds, interventions on) |
| 3 | `funnel.py` | 4.1 | owner funnel: counts, step and overall conversion, median time between steps, tier split |
| 4 | `nsm.py` | Ch.3 | Weekly Active Members (≥2 check-ins/week) and the input-metric tree |
| 5 | `churn.py` | 4.2 | monthly churn, cohort heatmap, churn by plan and attendance band, Kaplan–Meier |
| 6 | `diagnose.py` | 4.4 | exactly 3 issues, each with metric, evidence, chart and fix → `results.json → issues[]` |
| 7 | `strategy_eval.py` | 4.6 | baseline vs strategy KPIs |
| 8 | `ab_test.py` | 4.7 | `checkout_variant` test: sample size, z-test, CI, SRM, guardrail |
| 9 | `model.py` | 4.8 + 4.9 | LR / RF / XGBoost churn model at expiry − 14 d, time-based split, risk buckets, ₹ impact |
| 10 | `export_import.py` | 4.3 | `data/mixpanel_events.json`, `data/posthog_events.csv` (manual import, no API calls) |

It then writes `results.json`, `RESULTS.md` and `pa_report_outputs.zip`. The zip
contains `figures/`, `tables/`, `results.json`, `RESULTS.md` and `RECON.md`.

All assumptions (sizes, prices, conversion rates, effect sizes, A/B traffic) live in
`config.py` and are copied to `results.json → assumptions`.

## Data files (`data/`, regenerated; `baseline/` and `strategy/` are git-ignored)

| File | Shaped like |
|---|---|
| `gyms.csv` | `gyms` + `subscriptions` (tier, Bengaluru locality, `settings.plans`, SaaS plan) |
| `funnel_events.csv` | owner journey events, with the matching existing GA4 event name |
| `members.csv` | `users` (role = member): `start_date`, `plan_id`, `subscription_expiry`, … |
| `memberships.csv` | `payments`: one row per membership period, with renewal outcome |
| `attendance_logs.csv.gz` | `attendance_logs`: `date`, `entry_time`, `scan_mode` (phone/kiosk) → `attendance_source` (qr/kiosk) |
| `ab_test/ab_checkout_events.csv` | simulated `checkout_variant` test population |

## Caveats to state in the report

- All data is synthetic. Effect sizes are assumptions set in `config.py`.
- `checkout_variant` is a **proposed** Remote Config flag. Nothing in the codebase
  uses Remote Config today (see `RECON.md`).
- A/B test traffic (32 checkout views/day) is assumed. At today's synthetic
  baseline traffic, the test would take decades (see `results.json → ab_test.design`).

## Importing into Mixpanel / PostHog (manual)

- **Mixpanel:** Project settings → Import data, or the `/import` endpoint from
  your own machine. Upload `data/mixpanel_events.json` (a JSON array, `time` in
  Unix seconds, `$insert_id` for de-duplication). Events are dated 2026, so allow
  historical import in the project.
- **PostHog:** Data pipeline → Sources → CSV/file import, or the batch API.
  Upload `data/posthog_events.csv`; `properties` is a JSON string column.
- Suggested screenshots: a funnel of the 10 owner steps, and a funnel
  `checkout_viewed → subscription_paid` broken down by `checkout_variant`.
