import { useState, useEffect } from 'react';
import {
  collection, query, where, onSnapshot, getDocs,
  orderBy, limit, doc, getCountFromServer,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import useLiveOccupancy from '../../hooks/useLiveOccupancy';
import useNewLeadsCount from '../../hooks/useNewLeadsCount';

// Ports the exact data-fetching strategy from src/pages/OwnerDashboard/OwnerDashboard.jsx:
// a CF-managed stats/summary doc for revenue (fast, may lag slightly), plus live
// getCountFromServer counts for member cards (always accurate), plus 3 small
// limited queries for the recent/expiring rails. Same collections, same shape.
export default function useDashboardData(gymId) {
  const [stats, setStats] = useState(null);
  const [memberCounts, setMemberCounts] = useState(null);
  const [recentMembers, setRecentMembers] = useState([]);
  const [expiringMembers, setExpiringMembers] = useState([]);
  const [recentPayments, setRecentPayments] = useState([]);
  const { occupancy } = useLiveOccupancy(gymId);
  const newLeadsCount = useNewLeadsCount(gymId);

  useEffect(() => {
    if (!gymId) return;
    const statsRef = doc(db, 'gyms', gymId, 'stats', 'summary');
    const unsub = onSnapshot(statsRef, (snap) => { if (snap.exists()) setStats(snap.data()); }, (err) => console.error('Stats listener error:', err));
    return () => unsub();
  }, [gymId]);

  useEffect(() => {
    if (!gymId) return;
    const q = query(collection(db, 'users'), where('gym_id', '==', gymId), where('role', '==', 'member'), orderBy('created_at', 'desc'), limit(5));
    getDocs(q).then((snap) => setRecentMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() })))).catch((err) => console.error('Dashboard query error:', err));
  }, [gymId]);

  useEffect(() => {
    if (!gymId) return;
    const now = new Date();
    const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const q = query(
      collection(db, 'users'), where('gym_id', '==', gymId), where('role', '==', 'member'),
      where('subscription_expiry', '>', now), where('subscription_expiry', '<=', in7d), limit(10)
    );
    getDocs(q).then((snap) => setExpiringMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() })))).catch((err) => console.error('Dashboard query error:', err));
  }, [gymId]);

  useEffect(() => {
    if (!gymId) return;
    const q = query(collection(db, 'payments'), where('gym_id', '==', gymId), orderBy('payment_date', 'desc'), limit(5));
    getDocs(q).then((snap) => setRecentPayments(snap.docs.map((d) => ({ id: d.id, ...d.data() })))).catch((err) => console.error('Dashboard query error:', err));
  }, [gymId]);

  useEffect(() => {
    if (!gymId) return;
    const fetchCounts = () => {
      const now = new Date();
      const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const membersRef = collection(db, 'users');
      const base = [where('gym_id', '==', gymId), where('role', '==', 'member')];
      Promise.allSettled([
        getCountFromServer(query(membersRef, ...base)),
        getCountFromServer(query(membersRef, ...base, where('subscription_expiry', '>', now))),
        getCountFromServer(query(membersRef, ...base, where('subscription_expiry', '>', now), where('subscription_expiry', '<=', in7d))),
        getCountFromServer(query(membersRef, ...base, where('subscription_expiry', '<=', now))),
      ]).then(([totR, actR, expR, expdR]) => {
        setMemberCounts({
          total_members: totR.status === 'fulfilled' ? totR.value.data().count : 0,
          active_members: actR.status === 'fulfilled' ? actR.value.data().count : 0,
          expiring_7d: expR.status === 'fulfilled' ? expR.value.data().count : 0,
          expired_members: expdR.status === 'fulfilled' ? expdR.value.data().count : 0,
        });
      }).catch(() => {});
    };
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(fetchCounts, { timeout: 2000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(fetchCounts, 200);
    return () => clearTimeout(id);
  }, [gymId]);

  return {
    totalCount: memberCounts?.total_members ?? stats?.total_members ?? 0,
    activeCount: memberCounts?.active_members ?? stats?.active_members ?? 0,
    expiringCount: memberCounts?.expiring_7d ?? stats?.expiring_7d ?? 0,
    expiredCount: memberCounts?.expired_members ?? stats?.expired_members ?? 0,
    collectedThisMonth: stats?.month_revenue ?? 0,
    pendingDues: stats?.pending_dues ?? 0,
    occupancy,
    newLeadsCount,
    recentMembers,
    expiringMembers,
    recentPayments,
  };
}
