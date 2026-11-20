"""
config.py — every tunable assumption for the Gymloop PA report pipeline.

All synthetic-data parameters live here so the report can cite them in one
place (they are also copied into results.json -> assumptions). Nothing in this
folder reads production data; field names mirror the real Firestore schema
documented in RECON.md.
"""
from datetime import date
from pathlib import Path

# ── Reproducibility ──────────────────────────────────────────────────────────
SEED = 42

# ── Paths ────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
FIG = ROOT / "figures"
TAB = ROOT / "tables"
RESULTS_JSON = ROOT / "results.json"

# ── Time window ──────────────────────────────────────────────────────────────
WINDOW_START = date(2026, 1, 1)
WINDOW_END = date(2026, 10, 31)           # inclusive; attendance is only written for this window
BURN_IN_START = date(2025, 1, 1)          # established gyms are simulated from here so Jan-2026 has a realistic stock
SIM_END = date(2026, 11, 7)               # renewal decisions are simulated to WINDOW_END + 7d (churn grace)
CHURN_GRACE_DAYS = 7                      # churned = did not renew within 7 days after expiry
TZ = "+05:30"                             # IST

# ── Gyms (tenants) ───────────────────────────────────────────────────────────
CITY = "Bengaluru"                        # one of the Signup.jsx CITIES values
LOCALITIES = [
    "Koramangala", "Indiranagar", "HSR Layout", "Whitefield", "Jayanagar", "JP Nagar",
    "BTM Layout", "Marathahalli", "Electronic City", "Malleshwaram", "Rajajinagar",
    "Hebbal", "Yelahanka", "Banashankari", "Bellandur", "Sarjapur Road",
]
N_ESTABLISHED_GYMS = 36                   # tenants live before 2026; the rest come from the 2026 owner funnel
TIERS = ["low", "mid", "premium"]
TIER_SHARE = [0.45, 0.40, 0.15]
GYM_SIZE_MIN, GYM_SIZE_MAX = 40, 400      # target active-member stock per gym
GYM_SIZE_LOGNORM = (4.85, 0.55)           # (mu, sigma) of log(size) before clipping -> median ~128
NEW_GYM_SIZE_MULT = 0.45                  # gyms onboarding via the 2026 funnel are smaller / earlier-stage (still clipped to >= 40)
KIOSK_PROB_BY_TIER = {"low": 0.20, "mid": 0.45, "premium": 0.80}   # gym has a paired kiosk_devices tablet
KIOSK_SHARE_IF_KIOSK = 0.75               # share of check-ins via kiosk in a kiosk gym (rest = member QR, scan_mode 'phone')

# Gymloop SaaS plans (subscriptions.plan) — prices from Subscription.jsx / functions/index.js
SAAS_PLAN_PRICE = {"FREE": 0, "BASIC": 199, "PROFESSIONAL": 499, "PROFESSIONAL_PLUS": 799, "PREMIUM": 999}
SAAS_PLAN_BY_TIER = {                     # plan picked at checkout, by gym tier
    "low": {"BASIC": 0.45, "PROFESSIONAL": 0.40, "PREMIUM": 0.15},
    "mid": {"BASIC": 0.15, "PROFESSIONAL": 0.45, "PROFESSIONAL_PLUS": 0.20, "PREMIUM": 0.20},
    "premium": {"PROFESSIONAL": 0.15, "PROFESSIONAL_PLUS": 0.30, "PREMIUM": 0.55},
}

# ── Member plans (embedded in gyms.settings.plans) ──────────────────────────
PLAN_MONTHS = [1, 3, 6, 12]
PLAN_DURATION_DAYS = {1: 30, 3: 90, 6: 180, 12: 365}
PLAN_NAME = {1: "Monthly", 3: "Quarterly", 6: "Half-yearly", 12: "Annual"}
PLAN_PRICE_MULT = {1: 1.0, 3: 2.7, 6: 5.0, 12: 9.0}            # multiple of the monthly price
PLAN_MIX = [0.48, 0.30, 0.14, 0.08]                             # plan length at join
MONTHLY_PRICE_RANGE = {"low": (700, 1200), "mid": (1300, 2200), "premium": (2800, 4500)}   # ₹ per month
PLAN_SWITCH_PROB = 0.20                                         # on renewal, chance of picking a different plan

