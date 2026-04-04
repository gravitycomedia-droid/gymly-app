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
  Timestamp,
} from 'firebase/firestore';
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
export const getGymMembersRealtime = (gymId, callback) => {
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
    callback([]);
  });
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

export { serverTimestamp, Timestamp };
