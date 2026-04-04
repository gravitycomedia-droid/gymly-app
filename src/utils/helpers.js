/**
 * Get initials from a name string (max 2 chars).
 */
export function getInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Get a deterministic avatar background color based on name hash.
 */
const AVATAR_COLORS = [
  { bg: '#EEEDFE', text: '#534AB7' },
  { bg: '#E1F5EE', text: '#0F6E56' },
  { bg: '#FAECE7', text: '#9C4221' },
  { bg: '#E6F1FB', text: '#2B6CB0' },
];

export function getAvatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/**
 * Format a Firestore Timestamp or Date to "15 Jan 2026".
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(timestamp) {
  if (!timestamp) return '—';
  const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  if (isNaN(date.getTime())) return '—';
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Get expiry status for a subscription.
 * Returns { label, type, daysText }
 */
export function getExpiryStatus(expiryDate) {
  if (!expiryDate) return { label: 'No plan', type: 'expired', daysText: '' };

  const now = new Date();
  const expiry = expiryDate?.toDate ? expiryDate.toDate() : new Date(expiryDate);
  const diffMs = expiry.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      label: 'Expired',
      type: 'expired',
      daysText: `Expired ${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''} ago`,
    };
  }
  if (diffDays <= 7) {
    return {
      label: 'Expiring',
      type: 'expiring',
      daysText: `Expires in ${diffDays} day${diffDays !== 1 ? 's' : ''}`,
    };
  }
  return {
    label: 'Active',
    type: 'active',
    daysText: `Expires ${formatDate(expiry)}`,
  };
}

/**
 * Calculate BMI from height (cm) and weight (kg).
 */
export function calculateBMI(heightCm, weightKg) {
  if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) return null;
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  const value = Math.round(bmi * 10) / 10;

  let category, color;
  if (bmi < 18.5) {
    category = 'Underweight';
    color = '#EF9F27';
  } else if (bmi < 25) {
    category = 'Normal';
    color = '#1D9E75';
  } else if (bmi < 30) {
    category = 'Overweight';
    color = '#EF9F27';
  } else {
    category = 'Obese';
    color = '#E24B4A';
  }

  return { value, category, color };
}

/**
 * Add days to a Date and return new Date.
 */
export function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Get remaining days between now and an expiry date.
 */
export function getDaysRemaining(expiryDate) {
  if (!expiryDate) return 0;
  const expiry = expiryDate?.toDate ? expiryDate.toDate() : new Date(expiryDate);
  const now = new Date();
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Get the plan name from gym settings by plan ID.
 */
export function getPlanName(gym, planId) {
  if (!gym?.settings?.plans || !planId) return '—';
  const plan = gym.settings.plans.find((p) => p.id === planId);
  return plan ? plan.name : '—';
}
