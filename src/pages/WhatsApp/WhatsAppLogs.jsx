import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getWhatsAppLogsRealtime } from '../../firebase/firestore-payments';
import { getFunctions, httpsCallable } from 'firebase/functions';
import BottomNav from '../../components/BottomNav';
import './WhatsApp.css';

const TYPE_LABELS = {
  welcome: 'Welcome',
  welcome_message: 'Welcome',
  expiry_7d: 'Expiry 7d',
  expiry_3d: 'Expiry 3d',
  expiry_1d: 'Expiry 1d',
  payment_due: 'Payment Due',
  payment_receipt: 'Receipt',
  payment_confirmation: 'Payment',
  renewal_confirm: 'Renewal',
  workout_reminder: 'Workout',
  inactivity_alert: 'Inactivity',
};

const TYPE_ICONS = {
  welcome_message: '👋',
  welcome: '👋',
  expiry_7d: '⏰',
  expiry_3d: '⚠️',
  expiry_1d: '🔴',
  payment_due: '💰',
  payment_receipt: '🧾',
  payment_confirmation: '✅',
  workout_reminder: '💪',
  inactivity_alert: '😴',
};

const STATUS_CONFIG = {
  sent: { label: 'Sent', color: '#1D9E75', bg: 'rgba(29,158,117,0.1)' },
  delivered: { label: 'Delivered', color: '#1D9E75', bg: 'rgba(29,158,117,0.1)' },
  failed: { label: 'Failed', color: 'var(--error)', bg: 'rgba(186, 26, 26, 0.15)' },
  permanently_failed: { label: 'Perm. Failed', color: 'var(--error)', bg: 'rgba(186, 26, 26, 0.15)' },
  pending: { label: 'Pending', color: '#EF9F27', bg: 'rgba(239,159,39,0.1)' },
  retry: { label: 'Retrying', color: '#EF9F27', bg: 'rgba(239,159,39,0.1)' },
};

const FILTERS = ['All', 'Welcome', 'Expiry', 'Payment', 'Workout', 'Inactivity', 'Failed'];