# ── Member arrivals ──────────────────────────────────────────────────────────
JOIN_RATE_PER_MONTH = 0.15                # new joins per month as a share of target size (replaces churn)
JOIN_SEASON = {1: 2.4, 2: 1.3, 3: 1.1, 4: 0.95, 5: 0.9, 6: 0.85, 7: 0.85, 8: 0.85, 9: 1.0, 10: 1.0, 11: 0.8, 12: 0.7}
NEW_GYM_ROSTER_SHARE = 0.60               # a new gym's existing roster (share of target size) that must be entered into the app
ROSTER_ENTRY_DAYS_BASELINE = 120          # manual one-by-one entry spreads the roster over ~4 months
ROSTER_ENTRY_DAYS_BULK = 14               # with bulk CSV import the roster is in within 2 weeks

# ── Attendance (attendance_logs) ─────────────────────────────────────────────
VISITS_PER_WEEK_MEAN = {"low": 2.6, "mid": 3.0, "premium": 3.4}   # latent engagement, Gamma(shape=3)
VISITS_GAMMA_SHAPE = 3.0
VISITS_PER_WEEK_CAP = 6.5
WEEKDAY_FACTOR = [1.20, 1.10, 1.05, 1.00, 0.90, 0.85, 0.50]      # Mon..Sun
MONTH_FACTOR = {1: 1.32, 2: 1.12, 3: 1.02, 4: 0.98, 5: 0.95, 6: 0.92, 7: 0.90, 8: 0.95, 9: 1.0, 10: 0.97, 11: 0.95, 12: 0.9}
HONEYMOON_DAYS, HONEYMOON_FACTOR = 21, 1.20                       # new members over-attend in their first 3 weeks
SLOT_SHARE = {"morning": 0.55, "evening": 0.38, "midday": 0.07}
SLOT_HOUR = {"morning": (6.8, 1.0, 5.0, 10.0), "evening": (18.8, 1.1, 16.5, 22.0), "midday": (13.0, 1.2, 11.0, 15.5)}
DECAY_DAYS_RANGE = (14, 28)               # non-renewers' attendance decays over the last 2–4 weeks before expiry
DECAY_FLOOR = 0.15                        # visit rate falls to 15% of normal by the expiry date

# ── Renewal model (baseline) ─────────────────────────────────────────────────
# logit(p_renew) = B0 + B_ENG*(visits_per_week-3) + B_PLAN[months] + B_TENURE*min(prev_renewals,3)
#                  + B_TIER[tier] + B_JAN (if joined in January) + N(0, RENEW_NOISE)
B0 = 0.10
B_ENG = 0.65
B_PLAN = {1: 0.0, 3: -0.15, 6: -0.30, 12: -0.40}
B_TENURE = 0.25
B_TIER = {"low": -0.15, "mid": 0.0, "premium": 0.20}
B_JAN = -0.45                             # New-Year-resolution joiners renew less
RENEW_NOISE = 0.6
RENEW_GAP_SAME_DAY = 0.6                  # renewers: 60% renew on/before expiry, rest within 1..7 days

