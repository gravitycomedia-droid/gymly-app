import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getGymSubscription, getBillingHistory } from '../../utils/subscriptionService';
import { initiateRazorpayPayment } from '../../utils/razorpay';

const PLANS = {
  FREE: { name: 'Free', price: 0, billing: 'Free forever', members: 30, color: '#5A5E76', features: ['Up to 30 members', 'QR attendance', 'Member profiles'], missing: ['Payments', 'Analytics', 'WhatsApp automation'] },
  BASIC: { name: 'Basic', price: 199, billing: '₹199/month', members: 50, color: '#3E7CB1', features: ['Up to 50 members', 'QR attendance', 'Member management'], missing: ['Payments', 'Analytics', 'WhatsApp automation'] },
  PROFESSIONAL: { name: 'Professional', price: 499, billing: '₹499/month', members: 200, color: '#0F5E3C', features: ['Up to 200 members', 'Payment integration', 'Landing page + QR', 'Lead inquiry form', 'Invoice generation'], missing: ['Analytics', 'WhatsApp automation'] },
  PROFESSIONAL_PLUS: { name: 'Professional+', price: 799, billing: '₹799/month', members: 500, color: '#8A4B00', features: ['Up to 500 members', 'Advanced analytics', 'Trainer dashboard', 'Equipment tracking', '3 branches'], missing: ['WhatsApp automation'] },
  PREMIUM: { name: 'Premium', price: 999, billing: '₹999/month', members: Infinity, color: '#4A438F', featured: true, features: ['Unlimited members', 'WhatsApp automation', 'All analytics', 'Complete dashboard', 'Unlimited branches', 'Priority support'], missing: [] },
};
const PLAN_ORDER = ['FREE', 'BASIC', 'PROFESSIONAL', 'PROFESSIONAL_PLUS', 'PREMIUM'];
const TABS = [['plans', 'Plans'], ['history', 'Billing History'], ['payment', 'Payment']];

