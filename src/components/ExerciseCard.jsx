import React, { useState, useEffect } from 'react';
import { GYMLY_EXERCISE_DB } from '../data/gymlyExerciseDb';
import { calculateExerciseCalories, parseWeight } from '../utils/calorieEngine';
import './ExerciseCard.css';

const MUSCLE_COLORS = {
  Chest: '#E24B4A', Back: '#378ADD', Legs: '#1D9E75',
  Shoulders: '#EF9F27', Arms: '#534AB7', Core: '#D85A30', Cardio: '#D4537E'
};

const RPE_LABELS = {
  1: 'Too Easy', 2: 'Light', 3: 'Easy', 
  4: 'Moderate', 5: 'Just Right', 6: 'Perfect',
  7: 'Challenging', 8: 'Hard', 9: 'Very Hard', 10: 'Max Effort'
};

const ExerciseCard = ({ 
  exercise, 
  isDone, 
  onToggleDone, 
  logData, 
  onUpdateLog, 
  readOnly,
  userPr,             // { best_weight, best_reps }
  suggestion,         // { type, message, suggested_weight, suggested_reps }
  memberWeight = 75,
  memberBMI = 23
}) => {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState('gif'); // 'gif' or 'muscle'
  const [showInstructions, setShowInstructions] = useState(false);
  const [rpe, setRpe] = useState(logData?.rpe || 0);

  // Get rich scientific data
  // We use the exercise.id if available, otherwise try to slugify the name
  const exerciseId = exercise.id || exercise.name.toLowerCase().replace(/\s+/g, '-');
  const dbData = GYMLY_EXERCISE_DB[exerciseId] || {};
  
  const sets = logData?.sets || [{ weight: '', reps: exercise.reps || '10' }];

  // Calculate real-time calories
  const [estCalories, setEstCalories] = useState(0);

  useEffect(() => {
    if (dbData.id) {
      const avgWeight = sets.reduce((sum, s) => sum + parseWeight(s.weight), 0) / sets.length;
      const avgReps = sets.reduce((sum, s) => {
        const r = parseInt(s.reps) || 10;
        return sum + r;
      }, 0) / sets.length;

      const result = calculateExerciseCalories({
        exercise: { ...dbData, ...exercise }, // merge properties
        actualSets: sets.length,
        actualReps: avgReps,
        actualWeightKg: avgWeight,
        memberWeightKg: memberWeight,
        memberBMI: memberBMI
      });
      setEstCalories(result.calories);
    }
  }, [sets, dbData, memberWeight, memberBMI]);

  const handleUpdateSet = (index, field, value) => {
    const newSets = sets.map((s, i) => i === index ? { ...s, [field]: value } : s);
    onUpdateLog(exercise.id, 'sets', newSets);
  };

  const handleAddSet = (e) => {
    e.stopPropagation();
    const lastSet = sets[sets.length - 1];
    const newSets = [...sets, { ...lastSet }];
    onUpdateLog(exercise.id, 'sets', newSets);
  };

  const handleRemoveSet = (e, index) => {
    e.stopPropagation();
    if (sets.length <= 1) return;
    const newSets = sets.filter((_, i) => i !== index);
    onUpdateLog(exercise.id, 'sets', newSets);
  };

  const handleRpeSelect = (val) => {
    setRpe(val);
    onUpdateLog(exercise.id, 'rpe', val);
  };

  const muscleColor = MUSCLE_COLORS[exercise.muscle_group] || '#7a7a9a';

  if (!expanded) {
    return (
      <div className={`exercise-card-collapsed glass-card ${isDone ? 'done-state' : ''}`} onClick={() => setExpanded(true)}>
        <div className="ec-collapsed-left">
          <div className="ec-muscle-dot" style={{ backgroundColor: muscleColor }} />
          <div>
            <div className="ec-title">{exercise.name}</div>
            <div className="ec-subtitle">{sets.length} sets • {exercise.muscle_group}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isDone && <div className="ec-cal-chip">🔥 {estCalories}</div>}
          <div className={`ec-check-circle ${isDone ? 'checked' : ''}`}>
             {isDone && '✓'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`exercise-card-expanded glass-card ${isDone ? 'done-state' : ''}`}>
      {/* PR Badge */}
      {userPr && (
        <div className="ec-pr-badge">
          🏆 PR: {userPr.best_weight}kg × {userPr.best_reps}
        </div>
      )}

      {/* Header */}
      <div className="ec-header" onClick={() => setExpanded(false)}>
        <div className="ec-header-left">
          <h3 className="ec-title-large">{exercise.name}</h3>
          <div className="ec-badges">
             <span className="ec-badge" style={{ backgroundColor: `${muscleColor}22`, color: muscleColor }}>
               {exercise.muscle_group}
             </span>
             <span className="ec-badge diff-badge">
               {dbData.difficulty || 'Standard'}
             </span>
             <div className="ec-cal-chip">🔥 ~{estCalories} kcal</div>
          </div>
        </div>
        <div className={`ec-check-circle ${isDone ? 'checked' : ''}`}>
           {isDone && '✓'}
        </div>
      </div>

      {/* Progression Suggestion */}
      {suggestion && !isDone && (
        <div className="ec-progression-tip">
          <div className="ec-tip-header">💡 Progression Tip</div>
          <div className="ec-tip-text">{suggestion.message}</div>
          <button 
            className="ec-apply-tip"
            onClick={() => {
              const newSets = sets.map(s => ({ ...s, weight: suggestion.suggested_weight, reps: suggestion.suggested_reps }));
              onUpdateLog(exercise.id, 'sets', newSets);
            }}
          >
            Apply Suggestion
          </button>
        </div>
      )}

      {/* YouTube Embed */}
      <div className="ec-youtube-section">
        {dbData.youtube_id ? (
          <div className="ec-video-container">
            <iframe
              src={`https://www.youtube.com/embed/${dbData.youtube_id}?autoplay=0&rel=0&modestbranding=1`}
              title={exercise.name}
              allowFullScreen
              className="ec-youtube-iframe"
            />
          </div>
        ) : (
          <div className="ec-no-video skeleton">Video coming soon</div>
        )}
      </div>

      {/* View Toggle */}
      <div className="ec-view-toggle">
        <button className={`ec-toggle-btn ${activeTab === 'gif' ? 'active' : ''}`} onClick={() => setActiveTab('gif')}>
          Demo GIF
        </button>
        <button className={`ec-toggle-btn ${activeTab === 'muscle' ? 'active' : ''}`} onClick={() => setActiveTab('muscle')}>
          Muscle Map
        </button>
      </div>

      {/* Dynamic Content Area */}
      <div className="ec-dynamic-area">
        {activeTab === 'gif' && (
          <div className="ec-gif-view">
            {dbData.gif_url ? (
               <img src={dbData.gif_url} alt="demo" className="ec-gif-img" />
            ) : (
               <div className="ec-gif-error">Animation unavailable</div>
            )}
            
            {/* Form Frames Technique Cards */}
            {dbData.form_frames && (
              <div className="ec-form-frames hide-scrollbar">
                {dbData.form_frames.map((frame, i) => (
                  <div key={i} className="ec-frame-card">
                    <span className="ec-frame-label">{frame.label}</span>
                    <span className="ec-frame-cue">{frame.cue}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'muscle' && (
          <div className="ec-muscle-view">
            <img 
              src={`https://fitnessprogramer.com/wp-content/uploads/2021/10/${exercise.muscle_group.toLowerCase()}-muscle.png`} 
              alt="muscles" 
              className="ec-muscle-img"
              onError={(e) => e.target.src = 'https://fitnessprogramer.com/wp-content/uploads/2021/10/full-body-muscles.png'}
            />
            <div className="ec-muscle-labels">
              <div className="ec-muscle-row">
                 <span className="ec-m-label">Primary:</span>
                 <span className="ec-m-pill primary-pill">{dbData.primary_muscle}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="ec-instructions-wrapper">
        <button className="ec-instructions-toggle" onClick={() => setShowInstructions(!showInstructions)}>
          <span style={{ fontWeight: 600, fontSize: 13, color: '#7a7a9a' }}>Technique & Cues</span>
          <span style={{ transform: showInstructions ? 'rotate(180deg)' : 'none', transition: '0.2s', color: '#7a7a9a' }}>▼</span>
        </button>
        {showInstructions && (
          <div className="ec-instructions-content">
            {dbData.form_cues?.map((cue, i) => (
              <div key={i} className="ec-step">
                <div className="ec-step-num">✓</div>
                <div className="ec-step-text" style={{ color: '#fff' }}>{cue}</div>
              </div>
            ))}
            {dbData.common_mistakes && (
               <div style={{ marginTop: 8 }}>
                 <div style={{ fontSize: 11, fontWeight: 700, color: '#E24B4A', textTransform: 'uppercase', marginBottom: 4 }}>Common Mistakes</div>
                 {dbData.common_mistakes.map((m, i) => (
                   <div key={i} style={{ fontSize: 12, color: '#ffaaaa', marginBottom: 2 }}>• {m}</div>
                 ))}
               </div>
            )}
          </div>
        )}
      </div>

      {/* Logging Section */}
      {!readOnly && (
        <div className="ec-logging-section">
          <div className="ec-log-header">Log Your Sets</div>
          {sets.map((set, idx) => (
            <div key={idx} className="ec-set-row">
              <div className="ec-set-label">SET {idx + 1}</div>
              <input 
                type="number" 
                placeholder="Weight (kg)" 
                className="ec-set-input"
                value={set.weight} 
                onChange={(e) => handleUpdateSet(idx, 'weight', e.target.value)}
              />
              <input 
                type="number" 
                placeholder="Reps" 
                className="ec-set-input"
                value={set.reps} 
                onChange={(e) => handleUpdateSet(idx, 'reps', e.target.value)}
              />
              {sets.length > 1 && (
                <button className="ec-remove-set" onClick={(e) => handleRemoveSet(e, idx)}>
                  <span style={{ opacity: 0.6 }}>×</span>
                </button>
              )}
            </div>
          ))}
          
          <button className="ec-add-set-btn" onClick={handleAddSet}>
            + Add Another Set
          </button>

          {/* RPE Slider */}
          <div className="ec-rpe-section">
            <div className="ec-rpe-label">
              <span>How hard was this? (RPE)</span>
              <span>{rpe > 0 ? `${rpe}/10` : '—'}</span>
            </div>
            <div className="ec-rpe-scale">
              {[1,2,3,4,5,6,7,8,9,10].map(val => (
                <button 
                  key={val} 
                  className={`ec-rpe-btn ${rpe === val ? 'active' : ''}`}
                  onClick={() => handleRpeSelect(val)}
                >
                  {val}
                </button>
              ))}
            </div>
            {rpe > 0 && <div className="ec-rpe-desc">{RPE_LABELS[rpe]}</div>}
          </div>

          <button 
            className={`ec-mark-btn ${isDone ? 'ec-mark-done' : ''}`}
            style={{ marginTop: 20 }}
            onClick={(e) => {
               e.stopPropagation();
               onToggleDone(exercise.id);
            }}
          >
            {isDone ? 'Marked Done ✓' : 'Mark as Done ✓'}
          </button>
        </div>
      )}
    </div>
  );
};

export default ExerciseCard;
