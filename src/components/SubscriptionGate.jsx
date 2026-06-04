import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../hooks/useSubscription';
import { checkFeatureAccess, PLAN_PRICES, PLAN_HIERARCHY } from '../utils/featureCheck';
import { getGym } from '../firebase/firestore';
import { useEffect } from 'react';

/**
 * Usage in App.jsx:
 * <SubscriptionGate feature="payments">
 *   <PaymentList />
 * </SubscriptionGate>
 */
export default function SubscriptionGate({ feature, children }) {
  const { plan, loading } = useSubscription();
  const { userDoc } = useAuth();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const [couponActive, setCouponActive] = useState(false);
  const [couponLoading, setCouponLoading] = useState(true);

  useEffect(() => {
    if (!userDoc?.gym_id) { setCouponLoading(false); return; }
    getGym(userDoc.gym_id).then(g => {
      if (g?.subscription_valid_until) {
        const until = g.subscription_valid_until?.toDate
          ? g.subscription_valid_until.toDate()
          : new Date(g.subscription_valid_until);
        if (until > new Date()) setCouponActive(true);
      }
      setCouponLoading(false);
    }).catch(() => setCouponLoading(false));
  }, [userDoc?.gym_id]);

  if (loading || couponLoading) {
    return (
      <div className="screen" style={{ background: 'var(--grad-dashboard)' }}>
        <div className="screen-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="spinner spinner-primary" style={{ width: 32, height: 32 }} />
        </div>
      </div>
    );
  }

  // Coupon bypass — if gym has active coupon subscription, allow all features
  if (couponActive) return children;

  const { hasAccess, minimumPlan } = checkFeatureAccess(plan, feature);

  if (hasAccess) return children;

  // Build a nice feature name from the key
  const featureLabel = feature.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const minPlanLabel = minimumPlan ? minimumPlan.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Professional';
  const minPrice = PLAN_PRICES[minimumPlan] || 499;

  // Plan tier icons
  const planEmoji = {
    PROFESSIONAL: '🚀',
    PROFESSIONAL_PLUS: '⚡',
    PREMIUM: '👑',
  };

  // Feature benefits per plan
  const featureBenefits = {
    payments: ['Record & track all payments', 'Auto invoice generation', 'Payment history & reports', 'Member payment reminders'],
    analytics: ['Revenue analytics dashboard', 'Attendance heatmaps', 'Member growth trends', 'Retention & churn reports'],
    whatsapp_automation: ['Auto welcome messages', 'Expiry reminders', 'Payment confirmations', 'Inactivity alerts', 'Milestone celebrations'],
    landing_page: ['Public gym profile page', 'Online plan showcase', 'Lead inquiry form', 'QR code sharing'],
    lead_inquiry_form: ['Capture gym inquiries', 'Lead management', 'Follow-up tracking'],
    trainer_dashboard: ['Trainer performance view', 'Member assignments', 'Workout plan management'],
    equipment_tracking: ['Equipment inventory', 'Maintenance schedules', 'Asset tracking'],
    attendance_heatmap: ['Visual attendance patterns', 'Peak hours analysis', 'Member consistency tracking'],
  };

  const benefits = featureBenefits[feature] || [
    `Access to ${featureLabel}`,
    'All features in this tier',
    'Priority support',
  ];

  return (
    <div className="screen" style={{ background: 'var(--grad-dashboard)' }}>
      <div className="screen-content">
        {/* Back button */}
        <button className="back-btn" onClick={() => navigate(-1)}>
          ← Back
        </button>

        <div className="sub-gate-container">
          {/* Lock icon with glow */}
          <div className="sub-gate-lock-wrap">
            <div className="sub-gate-lock">🔒</div>
          </div>

          <h2 className="sub-gate-title">{featureLabel}</h2>
          <p className="sub-gate-subtitle">
            This feature requires the <strong>{minPlanLabel}</strong> plan
          </p>

          {/* Current plan badge */}
          <div className="sub-gate-current-badge">
            Your plan: <strong>{plan.replace(/_/g, ' ')}</strong>
          </div>

          {/* Benefits card */}
          <div className="sub-gate-benefits glass-card">
            <div className="sub-gate-benefits-header">
              <span>{planEmoji[minimumPlan] || '🚀'}</span>
              <span>What you'll unlock</span>
            </div>
            <ul className="sub-gate-benefits-list">
              {benefits.map((b, i) => (
                <li key={i}>
                  <span className="sub-gate-check">✓</span>
                  {b}
                </li>
              ))}
            </ul>
          </div>

          {/* Pricing highlight */}
          <div className="sub-gate-price-card glass-card">
            <div className="sub-gate-price-label">{minPlanLabel} Plan</div>
            <div className="sub-gate-price-amount">
              ₹{minPrice}<span>/month</span>
            </div>
            {minimumPlan === 'PREMIUM' && (
              <div className="sub-gate-trial-badge">🎉 30-day free trial included</div>
            )}
          </div>

          {/* CTA buttons */}
          <button
            className="btn-primary sub-gate-cta"
            onClick={() => navigate('/owner/subscription')}
          >
            Upgrade to {minPlanLabel} →
          </button>

          <button
            className="sub-gate-skip"
            onClick={() => navigate(-1)}
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
