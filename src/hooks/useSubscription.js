// src/hooks/useSubscription.js
// Real-time subscription data for the current gym

import { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { setAnalyticsUser } from '../lib/analytics';

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

  // Report plan_tier from the listener that already exists rather than opening
  // a second one — plan lives at subscriptions/{gymId}, which resolves well
  // after auth, so it is sent as a partial update on top of the identity set in
  // AnalyticsTracker.
  const plan = subscription?.plan;
  useEffect(() => {
    if (plan) setAnalyticsUser({ plan_tier: plan });
  }, [plan]);

  return { subscription, loading, plan: subscription?.plan ?? 'PREMIUM' };
}
