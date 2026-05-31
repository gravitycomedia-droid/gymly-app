import { 
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  onSnapshot,
  serverTimestamp,
  increment,
  Timestamp 
} from 'firebase/firestore';

export { 
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  onSnapshot,
  serverTimestamp,
  increment,
  Timestamp 
};
import { db } from './config';

// ─── Users ───

export const getUser = async (uid) => {
  if (!db) return null;
  const docRef = doc(db, 'users', uid);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() };
  }
  return null;
};

export const createUser = async (uid, data) => {
  const docRef = doc(db, 'users', uid);
  await setDoc(docRef, {
    ...data,
    created_at: serverTimestamp(),
  });
};

export const updateUser = async (uid, data) => {
  const docRef = doc(db, 'users', uid);
  await updateDoc(docRef, data);
};

export const deleteUser = async (uid) => {
  const docRef = doc(db, 'users', uid);
  await deleteDoc(docRef);
};

// ─── Gyms ───

export const createGym = async (data) => {
  const docRef = await addDoc(collection(db, 'gyms'), {
    ...data,
    created_at: serverTimestamp(),
  });
  return docRef.id;
};

export const getGym = async (gymId) => {
  if (!db) return null;
  const docRef = doc(db, 'gyms', gymId);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() };
  }
  return null;
};

export const updateGym = async (gymId, data) => {
  const docRef = doc(db, 'gyms', gymId);
  await updateDoc(docRef, data);
};

// ─── Members ───

/**
 * Get gym members (one-time fetch) with optional pagination.
 */
export const getGymMembers = async (gymId, lastDoc = null, pageSize = 20) => {
  const constraints = [
    where('gym_id', '==', gymId),
    where('role', '==', 'member'),
    orderBy('created_at', 'desc'),
    limit(pageSize),
  ];

  if (lastDoc) {
    constraints.push(startAfter(lastDoc));
  }

  const q = query(collection(db, 'users'), ...constraints);
  const snapshot = await getDocs(q);

  const members = [];
  snapshot.forEach((doc) => {
    members.push({ id: doc.id, ...doc.data(), _doc: doc });
  });

  return {
    members,
    lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
    hasMore: snapshot.docs.length === pageSize,
  };
};

/**
 * Real-time listener for all gym members.
 * Returns unsubscribe function.
 */
export const getGymMembersRealtime = (gymId, callback, onError) => {
  const q = query(
    collection(db, 'users'),
    where('gym_id', '==', gymId),
    where('role', '==', 'member'),
    orderBy('created_at', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const members = [];
    snapshot.forEach((doc) => {
      members.push({ id: doc.id, ...doc.data() });
    });
    callback(members);
  }, (error) => {
    console.error('Members realtime error:', error);
    if (onError) onError(error);
    callback([]);
  });
};

/**
 * Links an owner-created member document (random ID) to the actual Firebase Auth UID
 * which is generated when the member logs in via Phone Auth for the first time.
 */
export const linkMemberAccount = async (uid, phone) => {
  const q = query(collection(db, 'users'), where('phone', '==', phone), limit(1));
  const snap = await getDocs(q);
  
  if (snap.empty) {
    return 'not_found';
  }

  const oldDocSnap = snap.docs[0];
  const oldDocId = oldDocSnap.id;
  
  // If the doc ID is already the UID, no need to link
  if (oldDocId === uid) return 'already_linked';

  const data = oldDocSnap.data();
  
  // Create new doc with real UID
  await setDoc(doc(db, 'users', uid), {
    ...data,
    auth_uid: uid,
    linked_at: serverTimestamp(),
  });
  
  // Delete the old unauthenticated document
  await deleteDoc(doc(db, 'users', oldDocId));
  
  return 'migrated';
};

/**
 * Create a new member document.
 */
export const createMember = async (data) => {
  const docRef = await addDoc(collection(db, 'users'), {
    ...data,
    created_at: serverTimestamp(),
  });
  return docRef.id;
};

/**
 * Update a member document (partial update).
 */
