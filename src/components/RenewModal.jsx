import { useState } from 'react';
import { updateMember, Timestamp } from '../firebase/firestore';
import { formatDate, addDays } from '../utils/helpers';
import { useToast } from '../context/ToastContext';

const RenewModal = ({ member, plans = [], onClose, onSuccess }) => {
  const { showToast } = useToast();
  const [selectedPlan, setSelectedPlan] = useState(plans[0] || null);
  const [paymentStatus, setPaymentStatus] = useState('pending');
  const [loading, setLoading] = useState(false);

  if (!member) return null;

  const currentExpiry = member.subscription_expiry?.toDate
    ? member.subscription_expiry.toDate()
    : member.subscription_expiry
      ? new Date(member.subscription_expiry)
      : null;

  const isActive = currentExpiry && currentExpiry > new Date();
  const baseDate = isActive ? currentExpiry : new Date();
  const newExpiry = selectedPlan
    ? addDays(baseDate, selectedPlan.duration_days || 30)
    : null;

  const handleRenew = async () => {
    if (!selectedPlan) return;
    setLoading(true);

    try {
      const renewalEntry = {
        renewed_at: new Date().toISOString(),
        plan_id: selectedPlan.id,
        renewed_by: 'owner',
        old_expiry: currentExpiry ? currentExpiry.toISOString() : null,
        new_expiry: newExpiry.toISOString(),
      };

      await updateMember(member.id, {
        subscription_expiry: Timestamp.fromDate(newExpiry),
        payment_status: paymentStatus,
        plan_id: selectedPlan.id,
        renewal_history: [
          ...(member.renewal_history || []),
          renewalEntry,
        ],
      });

      showToast(`Membership renewed until ${formatDate(newExpiry)}`, 'success');
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Renew error:', err);
      showToast('Failed to renew membership', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="bottom-sheet glass-card" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />

        <h2 className="sheet-title">Renew membership</h2>
        <p className="sheet-subtitle">{member.name}</p>

        {/* Plan selector */}
        <div className="input-group">
          <label className="input-label">Membership plan</label>
          <select
            className="input-field"
            value={selectedPlan?.id || ''}
            onChange={(e) => setSelectedPlan(plans.find((p) => p.id === e.target.value))}
            id="renew-plan-select"
          >
            <option value="">Select a plan</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} — ₹{plan.price} — {plan.duration_days} days
              </option>
            ))}
          </select>
        </div>

        {/* Expiry preview */}
        {selectedPlan && (
          <div className="renew-preview glass-card">
            <div className="renew-preview-row">
              <span className="renew-preview-label">Current expiry</span>
              <span>{currentExpiry ? formatDate(currentExpiry) : 'None'}</span>
            </div>
            <div className="renew-preview-row new-expiry">
              <span className="renew-preview-label">New expiry</span>
              <span style={{ color: '#1D9E75', fontWeight: 600 }}>
                {formatDate(newExpiry)}
              </span>
            </div>
            <div className="renew-preview-days">
              +{selectedPlan.duration_days || 30} days
            </div>
          </div>
        )}

        {/* Payment toggle */}
        <div className="input-group">
          <label className="input-label">Payment status</label>
          <div className="payment-toggle">
            <button
              className={`payment-pill ${paymentStatus === 'paid' ? 'paid' : ''}`}
              onClick={() => setPaymentStatus('paid')}
              type="button"
            >
              Paid
            </button>
            <button
              className={`payment-pill ${paymentStatus === 'pending' ? 'pending' : ''}`}
              onClick={() => setPaymentStatus('pending')}
              type="button"
            >
              Pending
            </button>
          </div>
        </div>

        <button
          className="btn-primary"
          onClick={handleRenew}
          disabled={loading || !selectedPlan}
          id="confirm-renew-btn"
        >
          {loading ? <div className="spinner" /> : 'Confirm renewal'}
        </button>
      </div>
    </div>
  );
};

export default RenewModal;
