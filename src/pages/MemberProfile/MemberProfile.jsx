import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { logout } from '../../firebase/auth';
import { linkMemberships } from '../../firebase/firestore';
import { getInitials, getAvatarColor } from '../../utils/helpers';
import BottomNav from '../../components/BottomNav';
import './MemberProfile.css';

const MemberProfile = () => {
  const navigate = useNavigate();
  const { user, userDoc, setActiveMembership } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [memberships, setMemberships] = useState([]);
  const [showGymModal, setShowGymModal] = useState(false);
  const [switchingId, setSwitchingId] = useState(null);

  // Discover the member's other gym memberships (if any) so we can offer a
  // "Switch gym" option. Re-linking here is idempotent.
  useEffect(() => {
    if (!user?.uid || !userDoc?.phone) return;
    let cancelled = false;
    linkMemberships(user.uid, userDoc.phone)
      .then((list) => { if (!cancelled) setMemberships(list || []); })
      .catch(() => { /* non-critical */ });
    return () => { cancelled = true; };
  }, [user?.uid, userDoc?.phone]);

  const handleLogout = async () => {
    setLoggingOut(true);
    await logout();
    navigate('/select-role', { replace: true });
  };

  const handleSwitchGym = async (membershipId) => {
    if (membershipId === userDoc?.id) { setShowGymModal(false); return; }
    setSwitchingId(membershipId);
    try {
      await setActiveMembership(user.uid, membershipId);
      setShowGymModal(false);
      navigate('/member/home', { replace: true });
    } catch {
      setSwitchingId(null);
    }
  };

  const avatarColor = getAvatarColor(userDoc?.name);



  return (
    <div className="screen member-profile-screen">
      <div className="screen-content">
        <h1 className="top-bar-title" style={{ marginBottom: 24 }}>Profile</h1>

        <div className="profile-header">
          <div className="profile-avatar-large" style={{ background: avatarColor.bg, color: avatarColor.text }}>
            {getInitials(userDoc?.name)}
            <div className="avatar-edit-btn">✎</div>
          </div>
          <h2 className="profile-name">{userDoc?.name}</h2>
          <p className="profile-phone">{userDoc?.phone}</p>
        </div>

        <div className="profile-menu">
          <button className="profile-menu-item glass-card" onClick={() => setShowQRModal(true)}>
            <div className="menu-item-icon" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>📱</div>
            <div className="menu-item-text">
              <div className="menu-item-title">My Membership QR</div>
              <div className="menu-item-subtitle">Show to owner for quick access</div>
            </div>
            <div className="menu-item-arrow">→</div>
          </button>

          <button className="profile-menu-item glass-card" onClick={() => navigate('/member/card')}>
            <div className="menu-item-icon" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>💳</div>
            <div className="menu-item-text">
              <div className="menu-item-title">Digital Membership Card</div>
              <div className="menu-item-subtitle">View and share your ID</div>
            </div>
            <div className="menu-item-arrow">→</div>
          </button>

          <button className="profile-menu-item glass-card" onClick={() => navigate('/member/edit-profile')}>
            <div className="menu-item-icon" style={{ background: 'rgba(29, 158, 117,0.1)', color: 'var(--success)' }}>⚙️</div>
            <div className="menu-item-text">
              <div className="menu-item-title">Account Settings</div>
              <div className="menu-item-subtitle">Edit personal details</div>
            </div>
            <div className="menu-item-arrow">→</div>
          </button>

          <button className="profile-menu-item glass-card" onClick={() => navigate('/member/notifications')}>
            <div className="menu-item-icon" style={{ background: 'rgba(239, 159, 39,0.1)', color: 'var(--amber)' }}>🔔</div>
            <div className="menu-item-text">
              <div className="menu-item-title">Notifications</div>
              <div className="menu-item-subtitle">Reminders and alerts</div>
            </div>
            <div className="menu-item-arrow">→</div>
          </button>

          {/* Agreement menu item */}
          {userDoc?.agreement_status === 'agreed' && userDoc?.agreement_url ? (
            <a
              href={userDoc.agreement_url}
              target="_blank"
              rel="noreferrer"
              className="profile-menu-item glass-card"
              style={{ textDecoration: 'none' }}
            >
              <div className="menu-item-icon" style={{ background: 'rgba(29,158,117,0.1)', color: '#1D9E75' }}>📄</div>
              <div className="menu-item-text">
                <div className="menu-item-title">Membership Agreement</div>
                <div className="menu-item-subtitle" style={{ color: '#1D9E75', fontWeight: 600 }}>✅ Signed — tap to download</div>
              </div>
              <div className="menu-item-arrow">↓</div>
            </a>
          ) : (
            <button
              className="profile-menu-item glass-card"
              onClick={() => navigate('/member/agreement')}
              style={{ borderColor: 'rgba(239,159,39,0.3)' }}
            >
              <div className="menu-item-icon" style={{ background: 'rgba(239,159,39,0.1)', color: '#EF9F27' }}>📝</div>
              <div className="menu-item-text">
                <div className="menu-item-title">Membership Agreement</div>
                <div className="menu-item-subtitle" style={{ color: '#EF9F27', fontWeight: 600 }}>⏳ Pending — tap to sign</div>
              </div>
              <div className="menu-item-arrow">→</div>
            </button>
          )}

          <button className="profile-menu-item glass-card" onClick={() => navigate('/member/payments')}>
            <div className="menu-item-icon" style={{ background: 'rgba(55,138,221,0.1)', color: '#378ADD' }}>💳</div>
            <div className="menu-item-text">
               <div className="menu-item-title">Billing & Payments</div>
               <div className="menu-item-subtitle" style={{ color: 'var(--text-muted)' }}>View history & download receipts</div>
            </div>
            <div className="menu-item-arrow">→</div>
          </button>

          {memberships.length > 1 && (
            <button className="profile-menu-item glass-card" onClick={() => setShowGymModal(true)}>
              <div className="menu-item-icon" style={{ background: 'rgba(109,54,212,0.1)', color: '#6D36D4' }}>🏋️</div>
              <div className="menu-item-text">
                <div className="menu-item-title">Switch Gym</div>
                <div className="menu-item-subtitle">You&apos;re a member at {memberships.length} gyms</div>
              </div>
              <div className="menu-item-arrow">→</div>
            </button>
          )}
        </div>

        <div className="profile-details glass-card" style={{ padding: '20px', marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Fitness Profile</h3>
          
          <div className="detail-row">
            <span className="detail-label">Goal</span>
            <span className="detail-value">{userDoc?.goal || 'Not set'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Experience</span>
            <span className="detail-value">{userDoc?.experience || 'Not set'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Height</span>
            <span className="detail-value">{userDoc?.height ? `${userDoc.height} cm` : 'Not set'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Blood Group</span>
            <span className="detail-value">{userDoc?.blood_group || 'Not set'}</span>
          </div>
        </div>

        <button 
          className="btn-ghost logout-btn" 
          onClick={handleLogout}
          disabled={loggingOut}
          style={{ width: '100%', padding: '16px', color: 'var(--danger)', marginBottom: 80 }}
        >
          {loggingOut ? <div className="spinner" style={{ borderTopColor: 'var(--danger)' }}/> : 'Log out'}
        </button>
      </div>

      {/* Membership QR Modal */}
      {showQRModal && (
        <div className="modal-overlay" onClick={() => setShowQRModal(false)}>
          <div className="qr-modal glass-card" onClick={e => e.stopPropagation()}>
            <div className="qr-modal-header">
              <h3>Membership QR</h3>
              <button className="qr-close" onClick={() => setShowQRModal(false)}>×</button>
            </div>
            <div className="qr-container">
              <div className="qr-placeholder" style={{ background: '#fff', padding: 10, borderRadius: 12 }}>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=gymly://member/${userDoc?.id}/${userDoc?.gym_id}`}
                  alt="Membership QR"
                />
              </div>
              <p className="qr-help">Show this code to your gym owner to quickly pull up your membership details.</p>
            </div>
          </div>
        </div>
      )}

      {/* Switch Gym Modal */}
      {showGymModal && (
        <div className="modal-overlay" onClick={() => setShowGymModal(false)}>
          <div className="qr-modal glass-card" onClick={e => e.stopPropagation()}>
            <div className="qr-modal-header">
              <h3>Switch Gym</h3>
              <button className="qr-close" onClick={() => setShowGymModal(false)}>×</button>
            </div>
            <div className="gym-switch-list">
              {[...memberships]
                .sort((a, b) => (b.active === true) - (a.active === true))
                .map((m) => {
                  const isCurrent = m.id === userDoc?.id;
                  return (
                    <button
                      key={m.id}
                      className={`gym-switch-item${isCurrent ? ' current' : ''}`}
                      onClick={() => handleSwitchGym(m.id)}
                      disabled={switchingId != null}
                    >
                      <div className="gym-switch-info">
                        <span className="gym-switch-name">{m.gym_name}</span>
                        {m.plan_name && <span className="gym-switch-plan">{m.plan_name}</span>}
                      </div>
                      {switchingId === m.id ? (
                        <div className="spinner" style={{ width: 16, height: 16 }} />
                      ) : isCurrent ? (
                        <span className="gym-switch-badge current">Current</span>
                      ) : (
                        <span className={`gym-switch-badge ${m.active ? 'active' : 'inactive'}`}>
                          {m.active ? 'Active' : 'Expired'}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      <BottomNav activeTab="profile" role="member" />
    </div>
  );
};

export default MemberProfile;
