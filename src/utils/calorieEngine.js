/**
 * CALORIE ENGINE
 * MET-based calorie formula adjusted for resistance training
 * Base formula: Calories = MET × weight(kg) × time(hours)
 */

const TEMPO_SECONDS = {
  "push": { concentric: 1.5, eccentric: 2.5 },  // e.g. bench press
  "pull": { concentric: 1.5, eccentric: 2.5 },  // e.g. row
  "static": { hold: 30 },                        // e.g. plank
  "compound": { concentric: 2, eccentric: 3 }    // e.g. squat
}

/**
 * EPOC multiplier (afterburn effect)
 * Heavy compound: 1.15x, isolation: 1.05x
 */
function getEPOCMultiplier(forceType, difficulty) {
  if (forceType === "compound") return 1.15;
  if (difficulty === "advanced") return 1.12;
  if (difficulty === "intermediate") return 1.08;
  return 1.05;
}

/**
 * BMI adjustment factor
 */
function getBMIAdjustment(bmi) {
  if (!bmi) return 1.0;
  if (bmi < 18.5) return 0.93;
  if (bmi <= 24.9) return 1.0;
  if (bmi <= 29.9) return 1.05;
  return 1.08;
}

const WEIGHT_FACTOR = 0.0015;

export function calculateExerciseCalories({
  exercise,         // exercise object from GYMLY_EXERCISE_DB
  actualSets,       // number
  actualReps,       // number (use midpoint if range e.g. "8-12" → 10)
  actualWeightKg,   // number (0 for bodyweight)
  memberWeightKg,   // member's body weight
  memberBMI,        // calculated BMI
}) {
  const reps = typeof actualReps === 'number' ? actualReps : parseReps(actualReps);
  
  // Calculate time under tension (TUT) per set in seconds
  const tempo = TEMPO_SECONDS[exercise.force_type] || TEMPO_SECONDS.push;
  const tutPerSet = exercise.force_type === "static"
    ? (tempo.hold || 30)
    : reps * (tempo.concentric + tempo.eccentric);

  const totalActiveSeconds = actualSets * tutPerSet;
  const activeHours = totalActiveSeconds / 3600;

  const restHours = (actualSets * (exercise.rest_seconds || 60)) / 3600;

  // Base calories from MET × weight × time
  const activeCal = (exercise.met_value || 3.0) * memberWeightKg * activeHours;
  const restCal = 1.5 * memberWeightKg * restHours;

  const loadBonus = actualWeightKg * actualSets * reps * WEIGHT_FACTOR;
  const epoc = getEPOCMultiplier(exercise.force_type, exercise.difficulty);
  const bmiAdj = getBMIAdjustment(memberBMI);

  const total = (activeCal + restCal + loadBonus) * epoc * bmiAdj;

  return {
    calories: Math.round(total),
    breakdown: {
      active_phase: Math.round(activeCal),
      rest_phase: Math.round(restCal),
      load_bonus: Math.round(loadBonus),
      epoc_bonus: Math.round((total / epoc - total) * -1),
      bmi_adjustment: bmiAdj
    },
    time_under_tension_seconds: Math.round(totalActiveSeconds),
    total_time_seconds: Math.round(totalActiveSeconds + (actualSets * (exercise.rest_seconds || 60)))
  };
}

export function parseReps(repsString) {
  if (!repsString) return 10;
  if (typeof repsString === "number") return repsString;
  if (repsString.includes("-")) {
    const [min, max] = repsString.split("-").map(Number);
    return Math.round((min + max) / 2);
  }
  if (repsString === "AMRAP") return 15;
  const match = repsString.match(/\d+/);
  return match ? parseInt(match[0]) : 12;
}

export function parseWeight(weightString) {
  if (!weightString) return 0;
  if (typeof weightString === "number") return weightString;
  if (weightString === "Bodyweight" || weightString === "Assisted") return 0;
  const match = weightString.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
}
