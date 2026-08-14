import { useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { logout } from '../firebase/auth';
import { getInitials } from '../utils/helpers';
import useNewLeadsCount from '../hooks/useNewLeadsCount';
import { getGymMembers, getGymStaff } from '../firebase/firestore';
import { getAvatarColor } from './lib/avatarColor';
import { OwnerShellContext } from './OwnerShellContext';
import Toast from './primitives/Toast';
import './theme.css';

// `activeTab` passed in from App.jsx routes must be one of these ids — each
// route under a given section (e.g. /owner/leads under "home", /owner/members/*
// under "members") passes the section's id so the right nav item highlights.
const NAV = [
  { id: 'home', label: 'Dashboard', icon: 'home', path: '/owner/dashboard' },
  { id: 'members', label: 'Members', icon: 'group', path: '/owner/members' },
  { id: 'payments', label: 'Payments', icon: 'payments', path: '/owner/payments' },
  { id: 'analytics', label: 'Analytics', icon: 'bar_chart', path: '/owner/analytics' },
  { id: 'settings', label: 'Settings', icon: 'settings', path: '/owner/settings' },
];

const QUICK_ACTIONS = (newLeads, navigate) => [
  { id: 'scan', label: 'Scan QR', icon: 'qr_code_scanner', go: () => navigate('/scan') },
  { id: 'addMember', label: 'Add Member', icon: 'person_add', go: () => navigate('/owner/members/add') },
  { id: 'recordPayment', label: 'Record Payment', icon: 'payments', go: () => navigate('/owner/payments/add') },
  { id: 'leads', label: 'Inquiries', icon: 'inbox', go: () => navigate('/owner/leads'), badge: newLeads },
];

export default function OwnerShell({ children, activeTab }) {
  const navigate = useNavigate();
  const { userDoc, gymDoc } = useAuth();
  const newLeads = useNewLeadsCount(userDoc?.gym_id);

  const [toastMsg, setToastMsg] = useState('');
  const [quickViewMember, setQuickViewMember] = useState(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [gq, setGq] = useState('');
  const [searchPool, setSearchPool] = useState(null); // { members, staff } — lazy-loaded once per open
  const [searchLoading, setSearchLoading] = useState(false);
  const toastTimer = useRef(null);

  const toast = useCallback((msg) => {
    clearTimeout(toastTimer.current);
    setToastMsg(msg);
    toastTimer.current = setTimeout(() => setToastMsg(''), 2400);
  }, []);

  const openQuickView = useCallback((member) => setQuickViewMember(member), []);
  const closeQuickView = useCallback(() => setQuickViewMember(null), []);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    if (!searchPool && userDoc?.gym_id) {
      setSearchLoading(true);
      Promise.all([
        getGymMembers(userDoc.gym_id, null, 300).then((r) => r.members || []).catch(() => []),
        getGymStaff(userDoc.gym_id).catch(() => []),
      ]).then(([members, staff]) => {
        setSearchPool({ members, staff });
        setSearchLoading(false);
      });
    }
  }, [searchPool, userDoc?.gym_id]);

  const closeSearch = () => { setSearchOpen(false); setGq(''); };

  const handleLogout = async () => {
    await logout();
    navigate('/select-role', { replace: true });
  };

  const activeGroup = NAV.find((n) => n.id === activeTab) || NAV[0];

  const quickItems = QUICK_ACTIONS(newLeads, navigate);

  const searchResults = useMemo(() => {
    const q = gq.trim().toLowerCase();
    if (!q || !searchPool) return [];
    const results = [];
    searchPool.members
      .filter((m) => m.name?.toLowerCase().includes(q) || m.phone?.includes(q))
      .slice(0, 6)
      .forEach((m) => results.push({ kind: 'Member', title: m.name, sub: `${m.phone || ''}`, go: () => { navigate(`/owner/members/${m.id}`); closeSearch(); } }));
    searchPool.staff
      .filter((s) => s.name?.toLowerCase().includes(q))
      .slice(0, 3)
      .forEach((s) => results.push({ kind: 'Staff', title: s.name, sub: s.role || '', go: () => { navigate('/owner/staff'); closeSearch(); } }));
    ['Payments', 'Members', 'Staff', 'Settings', 'Analytics']
      .filter((label) => label.toLowerCase().startsWith(q))
      .forEach((label) => results.push({ kind: 'Page', title: label, sub: 'Open page', go: () => { navigate(`/owner/${label.toLowerCase()}`); closeSearch(); } }));
    return results.slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gq, searchPool]);

  return (
    <OwnerShellContext.Provider value={{ toast, openQuickView, closeQuickView, openSearch }}>
      <div className="gl2-app">
        <header className="gl2-topbar">
          <div className="gl2-brand">
            <span className="gl2-brand-mark">
              <span className="material-symbols-outlined" style={{ color: '#fff', fontSize: 20 }}>fitness_center</span>
            </span>
            <div className="gl2-brand-text">
              <span className="gl2-brand-name">Gymly</span>
              <span className="gl2-brand-gym">{gymDoc?.name || 'My Gym'}</span>
            </div>
          </div>

          <button type="button" className="gl2-search-trigger" onClick={openSearch}>
            <span className="material-symbols-outlined" style={{ fontSize: 17 }}>search</span>
            <span>Search members, staff, payments</span>
          </button>

          <div className="gl2-topbar-actions">
            <button type="button" className="gl2-scan-btn" onClick={() => navigate('/scan')}>
              <span className="material-symbols-outlined" style={{ fontSize: 17 }}>qr_code_scanner</span>
              <span>Check-in scan</span>
            </button>
          </div>
        </header>

        <div className="gl2-body">
          <nav aria-label="Primary" className="gl2-sidebar">
            <p className="gl2-sidebar-label">Menu</p>
            {NAV.map((n) => (
              <button
                key={n.id}
                type="button"
                className={`gl2-nav-item ${activeGroup.id === n.id ? 'active' : ''}`}
                onClick={() => navigate(n.path)}
              >
                <span className="material-symbols-outlined">{n.icon}</span>
                <span>{n.label}</span>
              </button>
            ))}

            <p className="gl2-sidebar-label" style={{ marginTop: 16 }}>Quick actions</p>
            {quickItems.map((q) => (
              <button key={q.id} type="button" className="gl2-quick-item" onClick={q.go}>
                <span className="material-symbols-outlined">{q.icon}</span>
                <span>{q.label}</span>
                {!!q.badge && <span className="gl2-quick-item-badge">{q.badge}</span>}
              </button>
            ))}

            <div className="gl2-role-card">
              <div className="gl2-role-card-inner" onClick={handleLogout} role="button" tabIndex={0}>
                <p className="gl2-role-card-title">{userDoc?.name || 'Owner'}</p>
                <p className="gl2-role-card-sub">Tap to logout</p>
              </div>
            </div>
          </nav>

          <main className="gl2-main">
            <div className="gl2-page">{children}</div>
          </main>
        </div>

        {/* Mobile bottom nav + FAB */}
        <div className="gl2-mobile-dock">
          <div className="gl2-fab-wrap">
            {quickOpen && quickItems.map((q) => (
              <button key={q.id} type="button" className="gl2-fab-item" onClick={() => { setQuickOpen(false); q.go(); }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{q.icon}</span>
                {q.label}
              </button>
            ))}
            <button type="button" className="gl2-fab-main" onClick={() => setQuickOpen((v) => !v)}>
              <span style={{ fontSize: 19, lineHeight: 1 }}>{quickOpen ? '×' : '+'}</span>
              Quick actions
            </button>
          </div>
          <nav aria-label="Primary" className="gl2-bottom-nav">
            {NAV.map((n) => (
              <button
                key={n.id}
                type="button"
                className={`gl2-bottom-nav-item ${activeGroup.id === n.id ? 'active' : ''}`}
                onClick={() => navigate(n.path)}
              >
                <span className="material-symbols-outlined">{n.icon}</span>
                <span className="gl2-bottom-nav-label">{n.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Global search */}
        {searchOpen && (
          <div className="gl2-overlay gl2-search-overlay" onClick={closeSearch}>
            <div className="gl2-search-panel" onClick={(e) => e.stopPropagation()}>
              <input
                type="search"
                className="gl2-input"
                style={{ marginBottom: 11 }}
                placeholder="Search members, staff, payments"
                autoFocus
                value={gq}
                onChange={(e) => setGq(e.target.value)}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {searchResults.map((r, i) => (
                  <button key={i} type="button" className="gl2-search-result" onClick={r.go}>
                    <span className="gl2-search-kind">{r.kind}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 15, fontWeight: 700 }}>{r.title}</span>
                      <span style={{ display: 'block', fontSize: 13, color: 'var(--gl2-muted)' }}>{r.sub}</span>
                    </span>
                  </button>
                ))}
              </div>
              {!gq.trim() && (
                <p style={{ margin: '14px 4px', fontSize: 14.5, color: 'var(--gl2-muted)' }}>
                  Start typing a member, staff or payment to jump straight there.
                </p>
              )}
              {gq.trim() && searchLoading && (
                <p style={{ margin: '14px 4px', fontSize: 14.5, color: 'var(--gl2-muted)' }}>Loading…</p>
              )}
              {gq.trim() && !searchLoading && searchResults.length === 0 && (
                <p style={{ margin: '14px 4px', fontSize: 14.5, color: 'var(--gl2-muted)' }}>No matches.</p>
              )}
            </div>
          </div>
        )}

        {/* Quick view drawer */}
        {quickViewMember && (
          <div className="gl2-overlay gl2-quickview-overlay" onClick={closeQuickView}>
            <aside className="gl2-quickview" onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <span className="gl2-avatar" style={{ width: 52, height: 52, borderRadius: 26, fontSize: 18, background: getAvatarColor(quickViewMember.name) }}>
                  {getInitials(quickViewMember.name)}
                </span>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: '-.3px' }}>{quickViewMember.name}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 14, color: 'var(--gl2-muted)' }}>{quickViewMember.phone}</p>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div className="gl2-kpi-tile" style={{ padding: 11 }}>
                  <p className="gl2-kpi-label">Plan</p>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{quickViewMember.planName || '—'}</p>
                </div>
                <div className="gl2-kpi-tile" style={{ padding: 11 }}>
                  <p className="gl2-kpi-label">Status</p>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 800, textTransform: 'capitalize' }}>{quickViewMember.status || '—'}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
                <button type="button" className="gl2-btn gl2-btn-primary gl2-btn-lg" style={{ flex: 1 }} onClick={() => { navigate(`/owner/members/${quickViewMember.id}`); closeQuickView(); }}>
                  Open profile
                </button>
                <button type="button" className="gl2-btn gl2-btn-secondary gl2-btn-lg" onClick={closeQuickView}>Close</button>
              </div>
            </aside>
          </div>
        )}

        <Toast message={toastMsg} />
      </div>
    </OwnerShellContext.Provider>
  );
}
