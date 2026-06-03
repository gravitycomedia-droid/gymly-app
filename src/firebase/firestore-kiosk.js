import {
  collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from './config';

// ─── Kiosk Devices ───────────────────────────────────────────────

/** Listen to all kiosk devices for a gym in realtime */
export const getKioskDevicesRealtime = (gymId, callback) => {
  const q = query(
    collection(db, 'kiosk_devices'),
    where('gymId', '==', gymId)
  );
  return onSnapshot(q, (snap) => {
    const devices = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Sort descending by createdAt in JS to avoid index/timestamp cache issues
    devices.sort((a, b) => {
      const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
      const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
      return tB - tA;
    });
    callback(devices);
  });
};

/** Create a new kiosk device and generate a 6-digit pairing code */
export const createKioskDevice = async (gymId, { name, mode, location }) => {
  const pairingCode = Math.floor(100000 + Math.random() * 900000).toString();
  const pairingExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  const newDocRef = doc(collection(db, 'kiosk_devices'));
  await setDoc(newDocRef, {
    gymId: gymId || '',
    name: name || '',
    mode: mode || 'both',
    location: location || '',
    status: 'pairing',
    pairingCode,
    pairingExpiry: Timestamp.fromDate(pairingExpiry), // Must be Timestamp so .toDate() works in pairDeviceByCode
    createdAt: serverTimestamp(),
  });

  return { deviceId: newDocRef.id, pairingCode };
};

/** Regenerate pairing code for an existing device */
export const regeneratePairingCode = async (deviceId) => {
  const pairingCode = Math.floor(100000 + Math.random() * 900000).toString();
  const pairingExpiry = new Date(Date.now() + 5 * 60 * 1000);
  await updateDoc(doc(db, 'kiosk_devices', deviceId), {
    pairingCode,
    pairingExpiry: Timestamp.fromDate(pairingExpiry),
    status: 'pairing',
  });
  return pairingCode;
};

/** Update device fields (name, mode, location, status, etc.) */
export const updateKioskDevice = async (deviceId, data) => {
  await updateDoc(doc(db, 'kiosk_devices', deviceId), data);
};

/** Delete a kiosk device */
export const deleteKioskDevice = async (deviceId) => {
  await deleteDoc(doc(db, 'kiosk_devices', deviceId));
};

/**
 * Pair a kiosk device by 6-digit code.
 * Returns the device data on success, throws on invalid/expired code.
 */
export const pairDeviceByCode = async (code) => {
  const q = query(
    collection(db, 'kiosk_devices'),
    where('pairingCode', '==', code.trim()),
    where('status', '==', 'pairing')
  );
  const snap = await getDocs(q);

  if (snap.empty) throw new Error('Invalid code. Ask your gym owner to generate a new code.');

  const deviceDoc = snap.docs[0];
  const data = deviceDoc.data();

  const expiry = data.pairingExpiry?.toDate ? data.pairingExpiry.toDate() : null;
  if (!expiry || expiry < new Date()) {
    throw new Error('Code has expired. Ask your gym owner to regenerate it.');
  }

  await updateDoc(deviceDoc.ref, {
    status: 'active',
    pairingCode: null,
    pairingExpiry: null,
    lastSeen: serverTimestamp(),
  });

  return { deviceId: deviceDoc.id, ...data };
};

// ─── Attendance Sessions ──────────────────────────────────────────

/** Create an entry session (member just scanned in) */
export const createAttendanceSession = async ({ memberId, gymId, entryDeviceId, memberName }) => {
  const ref = await addDoc(collection(db, 'attendance_sessions'), {
    memberId,
    gymId,
    memberName: memberName || '',
    entryTime: serverTimestamp(),
    exitTime: null,
    durationMinutes: null,
    entryDeviceId,
    exitDeviceId: null,
    status: 'inside',
    createdAt: serverTimestamp(),
  });
  return ref.id;
};

/** Update an existing session with exit time (exit kiosk) */
export const completeAttendanceSession = async (sessionId, { exitDeviceId, durationMinutes }) => {
  await updateDoc(doc(db, 'attendance_sessions', sessionId), {
    exitTime: serverTimestamp(),
    durationMinutes,
    exitDeviceId,
    status: 'completed',
  });
};

/**
 * Find the most recent "inside" session for a member.
 * Used by exit kiosk.
 */
export const findActiveSession = async (memberId, gymId) => {
  const q = query(
    collection(db, 'attendance_sessions'),
    where('memberId', '==', memberId),
    where('gymId', '==', gymId),
    where('status', '==', 'inside'),
    orderBy('entryTime', 'desc'),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
};

/**
 * Live count of members currently inside.
 * Calls callback with the count whenever it changes.
 */
export const getLiveOccupancy = (gymId, callback) => {
  const q = query(
    collection(db, 'attendance_sessions'),
    where('gymId', '==', gymId),
    where('status', '==', 'inside')
  );
  return onSnapshot(q, (snap) => {
    callback(snap.size, snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
};

/**
 * Fetch attendance sessions for analytics (date range).
 */
export const getAttendanceSessions = async (gymId, startDate, endDate) => {
  const q = query(
    collection(db, 'attendance_sessions'),
    where('gymId', '==', gymId),
    where('entryTime', '>=', Timestamp.fromDate(startDate)),
    where('entryTime', '<=', Timestamp.fromDate(endDate)),
    orderBy('entryTime', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

// ─── Access Denied Logs ───────────────────────────────────────────

export const createAccessDeniedLog = async ({ memberId, gymId, deviceId, reason, memberName, memberPhone }) => {
  await addDoc(collection(db, 'access_denied_logs'), {
    memberId,
    gymId,
    deviceId,
    attemptTime: serverTimestamp(),
    reason, // "expired" | "not_found" | "already_inside"
    memberName,
    memberPhone: memberPhone || '',
  });
};

export const getAccessDeniedLogs = async (gymId, startDate, endDate) => {
  const q = query(
    collection(db, 'access_denied_logs'),
    where('gymId', '==', gymId),
    where('attemptTime', '>=', Timestamp.fromDate(startDate)),
    where('attemptTime', '<=', Timestamp.fromDate(endDate)),
    orderBy('attemptTime', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};
