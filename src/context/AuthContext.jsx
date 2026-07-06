import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions, db } from '../firebase/config';
import { getUser, getGym, updateUser, getDoc, doc, linkMemberships } from '../firebase/firestore';
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
  const tokenRefreshed = useRef(false);
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
        // Refresh token once per login to pick up custom claims (gym_id, role).
        // Must be awaited so components never mount with a stale token.
        if (!tokenRefreshed.current) {
          tokenRefreshed.current = true;
          await firebaseUser.getIdToken(true).catch(() => {});
        }

        // Read the super_admin platform claim from the (refreshed) token.
        try {
          const tr = await firebaseUser.getIdTokenResult();
          setSuperAdmin(tr.claims.super_admin === true);
        } catch { setSuperAdmin(false); }

        // Owners/staff/legacy accounts have their profile at users/{uid}.
        const fetchedDoc = await getUser(firebaseUser.uid).catch(() => null);

        if (fetchedDoc) {
          activeMembershipRef.current = null;
          setUserDoc(fetchedDoc);
          if (fetchedDoc.gym_id) await refreshGymDoc(fetchedDoc.gym_id);

          // Heal missing custom claims: if the user doc has gym_id but the JWT
          // doesn't, the onUserWrite Cloud Function never ran for this account.
          // Writing last_active to their own doc re-triggers it (allowed by
          // "request.auth.uid == uid" in the update rule), then we get a fresh token.
          if (fetchedDoc.gym_id) {
            try {
              const tokenResult = await firebaseUser.getIdTokenResult();
              if (!tokenResult.claims.gym_id) {
                await updateUser(firebaseUser.uid, { last_active: new Date().toISOString() }).catch(() => {});
                await new Promise(r => setTimeout(r, 2000));
                await firebaseUser.getIdToken(true).catch(() => {});
                await refreshUserDoc(firebaseUser.uid);
              }
            } catch { /* ignore — non-critical */ }
          }
        } else {
          // Member — profile is a random-id doc linked via auth_uid (there may
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
        tokenRefreshed.current = false;
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
