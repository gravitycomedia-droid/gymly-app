import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getGym } from '../firebase/firestore';
import WorkoutLocked from './WorkoutLocked';

/**
 * WorkoutGate — wraps workout-related member pages.
 * Shows a lock screen if gym.settings.workout_enabled !== true.
 * Default is locked (false) — owner must explicitly enable.
 */
const WorkoutGate = ({ children }) => {
  const { userDoc } = useAuth();
  const [status, setStatus] = useState('loading'); // 'loading' | 'locked' | 'unlocked'

  useEffect(() => {
    if (!userDoc?.gym_id) { setStatus('locked'); return; }
    getGym(userDoc.gym_id)
      .then(gym => {
        // Default: locked unless owner explicitly set workout_enabled = true
        const enabled = gym?.settings?.workout_enabled === true;
        setStatus(enabled ? 'unlocked' : 'locked');
      })
      .catch(() => setStatus('locked'));
  }, [userDoc?.gym_id]);

  if (status === 'loading') {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner spinner-primary" style={{ width: 28, height: 28 }} />
      </div>
    );
  }

  if (status === 'locked') return <WorkoutLocked />;

  return children;
};

export default WorkoutGate;
