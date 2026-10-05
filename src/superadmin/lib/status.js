// src/superadmin/lib/status.js
// Status vocabulary + churn-risk scoring for the Super Admin console.
//
// The handoff spec lists four gym statuses (active/trial/expired/suspended).
// This platform actually stores five on `gym_summaries`: active, trial,
// past_due, suspended, cancelled. The repo wins — `past_due` and `cancelled`
// are real, dunning depends on them — so the badge vocabulary is extended
// rather than collapsed. See IMPLEMENTATION_NOTES.md.

import { toDate } from './format';

export const GYM_STATUSES = ['active', 'trial', 'past_due', 'suspended', 'cancelled'];

export const STATUS_LABEL = {
  active: 'Active',
  trial: 'Trial',
  past_due: 'Past due',
  suspended: 'Suspended',
  cancelled: 'Cancelled',
  expired: 'Expired',
  inactive: 'Inactive',
  draft: 'Draft',
  published: 'Published',
  paid: 'Paid',
  failed: 'Failed',
  pending: 'Pending',
};

// tone → the three colour slots a StatusBadge needs. Tones, not statuses, so
// payment + broadcast states can reuse the same swatches (README §6).
export const STATUS_TONE = {
  active: 'success',
  paid: 'success',
  published: 'accent',
  trial: 'info',
  expired: 'danger',
  past_due: 'warning',
  failed: 'danger',
  cancelled: 'neutral',
  suspended: 'neutral',
  draft: 'warning',
  pending: 'warning',
  inactive: 'inactive',
};

export const TONE_CLASS = {
  success: { wrap: 'bg-sa-success-soft text-sa-success', dot: 'bg-sa-success-dot' },
  info: { wrap: 'bg-sa-info-soft text-sa-info', dot: 'bg-sa-info-dot' },
  danger: { wrap: 'bg-sa-danger-soft text-sa-danger', dot: 'bg-sa-danger-dot' },
  warning: { wrap: 'bg-sa-warning-soft text-sa-warning', dot: 'bg-sa-warning-dot' },
  neutral: { wrap: 'bg-sa-neutral-soft text-sa-neutral', dot: 'bg-sa-neutral-dot' },
  accent: { wrap: 'bg-sa-accent-soft text-sa-accent-ink', dot: 'bg-sa-accent' },
  inactive: { wrap: 'bg-sa-muted text-[#5B606B]', dot: 'bg-[#9CA0A9]' },
};

// ── Churn risk ─────────────────────────────────────────────────────────────
// Derived purely from the gym_summaries fields already loaded for the list —
// no extra reads, no backend. Carried over from the previous console because
// it is the one signal that tells the operator where to spend their day.
export const HEALTH_META = {
  healthy: { label: 'Healthy', tone: 'success' },
  watch: { label: 'Watch', tone: 'warning' },
  at_risk: { label: 'At risk', tone: 'danger' },
};
const HEALTH_ORDER = { healthy: 0, watch: 1, at_risk: 2 };

export function healthOf(g) {
  const reasons = [];
  let level = 'healthy';
  const escalate = (l) => { if (HEALTH_ORDER[l] > HEALTH_ORDER[level]) level = l; };

  const total = g?.memberCount ?? 0;
  const active = g?.activeCount ?? 0;
  const ratio = total > 0 ? active / total : 0;
  const status = g?.rawStatus || g?.status;
  const isTrial = g?.isTrial;
  const trialEnd = toDate(g?.trialEndDate);
  const daysToTrialEnd = trialEnd ? Math.ceil((trialEnd - new Date()) / 86400000) : null;

  if (status === 'past_due') { escalate('at_risk'); reasons.push('Payment past due'); }
  if (status === 'suspended') { escalate('at_risk'); reasons.push('Suspended'); }
  if (status === 'cancelled') { escalate('at_risk'); reasons.push('Cancelled'); }

  if (total === 0) { escalate('at_risk'); reasons.push('No members onboarded'); }
  else if (ratio < 0.3) { escalate('at_risk'); reasons.push(`Only ${Math.round(ratio * 100)}% of members active`); }
  else if (ratio < 0.6) { escalate('watch'); reasons.push(`${Math.round(ratio * 100)}% of members active`); }

  if (isTrial && daysToTrialEnd != null) {
    if (daysToTrialEnd <= 2) { escalate('at_risk'); reasons.push(`Trial ends in ${Math.max(daysToTrialEnd, 0)} days`); }
    else if (daysToTrialEnd <= 7) { escalate('watch'); reasons.push(`Trial ends in ${daysToTrialEnd} days`); }
  }

  if (reasons.length === 0) reasons.push('Good activity, no payment issues');
  return { level, reasons };
}

// Flat monthly price per legacy plan id, in rupees. Fallback for gyms whose
// subscription predates `amount_monthly` (paise) being written.
export const LEGACY_PLAN_PRICES_INR = {
  FREE: 0, BASIC: 199, PROFESSIONAL: 499, PROFESSIONAL_PLUS: 799, PREMIUM: 999,
};

export const monthlyInr = (sub) => {
  if (!sub) return 0;
  if (typeof sub.amount_monthly === 'number' && sub.amount_monthly > 0) return Math.round(sub.amount_monthly / 100);
  if (typeof sub.monthly_amount_inr === 'number') return sub.monthly_amount_inr;
  return LEGACY_PLAN_PRICES_INR[sub.plan] || 0;
};
