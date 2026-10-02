// src/firebase/firestore-bio.js
// Biometric (fingerprint device) data access for the owner app.
//
// Every write goes through a Cloud Function — the bio_* collections and
// gym_settings are client-read-only (and templates/commands are not readable
// at all). Reads here are scoped by gym_id so they satisfy the rules.

import { httpsCallable } from 'firebase/functions';
import {
  collection, doc, getDoc, getDocs, onSnapshot, query, where, orderBy, limit,
} from 'firebase/firestore';
import { db, functions } from './config';

const call = (name) => async (data) => (await httpsCallable(functions, name)(data)).data;

// ── Callables ───────────────────────────────────────────────────────────────
export const setAttendanceMode = call('setAttendanceMode');     // { mode: 'qr' | 'biometric' }
export const extendMembership = call('extendMembership');       // { memberId, days, reason }
export const claimBioDevice = call('claimBioDevice');           // { sn, label }
export const syncBioDevice = call('syncBioDevice');             // { sn }
export const setBioDeviceStatus = call('setBioDeviceStatus');   // { sn, status }
export const requestBioEnroll = call('requestBioEnroll');       // { memberId, sn, fingerIndex }

// ── Reads ───────────────────────────────────────────────────────────────────
/** gym_settings/{gymId}.attendance_mode — owner/manager only; anyone else gets 'qr'. */
export const getAttendanceMode = async (gymId) => {
  try {
    const snap = await getDoc(doc(db, 'gym_settings', gymId));
    const mode = snap.exists() ? snap.data().attendance_mode : null;
    return mode === 'biometric' ? 'biometric' : 'qr';
  } catch {
    return 'qr';
  }
};

const sortByLabel = (list) => list.sort((a, b) => (a.label || a.sn).localeCompare(b.label || b.sn));

/** All of the gym's devices, live (claim wizard + device cards). */
export const watchBioDevices = (gymId, callback, onError) => onSnapshot(
  query(collection(db, 'bio_devices'), where('gym_id', '==', gymId)),
  (snap) => callback(sortByLabel(snap.docs.map((d) => ({ sn: d.id, ...d.data() })))),
  (err) => { console.error('bio_devices listener:', err); onError?.(err); },
);

/** One-time read of the gym's devices (member profile — no listener needed). */
export const getBioDevices = async (gymId) => {
  const snap = await getDocs(query(collection(db, 'bio_devices'), where('gym_id', '==', gymId)));
  return sortByLabel(snap.docs.map((d) => ({ sn: d.id, ...d.data() })));
};

/** The member's enrollment doc (bioPin, fingers, enroll state), live. */
export const watchMemberEnrollment = (gymId, memberId, callback) => onSnapshot(
  query(collection(db, 'bio_enrollments'), where('gym_id', '==', gymId), where('memberId', '==', memberId), limit(1)),
  (snap) => callback(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() }),
  (err) => { console.error('bio_enrollments listener:', err); callback(null); },
);

/** Most recent punches from PINs that matched no member (debug list). */
export const getUnmatchedPunches = async (gymId, max = 20) => {
  const snap = await getDocs(query(
    collection(db, 'bio_unmatched_punches'),
    where('gym_id', '==', gymId),
    orderBy('at', 'desc'),
    limit(max),
  ));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

// ── Helpers shared by the screens ───────────────────────────────────────────
export const BIOMETRIC_PLANS = ['PREMIUM', 'PREMIUM_PLUS'];
export const ONLINE_WINDOW_MS = 3 * 60 * 1000;

const ms = (ts) => (ts?.toMillis ? ts.toMillis() : ts ? new Date(ts).getTime() : 0);

/** 'waiting' | 'online' | 'offline' | 'disabled' */
export const deviceState = (device, now = Date.now()) => {
  if (!device) return 'waiting';
  if (device.status === 'disabled') return 'disabled';
  if (device.status !== 'active') return 'waiting';
  return now - ms(device.lastSeenAt) < ONLINE_WINDOW_MS ? 'online' : 'offline';
};

export const lastSeenText = (ts) => {
  const t = ms(ts);
  if (!t) return 'Never';
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

// ZKTeco finger numbering (FID 0-9): 0-4 left little → left thumb, 5-9 right thumb → right little.
export const FINGERS = [
  [6, 'Right index'], [5, 'Right thumb'], [7, 'Right middle'], [8, 'Right ring'], [9, 'Right little'],
  [3, 'Left index'], [4, 'Left thumb'], [2, 'Left middle'], [1, 'Left ring'], [0, 'Left little'],
];
