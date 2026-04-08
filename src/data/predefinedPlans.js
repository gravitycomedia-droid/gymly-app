import { GYMLY_EXERCISE_DB } from './gymlyExerciseDb';

const uid = () => Math.random().toString(36).substring(2, 10);

const ex = (slug, sets, reps, weight, rest_seconds, order = 0) => {
  const lib = GYMLY_EXERCISE_DB[slug];
  if (!lib) {
    console.warn(`Exercise ${slug} not found in DB`);
    return { id: slug, instanceId: uid(), name: slug, sets, reps, weight, rest_seconds, order };
  }
  return {
    id: slug,
    instanceId: uid(),
    name: lib.name,
    muscle_group: lib.muscle_group,
    difficulty: lib.difficulty,
    sets: sets || lib.default_sets || 3,
    reps: reps || lib.default_reps || '10',
    weight: weight || '',
    rest_seconds: rest_seconds || lib.rest_seconds || 90,
    order,
    youtube_id: lib.youtube_id || '',
    gif_url: lib.gif_url || ''
  };
};

const fullBodyA = [
  ex('squat-barbell', 3, '12', '60kg', 120, 1),
  ex('pushup', 3, '15', 'Bodyweight', 60, 2),
  ex('barbell-row', 3, '12', '40kg', 90, 3),
  ex('plank', 3, '45s', 'Bodyweight', 60, 4),
  ex('lateral-raise-dumbbell', 3, '12', '10kg', 60, 5),
];

const fullBodyB = [
  ex('deadlift-conventional', 3, '10', '80kg', 180, 1),
  ex('bench-press-dumbbell', 3, '12', '20kg each', 90, 2),
  ex('pullup', 3, '8', 'Bodyweight', 120, 3),
  ex('overhead-press-barbell', 3, '10', '40kg', 120, 4),
  ex('leg-press', 3, '15', '100kg', 90, 5),
];

function generateFullBodyDays(totalDays) {
  const days = [];
  for (let i = 1; i <= totalDays; i++) {
    const mod = i % 3;
    if (mod === 0) {
      days.push({
        day_number: i, name: `Day ${i} — Recovery`,
        focus: 'Active Rest & Mobility',
        is_rest_day: true, exercises: [],
      });
    } else if (mod === 1) {
      days.push({
        day_number: i, name: `Day ${i} — Strength A`,
        focus: 'Compound Push/Pull/Legs',
        is_rest_day: false, exercises: fullBodyA.map(e => ({ ...e, instanceId: uid() })),
      });
    } else {
      days.push({
        day_number: i, name: `Day ${i} — Strength B`,
        focus: 'Alternative Compounds',
        is_rest_day: false, exercises: fullBodyB.map(e => ({ ...e, instanceId: uid() })),
      });
    }
  }
  return days;
}

export const PREDEFINED_PLANS = [
  {
    plan: {
      name: 'Gymly Scientific Beginner',
      type: 'predefined',
      target_goal: 'general',
      target_experience: 'beginner',
      total_days: 30,
      days_per_week: 5,
      gym_id: null,
      created_by: 'system',
      is_active: true,
    },
    days: generateFullBodyDays(30),
  }
];
