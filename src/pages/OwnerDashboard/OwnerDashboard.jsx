import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getGym, getGymMembersRealtime } from '../../firebase/firestore';
import { logout } from '../../firebase/auth';
import { useNavigate } from 'react-router-dom';
import { getInitials, getAvatarColor, getExpiryStatus, getPlanName } from '../../utils/helpers';
import StatusBadge from '../../components/StatusBadge';
import BottomNav from '../../components/BottomNav';
import './OwnerDashboard.css';

const OwnerDashboard = () => {
  const { user, userDoc } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [gym, setGym] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bannerDismissed, setBannerDismissed] = useState(false);

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

  // Real-time member listener
  useEffect(() => {
    if (!userDoc?.gym_id) return;
    const unsubscribe = getGymMembersRealtime(userDoc.gym_id, (membersList) => {
      setMembers(membersList);
    });
    return () => unsubscribe();
  }, [userDoc?.gym_id]);

  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const totalCount = members.length;
  const activeCount = members.filter((m) => {
    const exp = m.subscription_expiry?.toDate ? m.subscription_expiry.toDate() : null;
    return exp && exp > now;
  }).length;
  const expiringCount = members.filter((m) => {
    const exp = m.subscription_expiry?.toDate ? m.subscription_expiry.toDate() : null;
    return exp && exp > now && exp <= sevenDaysFromNow;
  }).length;
  const expiredCount = members.filter((m) => {
    const exp = m.subscription_expiry?.toDate ? m.subscription_expiry.toDate() : null;
    return !exp || exp <= now;
  }).length;

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
        {/* Top Nav */}
        <div className="dashboard-nav">
          <div className="dashboard-brand">
            <span className="dashboard-brand-name">Gymly</span>
            <span className="dashboard-gym-name">{gym?.name || 'My Gym'}</span>
          </div>
          <div
            className="dashboard-avatar"
            onClick={handleLogout}
            role="button"
            tabIndex={0}
            title="Tap to logout"
            id="avatar-btn"
          >
            {getInitials(userDoc?.name)}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="stats-grid">
          <div className="stat-card glass-card">
            <div className="stat-card-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="#534AB7" strokeWidth="2"/>
                <circle cx="8.5" cy="7" r="4" stroke="#534AB7" strokeWidth="2" fill="none"/>
                <path d="M20 8v6M23 11h-6" stroke="#534AB7" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="stat-label">Total members</div>
            <div className="stat-value">{totalCount}</div>
          </div>

          <div className="stat-card glass-card">
            <div className="stat-card-icon" style={{ background: 'rgba(29,158,117,0.08)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14" stroke="#1D9E75" strokeWidth="2" strokeLinecap="round"/>
                <polyline points="22 4 12 14.01 9 11.01" stroke="#1D9E75" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="stat-label">Active</div>
            <div className="stat-value">{activeCount}</div>
          </div>

          <div className="stat-card glass-card">
            <div className="stat-card-icon" style={{ background: 'rgba(239,159,39,0.08)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="#EF9F27" strokeWidth="2" fill="none"/>
                <polyline points="12 6 12 12 16 14" stroke="#EF9F27" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="stat-label">Expiring soon</div>
            <div className="stat-value">{expiringCount}</div>
          </div>

          <div className="stat-card glass-card">
            <div className="stat-card-icon" style={{ background: 'rgba(226,75,74,0.08)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="#E24B4A" strokeWidth="2" fill="none"/>
                <line x1="12" y1="8" x2="12" y2="12" stroke="#E24B4A" strokeWidth="2" strokeLinecap="round"/>
                <line x1="12" y1="16" x2="12.01" y2="16" stroke="#E24B4A" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="stat-label">Expired</div>
            <div className="stat-value">{expiredCount}</div>
          </div>
        </div>

        {/* Expiring Soon Banner */}
        {expiringCount > 0 && !bannerDismissed && (
          <div className="alert-banner glass-card">
            <div className="alert-banner-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="#EF9F27" strokeWidth="2" fill="none"/>
                <path d="M13.73 21a2 2 0 01-3.46 0" stroke="#EF9F27" strokeWidth="2"/>
              </svg>
            </div>
            <span className="alert-banner-text">
              {expiringCount} member{expiringCount !== 1 ? 's' : ''} expiring in 7 days
            </span>
            <button className="alert-banner-link" onClick={() => navigate('/owner/members?filter=expiring')}>
              View list →
            </button>
            <button className="alert-banner-dismiss" onClick={() => setBannerDismissed(true)}>×</button>
          </div>
        )}

        {/* Recent Members or Empty State */}
        {totalCount > 0 ? (
          <div className="recent-section">
            <div className="recent-header">
              <h3 style={{ fontSize: 16, fontWeight: 600 }}>Recently added</h3>
              <button className="text-link" onClick={() => navigate('/owner/members')}>
                View all members →
              </button>
            </div>

            {recentMembers.map((member) => {
              const { label, type } = getExpiryStatus(member.subscription_expiry);
              const avatarColor = getAvatarColor(member.name);
              const planName = getPlanName(gym, member.plan_id);

              return (
                <div
                  key={member.id}
                  className="recent-member glass-card"
                  onClick={() => navigate(`/owner/members/${member.id}`)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="recent-member-avatar" style={{ background: avatarColor.bg, color: avatarColor.text }}>
                    {getInitials(member.name)}
                  </div>
                  <div className="recent-member-info">
                    <div className="recent-member-name">{member.name}</div>
                    <div className="recent-member-plan">{planName}</div>
                  </div>
                  <StatusBadge type={type} label={label} />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon-wrapper">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <rect x="1" y="10" width="4" height="4" rx="1" fill="#534AB7" opacity="0.4"/>
                <rect x="19" y="10" width="4" height="4" rx="1" fill="#534AB7" opacity="0.4"/>
                <rect x="5" y="8" width="3" height="8" rx="1.5" fill="#534AB7" opacity="0.3"/>
                <rect x="16" y="8" width="3" height="8" rx="1.5" fill="#534AB7" opacity="0.3"/>
                <rect x="8" y="11" width="8" height="2" rx="1" fill="#534AB7" opacity="0.4"/>
              </svg>
            </div>
            <h3 className="empty-title">No members yet</h3>
            <p className="empty-subtitle">Add your first member to get started</p>
            <button
              className="btn-primary btn-add-member"
              onClick={() => navigate('/owner/members/add')}
              id="add-member-btn"
            >
              + Add member
            </button>
          </div>
        )}
      </div>

      <BottomNav activeTab="home" role="owner" />
    </div>
  );
};

export default OwnerDashboard;
