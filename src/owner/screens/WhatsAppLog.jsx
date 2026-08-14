import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getWhatsAppLogsRealtime } from '../../firebase/firestore-payments';
import ListScreen from '../components/ListScreen';
import EmptyState from '../primitives/EmptyState';

const TYPE_LABELS = {
  welcome: 'Welcome', welcome_message: 'Welcome', expiry_7d: 'Expiry 7d', expiry_3d: 'Expiry 3d', expiry_1d: 'Expiry 1d',
  payment_due: 'Payment due', payment_receipt: 'Receipt', payment_confirmation: 'Payment', renewal_confirm: 'Renewal',
  workout_reminder: 'Workout', inactivity_alert: 'Inactivity',
};
const TYPE_ICONS = {
  welcome_message: '👋', welcome: '👋', expiry_7d: '⏰', expiry_3d: '⚠️', expiry_1d: '🔴',
  payment_due: '💰', payment_receipt: '🧾', payment_confirmation: '✅', workout_reminder: '💪', inactivity_alert: '😴',
};
const STATUS_VARIANT = { sent: 'active', delivered: 'active', failed: 'expired', permanently_failed: 'expired', pending: 'expiring', retry: 'expiring' };
const STATUS_LABEL = { sent: 'Sent', delivered: 'Delivered', failed: 'Failed', permanently_failed: 'Perm. failed', pending: 'Pending', retry: 'Retrying' };
const FILTERS = ['All', 'Welcome', 'Expiry', 'Payment', 'Workout', 'Inactivity', 'Failed'];

export default function WhatsAppLog() {
  const { userDoc } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    const unsub = getWhatsAppLogsRealtime(userDoc.gym_id, (list) => { setLogs(list); setLoading(false); });
    return () => unsub();
  }, [userDoc?.gym_id]);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}><div className="spinner spinner-primary" style={{ width: 32, height: 32 }} /></div>;

  const now = new Date();
  const todayStr = now.toDateString();
  const sentToday = logs.filter((l) => { const d = l.sent_at?.toDate?.(); return d && d.toDateString() === todayStr && (l.status === 'sent' || l.status === 'delivered'); }).length;
  const thisMonth = logs.filter((l) => { const d = l.sent_at?.toDate?.(); return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length;
  const failedCount = logs.filter((l) => l.status === 'failed' || l.status === 'permanently_failed').length;

  const filtered = logs.filter((l) => {
    if (filter === 'All') return true;
    if (filter === 'Welcome') return l.message_type === 'welcome' || l.message_type === 'welcome_message';
    if (filter === 'Expiry') return l.message_type?.startsWith('expiry');
    if (filter === 'Payment') return ['payment_receipt', 'payment_due', 'payment_confirmation'].includes(l.message_type);
    if (filter === 'Workout') return l.message_type === 'workout_reminder';
    if (filter === 'Inactivity') return l.message_type === 'inactivity_alert';
    if (filter === 'Failed') return l.status === 'failed' || l.status === 'permanently_failed';
    return true;
  });

  const groupedByDate = {};
  filtered.forEach((l) => {
    const d = l.sent_at?.toDate?.();
    const key = d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Unknown';
    (groupedByDate[key] ||= []).push(l);
  });

  return (
    <ListScreen
      title="WhatsApp message log"
      subtitle="What went out, to whom, and whether it landed"
      kpis={[
        { label: 'Sent today', value: String(sentToday) },
        { label: 'This month', value: String(thisMonth) },
        { label: 'Failed', value: String(failedCount), color: failedCount > 0 ? 'var(--gl2-danger-fg)' : undefined },
      ]}
      filters={FILTERS}
      activeFilter={filter}
      onFilterChange={setFilter}
    >
      {filtered.length === 0 ? (
        <div className="gl2-list"><EmptyState title="No messages yet" sub="WhatsApp messages will appear here as they are sent." /></div>
      ) : (
        Object.entries(groupedByDate).map(([dateLabel, dateLogs]) => (
          <div key={dateLabel} style={{ marginBottom: 14 }}>
            <p className="gl2-eyebrow">{dateLabel}</p>
            <div className="gl2-list">
              {dateLogs.map((l) => {
                const time = l.sent_at?.toDate?.();
                return (
                  <div key={l.id} className="gl2-row" style={{ flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 20 }}>{TYPE_ICONS[l.message_type] || '💬'}</span>
                    <div style={{ flex: 1, minWidth: 130 }}>
                      <p style={{ margin: 0, fontWeight: 700 }}>{l.phone}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--gl2-muted)' }}>
                        {TYPE_LABELS[l.message_type] || l.message_type}
                        {l.retry_count > 0 && ` · Retry #${l.retry_count}`}
                      </p>
                      {l.error_reason && <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--gl2-danger-fg)' }}>⚠ {l.error_reason}</p>}
                    </div>
                    <span style={{ fontSize: 12.5, color: 'var(--gl2-muted)' }}>{time ? time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                    <span className={`gl2-tag gl2-tag-${STATUS_VARIANT[l.status] || 'neutral'}`}>{STATUS_LABEL[l.status] || l.status}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </ListScreen>
  );
}
