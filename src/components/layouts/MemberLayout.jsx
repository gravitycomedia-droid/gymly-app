import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { logout } from '../../firebase/auth';
import { getInitials, getAvatarColor } from '../../utils/helpers';
import BottomNav from '../BottomNav';

const MEMBER_NAV = [
  { id: 'home',     label: 'Home',     path: '/member/home',     icon: 'home' },
  { id: 'workout',  label: 'Workout',  path: '/member/workout',  icon: 'fitness_center' },
  { id: 'progress', label: 'Progress', path: '/member/progress', icon: 'monitoring' },
  { id: 'profile',  label: 'Profile',  path: '/member/profile',  icon: 'person' },
];

export default function MemberLayout({ children, activeTab }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, userDoc } = useAuth();
  const avatarColor = getAvatarColor(userDoc?.name);

  const isActive = (item) => {
    if (activeTab) return activeTab === item.id;
    return location.pathname.startsWith(item.path);
  };

  return (
    <div className="layout-shell">
      {/* ── Sidebar (desktop only) ── */}
      <aside className="layout-sidebar member-sidebar">
        {/* User Profile */}
        <div className="sidebar-member-profile">
          <div
            className="sidebar-member-avatar"
            style={{ background: avatarColor.bg, color: avatarColor.text }}
          >
            {userDoc?.profile_photo
              ? <img src={userDoc.profile_photo} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
              : getInitials(userDoc?.name)
            }
          </div>
          <div className="sidebar-brand-info">
            <div className="sidebar-gym-name">{userDoc?.name || 'Member'}</div>
            <div className="sidebar-gym-id">Gymly Member</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
          {MEMBER_NAV.map(item => (
            <button
              key={item.id}
              className={`sidebar-nav-item ${isActive(item) ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
            >
              <span className="material-symbols-outlined sidebar-nav-icon">{item.icon}</span>
              <span className="sidebar-nav-label">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Extra links */}
        <div className="sidebar-quick-actions">
          <button className="sidebar-quick-btn secondary" onClick={() => navigate('/member/card')}>
            <span className="material-symbols-outlined">qr_code</span>
            My QR Card
          </button>
          <button className="sidebar-quick-btn secondary" onClick={() => navigate('/member/payments')}>
            <span className="material-symbols-outlined">receipt_long</span>
            My Payments
          </button>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Logout */}
        <div
          className="sidebar-user"
          onClick={async () => { try { await logout(); } catch {} }}
          role="button"
          title="Click to logout"
          style={{ cursor: 'pointer' }}
        >
          <div className="sidebar-user-avatar" style={{ background: avatarColor.bg, color: avatarColor.text, fontSize: 12 }}>
            {getInitials(userDoc?.name)}
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{userDoc?.name || 'Member'}</div>
            <div className="sidebar-user-role">Tap to logout</div>
          </div>
          <span className="material-symbols-outlined sidebar-user-logout">logout</span>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <div className="layout-main">
        {children}
      </div>

      {/* Mobile bottom nav */}
      <BottomNav activeTab={activeTab} role="member" />
    </div>
  );
}
