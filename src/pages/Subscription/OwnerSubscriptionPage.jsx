// src/pages/Subscription/OwnerSubscriptionPage.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getGymSubscription, getBillingHistory } from '../../utils/subscriptionService';
import { initiateRazorpayPayment } from '../../utils/razorpay';
import BottomNav from '../../components/BottomNav';
import './OwnerSubscriptionPage.css';

const PLANS = {
  FREE: {
    name: 'Free',
    price: 0,
    billing: 'Free forever',
    members: 30,
    color: '#888',
    features: ['Up to 30 members', 'QR attendance', 'Member profiles'],
    missing: ['Payments', 'Analytics', 'WhatsApp automation'],
  },
  BASIC: {
    name: 'Basic',
    price: 199,
    billing: '₹199/month',
    members: 50,
    color: '#4A90E2',
    features: ['Up to 50 members', 'QR attendance', 'Member management'],
    missing: ['Payments', 'Analytics', 'WhatsApp automation'],
  },
  PROFESSIONAL: {
    name: 'Professional',
    price: 499,
    billing: '₹499/month',
    members: 200,
    color: '#1D9E75',
    features: ['Up to 200 members', 'Payment integration', 'Landing page + QR', 'Lead inquiry form', 'Invoice generation'],
    missing: ['Analytics', 'WhatsApp automation'],
  },
  PROFESSIONAL_PLUS: {
    name: 'Professional+',
    price: 799,
    billing: '₹799/month',
    members: 500,
    color: '#EF9F27',
    features: ['Up to 500 members', 'Advanced analytics', 'Trainer dashboard', 'Equipment tracking', '3 branches'],
    missing: ['WhatsApp automation'],
  },
  PREMIUM: {
    name: 'Premium',
    price: 999,
    billing: '₹999/month',
    members: Infinity,
    color: '#9C27B0',
    featured: true,
    features: ['Unlimited members', 'WhatsApp automation', 'All analytics', 'Complete dashboard', 'Unlimited branches', 'Priority support'],
    missing: [],
  },
};

const PLAN_ORDER = ['FREE', 'BASIC', 'PROFESSIONAL', 'PROFESSIONAL_PLUS', 'PREMIUM'];

