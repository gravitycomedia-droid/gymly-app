// src/hooks/useNewLeadsCount.js
// Subscribes to the count of new (unactioned) leads for a gym.

import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';

const useNewLeadsCount = (gymId) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!gymId) return;
    if (localStorage.getItem('mockRole')) { setCount(1); return; }
    const q = query(collection(db, 'leads'), where('gym_id', '==', gymId), where('status', '==', 'new'));
    const unsub = onSnapshot(q, (snap) => setCount(snap.docs.length));
    return () => unsub();
  }, [gymId]);

  return count;
};

export default useNewLeadsCount;
