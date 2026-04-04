import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getWorkoutPlan, getWorkoutDays, getMemberTodayLog, createWorkoutLog } from '../../firebase/firestore';
import { getTodaysDayNumber } from '../../data/exerciseLibrary';
import BottomNav from '../../components/BottomNav';
import './MemberWorkout.css';

const MemberWorkout = () => {
  const navigate = useNavigate();
  const { user, userDoc } = useAuth();
  const { showToast } = useToast();

  const [plan, setPlan] = useState(null);
  const [days, setDays] = useState([]);
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  
  // Logging state
  const [exerciseLogs, setExerciseLogs] = useState({});
  const [completedExercises, setCompletedExercises] = useState(new Set());
  const [logSaved, setLogSaved] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    const fetchAuth = async () => {
      if (!userDoc || !user) { setLoading(false); return; }
      if (!userDoc.workout_plan_id) { setLoading(false); return; }
      
      try {
        const p = await getWorkoutPlan(userDoc.workout_plan_id);
        const d = await getWorkoutDays(userDoc.workout_plan_id);
        
        setPlan(p);
        setDays(d);
        
        let todayIdx = 0;
        if (p && userDoc.start_date) {
            const num = getTodaysDayNumber(userDoc.start_date, p.total_days);
            todayIdx = d.findIndex(day => day.day_number === num);
            if (todayIdx === -1) todayIdx = 0;
        }
        setActiveDayIdx(todayIdx);

        // Check if already logged today
        if (d[todayIdx]) {
            const todayLog = await getMemberTodayLog(user.uid, p.id, d[todayIdx].day_number);
            if (todayLog) {
                setLogSaved(true);
                const comp = new Set();
                const logs = {};
                todayLog.exercises?.forEach(ex => {
                    comp.add(ex.id);
                    logs[ex.id] = ex.actual;
                });
                setCompletedExercises(comp);
                setExerciseLogs(logs);
            }
        }
      } catch (err) {
        console.error('MemberWorkout fetch error:', err);
        showToast('Failed to load workout details', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchAuth();
  }, [userDoc, user]);

  const toggleComplete = (exId) => {
    if (logSaved) return; // Read-only if saved
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
      [exId]: { ...prev[exId], [field]: value }
    }));
  };

  const markAllDone = () => {
    if (logSaved) return;
    const all = new Set();
    const activeDay = days[activeDayIdx];
    if (!activeDay || !activeDay.exercises) return;
    
    activeDay.exercises.forEach(ex => all.add(ex.id));
    setCompletedExercises(all);
  };

  const handleFinishWorkout = async () => {
    if (logSaved) return;
    const activeDay = days[activeDayIdx];
    if (!activeDay) return;

    try {
      const logData = {
        member_id: user.uid,
        gym_id: userDoc.gym_id,
        plan_id: plan.id,
        day_number: activeDay.day_number,
        completed_count: completedExercises.size,
        total_count: activeDay.exercises?.length || 0,
        exercises: activeDay.exercises?.map(ex => ({
          id: ex.id,
          name: ex.name,
          completed: completedExercises.has(ex.id),
          actual: exerciseLogs[ex.id] || { weight: ex.weight || '', reps: ex.reps || '' }
        })) || []
      };

      await createWorkoutLog(logData);
      setLogSaved(true);
      setShowConfetti(true);
      showToast('Workout saved successfully!', 'success');
      setTimeout(() => setShowConfetti(false), 5000);
    } catch (err) {
      console.error(err);
      showToast('Failed to save workout', 'error');
    }
  };

  if (loading) {
    return (
      <div className="screen member-workout-screen">
        <div className="screen-content spinner-center">
          <div className="spinner spinner-primary" style={{ width: 32, height: 32 }} />
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="screen member-workout-screen">
        <div className="screen-content">
          <div className="empty-state">
            <h3 className="empty-title">No workout plan assigned</h3>
            <p className="empty-subtitle">Ask your trainer to assign a workout plan to you.</p>
          </div>
        </div>
        <BottomNav activeTab="workout" role="member" />
      </div>
    );
  }

  const activeDay = days[activeDayIdx];

  return (
    <div className="screen member-workout-screen">
      <div className="screen-content">
        <div className="workout-header">
            <div>
                <h1 className="top-bar-title">{plan.name}</h1>
                <p className="member-greeting-date" style={{ marginTop: 4 }}>Goal: {plan.target_goal.replace('_', ' ')}</p>
            </div>
        </div>

        {/* Day Horizontal Scroller */}
        <div className="day-scroller hide-scrollbar">
            {days.map((day, idx) => (
                <button 
                  key={day.id} 
                  className={`day-pill ${idx === activeDayIdx ? 'active' : ''}`}
                  onClick={() => setActiveDayIdx(idx)}
                >
                    <div style={{ fontWeight: 600 }}>Day {day.day_number}</div>
                    <div style={{ fontSize: 10, opacity: 0.8, marginTop: 2 }}>{day.is_rest_day ? 'Rest' : 'Workout'}</div>
                </button>
            ))}
        </div>

        {/* Active Day Content */}
        {activeDay ? (
            <div className="active-day-container">
                <div className="glass-card" style={{ padding: 16, marginBottom: 16 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{activeDay.name}</h2>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{activeDay.focus}</p>
                    {activeDay.is_rest_day && (
                         <div className="today-rest-badge" style={{ marginTop: 12 }}>🌙 Rest day — Recovery prescribed</div>
                    )}
                </div>

                {!activeDay.is_rest_day && activeDay.exercises?.length > 0 ? (
                    <div className="exercises-list">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <span style={{ fontSize: 14, fontWeight: 600 }}>Exercises ({activeDay.exercises.length})</span>
                            {!logSaved && (
                                <button className="btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={markAllDone}>
                                    Mark all done
                                </button>
                            )}
                        </div>

                        {activeDay.exercises.map(ex => {
                            const isDone = completedExercises.has(ex.id);
                            const actuals = exerciseLogs[ex.id] || { weight: ex.weight || '', reps: ex.reps || '' };

                            return (
                                <div key={ex.id} className={`exercise-card glass-card ${isDone ? 'completed' : ''}`}>
                                    <div className="exercise-card-header" onClick={() => toggleComplete(ex.id)}>
                                        <div className="exercise-card-title-row">
                                            <div className={`checkbox ${isDone ? 'checked' : ''}`}>
                                                {isDone && '✓'}
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 15, fontWeight: 600 }}>{ex.name}</div>
                                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                                                    {ex.sets} sets • {ex.reps} reps {ex.weight && `• ${ex.weight}`}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {!logSaved && (
                                        <div className="exercise-card-log">
                                            <div style={{ display: 'flex', gap: 10 }}>
                                                <div className="input-group" style={{ marginBottom: 0, flex: 1 }}>
                                                    <label className="input-label" style={{ fontSize: 10 }}>Actual weight</label>
                                                    <input 
                                                        className="input-field" 
                                                        style={{ padding: '6px 10px', fontSize: 13 }}
                                                        placeholder={ex.weight || 'Weight'}
                                                        value={actuals.weight}
                                                        onChange={e => updateLog(ex.id, 'weight', e.target.value)}
                                                    />
                                                </div>
                                                <div className="input-group" style={{ marginBottom: 0, flex: 1 }}>
                                                    <label className="input-label" style={{ fontSize: 10 }}>Actual reps</label>
                                                    <input 
                                                        className="input-field"
                                                        style={{ padding: '6px 10px', fontSize: 13 }}
                                                        placeholder={String(ex.reps) || 'Reps'}
                                                        value={actuals.reps}
                                                        onChange={e => updateLog(ex.id, 'reps', e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {!logSaved ? (
                            <button className="btn-primary" style={{ margin: '20px 0 80px 0' }} onClick={handleFinishWorkout}>
                                Save Workout
                            </button>
                        ) : (
                            <div className="workout-saved-notice">
                                ✓ Workout logged for this day
                            </div>
                        )}
                    </div>
                ) : (
                    !activeDay.is_rest_day && (
                        <div className="empty-state">
                            <p className="empty-subtitle">No exercises defined for this day.</p>
                        </div>
                    )
                )}
            </div>
        ) : (
             <div className="empty-state">
                <p className="empty-subtitle">Select a day.</p>
            </div>
        )}
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
