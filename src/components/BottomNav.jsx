import { useNavigate, useLocation } from 'react-router-dom';

const NAV_CONFIGS = {
  owner: [
    { id: 'home', label: 'Home', path: '/owner/dashboard', icon: 'home' },
    { id: 'members', label: 'Members', path: '/owner/members', icon: 'members' },
    { id: 'payments', label: 'Payments', path: '/owner/payments', icon: 'payments' },
    { id: 'analytics', label: 'Analytics', path: '/owner/analytics', icon: 'analytics' },
    { id: 'settings', label: 'Settings', path: '/owner/settings', icon: 'settings' },
  ],
  manager: [
    { id: 'home', label: 'Home', path: '/manager/members', icon: 'home' },
    { id: 'members', label: 'Members', path: '/manager/members', icon: 'members' },
    { id: 'settings', label: 'Settings', path: '/manager/settings', icon: 'settings' },
  ],
  trainer: [
    { id: 'home', label: 'Home', path: '/trainer/members', icon: 'home' },
    { id: 'members', label: 'My Members', path: '/trainer/members', icon: 'members' },
    { id: 'plans', label: 'Plans', path: '/trainer/workout-plans', icon: 'workout' },
    { id: 'settings', label: 'Settings', path: '/trainer/settings', icon: 'settings' },
  ],
  receptionist: [
    { id: 'home', label: 'Home', path: '/receptionist/members', icon: 'home' },
    { id: 'members', label: 'Members', path: '/receptionist/members', icon: 'members' },
    { id: 'settings', label: 'Settings', path: '/receptionist/settings', icon: 'settings' },
  ],
  member: [
    { id: 'home', label: 'Home', path: '/member/home', icon: 'home' },
    { id: 'workout', label: 'Workout', path: '/member/workout', icon: 'workout' },
    { id: 'progress', label: 'Progress', path: '/member/progress', icon: 'progress' },
    { id: 'profile', label: 'Profile', path: '/member/profile', icon: 'profile' },
  ],
};

const icons = {
  home: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" stroke="currentColor" strokeWidth="2" fill="none" />
      <polyline points="9 22 9 12 15 12 15 22" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  members: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="2" />
      <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" stroke="currentColor" strokeWidth="2" />
      <path d="M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  payments: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  analytics: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M18 20V10M12 20V4M6 20v-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  staff: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  settings: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
  ),
  workout: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M6 3v18M18 3v18M2 6h8M14 6h8M2 18h8M14 18h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  progress: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M18 20V10M12 20V4M6 20v-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  profile: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
    </svg>
  )
};

const BottomNav = ({ activeTab, role = 'owner' }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const tabs = NAV_CONFIGS[role] || NAV_CONFIGS.owner;

  const isActive = (tab) => {
    if (activeTab) return activeTab === tab.id;
    return location.pathname.startsWith(tab.path);
  };

  return (
    <div className="bottom-nav">
      <div className="bottom-nav-inner">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`bottom-nav-item ${isActive(tab) ? 'active' : ''}`}
            onClick={() => navigate(tab.path)}
            id={`nav-${tab.id}`}
          >
            {icons[tab.icon]}
            <span className="bottom-nav-label">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default BottomNav;
