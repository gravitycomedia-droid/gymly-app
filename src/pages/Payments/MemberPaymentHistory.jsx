import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getMemberPayments } from '../../firebase/firestore-payments';
import { getInitials, getAvatarColor, formatDate } from '../../utils/helpers';
import BottomNav from '../../components/BottomNav';

const MemberPaymentHistory = () => {
  const { memberId } = useParams();
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userDoc?.gym_id || !memberId) return;
    getMemberPayments(userDoc.gym_id, memberId)
      .then(setPayments)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [userDoc?.gym_id, memberId]);

  const memberName = payments[0]?.member_name || 'Member';
  const memberPhone = payments[0]?.member_phone || '';
  const avatarColor = getAvatarColor(memberName);

  const totalPaid = payments.filter(p => p.status === 'paid').reduce((s, p) => s + (p.final_amount || 0), 0);
  const totalPending = payments.filter(p => p.status === 'pending' || p.status === 'partial').reduce((s, p) => s + (p.pending_amount || 0), 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-mesh text-on-surface font-body-md relative overflow-x-hidden pb-24 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mesh text-on-surface font-body-md relative overflow-x-hidden pb-24">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 bg-surface/30 backdrop-blur-3xl border-b border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.1)]">
        <div className="flex items-center gap-4 px-4 pt-12 pb-4 w-full max-w-7xl mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full glass-panel flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_back</span>
          </button>
          <div>
            <p className="font-label-sm text-[10px] text-on-surface-variant uppercase tracking-wider">Payment History</p>
            <h1 className="font-headline-sm text-lg font-bold text-on-surface">{memberName}</h1>
          </div>
        </div>
      </header>

      <main className="px-4 pt-32 pb-8 flex flex-col gap-5 w-full max-w-7xl mx-auto">

        {/* Member card */}
        <div className="glass-panel rounded-2xl p-5 flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold shrink-0"
            style={{ background: avatarColor.bg, color: avatarColor.text }}
          >
            {getInitials(memberName)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-on-surface text-base truncate">{memberName}</p>
            {memberPhone && <p className="text-sm text-on-surface-variant">{memberPhone}</p>}
          </div>
          <button
            onClick={() => navigate(`/owner/members/${memberId}`)}
            className="text-xs text-primary font-semibold flex items-center gap-1 shrink-0"
          >
            Profile
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_right</span>
          </button>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="glass-panel rounded-xl p-4">
            <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide mb-1">Total Paid</p>
            <p className="text-xl font-bold text-tertiary">₹{totalPaid.toLocaleString('en-IN')}</p>
            <p className="text-xs text-on-surface-variant mt-0.5">{payments.filter(p => p.status === 'paid').length} payment{payments.filter(p => p.status === 'paid').length !== 1 ? 's' : ''}</p>
          </div>
          <div className="glass-panel rounded-xl p-4">
            <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide mb-1">Pending</p>
            <p className={`text-xl font-bold ${totalPending > 0 ? 'text-error' : 'text-on-surface-variant'}`}>
              ₹{totalPending.toLocaleString('en-IN')}
            </p>
            <p className="text-xs text-on-surface-variant mt-0.5">{payments.filter(p => p.status !== 'paid').length} due</p>
          </div>
        </div>

        {/* Add Payment button */}
        <button
          onClick={() => navigate(`/owner/payments/add?memberId=${memberId}`)}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-secondary text-white font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add</span>
          Record New Payment
        </button>

        {/* Payment list */}
        <div className="glass-panel rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/20 bg-white/20">
            <h2 className="font-semibold text-on-surface text-sm">All Transactions</h2>
          </div>

          {payments.length === 0 ? (
            <div className="p-10 flex flex-col items-center text-center gap-2">
              <span className="material-symbols-outlined text-4xl text-on-surface-variant/40">receipt_long</span>
              <p className="text-on-surface-variant text-sm">No payments recorded yet</p>
            </div>
          ) : (
            payments.map((p) => {
              const d = p.payment_date?.toDate ? p.payment_date.toDate() : new Date(p.payment_date);
              return (
                <div
                  key={p.id}
                  onClick={() => navigate(`/owner/payments/${p.id}`)}
                  className="flex items-center gap-3 px-4 py-4 border-b border-white/10 hover:bg-white/30 transition-colors cursor-pointer"
                >
                  {/* Status dot */}
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    p.status === 'paid' ? 'bg-tertiary' :
                    p.status === 'partial' ? 'bg-secondary' : 'bg-error'
                  }`} />

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-on-surface truncate">{p.plan_name || 'Payment'}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      {formatDate(d)}
                      {p.invoice_number ? ` · #${p.invoice_number}` : ''}
                      {p.method ? ` · ${p.method.toUpperCase()}` : ''}
                    </p>
                  </div>

                  <div className="flex flex-col items-end shrink-0">
                    <p className="font-bold text-sm text-on-surface">₹{(p.final_amount || 0).toLocaleString('en-IN')}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded mt-0.5 ${
                      p.status === 'paid' ? 'text-tertiary bg-tertiary/10' :
                      p.status === 'partial' ? 'text-secondary bg-secondary/10' : 'text-error bg-error/10'
                    }`}>
                      {p.status.toUpperCase()}
                    </span>
                  </div>

                  <span className="material-symbols-outlined text-on-surface-variant/50 shrink-0" style={{ fontSize: 18 }}>chevron_right</span>
                </div>
              );
            })
          )}
        </div>
      </main>

      <BottomNav activeTab="payments" role="owner" />
    </div>
  );
};

export default MemberPaymentHistory;
