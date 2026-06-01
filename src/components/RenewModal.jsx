import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { updateMember } from '../firebase/firestore';
import { Timestamp } from 'firebase/firestore';
import { formatDate, addDays } from '../utils/helpers';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { createPayment, getNextInvoiceNumber } from '../firebase/firestore-payments';
import { generateEnrollmentNumber } from '../utils/numberingService';

const RenewModal = ({ member, plans = [], onClose, onSuccess }) => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();
  
  const [showSuccess, setShowSuccess] = useState(false);
  const [successData, setSuccessData] = useState(null);

  const [selectedPlan, setSelectedPlan] = useState(plans[0] || null);
  const [paymentStatus, setPaymentStatus] = useState('paid');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paidNow, setPaidNow] = useState('');
  const [discount, setDiscount] = useState('');
  const [upiRef, setUpiRef] = useState('');
  const [loading, setLoading] = useState(false);

  if (!member) return null;

  const currentExpiry = member.subscription_expiry?.toDate
    ? member.subscription_expiry.toDate()
    : member.subscription_expiry
      ? new Date(member.subscription_expiry)
      : null;

  const isActive = currentExpiry && currentExpiry > new Date();
  const baseDate = isActive ? currentExpiry : new Date();
  const newExpiry = selectedPlan ? addDays(baseDate, selectedPlan.duration_days || 30) : null;

  const planPrice = selectedPlan?.price || 0;
  const discountVal = Number(discount) || 0;
  const finalAmount = Math.max(0, planPrice - discountVal);
  const paidNowVal = paymentStatus === 'paid' ? finalAmount : Number(paidNow) || 0;
  const pendingAmount = Math.max(0, finalAmount - paidNowVal);
  const paymentStatusToSave = paymentStatus === 'paid' ? 'paid' : paidNowVal > 0 ? 'partial' : 'pending';

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
        payment_status: paymentStatusToSave,
        plan_id: selectedPlan.id,
        plan_name: selectedPlan.name,
        renewal_history: [
          ...(member.renewal_history || []),
          renewalEntry,
        ],
      });

      let finalEnrollmentNumber = null;

      // Create payment record
      if (finalAmount > 0) {
        try {
          // Generate enrollment number for this renewal
          try {
            const planDuration = selectedPlan.duration_days ? Math.round(selectedPlan.duration_days / 30) : 1;
            finalEnrollmentNumber = await generateEnrollmentNumber(member.gym_id, {
              joinDate: new Date(),
              planDurationMonths: planDuration,
            });
          } catch (enErr) {
            console.error('Enrollment number error (non-critical):', enErr);
          }

          const invoiceNumber = await getNextInvoiceNumber(member.gym_id);
          await createPayment({
            gym_id: member.gym_id,
            member_id: member.id,
            member_name: member.name,
            member_phone: member.phone,
            plan_id: selectedPlan.id,
            plan_name: selectedPlan.name,
            plan_auto_extend: false,
            amount: planPrice,
            discount: discountVal,
            final_amount: finalAmount,
            paid_amount: paidNowVal,
            pending_amount: pendingAmount,
            method: paymentMethod,
            upi_ref: paymentMethod === 'upi' ? upiRef : null,
            status: paymentStatusToSave,
            payment_date: Timestamp.fromDate(new Date()),
            due_date: null,
            membership_start: currentExpiry ? Timestamp.fromDate(currentExpiry) : Timestamp.now(),
            membership_end: Timestamp.fromDate(newExpiry),
            invoice_number: invoiceNumber,
            invoice_url: null,
            whatsapp_sent: false,
            recorded_by: user?.uid || 'owner',
            notes: 'Renewal',
            enrollmentNumber: finalEnrollmentNumber,
          });

          if (finalEnrollmentNumber) {
            await updateMember(member.id, { latestEnrollmentNumber: finalEnrollmentNumber });
          }
        } catch (payErr) {
          console.error('Payment record error (non-critical):', payErr);
        }
      }

      showToast(`Membership renewed until ${formatDate(newExpiry)}`, 'success');
      setSuccessData({
        enrollmentNumber: finalEnrollmentNumber,
        newExpiry,
        planName: selectedPlan.name,
        amountPaid: paidNowVal,
      });
      setShowSuccess(true);
      onSuccess?.();
      // We don't call onClose() here so the success screen stays visible
    } catch (err) {
      console.error('Renew error:', err);
      showToast('Failed to renew membership', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (showSuccess && successData) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="bottom-sheet glass-card !p-8 text-center max-w-sm w-full mx-auto" onClick={(e) => e.stopPropagation()}>
          <div className="w-16 h-16 bg-[#1D9E75]/20 text-[#1D9E75] rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm border border-[#1D9E75]/30">
            <span className="material-symbols-outlined text-4xl">check_circle</span>
          </div>
          <h2 className="font-headline-md text-2xl font-bold text-on-surface mb-2">Membership Renewed!</h2>
          <p className="text-on-surface-variant text-sm mb-6">
            {member.name}'s membership is now active until {formatDate(successData.newExpiry)}.
          </p>

          <div className="bg-surface/50 rounded-2xl p-5 mb-8 text-left border border-white/40 shadow-sm">
            <div className="flex justify-between mb-3">
              <span className="text-on-surface-variant text-sm font-medium">Plan</span>
              <span className="font-semibold text-on-surface">{successData.planName}</span>
            </div>
            <div className="flex justify-between mb-3">
              <span className="text-on-surface-variant text-sm font-medium">Amount Paid</span>
              <span className="font-bold text-[#1D9E75]">₹{successData.amountPaid.toLocaleString('en-IN')}</span>
            </div>
            {successData.enrollmentNumber && (
              <div className="mt-5 pt-4 border-t border-white/30 text-center">
                <div className="text-[11px] text-on-surface-variant font-medium uppercase tracking-wider mb-2">Enrollment Number</div>
                <div className="font-mono text-[#1D9E75] font-bold text-xl bg-[#1D9E75]/10 py-2 rounded-xl inline-block px-6 border border-[#1D9E75]/20 shadow-sm">
                  {successData.enrollmentNumber}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <button 
              onClick={() => { onClose(); }}
              className="w-full py-3.5 bg-gradient-to-r from-primary to-secondary text-white rounded-xl font-label-md font-bold hover:shadow-lg hover:scale-[1.02] transition-all shadow-md"
            >
              View Member Details
            </button>
            <button 
              onClick={() => { onClose(); navigate('/owner'); }}
              className="w-full py-3.5 bg-white/40 text-on-surface rounded-xl font-label-md border border-white/60 hover:bg-white/60 transition-colors"
            >
              Go to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

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
            onChange={(e) => {
              const plan = plans.find((p) => p.id === e.target.value);
              setSelectedPlan(plan);
              setPaidNow(plan?.price?.toString() || '');
            }}
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
              <span style={{ color: '#1D9E75', fontWeight: 600 }}>{formatDate(newExpiry)}</span>
            </div>
            <div className="renew-preview-days">+{selectedPlan.duration_days || 30} days</div>
          </div>
        )}

        {/* Payment section */}
        {selectedPlan && (
          <>
            {/* Amount */}
            <div style={{
              background: 'var(--primary-light)', border: '1px solid var(--primary-light)',
              borderRadius: 10, padding: '10px 14px', marginBottom: 14,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Plan price</span>
              <span style={{ fontSize: 16, fontWeight: 700 }}>₹{planPrice.toLocaleString('en-IN')}</span>
            </div>

            {/* Discount */}
            <div className="input-group">
              <label className="input-label">Discount (₹)</label>
              <input
                type="number"
                className="input-field"
                placeholder="0"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </div>

            {discountVal > 0 && (
              <div style={{ fontSize: 12, color: '#1D9E75', fontWeight: 600, marginBottom: 12 }}>
                Final: ₹{finalAmount.toLocaleString('en-IN')}
              </div>
            )}

            {/* Payment status */}
            <div className="input-group">
              <label className="input-label">Payment status</label>
              <div className="payment-toggle">
                <button className={`payment-pill ${paymentStatus === 'paid' ? 'paid' : ''}`} onClick={() => setPaymentStatus('paid')} type="button" style={{ flex: 1 }}>
                  ✓ Fully paid
                </button>
                <button
                  className={`payment-pill ${paymentStatus === 'pending' ? 'paid' : ''}`}
                  onClick={() => setPaymentStatus('pending')}
                  type="button"
                  style={{
                    flex: 1,
                    background: paymentStatus === 'pending' ? 'rgba(239,159,39,0.12)' : undefined,
                    color: paymentStatus === 'pending' ? '#EF9F27' : undefined,
                    borderColor: paymentStatus === 'pending' ? '#EF9F27' : undefined,
                  }}
                >
                  ⏱ Pending
                </button>
              </div>
            </div>

            {paymentStatus === 'pending' && (
              <div className="input-group">
                <label className="input-label">Amount collected now</label>
                <input type="number" className="input-field" placeholder="0" value={paidNow} onChange={(e) => setPaidNow(e.target.value)} />
                {pendingAmount > 0 && (
                  <p style={{ fontSize: 11, color: '#EF9F27', marginTop: 4 }}>₹{pendingAmount.toLocaleString('en-IN')} remaining</p>
                )}
              </div>
            )}

            {/* Payment method */}
            <div className="input-group">
              <label className="input-label">Payment method</label>
              <div className="payment-toggle" style={{ display: 'flex', gap: 6 }}>
                <button className={`payment-pill ${paymentMethod === 'cash' ? 'paid' : ''}`} onClick={() => setPaymentMethod('cash')} type="button">Cash</button>
                <button className={`payment-pill ${paymentMethod === 'upi' ? 'paid' : ''}`} onClick={() => setPaymentMethod('upi')} type="button">UPI</button>
              </div>
            </div>

            {paymentMethod === 'upi' && (
              <div className="input-group">
                <label className="input-label">UPI Reference</label>
                <input type="text" className="input-field" placeholder="e.g. 123456789012" value={upiRef} onChange={(e) => setUpiRef(e.target.value)} />
              </div>
            )}
          </>
        )}

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
