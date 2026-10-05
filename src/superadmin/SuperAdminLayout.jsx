// src/superadmin/SuperAdminLayout.jsx
// The console shell: sidebar (md+), top bar + bottom tab bar (mobile), the
// account menu and the logout flow. Mirrors how OwnerShell wraps each owner
// route — App.jsx renders <SuperAdminLayout active="…"><Screen/></SuperAdminLayout>
// rather than a nested <Outlet/>, because AnimatedRoutes keys <Routes> by
// pathname and would remount a layout route on every navigation anyway.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  LayoutGrid, Megaphone, Layers, SlidersHorizontal, LogOut, PanelLeft, ArrowLeft,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { logout } from '../firebase/auth';
import { FOCUS } from './components/Button';
import { SaToastProvider, useSaToast } from './components/Toast';
import { ConfirmProvider, useConfirm } from './components/Overlays';

const SIDEBAR_KEY = 'gymly_sa_sidebar_collapsed';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid, path: '/admin' },
  { id: 'broadcasts', label: 'Broadcasts', icon: Megaphone, path: '/admin/broadcasts' },
  { id: 'plans', label: 'Plans', icon: Layers, path: '/admin/plans' },
  { id: 'settings', label: 'Settings', icon: SlidersHorizontal, path: '/admin/settings' },
];

const TITLES = {
  dashboard: 'Dashboard',
  gym: 'Gym details',
  broadcasts: 'Broadcasts',
  plans: 'Plans',
  settings: 'Settings',
};

export default function SuperAdminLayout({ active, children }) {
  return (
    <SaToastProvider>
      <ConfirmProvider>
        <Shell active={active}>{children}</Shell>
      </ConfirmProvider>
    </SaToastProvider>
  );
}

function Shell({ active, children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const reduce = useReducedMotion();
  const { user } = useAuth();
  const confirm = useConfirm();
  const { showToast } = useSaToast();

  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) === '1'; } catch { return false; }
  });
  const [menuOpen, setMenuOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0'); } catch { /* private mode */ }
      return next;
    });
  }, []);

  // Gym detail keeps the Dashboard nav item lit, and swaps the mobile logo
  // tile for a back arrow.
  const navActive = active === 'gym' ? 'dashboard' : active;

  const handleLogout = useCallback(async () => {
    setMenuOpen(false);
    const ok = await confirm({
      icon: LogOut,
      destructive: true,
      title: 'Log out of Super Admin?',
      body: 'You’ll need to sign in again to manage gyms, broadcasts and plans.',
      confirmLabel: 'Log out',
    });
    if (!ok) return;
    try {
      await logout();
      navigate('/select-role', { replace: true });
    } catch (err) {
      if (import.meta.env.DEV) console.error('Logout error:', err);
      showToast('Couldn’t log out. Please try again.', 'error');
    }
  }, [confirm, navigate, showToast]);

  return (
    <div className="flex h-dvh overflow-hidden bg-sa-canvas font-sa text-sa-ink">
      <Sidebar
        collapsed={collapsed}
        onToggle={toggleSidebar}
        activeId={navActive}
        onLogout={handleLogout}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          title={TITLES[active] || 'Super Admin'}
          showBack={active === 'gym'}
          email={user?.email || user?.phoneNumber || ''}
          menuOpen={menuOpen}
          onMenuToggle={() => setMenuOpen((o) => !o)}
          onMenuClose={() => setMenuOpen(false)}
          onLogout={handleLogout}
        />

        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <motion.div
            key={location.pathname}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="mx-auto max-w-[1200px] px-4 pb-6 pt-4 md:p-6 lg:px-8 lg:pb-12 lg:pt-8"
          >
            {children}
          </motion.div>
        </main>

        <BottomTabBar activeId={navActive} />
      </div>
    </div>
  );
}

