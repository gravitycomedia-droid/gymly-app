import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getGym } from '../../firebase/firestore';
import { getExpiryStatus, formatDate, getInitials, getAvatarColor, getPlanName } from '../../utils/helpers';
import './MemberCard.css';

const DEFAULT_SETTINGS = {
  show_gym_name: true, show_gymly_label: true, show_member_name: true, show_photo: true,
  show_member_id: true, show_enrollment_id: true, show_plan: true,
  show_expiry: true, show_phone: false, show_qr: true, show_status: true,
  card_enabled: true,
};

const MemberCard = () => {
  const navigate = useNavigate();
  const { user, userDoc } = useAuth();
  const { showToast } = useToast();

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

  const drawCardToCanvas = () => new Promise((resolve) => {
    const W = 800, H = 504, R = 20, SCALE = 2;
    const canvas = document.createElement('canvas');
    canvas.width = W * SCALE;
    canvas.height = H * SCALE;
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Rounded-rect path helper (avoids ctx.roundRect compatibility issues)
    const rrect = (x, y, w, h, r) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
    };

    const loadImg = (src) => new Promise(res => {
      if (!src) { res(null); return; }
      if (src.includes('firebasestorage.googleapis.com') || src.includes('storage.googleapis.com')) {
        fetch(src)
          .then(r => r.blob())
          .then(blob => {
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(url); res(img); };
            img.onerror = () => { URL.revokeObjectURL(url); res(null); };
            img.src = url;
          })
          .catch(() => res(null));
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = src;
    });

    // ── Background gradient (135deg = top-left → bottom-right) ──
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#1a1040');
    grad.addColorStop(0.55, '#2d1b69');
    grad.addColorStop(1, '#1a2980');
    rrect(0, 0, W, H, R);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.save();
    ctx.clip(); // clip all subsequent drawing to the rounded card

    // ── Decorative blobs ──────────────────────────────────────
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#534ab7';
    ctx.beginPath(); ctx.arc(W - 60, -20, 130, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#378add';
    ctx.beginPath(); ctx.arc(-20, H + 10, 90, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // ── Row 1: Gym name + subtitle ────────────────────────────
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    if (cs.show_gym_name) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
      ctx.fillText((gym?.name || 'My Gym').toUpperCase(), 44, 36);
    }
    if (cs.show_gymly_label !== false) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '14px system-ui, -apple-system, sans-serif';
      ctx.fillText('GYMLY MEMBER CARD', 44, cs.show_gym_name ? 66 : 44);
    }

    // ── Avatar circle ─────────────────────────────────────────
    const avatarX = 86, avatarY = 178, avatarR = 52;
    const infoX = cs.show_photo ? 158 : 44;

    if (cs.show_photo) {
      const avatarGrad = ctx.createLinearGradient(
        avatarX - avatarR, avatarY - avatarR, avatarX + avatarR, avatarY + avatarR
      );
      avatarGrad.addColorStop(0, avatarColor.bg || '#EEEDFE');
      avatarGrad.addColorStop(1, '#378add');
      ctx.beginPath();
      ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
      ctx.fillStyle = avatarGrad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Draw initials as fallback (overwritten by photo if it loads)
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 42px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle'; // fixes "letter too low" bug
      ctx.fillText(getInitials(userDoc?.name), avatarX, avatarY);
      ctx.restore();
    }

    // ── Info column ───────────────────────────────────────────
    const qrBoxX = W - 196;
    const maxNameW = (cs.show_qr ? qrBoxX : W - 44) - infoX - 16;
    let infoY = 110;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    if (cs.show_member_name) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px system-ui, -apple-system, sans-serif';
      const nameStr = userDoc?.name || 'Member';
      let displayName = nameStr;
      while (ctx.measureText(displayName).width > maxNameW && displayName.length > 1) {
        displayName = displayName.slice(0, -1);
      }
      if (displayName !== nameStr) displayName += '…';
      ctx.fillText(displayName, infoX, infoY);
      infoY += 42;
    }

    if (cs.show_plan && planName) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '20px system-ui, -apple-system, sans-serif';
      ctx.fillText(planName, infoX, infoY);
      infoY += 28;
    }

    if (cs.show_member_id) {
      const memNum = `#${userDoc?.memberNumber || `MEM-${(userDoc?.id || user?.uid || '').substring(0, 6)}`}`;
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = '16px monospace';
      ctx.fillText(memNum, infoX, infoY);
      infoY += 26;
    }

    if (cs.show_enrollment_id && userDoc?.latestEnrollmentNumber) {
      const enrollText = userDoc.latestEnrollmentNumber;
      ctx.font = 'bold 16px monospace';
      const ePadX = 14, eH = 28;
      const eW = ctx.measureText(enrollText).width + ePadX * 2;
      rrect(infoX, infoY, eW, eH, 6);
      ctx.fillStyle = 'rgba(74,222,128,0.15)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(74,222,128,0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#4ade80';
      ctx.textBaseline = 'middle';
      ctx.fillText(enrollText, infoX + ePadX, infoY + eH / 2);
      ctx.textBaseline = 'top';
    }

    // ── Separator ─────────────────────────────────────────────
    const sepY = H - 110;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(44, sepY); ctx.lineTo(W - 44, sepY);
    ctx.stroke();

    // ── Footer ────────────────────────────────────────────────
    const expiryStr = formatDate(userDoc?.subscription_expiry);
    if (cs.show_expiry) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '13px system-ui, -apple-system, sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText('VALID TILL', 44, sepY + 14);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
      ctx.fillText(expiryStr, 44, sepY + 32);
    }

    if (cs.show_phone && userDoc?.phone) {
      const phoneX = cs.show_expiry ? 300 : 44;
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '13px system-ui, -apple-system, sans-serif';
      ctx.fillText('PHONE', phoneX, sepY + 14);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
      ctx.fillText(userDoc.phone, phoneX, sepY + 32);
    }

    // ── Async: QR code + profile photo ───────────────────────
    const tasks = [];
    if (cs.show_qr) {
      const qrApi = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(publicUrl)}&bgcolor=ffffff&color=000000&margin=8`;
      tasks.push(loadImg(qrApi).then(img => ({ type: 'qr', img })));
    }
    if (cs.show_photo && userDoc?.profile_photo) {
      tasks.push(loadImg(userDoc.profile_photo).then(img => ({ type: 'photo', img })));
    }

    const finish = (results = []) => {
      const qrRes = results.find(r => r.type === 'qr');
      const photoRes = results.find(r => r.type === 'photo');

      // QR code box
      if (qrRes?.img && cs.show_qr) {
        const qrSize = 148, qrPad = 6;
        rrect(qrBoxX, 104, qrSize, qrSize, 10);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.drawImage(qrRes.img, qrBoxX + qrPad, 104 + qrPad, qrSize - qrPad * 2, qrSize - qrPad * 2);
      }

      // Profile photo overwrites the initials
      if (photoRes?.img && cs.show_photo) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(photoRes.img, avatarX - avatarR, avatarY - avatarR, avatarR * 2, avatarR * 2);
        ctx.restore();
      }

      // ── Status badge — drawn LAST so it's always on top ──
      if (cs.show_status) {
        ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
        const textW = ctx.measureText(statusLabel).width;
        const dotR = 5, dotGap = 8, padX = 14, badgeH = 34;
        const badgeW = dotR * 2 + dotGap + textW + padX * 2;
        const badgeX = W - 44 - badgeW;
        const badgeY = 34;
        rrect(badgeX, badgeY, badgeW, badgeH, badgeH / 2);
        ctx.fillStyle = sc.bg;
        ctx.fill();
        ctx.strokeStyle = sc.dot + '30';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = sc.dot;
        ctx.beginPath();
        ctx.arc(badgeX + padX + dotR, badgeY + badgeH / 2, dotR, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = sc.color;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(statusLabel, badgeX + padX + dotR * 2 + dotGap, badgeY + badgeH / 2);
      }

      ctx.restore(); // end rounded-rect clip
      resolve(canvas);
    };

    if (tasks.length === 0) finish();
    else Promise.all(tasks).then(finish);
  });

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const canvas = await drawCardToCanvas();
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
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

  if (gym && cs.card_enabled === false) {
    return (
      <div className="screen member-card-screen">
        <div className="screen-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="top-bar" style={{ width: '100%', marginBottom: 32 }}>
            <button className="back-btn" onClick={() => navigate(-1)} style={{ marginBottom: 0 }}>← Back</button>
            <h1 className="top-bar-title">Digital ID</h1>
            <div style={{ width: 60 }} />
          </div>
          <div style={{ textAlign: 'center', padding: '40px 32px' }}>
            <div style={{ fontSize: 52, marginBottom: 20 }}>🔒</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary, #1b1b1d)', marginBottom: 10 }}>Card Not Available</h2>
            <p style={{ fontSize: 14, color: 'var(--text-muted, #787584)', lineHeight: 1.7 }}>
              Your gym has disabled the digital membership card. Contact the gym for details.
            </p>
          </div>
        </div>
      </div>
    );
  }

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
                {cs.show_gymly_label !== false && <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.8, textTransform: 'uppercase' }}>Gymly Member Card</div>}
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
