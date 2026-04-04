import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getPredefinedPlans, getGymCustomPlans } from '../../firebase/firestore';
import BottomNav from '../../components/BottomNav';
import './Trainer.css';

const WorkoutPlanList = () => {
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  const { showToast } = useToast();

  const [predefined, setPredefined] = useState([]);
  const [custom, setCustom] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('predefined');

  useEffect(() => {
    const fetch = async () => {
      try {
        const [pre, cust] = await Promise.all([
          getPredefinedPlans(),
          userDoc?.gym_id ? getGymCustomPlans(userDoc.gym_id) : [],
        ]);
        setPredefined(pre);
        setCustom(cust);
      } catch (err) {
        console.error(err);
        showToast('Failed to load plans', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [userDoc?.gym_id]);

  const goalBadge = (goal) => {
    const map = { fat_loss: 'Fat loss', muscle: 'Muscle', endurance: 'Endurance', general: 'General' };
    return map[goal] || goal;
  };

  const expBadge = (exp) => exp ? exp.charAt(0).toUpperCase() + exp.slice(1) : '';

  if (loading) {
    return (
      <div className="screen trainer-screen">
        <div className="screen-content spinner-center">
          <div className="spinner spinner-primary" style={{ width: 32, height: 32 }} />
        </div>
      </div>
    );
  }

  const plans = tab === 'predefined' ? predefined : custom;

  return (
    <div className="screen trainer-screen">
      <div className="screen-content">
        <div className="top-bar">
          <h1 className="top-bar-title">Workout Plans</h1>
          <button
            className="top-bar-action"
            onClick={() => navigate('/trainer/workout-plans/create')}
            id="create-plan-btn"
          >
            + Create
          </button>
        </div>

        <div className="tab-row">
          <button className={`tab-pill ${tab === 'predefined' ? 'active' : ''}`} onClick={() => setTab('predefined')}>
            Predefined <span className="tab-count">({predefined.length})</span>
          </button>
          <button className={`tab-pill ${tab === 'custom' ? 'active' : ''}`} onClick={() => setTab('custom')}>
            Custom <span className="tab-count">({custom.length})</span>
          </button>
        </div>

        {plans.length > 0 ? (
          plans.map(plan => (
            <div key={plan.id} className="plan-card glass-card" onClick={() => navigate(`/trainer/workout-plans/${plan.id}`)}>
              <div className="plan-card-header">
                <h3 className="plan-card-name">{plan.name}</h3>
                <div className="plan-badges">
                  <span className="plan-badge goal">{goalBadge(plan.target_goal)}</span>
                  <span className="plan-badge exp">{expBadge(plan.target_experience)}</span>
                </div>
              </div>
              <div className="plan-card-meta">
                <span>{plan.total_days} days</span>
                <span>•</span>
                <span>{plan.days_per_week} days/week</span>
              </div>
              {tab === 'predefined' && (
                <button
                  className="btn-ghost plan-template-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate('/trainer/workout-plans/create', { state: { templateId: plan.id } });
                  }}
                >
                  Use as template
                </button>
              )}
            </div>
          ))
        ) : tab === 'custom' ? (
          <div className="empty-state">
            <h3 className="empty-title">No custom plans yet</h3>
            <p className="empty-subtitle">Create one or use a predefined plan as template.</p>
            <button className="btn-primary" style={{ width: 'auto', padding: '12px 28px' }}
              onClick={() => navigate('/trainer/workout-plans/create')}>+ Create plan</button>
          </div>
        ) : (
          <div className="empty-state">
            <h3 className="empty-title">No predefined plans found</h3>
            <p className="empty-subtitle">Plans will be seeded automatically on next reload.</p>
          </div>
        )}
      </div>
      <BottomNav activeTab="plans" role="trainer" />
    </div>
  );
};

export default WorkoutPlanList;