export default function Subscription() {
  const { userDoc } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const gymId = userDoc?.gym_id;

  const [subscription, setSubscription] = useState(null);
  const [billingHistory, setBillingHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('plans');
  const [upgradeModal, setUpgradeModal] = useState(null);
  const [cancelModal, setCancelModal] = useState(false);
  const [processing, setProcessing] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sub, billing] = await Promise.all([getGymSubscription(gymId), getBillingHistory(gymId)]);
      setSubscription(sub || { plan: 'PREMIUM', status: 'active', is_trial: false });
      setBillingHistory(billing);
    } catch (err) {
      console.error(err);
      showToast('Failed to load subscription data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (gymId) loadData(); }, [gymId]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentPlanKey = subscription?.plan || 'PREMIUM';
  const currentPlan = PLANS[currentPlanKey];
  const currentIdx = PLAN_ORDER.indexOf(currentPlanKey);

  const handleConfirmUpgrade = async () => {
    if (!upgradeModal) return;
    setProcessing(true);
    try {
      await initiateRazorpayPayment({
        amount: upgradeModal.plan.price * 100, gymName: userDoc?.name || 'Gymly', planName: upgradeModal.plan.name,
        onSuccess: async () => { showToast(`Upgraded to ${upgradeModal.plan.name}!`, 'success'); setUpgradeModal(null); await loadData(); },
        onFailure: (err) => { if (err !== 'dismissed') showToast(`Payment failed: ${err}`, 'error'); },
      });
    } catch (err) {
      showToast(`Payment error: ${err.message}`, 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleCancelSubscription = async () => { showToast('Please contact support to cancel your subscription.', 'info'); setCancelModal(false); };
  const toDateStr = (ts) => (!ts ? '—' : (ts.toDate ? ts.toDate() : new Date(ts)).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }));

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}><div className="spinner spinner-primary" style={{ width: 32, height: 32 }} /></div>;

  return (
    <section data-screen-label="Subscription">
      <button type="button" className="gl2-back-link" onClick={() => navigate('/owner/settings')}>
        <span className="material-symbols-outlined" style={{ fontSize: 17 }}>arrow_back_ios</span>Settings
      </button>
      <h1 className="gl2-page-title" style={{ marginBottom: 4 }}>Subscription & billing</h1>
      <p className="gl2-page-sub" style={{ marginBottom: 14 }}>Your Gymly plan, invoices and payment method.</p>

      {subscription && (
        <div className="gl2-card" style={{ marginBottom: 14, maxWidth: 420 }}>
          <p className="gl2-eyebrow" style={{ marginBottom: 4 }}>Current plan</p>
          <p style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 800, color: currentPlan?.color }}>{currentPlan?.name}</p>
          <span className={`gl2-tag ${subscription.status === 'active' ? 'gl2-tag-active' : subscription.status === 'past_due' ? 'gl2-tag-expiring' : 'gl2-tag-expired'}`}>
            {subscription.status === 'active' ? 'Active' : subscription.status === 'past_due' ? 'Past due' : 'Halted'}
          </span>
          {subscription.next_billing_date && <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--gl2-muted)' }}>Next billing: {toDateStr(subscription.next_billing_date)}</p>}
          {currentPlan?.price > 0 && <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--gl2-muted)' }}>{currentPlan.billing}</p>}
          {subscription.is_trial && subscription.trial_end_date && (() => {
            const endDate = subscription.trial_end_date.toDate ? subscription.trial_end_date.toDate() : new Date(subscription.trial_end_date);
            const days = Math.max(0, Math.ceil((endDate - Date.now()) / 86400000));
            return (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 6 }}><span>Free trial</span><span>{days} days left</span></div>
                <div className="gl2-progress-track"><div className="gl2-progress-fill" style={{ width: `${Math.round((days / 30) * 100)}%` }} /></div>
              </div>
            );
          })()}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {TABS.map(([key, label]) => <button key={key} type="button" className={`gl2-filter-chip ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>{label}</button>)}
      </div>

      {tab === 'plans' && (
        <>
          <div className="gl2-grid-3">
            {PLAN_ORDER.map((key) => {
              const plan = PLANS[key];
              const isCurrent = key === currentPlanKey;
              const isUpgrade = PLAN_ORDER.indexOf(key) > currentIdx;
              return (
                <div key={key} className="gl2-card" style={{ borderColor: isCurrent ? plan.color : undefined, position: 'relative' }}>
                  {isCurrent && <span className="gl2-tag" style={{ position: 'absolute', top: 14, right: 14, background: plan.color, color: '#fff' }}>Your plan</span>}
                  <p style={{ margin: '0 0 4px', fontWeight: 800, color: plan.color }}>{plan.name}</p>
                  <p style={{ margin: '0 0 12px', fontSize: 22, fontWeight: 800 }}>{plan.price === 0 ? 'Free' : `₹${plan.price}`}{plan.price > 0 && <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--gl2-muted)' }}>/mo</span>}</p>
                  <ul style={{ margin: '0 0 10px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {plan.features.map((f, i) => <li key={i} style={{ fontSize: 12.5 }}>✓ {f}</li>)}
                    {plan.missing.map((f, i) => <li key={`no-${i}`} style={{ fontSize: 12.5, color: 'var(--gl2-muted-2)' }}>✕ {f}</li>)}
                  </ul>
                  <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--gl2-muted)' }}>{plan.members === Infinity ? 'Unlimited members' : `Up to ${plan.members} members`}</p>
                  {isCurrent ? (
                    <button type="button" className="gl2-btn gl2-btn-secondary" style={{ width: '100%' }} disabled>Current plan</button>
                  ) : (
                    <button type="button" className="gl2-btn" style={{ width: '100%', background: isUpgrade ? plan.color : 'var(--gl2-surface)', color: isUpgrade ? '#fff' : 'var(--gl2-ink)', border: isUpgrade ? 'none' : '1px solid var(--gl2-border)' }} onClick={() => setUpgradeModal({ planKey: key, plan })}>
                      {isUpgrade ? `Upgrade to ${plan.name}` : `Downgrade to ${plan.name}`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {currentPlanKey !== 'FREE' && (
            <div className="gl2-card" style={{ marginTop: 14, borderColor: '#F0D5D2' }}>
              <p style={{ margin: '0 0 4px', fontWeight: 800, color: 'var(--gl2-danger-fg)' }}>Cancel subscription</p>
              <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--gl2-muted)' }}>Your gym will be downgraded to the FREE plan (30 member limit). All data is preserved.</p>
              <button type="button" className="gl2-btn gl2-btn-danger" onClick={() => setCancelModal(true)}>Cancel my subscription</button>
            </div>
          )}
        </>
      )}

      {tab === 'history' && (
        <div className="gl2-list">
          {billingHistory.length === 0 ? (
            <div className="gl2-empty"><p className="gl2-empty-title">No payment history yet</p></div>
          ) : billingHistory.map((p) => (
            <div key={p.id} className="gl2-row">
              <div style={{ flex: 1, minWidth: 120 }}><p style={{ margin: 0, fontWeight: 700 }}>{p.plan}</p><p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--gl2-muted)' }}>{toDateStr(p.payment_date)}</p></div>
              <span style={{ fontWeight: 800 }}>₹{((p.amount || 0) / 100).toFixed(0)}</span>
              <span className={`gl2-tag ${p.status === 'paid' || p.status === 'captured' ? 'gl2-tag-active' : 'gl2-tag-expiring'}`}>{p.status}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'payment' && (
        <div className="gl2-card" style={{ maxWidth: 420, textAlign: 'center' }}>
          {subscription?.payment_method_last4 ? (
            <>
              <p style={{ margin: '0 0 4px', fontWeight: 700 }}>•••• •••• •••• {subscription.payment_method_last4}</p>
              <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--gl2-muted)' }}>Expires {subscription.payment_method_expiry}</p>
              <button type="button" className="gl2-btn gl2-btn-secondary" style={{ width: '100%' }}>Update payment method</button>
            </>
          ) : (
            <>
              <p style={{ margin: '0 0 4px', fontWeight: 700 }}>No payment method on file</p>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--gl2-muted)' }}>A payment method will be saved when you upgrade to a paid plan.</p>
            </>
          )}
        </div>
      )}

      {upgradeModal && (
        <div className="gl2-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14, zIndex: 200 }} onClick={() => setUpgradeModal(null)}>
          <div className="gl2-card" style={{ maxWidth: 380, width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <p style={{ margin: '0 0 14px', fontWeight: 800 }}>{PLAN_ORDER.indexOf(upgradeModal.planKey) > currentIdx ? '⬆ Upgrade plan' : '⬇ Change plan'}</p>
            <div className="gl2-summary-rows" style={{ marginBottom: 14 }}>
              <div className="gl2-summary-row"><span className="gl2-summary-label">Current plan</span><span className="gl2-summary-value">{currentPlan?.name} ({currentPlan?.price === 0 ? 'Free' : `₹${currentPlan?.price}/mo`})</span></div>
              <div className="gl2-summary-row"><span className="gl2-summary-label">New plan</span><span className="gl2-summary-value">{upgradeModal.plan.name} ({upgradeModal.plan.price === 0 ? 'Free' : `₹${upgradeModal.plan.price}/mo`})</span></div>
            </div>
            {upgradeModal.plan.price > 0 && <p style={{ fontSize: 12.5, color: 'var(--gl2-muted)', marginBottom: 10 }}>💡 You'll be charged ₹{upgradeModal.plan.price}/month. Charges are pro-rated for mid-cycle changes.</p>}
            {upgradeModal.planKey === 'PREMIUM' && <p style={{ fontSize: 12.5, color: 'var(--gl2-primary-deep)', marginBottom: 10 }}>🎉 Premium includes a 30-day free trial. You won't be charged until day 31.</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="gl2-btn gl2-btn-secondary" style={{ flex: 1 }} onClick={() => setUpgradeModal(null)}>Cancel</button>
              <button type="button" className="gl2-btn gl2-btn-primary" style={{ flex: 1 }} onClick={handleConfirmUpgrade} disabled={processing}>{processing ? 'Processing…' : 'Confirm & pay'}</button>
            </div>
          </div>
        </div>
      )}

      {cancelModal && (
        <div className="gl2-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14, zIndex: 200 }} onClick={() => setCancelModal(false)}>
          <div className="gl2-card" style={{ maxWidth: 380, width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <p style={{ margin: '0 0 10px', fontWeight: 800 }}>Cancel subscription?</p>
            <p style={{ fontSize: 13.5, color: 'var(--gl2-muted)', marginBottom: 16 }}>Are you sure? Your gym will be downgraded to FREE (30 members max). All your data will be preserved.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="gl2-btn gl2-btn-secondary" style={{ flex: 1 }} onClick={() => setCancelModal(false)}>Keep plan</button>
              <button type="button" className="gl2-btn gl2-btn-danger" style={{ flex: 2, background: 'var(--gl2-danger-strong)', color: '#fff' }} onClick={handleCancelSubscription}>Yes, cancel</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
