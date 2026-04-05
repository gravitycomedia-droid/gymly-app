import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { createWorkoutLog } from '../../firebase/firestore';
import { EXERCISE_LIBRARY, MUSCLE_GROUPS } from '../../data/exerciseLibrary';
import BottomNav from '../../components/BottomNav';
import ExerciseCard from '../../components/ExerciseCard';
import './MemberWorkout.css';

const MemberWorkout = () => {
  const { user, userDoc } = useAuth();
  const { showToast } = useToast();

  const [activeMuscleGroup, setActiveMuscleGroup] = useState(MUSCLE_GROUPS[0]);
  
  // Logging state for free-form sessions
  const [exerciseLogs, setExerciseLogs] = useState({});
  const [completedExercises, setCompletedExercises] = useState(new Set());
  const [logSaved, setLogSaved] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  // Clear tracking when switching tabs
  useEffect(() => {
    setExerciseLogs({});
    setCompletedExercises(new Set());
    setLogSaved(false);
  }, [activeMuscleGroup]);

  // Filter exercises dynamically based on active tab
  const directoryExercises = Object.entries(EXERCISE_LIBRARY)
    .filter(([_, data]) => data.muscle_group === activeMuscleGroup)
    .map(([name, data]) => ({
      id: name.replace(/\s/g, '_'),
      name: name,
      muscle_group: data.muscle_group,
      sets: 3,
      reps: '10' // Default hints
    }));

  const toggleComplete = (exId) => {
    if (logSaved) return; 
    setCompletedExercises(prev => {
      const next = new Set(prev);
      if (next.has(exId)) next.delete(exId);
      else next.add(exId);
      return next;
    });
  };

  const updateLog = (exId, field, value) => {
    if (logSaved) return;
    setExerciseLogs(prev => ({
      ...prev,
      [exId]: field ? { ...prev[exId], [field]: value } : value
    }));
  };

  const markAllDone = () => {
    if (logSaved) return;
    const all = new Set(directoryExercises.map(ex => ex.id));
    setCompletedExercises(all);
  };

  const handleFinishWorkout = async () => {
    if (logSaved || completedExercises.size === 0) {
      showToast('Please complete at least one exercise to log!', 'error');
      return;
    }

    try {
      const logData = {
        member_id: user.uid,
        gym_id: userDoc?.gym_id || 'none',
        plan_id: 'directory_free_form',
        day_number: activeMuscleGroup,
        completed_count: completedExercises.size,
        total_count: directoryExercises.length,
        exercises: directoryExercises.filter(ex => completedExercises.has(ex.id)).map(ex => ({
          id: ex.id,
          name: ex.name,
          completed: true,
          sets: exerciseLogs[ex.id] || [{ weight: '', reps: ex.reps || '10' }]
        }))
      };

      await createWorkoutLog(logData);
      setLogSaved(true);
      setShowConfetti(true);
      showToast(`${activeMuscleGroup} Workout saved successfully!`, 'success');
      setTimeout(() => setShowConfetti(false), 5000);
    } catch (err) {
      console.error(err);
      showToast('Failed to save workout', 'error');
    }
  };

  return (
    <div className="screen member-workout-screen">
      <div className="screen-content">
        <div className="workout-header">
            <div>
                <h1 className="top-bar-title">Muscle Directory</h1>
                <p className="member-greeting-date" style={{ marginTop: 4 }}>Select a target area to begin</p>
            </div>
        </div>

        {/* Directory Scroller */}
        <div className="day-scroller hide-scrollbar">
            {MUSCLE_GROUPS.map((group) => (
                <button 
                  key={group} 
                  className={`day-pill ${group === activeMuscleGroup ? 'active' : ''}`}
                  onClick={() => setActiveMuscleGroup(group)}
                >
                    <div style={{ fontWeight: 600 }}>{group}</div>
                </button>
            ))}
        </div>

        {/* Directory List Area */}
        <div className="active-day-container">
            <div className="exercises-list">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>Exercises ({directoryExercises.length})</span>
                    {!logSaved && directoryExercises.length > 0 && (
                        <button className="btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={markAllDone}>
                            Mark all done
                        </button>
                    )}
                </div>

                {directoryExercises.length > 0 ? (
                    directoryExercises.map(ex => (
                        <ExerciseCard 
                            key={ex.id}
                            exercise={ex}
                            isDone={completedExercises.has(ex.id)}
                            onToggleDone={toggleComplete}
                            logActuals={exerciseLogs[ex.id]}
                            onUpdateLog={updateLog}
                            readOnly={logSaved}
                        />
                    ))
                ) : (
                    <div className="empty-state">
                        <p className="empty-subtitle">No exercises logged for {activeMuscleGroup} yet.</p>
                    </div>
                )}

                {!logSaved && directoryExercises.length > 0 ? (
                    <button className="btn-primary" style={{ margin: '20px 0 80px 0' }} onClick={handleFinishWorkout}>
                        Log {activeMuscleGroup} Session
                    </button>
                ) : logSaved ? (
                    <div className="workout-saved-notice">
                        ✓ {activeMuscleGroup} Session safely logged
                    </div>
                ) : null}
            </div>
        </div>
      </div>

      {showConfetti && (
          <div className="confetti-overlay">
              <div className="confetti-modal glass-card">
                  <h2>🎉 Awesome work!</h2>
                  <p>Workout logged successfully.</p>
              </div>
          </div>
      )}

      <BottomNav activeTab="workout" role="member" />
    </div>
  );
};

export default MemberWorkout;
