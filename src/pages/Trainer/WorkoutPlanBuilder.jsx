import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  createWorkoutPlan, createWorkoutDay, getWorkoutPlan, getWorkoutDays,
  updateWorkoutPlan, updateWorkoutDay,
} from '../../firebase/firestore';
import { EXERCISE_LIBRARY, MUSCLE_GROUPS } from '../../data/exerciseLibrary';
import './Trainer.css';

const GOALS = ['fat_loss', 'muscle', 'endurance', 'general'];
const LEVELS = ['beginner', 'intermediate', 'advanced'];
const REST_OPTIONS = [30, 45, 60, 90, 120, 180];

const uid = () => Math.random().toString(36).substring(2, 10);

const WorkoutPlanBuilder = () => {
  const navigate = useNavigate();
  const { planId } = useParams();
  const location = useLocation();
  const { user, userDoc } = useAuth();
  const { showToast } = useToast();

  const [plan, setPlan] = useState({
    name: '', target_goal: 'muscle', target_experience: 'beginner',
    days_per_week: 5, total_days: 30,
  });
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(!!planId || !!location.state?.templateId);
  const [saving, setSaving] = useState(false);
  const [expandedDay, setExpandedDay] = useState(null);
  const [showExerciseLib, setShowExerciseLib] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const isEdit = !!planId;

  useEffect(() => {
    const loadPlan = async () => {
      const id = planId || location.state?.templateId;
      if (!id) return;
      try {
        const p = await getWorkoutPlan(id);
        const d = await getWorkoutDays(id);
        if (p) {
          setPlan({
            name: location.state?.templateId ? `${p.name} (Custom)` : p.name,
            target_goal: p.target_goal, target_experience: p.target_experience,
            days_per_week: p.days_per_week, total_days: p.total_days,
          });
          setDays(d.map(day => ({
            day_number: day.day_number, name: day.name, focus: day.focus,
            is_rest_day: day.is_rest_day, exercises: day.exercises || [],
          })));
        }
      } catch (err) {
        console.error(err);
        showToast('Failed to load plan', 'error');
      } finally {
        setLoading(false);
      }
    };
    loadPlan();
  }, [planId, location.state?.templateId]);

  useEffect(() => {
    if (days.length > 0) return;
    if (loading) return;
    generateDays();
  }, [plan.total_days]);

  const generateDays = () => {
    const newDays = [];
    for (let i = 1; i <= plan.total_days; i++) {
      newDays.push({
        day_number: i, name: `Day ${i}`, focus: '',
        is_rest_day: false, exercises: [],
      });
    }
    setDays(newDays);
  };

  const updateDay = (idx, field, value) => {
    setDays(prev => prev.map((d, i) => i === idx ? { ...d, [field]: value } : d));
  };

  const addExercise = (dayIdx, exerciseName, muscleGroup) => {
    setDays(prev => prev.map((d, i) => {
      if (i !== dayIdx) return d;
      return {
        ...d, exercises: [...d.exercises, {
          id: uid(), name: exerciseName, muscle_group: muscleGroup,
          difficulty: plan.target_experience, sets: 3, reps: '10',
          weight: '', rest_seconds: 90, video_url: null, instructions: '',
          order: d.exercises.length + 1,
        }],
      };
    }));
    setShowExerciseLib(null);
    setSearchTerm('');
  };

  const removeExercise = (dayIdx, exId) => {
    setDays(prev => prev.map((d, i) => {
      if (i !== dayIdx) return d;
      return { ...d, exercises: d.exercises.filter(e => e.id !== exId) };
    }));
  };

  const updateExercise = (dayIdx, exId, field, value) => {
    setDays(prev => prev.map((d, i) => {
      if (i !== dayIdx) return d;
      return {
        ...d, exercises: d.exercises.map(e => e.id === exId ? { ...e, [field]: value } : e),
      };
    }));
  };

  const handleSave = async () => {
    if (!plan.name.trim()) { showToast('Plan name required', 'error'); return; }
    setSaving(true);
    try {
      if (isEdit) {
        await updateWorkoutPlan(planId, { ...plan });
        // Update existing days or handle differences
        for (const day of days) {
          if (day.id) await updateWorkoutDay(day.id, day);
          else await createWorkoutDay({ plan_id: planId, ...day });
        }
      } else {
        const newPlanId = await createWorkoutPlan({
          ...plan, type: 'custom', gym_id: userDoc.gym_id,
          created_by: user.uid, is_active: true,
        });
        for (const day of days) {
          await createWorkoutDay({ plan_id: newPlanId, ...day });
        }
      }
      showToast(isEdit ? 'Plan updated' : 'Plan created', 'success');
      navigate('/trainer/workout-plans');
    } catch (err) {
      console.error(err);
      showToast('Failed to save plan', 'error');
    } finally {
      setSaving(false);
    }
  };

  const filteredExercises = () => {
    const results = {};
    MUSCLE_GROUPS.forEach(group => {
      const list = EXERCISE_LIBRARY[group].filter(name =>
        name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      if (list.length > 0) results[group] = list;
    });
    return results;
  };

  if (loading) {
    return (
      <div className="screen trainer-screen">
        <div className="screen-content spinner-center">
          <div className="spinner spinner-primary" style={{ width: 32, height: 32 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="screen trainer-screen">
      <div className="screen-content">
        <div className="top-bar">
          <button className="back-btn" onClick={() => navigate(-1)} style={{ marginBottom: 0 }}>← Back</button>
          <h1 className="top-bar-title">{isEdit ? 'Edit plan' : 'Create plan'}</h1>
          <div style={{ width: 60 }} />
        </div>

        {/* Plan details */}
        <div className="glass-card" style={{ padding: '18px 16px', marginBottom: 16 }}>
          <div className="input-group">
            <label className="input-label">Plan name</label>
            <input className="input-field" placeholder="e.g. Full Body Power" value={plan.name}
              onChange={e => setPlan(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="input-group">
            <label className="input-label">Goal</label>
            <div className="pill-group">
              {GOALS.map(g => (
                <button key={g} className={`pill-option ${plan.target_goal === g ? 'selected' : ''}`}
                  onClick={() => setPlan(p => ({ ...p, target_goal: g }))} type="button">
                  {g.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </button>
              ))}
            </div>
          </div>
          <div className="input-group">
            <label className="input-label">Experience</label>
            <div className="pill-group">
              {LEVELS.map(l => (
                <button key={l} className={`pill-option ${plan.target_experience === l ? 'selected' : ''}`}
                  onClick={() => setPlan(p => ({ ...p, target_experience: l }))} type="button">
                  {l.charAt(0).toUpperCase() + l.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="input-group" style={{ flex: 1 }}>
              <label className="input-label">Days/week</label>
              <input type="number" className="input-field" min="3" max="7" value={plan.days_per_week}
                onChange={e => setPlan(p => ({ ...p, days_per_week: Number(e.target.value) }))} />
            </div>
            <div className="input-group" style={{ flex: 1 }}>
              <label className="input-label">Total days</label>
              <input type="number" className="input-field" min="7" max="90" value={plan.total_days}
                onChange={e => setPlan(p => ({ ...p, total_days: Number(e.target.value) }))} />
            </div>
          </div>
        </div>

        {/* Day cards */}
        {days.map((day, idx) => (
          <div key={idx} className="day-card glass-card">
            <div className="day-card-header" onClick={() => setExpandedDay(expandedDay === idx ? null : idx)}>
              <div>
                <div className="day-card-title">{day.name || `Day ${day.day_number}`}</div>
                <div className="day-card-focus">{day.focus || (day.is_rest_day ? 'Rest day' : 'Tap to add exercises')}</div>
              </div>
              {day.is_rest_day ? (
                <span className="day-rest-badge">🌙 Rest</span>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{day.exercises.length} exercises</span>
              )}
            </div>

            {expandedDay === idx && (
              <>
                <div className="input-group" style={{ marginBottom: 8 }}>
                  <input className="input-field" placeholder="Day name" value={day.name}
                    onChange={e => updateDay(idx, 'name', e.target.value)} style={{ fontSize: 13 }} />
                </div>
                <div className="input-group" style={{ marginBottom: 8 }}>
                  <input className="input-field" placeholder="Focus (e.g. Chest & Triceps)" value={day.focus}
                    onChange={e => updateDay(idx, 'focus', e.target.value)} style={{ fontSize: 13 }} />
                </div>
                <div style={{ marginBottom: 10 }}>
                  <button className={`pill-option ${!day.is_rest_day ? 'selected' : ''}`}
                    onClick={() => updateDay(idx, 'is_rest_day', false)} type="button" style={{ fontSize: 12 }}>Workout</button>
                  <button className={`pill-option ${day.is_rest_day ? 'selected' : ''}`}
                    onClick={() => updateDay(idx, 'is_rest_day', true)} type="button" style={{ fontSize: 12, marginLeft: 6 }}>Rest</button>
                </div>

                {!day.is_rest_day && (
                  <>
                    {day.exercises.map(ex => (
                      <div key={ex.id} className="exercise-item">
                        <div className="exercise-item-header">
                          <span className="exercise-item-name">{ex.name}</span>
                          <button className="exercise-remove" onClick={() => removeExercise(idx, ex.id)}>×</button>
                        </div>
                        <div className="exercise-fields">
                          <div className="input-group">
                            <label className="input-label">Sets</label>
                            <input type="number" className="input-field" value={ex.sets}
                              onChange={e => updateExercise(idx, ex.id, 'sets', Number(e.target.value))} />
                          </div>
                          <div className="input-group">
                            <label className="input-label">Reps</label>
                            <input className="input-field" value={ex.reps}
                              onChange={e => updateExercise(idx, ex.id, 'reps', e.target.value)} />
                          </div>
                          <div className="input-group">
                            <label className="input-label">Weight</label>
                            <input className="input-field" placeholder="e.g. 60kg" value={ex.weight}
                              onChange={e => updateExercise(idx, ex.id, 'weight', e.target.value)} />
                          </div>
                          <div className="input-group">
                            <label className="input-label">Rest (s)</label>
                            <select className="input-field" value={ex.rest_seconds}
                              onChange={e => updateExercise(idx, ex.id, 'rest_seconds', Number(e.target.value))}>
                              {REST_OPTIONS.map(r => <option key={r} value={r}>{r}s</option>)}
                            </select>
                          </div>
                        </div>
                      </div>
                    ))}
                    <button className="add-exercise-btn" onClick={() => setShowExerciseLib(idx)}>
                      + Add exercise
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        ))}

        <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ marginTop: 10, marginBottom: 20 }}>
          {saving ? <div className="spinner" /> : (isEdit ? 'Update plan' : 'Save plan')}
        </button>
      </div>

      {/* Exercise Library Bottom Sheet */}
      {showExerciseLib !== null && (
        <div className="modal-overlay" onClick={() => { setShowExerciseLib(null); setSearchTerm(''); }}>
          <div className="bottom-sheet glass-card" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <h2 className="sheet-title">Add exercise</h2>
            <input className="input-field" placeholder="Search exercises..." value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)} style={{ marginBottom: 12 }} />
            <div className="exercise-lib-sheet">
              {Object.entries(filteredExercises()).map(([group, exercises]) => (
                <div key={group} className="exercise-lib-group">
                  <div className="exercise-lib-group-title">{group}</div>
                  {exercises.map(name => (
                    <div key={name} className="exercise-lib-item"
                      onClick={() => addExercise(showExerciseLib, name, group.charAt(0).toUpperCase() + group.slice(1))}>
                      {name}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkoutPlanBuilder;
