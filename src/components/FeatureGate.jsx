// src/components/FeatureGate.jsx
// Soft feature-gating wrapper — shows an upgrade prompt if plan doesn't include the feature

import { checkFeatureAccess, PLAN_PRICES } from '../utils/featureCheck';
import { useNavigate } from 'react-router-dom';

/**
 * Usage:
 * <FeatureGate feature="analytics" plan={subscription?.plan}>
 *   <Analytics />
 * </FeatureGate>
 */
export default function FeatureGate({ feature, plan = 'FREE', children }) {
  const navigate = useNavigate();
  const { hasAccess, reason, minimumPlan, upgradeCost } = checkFeatureAccess(plan, feature);

  if (hasAccess) return children;

  return (
    <div className="feature-gate-overlay">
      <div className="feature-gate-card glass-card">
        <div className="feature-gate-icon">🔒</div>
        <h3 className="feature-gate-title">Feature Locked</h3>
        <p className="feature-gate-reason">{reason}</p>
        {minimumPlan && (
          <p className="feature-gate-cost">
            Upgrade to <strong>{minimumPlan.replace(/_/g, ' ')}</strong> for ₹{PLAN_PRICES[minimumPlan]}/mo
            {upgradeCost > 0 && <span> (just ₹{upgradeCost} more)</span>}
          </p>
        )}
        <button
          className="btn-primary"
          style={{ marginTop: 16 }}
          onClick={() => navigate('/owner/subscription')}
        >
          Upgrade Plan →
        </button>
      </div>
    </div>
  );
}
