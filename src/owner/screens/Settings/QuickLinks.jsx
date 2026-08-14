import { useNavigate } from 'react-router-dom';

const LINKS = [
  { icon: 'star', label: 'Subscription & Billing', desc: 'Manage your Gymly plan', route: '/owner/subscription' },
  { icon: 'credit_card', label: 'Payment history', desc: 'View all transactions', route: '/owner/payments' },
  { icon: 'bar_chart', label: 'Analytics', desc: 'Insights and growth data', route: '/owner/analytics' },
  { icon: 'event_note', label: 'Attendance logs', desc: 'Check-in history', route: '/owner/attendance' },
  { icon: 'chat', label: 'WhatsApp logs', desc: 'Automated message history', route: '/owner/whatsapp' },
  { icon: 'qr_code_scanner', label: 'QR scanner', desc: 'Scan member QR codes', route: '/scan' },
  { icon: 'desktop_windows', label: 'Tablet kiosk mode', desc: 'Self check-in display', route: '/tablet' },
];

export default function QuickLinks() {
  const navigate = useNavigate();
  return (
    <section data-screen-label="Quick links">
      <button type="button" className="gl2-back-link" onClick={() => navigate('/owner/settings')}>
        <span className="material-symbols-outlined" style={{ fontSize: 17 }}>arrow_back_ios</span>Settings
      </button>
      <h1 className="gl2-page-title" style={{ marginBottom: 14 }}>Quick links</h1>
      <div className="gl2-list">
        {LINKS.map((link) => (
          <div key={link.route} className="gl2-row" style={{ cursor: 'pointer' }} onClick={() => navigate(link.route)}>
            <span className="gl2-icon-btn" style={{ background: 'var(--gl2-primary-tint)', color: 'var(--gl2-primary-deep)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{link.icon}</span>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 14.5 }}>{link.label}</p>
              <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--gl2-muted)' }}>{link.desc}</p>
            </div>
            <span className="material-symbols-outlined" style={{ color: 'var(--gl2-muted-2)' }}>chevron_right</span>
          </div>
        ))}
      </div>
    </section>
  );
}
