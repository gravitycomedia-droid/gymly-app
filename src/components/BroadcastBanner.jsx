// src/components/BroadcastBanner.jsx
// Owner-facing platform announcements. Fully additive + fail-safe: renders null
// on any error or when nothing applies, so it can never disturb the dashboard.
// One cached getDocs (no listener, per EFFICIENCY.md O-4); audience filtered
// client-side; dismissal persisted in localStorage per broadcast.

import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../hooks/useSubscription';
import './BroadcastBanner.css';

const DISMISS_KEY = (id) => `bc_dismiss_${id}`;

export default function BroadcastBanner() {
  const { userDoc } = useAuth();
  const { subscription } = useSubscription();
  const gymId = userDoc?.gym_id;
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!gymId) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'broadcasts'),
          where('active', '==', true),
          orderBy('created_at', 'desc'),
          limit(10),
        ));
        const plan = subscription?.plan;
        const status = subscription?.status;
        const now = new Date();
        const applicable = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((b) => {
          const exp = b.expires_at?.toDate ? b.expires_at.toDate() : null;
          if (exp && exp < now) return false;
          if (localStorage.getItem(DISMISS_KEY(b.id))) return false;
          if (b.audience === 'all') return true;
          if (b.audience === 'specific') return Array.isArray(b.gym_ids) && b.gym_ids.includes(gymId);
          if (b.audience === 'plan') return b.plan_filter === plan;
          if (b.audience === 'status') return b.status_filter === status;
          return false;
        });
        if (!cancelled) setItems(applicable);
      } catch (e) {
        if (import.meta.env.DEV) console.error('Broadcast load failed:', e);
        // Fail silent — never disturb the dashboard.
      }
    })();
    return () => { cancelled = true; };
  }, [gymId, subscription?.plan, subscription?.status]);

  if (items.length === 0) return null;

  const dismiss = (id) => {
    try { localStorage.setItem(DISMISS_KEY(id), '1'); } catch { /* ignore */ }
    setItems((prev) => prev.filter((b) => b.id !== id));
  };

  return (
    <div className="bc-wrap">
      {items.map((b) => (
        <div key={b.id} className="bc-banner">
          <span className="material-symbols-outlined bc-icon">campaign</span>
          <div className="bc-content">
            <strong>{b.title}</strong>
            <p>{b.body}</p>
          </div>
          <button className="bc-x" onClick={() => dismiss(b.id)} aria-label="Dismiss">✕</button>
        </div>
      ))}
    </div>
  );
}