const WhatsAppLogs = () => {
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    const unsub = getWhatsAppLogsRealtime(userDoc.gym_id, (list) => {
      setLogs(list);
      setLoading(false);
    });
    return () => unsub();
  }, [userDoc?.gym_id]);

  const now = new Date();
  const todayStr = now.toDateString();

  const sentToday = logs.filter(l => {
    const d = l.sent_at?.toDate ? l.sent_at.toDate() : null;
    return d && d.toDateString() === todayStr && (l.status === 'sent' || l.status === 'delivered');
  }).length;

  const thisMonth = logs.filter(l => {
    const d = l.sent_at?.toDate ? l.sent_at.toDate() : null;
    return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const failedCount = logs.filter(l => l.status === 'failed' || l.status === 'permanently_failed').length;
  const retryingCount = logs.filter(l => l.status === 'retry' || l.status === 'pending').length;

  const filtered = logs.filter(l => {
    if (filter === 'All') return true;
    if (filter === 'Welcome') return l.message_type === 'welcome' || l.message_type === 'welcome_message';
    if (filter === 'Expiry') return l.message_type?.startsWith('expiry');
    if (filter === 'Payment') return l.message_type === 'payment_receipt' || l.message_type === 'payment_due' || l.message_type === 'payment_confirmation';
    if (filter === 'Workout') return l.message_type === 'workout_reminder';
    if (filter === 'Inactivity') return l.message_type === 'inactivity_alert';
    if (filter === 'Failed') return l.status === 'failed' || l.status === 'permanently_failed';
    return true;
  });

  // Group by date
  const groupedByDate = {};
  filtered.forEach(l => {
    const d = l.sent_at?.toDate ? l.sent_at.toDate() : null;
    const key = d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Unknown';
    if (!groupedByDate[key]) groupedByDate[key] = [];
    groupedByDate[key].push(l);
  });

  if (loading) {
    return (
      <div className="screen whatsapp-screen">
        <div className="screen-content spinner-center">
          <div className="spinner spinner-primary" style={{ width: 32, height: 32 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="screen whatsapp-screen">
      <div className="screen-content">
        {/* Top bar */}
        <div className="top-bar">
          <button className="back-btn" onClick={() => navigate(-1)} style={{ marginBottom: 0 }}>← Back</button>
          <h1 className="top-bar-title">WhatsApp Logs</h1>
          <div style={{ width: 60 }} />
        </div>

        {/* Stats */}
        <div className="whatsapp-stats-row">
          <div className="whatsapp-stat-card glass-card">
            <div className="whatsapp-stat-value">{sentToday}</div>
            <div className="whatsapp-stat-label">Sent today</div>
          </div>
          <div className="whatsapp-stat-card glass-card">
            <div className="whatsapp-stat-value">{thisMonth}</div>
            <div className="whatsapp-stat-label">This month</div>
          </div>
          <div className="whatsapp-stat-card glass-card" style={failedCount > 0 ? { borderColor: 'rgba(226,75,74,0.3)' } : {}}>
            <div className="whatsapp-stat-value" style={failedCount > 0 ? { color: 'var(--error)' } : {}}>{failedCount}</div>
            <div className="whatsapp-stat-label">Failed</div>
          </div>
          {retryingCount > 0 && (
            <div className="whatsapp-stat-card glass-card" style={{ borderColor: 'rgba(239,159,39,0.3)' }}>
              <div className="whatsapp-stat-value" style={{ color: '#EF9F27' }}>{retryingCount}</div>
              <div className="whatsapp-stat-label">Retrying</div>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="filter-row">
          {FILTERS.map(f => (
            <button
              key={f}
              className={`filter-pill ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f}
              {f === 'Failed' && failedCount > 0 && (
                <span style={{ 
                  background: 'var(--error)', color: '#fff', borderRadius: 99, 
                  fontSize: 10, padding: '1px 5px', marginLeft: 4, fontWeight: 700 
                }}>{failedCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* Logs */}
        {filtered.length === 0 ? (
          <div className="payment-empty">
            <div className="payment-empty-icon" style={{ background: 'rgba(37, 211, 102, 0.08)' }}>
              <span style={{ fontSize: 20 }}>💬</span>
            </div>
            <h3>No messages yet</h3>
            <p>WhatsApp messages will appear here as they are sent</p>
          </div>
        ) : (
          Object.entries(groupedByDate).map(([dateLabel, dateLogs]) => (
            <div key={dateLabel}>
              <div style={{
                fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: 0.5,
                padding: '12px 4px 4px', marginTop: 8,
              }}>{dateLabel}</div>
              {dateLogs.map(l => {
                const time = l.sent_at?.toDate ? l.sent_at.toDate() : null;
                const statusConf = STATUS_CONFIG[l.status] || STATUS_CONFIG.pending;
                const icon = TYPE_ICONS[l.message_type] || '💬';

                return (
                  <div key={l.id} className={`wa-message-row glass-card ${l.status === 'failed' || l.status === 'permanently_failed' ? 'failed' : ''}`}>
                    <div className="wa-icon-circle">{icon}</div>
                    <div className="wa-message-info">
                      <div className="wa-message-name">{l.phone}</div>
                      <div>
                        <span className="wa-message-type-badge">{TYPE_LABELS[l.message_type] || l.message_type}</span>
                        {l.retry_count > 0 && (
                          <span style={{ 
                            fontSize: 10, color: '#EF9F27', marginLeft: 6, fontWeight: 600 
                          }}>Retry #{l.retry_count}</span>
                        )}
                      </div>
                      {l.error_reason && (
                        <div style={{ fontSize: 11, color: 'var(--error)', marginTop: 2 }}>
                          ⚠ {l.error_reason}
                        </div>
                      )}
                    </div>
                    <div className="wa-message-right">
                      <span className="wa-message-time">
                        {time ? time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                      <span
                        className="wa-status-badge"
                        style={{ background: statusConf.bg, color: statusConf.color }}
                      >
                        {statusConf.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}

        <div style={{ height: 100 }} />
      </div>
      <BottomNav role="owner" />
    </div>
  );
};

export default WhatsAppLogs;
