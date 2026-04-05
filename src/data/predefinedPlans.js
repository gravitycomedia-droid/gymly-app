/**
 * Predefined Workout Plans — Seed data for Firestore.
 * 4 plans with full day/exercise detail.
 */

import { EXERCISE_LIBRARY } from './exerciseLibrary';

const uid = () => Math.random().toString(36).substring(2, 10);

// ─── Exercise helpers ───
const ex = (name, muscle_group, sets, reps, weight, rest_seconds, difficulty = 'beginner', order = 0) => {
  const lib = EXERCISE_LIBRARY[name] || {};
  return {
    id: uid(), name, muscle_group, difficulty, sets, reps, weight, rest_seconds,
    order,
    exercisedb_name: lib.exercisedb_name || '',
    youtube_id: lib.youtube_id || '',
    primary_muscle: lib.primary_muscle || '',
    secondary_muscles: lib.secondary_muscles || []
  };
};

// ─── Plan 1: Full Body Beginner ───
const fullBodyA = [
  ex('Barbell Squat', 'Legs', 3, '12', '60kg', 90, 'beginner', 1),
  ex('Push-ups', 'Chest', 3, '15', 'Bodyweight', 60, 'beginner', 2),
  ex('Dumbbell Row', 'Back', 3, '12', '15kg', 90, 'beginner', 3),
  ex('Plank', 'Core', 3, '30s', 'Bodyweight', 60, 'beginner', 4),
  ex('Walking Lunges', 'Legs', 3, '12', 'Bodyweight', 60, 'beginner', 5),
];

const fullBodyB = [
  ex('Deadlift', 'Back', 3, '10', '60kg', 120, 'beginner', 1),
  ex('Dumbbell Shoulder Press', 'Shoulders', 3, '12', '10kg', 90, 'beginner', 2),
  ex('Lat Pulldown', 'Back', 3, '12', '40kg', 90, 'beginner', 3),
  ex('Bicycle Crunches', 'Core', 3, '20', 'Bodyweight', 60, 'beginner', 4),
  ex('Leg Press', 'Legs', 3, '15', '80kg', 90, 'beginner', 5),
];

function generateFullBodyDays(totalDays) {
  const days = [];
  for (let i = 1; i <= totalDays; i++) {
    const mod = i % 3;
    if (mod === 0) {
      days.push({
        day_number: i, name: `Day ${i} — Rest & Recovery`,
        focus: 'Active rest — light walk or stretching recommended',
        is_rest_day: true, exercises: [],
      });
    } else if (mod === 1) {
      days.push({
        day_number: i, name: `Day ${i} — Full Body A`,
        focus: 'Legs, Chest, Back & Core',
        is_rest_day: false, exercises: fullBodyA.map(e => ({ ...e, id: uid() })),
      });
    } else {
      days.push({
        day_number: i, name: `Day ${i} — Full Body B`,
        focus: 'Back, Shoulders, Core & Legs',
        is_rest_day: false, exercises: fullBodyB.map(e => ({ ...e, id: uid() })),
      });
    }
  }
  return days;
}

// ─── Plan 2: Upper Lower Split ───
const upperExercises = [
  ex('Barbell Bench Press', 'Chest', 3, '10', '50kg', 90, 'beginner', 1),
  ex('Barbell Row', 'Back', 3, '10', '40kg', 90, 'beginner', 2),
  ex('Overhead Press', 'Shoulders', 3, '10', '30kg', 90, 'beginner', 3),
  ex('Pull-ups', 'Back', 3, '8', 'Bodyweight', 90, 'beginner', 4),
  ex('Tricep Dip', 'Arms', 3, '12', 'Bodyweight', 60, 'beginner', 5),
  ex('Barbell Curl', 'Arms', 3, '12', '15kg', 60, 'beginner', 6),
];

const lowerExercises = [
  ex('Barbell Squat', 'Legs', 3, '10', '60kg', 120, 'beginner', 1),
  ex('Romanian Deadlift', 'Legs', 3, '10', '50kg', 90, 'beginner', 2),
  ex('Leg Press', 'Legs', 3, '12', '100kg', 90, 'beginner', 3),
  ex('Leg Curl', 'Legs', 3, '12', '30kg', 60, 'beginner', 4),
  ex('Calf Raises', 'Legs', 3, '15', '40kg', 60, 'beginner', 5),
  ex('Glute Bridge', 'Legs', 3, '12', '40kg', 60, 'beginner', 6),
];

function generateUpperLowerDays(totalDays) {
  const days = [];
  // Pattern per week: Upper, Lower, Rest, Upper, Lower, Rest, Rest
  const weekPattern = ['upper', 'lower', 'rest', 'upper', 'lower', 'rest', 'rest'];
  for (let i = 1; i <= totalDays; i++) {
    const dayInWeek = (i - 1) % 7;
    const type = weekPattern[dayInWeek];
    if (type === 'rest') {
      days.push({
        day_number: i, name: `Day ${i} — Rest`,
        focus: 'Recovery — light stretching recommended',
        is_rest_day: true, exercises: [],
      });
    } else if (type === 'upper') {
      days.push({
        day_number: i, name: `Day ${i} — Upper Body`,
        focus: 'Chest, Back, Shoulders & Arms',
        is_rest_day: false, exercises: upperExercises.map(e => ({ ...e, id: uid() })),
      });
    } else {
      days.push({
        day_number: i, name: `Day ${i} — Lower Body`,
        focus: 'Quads, Hamstrings, Glutes & Calves',
        is_rest_day: false, exercises: lowerExercises.map(e => ({ ...e, id: uid() })),
      });
    }
  }
  return days;
}

