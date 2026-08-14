import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { updatePayment } from '../../../firebase/firestore-payments';
import { collection, query, where, orderBy, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { usePaginatedCollection } from '../../../hooks/usePaginatedCollection';
import { getInitials, formatDate } from '../../../utils/helpers';
import { getAvatarColor } from '../../lib/avatarColor';
import ListScreen from '../../components/ListScreen';
import Badge from '../../primitives/Badge';
import EmptyState from '../../primitives/EmptyState';
import PageSkeleton from '../../primitives/PageSkeleton';

const FILTERS = ['All', 'Paid', 'Pending', 'Partial', 'This month', 'Cash', 'UPI'];

export default function PaymentsList() {
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  const { showToast } = useToast();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [clearingId, setClearingId] = useState(null);
  const [clearModalPayment, setClearModalPayment] = useState(null);
  const [clearAmount, setClearAmount] = useState('');

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    const unsub = onSnapshot(doc(db, 'gyms', userDoc.gym_id, 'stats', 'summary'), (snap) => { if (snap.exists()) setStats(snap.data()); }, (err) => console.error('Stats error:', err));
    return () => unsub();
  }, [userDoc?.gym_id]);

  const paymentsQuery = useMemo(() => {
    if (!userDoc?.gym_id) return null;
    return query(collection(db, 'payments'), where('gym_id', '==', userDoc.gym_id), orderBy('payment_date', 'desc'));
  }, [userDoc?.gym_id]);

  const { docs: payments, hasMore, loading: loadingMore, loadFirst, loadMore } = usePaginatedCollection(paymentsQuery, 15);

  useEffect(() => { loadFirst().then(() => setLoading(false)); }, [loadFirst]);

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const totalRevenueYTD = payments.filter((p) => {
    const d = p.payment_date?.toDate ? p.payment_date.toDate() : new Date(p.payment_date);
    return p.status === 'paid' && d.getFullYear() === currentYear;
  }).reduce((sum, p) => sum + (p.final_amount || 0), 0);

  const revenueThisMonth = stats?.month_revenue ?? payments.filter((p) => {
    const d = p.payment_date?.toDate ? p.payment_date.toDate() : new Date(p.payment_date);
    return p.status === 'paid' && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  }).reduce((sum, p) => sum + (p.final_amount || 0), 0);

  const pendingAmount = stats?.pending_dues ?? payments.filter((p) => p.status === 'pending' || p.status === 'partial').reduce((sum, p) => sum + (p.pending_amount || 0), 0);

  const filtered = payments.filter((p) => {
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

  const submitClearDue = async () => {
    if (!clearModalPayment || !clearAmount) return;
    setClearingId(clearModalPayment.id);
    try {
      const paying = Number(clearAmount);
      const newPaid = (clearModalPayment.paid_amount || 0) + paying;
      const newPending = Math.max(0, clearModalPayment.final_amount - newPaid);
      await updatePayment(clearModalPayment.id, { status: newPending === 0 ? 'paid' : 'partial', paid_amount: newPaid, pending_amount: newPending });
      showToast(`Payment updated for ${clearModalPayment.member_name} (₹${paying} collected)`, 'success');
    } catch (err) {
      console.error('Clear due error:', err);
      showToast('Failed to update due', 'error');
    } finally {
      setClearingId(null);
      setClearModalPayment(null);
      setClearAmount('');
    }
  };

  if (loading) return <PageSkeleton variant="kpis" rows={7} />;

  return (
    <ListScreen
      title="Payments"
      subtitle="Every rupee collected, newest first"
      kpis={[
        { label: 'Revenue (YTD)', value: `₹${totalRevenueYTD.toLocaleString('en-IN')}` },
        { label: 'This month', value: `₹${revenueThisMonth.toLocaleString('en-IN')}` },
        { label: 'Pending dues', value: `₹${pendingAmount.toLocaleString('en-IN')}`, color: pendingAmount > 0 ? 'var(--gl2-danger-fg)' : undefined },
      ]}
      primaryAction={<button type="button" className="gl2-btn gl2-btn-primary" onClick={() => navigate('/owner/payments/add')}>+ Record Payment</button>}
      filters={FILTERS}
      activeFilter={filter}
      onFilterChange={setFilter}
    >
      <div className="gl2-list">
        {filtered.length === 0 ? (
          <EmptyState title="No payments match that" sub="Try a different filter." />
        ) : (
          filtered.map((p) => {
            const d = p.payment_date?.toDate ? p.payment_date.toDate() : new Date(p.payment_date);
            const isPendingOrPartial = p.status === 'pending' || p.status === 'partial';
            return (
              <div key={p.id} className="gl2-row" style={{ cursor: 'pointer', flexWrap: 'wrap' }} onClick={() => navigate(`/owner/payments/${p.id}`)}>
                <span className="gl2-avatar" style={{ background: getAvatarColor(p.member_name) }}>{getInitials(p.member_name)}</span>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <p style={{ margin: 0, fontWeight: 700 }}>{p.member_name}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--gl2-muted)' }}>{p.plan_name} · {formatDate(d)}</p>
                </div>
                <span style={{ fontSize: 16, fontWeight: 800 }}>₹{(p.final_amount || 0).toLocaleString('en-IN')}</span>
                <Badge variant={p.status === 'paid' ? 'active' : p.status === 'partial' ? 'expiring' : 'expired'}>{p.status}</Badge>
                {isPendingOrPartial && (
                  <button type="button" className="gl2-btn gl2-btn-secondary" style={{ minHeight: 34, padding: '0 10px' }} disabled={clearingId === p.id} onClick={(e) => { e.stopPropagation(); setClearModalPayment(p); setClearAmount(p.pending_amount || ''); }}>
                    {clearingId === p.id ? '…' : 'Collect'}
                  </button>
                )}
                <button type="button" className="gl2-icon-btn" style={{ width: 36, height: 36 }} title="Member's payment history" onClick={(e) => { e.stopPropagation(); navigate(`/owner/payments/member/${p.member_id}`); }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 17 }}>chevron_right</span>
                </button>
              </div>
            );
          })
        )}
      </div>

      {hasMore && (
        <button type="button" className="gl2-btn gl2-btn-secondary" style={{ width: '100%', marginTop: 12, minHeight: 48 }} onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading…' : 'Load more payments'}
        </button>
      )}

      {clearModalPayment && (
        <div className="gl2-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14, zIndex: 200 }} onClick={() => setClearModalPayment(null)}>
          <div className="gl2-card" style={{ maxWidth: 380, width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <p className="gl2-card-title">Collect payment</p>
              <button type="button" className="gl2-icon-btn" style={{ width: 32, height: 32 }} onClick={() => setClearModalPayment(null)}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
              </button>
            </div>
            <div style={{ padding: 12, borderRadius: 11, background: 'var(--gl2-bg-soft)', marginBottom: 14 }}>
              <p style={{ margin: '0 0 2px', fontSize: 12.5, color: 'var(--gl2-muted)' }}>Member</p>
              <p style={{ margin: 0, fontWeight: 700 }}>{clearModalPayment.member_name}</p>
              <p style={{ margin: '10px 0 2px', fontSize: 12.5, color: 'var(--gl2-muted)' }}>Total pending</p>
              <p style={{ margin: 0, fontWeight: 800, color: 'var(--gl2-danger-fg)' }}>₹{clearModalPayment.pending_amount}</p>
            </div>
            <label className="gl2-field">
              <span className="gl2-field-label">Amount collected today</span>
              <input className="gl2-input" type="number" value={clearAmount} onChange={(e) => setClearAmount(e.target.value)} placeholder="0" />
            </label>
            <button type="button" className="gl2-btn gl2-btn-primary gl2-btn-lg" style={{ width: '100%', marginTop: 14 }} onClick={submitClearDue} disabled={clearingId === clearModalPayment.id}>
              {clearingId === clearModalPayment.id ? 'Saving…' : 'Confirm collection'}
            </button>
          </div>
        </div>
      )}
    </ListScreen>
  );
}
