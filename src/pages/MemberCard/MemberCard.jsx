import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getGym } from '../../firebase/firestore';
import { getExpiryStatus, formatDate, getInitials, getAvatarColor, getPlanName } from '../../utils/helpers';
import './MemberCard.css';

const DEFAULT_SETTINGS = {
  show_gym_name: true, show_member_name: true, show_photo: true,
  show_member_id: true, show_enrollment_id: true, show_plan: true,
  show_expiry: true, show_phone: false, show_qr: true, show_status: true,
};

const MemberCard = () => {
  const navigate = useNavigate();
  const { user, userDoc } = useAuth();
  const { showToast } = useToast();

  const cardRef = useRef(null);
  const [gym, setGym] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [cs, setCs] = useState(DEFAULT_SETTINGS);

  useEffect(() => {
    if (userDoc?.gym_id) {
      getGym(userDoc.gym_id).then(g => {
        setGym(g);
        if (g?.card_settings) setCs({ ...DEFAULT_SETTINGS, ...g.card_settings });
      }).catch(console.error);
    }
  }, [userDoc?.gym_id]);

  const { label: statusLabel, type: statusType } = getExpiryStatus(userDoc?.subscription_expiry);
  const planName = getPlanName(gym, userDoc?.plan_id) || 'Gym Access';
  const publicUrl = `${window.location.origin}/public/member/${user?.uid}`;
  const avatarColor = getAvatarColor(userDoc?.name);

  const statusColors = {
    active:   { bg: 'rgba(29,158,117,0.18)',  color: '#1D9E75',  dot: '#1D9E75' },
    expiring: { bg: 'rgba(239,159,39,0.18)',  color: '#EF9F27',  dot: '#EF9F27' },
    expired:  { bg: 'rgba(226,75,74,0.18)',   color: '#E24B4A',  dot: '#E24B4A' },
  };
  const sc = statusColors[statusType] || statusColors.active;

  const handleDownload = async () => {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      // Force all images to load before capture
      const images = cardRef.current.querySelectorAll('img');
      await Promise.all(Array.from(images).map(img =>
        img.complete ? Promise.resolve() : new Promise(res => { img.onload = res; img.onerror = res; })
      ));
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: null,
        scale: 3,
        useCORS: true,
        allowTaint: false,
        logging: false,
      });
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `Gymly-${(userDoc?.name || 'Member').replace(/\s+/g, '-')}-Card.png`;
      a.click();
      showToast('Card downloaded!', 'success');
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
        await navigator.share({ title: 'My Gymly Membership', text: `Check out my gym membership at ${gym?.name || 'Gymly'}`, url: publicUrl });
      } else {
        await navigator.clipboard.writeText(publicUrl);
        showToast('Link copied to clipboard!', 'success');
      }
    } catch (err) { console.log('Error sharing', err); }
  };

  return (
    <div className="screen member-card-screen">
      <div className="screen-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div className="top-bar" style={{ width: '100%', marginBottom: 32 }}>
          <button className="back-btn" onClick={() => navigate(-1)} style={{ marginBottom: 0 }}>← Back</button>
          <h1 className="top-bar-title">Digital ID</h1>
          <div style={{ width: 60 }} />
        </div>

        {/* ── The Card (fixed-width, pixel-perfect layout) ── */}
        <div
          ref={cardRef}
          style={{
            background: 'linear-gradient(135deg, #1a1040 0%, #2d1b69 55%, #1a2980 100%)',
            borderRadius: 20,
            width: 340,
            padding: '20px 20px 18px',
            boxShadow: '0 20px 60px rgba(83,74,183,0.35)',
            position: 'relative',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          {/* Decorative blobs */}
          <div style={{ position: 'absolute', top: -40, right: -40, width: 130, height: 130, borderRadius: '50%', background: 'rgba(83,74,183,0.35)', filter: 'blur(28px)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -25, left: -25, width: 90, height: 90, borderRadius: '50%', background: 'rgba(55,138,221,0.3)', filter: 'blur(22px)', pointerEvents: 'none' }} />

          <div style={{ position: 'relative', zIndex: 1 }}>

            {/* ── Row 1: Gym name + Status badge ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                {cs.show_gym_name && (
                  <div style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.75)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 2 }}>
                    {gym?.name || 'My Gym'}
                  </div>
                )}
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.8, textTransform: 'uppercase' }}>Gymly Member Card</div>
              </div>
              {cs.show_status && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: sc.bg, padding: '5px 10px', borderRadius: 99, border: `1px solid ${sc.dot}30` }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: sc.dot, boxShadow: `0 0 6px ${sc.dot}` }} />
                  <span style={{ fontSize: 10, fontWeight: 800, color: sc.color, letterSpacing: 0.3 }}>{statusLabel}</span>
                </div>
              )}
            </div>

            {/* ── Row 2: Photo + Info block ── */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>

              {/* Left: Avatar */}
              {cs.show_photo && (
                <div style={{
                  width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
                  border: '2.5px solid rgba(255,255,255,0.35)', overflow: 'hidden',
                  background: `linear-gradient(135deg, ${avatarColor.bg || '#7c6fe8'}, #378add)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {userDoc?.profile_photo
                    ? <img src={userDoc.profile_photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} crossOrigin="anonymous" />
                    : <span style={{ fontSize: 20, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{getInitials(userDoc?.name)}</span>
                  }
                </div>
              )}

              {/* Center: Name / Plan / IDs */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {cs.show_member_name && (
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', lineHeight: 1.2, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {userDoc?.name}
                  </div>
                )}
                {cs.show_plan && (
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 5 }}>{planName}</div>
                )}
                {cs.show_member_id && (
                  <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace', letterSpacing: 0.3 }}>
                    #{userDoc?.memberNumber || `MEM-${userDoc?.id?.substring(0, 6)}`}
                  </div>
                )}
                {cs.show_enrollment_id && userDoc?.latestEnrollmentNumber && (
                  <div style={{
                    display: 'inline-block', marginTop: 5,
                    fontSize: 10, fontWeight: 700, color: '#4ade80',
                    background: 'rgba(74,222,128,0.15)', padding: '3px 9px', borderRadius: 6,
                    fontFamily: 'monospace', letterSpacing: 0.3, border: '1px solid rgba(74,222,128,0.25)',
                  }}>
                    {userDoc.latestEnrollmentNumber}
                  </div>
                )}
              </div>

              {/* Right: QR code */}
              {cs.show_qr && (
                <div style={{ background: '#fff', padding: 7, borderRadius: 11, flexShrink: 0, alignSelf: 'center' }}>
                  <QRCodeSVG value={publicUrl} size={56} bgColor="#ffffff" fgColor="#1A1A1A" level="M" />
                </div>
              )}
            </div>

            {/* ── Row 3: Expiry / Phone ── */}
            {(cs.show_expiry || cs.show_phone) && (
              <div style={{ display: 'flex', gap: 24, borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 13 }}>
                {cs.show_expiry && (
                  <div>
                    <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>Valid Till</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
                      {formatDate(userDoc?.subscription_expiry)}
                    </div>
                  </div>
                )}
                {cs.show_phone && userDoc?.phone && (
                  <div>
                    <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>Phone</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{userDoc.phone}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', marginTop: 20, marginBottom: 28, padding: '0 20px', lineHeight: 1.5 }}>
          Show this card at the front desk or scan the QR to verify membership.
        </p>

        <div className="id-card-actions">
          <button className="btn-primary" onClick={handleDownload} disabled={downloading}>
            {downloading ? <div className="spinner" /> : 'Download PNG'}
          </button>
          <button className="btn-ghost share-btn" onClick={handleShare}>Share Link</button>
        </div>
      </div>
    </div>
  );
};

export default MemberCard;
