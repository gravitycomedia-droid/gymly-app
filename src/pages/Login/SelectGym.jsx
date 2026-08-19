import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { logout } from '../../firebase/auth';
import AuthShell from './AuthShell';

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
    <AuthShell
      headline="Your gym membership, on your phone."
      sub="Pick the gym you'd like to open."
      points={[]}
      variant="member"
    >
      <section data-screen-label="Choose your gym">
        <h1 className="gla-title-tight">Choose your gym</h1>
        <p className="gla-subtitle">You&apos;re a member at {memberships.length} gyms. Pick one to continue.</p>
        <div className="gla-gym-list">
          {memberships.map((m) => (
            <button key={m.id} className="gla-gym-card" onClick={() => handleSelect(m.id)} disabled={selecting}>
              <div className="gla-gym-info">
                <span className="gla-gym-name">{m.gym_name}</span>
                {m.plan_name && <span className="gla-gym-plan">{m.plan_name}</span>}
              </div>
              <span className={`gla-gym-badge ${m.active ? 'active' : 'inactive'}`}>{m.active ? 'Active' : 'Expired'}</span>
            </button>
          ))}
        </div>
        {selecting && <div className="gla-gym-loading"><span className="gla-spinner dark" /> Opening…</div>}
        <button type="button" className="gla-back-link" style={{ marginTop: 20 }} onClick={handleSignOut}>
          Sign out
        </button>
      </section>
    </AuthShell>
  );
};

export default SelectGym;