// ── Sidebar (md+) ──────────────────────────────────────────────────────────
function Sidebar({ collapsed, onToggle, activeId, onLogout }) {
  // Tablet (768–1023) shows the 72px icon rail regardless of the stored
  // preference; the preference only governs lg and up.
  const width = collapsed ? 'md:w-[72px]' : 'md:w-[72px] lg:w-60';
  const hideLabel = collapsed ? 'hidden' : 'hidden lg:block';

  return (
    <aside className={`hidden shrink-0 flex-col border-r border-sa-line bg-sa-surface md:flex ${width}`}>
      <div className={`flex h-16 shrink-0 items-center gap-2.5 border-b border-sa-line-soft ${collapsed ? 'justify-center px-3' : 'px-3 lg:px-5'}`}>
        <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sa-accent text-sm font-bold text-white">
          G
        </span>
        <span className={`min-w-0 ${hideLabel}`}>
          <span className="block truncate text-[15px] font-semibold leading-5">Gymly</span>
          <span className="block truncate text-[11px] font-medium uppercase leading-[14px] tracking-[.06em] text-sa-ink-3">
            Super admin
          </span>
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Super Admin">
        {NAV.map(({ id, label, icon: Icon, path }) => {
          const isActive = id === activeId;
          return (
            <Link
              key={id}
              to={path}
              title={label}
              aria-current={isActive ? 'page' : undefined}
              className={`flex h-10 items-center gap-3 rounded-lg px-2.5 text-sm transition-colors
                ${collapsed ? 'justify-center' : 'justify-center lg:justify-start'}
                ${isActive
              ? 'bg-sa-accent-soft font-semibold text-sa-accent-ink'
              : 'font-medium text-sa-ink-2 hover:bg-sa-muted'} ${FOCUS}`}
            >
              <Icon aria-hidden="true" size={20} className="shrink-0" />
              <span className={`min-w-0 truncate ${hideLabel}`}>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col gap-1 border-t border-sa-line-soft p-3">
        <button
          type="button"
          onClick={onToggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`hidden h-10 items-center gap-3 rounded-lg px-2.5 text-sm font-medium text-sa-ink-2
            hover:bg-sa-muted lg:flex ${collapsed ? 'justify-center' : ''} ${FOCUS}`}
        >
          <PanelLeft aria-hidden="true" size={20} className="shrink-0" />
          <span className={`truncate ${hideLabel}`}>Collapse</span>
        </button>
        <button
          type="button"
          onClick={onLogout}
          title="Log out"
          className={`flex h-10 items-center gap-3 rounded-lg px-2.5 text-sm font-medium text-sa-danger
            hover:bg-sa-danger-soft ${collapsed ? 'justify-center' : 'justify-center lg:justify-start'} ${FOCUS}`}
        >
          <LogOut aria-hidden="true" size={20} className="shrink-0" />
          <span className={`truncate ${hideLabel}`}>Log out</span>
        </button>
      </div>
    </aside>
  );
}

// ── Top bar (mobile) ───────────────────────────────────────────────────────
function TopBar({ title, showBack, email, menuOpen, onMenuToggle, onMenuClose, onLogout }) {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) onMenuClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onMenuClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen, onMenuClose]);

  return (
    <header className="relative flex h-14 shrink-0 items-center gap-1 border-b border-sa-line bg-sa-surface pl-2 pr-1 md:hidden">
      {showBack ? (
        <button
          type="button"
          aria-label="Back to dashboard"
          onClick={() => navigate(-1)}
          className={`flex size-11 shrink-0 items-center justify-center rounded-lg text-sa-ink-2 hover:bg-sa-muted ${FOCUS}`}
        >
          <ArrowLeft size={20} />
        </button>
      ) : (
        <span className="flex size-11 shrink-0 items-center justify-center">
          <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-[7px] bg-sa-accent text-xs font-bold text-white">
            G
          </span>
        </span>
      )}

      <h1 className="min-w-0 flex-1 truncate text-[17px] font-semibold leading-6">{title}</h1>

      <div ref={wrapRef} className="shrink-0">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Account menu"
          onClick={onMenuToggle}
          className={`flex size-11 items-center justify-center rounded-lg ${FOCUS}`}
        >
          <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full bg-sa-accent-soft text-xs font-semibold text-sa-accent-ink">
            SA
          </span>
        </button>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              role="menu"
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.14, ease: 'easeOut' }}
              style={{ transformOrigin: 'top right' }}
              className="absolute right-2 top-[52px] z-50 w-[220px] rounded-xl border border-sa-line bg-sa-surface p-1.5 shadow-sa-md"
            >
              <div className="px-2.5 py-2">
                <p className="truncate text-sm font-semibold">Super Admin</p>
                {email && <p className="truncate text-xs text-sa-ink-3">{email}</p>}
              </div>
              <div className="my-1 h-px bg-sa-line-soft" />
              <Link
                to="/admin/settings"
                role="menuitem"
                onClick={onMenuClose}
                className={`flex h-11 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-sa-ink-2 hover:bg-sa-muted ${FOCUS}`}
              >
                <SlidersHorizontal aria-hidden="true" size={18} />
                Settings
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={onLogout}
                className={`flex h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-sa-danger hover:bg-sa-danger-soft ${FOCUS}`}
              >
                <LogOut aria-hidden="true" size={18} />
                Log out
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}

// ── Bottom tab bar (mobile) ────────────────────────────────────────────────
function BottomTabBar({ activeId }) {
  return (
    <nav
      aria-label="Super Admin"
      className="grid h-16 shrink-0 grid-cols-4 border-t border-sa-line bg-sa-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {NAV.map(({ id, label, icon: Icon, path }) => {
        const isActive = id === activeId;
        return (
          <Link
            key={id}
            to={path}
            aria-current={isActive ? 'page' : undefined}
            className={`flex min-w-0 flex-col items-center justify-center gap-0.5 active:bg-sa-canvas ${FOCUS}`}
          >
            <span
              className={`flex h-7 w-11 items-center justify-center rounded-full transition-colors
                ${isActive ? 'bg-sa-accent-soft text-sa-accent-ink' : 'text-[#5B606B]'}`}
            >
              <Icon aria-hidden="true" size={20} />
            </span>
            <span
              className={`max-w-full truncate text-[11px] leading-[14px]
                ${isActive ? 'font-semibold text-sa-accent-ink' : 'font-medium text-[#5B606B]'}`}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

// ── Shared page header (md+; on mobile the top bar carries the title) ──────
export function PageHeader({ title, subtitle, right }) {
  return (
    <header className="hidden flex-wrap items-end justify-between gap-4 md:flex">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold leading-8 tracking-[-0.01em]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-sa-ink-3">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}
