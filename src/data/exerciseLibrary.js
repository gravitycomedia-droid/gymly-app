import { GYMLY_EXERCISE_DB } from './gymlyExerciseDb';

export const EXERCISE_LIBRARY = GYMLY_EXERCISE_DB;

export const MUSCLE_GROUPS = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'];

export const getTodaysDayNumber = (startDate, totalDays) => {
  if (!startDate) return 1;
  const start = startDate.toDate ? startDate.toDate() : new Date(startDate);
  const now = new Date();
  const diffTime = Math.abs(now - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return ((diffDays - 1) % totalDays) + 1;
};

export const getRecommendedPlanName = (level, goal) => {
  if (level === 'beginner') {
    return goal === 'fat_loss' ? 'Full Body Beginner' : 'Upper Lower Split';
  }
  if (level === 'intermediate' || level === 'advanced') {
    return 'Push Pull Legs';
  }
  return 'Full Body Beginner';
};
