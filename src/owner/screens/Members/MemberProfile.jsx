import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { getUser, getGym, updateMember } from '../../../firebase/firestore';
import { getMemberPaymentsRealtime, clearPaymentDue, updatePayment } from '../../../firebase/firestore-payments';
import { getInitials, getExpiryStatus, formatDate, getPlanName, getDaysRemaining } from '../../../utils/helpers';
import { getAvatarColor } from '../../lib/avatarColor';
import RenewModal from '../../../components/RenewModal';
import DeleteConfirmModal from '../../../components/DeleteConfirmModal';
import { QRCodeCanvas } from 'qrcode.react';
import { uploadMemberPhoto } from '../../../firebase/storage';
import Badge from '../../primitives/Badge';
import MembershipCard from '../../components/MembershipCard';

const DEFAULT_CS = {
  show_gym_name: true, show_gymly_label: true, show_member_name: true, show_photo: true,
  show_member_id: true, show_enrollment_id: true, show_plan: true, show_expiry: true,
  show_phone: false, show_qr: true, show_status: true, card_enabled: true,
};

const STATUS_COLORS = {
  active: { bg: 'rgba(15,94,60,0.15)', color: '#0F5E3C', dot: '#0F5E3C' },
  expiring: { bg: 'rgba(138,75,0,0.15)', color: '#8A4B00', dot: '#8A4B00' },
  expired: { bg: 'rgba(166,44,34,0.15)', color: '#A62C22', dot: '#A62C22' },
};

