import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getUser, getPredefinedPlans, getGymCustomPlans, assignWorkoutPlanToMember } from '../../firebase/firestore';
import './Trainer.css';

const AssignWorkout = () => {
  const navigate = useNavigate();
  const { id: memberId } = useParams();
  const { userDoc } = useAuth();
  const { showToast } = useToast();

  const [member, setMember] = useState(null);
  const [predefined, setPredefined] = useState([]);
  const [custom, setCustom] = useState([]);
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState('predefined');
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      try {
        const [m, pre, cust] = await Promise.all([
          getUser(memberId),
          getPredefinedPlans(),
          userDoc?.gym_id ? getGymCustomPlans(userDoc.gym_id) : [],
        ]);
        setMember(m);
        setPredefined(pre);
        setCustom(cust);
        if (m?.workout_plan_id) setSelected(m.workout_plan_id);
      } catch (err) {
        console.error(err);
        showToast('Failed to load data', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [memberId, userDoc?.gym_id]);

  const handleAssign = async () => {
    if (!selected) { showToast('Select a plan first', 'error'); return; }
    setAssigning(true);
    try {
      await assignWorkoutPlanToMember(memberId, selected);
      showToast(`Workout plan assigned to ${member?.name}`, 'success');
      navigate(-1);
    } catch (err) {
      console.error(err);
      showToast('Failed to assign plan', 'error');
    } finally {
      setAssigning(false);
    }
  };

  const goalLabel = g => ({ fat_loss: 'Fat loss', muscle: 'Muscle', endurance: 'Endurance', general: 'General' }[g] || g);

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
          <button className="back-btn" onClick={() => navigate(-1)} style={{ marginBottom: 0 }}>← Back</button>
          <h1 className="top-bar-title">Assign Workout</h1>
          <div style={{ width: 60 }} />
        </div>

        <div className="assign-current glass-card">
          <div className="assign-current-label">Member</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{member?.name}</div>
          <div className="assign-current-label">
            Current plan: <span className="assign-current-plan">
              {member?.workout_plan_id ? 'Assigned' : 'None'}
            </span>
          </div>
        </div>

        <div className="tab-row">
          <button className={`tab-pill ${tab === 'predefined' ? 'active' : ''}`} onClick={() => setTab('predefined')}>
            Predefined
          </button>
          <button className={`tab-pill ${tab === 'custom' ? 'active' : ''}`} onClick={() => setTab('custom')}>
            Custom
          </button>
        </div>

        {plans.map(plan => (
          <div key={plan.id}
            className={`plan-card glass-card ${selected === plan.id ? 'selected' : ''}`}
            onClick={() => setSelected(plan.id)}>
            <div className="plan-card-header">
              <h3 className="plan-card-name">{plan.name}</h3>
              <div className="plan-badges">
                <span className="plan-badge goal">{goalLabel(plan.target_goal)}</span>
              </div>
            </div>
            <div className="plan-card-meta">
              <span>{plan.target_experience}</span>
              <span>•</span>
              <span>{plan.days_per_week} days/week</span>
              <span>•</span>
              <span>{plan.total_days} days</span>
            </div>
          </div>
        ))}

        {tab === 'custom' && custom.length === 0 && (
          <div className="empty-state">
            <p className="empty-subtitle">No custom plans. Create one first.</p>
            <button className="btn-primary" style={{ width: 'auto', padding: '10px 24px' }}
              onClick={() => navigate('/trainer/workout-plans/create')}>Create plan</button>
          </div>
        )}

        <button className="btn-primary" onClick={handleAssign} disabled={assigning || !selected}
          style={{ marginTop: 16, marginBottom: 20 }}>
          {assigning ? <div className="spinner" /> : 'Assign plan'}
        </button>
      </div>
    </div>
  );
};

export default AssignWorkout;
