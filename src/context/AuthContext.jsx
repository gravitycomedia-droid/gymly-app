import { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/config';
import { getUser } from '../firebase/firestore';

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
      console.error('Error fetching user doc:', err);
      setUserDoc(null);
      return null;
    }
  };

  useEffect(() => {
    // If Firebase auth is not initialized, skip the listener
    if (!auth) {
      console.warn('Firebase Auth not initialized. Running without authentication.');
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        await refreshUserDoc(firebaseUser.uid);
      } else {
        setUserDoc(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
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
