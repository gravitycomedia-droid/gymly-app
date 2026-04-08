import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getWhatsAppLogsRealtime } from '../../firebase/firestore-payments';
import BottomNav from '../../components/BottomNav';
import './WhatsApp.css';

const TYPE_LABELS = {
  welcome: 'Welcome',
  expiry_7d: 'Expiry 7d',
  expiry_3d: 'Expiry 3d',
  expiry_1d: 'Expiry 1d',
  payment_due: 'Payment Due',
  payment_receipt: 'Receipt',
  renewal_confirm: 'Renewal',
  workout_reminder: 'Workout',
};

const FILTERS = ['All', 'Welcome', 'Expiry', 'Payment', 'Workout'];

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
    return d && d.toDateString() === todayStr && l.status === 'sent';
  }).length;

  const thisMonth = logs.filter(l => {
    const d = l.sent_at?.toDate ? l.sent_at.toDate() : null;
    return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const failedCount = logs.filter(l => l.status === 'failed').length;

  const filtered = logs.filter(l => {
    if (filter === 'All') return true;
    if (filter === 'Welcome') return l.message_type === 'welcome';
    if (filter === 'Expiry') return l.message_type?.startsWith('expiry');
    if (filter === 'Payment') return l.message_type === 'payment_receipt' || l.message_type === 'payment_due';
    if (filter === 'Workout') return l.message_type === 'workout_reminder';
    return true;
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
          <h1 className="top-bar-title">WhatsApp</h1>
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
          <div className="whatsapp-stat-card glass-card failed">
            <div className="whatsapp-stat-value">{failedCount}</div>
            <div className="whatsapp-stat-label">Failed</div>
          </div>
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
          filtered.map(l => {
            const time = l.sent_at?.toDate ? l.sent_at.toDate() : null;
            return (
              <div key={l.id} className={`wa-message-row glass-card ${l.status === 'failed' ? 'failed' : ''}`}>
                <div className="wa-icon-circle">💬</div>
                <div className="wa-message-info">
                  <div className="wa-message-name">{l.phone}</div>
                  <div>
                    <span className="wa-message-type-badge">{TYPE_LABELS[l.message_type] || l.message_type}</span>
                  </div>
                  <div className="wa-message-preview">{l.message_preview}</div>
                </div>
                <div className="wa-message-right">
                  <span className="wa-message-time">
                    {time ? time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                  <span className={`wa-status-badge ${l.status}`}>
                    {l.status === 'sent' ? 'Sent' : l.status === 'failed' ? 'Failed' : 'Pending'}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
      <BottomNav role="owner" />
    </div>
  );
};

export default WhatsAppLogs;
