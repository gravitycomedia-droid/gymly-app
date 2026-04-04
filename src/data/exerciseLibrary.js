/**
 * Exercise Library — Local constant (no Firestore reads needed).
 * 60+ exercises across 7 muscle groups.
 */
export const EXERCISE_LIBRARY = {
  chest: [
    'Barbell Bench Press', 'Incline Dumbbell Press', 'Decline Bench Press',
    'Cable Fly', 'Push-ups', 'Chest Dip', 'Pec Deck', 'Dumbbell Pullover',
    'Machine Chest Press',
  ],
  back: [
    'Deadlift', 'Barbell Row', 'Lat Pulldown', 'Seated Cable Row',
    'Pull-ups', 'Face Pulls', 'T-Bar Row', 'Dumbbell Row',
    'Hyperextension',
  ],
  legs: [
    'Barbell Squat', 'Leg Press', 'Romanian Deadlift', 'Leg Curl',
    'Leg Extension', 'Walking Lunges', 'Calf Raises', 'Glute Bridge',
    'Bulgarian Split Squat', 'Hack Squat', 'Hip Thrust',
  ],
  shoulders: [
    'Overhead Press', 'Lateral Raises', 'Front Raises', 'Reverse Fly',
    'Arnold Press', 'Shrugs', 'Upright Row', 'Cable Lateral Raise',
  ],
  arms: [
    'Barbell Curl', 'Hammer Curl', 'Tricep Pushdown', 'Skull Crushers',
    'Tricep Dip', 'Concentration Curl', 'Preacher Curl',
    'Overhead Tricep Extension', 'Cable Curl',
  ],
  core: [
    'Plank', 'Crunches', 'Bicycle Crunches', 'Leg Raises',
    'Russian Twists', 'Ab Wheel', 'Hanging Leg Raise',
    'Cable Woodchop', 'Dead Bug',
  ],
  cardio: [
    'Treadmill', 'Cycling', 'Jump Rope', 'Burpees',
    'Mountain Climbers', 'Box Jumps', 'Rowing Machine',
    'Stair Climber', 'Battle Ropes',
  ],
};

export const MUSCLE_GROUPS = Object.keys(EXERCISE_LIBRARY);

/**
 * Auto-assignment mapping: experience-goal → plan name.
 */
export const PLAN_MAP = {
  'beginner-fat_loss': 'Full Body Beginner',
  'beginner-general': 'Full Body Beginner',
  'beginner-muscle': 'Upper Lower Split',
  'beginner-endurance': 'Full Body Beginner',
  'intermediate-fat_loss': 'Push Pull Legs',
  'intermediate-muscle': 'Push Pull Legs',
  'intermediate-endurance': 'Push Pull Legs',
  'intermediate-general': 'Push Pull Legs',
  'advanced-fat_loss': 'PPL Advanced',
  'advanced-muscle': 'PPL Advanced',
  'advanced-endurance': 'PPL Advanced',
  'advanced-general': 'PPL Advanced',
};

/**
 * Get the recommended plan name for a member's profile.
 */
export function getRecommendedPlanName(experience, goal) {
  if (!experience || !goal) return 'Full Body Beginner';
  const key = `${experience.toLowerCase()}-${goal.toLowerCase()}`;
  return PLAN_MAP[key] || 'Full Body Beginner';
}

/**
 * Calculate today's day number in a cycling workout plan.
 */
export function getTodaysDayNumber(startDate, totalDays) {
  if (!startDate) return 1;
  const start = startDate.toDate ? startDate.toDate() : new Date(startDate);
  const today = new Date();
  const diffMs = today - start;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return (diffDays % totalDays) + 1;
}

/**
 * Check if two dates are the same calendar day.
 */
export function isSameDay(d1, d2) {
  if (!d1 || !d2) return false;
  const a = d1 instanceof Date ? d1 : new Date(d1);
  const b = d2 instanceof Date ? d2 : new Date(d2);
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

/**
 * Update streak logic.
 */
export function calculateStreak(lastSeen, currentStreak) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (!lastSeen) return 1;
  const last = lastSeen.toDate ? lastSeen.toDate() : new Date(lastSeen);

  if (isSameDay(last, today)) return currentStreak || 1;
  if (isSameDay(last, yesterday)) return (currentStreak || 0) + 1;
  return 1; // streak broken
}
