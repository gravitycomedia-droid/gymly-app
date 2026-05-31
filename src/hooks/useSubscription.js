// src/hooks/useSubscription.js
// Real-time subscription data for the current gym

import { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

/**
 * Returns live subscription data for the current owner's gym.
 * Falls back to PREMIUM for any gym without a subscription doc (existing gyms).
 */
export function useSubscription() {
  const { userDoc } = useAuth();
  const gymId = userDoc?.gym_id;

  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gymId) {
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, 'subscriptions', gymId),
      (snap) => {
        if (snap.exists()) {
          setSubscription({ id: snap.id, ...snap.data() });
        } else {
          // Existing gym without a subscription doc → treat as PREMIUM
          setSubscription({ plan: 'PREMIUM', status: 'active', is_trial: false });
        }
        setLoading(false);
      },
      (err) => {
        console.error('Subscription listener error:', err);
        setSubscription({ plan: 'PREMIUM', status: 'active', is_trial: false });
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [gymId]);

  return { subscription, loading, plan: subscription?.plan ?? 'PREMIUM' };
}
