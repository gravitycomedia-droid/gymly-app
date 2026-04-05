import React, { useState } from 'react';
import { EXERCISE_LIBRARY } from '../data/exerciseLibrary';
import './ExerciseCard.css';

const MUSCLE_COLORS = {
  Chest: '#E24B4A', Back: '#378ADD', Legs: '#1D9E75',
  Shoulders: '#EF9F27', Arms: '#534AB7', Core: '#D85A30', Cardio: '#D4537E'
};

const ExerciseCard = ({ exercise, isDone, onToggleDone, logActuals, onUpdateLog, readOnly }) => {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState('gif'); // 'gif' or 'muscle'
  const [showInstructions, setShowInstructions] = useState(false);

  // Directly retrieve hardcoded premium static values from the curated library map.
  // This gracefully handles legacy Firestore plan objects as well!
  const libData = EXERCISE_LIBRARY[exercise.name] || {};
  const gifUrl = libData.gif_url;
  const muscleMapUrl = libData.muscle_map_image;
  const youtubeId = exercise.youtube_id || libData.youtube_id;
  const primaryMuscle = exercise.primary_muscle || libData.primary_muscle;
  const secondaryMuscles = exercise.secondary_muscles || libData.secondary_muscles;
  const instructionsList = libData.instructions || [];

  const muscleColor = MUSCLE_COLORS[exercise.muscle_group] || '#7a7a9a';
  
  // Ensure sets is always an array of { weight, reps }
  // We use logActuals if it's an array, otherwise we start with one set
  const sets = Array.isArray(logActuals) ? logActuals : [{ weight: '', reps: exercise.reps || '10' }];

  const handleAddSet = (e) => {
    e.stopPropagation();
    const lastSet = sets[sets.length - 1];
    const newSets = [...sets, { ...lastSet }];
    onUpdateLog(exercise.id, null, newSets);
  };

  const handleUpdateSet = (index, field, value) => {
    const newSets = sets.map((s, i) => i === index ? { ...s, [field]: value } : s);
    onUpdateLog(exercise.id, null, newSets);
  };

  const handleRemoveSet = (e, index) => {
    e.stopPropagation();
    if (sets.length <= 1) return;
    const newSets = sets.filter((_, i) => i !== index);
    onUpdateLog(exercise.id, null, newSets);
  };

  const handleImageError = (e, fallback) => {
    e.target.src = fallback;
  };

  if (!expanded) {
    return (
      <div className={`exercise-card-collapsed glass-card ${isDone ? 'done-state' : ''}`} onClick={() => setExpanded(true)}>
        <div className="ec-collapsed-left">
          <div className="ec-muscle-dot" style={{ backgroundColor: muscleColor }} />
          <div>
            <div className="ec-title">{exercise.name}</div>
            <div className="ec-subtitle">{sets.length} sets logged • {exercise.muscle_group}</div>
          </div>
        </div>
        <div className={`ec-check-circle ${isDone ? 'checked' : ''}`}>
           {isDone && '✓'}
        </div>
      </div>
    );
  }

  return (
    <div className={`exercise-card-expanded glass-card ${isDone ? 'done-state' : ''}`}>
      {/* Header */}
      <div className="ec-header" onClick={() => setExpanded(false)}>
        <div className="ec-header-left">
          <h3 className="ec-title-large">{exercise.name}</h3>
          <div className="ec-badges">
             <span className="ec-badge" style={{ backgroundColor: `${muscleColor}22`, color: muscleColor }}>
               {exercise.muscle_group}
             </span>
             <span className="ec-badge diff-badge">
               {exercise.difficulty ? exercise.difficulty.charAt(0).toUpperCase() + exercise.difficulty.slice(1) : 'Standard'}
             </span>
          </div>
        </div>
        <div className={`ec-check-circle ${isDone ? 'checked' : ''}`}>
           {isDone && '✓'}
        </div>
      </div>

      {/* Quick Stats Summary */}
      <div className="ec-quick-stats">
        <div className="ec-stat-chip">
          <span className="ec-stat-val">{sets.length}</span>
          <span className="ec-stat-lbl">Sets Done</span>
        </div>
        <div className="ec-stat-chip">
          <span className="ec-stat-val">{exercise.muscle_group}</span>
          <span className="ec-stat-lbl">Target</span>
        </div>
      </div>

      {/* YouTube Embed */}
      <div className="ec-youtube-section">
        {youtubeId ? (
          <div className="ec-video-container">
            <iframe
              src={`https://www.youtube.com/embed/${youtubeId}?autoplay=0&rel=0&modestbranding=1`}
              title={exercise.name}
              allowFullScreen
              className="ec-youtube-iframe"
            />
          </div>
        ) : (
          <div className="ec-no-video skeleton">No video available</div>
        )}
      </div>

      {/* View Toggle */}
      <div className="ec-view-toggle">
        <button className={`ec-toggle-btn ${activeTab === 'gif' ? 'active' : ''}`} onClick={() => setActiveTab('gif')}>
          Exercise GIF
        </button>
        <button className={`ec-toggle-btn ${activeTab === 'muscle' ? 'active' : ''}`} onClick={() => setActiveTab('muscle')}>
          Muscle Map
        </button>
      </div>

      {/* Dynamic Content Area (GIF or Muscle Map Image) */}
      <div className="ec-dynamic-area">
        {activeTab === 'gif' && (
          <div className="ec-gif-view">
            {gifUrl ? (
               <img 
                src={gifUrl} 
                alt={`${exercise.name} demo`} 
                className="ec-gif-img" 
                onError={(e) => handleImageError(e, 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHJqZ3R4Z3R4Z3R4Z3R4Z3R4Z3R4Z3R4Z3R4Z3R4Z3R4Z3R4Z3R4Z3R4Z3R4Z3R4Z3R4Z3R4Z3R4Z3R4Z3R4Z3R4Z3R4Z/3o7TKMGpxPvcH0jKJW/giphy.gif')}
               />
            ) : (
               <div className="ec-gif-error">
                  <div style={{ fontSize: 24, marginBottom: 8 }}>⚠️</div>
                  GIF Animation unavailable for {exercise.name}.
               </div>
            )}
          </div>
        )}

        {activeTab === 'muscle' && (
          <div className="ec-muscle-view">
            {muscleMapUrl ? (
               <img 
                src={muscleMapUrl} 
                alt="Targeted Muscles" 
                className="ec-muscle-img" 
                onError={(e) => handleImageError(e, 'https://cdn.muscleandstrength.com/sites/all/themes/mnsnew/images/taxonomy/muscle/full-body.png')}
               />
            ) : (
              <div className="ec-gif-error">Muscle illustration not available.</div>
            )}
            
            <div className="ec-muscle-labels">
              <div className="ec-muscle-row">
                 <span className="ec-m-label">Primary:</span>
                 <span className="ec-m-pill primary-pill">{primaryMuscle}</span>
              </div>
              {secondaryMuscles?.length > 0 && (
                <div className="ec-muscle-row">
                   <span className="ec-m-label">Secondary:</span>
                   {secondaryMuscles.map(m => (
                     <span key={m} className="ec-m-pill secondary-pill">{m}</span>
                   ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Instructions Accordion */}
      <div className="ec-instructions-wrapper">
        <button className="ec-instructions-toggle" onClick={() => setShowInstructions(!showInstructions)}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>How to do it</span>
          <span style={{ transform: showInstructions ? 'rotate(180deg)' : 'none', transition: '0.2s' }}>▼</span>
        </button>
        {showInstructions && (
          <div className="ec-instructions-content">
            {instructionsList.length > 0 ? (
              instructionsList.map((step, idx) => (
                <div key={idx} className="ec-step" style={{ animationDelay: `${idx * 40}ms` }}>
                  <div className="ec-step-num">{idx + 1}</div>
                  <div className="ec-step-text">{step}</div>
                </div>
              ))
            ) : (
               <p className="ec-step-text" style={{ padding: '0 10px' }}>
                 Instructions unavailable. Follow standard form or ask your trainer.
               </p>
            )}
          </div>
        )}
      </div>

      {/* Logging Section */}
      {!readOnly && (
        <div className="ec-logging-section">
          <div className="ec-log-header">Log your sets</div>
          
          <div className="ec-sets-container">
            {sets.map((set, idx) => (
              <div key={idx} className="ec-set-row">
                <div className="ec-set-label">Set {idx + 1}</div>
                <input 
                  type="text" 
                  placeholder="Weight (kg)" 
                  className="ec-set-input"
                  value={set.weight}
                  onChange={(e) => handleUpdateSet(idx, 'weight', e.target.value)}
                />
                <input 
                  type="text" 
                  placeholder="Reps" 
                  className="ec-set-input"
                  value={set.reps}
                  onChange={(e) => handleUpdateSet(idx, 'reps', e.target.value)}
                />
                {sets.length > 1 && (
                  <button className="ec-remove-set" onClick={(e) => handleRemoveSet(e, idx)}>×</button>
                )}
              </div>
            ))}
          </div>

          <button className="ec-add-set-btn" onClick={handleAddSet}>
            + Add Set
          </button>
          
          <button 
            className={`ec-mark-btn ${isDone ? 'ec-mark-done' : ''}`}
            onClick={(e) => {
               e.stopPropagation();
               onToggleDone(exercise.id);
            }}
          >
            {isDone ? 'Done! ✓ (Tap to Undo)' : 'Mark done ✓'}
          </button>
        </div>
      )}
    </div>
  );
};

export default ExerciseCard;
