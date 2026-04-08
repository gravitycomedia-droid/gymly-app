import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getUser, getGym, deleteMember } from '../../firebase/firestore';
import { getMemberPaymentsRealtime, clearPaymentDue, updatePayment } from '../../firebase/firestore-payments';
import {
  getInitials, getAvatarColor, getExpiryStatus,
  formatDate, getPlanName, calculateBMI, getDaysRemaining,
} from '../../utils/helpers';
import StatusBadge from '../../components/StatusBadge';
import RenewModal from '../../components/RenewModal';
import DeleteConfirmModal from '../../components/DeleteConfirmModal';
import './MemberProfile.css';

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

  // Real-time payment listener for this member
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

  if (loading) {
    return (
      <div className="screen profile-screen">
        <div className="screen-content spinner-center">
          <div className="spinner spinner-primary" style={{ width: 32, height: 32 }} />
        </div>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="screen profile-screen">
        <div className="screen-content">
          <button className="back-btn" onClick={() => navigate(-1)}>← Back</button>
          <div className="empty-state">
            <h3 className="empty-title">Member not found</h3>
          </div>
        </div>
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

  const handleDelete = async () => {
    try {
      await deleteMember(member.id);
      showToast('Member removed', 'success');
      navigate(-1);
    } catch (err) {
      showToast('Failed to delete member', 'error');
    }
  };

  return (
    <div className="screen profile-screen">
      <div className="screen-content">
        <button className="back-btn" onClick={() => navigate(-1)}>← Back</button>

        {/* Profile Header */}
        <div className="profile-header glass-card">
          <div className="profile-avatar" style={{ background: avatarColor.bg, color: avatarColor.text }}>
            {member.profile_photo ? (
              <img src={member.profile_photo} alt={member.name} />
            ) : (
              getInitials(member.name)
            )}
          </div>
          <h1 className="profile-name">{member.name}</h1>
          <a href={`tel:${member.phone}`} className="profile-phone">{member.phone}</a>
          <StatusBadge type={type} label={label} />
          <div className="profile-plan-info">
            {planName} · {daysText}
          </div>
        </div>

        {/* Quick Actions */}
        {!readOnly && (
          <div className="profile-actions glass-card">
            <button className="profile-action-btn" onClick={() => setShowRenew(true)} id="renew-btn">
              <div className="action-icon" style={{ background: 'rgba(83,74,183,0.1)', color: '#534AB7' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><polyline points="23 4 23 10 17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <span>Renew</span>
            </button>
            <button className="profile-action-btn" onClick={() => navigate(`/owner/members/${id}/edit`)} id="edit-btn">
              <div className="action-icon" style={{ background: 'rgba(43,108,176,0.1)', color: '#2B6CB0' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <span>Edit</span>
            </button>
            <button className="profile-action-btn" onClick={() => setShowDelete(true)} id="delete-btn">
              <div className="action-icon" style={{ background: 'rgba(226,75,74,0.1)', color: '#E24B4A' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <span>Delete</span>
            </button>
            <a href={`tel:${member.phone}`} className="profile-action-btn" id="call-btn">
              <div className="action-icon" style={{ background: 'rgba(29,158,117,0.1)', color: '#1D9E75' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" stroke="currentColor" strokeWidth="2" fill="none"/></svg>
              </div>
              <span>Call</span>
            </a>
          </div>
        )}

        {/* Membership Info */}
        <div className="info-section glass-card">
          <h3 className="info-section-title">Membership</h3>
          <div className="info-row">
            <span className="info-label">Plan</span>
            <span className="info-value">{planName}</span>
          </div>
          {currentPlan && (
            <div className="info-row">
              <span className="info-label">Price</span>
              <span className="info-value">₹{currentPlan.price}</span>
            </div>
          )}
          <div className="info-row">
            <span className="info-label">Start date</span>
            <span className="info-value">{formatDate(member.start_date)}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Expiry</span>
            <span className="info-value">{formatDate(member.subscription_expiry)}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Payment</span>
            <StatusBadge type={member.payment_status === 'paid' ? 'active' : 'expiring'} label={member.payment_status === 'paid' ? 'Paid' : 'Pending'} />
          </div>
          <div className="info-row">
            <span className="info-label">Days remaining</span>
            <span className="info-value" style={{ color: daysRemaining < 0 ? '#E24B4A' : 'inherit' }}>
              {daysRemaining < 0 ? `Expired ${Math.abs(daysRemaining)} days ago` : `${daysRemaining} days`}
            </span>
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="progress-bar-track">
              <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
              <span>{daysUsed}/{totalDays} days used</span>
              <span>{Math.round(progressPercent)}%</span>
            </div>
          </div>
        </div>

        {/* Personal Details */}
        <div className="info-section glass-card">
          <h3 className="info-section-title">Personal details</h3>
          <div className="info-row"><span className="info-label">Date of birth</span><span className="info-value">{member.date_of_birth || '—'}</span></div>
          <div className="info-row"><span className="info-label">Gender</span><span className="info-value">{member.gender ? member.gender.charAt(0).toUpperCase() + member.gender.slice(1) : '—'}</span></div>
          <div className="info-row"><span className="info-label">Blood group</span><span className="info-value">{member.blood_group || '—'}</span></div>
          <div className="info-row"><span className="info-label">Address</span><span className="info-value">{member.address || '—'}</span></div>
          <div className="info-row"><span className="info-label">Emergency</span><span className="info-value">{member.emergency_contact || '—'}</span></div>
        </div>

        {/* Fitness Profile */}
        <div className="info-section glass-card">
          <h3 className="info-section-title">Fitness profile</h3>
          <div className="info-row"><span className="info-label">Height</span><span className="info-value">{member.height ? `${member.height} cm` : '—'}</span></div>
          <div className="info-row"><span className="info-label">Weight</span><span className="info-value">{member.weight ? `${member.weight} kg` : '—'}</span></div>
          {bmi && (
            <div className="info-row">
              <span className="info-label">BMI</span>
              <span className="info-value" style={{ color: bmi.color, fontWeight: 600 }}>{bmi.value} — {bmi.category}</span>
            </div>
          )}
          <div className="info-row"><span className="info-label">Goal</span><span className="info-value">{member.goal || '—'}</span></div>
          <div className="info-row"><span className="info-label">Experience</span><span className="info-value">{member.experience || '—'}</span></div>
          <div className="info-row"><span className="info-label">Lifestyle</span><span className="info-value">{member.lifestyle || '—'}</span></div>
          <div className="info-row"><span className="info-label">Diet</span><span className="info-value">{member.diet || '—'}</span></div>
        </div>

        {/* Medical Notes */}
        <div className="info-section glass-card">
          <h3 className="info-section-title">Medical notes</h3>
          <p style={{ fontSize: 13, color: member.medical_notes ? 'var(--text-primary)' : 'var(--text-muted)', lineHeight: 1.5 }}>
            {member.medical_notes || 'No medical notes added'}
          </p>
        </div>

        {/* Payment History */}
        <div className="info-section glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 className="info-section-title" style={{ marginBottom: 0 }}>Payment history</h3>
            {!readOnly && (
              <button
                className="btn-ghost"
                style={{ padding: '6px 12px', fontSize: 12 }}
                onClick={() => navigate(`/owner/payments/add`)}
              >
                + Record
              </button>
            )}
          </div>
          {memberPayments.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No payments recorded</p>
          ) : (
            memberPayments.map(p => {
              const isPendingOrPartial = p.status === 'pending' || p.status === 'partial';
              const d = p.payment_date?.toDate ? p.payment_date.toDate() : new Date(p.payment_date);
              return (
                <div key={p.id} style={{
                  padding: '12px 0',
                  borderBottom: '1px solid rgba(0,0,0,0.05)',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{p.plan_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {formatDate(d)} · {p.method === 'cash' ? 'Cash' : p.method === 'upi' ? 'UPI' : 'Online'}
                      · #{p.invoice_number}
                    </div>
                    {isPendingOrPartial && (
                      <div style={{ fontSize: 11, color: '#EF9F27', marginTop: 2, fontWeight: 600 }}>
                        ₹{(p.pending_amount || 0).toLocaleString('en-IN')} pending
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>₹{(p.final_amount || 0).toLocaleString('en-IN')}</div>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 8, marginBottom: 4, display: 'inline-block',
                      background: p.status === 'paid' ? 'rgba(29,158,117,0.1)' : p.status === 'partial' ? 'rgba(239,159,39,0.1)' : 'rgba(226,75,74,0.1)',
                      color: p.status === 'paid' ? '#1D9E75' : p.status === 'partial' ? '#EF9F27' : '#E24B4A',
                    }}>
                      {p.status === 'paid' ? 'Paid' : p.status === 'partial' ? 'Partial' : 'Pending'}
                    </span>
                    {!readOnly && isPendingOrPartial && (
                      <div>
                        <button
                          style={{
                            fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 8,
                            background: 'rgba(29,158,117,0.1)', color: '#1D9E75', border: 'none',
                            cursor: 'pointer', marginTop: 4,
                          }}
                          onClick={() => handleClearDue(p)}
                          disabled={clearingId === p.id}
                        >
                          {clearingId === p.id ? '...' : '✓ Clear Due'}
                        </button>
                      </div>
                    )}
                    {!isPendingOrPartial && (
                      <div>
                        <button
                          style={{ fontSize: 11, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 4 }}
                          onClick={() => navigate(`/owner/payments/${p.id}`)}
                        >
                          View →
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Renewal History */}
        <div className="info-section glass-card" style={{ marginBottom: 40 }}>
          <h3 className="info-section-title">Renewal history</h3>
          {member.renewal_history?.length > 0 ? (
            member.renewal_history.map((r, i) => (
              <div key={i} className="renewal-row">
                <span className="renewal-date">{formatDate(r.renewed_at)}</span>
                <span className="renewal-plan">{getPlanName(gym, r.plan_id)}</span>
              </div>
            ))
          ) : (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>First membership</p>
          )}
        </div>
      </div>

      {showRenew && (
        <RenewModal
          member={member}
          plans={plans}
          onClose={() => setShowRenew(false)}
          onSuccess={() => { setShowRenew(false); fetchData(); }}
        />
      )}

      {showDelete && (
        <DeleteConfirmModal
          memberName={member.name}
          onConfirm={handleDelete}
          onClose={() => setShowDelete(false)}
        />
      )}
    </div>
  );
};

export default MemberProfile;
