import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getUser, getGym, deleteMember } from '../../firebase/firestore';
import { getMemberPaymentsRealtime, clearPaymentDue, updatePayment } from '../../firebase/firestore-payments';
import {
  getInitials, getAvatarColor, getExpiryStatus,
  formatDate, getPlanName, calculateBMI, getDaysRemaining,
} from '../../utils/helpers';
import RenewModal from '../../components/RenewModal';
import DeleteConfirmModal from '../../components/DeleteConfirmModal';
import BottomNav from '../../components/BottomNav';
import { QRCodeCanvas } from 'qrcode.react';
import html2canvas from 'html2canvas';

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

  const handleDelete = async () => {
    try {
      await deleteMember(member.id);
      showToast('Member removed', 'success');
      navigate(-1);
    } catch (err) {
      showToast('Failed to delete member', 'error');
    }
  };

  const downloadCard = async () => {
    const element = document.getElementById('membership-card-to-download');
    if (!element) return;
    try {
      const canvas = await html2canvas(element, { scale: 3, backgroundColor: null, useCORS: true });
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `Gymly_Card_${member.name.replace(/\s+/g, '_')}.png`;
      link.href = dataUrl;
      link.click();
      showToast('Membership card downloaded!', 'success');
    } catch (err) {
      console.error('Failed to download card:', err);
      showToast('Failed to download card', 'error');
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
  const plans = gym?.settings?.plans?.filter((p) => p.is_active) || [];
  const currentPlan = plans.find((p) => p.id === member.plan_id);
  const bmi = calculateBMI(member.height, member.weight);
  
  const daysRemaining = getDaysRemaining(member.subscription_expiry);
  const totalDays = currentPlan?.duration_days || 30;
  const daysUsed = Math.max(0, totalDays - daysRemaining);
  const progressPercent = Math.min(100, Math.max(0, (daysUsed / totalDays) * 100));

  const isExpired = daysRemaining < 0;

  return (
    <div className="mesh-bg min-h-screen pb-24 md:pb-0 font-body-md antialiased text-on-surface pt-16 md:pt-24">
      
      {/* Mobile Top Header */}
      <header className="fixed top-0 left-0 w-full z-40 bg-surface/30 backdrop-blur-3xl px-4 h-16 flex justify-between items-center border-b border-white/10 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-on-surface-variant hover:text-primary transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <span className="font-display-lg text-xl font-bold text-on-surface">Gymly</span>
        <div className="w-10"></div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 md:px-gutter flex flex-col gap-6">
        
        {/* Hero Section */}
        <section className="glass-panel rounded-3xl p-6 md:p-8 flex flex-col md:flex-row gap-8 relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-secondary/20 rounded-full blur-[60px] pointer-events-none"></div>
          
          <div className="flex-shrink-0 flex flex-col items-center md:items-start gap-4 z-10">
            <div className="w-32 h-32 md:w-40 md:h-40 rounded-full overflow-hidden border-4 border-white/50 shadow-lg relative flex items-center justify-center font-display-lg text-4xl" style={{ background: avatarColor.bg, color: avatarColor.text }}>
              {member.profile_photo ? (
                <img src={member.profile_photo} alt={member.name} className="w-full h-full object-cover" />
              ) : (
                getInitials(member.name)
              )}
              <div className={`absolute bottom-2 right-2 w-4 h-4 rounded-full border-2 border-white ${isExpired ? 'bg-error shadow-[0_0_10px_rgba(186,26,26,0.5)]' : 'bg-tertiary shadow-[0_0_10px_rgba(0,103,98,0.5)]'}`}></div>
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
                <p className="font-body-md text-body-md text-on-surface-variant flex items-center justify-center md:justify-start gap-1">
                  <span className="material-symbols-outlined text-sm">fingerprint</span>
                  ID: MEM-{member.id.substring(0, 6).toUpperCase()}
                </p>
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
                <button onClick={() => setShowQRModal(true)} className="bg-white/30 backdrop-blur-md border border-white/60 hover:bg-white/50 shadow-sm transition-all rounded-xl p-3 flex flex-col items-center justify-center gap-2 group">
                  <span className="material-symbols-outlined text-tertiary group-hover:scale-110 transition-transform">qr_code_scanner</span>
                  <span className="font-label-sm text-[10px] md:text-xs text-on-surface-variant">Access QR</span>
                </button>
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
                    <div className="absolute top-full right-0 mt-2 w-32 glass-panel rounded-xl shadow-lg flex flex-col overflow-hidden z-20 border-black/10">
                      <button onClick={() => navigate(`/owner/members/${id}/edit`)} className="px-4 py-3 text-sm text-left hover:bg-white/50 font-label-md flex items-center gap-2"><span className="material-symbols-outlined text-sm text-secondary">edit</span> Edit</button>
                      <button onClick={() => setShowDelete(true)} className="px-4 py-3 text-sm text-left hover:bg-error-container/50 font-label-md text-error flex items-center gap-2"><span className="material-symbols-outlined text-sm">delete</span> Delete</button>
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

        {/* Payment History */}
        <section className="glass-panel rounded-3xl p-6 mb-12">
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

      </main>
      <BottomNav activeTab="members" role="owner" />

      {/* Modals */}
      {showRenew && (
        <RenewModal member={member} plans={plans} onClose={() => setShowRenew(false)} onSuccess={() => { setShowRenew(false); fetchData(); }} />
      )}

      {showDelete && (
        <DeleteConfirmModal memberName={member.name} onConfirm={handleDelete} onClose={() => setShowDelete(false)} />
      )}

      {/* Membership Card QR Modal */}
      {showQRModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setShowQRModal(false)}>
          <div className="glass-panel p-6 rounded-3xl max-w-sm w-full shadow-2xl border border-white/20" onClick={e => e.stopPropagation()}>
            
            {/* The actual card that gets downloaded */}
            <div id="membership-card-to-download" className="relative rounded-2xl overflow-hidden p-6 bg-gradient-to-br from-[#001a41] to-[#0058bc] text-white shadow-xl isolate">
              <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_top_right,white_0%,transparent_50%)] mix-blend-overlay"></div>
              
              <div className="flex justify-between items-start mb-6 relative z-10">
                <h2 className="font-display-lg text-2xl font-bold tracking-tight">Gymly</h2>
                <span className="font-label-sm px-2 py-1 bg-white/20 rounded-md backdrop-blur-md border border-white/10 uppercase tracking-widest text-[10px]">MEMBER</span>
              </div>
              
              <div className="flex justify-center mb-6 bg-white p-4 rounded-2xl w-fit mx-auto relative z-10 shadow-inner">
                <QRCodeCanvas value={`gymly://member/${member.id}/${gym?.id}`} size={160} level="M" />
              </div>
              
              <div className="text-center space-y-1 relative z-10">
                <div className="font-headline-lg text-2xl tracking-tight leading-none">{member.name}</div>
                <div className="font-body-md text-white/80 mt-1">{planName}</div>
                <div className="font-label-sm text-white/50 tracking-widest mt-2 uppercase">ID: MEM-{member.id.substring(0, 6)}</div>
              </div>
            </div>

            {/* Modal Actions */}
            <button onClick={downloadCard} className="w-full mt-6 py-3 rounded-xl bg-white text-primary font-label-md flex items-center justify-center gap-2 hover:bg-white/90 transition-colors shadow-lg">
              <span className="material-symbols-outlined">download</span> Download Card
            </button>
            <button onClick={() => setShowQRModal(false)} className="w-full mt-3 py-3 rounded-xl border border-black/20 text-on-surface-variant font-label-md hover:bg-black/5 transition-colors">
              Close
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default MemberProfile;