export const updateMember = async (uid, data) => {
  const docRef = doc(db, 'users', uid);
  await updateDoc(docRef, data);
};

/**
 * Delete a member document.
 */
export const deleteMember = async (uid) => {
  const docRef = doc(db, 'users', uid);
  await deleteDoc(docRef);
};

/**
 * Check if a phone number is already registered in a gym.
 */
export const getMemberByPhone = async (gymId, phone) => {
  const q = query(
    collection(db, 'users'),
    where('gym_id', '==', gymId),
    where('phone', '==', phone)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const first = snapshot.docs[0];
  return { id: first.id, ...first.data() };
};

// ─── Staff ───

/**
 * Get all staff members for a gym.
 */
export const getGymStaff = async (gymId) => {
  const q = query(
    collection(db, 'users'),
    where('gym_id', '==', gymId),
    where('role', 'in', ['manager', 'trainer', 'receptionist']),
    orderBy('created_at', 'desc')
  );
  const snapshot = await getDocs(q);
  const staff = [];
  snapshot.forEach((doc) => {
    staff.push({ id: doc.id, ...doc.data() });
  });
  return staff;
};

/**
 * Create a new staff member.
 */
export const createStaffMember = async (data) => {
  const docRef = await addDoc(collection(db, 'users'), {
    ...data,
    created_at: serverTimestamp(),
  });
  return docRef.id;
};

/**
 * Get all trainers in a gym.
 */
export const getTrainers = async (gymId) => {
  const q = query(
    collection(db, 'users'),
    where('gym_id', '==', gymId),
    where('role', '==', 'trainer')
  );
  const snapshot = await getDocs(q);
  const trainers = [];
  snapshot.forEach((doc) => {
    trainers.push({ id: doc.id, ...doc.data() });
  });
  return trainers;
};

/**
 * Get members assigned to a specific trainer.
 */
export const getAssignedMembers = (gymId, trainerId, callback) => {
  const q = query(
    collection(db, 'users'),
    where('gym_id', '==', gymId),
    where('role', '==', 'member'),
    where('assigned_trainer_id', '==', trainerId)
  );

  return onSnapshot(q, (snapshot) => {
    const members = [];
    snapshot.forEach((doc) => {
      members.push({ id: doc.id, ...doc.data() });
    });
    callback(members);
  }, (error) => {
    console.error('Assigned members error:', error);
    callback([]);
  });
};

/**
 * Mark attendance for a member.
 */
export const markAttendance = async (uid) => {
  const docRef = doc(db, 'users', uid);
  await updateDoc(docRef, {
    last_seen: serverTimestamp(),
    attendance_count: increment(1),
  });
};

// ─── Workout Plans ───

export const getWorkoutPlans = async (gymId = null) => {
  const constraints = gymId
    ? [where('gym_id', 'in', [gymId, null]), where('is_active', '==', true)]
    : [where('is_active', '==', true)];
  const q = query(collection(db, 'workout_plans'), ...constraints);
  const snap = await getDocs(q);
  const plans = [];
  snap.forEach(d => plans.push({ id: d.id, ...d.data() }));
  return plans;
};

export const getPredefinedPlans = async () => {
  const q = query(
    collection(db, 'workout_plans'),
    where('type', '==', 'predefined'),
    where('created_by', '==', 'system')
  );
  const snap = await getDocs(q);
  const plans = [];
  snap.forEach(d => plans.push({ id: d.id, ...d.data() }));
  return plans;
};

export const getGymCustomPlans = async (gymId) => {
  const q = query(
    collection(db, 'workout_plans'),
    where('gym_id', '==', gymId),
    where('type', '==', 'custom')
  );
  const snap = await getDocs(q);
  const plans = [];
  snap.forEach(d => plans.push({ id: d.id, ...d.data() }));
  return plans;
};

export const getWorkoutPlan = async (planId) => {
  const docSnap = await getDoc(doc(db, 'workout_plans', planId));
  if (docSnap.exists()) return { id: docSnap.id, ...docSnap.data() };
  return null;
};

export const createWorkoutPlan = async (data) => {
  const docRef = await addDoc(collection(db, 'workout_plans'), {
    ...data,
    created_at: serverTimestamp(),
  });
  return docRef.id;
};

export const updateWorkoutPlan = async (planId, data) => {
  await updateDoc(doc(db, 'workout_plans', planId), data);
};

// ─── Workout Days ───

export const getWorkoutDays = async (planId) => {
  const q = query(
    collection(db, 'workout_days'),
    where('plan_id', '==', planId),
    orderBy('day_number', 'asc')
  );
  const snap = await getDocs(q);
  const days = [];
  snap.forEach(d => days.push({ id: d.id, ...d.data() }));
  return days;
};

export const getWorkoutDay = async (planId, dayNumber) => {
  const q = query(
    collection(db, 'workout_days'),
    where('plan_id', '==', planId),
    where('day_number', '==', dayNumber)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const first = snap.docs[0];
  return { id: first.id, ...first.data() };
};

export const createWorkoutDay = async (data) => {
  const docRef = await addDoc(collection(db, 'workout_days'), data);
  return docRef.id;
};

export const updateWorkoutDay = async (dayId, data) => {
  await updateDoc(doc(db, 'workout_days', dayId), data);
};

// ─── Workout Logs ───

export const createWorkoutLog = async (data) => {
  const docRef = await addDoc(collection(db, 'workout_logs'), {
    ...data,
    log_date: serverTimestamp(),
  });
  return docRef.id;
};

export const getMemberWorkoutLogs = async (memberId, limitCount = 10) => {
  const q = query(
    collection(db, 'workout_logs'),
    where('member_id', '==', memberId),
    orderBy('log_date', 'desc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  const logs = [];
  snap.forEach(d => logs.push({ id: d.id, ...d.data() }));
  return logs;
};

export const getWorkoutLog = async (logId) => {
  const docSnap = await getDoc(doc(db, 'workout_logs', logId));
  if (docSnap.exists()) return { id: docSnap.id, ...docSnap.data() };
  return null;
};

export const getMemberTodayLog = async (memberId, planId, dayNumber) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const q = query(
    collection(db, 'workout_logs'),
    where('member_id', '==', memberId),
    where('plan_id', '==', planId),
    where('day_number', '==', dayNumber),
    orderBy('log_date', 'desc'),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const log = { id: snap.docs[0].id, ...snap.docs[0].data() };
  const logDate = log.log_date?.toDate ? log.log_date.toDate() : null;
  if (logDate && logDate >= today && logDate < tomorrow) return log;
  return null;
};

/**
 * Incrementally updates or creates a workout session log.
 * Used for real-time saving as exercises are completed.
 */
export const incrementallyUpdateWorkoutLog = async (memberId, planId, muscleGroup, exerciseData) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Find if a log exists for today/plan
  const q = query(
    collection(db, 'workout_logs'),
    where('member_id', '==', memberId),
    where('plan_id', '==', planId),
    where('day_number', '==', muscleGroup),
    orderBy('log_date', 'desc'),
    limit(1)
  );
  
  const snap = await getDocs(q);
  let logId = null;
  let existingExercises = [];
  let existingCalories = 0;

  if (!snap.empty) {
    const doc = snap.docs[0];
    const logDate = doc.data().log_date?.toDate();
    if (logDate && logDate >= today && logDate < tomorrow) {
      logId = doc.id;
      existingExercises = doc.data().exercises || [];
      existingCalories = doc.data().total_calories || 0;
    }
  }

  // Update or Add the exercise in the array
  const exerciseIdx = existingExercises.findIndex(e => e.id === exerciseData.id);
  let newExercises = [...existingExercises];
  
  if (exerciseIdx >= 0) {
    newExercises[exerciseIdx] = exerciseData;
  } else {
    newExercises.push(exerciseData);
  }

  // Aggregate stats
  const totalCalories = newExercises.reduce((sum, ex) => sum + (ex.calories || 0), 0);

  const data = {
    member_id: memberId,
    plan_id: planId,
    day_number: muscleGroup,
    exercises: newExercises,
    completed_count: newExercises.filter(e => e.completed).length,
    total_calories: totalCalories,
    log_date: serverTimestamp(),
    client_date: new Date().toISOString(),
    is_active: true
  };

  if (logId) {
    await updateDoc(doc(db, 'workout_logs', logId), data);
    return logId;
  } else {
    const docRef = await addDoc(collection(db, 'workout_logs'), data);
    return docRef.id;
  }
};

// ─── Progress Logs ───

export const createProgressLog = async (data) => {
  const docRef = await addDoc(collection(db, 'progress_logs'), {
    ...data,
    logged_at: serverTimestamp(),
  });
  return docRef.id;
};

export const getMemberProgressLogs = async (memberId, limitCount = 50) => {
  const q = query(
    collection(db, 'progress_logs'),
    where('member_id', '==', memberId),
    orderBy('logged_at', 'desc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  const logs = [];
  snap.forEach(d => logs.push({ id: d.id, ...d.data() }));
  return logs;
};

// ─── Member plan helpers ───

export const assignWorkoutPlanToMember = async (memberId, planId) => {
  await updateDoc(doc(db, 'users', memberId), {
    workout_plan_id: planId,
  });
};

export const getPlanByName = async (planName) => {
  const q = query(
    collection(db, 'workout_plans'),
    where('name', '==', planName),
    where('type', '==', 'predefined'),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
};

// ─── Soreness Logs ───

export const saveSorenessLog = async (data) => {
  const docRef = await addDoc(collection(db, 'soreness_logs'), {
    ...data,
    logged_at: serverTimestamp(),
  });
  return docRef.id;
};

export const getRecentMuscleSoreness = async (memberId) => {
  const q = query(
    collection(db, 'soreness_logs'),
    where('member_id', '==', memberId),
    orderBy('logged_at', 'desc'),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
};

// ─── PR System ───

export const checkAndUpdatePR = async (memberId, exerciseId, log) => {
  const prRef = doc(db, 'personal_records', `${memberId}_${exerciseId}`);
  const prSnap = await getDoc(prRef);

  // volume = weight * reps * sets_count
  const weight = log.sets.reduce((max, s) => Math.max(max, parseFloat(s.weight) || 0), 0);
  const volume = log.sets.reduce((sum, s) => sum + ((parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0)), 0);
  const reps = log.sets.reduce((max, s) => Math.max(max, parseInt(s.reps) || 0), 0);

  if (!prSnap.exists()) {
    const prData = {
      member_id: memberId,
      exercise_id: exerciseId,
      exercise_name: log.name || '',
      best_weight: weight,
      best_reps: reps,
      best_volume: volume,
      achieved_at: serverTimestamp(),
      previous_best: null
    };
    await setDoc(prRef, prData);
    return { is_pr: true, type: "first_time", weight, reps, volume };
  }

  const current = prSnap.data();
  const isPRWeight = weight > (current.best_weight || 0);
  const isPRVolume = volume > (current.best_volume || 0);

  if (isPRWeight || isPRVolume) {
    const updateData = {
      best_weight: Math.max(weight, (current.best_weight || 0)),
      best_reps: Math.max(reps, (current.best_reps || 0)),
      best_volume: Math.max(volume, (current.best_volume || 0)),
      achieved_at: serverTimestamp(),
      previous_best: {
        weight: current.best_weight,
        reps: current.best_reps,
        volume: current.best_volume,
        date: current.achieved_at
      }
    };
    await updateDoc(prRef, updateData);
    return { 
      is_pr: true, 
      type: isPRWeight ? "weight_pr" : "volume_pr", 
      improvement: isPRWeight ? weight - current.best_weight : volume - current.best_volume,
      weight, volume 
    };
  }

  return { is_pr: false };
};

export const getMemberPRs = async (memberId) => {
  const q = query(collection(db, 'personal_records'), where('member_id', '==', memberId));
  const snap = await getDocs(q);
  const prs = {};
  snap.forEach(d => { prs[d.data().exercise_id] = d.data(); });
  return prs;
};


