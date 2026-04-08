import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { 
  doc,
  updateDoc,
  getDoc,
  createWorkoutLog, 
  getMemberPRs, 
  checkAndUpdatePR,
  getMemberWorkoutLogs,
  getMemberTodayLog,
  incrementallyUpdateWorkoutLog,
  Timestamp
} from '../../firebase/firestore';
import { db } from '../../firebase/config';
import { GYMLY_EXERCISE_DB } from '../../data/gymlyExerciseDb';
import { calculateExerciseCalories, parseWeight, parseReps } from '../../utils/calorieEngine';
import { getProgressiveSuggestion } from '../../utils/progressiveOverload';
import BottomNav from '../../components/BottomNav';
import ExerciseCard from '../../components/ExerciseCard';
import './MemberWorkout.css';

const MUSCLE_GROUPS = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'];

const MemberWorkout = () => {
  const { user, userDoc } = useAuth();
  const { showToast } = useToast();

  const [activeMuscleGroup, setActiveMuscleGroup] = useState(MUSCLE_GROUPS[0]);
  const [exerciseLogs, setExerciseLogs] = useState({});
  const [completedExercises, setCompletedExercises] = useState(new Set());
  const [logSaved, setLogSaved] = useState(false);
  
  // New Phase 3 State
  const [userPrs, setUserPrs] = useState({});
  const [suggestions, setSuggestions] = useState({});
  const [totalCals, setTotalCals] = useState(0);
  const [startTime] = useState(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [recentPR, setRecentPR] = useState(null);
  const [activeLogId, setActiveLogId] = useState(null);

  const timerRef = useRef(null);

  // Load User Data & Restoration
  useEffect(() => {
    if (user?.uid) {
      loadUserData();
      fetchTodaysProgress();
    }
    // Timer for elapsed time
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [user, activeMuscleGroup]);

  const fetchTodaysProgress = async () => {
    try {
      const todayLog = await getMemberTodayLog(user.uid, 'scientific_directory', activeMuscleGroup);
      if (todayLog) {
        if (todayLog.id) setActiveLogId(todayLog.id);
        if (todayLog.exercises) {
            const logs = {};
            const completed = new Set();
            todayLog.exercises.forEach(ex => {
              logs[ex.id] = { 
                sets: ex.sets || [], 
                rpe: ex.rpe || 0,
                calories: ex.calories || 0
              };
              if (ex.completed) completed.add(ex.id);
            });
            setExerciseLogs(logs);
            setCompletedExercises(completed);
        }
        if (!todayLog.is_active) {
            setLogSaved(true);
            setShowSummary(true);
        }
      }
    } catch (err) {
      console.error('Failed to fetch today progress:', err);
    }
  };

  const loadUserData = async () => {
    const prs = await getMemberPRs(user.uid);
    setUserPrs(prs);

    // Get suggestions for each exercise in the library (or just current group for optimization)
    const history = await getMemberWorkoutLogs(user.uid, 20);
    const newSuggestions = {};
    
    // For each exercise in the DB, calculate suggestion if history exists
    for (const [id, ex] of Object.entries(GYMLY_EXERCISE_DB)) {
      const exHistory = history
        .filter(h => h.exercises?.some(e => e.id === id))
        .map(h => {
          const matched = h.exercises.find(e => e.id === id);
          return { ...matched, log_date: h.log_date, rpe: h.rpe_per_ex?.[id] || 7 };
        });
      
      const sugg = await getProgressiveSuggestion(exHistory, ex);
      if (sugg) newSuggestions[id] = sugg;
    }
    setSuggestions(newSuggestions);
  };

  // Recalculate total calories whenever exercise logs change
  useEffect(() => {
    let currentTotal = 0;
    completedExercises.forEach(exId => {
      const log = exerciseLogs[exId];
      const dbEx = GYMLY_EXERCISE_DB[exId];
      if (log && dbEx) {
        const avgWeight = log.sets.reduce((sum, s) => sum + parseWeight(s.weight), 0) / log.sets.length;
        const avgReps = log.sets.reduce((sum, s) => sum + parseReps(s.reps), 0) / log.sets.length;
        
        const result = calculateExerciseCalories({
          exercise: dbEx,
          actualSets: log.sets.length,
          actualReps: avgReps,
          actualWeightKg: avgWeight,
          memberWeightKg: userDoc?.weight || 75,
          memberBMI: userDoc?.bmi || 23
        });
        currentTotal += result.calories;
      }
    });
    setTotalCals(currentTotal);
  }, [exerciseLogs, completedExercises, userDoc]);

  // Filter exercises
  const directoryExercises = Object.values(GYMLY_EXERCISE_DB)
    .filter(ex => ex.muscle_group === activeMuscleGroup)
    .map(ex => ({
      ...ex,
      sets: ex.default_sets || 3,
      reps: ex.default_reps || '10'
    }));

  const toggleComplete = async (exId) => {
    if (logSaved) return;
    
    const isNowDone = !completedExercises.has(exId);
    
    setCompletedExercises(prev => {
      const next = new Set(prev);
      if (next.has(exId)) next.delete(exId);
      else next.add(exId);
      return next;
    });

    // Check for PR and Sync to Backend if marked as done
    if (isNowDone) {
      const log = exerciseLogs[exId] || { sets: [{ weight: '', reps: '10' }] };
      const dbEx = GYMLY_EXERCISE_DB[exId];
      
      // Calculate calories for this specific exercise to sync
      const avgWeight = log.sets.reduce((sum, s) => sum + parseWeight(s.weight), 0) / log.sets.length;
      const avgReps = log.sets.reduce((sum, s) => sum + parseReps(s.reps), 0) / log.sets.length;
      const calResult = calculateExerciseCalories({
        exercise: dbEx,
        actualSets: log.sets.length,
        actualReps: avgReps,
        actualWeightKg: avgWeight,
        memberWeightKg: userDoc?.weight || 75,
        memberBMI: userDoc?.bmi || 23
      });

      // Sync to Firebase
      const logId = await incrementallyUpdateWorkoutLog(user.uid, 'scientific_directory', activeMuscleGroup, {
        id: exId,
        name: dbEx?.name,
        completed: true,
        sets: log.sets,
        calories: calResult.calories,
        rpe: log.rpe || 0
      });
      if (logId) setActiveLogId(logId);

      const prResult = await checkAndUpdatePR(user.uid, exId, { 
        ...log, 
        name: dbEx?.name 
      });

      if (prResult.is_pr) {
        setRecentPR({
          name: dbEx?.name,
          type: prResult.type === 'weight_pr' ? 'Weight PR!' : 'Volume PR!',
          improvement: prResult.improvement
        });
        setTimeout(() => setRecentPR(null), 3000);
      }
    }
  };

  const updateLog = (exId, field, value) => {
    if (logSaved) return;
    setExerciseLogs(prev => ({
      ...prev,
      [exId]: field === 'sets' ? { ...prev[exId], sets: value } : { ...prev[exId], [field]: value }
    }));
  };

  const handleFinishWorkout = async () => {
    if (logSaved || completedExercises.size === 0) {
      showToast('Please complete exercises to log!', 'error');
      return;
    }

    try {
      if (activeLogId) {
        await updateDoc(doc(db, 'workout_logs', activeLogId), {
          is_active: false,
          duration_seconds: elapsed,
          final_calories: totalCals,
          finished_at: new Date()
        });
      } else {
        // Fallback: look for log for today/current muscle group
        const now = new Date();
        const logs = await getMemberWorkoutLogs(user.uid, 5);
        const activeLog = logs.find(l => {
          const d = l.log_date?.toDate ? l.log_date.toDate() : null;
          return d && d.getTime() > (now.getTime() - 12 * 3600 * 1000) && l.day_number === activeMuscleGroup && l.is_active;
        });

        if (activeLog) {
            await updateDoc(doc(db, 'workout_logs', activeLog.id), {
                is_active: false,
                duration_seconds: elapsed,
                final_calories: totalCals,
                finished_at: new Date()
            });
        } else {
          // If still not found, create new
          const rpePerEx = {};
          Object.keys(exerciseLogs).forEach(id => {
            if (exerciseLogs[id].rpe) rpePerEx[id] = exerciseLogs[id].rpe;
          });
          await createWorkoutLog({
            member_id: user.uid,
            plan_id: 'scientific_directory',
            day_number: activeMuscleGroup,
            exercises: directoryExercises.filter(ex => completedExercises.has(ex.id)).map(ex => ({
              id: ex.id,
              name: ex.name,
              completed: true,
              sets: exerciseLogs[ex.id]?.sets || []
            })),
            total_calories: totalCals,
            is_active: false,
            duration_seconds: elapsed,
            client_date: new Date().toISOString()
          });
        }
      }

      setLogSaved(true);
      setShowSummary(true);
      showToast('Session Finalized & Analyzed! 🔥', 'success');
    } catch (err) {
      console.error('Finalize workout error:', err);
      showToast('Failed to save workout', 'error');
    }
  };

  const formatTime = (s) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="screen member-workout-screen">
      <div className="screen-content">
        <div className="workout-header">
            <h1 className="top-bar-title">Workout Engine</h1>
            <p className="member-greeting-date">Scientific training with real-time tracking</p>
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

        {/* Exercises List */}
        <div className="active-day-container">
            <div className="exercises-list">
                {directoryExercises.map(ex => (
                    <ExerciseCard 
                        key={ex.id}
                        exercise={ex}
                        isDone={completedExercises.has(ex.id)}
                        onToggleDone={toggleComplete}
                        logData={exerciseLogs[ex.id]}
                        onUpdateLog={updateLog}
                        readOnly={logSaved}
                        userPr={userPrs[ex.id]}
                        suggestion={suggestions[ex.id]}
                        memberWeight={userDoc?.weight}
                        memberBMI={userDoc?.bmi}
                    />
                ))}

                {!logSaved && (
                    <button className="btn-primary" style={{ margin: '20px 0 120px 0' }} onClick={handleFinishWorkout}>
                        Finish {activeMuscleGroup} Session
                    </button>
                )}
            </div>
        </div>
      </div>

      {/* Real-time Calorie Sticky Bar */}
      {!logSaved && completedExercises.size > 0 && (
        <div className="workout-sticky-bar">
          <div className="sticky-stat">
            <span className="sticky-stat-val">🔥 {totalCals}</span>
            <span className="sticky-stat-lbl">kcal</span>
          </div>
          <div className="sticky-stat">
            <span className="sticky-stat-val">{completedExercises.size}/{directoryExercises.length}</span>
            <span className="sticky-stat-lbl">Done</span>
          </div>
          <div className="sticky-stat">
            <span className="sticky-stat-val">⏱ {formatTime(elapsed)}</span>
            <span className="sticky-stat-lbl">Time</span>
          </div>
        </div>
      )}

      {/* PR Celebration Overlay */}
      {recentPR && (
        <div className="pr-celebration-overlay">
          <div className="pr-card">
            <div style={{ fontSize: 60, marginBottom: 16 }}>🏆</div>
            <h2 style={{ color: '#FFD700', fontSize: 24, fontWeight: 800 }}>NEW PERSONAL RECORD!</h2>
            <p style={{ color: '#fff', fontSize: 18, marginTop: 12 }}>{recentPR.name}</p>
            <div style={{ background: 'rgba(255,215,0,0.2)', padding: '8px 16px', borderRadius: 12, marginTop: 16, color: '#FFD700', fontWeight: 700 }}>
              {recentPR.type} (+{recentPR.improvement})
            </div>
          </div>
        </div>
      )}

      {/* Final Summary Sheet */}
      {showSummary && (
        <div className="summary-overlay" onClick={() => setShowSummary(false)}>
          <div className="summary-sheet" onClick={(e) => e.stopPropagation()}>
            <div style={{ width: 40, height: 4, background: '#e0e0e0', borderRadius: 2, margin: '0 auto 20px' }} />
            <h2 style={{ fontSize: 22, fontWeight: 800 }}>Workout Complete! 👊</h2>
            
            <div className="summary-cal-large">{totalCals}</div>
            <div className="summary-cal-lbl">ESTIMATED CALORIES BURNED</div>

            <div className="summary-equivalents">
              <div className="equiv-item">
                <span className="equiv-icon">🫓</span>
                <span className="equiv-text">{Math.round(totalCals / 120)} Rotis</span>
              </div>
              <div className="equiv-item">
                <span className="equiv-icon">🍌</span>
                <span className="equiv-text">{Math.round(totalCals / 89)} Bananas</span>
              </div>
              <div className="equiv-item">
                <span className="equiv-icon">🥛</span>
                <span className="equiv-text">{Math.round(totalCals / 149)} Milks</span>
              </div>
            </div>

            <div className="summary-stats-grid">
              <div className="summary-stat-card">
                <div className="lbl">Total Time</div>
                <div className="val">{formatTime(elapsed)}</div>
              </div>
              <div className="summary-stat-card">
                <div className="lbl">Exercises</div>
                <div className="val">{completedExercises.size}</div>
              </div>
            </div>

            <div style={{ background: '#f0efff', padding: '16px', borderRadius: 16, textAlign: 'left', marginBottom: 24 }}>
              <h4 style={{ color: '#534AB7', fontSize: 14, marginBottom: 4 }}>💡 Did you know?</h4>
              <p style={{ fontSize: 12, color: '#534AB7', opacity: 0.8 }}>
                Your body will continue burning calories for up to 24 hours after this high-intensity session (EPOC effect). Keep up the great work!
              </p>
            </div>

            <button className="btn-primary" onClick={() => setShowSummary(false)}>Great Service!</button>
          </div>
        </div>
      )}

      <BottomNav activeTab="workout" role="member" />
    </div>
  );
};

export default MemberWorkout;
