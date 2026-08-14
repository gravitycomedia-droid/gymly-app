import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { getMemberPayments } from '../../../firebase/firestore-payments';
import { getInitials, formatDate } from '../../../utils/helpers';
import { getAvatarColor } from '../../lib/avatarColor';
import Badge from '../../primitives/Badge';
import EmptyState from '../../primitives/EmptyState';
import PageSkeleton from '../../primitives/PageSkeleton';

export default function MemberPaymentHistory() {
  const { memberId } = useParams();
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userDoc?.gym_id || !memberId) return;
    getMemberPayments(userDoc.gym_id, memberId).then(setPayments).catch((err) => console.error(err)).finally(() => setLoading(false));
  }, [userDoc?.gym_id, memberId]);

  if (loading) return <PageSkeleton variant="kpis" rows={5} />;

  const memberName = payments[0]?.member_name || 'Member';
  const memberPhone = payments[0]?.member_phone || '';
  const totalPaid = payments.filter((p) => p.status === 'paid').reduce((s, p) => s + (p.final_amount || 0), 0);
  const totalPending = payments.filter((p) => p.status === 'pending' || p.status === 'partial').reduce((s, p) => s + (p.pending_amount || 0), 0);

  return (
    <section data-screen-label="Member payment history">
      <button type="button" className="gl2-back-link" onClick={() => navigate(-1)}>
        <span className="material-symbols-outlined" style={{ fontSize: 17 }}>arrow_back_ios</span>Back
      </button>
      <h1 className="gl2-page-title" style={{ marginBottom: 4 }}>{memberName} · payment history</h1>
      <p className="gl2-page-sub" style={{ marginBottom: 14 }}>The full history — linked from the member profile instead of repeating it there.</p>

      <div className="gl2-card" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <span className="gl2-avatar gl2-avatar-lg" style={{ background: getAvatarColor(memberName) }}>{getInitials(memberName)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>{memberName}</p>
          {memberPhone && <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--gl2-muted)' }}>{memberPhone}</p>}
        </div>
        <button type="button" className="gl2-btn gl2-btn-secondary" onClick={() => navigate(`/owner/members/${memberId}`)}>Profile</button>
      </div>

      <div className="gl2-kpi-grid">
        <div className="gl2-kpi-tile">
          <p className="gl2-kpi-label">Total paid</p>
          <p className="gl2-kpi-value" style={{ color: 'var(--gl2-success-fg)' }}>₹{totalPaid.toLocaleString('en-IN')}</p>
        </div>
        <div className="gl2-kpi-tile">
          <p className="gl2-kpi-label">Pending</p>
          <p className="gl2-kpi-value" style={{ color: totalPending > 0 ? 'var(--gl2-danger-fg)' : undefined }}>₹{totalPending.toLocaleString('en-IN')}</p>
        </div>
      </div>

      <button type="button" className="gl2-btn gl2-btn-primary" style={{ width: '100%', marginBottom: 14 }} onClick={() => navigate(`/owner/payments/add?memberId=${memberId}`)}>
        + Record new payment
      </button>

      <div className="gl2-list">
        {payments.length === 0 ? (
          <EmptyState title="No payments recorded yet" />
        ) : (
          payments.map((p) => {
            const d = p.payment_date?.toDate ? p.payment_date.toDate() : new Date(p.payment_date);
            return (
              <div key={p.id} className="gl2-row" style={{ cursor: 'pointer' }} onClick={() => navigate(`/owner/payments/${p.id}`)}>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <p style={{ margin: 0, fontWeight: 700 }}>{p.plan_name || 'Payment'}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--gl2-muted)' }}>
                    {formatDate(d)}{p.invoice_number ? ` · #${p.invoice_number}` : ''}{p.method ? ` · ${p.method.toUpperCase()}` : ''}
                  </p>
                </div>
                <span style={{ fontSize: 16, fontWeight: 800 }}>₹{(p.final_amount || 0).toLocaleString('en-IN')}</span>
                <Badge variant={p.status === 'paid' ? 'active' : p.status === 'partial' ? 'expiring' : 'expired'}>{p.status}</Badge>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
