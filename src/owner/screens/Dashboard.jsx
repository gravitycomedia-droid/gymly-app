import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getInitials, getExpiryStatus, getPlanName, formatDate } from '../../utils/helpers';
import { getAvatarColor } from '../lib/avatarColor';
import Badge from '../primitives/Badge';
import useDashboardData from '../hooks/useDashboardData';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { userDoc, gymDoc: gym } = useAuth();
  const d = useDashboardData(userDoc?.gym_id);
  const firstName = (userDoc?.name || 'there').split(' ')[0];
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <section data-screen-label="Dashboard">
      <div className="gl2-page-header">
        <div>
          <h1 className="gl2-page-title">{getGreeting()}, {firstName}</h1>
          <p className="gl2-page-sub">{today} · {gym?.name || 'My Gym'}</p>
        </div>
        <div className="gl2-page-actions">
          <button type="button" className="gl2-btn gl2-btn-primary" onClick={() => navigate('/owner/members/add')}>+ Add Member</button>
          <button type="button" className="gl2-btn gl2-btn-secondary" onClick={() => navigate('/owner/payments/add')}>Record Payment</button>
        </div>
      </div>

      {(d.pendingDues > 0 || d.expiringCount > 0 || d.newLeadsCount > 0) && (
        <div className="gl2-attention-card">
          <p className="gl2-eyebrow" style={{ marginBottom: 10 }}>Needs attention today</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {d.pendingDues > 0 && (
              <div className="gl2-attention-row">
                <span className="gl2-attention-dot" style={{ background: '#C1362C' }} />
                <div style={{ flex: 1, minWidth: 150 }}>
                  <p className="gl2-attention-title">Members have unpaid dues</p>
                  <p className="gl2-attention-sub">₹{d.pendingDues.toLocaleString('en-IN')} outstanding</p>
                </div>
                <button type="button" className="gl2-btn gl2-btn-secondary" onClick={() => navigate('/owner/payments?filter=Pending')}>Collect</button>
              </div>
            )}
            {d.expiringCount > 0 && (
              <div className="gl2-attention-row">
                <span className="gl2-attention-dot" style={{ background: '#D08700' }} />
                <div style={{ flex: 1, minWidth: 150 }}>
                  <p className="gl2-attention-title">{d.expiringCount} membership{d.expiringCount !== 1 ? 's' : ''} expire{d.expiringCount === 1 ? 's' : ''} this week</p>
                  <p className="gl2-attention-sub">Send WhatsApp reminders</p>
                </div>
                <button type="button" className="gl2-btn gl2-btn-secondary" onClick={() => navigate('/owner/members?filter=expiring')}>Review</button>
              </div>
            )}
            {d.newLeadsCount > 0 && (
              <div className="gl2-attention-row">
                <span className="gl2-attention-dot" style={{ background: 'var(--gl2-primary)' }} />
                <div style={{ flex: 1, minWidth: 150 }}>
                  <p className="gl2-attention-title">{d.newLeadsCount} new enquir{d.newLeadsCount !== 1 ? 'ies' : 'y'} waiting</p>
                  <p className="gl2-attention-sub">Follow up before they go cold</p>
                </div>
                <button type="button" className="gl2-btn gl2-btn-secondary" onClick={() => navigate('/owner/leads')}>Open</button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="gl2-kpi-grid">
        <button type="button" className="gl2-kpi-tile" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => navigate('/owner/members')}>
          <p className="gl2-kpi-label">Total Members</p>
          <p className="gl2-kpi-value">{d.totalCount}</p>
        </button>
        <button type="button" className="gl2-kpi-tile" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => navigate('/owner/members?filter=active')}>
          <p className="gl2-kpi-label">Active</p>
          <p className="gl2-kpi-value" style={{ color: 'var(--gl2-success-fg)' }}>{d.activeCount}</p>
        </button>
        <button type="button" className="gl2-kpi-tile" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => navigate('/owner/members?filter=expiring')}>
          <p className="gl2-kpi-label">Expiring Soon</p>
          <p className="gl2-kpi-value" style={{ color: 'var(--gl2-warning-fg)' }}>{d.expiringCount}</p>
        </button>
        <button type="button" className="gl2-kpi-tile" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => navigate('/owner/members?filter=expired')}>
          <p className="gl2-kpi-label">Expired</p>
          <p className="gl2-kpi-value" style={{ color: 'var(--gl2-danger-fg)' }}>{d.expiredCount}</p>
        </button>
      </div>

      <div className="gl2-grid-2" style={{ marginBottom: 14 }}>
        <div className="gl2-chart-card">
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
            <p className="gl2-card-title">Payments · this month</p>
            <a href="#payments" onClick={(e) => { e.preventDefault(); navigate('/owner/payments'); }}>View all</a>
          </div>
          <p className="gl2-chart-total">₹{d.collectedThisMonth.toLocaleString('en-IN')}</p>
          {d.pendingDues > 0 ? (
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--gl2-warning-fg)', fontWeight: 700 }}>₹{d.pendingDues.toLocaleString('en-IN')} pending</p>
          ) : (
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--gl2-muted)' }}>No outstanding dues</p>
          )}
        </div>

        <div
          className="gl2-chart-card"
          style={{ cursor: 'pointer' }}
          onClick={() => navigate('/owner/attendance')}
          role="button"
          tabIndex={0}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
            <p className="gl2-card-title">In gym now · live</p>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gl2-primary-deep)' }}>View analytics</span>
          </div>
          <p className="gl2-chart-total" style={{ marginBottom: 0 }}>{d.occupancy}</p>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--gl2-muted)' }}>members inside now</p>
        </div>
      </div>

      {d.expiringMembers.length > 0 && (
        <div className="gl2-card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
            <p className="gl2-card-title">Expiring this week</p>
            <a href="#members" onClick={(e) => { e.preventDefault(); navigate('/owner/members?filter=expiring'); }}>View all</a>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {d.expiringMembers.map((m) => {
              const exp = m.subscription_expiry?.toDate ? m.subscription_expiry.toDate() : null;
              const daysLeft = exp ? Math.ceil((exp.getTime() - Date.now()) / 86400000) : 0;
              return (
                <div key={m.id} className="gl2-row">
                  <span className="gl2-avatar" style={{ background: getAvatarColor(m.name) }}>{getInitials(m.name)}</span>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <button type="button" onClick={() => navigate(`/owner/members/${m.id}`)} style={{ border: 0, background: 'none', padding: 0, font: 'inherit', fontSize: 14.5, fontWeight: 700, color: 'var(--gl2-ink)', cursor: 'pointer', textAlign: 'left' }}>{m.name}</button>
                    <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--gl2-muted)' }}>Expires in {daysLeft} day{daysLeft !== 1 ? 's' : ''}</p>
                  </div>
                  <button type="button" className="gl2-btn gl2-btn-secondary" style={{ minHeight: 36, padding: '0 12px' }} onClick={(e) => { e.stopPropagation(); navigate(`/owner/payments/add?memberId=${m.id}`); }}>Renew</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="gl2-grid-2">
        <div className="gl2-card">
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
            <p className="gl2-card-title">Recently added</p>
            <a href="#members" onClick={(e) => { e.preventDefault(); navigate('/owner/members'); }}>View all</a>
          </div>
          {d.recentMembers.length === 0 ? (
            <p style={{ margin: 0, fontSize: 14, color: 'var(--gl2-muted)' }}>No members yet — add your first member to get started.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {d.recentMembers.map((m) => {
                const { label, type } = getExpiryStatus(m.subscription_expiry);
                const planName = getPlanName(gym, m.plan_id);
                return (
                  <div key={m.id} className="gl2-row" style={{ cursor: 'pointer' }} onClick={() => navigate(`/owner/members/${m.id}`)} role="button" tabIndex={0}>
                    <span className="gl2-avatar" style={{ background: getAvatarColor(m.name) }}>{getInitials(m.name)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700 }}>{m.name}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--gl2-muted)' }}>{planName || 'No plan'}</p>
                    </div>
                    <Badge variant={type}>{label}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="gl2-card">
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
            <p className="gl2-card-title">Recent payments</p>
            <a href="#payments" onClick={(e) => { e.preventDefault(); navigate('/owner/payments'); }}>View all</a>
          </div>
          {d.recentPayments.length === 0 ? (
            <p style={{ margin: 0, fontSize: 14, color: 'var(--gl2-muted)' }}>
              No payments recorded yet.{' '}
              <a href="#add" onClick={(e) => { e.preventDefault(); navigate('/owner/payments/add'); }}>Record first</a>
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {d.recentPayments.map((p) => {
                const dt = p.payment_date?.toDate ? p.payment_date.toDate() : new Date(p.payment_date);
                return (
                  <div key={p.id} className="gl2-row" style={{ cursor: 'pointer' }} onClick={() => navigate(`/owner/payments/${p.id}`)} role="button" tabIndex={0}>
                    <span className="gl2-avatar" style={{ background: getAvatarColor(p.member_name) }}>{getInitials(p.member_name)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700 }}>{p.member_name}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--gl2-muted)' }}>{p.plan_name} · {formatDate(dt)}</p>
                    </div>
                    <span style={{ fontSize: 16, fontWeight: 800 }}>₹{(p.final_amount || 0).toLocaleString('en-IN')}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
