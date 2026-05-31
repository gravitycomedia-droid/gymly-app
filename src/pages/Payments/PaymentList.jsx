import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getPaymentsRealtime, clearPaymentDue, updatePayment } from '../../firebase/firestore-payments';
import { getInitials, getAvatarColor, formatDate } from '../../utils/helpers';
import BottomNav from '../../components/BottomNav';

const FILTERS = ['All', 'Paid', 'Pending', 'Partial', 'This month', 'Cash', 'UPI'];

const PaymentList = () => {
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  const { showToast } = useToast();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [clearingId, setClearingId] = useState(null);
  const [clearModalPayment, setClearModalPayment] = useState(null);
  const [clearAmount, setClearAmount] = useState('');

  const submitClearDue = async () => {
    if (!clearModalPayment || !clearAmount) return;
    setClearingId(clearModalPayment.id);
    try {
      const paying = Number(clearAmount);
      const newPaid = (clearModalPayment.paid_amount || 0) + paying;
      const newPending = Math.max(0, clearModalPayment.final_amount - newPaid);
      const newStatus = newPending === 0 ? 'paid' : 'partial';

      await updatePayment(clearModalPayment.id, {
        status: newStatus,
        paid_amount: newPaid,
        pending_amount: newPending,
      });
      showToast(`Payment updated for ${clearModalPayment.member_name} (₹${paying} collected)`, 'success');
    } catch (err) {
      showToast('Failed to update due', 'error');
    } finally {
      setClearingId(null);
      setClearModalPayment(null);
      setClearAmount('');
    }
  };

  const handleClearDue = (e, payment) => {
    e.stopPropagation();
    setClearModalPayment(payment);
    setClearAmount(payment.pending_amount || '');
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

  // Summary calculations matching new KPI cards
  const totalRevenueYTD = payments
    .filter(p => {
      const d = p.payment_date?.toDate ? p.payment_date.toDate() : new Date(p.payment_date);
      return p.status === 'paid' && d.getFullYear() === currentYear;
    })
    .reduce((sum, p) => sum + (p.final_amount || 0), 0);

  const revenueThisMonth = payments
    .filter(p => {
      const d = p.payment_date?.toDate ? p.payment_date.toDate() : new Date(p.payment_date);
      return p.status === 'paid' && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    })
    .reduce((sum, p) => sum + (p.final_amount || 0), 0);

  const pendingAmount = payments
    .filter(p => p.status === 'pending' || p.status === 'partial')
    .reduce((sum, p) => sum + (p.pending_amount || 0), 0);

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

  // Sort filtered payments by date descending
  const sortedPayments = [...filtered].sort((a, b) => {
    const dA = a.payment_date?.toDate ? a.payment_date.toDate() : new Date(a.payment_date);
    const dB = b.payment_date?.toDate ? b.payment_date.toDate() : new Date(b.payment_date);
    return dB - dA;
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
      <div className="min-h-screen bg-mesh text-on-surface font-body-md relative overflow-x-hidden pb-24">
        <div className="flex justify-center items-center h-screen">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mesh text-on-surface font-body-md relative overflow-x-hidden pb-24">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 bg-surface/30 backdrop-blur-3xl border-b border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.1)]">
        <div className="flex justify-between items-center px-4 pt-12 pb-4 w-full max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white shadow-sm font-bold text-xl">
              G
            </div>
            <div>
              <p className="font-label-sm text-[10px] text-on-surface-variant uppercase tracking-wider">Owner Dashboard</p>
              <h1 className="font-headline-sm text-lg font-bold text-on-surface">Payments History</h1>
            </div>
          </div>
          <button 
            onClick={() => navigate('/owner/payments/add')}
            className="w-10 h-10 rounded-full glass-panel flex items-center justify-center text-primary hover:backdrop-blur-xl hover:bg-white/10 transition-all duration-300 active:scale-95 hidden md:flex"
          >
            <span className="material-symbols-outlined">add</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-4 pt-36 pb-8 flex flex-col gap-6 w-full max-w-7xl mx-auto relative z-10">
        
        {/* KPI Grid */}
        <section className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6">
          <div className="glass-panel rounded-xl p-4 flex flex-col gap-2 group hover:-translate-y-1 transition-transform duration-300">
            <div className="flex justify-between items-center">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-[20px]">account_balance_wallet</span>
              </div>
            </div>
            <div>
              <p className="font-label-md text-[12px] text-on-surface-variant">Total Revenue (YTD)</p>
              <p className="font-headline-md text-headline-md text-on-surface mt-1">₹{totalRevenueYTD.toLocaleString('en-IN')}</p>
            </div>
          </div>

          <div className="glass-panel rounded-xl p-4 flex flex-col gap-2 group hover:-translate-y-1 transition-transform duration-300">
            <div className="flex justify-between items-center">
              <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-secondary text-[20px]">payments</span>
              </div>
            </div>
            <div>
              <p className="font-label-md text-[12px] text-on-surface-variant">Revenue This Month</p>
              <p className="font-headline-md text-headline-md text-on-surface mt-1">₹{revenueThisMonth.toLocaleString('en-IN')}</p>
            </div>
          </div>

          <div className="glass-panel rounded-xl p-4 flex flex-col md:flex-col justify-between md:justify-start gap-2 group hover:-translate-y-1 transition-transform duration-300 relative overflow-hidden col-span-2 md:col-span-1">
            <div className="absolute inset-0 bg-gradient-to-br from-error/5 to-transparent z-0"></div>
            <div className="flex justify-between items-center relative z-10">
              <div className="w-10 h-10 rounded-full bg-error/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-error text-[20px]">pending_actions</span>
              </div>
              {pendingAmount > 0 && (
                <span className="font-label-sm text-[10px] text-error bg-error/10 px-2 py-0.5 rounded-full">
                  Action Required
                </span>
              )}
            </div>
            <div className="relative z-10">
              <p className="font-label-md text-[12px] text-on-surface-variant">Pending Payments</p>
              <p className="font-headline-md text-headline-md text-on-surface mt-1">₹{pendingAmount.toLocaleString('en-IN')}</p>
            </div>
          </div>
        </section>

        {/* Revenue Trend Chart (Static Placeholder) */}
        <section className="glass-panel rounded-xl p-4 md:p-6 flex flex-col gap-4 hidden md:flex">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-headline-md text-headline-md text-on-surface">Revenue Trend</h2>
            <div className="flex gap-2">
              <button className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary px-3 py-1 rounded-full bg-white/50 transition-colors">1M</button>
              <button className="font-label-sm text-label-sm text-white bg-secondary px-3 py-1 rounded-full shadow-sm">6M</button>
              <button className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary px-3 py-1 rounded-full bg-white/50 transition-colors">1Y</button>
            </div>
          </div>
          <div className="w-full h-[240px] relative border-b border-l border-on-surface-variant/20 flex items-end">
            <svg className="w-full h-full preserve-3d" preserveAspectRatio="none" viewBox="0 0 1000 200">
              <defs>
                <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#6d36d4" stopOpacity="0.2"></stop>
                  <stop offset="100%" stopColor="#6d36d4" stopOpacity="0"></stop>
                </linearGradient>
              </defs>
              <path d="M0,200 L0,150 C100,120 200,180 300,140 C400,100 500,160 600,90 C700,20 800,110 900,60 C950,35 1000,40 1000,40 L1000,200 Z" fill="url(#chartGradient)"></path>
              <path d="M0,150 C100,120 200,180 300,140 C400,100 500,160 600,90 C700,20 800,110 900,60 C950,35 1000,40 1000,40" fill="none" stroke="#6d36d4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" style={{ filter: 'drop-shadow(0 4px 6px rgba(109,54,212,0.3))' }}></path>
              <circle cx="300" cy="140" fill="#ffffff" r="6" stroke="#6d36d4" strokeWidth="3"></circle>
              <circle cx="600" cy="90" fill="#ffffff" r="6" stroke="#6d36d4" strokeWidth="3"></circle>
              <circle cx="900" cy="60" fill="#ffffff" r="6" stroke="#6d36d4" strokeWidth="3"></circle>
            </svg>
          </div>
          <div className="flex justify-between w-full mt-2 px-2">
            <span className="font-label-sm text-label-sm text-on-surface-variant">Jul</span>
            <span className="font-label-sm text-label-sm text-on-surface-variant">Aug</span>
            <span className="font-label-sm text-label-sm text-on-surface-variant">Sep</span>
            <span className="font-label-sm text-label-sm text-on-surface-variant">Oct</span>
            <span className="font-label-sm text-label-sm text-on-surface-variant">Nov</span>
            <span className="font-label-sm text-label-sm text-on-surface-variant">Dec</span>
          </div>
        </section>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`font-label-sm text-label-sm whitespace-nowrap px-4 py-1.5 rounded-full transition-colors flex-shrink-0 ${
                filter === f 
                  ? 'bg-secondary text-white shadow-sm' 
                  : 'text-on-surface-variant bg-white/50 hover:bg-white/80'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Transactions List */}
        <section className="glass-panel rounded-xl overflow-hidden flex flex-col">
          <div className="p-4 border-b border-white/20 flex justify-between items-center bg-white/30">
            <h2 className="font-headline-md text-headline-md text-on-surface">Recent Transactions</h2>
            <span className="font-label-sm text-on-surface-variant">{filtered.length} found</span>
          </div>
          <div className="flex flex-col">
            <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-white/10 bg-white/10 hidden md:grid">
              <span className="font-label-sm text-label-sm text-on-surface-variant col-span-6 md:col-span-7">Member</span>
              <span className="font-label-sm text-label-sm text-on-surface-variant col-span-2 md:col-span-2 text-right">Date</span>
              <span className="font-label-sm text-label-sm text-on-surface-variant col-span-4 md:col-span-3 text-right">Amount / Status</span>
            </div>

            {sortedPayments.length === 0 ? (
              <div className="p-8 flex flex-col items-center justify-center text-center">
                <span className="material-symbols-outlined text-4xl text-on-surface-variant/40 mb-2">receipt_long</span>
                <p className="text-on-surface-variant">No payments found</p>
              </div>
            ) : (
              sortedPayments.map(p => {
                const dateStr = p.payment_date?.toDate ? p.payment_date.toDate().toDateString() : new Date(p.payment_date).toDateString();
                const displayDate = getDateLabel(dateStr);
                const avatarColor = getAvatarColor(p.member_name);
                
                return (
                  <div 
                    key={p.id} 
                    onClick={() => navigate(`/owner/payments/${p.id}`)}
                    className="grid grid-cols-12 gap-2 px-4 py-4 border-b border-white/10 hover:bg-white/40 transition-colors items-center cursor-pointer"
                  >
                    <div className="col-span-8 md:col-span-7 flex items-center gap-3">
                      <div 
                        className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-label-md text-label-md shadow-inner"
                        style={{ background: avatarColor.bg, color: avatarColor.text }}
                      >
                        {getInitials(p.member_name)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-label-md text-label-md text-on-surface font-semibold truncate">{p.member_name}</p>
                        <p className="font-label-sm text-[12px] text-on-surface-variant truncate">{p.plan_name}</p>
                      </div>
                    </div>
                    
                    <div className="hidden md:block md:col-span-2 text-right">
                      <p className="font-label-md text-label-md text-on-surface">{displayDate}</p>
                    </div>

                    <div className="col-span-4 md:col-span-3 flex flex-col items-end gap-1">
                      <p className="font-label-md text-label-md text-on-surface font-bold">₹{(p.final_amount || 0).toLocaleString('en-IN')}</p>
                      
                      <div className="flex gap-1 flex-wrap justify-end">
                        <span className={`font-label-sm text-[10px] px-2 py-[1px] rounded font-bold uppercase ${
                          p.status === 'paid' ? 'text-tertiary bg-tertiary/10' :
                          p.status === 'pending' ? 'text-error bg-error/10' : 'text-secondary bg-secondary/10'
                        }`}>
                          {p.status}
                        </span>
                        
                        {(p.status === 'pending' || p.status === 'partial') && (
                          <button
                            onClick={(e) => handleClearDue(e, p)}
                            disabled={clearingId === p.id}
                            className="font-label-sm text-[10px] px-2 py-[1px] rounded font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                          >
                            {clearingId === p.id ? '...' : 'Clear'}
                          </button>
                        )}
                      </div>
                      <p className="md:hidden font-label-sm text-[10px] text-on-surface-variant mt-1">{displayDate}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </main>

      {/* Clear Due Modal using glassmorphism */}
      {clearModalPayment && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" onClick={() => setClearModalPayment(null)}>
          <div className="glass-panel w-full max-w-sm rounded-2xl p-6 relative overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-headline-sm text-lg font-bold text-on-surface">Collect Payment</h3>
              <button 
                onClick={() => setClearModalPayment(null)}
                className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-white/40 transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            
            <div className="mb-6">
              <div className="glass-panel rounded-xl p-4 bg-white/30 border-white/40 mb-4">
                <p className="font-label-sm text-on-surface-variant mb-1">Member</p>
                <p className="font-label-md text-on-surface font-semibold">{clearModalPayment.member_name}</p>
                
                <div className="mt-3 pt-3 border-t border-white/20">
                  <p className="font-label-sm text-on-surface-variant mb-1">Total Pending</p>
                  <p className="font-headline-sm text-error font-bold">₹{clearModalPayment.pending_amount}</p>
                </div>
              </div>
              
              <div>
                <label className="font-label-sm text-on-surface-variant mb-2 block">Amount collected today</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant font-bold">₹</span>
                  <input
                    type="number"
                    value={clearAmount}
                    onChange={(e) => setClearAmount(e.target.value)}
                    className="w-full bg-white/50 border border-white/40 rounded-xl py-3 pl-8 pr-4 font-body-md text-on-surface outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
            
            <button 
              onClick={submitClearDue}
              disabled={clearingId === clearModalPayment.id}
              className="w-full bg-gradient-to-r from-primary to-secondary text-white font-label-md rounded-xl py-3 hover:shadow-lg hover:-translate-y-0.5 active:scale-95 transition-all flex justify-center items-center h-12"
            >
              {clearingId === clearModalPayment.id ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : 'Confirm Collection'}
            </button>
          </div>
        </div>
      )}

      {/* Mobile FAB for Record Payment */}
      <button 
        onClick={() => navigate('/owner/payments/add')}
        className="md:hidden fixed bottom-24 right-4 z-40 w-14 h-14 bg-gradient-to-r from-primary to-secondary rounded-full shadow-[0_8px_25px_-4px_rgba(109,54,212,0.6)] flex items-center justify-center text-white hover:scale-105 active:scale-95 transition-transform"
      >
        <span className="material-symbols-outlined text-[28px]">add</span>
      </button>

      <BottomNav activeTab="payments" role="owner" />
    </div>
  );
};

export default PaymentList;
