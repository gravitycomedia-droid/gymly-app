import { useNavigate } from 'react-router-dom';
import { logout } from '../../firebase/auth';
import { useToast } from '../../context/ToastContext';

const MemberHome = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/select-role', { replace: true });
    } catch (err) {
      showToast('Failed to log out', 'error');
    }
  };

  return (
    <div className="screen" style={{ background: 'var(--grad-otp-member)' }}>
      <div className="screen-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
        <div className="glass-card" style={{ padding: '40px 24px', textAlign: 'center', width: '100%' }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: '#E1F5EE',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v1.2c0 .7.5 1.2 1.2 1.2h16.8c.7 0 1.2-.5 1.2-1.2v-1.2c0-3.2-6.4-4.8-9.6-4.8z" fill="#1D9E75"/>
            </svg>
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Welcome, Member!</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.5 }}>
            Your member dashboard is coming soon in Phase 3. Stay tuned!
          </p>
          <button
            className="btn-primary btn-member"
            onClick={handleLogout}
            style={{ marginBottom: 0 }}
            id="member-logout-btn"
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
};

export default MemberHome;
