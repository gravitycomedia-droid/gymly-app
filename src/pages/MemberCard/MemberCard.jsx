import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import html2canvas from 'html2canvas';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getGym, getWorkoutPlan } from '../../firebase/firestore';
import { getExpiryStatus, formatDate, getInitials, getPlanName } from '../../utils/helpers';
import './MemberCard.css';

const MemberCard = () => {
  const navigate = useNavigate();
  const { user, userDoc } = useAuth();
  const { showToast } = useToast();
  
  const cardRef = useRef(null);
  const [gym, setGym] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (userDoc?.gym_id) {
      getGym(userDoc.gym_id).then(setGym).catch(console.error);
    }
  }, [userDoc?.gym_id]);

  const { label: statusLabel, type: statusType } = getExpiryStatus(userDoc?.subscription_expiry);
  const planName = getPlanName(gym, userDoc?.plan_id) || 'Gym Access';
  const publicUrl = `${window.location.origin}/public/member/${user?.uid}`;

  const handleDownload = async () => {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: null,
        scale: 3, // Highres
        useCORS: true
      });
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `Gymly-${userDoc?.name.replace(' ', '')}-Card.png`;
      a.click();
      showToast('Card downloaded successfully', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to download card', 'error');
    } finally {
      setDownloading(false);
    }
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'My Gymly Membership',
          text: `Check out my gym membership card for ${gym?.name || 'Gymly'}`,
          url: publicUrl,
        });
      } else {
        await navigator.clipboard.writeText(publicUrl);
        showToast('Link copied to clipboard!', 'success');
      }
    } catch (err) {
      console.log('Error sharing', err);
    }
  };

  return (
    <div className="screen member-card-screen">
      <div className="screen-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div className="top-bar" style={{ width: '100%', marginBottom: 40 }}>
          <button className="back-btn" onClick={() => navigate(-1)} style={{ marginBottom: 0 }}>← Back</button>
          <h1 className="top-bar-title">Digital ID</h1>
          <div style={{ width: 60 }} />
        </div>

        {/* The Card */}
        <div className="id-card-wrapper" ref={cardRef}>
          <div className={`id-card type-${statusType}`}>
            
            {/* Background design */}
            <div className="id-card-blob blob-1"></div>
            <div className="id-card-blob blob-2"></div>
            
            <div className="id-card-content">
              <div className="id-card-top">
                <div className="id-gym-name">{gym?.name || 'My Gym'}</div>
                <div className="id-logo-text">GYMLY</div>
              </div>

              <div className="id-card-middle">
                <div>
                  <div className="id-member-name">{userDoc?.name}</div>
                  <div className="id-plan-name">{planName}</div>
                </div>
                <div className="id-qr-box">
                  <QRCodeSVG value={publicUrl} size={64} bgColor="transparent" fgColor="#1A1A1A" level="M" />
                </div>
              </div>

              <div className="id-card-bottom">
                <div>
                  <div className="id-label">Valid Till</div>
                  <div className="id-value">{formatDate(userDoc?.subscription_expiry)}</div>
                </div>
                <div>
                  <div className="id-label">Phone</div>
                  <div className="id-value">{userDoc?.phone}</div>
                </div>
                <div className="id-status-badge">
                  <span className={`status-dot ${statusType}`}></span>
                  {statusLabel}
                </div>
              </div>
            </div>
          </div>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', marginTop: 24, marginBottom: 32, padding: '0 20px' }}>
          This card is uniquely generated for you. Show this at the front desk or scan the QR code to verify your membership.
        </p>

        <div className="id-card-actions">
          <button className="btn-primary" onClick={handleDownload} disabled={downloading}>
            {downloading ? <div className="spinner"/> : 'Download PNG'}
          </button>
          <button className="btn-ghost share-btn" onClick={handleShare}>
            Share Link
          </button>
        </div>
      </div>
    </div>
  );
};

export default MemberCard;
