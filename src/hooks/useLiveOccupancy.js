// src/hooks/useLiveOccupancy.js
// Subscribes to live occupancy count from attendance_sessions.

import { useState, useEffect } from 'react';
import { getLiveOccupancy } from '../firebase/firestore-kiosk';

const useLiveOccupancy = (gymId) => {
  const [occupancy, setOccupancy] = useState(0);
  const [activeSessions, setActiveSessions] = useState([]);

  useEffect(() => {
    if (!gymId) return;
    const unsubscribe = getLiveOccupancy(gymId, (count, sessions) => {
      setOccupancy(count);
      setActiveSessions(sessions);
    });
    return () => unsubscribe();
  }, [gymId]);

  return { occupancy, activeSessions };
};

export default useLiveOccupancy;
