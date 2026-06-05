import { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/config';
import { getUser } from '../firebase/firestore';
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
  const [loading, setLoading] = useState(true);

  const refreshUserDoc = async (uid) => {
    try {
      const doc = await getUser(uid);
      setUserDoc(doc);
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
        try { await firebaseUser.getIdToken(true); } catch {} // pick up custom claims, non-blocking
        await refreshUserDoc(firebaseUser.uid);
      } else {
        setUserDoc(null);
      }
      setLoading(false);
    });

    return () => authUnsubscribe();
  }, []);

  const value = {
    user,
    userDoc,
    loading,
    refreshUserDoc,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
