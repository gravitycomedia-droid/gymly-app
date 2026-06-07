import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getUser, getGym, updateMember } from '../../firebase/firestore';
import { getMemberPaymentsRealtime, clearPaymentDue, updatePayment, getMemberPayments } from '../../firebase/firestore-payments';
import { getNumberingSettings } from '../../utils/numberingService';
import {
  getInitials, getAvatarColor, getExpiryStatus,
  formatDate, getPlanName, calculateBMI, getDaysRemaining,
} from '../../utils/helpers';
import RenewModal from '../../components/RenewModal';
import DeleteConfirmModal from '../../components/DeleteConfirmModal';
import BottomNav from '../../components/BottomNav';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { uploadMemberPhoto } from '../../firebase/storage';
import '../MemberCard/MemberCard.css';

// ── Default card settings (mirrors CardEditor defaults) ─────────
const DEFAULT_CS = {
  show_gym_name: true,
  show_gymly_label: true,
  show_member_name: true,
  show_photo: true,
  show_member_id: true,
  show_enrollment_id: true,
  show_plan: true,
  show_expiry: true,
  show_phone: false,
  show_qr: true,
  show_status: true,
  card_enabled: true,
};

const MemberProfile = ({ readOnly = false }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  const { showToast } = useToast();

  const [member, setMember] = useState(null);
  const [gym, setGym] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showRenew, setShowRenew] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [memberPayments, setMemberPayments] = useState([]);
  const [clearingId, setClearingId] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [downloadingCard, setDownloadingCard] = useState(false);
  const [numberingSettings, setNumberingSettings] = useState(null);
  const [showMemberId, setShowMemberId] = useState(false);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const photoInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const qrCanvasRef = useRef(null);

  const handlePhotoChange = async (e) => {
    const file = e.target.files[0];
    if (!file || !userDoc?.gym_id) return;
    setUploadingPhoto(true);
    setShowPhotoPicker(false);
    try {
      const photoUrl = await uploadMemberPhoto(userDoc.gym_id, id, file);
      await updateMember(id, { profile_photo: photoUrl });
      setMember(prev => ({ ...prev, profile_photo: photoUrl }));
      showToast('Photo updated!', 'success');
    } catch (err) {
      showToast('Photo upload failed: ' + err.message, 'error');
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  const fetchData = async () => {
    try {
      const [memberDoc, gymDoc] = await Promise.all([
        getUser(id),
        userDoc?.gym_id ? getGym(userDoc.gym_id) : null,
      ]);
      setMember(memberDoc);
      setGym(gymDoc);
    } catch (err) {
      console.error('Error fetching member:', err);
      showToast('Failed to load member', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [id, userDoc?.gym_id]);

  // Load numbering settings for enrollment ID admin preference
  useEffect(() => {
    if (!userDoc?.gym_id) return;
    getNumberingSettings(userDoc.gym_id).then(s => setNumberingSettings(s)).catch(() => {});
  }, [userDoc?.gym_id]);

  useEffect(() => {
    if (!userDoc?.gym_id || !id) return;
    const unsub = getMemberPaymentsRealtime(userDoc.gym_id, id, setMemberPayments);
    return () => unsub();
  }, [userDoc?.gym_id, id]);

  const handleClearDue = async (payment) => {
    setClearingId(payment.id);
    try {
      await clearPaymentDue(payment.id, id);
      await updatePayment(payment.id, { paid_amount: payment.final_amount, pending_amount: 0, status: 'paid' });
      showToast('Due cleared!', 'success');
    } catch (e) {
      showToast('Failed to clear due: ' + e.message, 'error');
    } finally {
      setClearingId(null);
    }
  };

  const handleDelete = async (deletePayments = false) => {
    try {
      const { httpsCallable } = await import('firebase/functions');
      const { functions } = await import('../../firebase/config');
      const softDelete = httpsCallable(functions, 'softDeleteMember');
      await softDelete({ memberId: member.id, gymId: member.gym_id, deletePayments });
      showToast(deletePayments ? 'Member and payments deleted' : 'Member moved to Recycle Bin', 'success');
      navigate(-1);
    } catch (err) {
      showToast('Failed to delete member', 'error');
    }
  };

  // ── Canvas-based card renderer (fixes all html2canvas bugs) ─────
  const drawCardToCanvas = () => new Promise((resolve) => {
    const W = 800, H = 504, R = 20, SCALE = 2;
    const canvas = document.createElement('canvas');
    canvas.width = W * SCALE;
    canvas.height = H * SCALE;
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

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
      fetch(src)
        .then(r => r.blob())
        .then(blob => {
          const url = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => { URL.revokeObjectURL(url); res(img); };
          img.onerror = () => { URL.revokeObjectURL(url); res(null); };
          img.src = url;
        })
        .catch(() => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => res(img);
          img.onerror = () => res(null);
          img.src = src;
        });
    });

    // Background
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#1a1040');
    grad.addColorStop(0.55, '#2d1b69');
    grad.addColorStop(1, '#1a2980');
    rrect(0, 0, W, H, R);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.save();
    ctx.clip();

    // Decorative blobs
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#534ab7';
    ctx.beginPath(); ctx.arc(W - 60, -20, 130, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#378add';
    ctx.beginPath(); ctx.arc(-20, H + 10, 90, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // Row 1: header
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

    // Avatar circle
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
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Initials as fallback (overwritten by profile photo if loaded)
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = avatarColor.text || '#534AB7';
      ctx.font = 'bold 42px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle'; // fixes "letter too low" bug
      ctx.fillText(getInitials(member.name), avatarX, avatarY);
      ctx.restore();
    }

    // Info column
    const qrBoxX = W - 196;
    const maxNameW = (cs.show_qr ? qrBoxX : W - 44) - infoX - 16;
    let infoY = 110;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    if (cs.show_member_name) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px system-ui, -apple-system, sans-serif';
      const nameStr = member.name || 'Member';
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
      const memNum = `#${member.memberNumber || `MEM-${member.id.substring(0, 6)}`}`;
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = '16px monospace';
      ctx.fillText(memNum, infoX, infoY);
      infoY += 26;
    }

    if (cs.show_enrollment_id && member.latestEnrollmentNumber) {
      const enrollText = member.latestEnrollmentNumber;
      ctx.font = 'bold 32px monospace';
      const ePadX = 18, eH = 52;
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

    // Separator
    const sepY = H - 110;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(44, sepY); ctx.lineTo(W - 44, sepY);
    ctx.stroke();

    // Footer
    const expiryStr = member.subscription_expiry ? formatDate(member.subscription_expiry) : 'N/A';
    if (cs.show_expiry) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '13px system-ui, -apple-system, sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText('VALID TILL', 44, sepY + 14);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
      ctx.fillText(expiryStr, 44, sepY + 32);
    }

    if (cs.show_phone && member.phone) {
      const phoneX = cs.show_expiry ? 300 : 44;
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '13px system-ui, -apple-system, sans-serif';
      ctx.fillText('PHONE', phoneX, sepY + 14);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
      ctx.fillText(member.phone, phoneX, sepY + 32);
    }

    // QR: draw directly from hidden canvas ref (no HTTP, no CORS)
    if (cs.show_qr && qrCanvasRef.current) {
      const qrSize = 148, qrPad = 6;
      rrect(qrBoxX, 104, qrSize, qrSize, 10);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.drawImage(qrCanvasRef.current, qrBoxX + qrPad, 104 + qrPad, qrSize - qrPad * 2, qrSize - qrPad * 2);
    }

    // Async: profile photo only
    const tasks = [];
    if (cs.show_photo && member.profile_photo) {
      tasks.push(loadImg(member.profile_photo).then(img => ({ type: 'photo', img })));
    }

    const finish = (results = []) => {
      const photoRes = results.find(r => r.type === 'photo');

      // Profile photo overwrites initials
      if (photoRes?.img && cs.show_photo) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(photoRes.img, avatarX - avatarR, avatarY - avatarR, avatarR * 2, avatarR * 2);
        ctx.restore();
      }

      // Status badge — drawn LAST (fixes z-index bug)
      if (cs.show_status) {
        ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
        const textW = ctx.measureText(label).width;
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
        ctx.fillText(label, badgeX + padX + dotR * 2 + dotGap, badgeY + badgeH / 2);
      }

      ctx.restore(); // end rounded-rect clip
      resolve(canvas);
    };

    if (tasks.length === 0) finish();
    else Promise.all(tasks).then(finish);
  });

  // ── Download card as PNG ──────────────────────────────────────
  const downloadCard = async () => {
    setDownloadingCard(true);
    try {
      const canvas = await drawCardToCanvas();
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `Gymly_Card_${member.name.replace(/\s+/g, '_')}.png`;
      link.href = dataUrl;
      link.click();
      showToast('Membership card downloaded!', 'success');
      return dataUrl;
    } catch (err) {
      console.error('Failed to download card:', err);
      showToast('Failed to download card', 'error');
    } finally {
      setDownloadingCard(false);
    }
  };

  // ── Send card via WhatsApp (no billing details) ─────────────
  const shareCardOnWhatsApp = async () => {
    if (!member?.phone) {
      showToast('No phone number for this member', 'error');
      return;
    }
    try {
      const canvas = await drawCardToCanvas();
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const fileName = `Gymly_Card_${member.name.replace(/\s+/g, '_')}.png`;
        const file = new File([blob], fileName, { type: 'image/png' });
        const cardMsg = `Hi ${member.name}! 🏋️ Here is your membership card from ${gym?.name || 'Gymly'}.`;

        // Mobile: share card image directly via native share sheet
        if (navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({ title: 'Gymly Membership Card', text: cardMsg, files: [file] });
            return;
          } catch (e) {
            if (e.name === 'AbortError') return;
          }
        }
        // Desktop fallback: download card + open WhatsApp chat with simple message
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = fileName;
        a.click();
        const phone = String(member.phone).replace(/[^0-9]/g, '');
        setTimeout(() => window.open(`https://wa.me/${phone}?text=${encodeURIComponent(cardMsg)}`, '_blank'), 600);
      }, 'image/png');
    } catch (err) {
      console.error(err);
      showToast('Failed to send card', 'error');
    }
  };

  if (loading) {
    return (
      <div className="mesh-bg min-h-screen flex items-center justify-center">
        <div className="spinner spinner-primary" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  if (!member) {
    return (
      <div className="mesh-bg min-h-screen flex flex-col items-center justify-center font-body-md text-on-surface">
        <h3 className="font-headline-md text-xl mb-4">Member not found</h3>
        <button className="px-6 py-2 glass-panel rounded-full" onClick={() => navigate(-1)}>Go Back</button>
      </div>
    );
  }

  const { label, type, daysText } = getExpiryStatus(member.subscription_expiry);
  const avatarColor = getAvatarColor(member.name);
  const planName = getPlanName(gym, member.plan_id);
  const plans = (gym?.settings?.plans?.filter((p) => p.is_active) || []).sort((a, b) => (a.duration_days || 0) - (b.duration_days || 0));
  const currentPlan = plans.find((p) => p.id === member.plan_id);
  const bmi = calculateBMI(member.height, member.weight);

  // ── card_settings ───────────────────────────────────────────
  const cs = { ...DEFAULT_CS, ...(gym?.card_settings || {}) };

  const statusColors = {
    active:   { bg: 'rgba(29,158,117,0.15)',  color: '#006e28',  dot: '#006e28' },
    expiring: { bg: 'rgba(239,159,39,0.15)',  color: '#EF9F27',  dot: '#EF9F27' },
    expired:  { bg: 'rgba(186,26,26,0.15)',   color: '#ba1a1a',  dot: '#ba1a1a' },
  };
  const sc = statusColors[type] || statusColors.active;

  const activePayments = [...memberPayments].filter(p => p.membership_end).sort((a, b) => {
    const tA = a.membership_end?.toDate ? a.membership_end.toDate().getTime() : new Date(a.membership_end).getTime();
    const tB = b.membership_end?.toDate ? b.membership_end.toDate().getTime() : new Date(b.membership_end).getTime();
    return tB - tA;
  });
  const latestPayment = activePayments[0] || null;

  let totalDays = currentPlan?.duration_days || 30;
  let daysUsed = 0;
  let daysRemaining;
  let progressPercent;

  if (latestPayment?.membership_start && latestPayment?.membership_end) {
    const start = latestPayment.membership_start?.toDate ? latestPayment.membership_start.toDate() : new Date(latestPayment.membership_start);
    const end = latestPayment.membership_end?.toDate ? latestPayment.membership_end.toDate() : new Date(latestPayment.membership_end);
    const now = new Date();
    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    totalDays = Math.max(1, Math.round((endDay - startDay) / (1000 * 60 * 60 * 24)));
    if (today < startDay) {
      daysUsed = 0;
    } else if (today >= endDay) {
      daysUsed = totalDays;
    } else {
      daysUsed = Math.floor((today - startDay) / (1000 * 60 * 60 * 24)) + 1;
    }
    daysRemaining = Math.max(0, totalDays - daysUsed);
    progressPercent = Math.min(100, (daysUsed / totalDays) * 100);
  } else {
    daysRemaining = Math.max(0, getDaysRemaining(member.subscription_expiry));
    daysUsed = Math.max(0, totalDays - daysRemaining);
    progressPercent = Math.min(100, Math.max(0, (daysUsed / totalDays) * 100));
  }

  const isExpired = daysRemaining <= 0;
  const publicUrl = `${window.location.origin}/public/member/${member.id}`;

  return (
    <div className="mesh-bg min-h-screen pb-24 md:pb-8 font-body-md antialiased text-on-surface pt-16 md:pt-0">
      
      {/* Mobile Top Header */}
      <header className="fixed md:sticky top-0 left-0 w-full z-40 bg-surface/30 backdrop-blur-3xl px-4 h-16 flex justify-between items-center border-b border-white/10 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-on-surface-variant hover:text-primary transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <span className="font-display-lg text-xl font-bold text-on-surface">Gymly</span>
        <div className="w-10"></div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 md:px-gutter flex flex-col gap-6 md:mt-8">
        
        {/* Hero Section */}
        <section className="glass-panel rounded-3xl p-6 md:p-8 flex flex-col md:flex-row gap-8 relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-secondary/20 rounded-full blur-[60px] pointer-events-none"></div>
          
          {/* Avatar with camera overlay */}
          <div className="flex-shrink-0 flex flex-col items-center md:items-start gap-4 z-10">
            <div className="relative group">
              <div className="w-32 h-32 md:w-40 md:h-40 rounded-full overflow-hidden border-4 border-white/50 shadow-lg flex items-center justify-center font-display-lg text-4xl relative" style={{ background: avatarColor.bg, color: avatarColor.text }}>
                {member.profile_photo ? (
                  <img src={member.profile_photo} alt={member.name} className="w-full h-full object-cover" />
                ) : (
                  getInitials(member.name)
                )}
                <div className={`absolute bottom-2 right-2 w-4 h-4 rounded-full border-2 border-white ${isExpired ? 'bg-error shadow-[0_0_10px_rgba(186,26,26,0.5)]' : 'bg-tertiary shadow-[0_0_10px_rgba(0,103,98,0.5)]'}`}></div>
              </div>
              {!readOnly && (
                <>
                  <button
                    onClick={() => setShowPhotoPicker(true)}
                    disabled={uploadingPhoto}
                    className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                    title="Change photo"
                  >
                    {uploadingPhoto ? (
                      <div className="w-6 h-6 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                      <span className="material-symbols-outlined text-white text-2xl">photo_camera</span>
                    )}
                  </button>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoChange}
                  />
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handlePhotoChange}
                  />
                </>
              )}
            </div>
            <div className="flex gap-2">
              <span className={`inline-flex items-center px-3 py-1 rounded-full font-label-sm text-label-sm border ${isExpired ? 'bg-error/10 text-error border-error/20' : 'bg-tertiary/10 text-tertiary border-tertiary/20'}`}>
                {isExpired ? 'Expired' : 'Active Member'}
              </span>
            </div>
          </div>

          <div className="flex-grow flex flex-col justify-center z-10">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6 text-center md:text-left">
              <div>
                <h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface mb-1">{member.name}</h2>
                
                {numberingSettings?.useEnrollmentIdForAdmin ? (
                  // Show Enrollment ID prominently, Member ID hidden with click-to-reveal
                  <div className="flex flex-col gap-1">
                    {member.latestEnrollmentNumber && (
                      <p className="font-body-md text-body-md text-on-surface-variant flex items-center justify-center md:justify-start gap-1">
                        <span className="material-symbols-outlined text-sm text-[#1D9E75]">confirmation_number</span>
                        <span className="font-mono tracking-wide text-[#1D9E75] font-semibold">{member.latestEnrollmentNumber}</span>
                        <button
                          onClick={() => { navigator.clipboard.writeText(member.latestEnrollmentNumber); showToast('Enrollment ID copied!', 'success'); }}
                          className="ml-1 text-[#1D9E75]/50 hover:text-[#1D9E75] inline-flex"
                          title="Copy enrollment ID"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>content_copy</span>
                        </button>
                      </p>
                    )}
                    <p className="font-body-md text-body-md text-on-surface-variant flex items-center justify-center md:justify-start gap-1">
                      <span className="material-symbols-outlined text-sm">fingerprint</span>
                      {showMemberId ? (
                        <>
                          <span className="font-mono tracking-wide">
                            #{member.memberNumber || `MEM-${member.id.substring(0, 6).toUpperCase()}`}
                          </span>
                          <button onClick={() => setShowMemberId(false)} className="ml-1 text-primary/50 hover:text-primary inline-flex" title="Hide">
                            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>visibility_off</span>
                          </button>
                          <button
                            onClick={() => { navigator.clipboard.writeText(member.memberNumber || `MEM-${member.id.substring(0,6)}`); showToast('Member number copied!', 'success'); }}
                            className="text-primary/50 hover:text-primary inline-flex" title="Copy"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>content_copy</span>
                          </button>
                        </>
                      ) : (
                        <button onClick={() => setShowMemberId(true)} className="font-mono tracking-wide text-on-surface-variant/60 hover:text-primary flex items-center gap-1" title="Click to reveal Member ID">
                          <span className="text-xs">Member ID: ••••••</span>
                          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>visibility</span>
                        </button>
                      )}
                    </p>
                  </div>
                ) : (
                  // Default: show Member ID prominently
                  <p className="font-body-md text-body-md text-on-surface-variant flex items-center justify-center md:justify-start gap-1">
                    <span className="material-symbols-outlined text-sm">fingerprint</span>
                    {member.memberNumber ? (
                      <span className="font-mono tracking-wide">
                        #{member.memberNumber}
                        <button
                          onClick={() => { navigator.clipboard.writeText(member.memberNumber); showToast('Member number copied!', 'success'); }}
                          className="ml-1.5 text-primary/50 hover:text-primary inline-flex"
                          title="Copy member number"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>content_copy</span>
                        </button>
                      </span>
                    ) : (
                      <span>ID: MEM-{member.id.substring(0, 6).toUpperCase()}</span>
                    )}
                  </p>
                )}
              </div>
              <div className="text-center md:text-right">
                <div className="font-headline-md text-headline-md text-primary mb-1">{planName}</div>
                <div className="font-body-md text-body-md text-on-surface-variant">
                  {isExpired ? <span className="text-error font-bold">{daysText}</span> : <>Expires in <span className="font-bold text-on-surface">{daysRemaining} Days</span></>}
                </div>
              </div>
            </div>

            {/* Quick Actions Bento */}
            {!readOnly && (
              <div className="grid grid-cols-4 gap-2 md:gap-3 mt-auto">
                <button onClick={() => setShowRenew(true)} className="bg-white/30 backdrop-blur-md border border-white/60 hover:bg-white/50 shadow-sm transition-all rounded-xl p-3 flex flex-col items-center justify-center gap-2 group">
                  <span className="material-symbols-outlined text-primary group-hover:scale-110 transition-transform">autorenew</span>
                  <span className="font-label-sm text-[10px] md:text-xs text-on-surface-variant">Renew</span>
                </button>
                {cs.card_enabled !== false && (
                  <button onClick={() => setShowQRModal(true)} className="bg-white/30 backdrop-blur-md border border-white/60 hover:bg-white/50 shadow-sm transition-all rounded-xl p-3 flex flex-col items-center justify-center gap-2 group">
                    <span className="material-symbols-outlined text-tertiary group-hover:scale-110 transition-transform">qr_code_scanner</span>
                    <span className="font-label-sm text-[10px] md:text-xs text-on-surface-variant">Access QR</span>
                  </button>
                )}
                <a href={member.phone ? `https://wa.me/${String(member.phone).replace(/[^0-9]/g, '')}` : '#'} target="_blank" rel="noreferrer" className="bg-white/30 backdrop-blur-md border border-white/60 hover:bg-white/50 shadow-sm transition-all rounded-xl p-3 flex flex-col items-center justify-center gap-2 group">
                  <span className="material-symbols-outlined text-[#1D9E75] group-hover:scale-110 transition-transform">chat</span>
                  <span className="font-label-sm text-[10px] md:text-xs text-on-surface-variant">Message</span>
                </a>
                <div className="relative">
                  <button onClick={() => setShowMoreActions(!showMoreActions)} className="w-full h-full bg-white/30 backdrop-blur-md border border-white/60 hover:bg-white/50 shadow-sm transition-all rounded-xl p-3 flex flex-col items-center justify-center gap-2 group">
                    <span className="material-symbols-outlined text-on-surface-variant group-hover:scale-110 transition-transform">more_horiz</span>
                    <span className="font-label-sm text-[10px] md:text-xs text-on-surface-variant">More</span>
                  </button>
                  {showMoreActions && (
                    <div className="absolute top-full right-0 mt-2 w-36 glass-panel rounded-xl shadow-lg flex flex-col overflow-hidden z-20 border border-black/10">
                      <button onClick={() => { navigate(`/owner/members/${id}/edit`); setShowMoreActions(false); }} className="px-4 py-3 text-sm text-left hover:bg-white/50 font-label-md flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-secondary">edit</span> Edit Member
                      </button>
                      <button onClick={() => { setShowDelete(true); setShowMoreActions(false); }} className="px-4 py-3 text-sm text-left hover:bg-error-container/50 font-label-md text-error flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm">delete</span> Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          
          {/* Membership Status */}
          <section className="md:col-span-8 glass-panel rounded-3xl p-6 flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <h3 className="font-headline-md text-headline-md text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary">card_membership</span> Membership Status
              </h3>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="bg-surface/50 rounded-2xl p-5 border border-white/40">
                <div className="font-label-sm text-label-sm text-on-surface-variant mb-1 uppercase tracking-wider">Current Plan</div>
                <div className="font-headline-md text-headline-md text-on-surface mb-4">{planName}</div>
                <div className="space-y-2">
                  <div className="flex justify-between font-label-md text-label-md">
                    <span className="text-on-surface-variant">Usage</span>
                    <span className="text-on-surface font-semibold">{daysUsed} / {totalDays} Days</span>
                  </div>
                  <div className="h-2 w-full bg-surface-variant rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-primary to-secondary rounded-full shadow-[0_0_10px_rgba(109,54,212,0.4)] transition-all duration-1000" style={{ width: `${progressPercent}%` }}></div>
                  </div>
                </div>
              </div>
              
              <div className="bg-surface/50 rounded-2xl p-5 border border-white/40 flex flex-col justify-between">
                <div>
                  <div className="font-label-sm text-label-sm text-on-surface-variant mb-1 uppercase tracking-wider">Payment Status</div>
                  <div className="font-headline-md text-headline-md text-on-surface mt-2">
                    {member.payment_status === 'paid' ? 'Fully Paid' : 'Pending Dues'}
                  </div>
                  <div className="font-body-md text-body-md text-on-surface-variant mt-1">Expiry: {formatDate(member.subscription_expiry)}</div>
                </div>
                {member.payment_status === 'paid' ? (
                  <div className="mt-4 flex items-center gap-2 text-tertiary bg-tertiary/10 p-2 rounded-lg border border-tertiary/20 w-fit">
                    <span className="material-symbols-outlined text-sm">check_circle</span>
                    <span className="font-label-sm text-label-sm">All clear</span>
                  </div>
                ) : (
                  <div className="mt-4 flex items-center gap-2 text-[#EF9F27] bg-[#EF9F27]/10 p-2 rounded-lg border border-[#EF9F27]/20 w-fit">
                    <span className="material-symbols-outlined text-sm">warning</span>
                    <span className="font-label-sm text-label-sm">Payment pending</span>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Vitals */}
          <section className="md:col-span-4 glass-panel rounded-3xl p-6 flex flex-col gap-6">
            <h3 className="font-headline-md text-headline-md text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">fitness_center</span> Vitals
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-3 border-b border-black/5">
                <span className="font-body-md text-body-md text-on-surface-variant">Height</span>
                <span className="font-headline-md text-headline-md text-on-surface text-lg">{member.height || '—'} <span className="text-sm text-on-surface-variant font-normal">cm</span></span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-black/5">
                <span className="font-body-md text-body-md text-on-surface-variant">Weight</span>
                <span className="font-headline-md text-headline-md text-on-surface text-lg">{member.weight || '—'} <span className="text-sm text-on-surface-variant font-normal">kg</span></span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-black/5">
                <span className="font-body-md text-body-md text-on-surface-variant">Goal</span>
                {member.goal ? (
                  <span className="inline-flex items-center px-2 py-1 rounded-md bg-secondary/10 text-secondary font-label-sm text-label-sm border border-secondary/20">{member.goal}</span>
                ) : <span className="text-on-surface-variant">—</span>}
              </div>
            </div>
          </section>

        </div>

        {/* Payment History — above Extended Details */}
        <section className="glass-panel rounded-3xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-headline-md text-headline-md text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">receipt_long</span> Payment History
            </h3>
            {!readOnly && (
              <button onClick={() => navigate(`/owner/payments/add`)} className="px-4 py-2 rounded-lg bg-primary/10 text-primary font-label-sm hover:bg-primary/20 transition-colors">
                + Record
              </button>
            )}
          </div>

          <div className="space-y-3">
            {memberPayments.length === 0 ? (
              <p className="text-center py-6 text-on-surface-variant">No payments recorded</p>
            ) : (
              memberPayments.map(p => {
                const isPendingOrPartial = p.status === 'pending' || p.status === 'partial';
                const d = p.payment_date?.toDate ? p.payment_date.toDate() : new Date(p.payment_date);
                return (
                  <div key={p.id} className="bg-white/40 border border-white/60 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="font-label-md text-on-surface font-semibold">{p.plan_name}</div>
                      <div className="font-body-md text-sm text-on-surface-variant mt-1">
                        {formatDate(d)} • {p.method === 'cash' ? 'Cash' : p.method === 'upi' ? 'UPI' : 'Online'} • #{p.invoice_number}
                      </div>
                      {p.enrollmentNumber && (
                        <div className="mt-2 text-sm font-semibold text-primary">
                          Enrollment Number : <span className="font-mono bg-primary/10 px-2 py-0.5 rounded-md">{p.enrollmentNumber}</span>
                        </div>
                      )}
                      {isPendingOrPartial && (
                        <div className="text-[#EF9F27] text-xs font-bold mt-1">₹{(p.pending_amount || 0).toLocaleString('en-IN')} pending</div>
                      )}
                    </div>
                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2">
                      <div className="font-headline-md text-primary">₹{(p.final_amount || 0).toLocaleString('en-IN')}</div>
                      
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${p.status === 'paid' ? 'bg-tertiary/10 text-tertiary border border-tertiary/20' : p.status === 'partial' ? 'bg-[#EF9F27]/10 text-[#EF9F27] border border-[#EF9F27]/20' : 'bg-error/10 text-error border border-error/20'}`}>
                          {p.status}
                        </span>
                        
                        {!readOnly && isPendingOrPartial && (
                          <button onClick={() => handleClearDue(p)} disabled={clearingId === p.id} className="px-3 py-1 rounded-md bg-tertiary text-white text-[10px] font-bold hover:bg-tertiary/90 transition-colors disabled:opacity-50">
                            {clearingId === p.id ? '...' : '✓ Clear Due'}
                          </button>
                        )}
                        {!isPendingOrPartial && (
                          <button onClick={() => navigate(`/owner/payments/${p.id}`)} className="text-primary text-xs hover:underline">View</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Extended Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section className="glass-panel rounded-3xl p-6">
            <h3 className="font-headline-md text-headline-md text-on-surface mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary">info</span> Personal Info
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between"><span className="text-on-surface-variant font-label-sm">DOB</span><span className="font-body-md">{member.date_of_birth || '—'}</span></div>
              <div className="flex justify-between"><span className="text-on-surface-variant font-label-sm">Gender</span><span className="font-body-md capitalize">{member.gender || '—'}</span></div>
              <div className="flex justify-between"><span className="text-on-surface-variant font-label-sm">Blood</span><span className="font-body-md">{member.blood_group || '—'}</span></div>
              <div className="flex justify-between"><span className="text-on-surface-variant font-label-sm">Contact</span><span className="font-body-md">{member.emergency_contact || '—'}</span></div>
              <div className="flex justify-between border-t border-black/5 pt-3"><span className="text-on-surface-variant font-label-sm">Address</span><span className="font-body-md text-right max-w-[200px] truncate">{member.address || '—'}</span></div>
            </div>
          </section>

          <section className="glass-panel rounded-3xl p-6 flex flex-col">
            <h3 className="font-headline-md text-headline-md text-on-surface mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#1D9E75]">health_and_safety</span> Medical Notes
            </h3>
            <div className="flex-1 bg-surface/50 rounded-2xl p-4 border border-white/40 font-body-md text-on-surface-variant italic">
              {member.medical_notes || 'No medical notes or conditions reported.'}
            </div>
          </section>
        </div>

      </main>
      <BottomNav activeTab="members" role="owner" />

      {/* Photo Picker Modal */}
      {showPhotoPicker && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-end justify-center"
          onClick={() => setShowPhotoPicker(false)}
        >
          <div
            className="glass-panel w-full max-w-sm mx-4 mb-6 rounded-3xl p-6 flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-black/20 rounded-full mx-auto mb-2" />
            <p className="font-label-md text-on-surface-variant text-center text-sm mb-2">Change Member Photo</p>
            <button
              onClick={() => { cameraInputRef.current?.click(); }}
              className="flex items-center gap-4 w-full px-5 py-4 rounded-2xl bg-primary/10 hover:bg-primary/15 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-white text-[20px]">photo_camera</span>
              </div>
              <div className="text-left">
                <p className="font-label-md text-on-surface font-semibold">Open Camera</p>
                <p className="text-xs text-on-surface-variant">Take a new photo</p>
              </div>
            </button>
            <button
              onClick={() => { photoInputRef.current?.click(); }}
              className="flex items-center gap-4 w-full px-5 py-4 rounded-2xl bg-secondary/10 hover:bg-secondary/15 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-white text-[20px]">photo_library</span>
              </div>
              <div className="text-left">
                <p className="font-label-md text-on-surface font-semibold">Choose from Gallery</p>
                <p className="text-xs text-on-surface-variant">Pick an existing photo</p>
              </div>
            </button>
            <button
              onClick={() => setShowPhotoPicker(false)}
              className="mt-1 py-3 rounded-xl border border-outline-variant text-on-surface-variant font-label-md text-sm hover:bg-black/5 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {showRenew && (
        <RenewModal member={member} plans={plans} onClose={() => setShowRenew(false)} onSuccess={() => { fetchData(); }} />
      )}

      {showDelete && (
        <DeleteConfirmModal memberName={member.name} onConfirm={handleDelete} onClose={() => setShowDelete(false)} />
      )}

      {/* ── Membership Card / Access QR Modal ── */}
      {showQRModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setShowQRModal(false)}>
          <div className="glass-panel p-6 rounded-3xl max-w-sm w-full shadow-2xl border border-white/20" onClick={e => e.stopPropagation()}>
            
            {/* The membership card respecting card_settings */}
            <div
              id="membership-card-to-download"
              style={{
                background: 'linear-gradient(135deg, #1a1040 0%, #2d1b69 50%, #1a2980 100%)',
                borderRadius: 20, padding: 20, position: 'relative', overflow: 'hidden', margin: '0 auto',
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
                    {cs.show_gymly_label !== false && <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', letterSpacing: 0.5 }}>GYMLY MEMBER CARD</div>}
                  </div>
                  {cs.show_status && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: sc.bg, padding: '4px 10px', borderRadius: 99 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: sc.dot }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: sc.color }}>{label}</span>
                    </div>
                  )}
                </div>

                {/* Middle row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                  {cs.show_photo && (
                    <div style={{
                      width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
                      border: '2px solid rgba(255,255,255,0.3)', overflow: 'hidden',
                      background: `linear-gradient(135deg, ${avatarColor.bg}, #378add)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {member.profile_photo
                        ? <img src={member.profile_photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ fontSize: 18, fontWeight: 700, color: avatarColor.text }}>{getInitials(member.name)}</span>
                      }
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    {cs.show_member_name && (
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2, verticalAlign: 'middle' }}>
                        {member.name}
                      </div>
                    )}
                    {cs.show_plan && (
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>{planName}</div>
                    )}
                    {cs.show_member_id && (
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>
                        #{member.memberNumber || `MEM-${member.id.substring(0, 6)}`}
                      </div>
                    )}
                    {cs.show_enrollment_id && member.latestEnrollmentNumber && (
                      <div style={{ display: 'inline-block', marginTop: 6, fontSize: 15, fontWeight: 800, color: '#4ade80', background: 'rgba(74,222,128,0.15)', padding: '4px 12px', borderRadius: 8, fontFamily: 'monospace', letterSpacing: 0.5, border: '1px solid rgba(74,222,128,0.3)' }}>
                        {member.latestEnrollmentNumber}
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
                          {member.subscription_expiry ? formatDate(member.subscription_expiry) : 'N/A'}
                        </div>
                      </div>
                    )}
                    {cs.show_phone && member.phone && (
                      <div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Phone</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginTop: 1 }}>{member.phone}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <button
              onClick={downloadCard}
              disabled={downloadingCard}
              className="w-full mt-5 py-3 rounded-xl bg-white text-primary font-label-md flex items-center justify-center gap-2 hover:bg-white/90 transition-colors shadow-lg"
            >
              {downloadingCard ? <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /> : <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span>}
              Download Card
            </button>

            {/* Send card via WhatsApp */}
            <button
              onClick={shareCardOnWhatsApp}
              className="w-full mt-3 py-3 rounded-xl font-label-md flex items-center justify-center gap-2 transition-colors"
              style={{ background: '#25D366', color: '#fff' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
              </svg>
              Send Card
            </button>

            <button onClick={() => setShowQRModal(false)} className="w-full mt-3 py-3 rounded-xl border border-black/20 text-on-surface-variant font-label-md hover:bg-black/5 transition-colors">
              Close
            </button>
          </div>
        </div>
      )}

      {/* Hidden QR canvas — used by drawCardToCanvas, no HTTP request, no CORS */}
      {cs.show_qr && (
        <QRCodeCanvas
          ref={qrCanvasRef}
          value={publicUrl}
          size={148}
          bgColor="#ffffff"
          fgColor="#000000"
          level="M"
          style={{ position: 'absolute', left: -9999, top: -9999, pointerEvents: 'none' }}
        />
      )}

    </div>
  );
};

export default MemberProfile;
