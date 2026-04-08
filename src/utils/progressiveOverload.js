/**
 * PROGRESSIVE OVERLOAD ENGINE
 * Sugggestion logic based on last 4 logs per exercise
 */
import { parseReps, parseWeight } from './calorieEngine';

export async function getProgressiveSuggestion(logs, currentExercise) {
  if (!logs || logs.length < 2) return null;

  // logs[0] is most recent, logs[1] is previous
  const latest = logs[0];
  const previous = logs[1];

  const avgRPE = logs
    .filter(l => l.rpe)
    .reduce((sum, l) => sum + l.rpe, 0) / (logs.filter(l => l.rpe).length || 1);

  // Extract total sets, current average weight and reps from latest log
  // latest.sets is an array of { weight, reps }
  const currentWeightArr = latest.sets.map(s => parseWeight(s.weight));
  const currentRepsArr = latest.sets.map(s => parseReps(s.reps));
  
  const currentWeight = currentWeightArr.reduce((a, b) => a + b, 0) / currentWeightArr.length;
  const currentReps = currentRepsArr.reduce((a, b) => a + b, 0) / currentRepsArr.length;

  // Rule 1: If RPE <= 6 for last 2 sessions → increase weight 5%
  if (latest.rpe <= 6 && previous.rpe <= 6) {
    const newWeight = Math.round(currentWeight * 1.05);
    return {
      type: "increase_weight",
      message: `You've been finding this easy. Try ${newWeight}kg this session.`,
      suggested_weight: `${newWeight}`,
      suggested_reps: `${currentReps}`,
      confidence: "high"
    };
  }

  // Rule 2: If RPE >= 9 consistently → reduce weight 5%
  if (latest.rpe >= 9 && previous.rpe >= 9) {
    const newWeight = Math.round(currentWeight * 0.95);
    return {
      type: "decrease_weight",
      message: `This weight is consistently very hard. Consider dropping to ${newWeight}kg to focus on form.`,
      suggested_weight: `${newWeight}`,
      suggested_reps: `${currentReps}`,
      confidence: "medium"
    };
  }

  // Rule 3: Same weight 3 sessions in a row → suggest 2.5kg increase
  const weightsEqual = logs.slice(0, 3).every(
    l => {
      const avg = l.sets.reduce((sum, s) => sum + parseWeight(s.weight), 0) / l.sets.length;
      return Math.abs(avg - currentWeight) < 0.5;
    }
  );
  if (weightsEqual && avgRPE <= 7 && logs.length >= 3) {
    return {
      type: "increase_weight",
      message: `You've lifted ${currentWeight}kg for 3 sessions. Time to progress — try ${currentWeight + 2.5}kg.`,
      suggested_weight: `${currentWeight + 2.5}`,
      suggested_reps: `${currentReps}`,
      confidence: "high"
    };
  }

  return null;
}
