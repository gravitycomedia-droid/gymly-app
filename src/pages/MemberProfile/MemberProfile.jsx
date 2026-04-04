import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { logout } from '../../firebase/auth';
import { getInitials, getAvatarColor } from '../../utils/helpers';
import BottomNav from '../../components/BottomNav';
import './MemberProfile.css';

const MemberProfile = () => {
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await logout();
    navigate('/select-role', { replace: true });
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
          <button className="profile-menu-item glass-card" onClick={() => navigate('/member/card')}>
            <div className="menu-item-icon" style={{ background: 'rgba(83,74,183,0.1)', color: 'var(--primary)' }}>💳</div>
            <div className="menu-item-text">
              <div className="menu-item-title">Digital Membership Card</div>
              <div className="menu-item-subtitle">View and share your ID</div>
            </div>
            <div className="menu-item-arrow">→</div>
          </button>

          <button className="profile-menu-item glass-card" onClick={() => {}}>
            <div className="menu-item-icon" style={{ background: 'rgba(29, 158, 117,0.1)', color: 'var(--success)' }}>⚙️</div>
            <div className="menu-item-text">
              <div className="menu-item-title">Account Settings</div>
              <div className="menu-item-subtitle">Edit personal details</div>
            </div>
            <div className="menu-item-arrow">→</div>
          </button>

          <button className="profile-menu-item glass-card" onClick={() => {}}>
            <div className="menu-item-icon" style={{ background: 'rgba(239, 159, 39,0.1)', color: 'var(--amber)' }}>🔔</div>
            <div className="menu-item-text">
              <div className="menu-item-title">Notifications</div>
              <div className="menu-item-subtitle">Reminders and alerts</div>
            </div>
            <div className="menu-item-arrow">→</div>
          </button>
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

      <BottomNav activeTab="profile" role="member" />
    </div>
  );
};

export default MemberProfile;