export default function OwnerSubscriptionPage() {
  const { userDoc } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const gymId = userDoc?.gym_id;

  const [subscription, setSubscription] = useState(null);
  const [billingHistory, setBillingHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('plans');
  const [upgradeModal, setUpgradeModal] = useState(null); // { planKey, plan }
  const [cancelModal, setCancelModal] = useState(false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!gymId) return;
    loadData();
  }, [gymId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sub, billing] = await Promise.all([
        getGymSubscription(gymId),
        getBillingHistory(gymId),
      ]);
      setSubscription(sub || { plan: 'PREMIUM', status: 'active', is_trial: false });
      setBillingHistory(billing);
    } catch (err) {
      console.error(err);
      showToast('Failed to load subscription data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const currentPlanKey = subscription?.plan || 'PREMIUM';
  const currentPlan = PLANS[currentPlanKey];
  const currentIdx = PLAN_ORDER.indexOf(currentPlanKey);

  const handleUpgradeClick = (planKey) => {
    setUpgradeModal({ planKey, plan: PLANS[planKey] });
  };

  const handleConfirmUpgrade = async () => {
    if (!upgradeModal) return;
    setProcessing(true);
    try {
      await initiateRazorpayPayment({
        amount: upgradeModal.plan.price * 100,
        gymName: userDoc?.name || 'Gymly',
        planName: upgradeModal.plan.name,
        onSuccess: async (result) => {
          showToast(`Upgraded to ${upgradeModal.plan.name}!`, 'success');
          setUpgradeModal(null);
          await loadData();
        },
        onFailure: (err) => {
          if (err !== 'dismissed') showToast('Payment failed: ' + err, 'error');
        },
      });
    } catch (err) {
      showToast('Payment error: ' + err.message, 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleCancelSubscription = async () => {
    showToast('Please contact support to cancel your subscription.', 'info');
    setCancelModal(false);
  };

  const toDateStr = (ts) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const statusDot = (s) => {
    if (s === 'active') return 'active';
    if (s === 'past_due') return 'past_due';
    return 'halted';
  };

  if (loading) {
    return (
      <div className="screen sub-screen">
        <div className="screen-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="spinner spinner-primary" style={{ width: 32, height: 32 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="screen sub-screen">
      <div className="screen-content">

        {/* Header */}
        <div className="sub-header">
          <h1>Subscription</h1>
          <p>Manage your Gymly plan & billing</p>
        </div>

        <div className="sub-content">

          {/* Current Plan Banner */}
          {subscription && (
            <div className="current-plan-banner">
              <div className="cpb-label">Current Plan</div>
              <div className="cpb-plan-name">{currentPlan?.name}</div>
              <div className={`cpb-status ${statusDot(subscription.status)}`}>
                {subscription.status === 'active' ? '● Active' :
                  subscription.status === 'past_due' ? '⚠ Past Due' : '✕ Halted'}
              </div>
              {subscription.next_billing_date && (
                <div className="cpb-meta">
                  Next billing: {toDateStr(subscription.next_billing_date)}
                </div>
              )}
              {currentPlan?.price > 0 && (
                <div className="cpb-meta">{currentPlan.billing}</div>
              )}
              {subscription.is_trial && subscription.trial_end_date && (() => {
                const endDate = subscription.trial_end_date.toDate
                  ? subscription.trial_end_date.toDate()
                  : new Date(subscription.trial_end_date);
                const days = Math.max(0, Math.ceil((endDate - Date.now()) / 86400000));
                const pct = Math.round((days / 30) * 100);
                return (
                  <div className="trial-bar-wrap">
                    <div className="trial-bar-label">
                      <span>Free Trial</span>
                      <span>{days} days left</span>
                    </div>
                    <div className="trial-bar">
                      <div className="trial-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Tabs */}
          <div className="sub-tabs">
            {[
              { key: 'plans', label: 'Plans' },
              { key: 'history', label: 'Billing History' },
              { key: 'payment', label: 'Payment' },
            ].map(t => (
              <button
                key={t.key}
                className={`sub-tab ${tab === t.key ? 'active' : ''}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Plans Tab ── */}
          {tab === 'plans' && (
            <div className="plans-grid">
              {PLAN_ORDER.map((key) => {
                const plan = PLANS[key];
                const isCurrent = key === currentPlanKey;
                const planIdx = PLAN_ORDER.indexOf(key);
                const isUpgrade = planIdx > currentIdx;
                const isDowngrade = planIdx < currentIdx;

                return (
                  <div
                    key={key}
                    className={`plan-card ${isCurrent ? 'current' : ''} ${plan.featured ? 'featured' : ''}`}
                    style={{ borderColor: isCurrent ? plan.color : undefined }}
                  >
                    <div className="plan-card-header">
                      <div className="plan-card-name" style={{ color: plan.color }}>{plan.name}</div>
                      <div className="plan-card-price">
                        {plan.price === 0 ? 'Free' : `₹${plan.price}`}
                        {plan.price > 0 && <span>/mo</span>}
                      </div>
                    </div>

                    {isCurrent && (
                      <div className="plan-card-pill" style={{ background: plan.color }}>Your Plan</div>
                    )}

                    <ul className="plan-card-features">
                      {plan.features.map((f, i) => <li key={i}>{f}</li>)}
                      {plan.missing.map((f, i) => <li key={`no-${i}`} className="no">{f}</li>)}
                    </ul>
                    <div className="cpb-meta" style={{ color: '#999', fontSize: 11, marginBottom: 10 }}>
                      {plan.members === Infinity ? 'Unlimited members' : `Up to ${plan.members} members`}
                    </div>

                    {isCurrent ? (
                      <button className="plan-card-btn current-btn" disabled>Current Plan</button>
                    ) : isUpgrade ? (
                      <button
                        className="plan-card-btn upgrade"
                        style={{ background: plan.color }}
                        onClick={() => handleUpgradeClick(key)}
                      >
                        Upgrade to {plan.name} →
                      </button>
                    ) : (
                      <button
                        className="plan-card-btn downgrade"
                        onClick={() => handleUpgradeClick(key)}
                      >
                        Downgrade to {plan.name}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Billing History Tab ── */}
          {tab === 'history' && (
            <div className="billing-table-wrap">
              {billingHistory.length === 0 ? (
                <div className="billing-empty">
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🧾</div>
                  No payment history yet
                </div>
              ) : (
                <table className="billing-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Plan</th>
                      <th>Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billingHistory.map((p) => (
                      <tr key={p.id}>
                        <td>{toDateStr(p.payment_date)}</td>
                        <td>{p.plan}</td>
                        <td>₹{((p.amount || 0) / 100).toFixed(0)}</td>
                        <td>
                          <span className={`billing-badge ${p.status}`}>{p.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── Payment Method Tab ── */}
          {tab === 'payment' && (
            <div className="payment-method-card">
              {subscription?.payment_method_last4 ? (
                <>
                  <div className="card-display">
                    <div className="card-icon">💳</div>
                    <div>
                      <div className="card-details">•••• •••• •••• {subscription.payment_method_last4}</div>
                      <div className="card-sub">Expires {subscription.payment_method_expiry}</div>
                    </div>
                  </div>
                  <button className="btn-ghost" style={{ width: '100%', textAlign: 'center' }}>
                    Update Payment Method
                  </button>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>💳</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No payment method on file</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    A payment method will be saved when you upgrade to a paid plan.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Cancel Zone */}
          {currentPlanKey !== 'FREE' && tab === 'plans' && (
            <div className="cancel-zone">
              <h4>Cancel Subscription</h4>
              <p>Your gym will be downgraded to the FREE plan (30 member limit). All data is preserved.</p>
              <button className="cancel-btn" onClick={() => setCancelModal(true)}>
                Cancel My Subscription
              </button>
            </div>
          )}

        </div>
      </div>

      <BottomNav activeTab="settings" role="owner" />

      {/* ── Upgrade/Downgrade Modal ── */}
      {upgradeModal && (
        <div className="sub-modal-overlay" onClick={() => setUpgradeModal(null)}>
          <div className="sub-modal" onClick={e => e.stopPropagation()}>
            <h3>
              {PLAN_ORDER.indexOf(upgradeModal.planKey) > currentIdx ? '⬆ Upgrade Plan' : '⬇ Change Plan'}
            </h3>
            <div className="sub-modal-row">
              <span>Current plan</span>
              <strong>{currentPlan?.name} ({currentPlan?.price === 0 ? 'Free' : `₹${currentPlan?.price}/mo`})</strong>
            </div>
            <div className="sub-modal-row">
              <span>New plan</span>
              <strong>{upgradeModal.plan.name} ({upgradeModal.plan.price === 0 ? 'Free' : `₹${upgradeModal.plan.price}/mo`})</strong>
            </div>
            {upgradeModal.plan.price > 0 && (
              <div className="sub-modal-info">
                💡 You'll be charged ₹{upgradeModal.plan.price}/month. Charges are pro-rated for mid-cycle changes.
              </div>
            )}
            {upgradeModal.planKey === 'PREMIUM' && (
              <div className="sub-modal-info" style={{ background: 'rgba(156,39,176,0.08)', color: '#9C27B0' }}>
                🎉 Premium includes a 30-day free trial. You won't be charged until day 31.
              </div>
            )}
            <div className="sub-modal-btns">
              <button className="btn-ghost" onClick={() => setUpgradeModal(null)}>Cancel</button>
              <button
                className="btn-primary"
                onClick={handleConfirmUpgrade}
                disabled={processing}
              >
                {processing ? <div className="spinner" /> : 'Confirm & Pay'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cancel Confirm Modal ── */}
      {cancelModal && (
        <div className="sub-modal-overlay" onClick={() => setCancelModal(false)}>
          <div className="sub-modal" onClick={e => e.stopPropagation()}>
            <h3>Cancel Subscription?</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 16 }}>
              Are you sure? Your gym will be downgraded to FREE (30 members max). All your data will be preserved.
            </p>
            <div className="sub-modal-btns">
              <button className="btn-ghost" onClick={() => setCancelModal(false)}>Keep Plan</button>
              <button
                className="btn-primary"
                style={{ background: 'var(--error)', flex: 2 }}
                onClick={handleCancelSubscription}
              >
                Yes, Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