export default function MemberProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  const { showToast } = useToast();

  const [member, setMember] = useState(null);
  const [gym, setGym] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showRenew, setShowRenew] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showCardModal, setShowCardModal] = useState(false);
  const [memberPayments, setMemberPayments] = useState([]);
  const [clearingId, setClearingId] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const photoInputRef = useRef(null);
  const qrCanvasRef = useRef(null);

  const fetchData = async () => {
    try {
      const [memberDoc, gymDoc] = await Promise.all([getUser(id), userDoc?.gym_id ? getGym(userDoc.gym_id) : null]);
      setMember(memberDoc);
      setGym(gymDoc);
    } catch (err) {
      console.error('Error fetching member:', err);
      showToast('Failed to load member', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [id, userDoc?.gym_id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!userDoc?.gym_id || !id) return;
    const unsub = getMemberPaymentsRealtime(userDoc.gym_id, id, setMemberPayments);
    return () => unsub();
  }, [userDoc?.gym_id, id]);

  const handlePhotoChange = async (e) => {
    const file = e.target.files[0];
    if (!file || !userDoc?.gym_id) return;
    setUploadingPhoto(true);
    try {
      const photoUrl = await uploadMemberPhoto(userDoc.gym_id, id, file);
      await updateMember(id, { profile_photo: photoUrl });
      setMember((prev) => ({ ...prev, profile_photo: photoUrl }));
      showToast('Photo updated!', 'success');
    } catch (err) {
      showToast(`Photo upload failed: ${err.message}`, 'error');
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const handleClearDue = async (payment) => {
    setClearingId(payment.id);
    try {
      await clearPaymentDue(payment.id, id);
      await updatePayment(payment.id, { paid_amount: payment.final_amount, pending_amount: 0, status: 'paid' });
      showToast('Due cleared!', 'success');
    } catch (e) {
      showToast(`Failed to clear due: ${e.message}`, 'error');
    } finally {
      setClearingId(null);
    }
  };

  const handleDelete = async (deletePayments = false) => {
    try {
      const { httpsCallable } = await import('firebase/functions');
      const { functions } = await import('../../../firebase/config');
      await httpsCallable(functions, 'softDeleteMember')({ memberId: member.id, gymId: member.gym_id, deletePayments });
      showToast(deletePayments ? 'Member and payments deleted' : 'Member moved to Recycle Bin', 'success');
      navigate('/owner/members');
    } catch (err) {
      console.error('Delete member error:', err);
      showToast('Failed to delete member', 'error');
    }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}><div className="spinner spinner-primary" style={{ width: 32, height: 32 }} /></div>;
  if (!member) return <div style={{ textAlign: 'center', padding: '60px 0' }}><p style={{ fontWeight: 700, marginBottom: 12 }}>Member not found</p><button type="button" className="gl2-btn gl2-btn-secondary" onClick={() => navigate('/owner/members')}>Back to members</button></div>;

  const { label, type, daysText } = getExpiryStatus(member.subscription_expiry);
  const planName = getPlanName(gym, member.plan_id);
  const plans = (gym?.settings?.plans?.filter((p) => p.is_active) || []).sort((a, b) => (a.duration_days || 0) - (b.duration_days || 0));
  const currentPlan = plans.find((p) => p.id === member.plan_id);
  const cs = { ...DEFAULT_CS, ...(gym?.card_settings || {}) };
  const sc = STATUS_COLORS[type] || STATUS_COLORS.active;

  const activePayments = [...memberPayments].filter((p) => p.membership_end).sort((a, b) => {
    const tA = a.membership_end?.toDate ? a.membership_end.toDate().getTime() : new Date(a.membership_end).getTime();
    const tB = b.membership_end?.toDate ? b.membership_end.toDate().getTime() : new Date(b.membership_end).getTime();
    return tB - tA;
  });
  const latestPayment = activePayments[0] || null;

  let totalDays = currentPlan?.duration_days || 30;
  let daysUsed = 0;
  let daysRemaining;
  if (latestPayment?.membership_start && latestPayment?.membership_end) {
    const start = latestPayment.membership_start?.toDate ? latestPayment.membership_start.toDate() : new Date(latestPayment.membership_start);
    const end = latestPayment.membership_end?.toDate ? latestPayment.membership_end.toDate() : new Date(latestPayment.membership_end);
    const now = new Date();
    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    totalDays = Math.max(1, Math.round((endDay - startDay) / 86400000));
    daysUsed = today < startDay ? 0 : today >= endDay ? totalDays : Math.floor((today - startDay) / 86400000) + 1;
    daysRemaining = Math.max(0, totalDays - daysUsed);
  } else {
    daysRemaining = Math.max(0, getDaysRemaining(member.subscription_expiry));
    daysUsed = Math.max(0, totalDays - daysRemaining);
  }
  const progressPercent = Math.min(100, Math.max(0, (daysUsed / totalDays) * 100));
  const publicUrl = `${window.location.origin}/public/member/${member.id}`;

  const drawCardToCanvas = () => new Promise((resolve) => {
    const W = 800, H = 504, R = 20, SCALE = 2;
    const canvas = document.createElement('canvas');
    canvas.width = W * SCALE; canvas.height = H * SCALE;
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    const rrect = (x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath(); };
    const loadImg = (src) => new Promise((res) => {
      if (!src) { res(null); return; }
      fetch(src).then((r) => r.blob()).then((blob) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); res(img); };
        img.onerror = () => { URL.revokeObjectURL(url); res(null); };
        img.src = url;
      }).catch(() => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => res(img);
        img.onerror = () => res(null);
        img.src = src;
      });
    });

    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#1a1040'); grad.addColorStop(0.55, '#2d1b69'); grad.addColorStop(1, '#1a2980');
    rrect(0, 0, W, H, R); ctx.fillStyle = grad; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#6C63C7'; ctx.beginPath(); ctx.arc(W - 60, -20, 130, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3E7CB1'; ctx.beginPath(); ctx.arc(-20, H + 10, 90, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    if (cs.show_gym_name) { ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = 'bold 26px system-ui, -apple-system, sans-serif'; ctx.fillText((gym?.name || 'My Gym').toUpperCase(), 44, 36); }
    if (cs.show_gymly_label !== false) { ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '14px system-ui, -apple-system, sans-serif'; ctx.fillText('GYMLY MEMBER CARD', 44, cs.show_gym_name ? 66 : 44); }

    const avatarX = 86, avatarY = 178, avatarR = 52;
    const infoX = cs.show_photo ? 158 : 44;
    const avatarColor = getAvatarColor(member.name);

    if (cs.show_photo) {
      const avatarGrad = ctx.createLinearGradient(avatarX - avatarR, avatarY - avatarR, avatarX + avatarR, avatarY + avatarR);
      avatarGrad.addColorStop(0, avatarColor); avatarGrad.addColorStop(1, '#3E7CB1');
      ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2); ctx.fillStyle = avatarGrad; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.save(); ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 42px system-ui, -apple-system, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(getInitials(member.name), avatarX, avatarY); ctx.restore();
    }

    const qrBoxX = W - 196;
    const maxNameW = (cs.show_qr ? qrBoxX : W - 44) - infoX - 16;
    let infoY = 110;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';

    if (cs.show_member_name) {
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 36px system-ui, -apple-system, sans-serif';
      let displayName = member.name || 'Member';
      while (ctx.measureText(displayName).width > maxNameW && displayName.length > 1) displayName = displayName.slice(0, -1);
      if (displayName !== (member.name || 'Member')) displayName += '…';
      ctx.fillText(displayName, infoX, infoY); infoY += 42;
    }
    if (cs.show_plan && planName) { ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '20px system-ui, -apple-system, sans-serif'; ctx.fillText(planName, infoX, infoY); infoY += 28; }
    if (cs.show_member_id) { ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = '16px monospace'; ctx.fillText(`#${member.memberNumber || `MEM-${member.id.substring(0, 6)}`}`, infoX, infoY); infoY += 26; }
    if (cs.show_enrollment_id && member.latestEnrollmentNumber) {
      const enrollText = member.latestEnrollmentNumber;
      ctx.font = 'bold 32px monospace';
      const ePadX = 18, eH = 52;
      const eW = ctx.measureText(enrollText).width + ePadX * 2;
      rrect(infoX, infoY, eW, eH, 6); ctx.fillStyle = 'rgba(123,227,174,0.15)'; ctx.fill();
      ctx.strokeStyle = 'rgba(123,227,174,0.25)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#7BE3AE'; ctx.textBaseline = 'middle'; ctx.fillText(enrollText, infoX + ePadX, infoY + eH / 2); ctx.textBaseline = 'top';
    }

    const sepY = H - 110;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(44, sepY); ctx.lineTo(W - 44, sepY); ctx.stroke();

    const expiryStr = member.subscription_expiry ? formatDate(member.subscription_expiry) : 'N/A';
    if (cs.show_expiry) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '13px system-ui, -apple-system, sans-serif'; ctx.textBaseline = 'top';
      ctx.fillText('VALID TILL', 44, sepY + 14);
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 24px system-ui, -apple-system, sans-serif'; ctx.fillText(expiryStr, 44, sepY + 32);
    }
    if (cs.show_phone && member.phone) {
      const phoneX = cs.show_expiry ? 300 : 44;
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '13px system-ui, -apple-system, sans-serif'; ctx.fillText('PHONE', phoneX, sepY + 14);
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 24px system-ui, -apple-system, sans-serif'; ctx.fillText(member.phone, phoneX, sepY + 32);
    }
    if (cs.show_qr && qrCanvasRef.current) {
      const qrSize = 148, qrPad = 6;
      rrect(qrBoxX, 104, qrSize, qrSize, 10); ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.drawImage(qrCanvasRef.current, qrBoxX + qrPad, 104 + qrPad, qrSize - qrPad * 2, qrSize - qrPad * 2);
    }

    const tasks = [];
    if (cs.show_photo && member.profile_photo) tasks.push(loadImg(member.profile_photo).then((img) => ({ type: 'photo', img })));

    const finish = (results = []) => {
      const photoRes = results.find((r) => r.type === 'photo');
      if (photoRes?.img && cs.show_photo) {
        ctx.save(); ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(photoRes.img, avatarX - avatarR, avatarY - avatarR, avatarR * 2, avatarR * 2); ctx.restore();
      }
      if (cs.show_status) {
        ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
        const textW = ctx.measureText(label).width;
        const dotR = 5, dotGap = 8, padX = 14, badgeH = 34;
        const badgeW = dotR * 2 + dotGap + textW + padX * 2;
        const badgeX = W - 44 - badgeW, badgeY = 34;
        rrect(badgeX, badgeY, badgeW, badgeH, badgeH / 2); ctx.fillStyle = sc.bg; ctx.fill();
        ctx.strokeStyle = `${sc.dot}30`; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = sc.dot; ctx.beginPath(); ctx.arc(badgeX + padX + dotR, badgeY + badgeH / 2, dotR, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = sc.color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(label, badgeX + padX + dotR * 2 + dotGap, badgeY + badgeH / 2);
      }
      ctx.restore();
      resolve(canvas);
    };
    if (tasks.length === 0) finish(); else Promise.all(tasks).then(finish);
  });

  const downloadCard = async () => {
    setDownloading(true);
    try {
      const canvas = await drawCardToCanvas();
      const link = document.createElement('a');
      link.download = `Gymly_Card_${member.name.replace(/\s+/g, '_')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast('Membership card downloaded!', 'success');
    } catch (err) {
      console.error('Download card error:', err);
      showToast('Failed to download card', 'error');
    } finally {
      setDownloading(false);
    }
  };

  const shareCardOnWhatsApp = async () => {
    if (!member?.phone) { showToast('No phone number for this member', 'error'); return; }
    try {
      const canvas = await drawCardToCanvas();
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const fileName = `Gymly_Card_${member.name.replace(/\s+/g, '_')}.png`;
        const file = new File([blob], fileName, { type: 'image/png' });
        const cardMsg = `Hi ${member.name}! 🏋️ Here is your membership card from ${gym?.name || 'Gymly'}.`;
        if (navigator.canShare?.({ files: [file] })) {
          try { await navigator.share({ title: 'Gymly Membership Card', text: cardMsg, files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
        }
        const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = fileName; a.click();
        const phone = String(member.phone).replace(/[^0-9]/g, '');
        setTimeout(() => window.open(`https://wa.me/${phone}?text=${encodeURIComponent(cardMsg)}`, '_blank'), 600);
      }, 'image/png');
    } catch (err) {
      console.error('Share card error:', err);
      showToast('Failed to send card', 'error');
    }
  };

  return (
    <section data-screen-label="Member Profile">
      <button type="button" className="gl2-back-link" onClick={() => navigate('/owner/members')}>
        <span className="material-symbols-outlined" style={{ fontSize: 17 }}>arrow_back_ios</span>Members
      </button>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1.4fr 1fr', alignItems: 'start' }} className="gl2-grid-2">
        <div className="gl2-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 14 }}>
            <div style={{ position: 'relative' }}>
              <span className="gl2-avatar gl2-avatar-lg" style={{ background: getAvatarColor(member.name), overflow: 'hidden' }}>
                {member.profile_photo ? <img src={member.profile_photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} /> : getInitials(member.name)}
              </span>
              <button type="button" className="gl2-icon-btn" style={{ position: 'absolute', bottom: -4, right: -4, width: 26, height: 26 }} title="Change photo" onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{uploadingPhoto ? 'hourglass_empty' : 'photo_camera'}</span>
              </button>
              <input ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
            </div>
            <div style={{ minWidth: 0 }}>
              {member.latestEnrollmentNumber && <span className="gl2-enroll" style={{ marginBottom: 4 }}>{member.latestEnrollmentNumber}</span>}
              <h1 style={{ margin: '4px 0 0', fontSize: 21, fontWeight: 800, letterSpacing: '-.3px' }}>{member.name}</h1>
              <p style={{ margin: '3px 0 0', fontSize: 14, color: 'var(--gl2-muted)' }}>{member.phone} · {planName}</p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <button type="button" className="gl2-btn gl2-btn-primary" onClick={() => setShowRenew(true)}>Record Payment</button>
            <button type="button" className="gl2-btn gl2-btn-secondary" onClick={() => navigate(`/owner/members/${id}/edit`)}>Edit Member</button>
            <a href={member.phone ? `https://wa.me/${String(member.phone).replace(/[^0-9]/g, '')}` : '#'} target="_blank" rel="noreferrer" className="gl2-btn gl2-btn-secondary">Message</a>
            <button type="button" className="gl2-btn gl2-btn-danger" onClick={() => setShowDelete(true)}>Delete</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10 }}>
            <div className="gl2-kpi-tile" style={{ padding: 11 }}>
              <p className="gl2-kpi-label">Status</p>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{type === 'expired' ? <span style={{ color: 'var(--gl2-danger-fg)' }}>{daysText}</span> : label}</p>
            </div>
            <div className="gl2-kpi-tile" style={{ padding: 11 }}>
              <p className="gl2-kpi-label">Days remaining</p>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{daysRemaining}</p>
            </div>
            <div className="gl2-kpi-tile" style={{ padding: 11 }}>
              <p className="gl2-kpi-label">Plan usage</p>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{daysUsed}/{totalDays}d</p>
              <div className="gl2-progress-track" style={{ marginTop: 6 }}><div className="gl2-progress-fill" style={{ width: `${progressPercent}%` }} /></div>
            </div>
          </div>
        </div>

        <div className="gl2-card">
          <p className="gl2-card-title" style={{ marginBottom: 12 }}>Membership card</p>
          <MembershipCard member={member} gym={gym} cardSettings={cs} statusColor={sc} statusLabel={label} planName={planName} publicUrl={publicUrl} />
          <button type="button" className="gl2-btn gl2-btn-secondary" style={{ width: '100%', marginTop: 12 }} onClick={() => setShowCardModal(true)}>Download / share card</button>
        </div>
      </div>

      <div className="gl2-card" style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
          <p className="gl2-card-title">Payment history</p>
        </div>
        {memberPayments.length === 0 ? (
          <p style={{ margin: 0, fontSize: 14, color: 'var(--gl2-muted)', textAlign: 'center', padding: '20px 0' }}>No payments recorded</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {memberPayments.map((p) => {
              const isPendingOrPartial = p.status === 'pending' || p.status === 'partial';
              const d = p.payment_date?.toDate ? p.payment_date.toDate() : new Date(p.payment_date);
              return (
                <div key={p.id} className="gl2-row">
                  <div style={{ flex: 1, minWidth: 150 }}>
                    <p style={{ margin: 0, fontWeight: 700 }}>{p.plan_name}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--gl2-muted)' }}>{formatDate(d)} · {p.method === 'cash' ? 'Cash' : p.method === 'upi' ? 'UPI' : 'Online'} · #{p.invoice_number}</p>
                    {isPendingOrPartial && <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 700, color: 'var(--gl2-warning-fg)' }}>₹{(p.pending_amount || 0).toLocaleString('en-IN')} pending</p>}
                  </div>
                  <span style={{ fontSize: 16, fontWeight: 800 }}>₹{(p.final_amount || 0).toLocaleString('en-IN')}</span>
                  <Badge variant={p.status === 'paid' ? 'active' : p.status === 'partial' ? 'expiring' : 'expired'}>{p.status}</Badge>
                  {isPendingOrPartial && (
                    <button type="button" className="gl2-btn gl2-btn-secondary" style={{ minHeight: 34, padding: '0 10px' }} onClick={() => handleClearDue(p)} disabled={clearingId === p.id}>
                      {clearingId === p.id ? '…' : '✓ Clear due'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {member.medical_notes && (
        <div className="gl2-card" style={{ marginTop: 14 }}>
          <p className="gl2-card-title" style={{ marginBottom: 8 }}>Medical notes</p>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--gl2-text)', fontStyle: 'italic' }}>{member.medical_notes}</p>
        </div>
      )}

      {showRenew && <RenewModal member={member} plans={plans} onClose={() => setShowRenew(false)} onSuccess={() => fetchData()} />}
      {showDelete && <DeleteConfirmModal memberName={member.name} onConfirm={handleDelete} onClose={() => setShowDelete(false)} />}

      {showCardModal && (
        <div className="gl2-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14, zIndex: 200 }} onClick={() => setShowCardModal(false)}>
          <div className="gl2-card" style={{ maxWidth: 380, width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <MembershipCard member={member} gym={gym} cardSettings={cs} statusColor={sc} statusLabel={label} planName={planName} publicUrl={publicUrl} />
            <button type="button" className="gl2-btn gl2-btn-primary gl2-btn-lg" style={{ width: '100%', marginTop: 14 }} onClick={downloadCard} disabled={downloading}>{downloading ? 'Preparing…' : 'Download card'}</button>
            <button type="button" className="gl2-btn gl2-btn-lg" style={{ width: '100%', marginTop: 10, background: '#25D366', color: '#fff' }} onClick={shareCardOnWhatsApp}>Send on WhatsApp</button>
            <button type="button" className="gl2-btn gl2-btn-secondary gl2-btn-lg" style={{ width: '100%', marginTop: 10 }} onClick={() => setShowCardModal(false)}>Close</button>
          </div>
        </div>
      )}

      {cs.show_qr && (
        <QRCodeCanvas ref={qrCanvasRef} value={publicUrl} size={148} bgColor="#ffffff" fgColor="#000000" level="M" style={{ position: 'absolute', left: -9999, top: -9999, pointerEvents: 'none' }} />
      )}
    </section>
  );
}