# ── Owner funnel (funnel_events) ─────────────────────────────────────────────
N_LANDING = 3000
FUNNEL_STEPS = [
    "landing_visit", "signup_started", "signup_completed", "gym_profile_completed",
    "first_plan_created", "first_member_added", "first_checkin_recorded",
    "trial_started", "checkout_viewed", "subscription_paid",
]
# Existing GA4 event each synthetic step corresponds to (see RECON.md)
GA4_EVENT_MAP = {
    "landing_visit": "page_view", "signup_started": "page_view (/owner/register)",
    "signup_completed": "sign_up", "gym_profile_completed": "(none — Onboarding step 1)",
    "first_plan_created": "(none — Onboarding step 2)", "first_member_added": "member_added (is_first_member=true)",
    "first_checkin_recorded": "scan_processed (server)", "trial_started": "trial_start (server)",
    "checkout_viewed": "checkout_started", "subscription_paid": "purchase (server, Razorpay webhook)",
}
# P(step i | step i-1) for i = 1..9 (base, before tier multipliers)
FUNNEL_CONV = [0.58, 0.62, 0.70, 0.62, 0.30, 0.62, 0.70, 0.78, 0.45]
FUNNEL_TIER_MULT = {                       # multipliers on two steps that depend on gym size/staffing and budget
    "first_member_added": {"low": 0.85, "mid": 1.00, "premium": 1.35},
    "subscription_paid": {"low": 0.85, "mid": 1.05, "premium": 1.25},
}
# median hours between step i-1 and step i (lognormal, sigma below)
FUNNEL_GAP_MEDIAN_H = [0.07, 0.10, 0.5, 2.0, 36.0, 48.0, 120.0, 288.0, 0.2]
FUNNEL_GAP_SIGMA = 1.0
LANDING_GROWTH = 0.6                       # landing traffic grows 60% from Jan to Oct

# ── Strategy world (4.6) — modest, stated effect sizes ──────────────────────
STRATEGY = {
    "bulk_import": {
        "member_add_conv_rel_lift": 0.30,      # first_plan_created -> first_member_added: 0.30 -> 0.39
        "member_add_gap_median_h": 14.0,       # was 36h
        "roster_entry_days": ROSTER_ENTRY_DAYS_BULK,
    },
    "renewal_reminders": {
        "offsets_days": [-7, -1, 3],           # WhatsApp at expiry-7d, -1d, +3d
        "would_be_churner_save_rate": 0.18,    # share of would-be churners who renew because of the reminders
    },
    "at_risk_alert": {
        "no_checkin_days": 10,                 # owner alerted after 10+ days with no check-in
        "return_rate": 0.30,                   # share of alerted members who come back after the owner reaches out
        "returned_churner_renew_rate": 0.35,   # of returned would-be churners, share who then renew
    },
}

# ── A/B test (4.7) — Remote Config key checkout_variant (PROPOSED flag, see RECON.md) ──
AB = {
    "flag": "checkout_variant",
    "variants": ["control", "new_design"],
    "split": 0.5,
    "test_days": 28,
    "test_start": date(2026, 11, 2),
    "daily_checkout_views": 32,               # assumed test traffic (pooled paid-acquisition + strategy funnel); stated in report
    "attempt_rate": {"control": 0.60, "new_design": 0.68},   # P(click pay | checkout_viewed)
    "payment_fail_rate": {"control": 0.08, "new_design": 0.085},
    "alpha": 0.05,
    "power": 0.80,
    "mde_abs": 0.10,                          # minimum detectable effect, absolute pp on checkout -> paid
    "refund_rate": {"control": 0.02, "new_design": 0.02},
}

# ── Churn model (4.8) ────────────────────────────────────────────────────────
MODEL = {
    "cutoff_days_before_expiry": 14,
    "min_expiry": date(2026, 2, 15),          # needs 30 days of in-window attendance before the cutoff
    "max_expiry": date(2026, 10, 24),         # label (renewal within 7d) observable by WINDOW_END
    "val_start": date(2026, 6, 15),           # train < val_start <= validation < test_start
    "test_start": date(2026, 8, 1),
    "risk_bands": {"High": 0.50, "Medium": 0.20},   # p >= 0.50 High, 0.20-0.50 Medium, else Low
    "save_rate_by_band": {"High": 0.25, "Medium": 0.15, "Low": 0.0},   # assumed share of actual churners an action saves
}

# ── Plot style ───────────────────────────────────────────────────────────────
PALETTE = {
    "primary": "#2F5D8A", "secondary": "#E07B39", "tertiary": "#4C9F70",
    "neutral": "#8A8F98", "danger": "#C0392B", "light": "#D6DEE8",
}
TIER_COLOR = {"low": "#8FB3D9", "mid": "#2F5D8A", "premium": "#E07B39"}
DPI = 300
