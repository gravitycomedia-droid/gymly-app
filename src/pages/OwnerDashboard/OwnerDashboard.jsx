import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getGym, getGymMembersRealtime } from '../../firebase/firestore';
import { getPaymentsRealtime } from '../../firebase/firestore-payments';
import { logout } from '../../firebase/auth';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { getInitials, getAvatarColor, getExpiryStatus, getPlanName, formatDate } from '../../utils/helpers';
import StatusBadge from '../../components/StatusBadge';
import './OwnerDashboard.css';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const OwnerDashboard = () => {
  const { user, userDoc } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [gym, setGym] = useState(null);
  const [members, setMembers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [newLeadsCount, setNewLeadsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGym = async () => {
      if (!userDoc?.gym_id) { setLoading(false); return; }
      try {
        const gymData = await getGym(userDoc.gym_id);
        setGym(gymData);
      } catch (err) {
        console.error('Error fetching gym:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchGym();
  }, [userDoc]);

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    const unsubscribe = getGymMembersRealtime(userDoc.gym_id, (membersList) => {
      setMembers(membersList);
    });
    return () => unsubscribe();
  }, [userDoc?.gym_id]);

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    const unsub = getPaymentsRealtime(userDoc.gym_id, (list) => setPayments(list));
    return () => unsub();
  }, [userDoc?.gym_id]);

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    if (localStorage.getItem('mockRole')) { setNewLeadsCount(1); return; }
    const q = query(collection(db, 'leads'), where('gym_id', '==', userDoc.gym_id), where('status', '==', 'new'));
    const unsubscribe = onSnapshot(q, (snap) => { setNewLeadsCount(snap.docs.length); });
    return () => unsubscribe();
  }, [userDoc?.gym_id]);

  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const totalCount = members.length;
  const activeCount = members.filter((m) => {
    const exp = m.subscription_expiry?.toDate ? m.subscription_expiry.toDate() : null;
    return exp && exp > now;
  }).length;
  const expiringMembers = members.filter((m) => {
    const exp = m.subscription_expiry?.toDate ? m.subscription_expiry.toDate() : null;
    return exp && exp > now && exp <= sevenDaysFromNow;
  });
  const expiringCount = expiringMembers.length;
  const expiredCount = members.filter((m) => {
    const exp = m.subscription_expiry?.toDate ? m.subscription_expiry.toDate() : null;
    return !exp || exp <= now;
  }).length;

  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const collectedThisMonth = payments
    .filter(p => {
      const d = p.payment_date?.toDate ? p.payment_date.toDate() : new Date(p.payment_date);
      return p.status === 'paid' && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    })
    .reduce((sum, p) => sum + (p.final_amount || 0), 0);
  const pendingDues = payments
    .filter(p => p.status === 'pending' || p.status === 'partial')
    .reduce((sum, p) => sum + (p.pending_amount || 0), 0);
  const recentPayments = payments.slice(0, 5);

  const recentMembers = [...members]
    .sort((a, b) => {
      const aTime = a.created_at?.toDate ? a.created_at.toDate().getTime() : 0;
      const bTime = b.created_at?.toDate ? b.created_at.toDate().getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 5);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/select-role', { replace: true });
    } catch (err) {
      showToast('Failed to log out', 'error');
    }
  };

  const firstName = (userDoc?.name || 'there').split(' ')[0];

  if (loading) {
    return (
      <div className="screen dashboard-screen">
        <div className="screen-content spinner-center">
          <div className="spinner spinner-primary" style={{ width: 32, height: 32 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="screen dashboard-screen">
      <div className="screen-content">

        {/* ══════ Greeting Header ══════ */}
        <div className="dashboard-greeting">
          <div className="dashboard-greeting-left">
            <span className="dashboard-greeting-time">{getGreeting()}</span>
            <h1 className="dashboard-greeting-name">{firstName} 👋</h1>
            <div className="dashboard-gym-badge">
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>fitness_center</span>
              {gym?.name || 'My Gym'}
            </div>
          </div>
          <div
            className="dashboard-avatar-new"
            onClick={handleLogout}
            role="button"
            tabIndex={0}
            title="Tap to logout"
            id="avatar-btn"
          >
            {getInitials(userDoc?.name)}
          </div>
        </div>

        {/* ══════ Quick Actions ══════ */}
        <div className="dash-actions">
          <button className="dash-action-btn dash-action-primary" onClick={() => navigate('/scan')} id="scan-qr-btn">
            <span className="material-symbols-outlined">qr_code_scanner</span>
            Scan QR
          </button>
          <button className="dash-action-btn dash-action-secondary" onClick={() => navigate('/owner/leads')} id="leads-btn">
            <span className="material-symbols-outlined">edit_note</span>
            Inquiries
            {newLeadsCount > 0 && <span className="dash-action-badge">{newLeadsCount}</span>}
          </button>
        </div>

        {/* ══════ Stats Grid ══════ */}
        <div className="dash-stats-grid">
          <div className="dash-stat-card dash-glass dash-stagger-1" onClick={() => navigate('/owner/members')} role="button" tabIndex={0}>
            <div className="dash-stat-icon primary"><span className="material-symbols-outlined">group</span></div>
            <div className="dash-stat-label">Total Members</div>
            <div className="dash-stat-value">{totalCount}</div>
          </div>
          <div className="dash-stat-card dash-glass dash-stagger-2" onClick={() => navigate('/owner/members?filter=active')} role="button" tabIndex={0}>
            <div className="dash-stat-icon success"><span className="material-symbols-outlined">check_circle</span></div>
            <div className="dash-stat-label">Active</div>
            <div className="dash-stat-value">{activeCount}</div>
          </div>
          <div className="dash-stat-card dash-glass dash-stagger-3" onClick={() => navigate('/owner/members?filter=expiring')} role="button" tabIndex={0}>
            <div className="dash-stat-icon warning"><span className="material-symbols-outlined">schedule</span></div>
            <div className="dash-stat-label">Expiring Soon</div>
            <div className="dash-stat-value">{expiringCount}</div>
          </div>
          <div className="dash-stat-card dash-glass dash-stagger-4" onClick={() => navigate('/owner/members?filter=expired')} role="button" tabIndex={0}>
            <div className="dash-stat-icon danger"><span className="material-symbols-outlined">error</span></div>
            <div className="dash-stat-label">Expired</div>
            <div className="dash-stat-value">{expiredCount}</div>
          </div>
        </div>

        {/* ══════ Soon Expiring ══════ */}
        {expiringMembers.length > 0 && (
          <div className="dash-section" style={{ overflow: 'hidden' }}>
            <div className="dash-section-header">
              <h3 className="dash-section-title">Soon Expiring</h3>
              <button className="dash-section-link" style={{ color: '#0056D2', fontWeight: '600' }} onClick={() => navigate('/owner/members?filter=expiring')}>
                View All
              </button>
            </div>
            <div className="dash-horizontal-scroll">
              {expiringMembers.map((member) => {
                const avatarColor = getAvatarColor(member.name);
                const expDate = member.subscription_expiry?.toDate ? member.subscription_expiry.toDate() : null;
                const daysLeft = expDate ? Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 0;
                return (
                  <div key={member.id} className="dash-expiring-card">
                    <div className="dash-expiring-card-top">
                      <div className="dash-expiring-avatar" style={{ background: avatarColor.bg, color: avatarColor.text }}>
                        {getInitials(member.name)}
                      </div>
                      <div className="dash-expiring-info">
                        <div className="dash-expiring-name">{member.name}</div>
                        <div className="dash-expiring-days">Expires in {daysLeft} day{daysLeft !== 1 ? 's' : ''}</div>
                      </div>
                    </div>
                    <div className="dash-expiring-card-bottom">
                      <button className="dash-expiring-remind-btn">Send<br/>Reminder</button>
                      <button className="dash-expiring-renew-btn" onClick={(e) => { e.stopPropagation(); navigate(`/owner/payments/add?memberId=${member.id}`); }}>Renew</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══════ Two-col on desktop: Recent Members + Payments ══════ */}
        <div className="dash-desktop-two-col">

          {/* Recent Members */}
          {totalCount > 0 ? (
            <div className="dash-section">
              <div className="dash-section-header">
                <h3 className="dash-section-title">Recently Added</h3>
                <button className="dash-section-link" onClick={() => navigate('/owner/members')}>View all →</button>
              </div>
              {recentMembers.map((member) => {
                const { label, type } = getExpiryStatus(member.subscription_expiry);
                const avatarColor = getAvatarColor(member.name);
                const planName = getPlanName(gym, member.plan_id);
                return (
                  <div key={member.id} className="dash-row-card dash-glass" onClick={() => navigate(`/owner/members/${member.id}`)} role="button" tabIndex={0}>
                    <div className="dash-row-avatar" style={{ background: avatarColor.bg, color: avatarColor.text }}>{getInitials(member.name)}</div>
                    <div className="dash-row-info">
                      <div className="dash-row-name">{member.name}</div>
                      <div className="dash-row-sub">{planName || 'No plan'}</div>
                    </div>
                    <StatusBadge type={type} label={label} />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="dash-empty">
              <div className="dash-empty-icon"><span className="material-symbols-outlined">fitness_center</span></div>
              <h3 className="dash-empty-title">No members yet</h3>
              <p className="dash-empty-sub">Add your first member to get started</p>
              <button className="dash-empty-btn" onClick={() => navigate('/owner/members/add')} id="add-member-btn">
                + Add member
              </button>
            </div>
          )}

          {/* Payments */}
          <div className="dash-section">
            <div className="dash-section-header">
              <h3 className="dash-section-title">Payments</h3>
              <button className="dash-section-link" onClick={() => navigate('/owner/payments')}>View all →</button>
            </div>
            <div className="dash-revenue-row">
              <div className="dash-revenue-card dash-glass">
                <div className="dash-revenue-label">Collected this month</div>
                <div className="dash-revenue-amount collected">₹{collectedThisMonth.toLocaleString('en-IN')}</div>
              </div>
              {pendingDues > 0 && (
                <div className="dash-revenue-card dash-glass" onClick={() => navigate('/owner/payments?filter=Pending')} role="button">
                  <div className="dash-revenue-label">Pending dues</div>
                  <div className="dash-revenue-amount pending">₹{pendingDues.toLocaleString('en-IN')}</div>
                </div>
              )}
            </div>
            {recentPayments.length === 0 ? (
              <div className="dash-empty-inline dash-glass">
                No payments recorded yet.{' '}
                <button className="dash-section-link" onClick={() => navigate('/owner/payments/add')}>Record first →</button>
              </div>
            ) : (
              recentPayments.map(p => {
                const color = getAvatarColor(p.member_name);
                const d = p.payment_date?.toDate ? p.payment_date.toDate() : new Date(p.payment_date);
                const statusClass = p.status === 'paid' ? 'paid' : p.status === 'partial' ? 'partial' : 'due';
                const statusLabel = p.status === 'paid' ? 'Paid' : p.status === 'partial' ? 'Partial' : 'Pending';
                return (
                  <div key={p.id} className="dash-row-card dash-glass" onClick={() => navigate(`/owner/payments/${p.id}`)} role="button" tabIndex={0}>
                    <div className="dash-row-avatar" style={{ background: color.bg, color: color.text }}>{getInitials(p.member_name)}</div>
                    <div className="dash-row-info">
                      <div className="dash-row-name">{p.member_name}</div>
                      <div className="dash-row-sub">{p.plan_name} · {formatDate(d)}</div>
                    </div>
                    <div className="dash-row-right">
                      <div className="dash-row-amount">₹{(p.final_amount || 0).toLocaleString('en-IN')}</div>
                      <span className={`dash-pay-badge ${statusClass}`}>{statusLabel}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default OwnerDashboard;
