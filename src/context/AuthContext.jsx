import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { getDoc, doc } from 'firebase/firestore';
import { auth, functions, db } from '../firebase/config';
import { getUser, getGym, updateUser, linkMemberships } from '../firebase/firestore';
import { ROLE_PERMISSIONS } from '../utils/permissions';

const AuthContext = createContext();

// Which gym membership a multi-gym member last chose, keyed by Auth UID so
// switching accounts on a shared device can't cross the wires.
const activeMembershipKey = (uid) => `gymly_active_membership:${uid}`;

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userDoc, setUserDoc] = useState(null);
  const [gymDoc, setGymDoc] = useState(null);
  const [superAdmin, setSuperAdmin] = useState(false);
  // Multi-gym member who hasn't picked a gym this session — the list of their
  // memberships, so AutoRedirect can route them to the gym picker instead of
  // owner registration.
  const [pendingGymSelection, setPendingGymSelection] = useState(null);
  const [loading, setLoading] = useState(true);
  // For multi-gym members, the membership doc id currently in session. When set,
  // the member's profile lives at users/{activeMembershipId}, NOT users/{uid}.
  const activeMembershipRef = useRef(null);

  const refreshGymDoc = async (gymId) => {
    if (!gymId) return null;
    try {
      const gym = await getGym(gymId);
      setGymDoc(gym);
      return gym;
    } catch {
      return null;
    }
  };

  // Loads a specific membership document and makes it the session profile.
  // Verifies the doc is actually linked to this member before trusting it.
  const loadMembershipDoc = async (uid, membershipId) => {
    if (!membershipId) return null;
    try {
      const snap = await getDoc(doc(db, 'users', membershipId));
      if (!snap.exists()) return null;
      const data = { id: snap.id, ...snap.data() };
      if (data.auth_uid !== uid || data.role !== 'member') return null;
      setUserDoc(data);
      setPendingGymSelection(null);
      if (data.gym_id) await refreshGymDoc(data.gym_id);
      return data;
    } catch (err) {
      if (import.meta.env.DEV) console.error('Error loading membership doc:', err);
      return null;
    }
  };

  // Refreshes whichever document is backing the session — the active membership
  // for multi-gym members, or users/{uid} for owners/staff/legacy accounts.
  const refreshUserDoc = async (uid) => {
    if (activeMembershipRef.current) {
      return loadMembershipDoc(uid, activeMembershipRef.current);
    }
    try {
      const fetched = await getUser(uid);
      setUserDoc(fetched);
      if (fetched?.gym_id) await refreshGymDoc(fetched.gym_id);
      return fetched;
    } catch (err) {
      if (import.meta.env.DEV) console.error('Error fetching user doc:', err);
      setUserDoc(null);
      return null;
    }
  };

  // Called from the login gym picker (and "switch gym"). Mints the gym_id claim
  // for the chosen membership, refreshes the token, then loads that profile.
  const setActiveMembership = async (uid, membershipId) => {
    activeMembershipRef.current = membershipId;
    try {
      localStorage.setItem(activeMembershipKey(uid), membershipId);
    } catch { /* private mode — non-critical */ }

    try {
      const setClaim = httpsCallable(functions, 'setActiveGymClaim');
      await setClaim({ membershipId });
      // Pull the new role/gym_id claims into the SDK's cached token so
      // subsequent gym-isolated reads (payments, attendance) are authorized.
      if (auth?.currentUser) await auth.currentUser.getIdToken(true);
    } catch (err) {
      if (import.meta.env.DEV) console.error('setActiveGymClaim failed:', err);
    }
    return loadMembershipDoc(uid, membershipId);
  };

  // Polls for a custom claim to land on the ID token, force-refreshing each
  // attempt (claims never appear on a cached token). Backoff delays sum to
  // 2000ms — the same worst-case ceiling as the fixed sleep this replaces —
  // but resolves as soon as the claim shows up instead of always waiting the
  // full duration.
  const waitForClaim = async (firebaseUser, claimKey, delays = [150, 300, 600, 950]) => {
    for (const delay of delays) {
      await new Promise((r) => setTimeout(r, delay));
      try {
        const tr = await firebaseUser.getIdTokenResult(true);
        if (tr.claims[claimKey]) return tr;
      } catch { /* ignore — retry */ }
    }
    return null;
  };

  useEffect(() => {
    if (import.meta.env.DEV) {
      const mockRole = localStorage.getItem('mockRole');
      if (mockRole) {
        const nameMap = {
          owner: 'John Gymly (Owner)',
          manager: 'Rahul Manager',
          trainer: 'Coach Vicky',
          receptionist: 'Sarah Receptionist',
          member: 'Alex Mercer (Member)',
          admin: 'Super Admin'
        };
        setUser({ uid: `mock_${mockRole}`, email: `${mockRole}@gymly.com` });
        setUserDoc({
          id: `mock_${mockRole}`,
          uid: `mock_${mockRole}`,
          name: nameMap[mockRole] || 'Mock User',
          role: mockRole,
          gym_id: 'mock_gym_123',
          phone: '9876543210',
          plan_id: 'plan4',
          plan_name: 'Platinum Plan',
          subscription_expiry: {
            toDate: () => new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
          },
          profile_photo: '',
          permissions: ROLE_PERMISSIONS[mockRole] || []
        });
        setSuperAdmin(mockRole === 'admin');
        setLoading(false);
        refreshGymDoc('mock_gym_123');
        return;
      }
    }

    if (!auth) {
      console.warn('Firebase Auth not initialized.');
      setLoading(false);
      return;
    }

    const authUnsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        // Read the cached token first — no forced network round trip on every
        // login. A forced refresh only happens below, and only for the one
        // case where a just-created account's custom claims haven't landed yet.
        let claims = {};
        try {
          const tr = await firebaseUser.getIdTokenResult();
          claims = tr.claims;
          setSuperAdmin(claims.super_admin === true);
        } catch { setSuperAdmin(false); }

        // Owners/staff/legacy accounts have their profile at users/{uid}. Fetch
        // it alongside the gym doc (using the token's gym_id claim, if present)
        // instead of waiting for the user-doc round trip to learn the same id.
        const [fetchedDoc] = await Promise.all([
          getUser(firebaseUser.uid).catch(() => null),
          claims.gym_id ? refreshGymDoc(claims.gym_id) : Promise.resolve(null),
        ]);

        if (fetchedDoc) {
          activeMembershipRef.current = null;
          setUserDoc(fetchedDoc);
          // Only re-fetch if the doc's gym_id disagrees with the claim we
          // already used above — avoids a redundant read in the common case.
          if (fetchedDoc.gym_id && fetchedDoc.gym_id !== claims.gym_id) {
            await refreshGymDoc(fetchedDoc.gym_id);
          }

          // Heal missing custom claims: if the user doc has gym_id but the JWT
          // doesn't, the onUserWrite Cloud Function never ran for this account.
          // Writing last_active to their own doc re-triggers it (allowed by
          // "request.auth.uid == uid" in the update rule), then poll for the
          // claim to land instead of blindly waiting a fixed 2s.
          if (fetchedDoc.gym_id && !claims.gym_id) {
            try {
              await updateUser(firebaseUser.uid, { last_active: new Date().toISOString() }).catch(() => {});
              await waitForClaim(firebaseUser, 'gym_id');
              await refreshUserDoc(firebaseUser.uid);
            } catch { /* ignore — non-critical */ }
          }
        } else {
          // No users/{uid} doc. This is a random-id account — either staff
          // (manager/receptionist/trainer) or a member (one doc per gym).

          // 1. Staff resolution first. resolveStaffLogin finds the staff doc by
          // the verified phone, links auth_uid and mints role/gym_id claims;
          // returns { found:false } for non-staff so members fall through.
          let staffResolved = false;
          try {
            const resolveStaff = httpsCallable(functions, 'resolveStaffLogin');
            const { data: staffRes } = await resolveStaff();
            if (staffRes?.found) {
              // Pull the freshly-minted role/gym_id claim into the cached token
              // so the staff doc read below (gym-scoped) is authorized.
              await firebaseUser.getIdToken(true).catch(() => {});
              const snap = await getDoc(doc(db, 'users', staffRes.staffDocId));
              if (snap.exists()) {
                activeMembershipRef.current = null;
                setUserDoc({ id: snap.id, ...snap.data() });
                setPendingGymSelection(null);
                if (staffRes.gym_id) await refreshGymDoc(staffRes.gym_id);
                staffResolved = true;
              }
            }
          } catch (err) {
            if (import.meta.env.DEV) console.error('resolveStaffLogin failed:', err);
          }

          if (staffResolved) {
            setLoading(false);
            return;
          }

          // 2. Member — profile is a random-id doc linked via auth_uid (there may
          // be one per gym). Restore the gym they last selected on this device.
          let restored = null;
          try {
            const saved = localStorage.getItem(activeMembershipKey(firebaseUser.uid));
            if (saved) {
              activeMembershipRef.current = saved;
              restored = await loadMembershipDoc(firebaseUser.uid, saved);
            }
          } catch { /* ignore */ }

          if (!restored) {
            // No valid saved selection (new device, cleared storage, or an
            // interrupted first login). Rediscover memberships from the phone
            // on the auth token so we never strand a member on owner signup.
            activeMembershipRef.current = null;
            setUserDoc(null);
            setGymDoc(null);
            const phone = firebaseUser.phoneNumber;
            if (phone) {
              try {
                const list = await linkMemberships(firebaseUser.uid, phone);
                if (list.length === 1) {
                  await setActiveMembership(firebaseUser.uid, list[0].id);
                } else if (list.length > 1) {
                  // Prefer active memberships at the top of the picker.
                  setPendingGymSelection(
                    [...list].sort((a, b) => (b.active === true) - (a.active === true))
                  );
                } else {
                  setPendingGymSelection(null);
                }
              } catch { /* non-critical — login flow can still resolve it */ }
            }
          }
        }
      } else {
        activeMembershipRef.current = null;
        setUserDoc(null);
        setGymDoc(null);
        setSuperAdmin(false);
        setPendingGymSelection(null);
      }
      setLoading(false);
    });

    return () => authUnsubscribe();
  }, []);

  const value = {
    user,
    userDoc,
    gymDoc,
    superAdmin,
    loading,
    pendingGymSelection,
    refreshUserDoc,
    refreshGymDoc,
    setActiveMembership,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