// ─── Plan 3: Push Pull Legs (Intermediate) ───
const pushExercises = [
  ex('Barbell Bench Press', 'Chest', 4, '8-10', '70kg', 90, 'intermediate', 1),
  ex('Incline Dumbbell Press', 'Chest', 3, '10-12', '25kg', 90, 'intermediate', 2),
  ex('Overhead Press', 'Shoulders', 3, '8-10', '40kg', 90, 'intermediate', 3),
  ex('Lateral Raises', 'Shoulders', 3, '12-15', '10kg', 60, 'intermediate', 4),
  ex('Tricep Pushdown', 'Arms', 3, '10-12', '25kg', 60, 'intermediate', 5),
  ex('Skull Crushers', 'Arms', 3, '10-12', '20kg', 60, 'intermediate', 6),
];

const pullExercises = [
  ex('Deadlift', 'Back', 4, '6-8', '100kg', 120, 'intermediate', 1),
  ex('Barbell Row', 'Back', 4, '8-10', '60kg', 90, 'intermediate', 2),
  ex('Lat Pulldown', 'Back', 3, '10-12', '55kg', 90, 'intermediate', 3),
  ex('Seated Cable Row', 'Back', 3, '10-12', '50kg', 90, 'intermediate', 4),
  ex('Face Pulls', 'Shoulders', 3, '15', '20kg', 60, 'intermediate', 5),
  ex('Barbell Curl', 'Arms', 3, '10-12', '25kg', 60, 'intermediate', 6),
];

const legExercises = [
  ex('Barbell Squat', 'Legs', 4, '8-10', '90kg', 120, 'intermediate', 1),
  ex('Leg Press', 'Legs', 3, '10-12', '150kg', 90, 'intermediate', 2),
  ex('Romanian Deadlift', 'Legs', 3, '10-12', '70kg', 90, 'intermediate', 3),
  ex('Leg Curl', 'Legs', 3, '12', '40kg', 60, 'intermediate', 4),
  ex('Leg Extension', 'Legs', 3, '12', '45kg', 60, 'intermediate', 5),
  ex('Calf Raises', 'Legs', 4, '15', '50kg', 60, 'intermediate', 6),
];

function generatePPLDays(totalDays, difficulty = 'intermediate') {
  const days = [];
  // Pattern: Push, Pull, Legs, Push, Pull, Legs, Rest
  const weekPattern = ['push', 'pull', 'legs', 'push', 'pull', 'legs', 'rest'];
  const exerciseMap = { push: pushExercises, pull: pullExercises, legs: legExercises };
  const focusMap = {
    push: 'Chest, Shoulders & Triceps',
    pull: 'Back & Biceps',
    legs: 'Quads, Hamstrings & Calves',
  };
  const nameMap = { push: 'Push', pull: 'Pull', legs: 'Legs' };

  for (let i = 1; i <= totalDays; i++) {
    const dayInWeek = (i - 1) % 7;
    const type = weekPattern[dayInWeek];
    if (type === 'rest') {
      days.push({
        day_number: i, name: `Day ${i} — Rest`,
        focus: 'Recovery day',
        is_rest_day: true, exercises: [],
      });
    } else {
      const exList = exerciseMap[type].map(e => ({
        ...e, id: uid(), difficulty,
        // Advanced: heavier weights, lower reps
        ...(difficulty === 'advanced' ? {
          reps: e.reps.includes('-') ? e.reps.split('-').map(n => Math.max(4, parseInt(n) - 2)).join('-') : String(Math.max(4, parseInt(e.reps) - 2)),
          rest_seconds: Math.max(60, e.rest_seconds - 15),
        } : {}),
      }));
      days.push({
        day_number: i, name: `Day ${i} — ${nameMap[type]}`,
        focus: focusMap[type],
        is_rest_day: false, exercises: exList,
      });
    }
  }
  return days;
}

// ─── Export all plans ───
export const PREDEFINED_PLANS = [
  {
    plan: {
      name: 'Full Body Beginner',
      type: 'predefined',
      target_goal: 'fat_loss',
      target_experience: 'beginner',
      total_days: 30,
      days_per_week: 5,
      gym_id: null,
      created_by: 'system',
      is_active: true,
    },
    days: generateFullBodyDays(30),
  },
  {
    plan: {
      name: 'Upper Lower Split',
      type: 'predefined',
      target_goal: 'muscle',
      target_experience: 'beginner',
      total_days: 30,
      days_per_week: 4,
      gym_id: null,
      created_by: 'system',
      is_active: true,
    },
    days: generateUpperLowerDays(30),
  },
  {
    plan: {
      name: 'Push Pull Legs',
      type: 'predefined',
      target_goal: 'muscle',
      target_experience: 'intermediate',
      total_days: 42,
      days_per_week: 6,
      gym_id: null,
      created_by: 'system',
      is_active: true,
    },
    days: generatePPLDays(42, 'intermediate'),
  },
  {
    plan: {
      name: 'PPL Advanced',
      type: 'predefined',
      target_goal: 'muscle',
      target_experience: 'advanced',
      total_days: 42,
      days_per_week: 6,
      gym_id: null,
      created_by: 'system',
      is_active: true,
    },
    days: generatePPLDays(42, 'advanced'),
  },
];
