// src/utils/featureCheck.js
// Feature access validation based on subscription plan

export const FEATURE_MAP = {
  // Basic features (all plans)
  'manage_members': ['FREE', 'BASIC', 'PROFESSIONAL', 'PROFESSIONAL_PLUS', 'PREMIUM'],
  'qr_attendance': ['FREE', 'BASIC', 'PROFESSIONAL', 'PROFESSIONAL_PLUS', 'PREMIUM'],

  // Professional features
  'payments': ['PROFESSIONAL', 'PROFESSIONAL_PLUS', 'PREMIUM'],
  'landing_page': ['PROFESSIONAL', 'PROFESSIONAL_PLUS', 'PREMIUM'],
  'invoice_generation': ['PROFESSIONAL', 'PROFESSIONAL_PLUS', 'PREMIUM'],
  'lead_inquiry_form': ['PROFESSIONAL', 'PROFESSIONAL_PLUS', 'PREMIUM'],

  // Professional Plus features
  'analytics': ['PROFESSIONAL_PLUS', 'PREMIUM'],
  'attendance_heatmap': ['PROFESSIONAL_PLUS', 'PREMIUM'],
  'trainer_dashboard': ['PROFESSIONAL_PLUS', 'PREMIUM'],
  'equipment_tracking': ['PROFESSIONAL_PLUS', 'PREMIUM'],
  'member_segments': ['PROFESSIONAL_PLUS', 'PREMIUM'],
  'revenue_reports': ['PROFESSIONAL_PLUS', 'PREMIUM'],

  // Premium features
  'whatsapp_automation': ['PREMIUM'],
  'whatsapp_welcome_messages': ['PREMIUM'],
  'whatsapp_expiry_alerts': ['PREMIUM'],
  'whatsapp_payment_confirmations': ['PREMIUM'],
  'whatsapp_payment_reminders': ['PREMIUM'],
  'whatsapp_inactivity_alerts': ['PREMIUM'],
  'whatsapp_milestone_celebrations': ['PREMIUM'],
  'complete_owner_dashboard': ['PREMIUM'],
  'priority_support': ['PREMIUM'],
  'unlimited_branches': ['PREMIUM'],
  'api_access': ['PREMIUM'],
};

export const PLAN_LIMITS = {
  'FREE': { max_members: 30, max_staff: 1, max_branches: 1, max_trainers: 1 },
  'BASIC': { max_members: 50, max_staff: 3, max_branches: 1, max_trainers: 2 },
  'PROFESSIONAL': { max_members: 200, max_staff: 5, max_branches: 1, max_trainers: 5 },
  'PROFESSIONAL_PLUS': { max_members: 500, max_staff: 10, max_branches: 3, max_trainers: 10 },
  'PREMIUM': { max_members: Infinity, max_staff: Infinity, max_branches: Infinity, max_trainers: Infinity },
};

export const PLAN_PRICES = {
  'FREE': 0,
  'BASIC': 199,
  'PROFESSIONAL': 499,
  'PROFESSIONAL_PLUS': 799,
  'PREMIUM': 999,
};

export const PLAN_HIERARCHY = ['FREE', 'BASIC', 'PROFESSIONAL', 'PROFESSIONAL_PLUS', 'PREMIUM'];

/**
 * Check if a gym has access to a feature.
 * @param {string} plan
 * @param {string} featureName
 * @returns {{ hasAccess: boolean, reason: string, minimumPlan?: string, upgradeCost?: number }}
 */
export function checkFeatureAccess(plan, featureName) {
  const allowedPlans = FEATURE_MAP[featureName];
  if (!allowedPlans) return { hasAccess: false, reason: 'Feature not found' };

  const hasAccess = allowedPlans.includes(plan);
  if (!hasAccess) {
    const minPlan = allowedPlans[0];
    return {
      hasAccess: false,
      reason: `This feature requires the ${minPlan.replace('_', ' ')} plan or above`,
      minimumPlan: minPlan,
      upgradeCost: PLAN_PRICES[minPlan] - PLAN_PRICES[plan],
    };
  }
  return { hasAccess: true, reason: 'Access granted' };
}

/**
 * Check member limit for a plan.
 * @param {string} plan
 * @param {number} currentMembers
 * @returns {{ canAdd: boolean, warning: boolean, reason: string, percentageUsed: number }}
 */
export function checkMemberLimit(plan, currentMembers) {
  const limit = PLAN_LIMITS[plan]?.max_members ?? 30;
  if (limit === Infinity) return { canAdd: true, warning: false, reason: 'Unlimited members', percentageUsed: 0 };

  const percentageUsed = (currentMembers / limit) * 100;

  if (currentMembers >= limit) {
    return {
      canAdd: false, warning: false,
      reason: `Member limit (${limit}) reached. Upgrade to add more.`,
      limit, current: currentMembers, percentageUsed: 100,
    };
  }
  if (percentageUsed >= 90) {
    return {
      canAdd: true, warning: true,
      reason: `You're at ${Math.round(percentageUsed)}% of your member limit (${currentMembers}/${limit})`,
      limit, current: currentMembers, percentageUsed: Math.round(percentageUsed),
    };
  }
  return {
    canAdd: true, warning: false,
    reason: 'Within member limit',
    limit, current: currentMembers, percentageUsed: Math.round(percentageUsed),
  };
}

/** Get all features for a given plan. */
export function getFeaturesForPlan(plan) {
  return Object.keys(FEATURE_MAP).filter(f => FEATURE_MAP[f].includes(plan));
}

export default { checkFeatureAccess, checkMemberLimit, getFeaturesForPlan, FEATURE_MAP, PLAN_LIMITS, PLAN_PRICES };
