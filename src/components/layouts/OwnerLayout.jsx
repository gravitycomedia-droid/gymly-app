import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { logout } from '../../firebase/auth';
import { getInitials } from '../../utils/helpers';
import BottomNav from '../BottomNav';
import useNewLeadsCount from '../../hooks/useNewLeadsCount';
import '../../styles/gymloop-theme.css';

const OWNER_NAV = [
  { id: 'home',      label: 'Dashboard',  path: '/owner/dashboard',  icon: 'home' },
  { id: 'members',     label: 'Members',     path: '/owner/members',     icon: 'group' },
  { id: 'recycle-bin', label: 'Recycle Bin', path: '/owner/recycle-bin', icon: 'delete' },
  { id: 'payments',    label: 'Payments',    path: '/owner/payments',    icon: 'payments' },
  { id: 'analytics', label: 'Analytics',  path: '/owner/analytics',  icon: 'bar_chart' },
  { id: 'settings',  label: 'Settings',   path: '/owner/settings',   icon: 'settings' },
];

export default function OwnerLayout({ children, activeTab }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, userDoc, gymDoc } = useAuth();
  const gymName = gymDoc?.name || '';
  const leadsCount = useNewLeadsCount(userDoc?.gym_id);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/select-role', { replace: true });
    } catch {}
  };

  const isActive = (item) => {
    if (activeTab) return activeTab === item.id;
    return location.pathname.startsWith(item.path);
  };

  return (
    <div className="layout-shell owner-theme">
      {/* ── Sidebar (desktop only) ── */}
      <aside className="layout-sidebar">
        {/* Brand */}
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">
            <span className="material-symbols-outlined">fitness_center</span>
          </div>
          <div className="sidebar-brand-info">
            <div className="sidebar-gym-name">{gymName || 'Gymly'}</div>
            <div className="sidebar-gym-id">ID: {userDoc?.gym_id?.slice(0, 10).toUpperCase()}</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
          {OWNER_NAV.map(item => (
            <button
              key={item.id}
              className={`sidebar-nav-item ${isActive(item) ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
            >
              <span className="material-symbols-outlined sidebar-nav-icon">{item.icon}</span>
              <span className="sidebar-nav-label">{item.label}</span>
              {item.id === 'members' && leadsCount > 0 && (
                <span className="sidebar-nav-badge">{leadsCount}</span>
              )}
            </button>
          ))}
        </nav>

        {/* Quick Actions */}
        <div className="sidebar-quick-actions">
          <button className="sidebar-quick-btn primary" onClick={() => navigate('/scan')}>
            <span className="material-symbols-outlined">qr_code_scanner</span>
            Scan QR
          </button>
          <button className="sidebar-quick-btn secondary" onClick={() => navigate('/owner/members/add')}>
            <span className="material-symbols-outlined">person_add</span>
            Add Member
          </button>
          <button className="sidebar-quick-btn secondary" onClick={() => navigate('/owner/payments/add')}>
            <span className="material-symbols-outlined">payments</span>
            Record Payment
          </button>
          <button className="sidebar-quick-btn secondary" onClick={() => navigate('/owner/leads')} style={{ position: 'relative' }}>
            <span className="material-symbols-outlined">edit_note</span>
            Inquiries
            {leadsCount > 0 && (
              <span style={{
                position: 'absolute', top: -4, right: -4,
                minWidth: 18, height: 18, padding: '0 4px',
                background: 'var(--error)', color: '#fff',
                fontSize: 10, fontWeight: 700, borderRadius: 9,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>{leadsCount}</span>
            )}
          </button>
        </div>

        {/* User */}
        <div className="sidebar-user" onClick={handleLogout} role="button" title="Click to logout">
          <div className="sidebar-user-avatar">{getInitials(userDoc?.name)}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{userDoc?.name || 'Owner'}</div>
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
      <BottomNav activeTab={activeTab} role="owner" />
    </div>
  );
}
