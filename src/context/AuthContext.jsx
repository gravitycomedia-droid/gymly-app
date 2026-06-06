import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/config';
import { getUser, getGym, updateUser } from '../firebase/firestore';
import { ROLE_PERMISSIONS } from '../utils/permissions';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userDoc, setUserDoc] = useState(null);
  const [gymDoc, setGymDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const tokenRefreshed = useRef(false);

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

  const refreshUserDoc = async (uid) => {
    try {
      const doc = await getUser(uid);
      setUserDoc(doc);
      if (doc?.gym_id) await refreshGymDoc(doc.gym_id);
      return doc;
    } catch (err) {
      if (import.meta.env.DEV) console.error('Error fetching user doc:', err);
      setUserDoc(null);
      return null;
    }
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
        const fetchedDoc = await refreshUserDoc(firebaseUser.uid);

        // Heal missing custom claims: if the user doc has gym_id but the JWT
        // doesn't, the onUserWrite Cloud Function never ran for this account.
        // Writing last_active to their own doc re-triggers it (allowed by
        // "request.auth.uid == uid" in the update rule), then we get a fresh token.
        if (fetchedDoc?.gym_id) {
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
        setUserDoc(null);
        setGymDoc(null);
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
    loading,
    refreshUserDoc,
    refreshGymDoc,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
