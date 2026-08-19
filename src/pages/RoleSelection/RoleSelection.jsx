import { useNavigate } from 'react-router-dom';
import AuthShell from '../Login/AuthShell';

const PERSON_ICON_PATH = 'M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v1.2c0 .7.5 1.2 1.2 1.2h16.8c.7 0 1.2-.5 1.2-1.2v-1.2c0-3.2-6.4-4.8-9.6-4.8z';

const RoleSelection = () => {
  const navigate = useNavigate();

  return (
    <AuthShell
      headline="Your gym, fully managed."
      sub="Everything a gym owner needs — members, payments, renewals and reminders in one place."
      points={[
        'Enrol a member in under a minute',
        'Automatic renewal and dues reminders on WhatsApp',
        'Works offline at the desk and syncs later',
      ]}
    >
      <section data-screen-label="Choose your role">
        <h1 className="gla-title">Welcome to Gymloop</h1>
        <p className="gla-subtitle">How would you like to sign in?</p>

        <button type="button" className="gla-role-card" onClick={() => navigate('/owner/login')} id="role-card-owner">
          <span className="gla-role-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d={PERSON_ICON_PATH} fill="#6C63C7" /></svg>
          </span>
          <span className="gla-role-text">
            <span className="gla-role-title">I&apos;m a gym owner</span>
            <span className="gla-role-sub">Manage your gym</span>
          </span>
          <span className="gla-role-arrow">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
        </button>

        <button type="button" className="gla-role-card" onClick={() => navigate('/member/login')} id="role-card-member">
          <span className="gla-role-icon member">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d={PERSON_ICON_PATH} fill="#1E7A4B" /></svg>
          </span>
          <span className="gla-role-text">
            <span className="gla-role-title">I&apos;m a member</span>
            <span className="gla-role-sub">Track my fitness</span>
          </span>
          <span className="gla-role-arrow">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
        </button>

        <p className="gla-hint-text">New gym? Start here as an owner — sign up takes about five minutes.</p>
      </section>
    </AuthShell>
  );
};

export default RoleSelection;
