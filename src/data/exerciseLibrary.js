/**
 * Exercise Library — Local constant (no Firestore reads needed).
 * 20 structured predefined exercises with metadata for APIs.
 */
export const EXERCISE_LIBRARY = {
  "Barbell Bench Press": {
    muscle_group: "Chest",
    youtube_id: "rT7DgCr-3pg", 
    gif_url: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Barbell-Bench-Press.gif",
    muscle_map_image: "https://fitnessprogramer.com/wp-content/uploads/2021/02/chest.png",
    primary_muscle: "Chest",
    secondary_muscles: ["Triceps", "Shoulders"],
    instructions: [
      "Lie on a flat bench with your eyes under the bar.",
      "Grasp the bar with a grip slightly wider than shoulder-width.",
      "Unrack the bar and lower it to your mid-chest.",
      "Press the bar back up until your arms are fully extended."
    ]
  },
  "Incline Dumbbell Press": {
    muscle_group: "Chest",
    youtube_id: "8iPEnn-ltC8",
    gif_url: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Incline-Dumbbell-Press.gif",
    muscle_map_image: "https://fitnessprogramer.com/wp-content/uploads/2021/02/chest.png",
    primary_muscle: "Chest",
    secondary_muscles: ["Triceps", "Shoulders"],
    instructions: [
      "Set an incline bench to an angle of 30-45 degrees.",
      "Hold a dumbbell in each hand and press them straight up.",
      "Lower the dumbbells until they are level with your upper chest.",
      "Press the dumbbells back to the starting position."
    ]
  },
  "Barbell Squat": {
    muscle_group: "Legs",
    youtube_id: "ultWZbUMPL8",
    gif_url: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Barbell-Squat.gif",
    muscle_map_image: "https://fitnessprogramer.com/wp-content/uploads/2021/02/quadriceps.png",
    primary_muscle: "Quads",
    secondary_muscles: ["Glutes", "Hamstrings", "Lower Back"],
    instructions: [
      "Stand with feet shoulder-width apart, resting the bar on your upper back.",
      "Engage your core and lower your hips as if sitting in a chair.",
      "Keep your chest up and lower until your thighs are parallel to the floor.",
      "Push through your heels to return to the starting position."
    ]
  },
  "Deadlift": {
    muscle_group: "Back",
    youtube_id: "op9kVnSso6Q",
    gif_url: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Barbell-Deadlift.gif",
    muscle_map_image: "https://cdn.muscleandstrength.com/sites/all/themes/mnsnew/images/taxonomy/muscle/lower-back.png",
    primary_muscle: "Back",
    secondary_muscles: ["Glutes", "Hamstrings", "Traps"],
    instructions: [
      "Stand with feet hip-width apart, with the barbell over your mid-foot.",
      "Hinge at the hips and grip the bar just outside your knees.",
      "Keep your back straight, chest up, and pull the bar up by extending your hips and knees.",
      "Lower the bar back to the ground with control."
    ]
  },
  "Pull-ups": {
    muscle_group: "Back",
    youtube_id: "eGo4IYlbE5g",
    gif_url: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Pull-up.gif",
    muscle_map_image: "https://cdn.muscleandstrength.com/sites/all/themes/mnsnew/images/taxonomy/muscle/lats.png",
    primary_muscle: "Back",
    secondary_muscles: ["Biceps", "Forearms"],
    instructions: [
      "Grab the pull-up bar with an overhand grip, slightly wider than shoulder-width.",
      "Pull your body up until your chin clears the bar.",
      "Lower your body back down to the starting position."
    ]
  },
  "Overhead Press": {
    muscle_group: "Shoulders",
    youtube_id: "2yjwXTZbrDw",
    gif_url: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Barbell-Overhead-Press.gif",
    muscle_map_image: "https://fitnessprogramer.com/wp-content/uploads/2021/02/shoulder.png",
    primary_muscle: "Shoulders",
    secondary_muscles: ["Triceps", "Upper Chest"],
    instructions: [
      "Stand with the barbell at shoulder height, gripping it just outside shoulder-width.",
      "Press the bar overhead until your arms are fully extended.",
      "Lower the bar back down to the starting position."
    ]
  },
  "Dumbbell Shoulder Press": {
    muscle_group: "Shoulders",
    youtube_id: "qEwKCR5JCog",
    gif_url: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Dumbbell-Shoulder-Press.gif",
    muscle_map_image: "https://fitnessprogramer.com/wp-content/uploads/2021/02/shoulder.png",
    primary_muscle: "Shoulders",
    secondary_muscles: ["Triceps"],
    instructions: [
      "Sit on a bench with back support, holding dumbbells at shoulder level.",
      "Press the weight directly upwards until your arms are extended.",
      "Lower it back with control to your shoulders."
    ]
  },
  "Barbell Row": {
    muscle_group: "Back",
    youtube_id: "FWJR5Ve8bnQ",
    gif_url: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Barbell-Bent-Over-Row.gif",
    muscle_map_image: "https://fitnessprogramer.com/wp-content/uploads/2021/02/back.png",
    primary_muscle: "Back",
    secondary_muscles: ["Biceps", "Lower Back"],
    instructions: [
      "Hinge at your hips keeping your back straight, holding the barbell.",
      "Pull the barbell to your lower chest/upper abdomen.",
      "Squeeze your shoulder blades together at the top.",
      "Slowly lower the bar back down."
    ]
  },
  "Romanian Deadlift": {
    muscle_group: "Legs",
    youtube_id: "JCXUYuzwNrM",
    gif_url: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Romanian-Deadlift.gif",
    muscle_map_image: "https://cdn.muscleandstrength.com/sites/all/themes/mnsnew/images/taxonomy/muscle/hamstrings.png",
    primary_muscle: "Hamstrings",
    secondary_muscles: ["Glutes", "Lower Back"],
    instructions: [
      "Hold a barbell with a shoulder-width grip, standing straight.",
      "Hinge at the hips, keeping a slight bend in your knees, lowering the bar.",
      "Go down until you feel a deep stretch in your hamstrings, keeping your back flat.",
      "Push your hips forward to return to standing."
    ]
  },
  "Lat Pulldown": {
    muscle_group: "Back",
    youtube_id: "CAwf7n6Luuc",
    gif_url: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Lat-Pulldown.gif",
    muscle_map_image: "https://cdn.muscleandstrength.com/sites/all/themes/mnsnew/images/taxonomy/muscle/lats.png",
    primary_muscle: "Back",
    secondary_muscles: ["Biceps"],
    instructions: [
      "Sit at the machine and grab the wide bar.",
      "Pull the bar down to your upper chest while leaning back slightly.",
      "Squeeze your lats at the bottom of the movement.",
      "Return the bar to the top under control."
    ]
  },
  "Leg Press": {
    muscle_group: "Legs",
    youtube_id: "IZxyjW7MPJQ",
    gif_url: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Leg-Press.gif",
    muscle_map_image: "https://fitnessprogramer.com/wp-content/uploads/2021/02/quadriceps.png",
    primary_muscle: "Quads",
    secondary_muscles: ["Glutes", "Hamstrings"],
    instructions: [
      "Sit on the machine, placing feet shoulder-width apart on the sled.",
      "Lower the sled toward your chest until your knees form a 90-degree angle.",
      "Press the sled back up, pushing through your heels."
    ]
  },
  "Lateral Raises": {
    muscle_group: "Shoulders",
    youtube_id: "3VcKaXpzqRo",
    gif_url: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Dumbbell-Lateral-Raise.gif",
    muscle_map_image: "https://fitnessprogramer.com/wp-content/uploads/2021/02/shoulder.png",
    primary_muscle: "Shoulders",
    secondary_muscles: ["Traps"],
    instructions: [
      "Stand holding dumbbells by your sides with a slight bend in your arms.",
      "Raise your arms out to the sides until they are parallel to the floor.",
      "Slowly lower the dumbbells back down."
    ]
  },
  "Tricep Pushdown": {
    muscle_group: "Arms",
    youtube_id: "2-LAMcpzODU",
    gif_url: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Pushdown.gif",
    muscle_map_image: "https://fitnessprogramer.com/wp-content/uploads/2021/02/triceps.png",
    primary_muscle: "Triceps",
    secondary_muscles: ["Forearms"],
    instructions: [
      "Attach a rope or bar to a high cable pulley.",
      "Keep your elbows tucked in at your sides.",
      "Push the attachment down until your arms are fully extended.",
      "Return to the starting position under control."
    ]
  },
  "Bicep Curl": {
    muscle_group: "Arms",
    youtube_id: "ykJmrZ5v0Oo",
    gif_url: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Barbell-Curl.gif",
    muscle_map_image: "https://fitnessprogramer.com/wp-content/uploads/2021/02/biceps.png",
    primary_muscle: "Biceps",
    secondary_muscles: ["Forearms"],
    instructions: [
      "Stand holding a barbell with an underhand grip.",
      "Keep your upper arms stationary and curl the weight up.",
      "Squeeze your biceps at the top.",
      "Lower the bar back down smoothly."
    ]
  },
  "Plank": {
    muscle_group: "Core",
    youtube_id: "pSHjTRCQxIw",
    gif_url: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Front-Plank.gif",
    muscle_map_image: "https://fitnessprogramer.com/wp-content/uploads/2021/02/abs.png",
    primary_muscle: "Core",
    secondary_muscles: ["Shoulders", "Lower Back"],
    instructions: [
      "Start in a forearm plank position with your elbows under your shoulders.",
      "Keep your body in a straight line from head to heels.",
      "Engage your core and hold the position."
    ]
  },
  "Leg Curl": {
    muscle_group: "Legs",
    youtube_id: "ELOCsoDSmrg",
    gif_url: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Lying-Leg-Curl.gif",
    muscle_map_image: "https://cdn.muscleandstrength.com/sites/all/themes/mnsnew/images/taxonomy/muscle/hamstrings.png",
    primary_muscle: "Hamstrings",
    secondary_muscles: ["Calves"],
    instructions: [
      "Lie face down on the leg curl machine.",
      "Curl your legs upward, squeezing your hamstrings.",
      "Lower the weight back to the starting position slowly."
    ]
  },
  "Calf Raises": {
    muscle_group: "Legs",
    youtube_id: "gwLzBJYoWlI",
    gif_url: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Dumbbell-Calf-Raise.gif",
    muscle_map_image: "https://cdn.muscleandstrength.com/sites/all/themes/mnsnew/images/taxonomy/muscle/calves.png",
    primary_muscle: "Calves",
    secondary_muscles: ["Ankles"],
    instructions: [
      "Stand on the edge of a step or platform.",
      "Raise your heels as high as possible.",
      "Lower your heels below the level of the step for a deep stretch."
    ]
  },
  "Push-ups": {
    muscle_group: "Chest",
    youtube_id: "_l3ySVKYVJ8",
    gif_url: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Push-Up.gif",
    muscle_map_image: "https://fitnessprogramer.com/wp-content/uploads/2021/02/chest.png",
    primary_muscle: "Chest",
    secondary_muscles: ["Triceps", "Shoulders"],
    instructions: [
      "Start in a high plank position.",
      "Lower your body until your chest nearly touches the floor.",
      "Push your body up, fully extending your arms."
    ]
  },
  "Dumbbell Row": {
    muscle_group: "Back",
    youtube_id: "roCP6wCXPqo",
    gif_url: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Dumbbell-Row.gif",
    muscle_map_image: "https://fitnessprogramer.com/wp-content/uploads/2021/02/back.png",
    primary_muscle: "Back",
    secondary_muscles: ["Biceps"],
    instructions: [
      "Place one knee and one hand on a bench.",
      "Hold a dumbbell in your free hand, letting it hang.",
      "Pull the dumbbell up toward your hip, squeezing your back.",
      "Lower the dumbbell slowly."
    ]
  },
  "Walking Lunges": {
    muscle_group: "Legs",
    youtube_id: "L8fvypPrzzs",
    gif_url: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Walking-Lunge.gif",
    muscle_map_image: "https://fitnessprogramer.com/wp-content/uploads/2021/02/quadriceps.png",
    primary_muscle: "Quads",
    secondary_muscles: ["Glutes", "Hamstrings"],
    instructions: [
      "Step forward with one leg and lower your hips until both knees are bent at a 90-degree angle.",
      "Push off the back foot to step forward into the next lunge.",
      "Keep your chest up and core engaged."
    ]
  },
  "Cable Fly": {
    muscle_group: "Chest",
    youtube_id: "Iwe6AmxVf7o",
    gif_url: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Cable-Crossover.gif",
    muscle_map_image: "https://fitnessprogramer.com/wp-content/uploads/2021/02/chest.png",
    primary_muscle: "Chest",
    secondary_muscles: ["Shoulders"],
    instructions: [
      "Stand in the middle of a cable machine holding a pulley handle in each hand.",
      "Take a step forward and lean slightly forward.",
      "Bring your hands together in front of your chest in a hugging motion.",
      "Slowly reverse the motion."
    ]
  },
  "Pec Deck Fly": {
    muscle_group: "Chest",
    youtube_id: "eGjt4lk6g34",
    gif_url: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Pec-Deck-Fly.gif",
    muscle_map_image: "https://fitnessprogramer.com/wp-content/uploads/2021/02/chest.png",
    primary_muscle: "Chest",
    secondary_muscles: ["Shoulders"],
    instructions: [
      "Sit on the machine with your back flat against the pad.",
      "Grasp the handles and pull them together in front of your chest.",
      "Squeeze your chest at the peak of the movement.",
      "Slowly return to the start position."
    ]
  },
  "Cable Row": {
    muscle_group: "Back",
    youtube_id: "GZbfZ033f74",
    gif_url: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Seated-Cable-Row.gif",
    muscle_map_image: "https://fitnessprogramer.com/wp-content/uploads/2021/02/back.png",
    primary_muscle: "Back",
    secondary_muscles: ["Biceps", "Forearms"],
    instructions: [
      "Sit at the machine with feet on the pads and knees slightly bent.",
      "Grasp the handle and pull it toward your abdomen.",
      "Keep your back straight and squeeze your shoulder blades.",
      "Slowly return the handle back."
    ]
  },
  "Face Pulls": {
    muscle_group: "Back",
    youtube_id: "rep-qVOkqgk",
    gif_url: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Face-Pull.gif",
    muscle_map_image: "https://fitnessprogramer.com/wp-content/uploads/2021/02/shoulder.png",
    primary_muscle: "Rear Delts",
    secondary_muscles: ["Traps", "Upper Back"],
    instructions: [
      "Attach a rope to a high cable pulley.",
      "Pull the rope toward your face, pulling the ends apart.",
      "Focus on squeezing your rear delts.",
      "Return to the start with control."
    ]
  },
  "Leg Extensions": {
    muscle_group: "Legs",
    youtube_id: "YyvSfVLYd80",
    gif_url: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Leg-Extension.gif",
    muscle_map_image: "https://fitnessprogramer.com/wp-content/uploads/2021/02/quadriceps.png",
    primary_muscle: "Quads",
    secondary_muscles: [],
    instructions: [
      "Sit on the machine with your legs under the pad.",
      "Extend your legs until they are straight.",
      "Squeeze your quads at the top.",
      "Lower the weight back slowly."
    ]
  },
  "Goblet Squat": {
    muscle_group: "Legs",
    youtube_id: "MeIiIdhfXTs",
    gif_url: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Dumbbell-Goblet-Squat.gif",
    muscle_map_image: "https://fitnessprogramer.com/wp-content/uploads/2021/02/quadriceps.png",
    primary_muscle: "Quads",
    secondary_muscles: ["Glutes", "Hamstrings"],
    instructions: [
      "Hold a dumbbell or kettlebell close to your chest.",
      "Squat down until your elbows touch your knees.",
      "Keep your back straight and chest up.",
      "Drive back up to the starting position."
    ]
  },
  "Burpees": {
    muscle_group: "Core",
    youtube_id: "auBLPXO8FKI",
    gif_url: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Burpee.gif",
    muscle_map_image: "https://fitnessprogramer.com/wp-content/uploads/2021/02/abs.png",
    primary_muscle: "Full Body",
    secondary_muscles: ["Chest", "Quads", "Core"],
    instructions: [
      "Start in a standing position.",
      "Drop into a squat and kick your feet back into a plank.",
      "Perform a push-up (optional).",
      "Jump your feet back to the squat and jump up explosively."
    ]
  },
  "Bicycle Crunches": {
    muscle_group: "Core",
    youtube_id: "9FGilxCbdz8",
    gif_url: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Bicycle-Crunch.gif",
    muscle_map_image: "https://fitnessprogramer.com/wp-content/uploads/2021/02/abs.png",
    primary_muscle: "Abs",
    secondary_muscles: ["Obliques"],
    instructions: [
      "Lie on your back with hands behind your head.",
      "Bring one knee toward your chest while rotating the opposite elbow toward it.",
      "Switch sides in a pedaling motion.",
      "Keep your core engaged throughout."
    ]
  },
  "Mountain Climbers": {
    muscle_group: "Core",
    youtube_id: "nmwgirgXLYM",
    gif_url: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Mountain-Climber.gif",
    muscle_map_image: "https://fitnessprogramer.com/wp-content/uploads/2021/02/abs.png",
    primary_muscle: "Core",
    secondary_muscles: ["Shoulders", "Cardio"],
    instructions: [
      "Start in a high plank position.",
      "Drive one knee toward your chest, then switch quickly.",
      "Keep your back flat and hips down.",
      "Move as fast as possible while maintaining form."
    ]
  },
  "Arnold Press": {
    muscle_group: "Shoulders",
    youtube_id: "6Z15_WdXmVw",
    gif_url: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Arnold-Press.gif",
    muscle_map_image: "https://fitnessprogramer.com/wp-content/uploads/2021/02/shoulder.png",
    primary_muscle: "Shoulders",
    secondary_muscles: ["Triceps"],
    instructions: [
      "Hold dumbbells in front of your shoulders with palms facing you.",
      "Press the weights up while rotating your palms outward.",
      "Rotate them back as you lower the weights.",
      "Keep the movement smooth and controlled."
    ]
  },
  "Cable Curls": {
    muscle_group: "Arms",
    youtube_id: "AsAVbj7puKo",
    gif_url: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Cable-Curl.gif",
    muscle_map_image: "https://fitnessprogramer.com/wp-content/uploads/2021/02/biceps.png",
    primary_muscle: "Biceps",
    secondary_muscles: ["Forearms"],
    instructions: [
      "Hold a cable bar with an underhand grip.",
      "Curl the bar toward your shoulders while keeping elbows still.",
      "Squeeze your biceps at the top.",
      "Lower the bar back down under control."
    ]
  },
  "Skull Crushers": {
    muscle_group: "Arms",
    youtube_id: "d_KZxkY_0cM",
    gif_url: "https://fitnessprogramer.com/wp-content/uploads/2021/02/Barbell-Skull-Crusher.gif",
    muscle_map_image: "https://fitnessprogramer.com/wp-content/uploads/2021/02/triceps.png",
    primary_muscle: "Triceps",
    secondary_muscles: [],
    instructions: [
      "Lie on a bench holding an EZ bar over your chest.",
      "Lower the bar toward your forehead by bending your elbows.",
      "Keep your upper arms stationary.",
      "Press the bar back up to the start."
    ]
  }
};

export const MUSCLE_GROUPS = ["Chest", "Back", "Legs", "Shoulders", "Arms", "Core"];

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
