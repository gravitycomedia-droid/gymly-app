import { useNavigate } from 'react-router-dom';

/**
 * WorkoutLocked — shown when the gym owner has not enabled workout access.
 * Renders a lock screen with a "Contact Gym Owner" message.
 */
const WorkoutLocked = () => {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px',
      background: 'var(--grad-role, #f6f3f5)',
      textAlign: 'center',
    }}>
      {/* Lock icon */}
      <div style={{
        width: 80, height: 80, borderRadius: '50%',
        background: 'rgba(83,74,183,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 24,
        boxShadow: '0 4px 24px rgba(83,74,183,0.15)',
      }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#534ab7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0110 0v4"/>
        </svg>
      </div>

      <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1b1b1d', marginBottom: 10 }}>
        Workout Plans Locked
      </h2>
      <p style={{ fontSize: 14, color: '#787584', lineHeight: 1.6, maxWidth: 300, marginBottom: 32 }}>
        Your gym owner hasn&apos;t enabled workout plan access yet. Contact them to get started with your personalised plan.
      </p>

      <div style={{
        background: 'rgba(255,255,255,0.7)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.8)',
        borderRadius: 20, padding: '20px 24px',
        maxWidth: 340, width: '100%',
        boxShadow: '0 4px 16px rgba(83,74,183,0.08)',
        marginBottom: 24,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#474553', marginBottom: 6 }}>
          💡 What you can do
        </div>
        <ul style={{ fontSize: 13, color: '#787584', lineHeight: 1.8, textAlign: 'left', paddingLeft: 18, margin: 0 }}>
          <li>Ask your gym owner to enable workout access</li>
          <li>They can toggle this in Owner Settings → Member Experience</li>
          <li>Once enabled, your plan will appear here</li>
        </ul>
      </div>

      <button
        onClick={() => navigate(-1)}
        style={{
          padding: '12px 32px', borderRadius: 99,
          background: 'linear-gradient(135deg, #534ab7, #378add)',
          color: '#fff', border: 'none', fontWeight: 700, fontSize: 14,
          cursor: 'pointer', boxShadow: '0 4px 16px rgba(83,74,183,0.25)',
        }}
      >
        ← Go Back
      </button>
    </div>
  );
};

export default WorkoutLocked;
