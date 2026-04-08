import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getPaymentsRealtime, clearPaymentDue, updatePayment } from '../../firebase/firestore-payments';
import { getInitials, getAvatarColor, formatDate } from '../../utils/helpers';
import BottomNav from '../../components/BottomNav';
import './Payments.css';

const FILTERS = ['All', 'Paid', 'Pending', 'Partial', 'This month', 'Cash', 'UPI'];

const PaymentList = () => {
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  const { showToast } = useToast();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [clearingId, setClearingId] = useState(null);

  const handleClearDue = async (e, payment) => {
    e.stopPropagation();
    setClearingId(payment.id);
    try {
      await updatePayment(payment.id, {
        status: 'paid',
        paid_amount: payment.final_amount,
        pending_amount: 0,
      });
      showToast(`Due cleared for ${payment.member_name}`, 'success');
    } catch (err) {
      showToast('Failed to clear due', 'error');
    } finally {
      setClearingId(null);
    }
  };

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    const unsub = getPaymentsRealtime(userDoc.gym_id, (list) => {
      setPayments(list);
      setLoading(false);
    });
    return () => unsub();
  }, [userDoc?.gym_id]);

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Summary calculations
  const collectedThisMonth = payments
    .filter(p => {
      const d = p.payment_date?.toDate ? p.payment_date.toDate() : new Date(p.payment_date);
      return p.status === 'paid' && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    })
    .reduce((sum, p) => sum + (p.final_amount || 0), 0);

  const pendingAmount = payments
    .filter(p => p.status === 'pending' || p.status === 'partial')
    .reduce((sum, p) => sum + (p.pending_amount || 0), 0);

  const totalThisYear = payments
    .filter(p => {
      const d = p.payment_date?.toDate ? p.payment_date.toDate() : new Date(p.payment_date);
      return p.status === 'paid' && d.getFullYear() === currentYear;
    })
    .reduce((sum, p) => sum + (p.final_amount || 0), 0);

  const todayStr = now.toDateString();
  const paymentsToday = payments.filter(p => {
    const d = p.payment_date?.toDate ? p.payment_date.toDate() : new Date(p.payment_date);
    return d.toDateString() === todayStr;
  }).length;

  // Filtered list
  const filtered = payments.filter(p => {
    if (filter === 'All') return true;
    if (filter === 'Paid') return p.status === 'paid';
    if (filter === 'Pending') return p.status === 'pending';
    if (filter === 'Partial') return p.status === 'partial';
    if (filter === 'Cash') return p.method === 'cash';
    if (filter === 'UPI') return p.method === 'upi';
    if (filter === 'This month') {
      const d = p.payment_date?.toDate ? p.payment_date.toDate() : new Date(p.payment_date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }
    return true;
  });

  // Group by date
  const grouped = {};
  filtered.forEach(p => {
    const d = p.payment_date?.toDate ? p.payment_date.toDate() : new Date(p.payment_date);
    const key = d.toDateString();
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(p);
  });

  function getDateLabel(dateStr) {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return formatDate(d);
  }

  if (loading) {
    return (
      <div className="screen payments-screen">
        <div className="screen-content spinner-center">
          <div className="spinner spinner-primary" style={{ width: 32, height: 32 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="screen payments-screen">
      <div className="screen-content">
        {/* Top bar */}
        <div className="top-bar">
          <h1 className="top-bar-title">Payments</h1>
          <button
            className="top-bar-action"
            onClick={() => navigate('/owner/payments/add')}
            id="record-payment-btn"
          >
            + Record
          </button>
        </div>

        {/* Summary cards */}
        <div className="payment-summary-grid">
          <div className="payment-summary-card glass-card green">
            <div className="payment-summary-icon">₹</div>
            <div className="payment-summary-value">₹{collectedThisMonth.toLocaleString('en-IN')}</div>
            <div className="payment-summary-label">Collected this month</div>
          </div>
          <div className="payment-summary-card glass-card amber">
            <div className="payment-summary-icon">⏱</div>
            <div className="payment-summary-value">₹{pendingAmount.toLocaleString('en-IN')}</div>
            <div className="payment-summary-label">Pending collection</div>
          </div>
          <div className="payment-summary-card glass-card purple">
            <div className="payment-summary-icon">📊</div>
            <div className="payment-summary-value">₹{totalThisYear.toLocaleString('en-IN')}</div>
            <div className="payment-summary-label">Total {currentYear}</div>
          </div>
          <div className="payment-summary-card glass-card blue">
            <div className="payment-summary-icon">📋</div>
            <div className="payment-summary-value">{paymentsToday}</div>
            <div className="payment-summary-label">Payments today</div>
          </div>
        </div>

        {/* Filter pills */}
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

        {/* Payment list */}
        {Object.keys(grouped).length === 0 ? (
          <div className="payment-empty">
            <div className="payment-empty-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="#534AB7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3>No payments recorded yet</h3>
            <p>Record your first payment to get started</p>
            <button className="btn-primary" onClick={() => navigate('/owner/payments/add')} style={{ maxWidth: 240, margin: '0 auto' }}>
              Record your first payment
            </button>
          </div>
        ) : (
          Object.entries(grouped).map(([dateKey, items]) => (
            <div key={dateKey} className="payment-date-group">
              <div className="payment-date-label">{getDateLabel(dateKey)}</div>
              {items.map(p => {
                const avatarColor = getAvatarColor(p.member_name);
                return (
                  <div
                    key={p.id}
                    className="payment-card glass-card"
                    onClick={() => navigate(`/owner/payments/${p.id}`)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="payment-card-avatar" style={{ background: avatarColor.bg, color: avatarColor.text }}>
                      {getInitials(p.member_name)}
                    </div>
                    <div className="payment-card-info">
                      <div className="payment-card-name">{p.member_name}</div>
                      <div className="payment-card-meta">
                        <span className="payment-card-plan">{p.plan_name}</span>
                        <span className="payment-method-badge">{p.method === 'cash' ? 'Cash' : p.method === 'upi' ? 'UPI' : 'Online'}</span>
                      </div>
                      <div className="payment-card-time">
                        {p.payment_date?.toDate ? p.payment_date.toDate().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}
                      </div>
                    </div>
                    <div className="payment-card-right">
                      <div className="payment-card-amount">₹{(p.final_amount || 0).toLocaleString('en-IN')}</div>
                      <span className={`payment-status-badge ${p.status}`}>
                        {p.status === 'paid' ? 'Paid' : p.status === 'pending' ? 'Pending' : 'Partial'}
                      </span>
                      {(p.status === 'pending' || p.status === 'partial') && (
                        <button
                          style={{
                            display: 'block', marginTop: 6, fontSize: 10, fontWeight: 600,
                            padding: '4px 8px', borderRadius: 6, border: 'none',
                            background: 'rgba(29,158,117,0.1)', color: '#1D9E75', cursor: 'pointer',
                          }}
                          onClick={(e) => handleClearDue(e, p)}
                          disabled={clearingId === p.id}
                        >
                          {clearingId === p.id ? '...' : '✓ Clear Due'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
      <BottomNav activeTab="payments" role="owner" />
    </div>
  );
};

export default PaymentList;
