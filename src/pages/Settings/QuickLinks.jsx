import { useNavigate } from 'react-router-dom';

export default function QuickLinks() {
  const navigate = useNavigate();

  const links = [
    {
      icon: 'star',
      label: 'Subscription & Billing',
      desc: 'Manage your Gymly plan',
      color: 'rgba(156,39,176,0.12)',
      iconColor: '#9c27b0',
      route: '/owner/subscription',
    },
    {
      icon: 'credit_card',
      label: 'Payment history',
      desc: 'View all transactions',
      color: 'var(--primary-light)',
      iconColor: 'var(--primary)',
      route: '/owner/payments',
    },
    {
      icon: 'bar_chart',
      label: 'Analytics',
      desc: 'Insights and growth data',
      color: 'rgba(29,158,117,0.12)',
      iconColor: '#1D9E75',
      route: '/owner/analytics',
    },
    {
      icon: 'event_note',
      label: 'Attendance logs',
      desc: 'Check-in history',
      color: 'rgba(239,159,39,0.12)',
      iconColor: '#EF9F27',
      route: '/owner/attendance',
    },
    {
      icon: 'chat',
      label: 'WhatsApp logs',
      desc: 'Automated message history',
      color: 'rgba(37,211,102,0.12)',
      iconColor: '#25D366',
      route: '/owner/whatsapp',
    },
    {
      icon: 'qr_code_scanner',
      label: 'QR Scanner',
      desc: 'Scan member QR codes',
      color: 'var(--primary-light)',
      iconColor: 'var(--primary)',
      route: '/scan',
    },
    {
      icon: 'desktop_windows',
      label: 'Tablet kiosk mode',
      desc: 'Self check-in display',
      color: 'var(--primary-light)',
      iconColor: 'var(--primary)',
      route: '/tablet',
    },
  ];

  return (
    <div className="min-h-screen bg-mesh text-on-surface font-body-md pb-24">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 bg-surface/30 backdrop-blur-3xl border-b border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.1)]">
        <div className="flex items-center gap-4 px-4 py-4 max-w-7xl mx-auto">
          <button
            onClick={() => navigate('/owner/settings')}
            className="w-10 h-10 rounded-full glass-panel flex items-center justify-center text-on-surface hover:bg-white/20 transition-colors"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div>
            <p className="font-label-sm text-[10px] text-on-surface-variant uppercase tracking-wider">Navigation</p>
            <h1 className="font-headline-sm text-lg font-bold text-on-surface">Quick Links</h1>
          </div>
        </div>
      </header>

      <main className="pt-28 px-4 max-w-3xl mx-auto space-y-3">
        <div className="glass-panel rounded-2xl overflow-hidden">
          {links.map((link, idx) => (
            <button
              key={link.route}
              onClick={() => navigate(link.route)}
              className={`w-full flex items-center gap-4 px-4 py-4 text-left hover:bg-white/20 active:bg-white/30 transition-colors ${
                idx < links.length - 1 ? 'border-b border-white/10' : ''
              }`}
            >
              {/* Icon */}
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: link.color }}
              >
                <span
                  className="material-symbols-outlined text-xl leading-none"
                  style={{ color: link.iconColor }}
                >
                  {link.icon}
                </span>
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-on-surface">{link.label}</div>
                <div className="text-xs text-on-surface-variant mt-0.5">{link.desc}</div>
              </div>

              {/* Arrow */}
              <span className="material-symbols-outlined text-on-surface-variant text-lg flex-shrink-0">
                chevron_right
              </span>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
