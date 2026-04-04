import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { getUser, getGym } from '../../firebase/firestore';
import { getExpiryStatus, formatDate, getPlanName } from '../../utils/helpers';
import './PublicCard.css';

const PublicCard = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [member, setMember] = useState(null);
  const [gym, setGym] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchMember = async () => {
      try {
        const m = await getUser(id);
        if (!m || m.role !== 'member') {
          setError('Invalid or inactive member ID.');
          setLoading(false);
          return;
        }
        setMember(m);
        if (m.gym_id) {
          const g = await getGym(m.gym_id);
          setGym(g);
        }
      } catch (err) {
        console.error(err);
        setError('Could not verify membership at this time.');
      } finally {
        setLoading(false);
      }
    };
    fetchMember();
  }, [id]);

  if (loading) {
    return (
      <div className="public-card-screen">
        <div className="spinner spinner-primary" style={{ width: 32, height: 32 }} />
      </div>
    );
  }

  if (error || !member) {
    return (
      <div className="public-card-screen">
        <div className="error-card glass-card">
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ marginBottom: 8, color: 'var(--text-primary)' }}>Verification Failed</h2>
          <p style={{ color: 'var(--text-muted)' }}>{error}</p>
        </div>
        <div className="watermark">GYMLY VERIFICATION SYSTEM</div>
      </div>
    );
  }

  const { label: statusLabel, type: statusType, daysText } = getExpiryStatus(member.subscription_expiry);
  const planName = getPlanName(gym, member.plan_id) || 'Gym Access';

  return (
    <div className="public-card-screen">
      
      {/* Verification Banner */}
      <div className={`verification-banner type-${statusType}`}>
        {statusType === 'active' && '✓ Valid Membership'}
        {statusType === 'expiring' && '⚠️ Membership Expiring Soon'}
        {statusType === 'expired' && '❌ Membership Expired'}
      </div>

      <div className="main-card glass-card">
        <div className="gym-header">
          <h2>{gym?.name || 'Gymly Partner'}</h2>
        </div>

        <div className="member-info">
          <div className="member-name">{member.name}</div>
          <div className="member-plan">{planName}</div>
        </div>

        <div className="details-grid">
          <div className="detail-item">
            <span className="detail-label">Status</span>
            <span className={`detail-value status-${statusType}`}>{statusLabel}</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Valid Until</span>
            <span className="detail-value">{formatDate(member.subscription_expiry)}</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Time Remaining</span>
            <span className="detail-value">{daysText}</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Member ID</span>
            <span className="detail-value" style={{ fontFamily: 'monospace' }}>{id.substring(0, 8).toUpperCase()}</span>
          </div>
        </div>

        <div className="qr-section">
          <div style={{ background: 'white', padding: 12, borderRadius: 16, display: 'inline-block' }}>
            <QRCodeSVG value={window.location.href} size={120} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>Scan to verify</div>
        </div>
      </div>

      <div className="watermark" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
        POWERED BY <strong>GYMLY</strong>
      </div>
    </div>
  );
};

export default PublicCard;
