import { useNavigate } from 'react-router-dom';

const AccessRestricted = ({ message }) => {
  const navigate = useNavigate();

  return (
    <div className="screen" style={{ background: 'var(--grad-role)' }}>
      <div
        className="screen-content"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '80vh',
        }}
      >
        <div className="glass-card" style={{ padding: '40px 24px', textAlign: 'center', width: '100%' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'rgba(226, 75, 74, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke="#E24B4A" strokeWidth="2" fill="none" />
              <path d="M7 11V7a5 5 0 0110 0v4" stroke="#E24B4A" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Access restricted</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.5 }}>
            {message || "You don't have permission to view this page."}
          </p>
          <button
            className="btn-primary"
            onClick={() => navigate(-1)}
            style={{ maxWidth: 200, margin: '0 auto' }}
            id="go-back-btn"
          >
            Go back
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccessRestricted;
