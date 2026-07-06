import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { logout } from '../../firebase/auth';
import './Login.css';

// Standalone gym picker for a multi-gym member who is authenticated but hasn't
// selected a gym this session (new device, cleared storage, or an interrupted
// first login). Populated from AuthContext.pendingGymSelection.
const SelectGym = () => {
  const navigate = useNavigate();
  const { user, pendingGymSelection, setActiveMembership } = useAuth();
  const { showToast } = useToast();
  const [selecting, setSelecting] = useState(false);

  const memberships = pendingGymSelection || [];

  const handleSelect = async (membershipId) => {
    if (selecting || !user?.uid) return;
    setSelecting(true);
    try {
      await setActiveMembership(user.uid, membershipId);
      navigate('/', { replace: true });
    } catch (err) {
      console.error('Gym selection error:', err);
      showToast('Could not open that gym. Please try again.', 'error');
      setSelecting(false);
    }
  };

  const handleSignOut = async () => {
    try { await logout(); } catch { /* ignore */ }
    navigate('/select-role', { replace: true });
  };

  return (
    <div className="screen login-screen member">
      <div className="screen-content">
        <div className="login-form-card glass-card gym-picker">
          <h2 className="login-heading">Choose your gym</h2>
          <p className="login-subtext">
            You&apos;re a member at {memberships.length} gyms. Pick one to continue.
          </p>
          <div className="gym-picker-list">
            {memberships.map((m) => (
              <button
                key={m.id}
                className="gym-picker-item"
                onClick={() => handleSelect(m.id)}
                disabled={selecting}
              >
                <div className="gym-picker-info">
                  <span className="gym-picker-name">{m.gym_name}</span>
                  {m.plan_name && <span className="gym-picker-plan">{m.plan_name}</span>}
                </div>
                <span className={`gym-picker-badge ${m.active ? 'active' : 'inactive'}`}>
                  {m.active ? 'Active' : 'Expired'}
                </span>
              </button>
            ))}
          </div>
          {selecting && (
            <div className="gym-picker-loading">
              <div className="spinner" /> Opening…
            </div>
          )}
          <button
            className="resend-btn member-accent"
            style={{ marginTop: 20 }}
            onClick={handleSignOut}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
};

export default SelectGym;
