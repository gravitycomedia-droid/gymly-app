import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import html2canvas from 'html2canvas';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getGym, getWorkoutPlan } from '../../firebase/firestore';
import { getExpiryStatus, formatDate, getInitials, getPlanName } from '../../utils/helpers';
import './MemberCard.css';

const DEFAULT_SETTINGS = {
  show_gym_name: true,
  show_member_name: true,
  show_photo: true,
  show_member_id: true,
  show_enrollment_id: true,
  show_plan: true,
  show_expiry: true,
  show_phone: false,
  show_qr: true,
  show_status: true,
};

const MemberCard = () => {
  const navigate = useNavigate();
  const { user, userDoc } = useAuth();
  const { showToast } = useToast();
  
  const cardRef = useRef(null);
  const [gym, setGym] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [cs, setCs] = useState(DEFAULT_SETTINGS); // card_settings

  useEffect(() => {
    if (userDoc?.gym_id) {
      getGym(userDoc.gym_id).then(g => {
        setGym(g);
        if (g?.card_settings) {
          setCs({ ...DEFAULT_SETTINGS, ...g.card_settings });
        }
      }).catch(console.error);
    }
  }, [userDoc?.gym_id]);

  const { label: statusLabel, type: statusType } = getExpiryStatus(userDoc?.subscription_expiry);
  const planName = getPlanName(gym, userDoc?.plan_id) || 'Gym Access';
  const publicUrl = `${window.location.origin}/public/member/${user?.uid}`;

  const statusColors = {
    active:   { bg: 'rgba(29,158,117,0.15)',  color: '#006e28',  dot: '#006e28' },
    expiring: { bg: 'rgba(239,159,39,0.15)',  color: '#EF9F27',  dot: '#EF9F27' },
    expired:  { bg: 'rgba(186,26,26,0.15)',   color: '#ba1a1a',  dot: '#ba1a1a' },
  };
  const sc = statusColors[statusType] || statusColors.active;

  const handleDownload = async () => {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: null,
        scale: 3,
        useCORS: true
      });
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `Gymly-${(userDoc?.name || 'Member').replace(' ', '')}-Card.png`;
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

        {/* ── The Card ── */}
        <div
          ref={cardRef}
          style={{
            background: 'linear-gradient(135deg, #1a1040 0%, #2d1b69 50%, #1a2980 100%)',
            borderRadius: 20, padding: '20px', width: '100%', maxWidth: 380,
            boxShadow: '0 20px 60px rgba(83,74,183,0.35)',
            position: 'relative', overflow: 'hidden',
          }}
        >
          {/* Decorative blobs */}
          <div style={{ position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: '50%', background: 'rgba(83,74,183,0.3)', filter: 'blur(30px)' }} />
          <div style={{ position: 'absolute', bottom: -30, left: -30, width: 100, height: 100, borderRadius: '50%', background: 'rgba(55,138,221,0.25)', filter: 'blur(25px)' }} />

          <div style={{ position: 'relative', zIndex: 1 }}>
            {/* Top row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                {cs.show_gym_name && (
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>
                    {gym?.name || 'My Gym'}
                  </div>
                )}
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', letterSpacing: 0.5 }}>GYMLY MEMBER CARD</div>
              </div>
              {cs.show_status && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: sc.bg, padding: '4px 10px', borderRadius: 99 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: sc.dot }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: sc.color }}>{statusLabel}</span>
                </div>
              )}
            </div>

            {/* Middle row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
              {cs.show_photo && (
                <div style={{
                  width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
                  border: '2px solid rgba(255,255,255,0.3)', overflow: 'hidden',
                  background: 'linear-gradient(135deg, #7c6fe8, #378add)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {userDoc?.profile_photo
                    ? <img src={userDoc.profile_photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{getInitials(userDoc?.name)}</span>
                  }
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                {cs.show_member_name && (
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {userDoc?.name}
                  </div>
                )}
                {cs.show_plan && (
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>{planName}</div>
                )}
                {cs.show_member_id && (
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>
                    #{userDoc?.memberNumber || `MEM-${userDoc?.id?.substring(0, 6)}`}
                  </div>
                )}
                {cs.show_enrollment_id && userDoc?.latestEnrollmentNumber && (
                  <div style={{ display: 'inline-block', marginTop: 4, fontSize: 10, fontWeight: 700, color: '#4ade80', background: 'rgba(74,222,128,0.15)', padding: '2px 8px', borderRadius: 6, fontFamily: 'monospace' }}>
                    {userDoc.latestEnrollmentNumber}
                  </div>
                )}
              </div>
              {cs.show_qr && (
                <div style={{ background: '#fff', padding: 6, borderRadius: 10, flexShrink: 0 }}>
                  <QRCodeSVG value={publicUrl} size={52} bgColor="transparent" fgColor="#1A1A1A" level="M" />
                </div>
              )}
            </div>

            {/* Bottom row */}
            {(cs.show_expiry || cs.show_phone) && (
              <div style={{ display: 'flex', gap: 20, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 12 }}>
                {cs.show_expiry && (
                  <div>
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Valid Till</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginTop: 1 }}>
                      {formatDate(userDoc?.subscription_expiry)}
                    </div>
                  </div>
                )}
                {cs.show_phone && userDoc?.phone && (
                  <div>
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Phone</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginTop: 1 }}>{userDoc.phone}</div>
                  </div>
                )}
              </div>
            )}
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
