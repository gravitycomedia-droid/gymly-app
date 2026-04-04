import { useNavigate } from 'react-router-dom';
import './RoleSelection.css';

const RoleSelection = () => {
  const navigate = useNavigate();

  return (
    <div className="screen role-screen">
      <div className="screen-content">
        <div className="role-header">
          {/* Logo Mark */}
          <div className="role-logo glass-card">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="1" y="10" width="4" height="4" rx="1" fill="#534AB7"/>
              <rect x="19" y="10" width="4" height="4" rx="1" fill="#534AB7"/>
              <rect x="5" y="8" width="3" height="8" rx="1.5" fill="#534AB7" opacity="0.7"/>
              <rect x="16" y="8" width="3" height="8" rx="1.5" fill="#534AB7" opacity="0.7"/>
              <rect x="8" y="11" width="8" height="2" rx="1" fill="#534AB7"/>
            </svg>
          </div>

          {/* App Name */}
          <h1 className="role-app-name">Gymly</h1>
          <p className="role-tagline">Your gym, fully managed.</p>
        </div>

        {/* Role Cards */}
        <div className="role-cards">
          {/* Gym Owner Card */}
          <div
            className="role-card glass-card"
            onClick={() => navigate('/owner/login')}
            role="button"
            tabIndex={0}
            id="role-card-owner"
          >
            <div className="role-icon-container role-icon-owner">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v1.2c0 .7.5 1.2 1.2 1.2h16.8c.7 0 1.2-.5 1.2-1.2v-1.2c0-3.2-6.4-4.8-9.6-4.8z" fill="#534AB7"/>
              </svg>
            </div>
            <div className="role-card-text">
              <div className="role-card-title">I&apos;m a gym owner</div>
              <div className="role-card-subtitle">Manage your gym</div>
            </div>
            <div className="role-arrow">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>

          {/* Member Card */}
          <div
            className="role-card glass-card"
            onClick={() => navigate('/member/login')}
            role="button"
            tabIndex={0}
            id="role-card-member"
          >
            <div className="role-icon-container role-icon-member">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v1.2c0 .7.5 1.2 1.2 1.2h16.8c.7 0 1.2-.5 1.2-1.2v-1.2c0-3.2-6.4-4.8-9.6-4.8z" fill="#1D9E75"/>
              </svg>
            </div>
            <div className="role-card-text">
              <div className="role-card-title">I&apos;m a member</div>
              <div className="role-card-subtitle">Track my fitness</div>
            </div>
            <div className="role-arrow">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
        </div>

        {/* Bottom Note */}
        <p className="role-bottom-note">New gym? Start here as an owner.</p>
      </div>
    </div>
  );
};

export default RoleSelection;
