import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  createWorkoutPlan, createWorkoutDay, getWorkoutPlan, getWorkoutDays,
  updateWorkoutPlan, updateWorkoutDay,
} from '../../firebase/firestore';
import { GYMLY_EXERCISE_DB } from '../../data/gymlyExerciseDb';
import './Trainer.css';

const GOALS = ['fat_loss', 'muscle', 'endurance', 'general'];
const LEVELS = ['beginner', 'intermediate', 'advanced'];
const REST_OPTIONS = [30, 45, 60, 90, 120, 180];

const uid = () => Math.random().toString(36).substring(2, 10);

const ExerciseThumbnail = ({ id }) => {
  const libData = GYMLY_EXERCISE_DB[id] || {};
  const gifUrl = libData.gif_url;

  if (!gifUrl) return <div className="ex-thumb-empty" style={{width: 48, height: 48, background: 'rgba(255,255,255,0.05)', borderRadius: 8}} />;
  return <img src={gifUrl} alt={id} style={{width: 48, height: 48, objectFit: 'cover', borderRadius: 8}} />;
};

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
  const [expandedDay, setExpandedDay] = useState(0);
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

  const addExercise = (dayIdx, exerciseId) => {
    const exLib = GYMLY_EXERCISE_DB[exerciseId] || {};
    setDays(prev => prev.map((d, i) => {
      if (i !== dayIdx) return d;
      return {
        ...d, exercises: [...d.exercises, {
          id: exerciseId, // Use the real DB ID
          instanceId: uid(), // for local uniqueness
          name: exLib.name,
          muscle_group: exLib.muscle_group,
          difficulty: exLib.difficulty,
          sets: exLib.default_sets || 3,
          reps: exLib.default_reps || '10',
          weight: '', 
          rest_seconds: exLib.rest_seconds || 90, 
          youtube_id: exLib.youtube_id || '',
          order: d.exercises.length + 1,
        }],
      };
    }));
    setShowExerciseLib(null);
    setSearchTerm('');
  };

  const removeExercise = (dayIdx, exInstanceId) => {
    setDays(prev => prev.map((d, i) => {
      if (i !== dayIdx) return d;
      return { ...d, exercises: d.exercises.filter(e => e.instanceId !== exInstanceId) };
    }));
  };

  const updateExercise = (dayIdx, exInstanceId, field, value) => {
    setDays(prev => prev.map((d, i) => {
      if (i !== dayIdx) return d;
      return {
        ...d, exercises: d.exercises.map(e => e.instanceId === exInstanceId ? { ...e, [field]: value } : e),
      };
    }));
  };

  const handleSave = async () => {
    if (!plan.name.trim()) { showToast('Plan name required', 'error'); return; }
    setSaving(true);
    try {
      if (isEdit) {
        await updateWorkoutPlan(planId, { ...plan });
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
    Object.entries(GYMLY_EXERCISE_DB).forEach(([id, data]) => {
      if (data.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
          data.muscle_group.toLowerCase().includes(searchTerm.toLowerCase())) {
        const group = data.muscle_group;
        if (!results[group]) results[group] = [];
        results[group].push({ id, ...data });
      }
    });
    return results;
  };

  if (loading) return null;

  return (
    <div className="screen trainer-screen">
      <div className="screen-content">
        <header className="top-bar">
          <button className="back-btn" onClick={() => navigate(-1)}>← Back</button>
          <h1 className="top-bar-title">{isEdit ? 'Modify Plan' : 'Build Plan'}</h1>
          <div style={{ width: 44 }} />
        </header>

        <section className="glass-card builder-setup">
          <div className="input-group">
            <label>Plan Title</label>
            <input placeholder="e.g. Hypertrophy Master" value={plan.name}
              onChange={e => setPlan({ ...plan, name: e.target.value })} />
          </div>
          <div className="setup-grid">
             <div className="input-group">
               <label>Goal</label>
               <select value={plan.target_goal} onChange={e => setPlan({...plan, target_goal: e.target.value})}>
                 {GOALS.map(g => <option key={g} value={g}>{g.replace('_', ' ')}</option>)}
               </select>
             </div>
             <div className="input-group">
               <label>Experience</label>
               <select value={plan.target_experience} onChange={e => setPlan({...plan, target_experience: e.target.value})}>
                 {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
               </select>
             </div>
          </div>
        </section>

        <div className="builder-days">
          {days.map((day, idx) => (
            <div key={idx} className={`builder-day-card glass-card ${expandedDay === idx ? 'expanded' : ''}`}>
              <div className="day-header" onClick={() => setExpandedDay(expandedDay === idx ? null : idx)}>
                <div className="day-info">
                   <span className="day-num">Day {day.day_number}</span>
                   <span className="day-title">{day.name} {day.focus ? `(${day.focus})` : ''}</span>
                </div>
                <div className="day-stats">
                   {day.is_rest_day ? 'Rest' : `${day.exercises.length} Exercises`}
                   <span className="chevron">{expandedDay === idx ? '▼' : '▶'}</span>
                </div>
              </div>

              {expandedDay === idx && (
                <div className="day-details">
                  <div className="day-config-row">
                    <input placeholder="Focus (e.g. Chest/Tri)" value={day.focus} onChange={e => updateDay(idx, 'focus', e.target.value)} />
                    <button className={`mode-btn ${day.is_rest_day ? 'rest' : 'active'}`} onClick={() => updateDay(idx, 'is_rest_day', !day.is_rest_day)}>
                       {day.is_rest_day ? 'Rest Day' : 'Workout Day'}
                    </button>
                  </div>

                  {!day.is_rest_day && (
                    <>
                      <div className="builder-ex-list">
                        {day.exercises.map(ex => (
                          <div key={ex.instanceId} className="builder-ex-item">
                            <div className="ex-item-top">
                               <ExerciseThumbnail id={ex.id} />
                               <div className="ex-item-meta">
                                  <span className="name">{ex.name}</span>
                                  <span className="muscle">{ex.muscle_group}</span>
                               </div>
                               <button className="remove-btn" onClick={() => removeExercise(idx, ex.instanceId)}>×</button>
                            </div>
                            <div className="ex-item-grid">
                               <div className="field">
                                  <label>Sets</label>
                                  <input type="number" value={ex.sets} onChange={e => updateExercise(idx, ex.instanceId, 'sets', e.target.value)} />
                               </div>
                               <div className="field">
                                  <label>Reps</label>
                                  <input value={ex.reps} onChange={e => updateExercise(idx, ex.instanceId, 'reps', e.target.value)} />
                               </div>
                               <div className="field">
                                  <label>Rest</label>
                                  <select value={ex.rest_seconds} onChange={e => updateExercise(idx, ex.instanceId, 'rest_seconds', e.target.value)}>
                                     {REST_OPTIONS.map(r => <option key={r} value={r}>{r}s</option>)}
                                  </select>
                               </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <button className="add-ex-trigger" onClick={() => setShowExerciseLib(idx)}>
                        + Add Exercise from Scientific DB
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="builder-footer">
           <button className="btn-primary main-save" onClick={handleSave} disabled={saving}>
              {saving ? 'Processing...' : (isEdit ? 'Update Training Plan' : 'Publish Plan')}
           </button>
        </div>
      </div>

      {showExerciseLib !== null && (
        <div className="modal-overlay" onClick={() => setShowExerciseLib(null)}>
          <div className="bottom-sheet glass-card" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <h2 className="sheet-title">Scientific Library</h2>
            <div className="lib-search">
               <input placeholder="Search 60+ exercises..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            <div className="lib-content hide-scrollbar">
               {Object.entries(filteredExercises()).map(([group, list]) => (
                 <div key={group} className="lib-group">
                    <h3 className="lib-group-title">{group}</h3>
                    <div className="lib-grid">
                       {list.map(ex => (
                         <div key={ex.id} className="lib-item" onClick={() => addExercise(showExerciseLib, ex.id)}>
                            <ExerciseThumbnail id={ex.id} />
                            <div className="lib-item-info">
                               <div className="name">{ex.name}</div>
                               <div className="sub">{ex.difficulty} • {ex.equipment}</div>
                            </div>
                         </div>
                       ))}
                    </div>
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
