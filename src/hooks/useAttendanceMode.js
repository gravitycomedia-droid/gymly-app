// src/hooks/useAttendanceMode.js
// The gym's attendance mode ('qr' | 'biometric', D1) for hiding QR/kiosk UI.
//
// One getDoc per gym per session, shared by every screen through a module
// cache — the owner shell remounts on each route, so a listener per mount
// would cost a read per navigation. When the owner flips the mode,
// setCachedAttendanceMode() updates every mounted user instantly.
// Roles that can't read gym_settings (receptionist, trainer) get 'qr'.

import { useEffect, useSyncExternalStore } from 'react';
import { getAttendanceMode } from '../firebase/firestore-bio';

const cache = new Map();      // gymId → 'qr' | 'biometric'
const inflight = new Set();   // gymIds being fetched
const listeners = new Set();

const notify = () => listeners.forEach((fn) => fn());
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function setCachedAttendanceMode(gymId, mode) {
  cache.set(gymId, mode);
  notify();
}

function load(gymId) {
  if (!gymId || cache.has(gymId) || inflight.has(gymId)) return;
  inflight.add(gymId);
  getAttendanceMode(gymId).then((m) => {
    inflight.delete(gymId);
    setCachedAttendanceMode(gymId, m);
  });
}

export default function useAttendanceMode(gymId) {
  const mode = useSyncExternalStore(subscribe, () => (gymId ? cache.get(gymId) ?? null : null));
  useEffect(() => { load(gymId); }, [gymId]);
  return { mode: mode || 'qr', loading: mode == null, isBiometric: mode === 'biometric' };
}
