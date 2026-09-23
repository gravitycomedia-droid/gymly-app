import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { getGymMembersRealtime } from '../../../firebase/firestore';
import useOwnerGym from '../../hooks/useOwnerGym';
import { createPayment, getNextInvoiceNumber, Timestamp } from '../../../firebase/firestore-payments';
import { updateDoc, doc } from '../../../firebase/firestore-payments';
import { db, storage } from '../../../firebase/config';
import { generateInvoicePDF, uploadInvoice } from '../../../utils/invoiceGenerator';
import { generateEnrollmentNumber, initializeNumberingSettings } from '../../../utils/numberingService';
import { initiateRazorpayPayment } from '../../../utils/razorpay';
import { trackEvent, toAmountBucket } from '../../../lib/analytics';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getInitials, formatDate, addDays, getPlanName } from '../../../utils/helpers';
import { getAvatarColor } from '../../lib/avatarColor';
import { WizardDone } from '../../components/Wizard';

const METHODS = [
  { id: 'cash', icon: 'payments', label: 'Cash' },
  { id: 'upi', icon: 'qr_code_scanner', label: 'UPI' },
  { id: 'card', icon: 'credit_card', label: 'Card' },
  { id: 'bank', icon: 'account_balance', label: 'Bank' },
  { id: 'razorpay', icon: 'link', label: 'Online' },
];

export default function AddPayment() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, userDoc } = useAuth();
  const { showToast } = useToast();

  const { gym } = useOwnerGym(userDoc?.gym_id);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);

  const [paymentStatus, setPaymentStatus] = useState('paid');
  const [paidNow, setPaidNow] = useState('');

  const [planId, setPlanId] = useState('');
  const [discount, setDiscount] = useState('');
  const [method, setMethod] = useState('cash');
  const [upiRef, setUpiRef] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [upiScreenshot, setUpiScreenshot] = useState(null);

  const [generatePdf, setGeneratePdf] = useState(true);

  const [showSuccess, setShowSuccess] = useState(false);
  const [successData, setSuccessData] = useState(null);

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    const unsub = getGymMembersRealtime(userDoc.gym_id, setMembers);
    return () => unsub();
  }, [userDoc?.gym_id]);

  const preselectId = searchParams.get('memberId');
  useEffect(() => {
    if (preselectId && !selectedMember && members.length) {
      const m = members.find((x) => x.id === preselectId);
      if (m) { setSelectedMember(m); if (m.plan_id) setPlanId(m.plan_id); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectId, members]);

  const handleSelectMember = (member) => {
    setSelectedMember(member);
    setSearchQuery('');
    setShowResults(false);
    if (member.plan_id) setPlanId(member.plan_id);
  };

  const plans = (gym?.settings?.plans?.filter((p) => p.is_active) || []).sort((a, b) => (a.duration_days || 0) - (b.duration_days || 0));
  const selectedPlan = plans.find((p) => p.id === planId);
  const planPrice = selectedPlan?.price || 0;
  const discountVal = Number(discount) || 0;
  const subtotal = Math.max(0, planPrice - discountVal);
  const taxEnabled = gym?.settings?.taxEnabled || false;
  const taxRate = taxEnabled ? (Number(gym?.settings?.taxRate) || 0) : 0;
  const taxAmount = (subtotal * taxRate) / 100;
  const finalAmount = subtotal + taxAmount;
  const paidNowVal = paymentStatus === 'paid' ? finalAmount : (Number(paidNow) || 0);
  const pendingAmount = Math.max(0, finalAmount - paidNowVal);

  const memberExpiry = selectedMember?.subscription_expiry?.toDate
    ? selectedMember.subscription_expiry.toDate()
    : selectedMember?.subscription_expiry ? new Date(selectedMember.subscription_expiry) : null;
  const isMemberActive = memberExpiry && memberExpiry > new Date();
  const startDate = isMemberActive ? memberExpiry : new Date();
  const endDate = selectedPlan ? addDays(startDate, selectedPlan.duration_days || 30) : null;

  const searchResults = useMemo(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) return [];
    const q = searchQuery.toLowerCase();
    return members.filter((m) => m.name?.toLowerCase().includes(q) || m.phone?.includes(q)).slice(0, 6);
  }, [searchQuery, members]);

  const handleSubmit = async () => {
    if (!selectedMember) { showToast('Please select a member', 'error'); return; }
    if (!selectedPlan) { showToast('Please select a plan', 'error'); return; }
    if (finalAmount <= 0) { showToast('Amount must be greater than 0', 'error'); return; }
    if (paymentStatus === 'pending' && !paidNow && !dueDate) { showToast('Set a due date for pending payments', 'error'); return; }

    setLoading(true);
    try {
      const invoiceNumber = await getNextInvoiceNumber(userDoc.gym_id);
      const statusToSave = paymentStatus === 'paid' ? 'paid' : paidNowVal > 0 ? 'partial' : 'pending';

      let enrollmentNumber = null;
      try {
        await initializeNumberingSettings(userDoc.gym_id, gym?.name || 'Gym');
        const planDuration = selectedPlan.duration_days ? Math.round(selectedPlan.duration_days / 30) : 1;
        enrollmentNumber = await generateEnrollmentNumber(userDoc.gym_id, { joinDate: new Date(), planDurationMonths: planDuration });
      } catch (enErr) { console.error('Enrollment number error (non-critical):', enErr); }

      const paymentData = {
        gym_id: userDoc.gym_id, member_id: selectedMember.id, member_name: selectedMember.name, member_phone: selectedMember.phone,
        plan_id: planId, plan_name: selectedPlan.name, plan_auto_extend: isMemberActive,
        amount: planPrice, discount: discountVal, tax_rate: taxRate, tax_amount: taxAmount, final_amount: finalAmount,
        paid_amount: paidNowVal, pending_amount: pendingAmount, method, upi_ref: method === 'upi' ? upiRef : null,
        status: statusToSave, payment_date: Timestamp.fromDate(new Date()), due_date: dueDate ? Timestamp.fromDate(new Date(dueDate)) : null,
        membership_start: Timestamp.fromDate(startDate), membership_end: Timestamp.fromDate(endDate),
        invoice_number: invoiceNumber, invoice_url: null, whatsapp_sent: false, recorded_by: user.uid, enrollmentNumber,
      };

      const paymentId = await createPayment(paymentData);

      // GA4: dues_recorded — only when money is actually outstanding. The exact
      // rupee figure never leaves the client, only its bucket.
      if (pendingAmount > 0) {
        trackEvent('dues_recorded', { amount_bucket: toAmountBucket(pendingAmount) });
      }

      if (method === 'upi' && upiScreenshot) {
        const storageRef = ref(storage, `payment_screenshots/${paymentId}`);
        await uploadBytes(storageRef, upiScreenshot, { cacheControl: 'public,max-age=86400' });
        const finalScreenshotUrl = await getDownloadURL(storageRef);
        await updateDoc(doc(db, 'payments', paymentId), { screenshot_url: finalScreenshotUrl });
      }

      const memberUpdate = { payment_status: statusToSave, plan_id: planId };
      if (statusToSave === 'paid' || statusToSave === 'partial') memberUpdate.subscription_expiry = Timestamp.fromDate(endDate);
      if (enrollmentNumber) memberUpdate.latestEnrollmentNumber = enrollmentNumber;
      await updateDoc(doc(db, 'users', selectedMember.id), memberUpdate);

      let invoiceUrl = null;
      if (generatePdf) {
        try {
          const blob = await generateInvoicePDF({ ...paymentData, id: paymentId }, gym, selectedMember);
          invoiceUrl = await uploadInvoice(userDoc.gym_id, invoiceNumber, blob);
          await updateDoc(doc(db, 'payments', paymentId), { invoice_url: invoiceUrl });
        } catch (pdfErr) { console.error('Invoice error (non-critical):', pdfErr); }
      }

      setSuccessData({ invoiceNumber, paymentId, invoiceUrl, status: statusToSave });
      setShowSuccess(true);
      showToast('Payment recorded successfully!', 'success');
    } catch (err) {
      console.error('Record payment error:', err);
      showToast(`Failed to record payment: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRazorpay = async () => {
    if (!selectedMember || !selectedPlan) { showToast('Select a member and plan first', 'error'); return; }
    // After validation, so a mis-click is not recorded as a started checkout.
    trackEvent('checkout_started', {
      plan_tier: selectedPlan?.name,
      value: finalAmount,
      currency: 'INR',
    });
    try {
      await initiateRazorpayPayment({
        amount: finalAmount * 100, memberName: selectedMember.name, memberPhone: selectedMember.phone,
        gymName: gym?.name || 'Gymly', planName: selectedPlan.name,
        onSuccess: (result) => { setMethod('razorpay'); setUpiRef(result.razorpay_payment_id); setPaymentStatus('paid'); handleSubmit(); },
        onFailure: (reason) => { if (reason !== 'dismissed') showToast('Payment failed', 'error'); },
      });
    } catch (err) {
      console.error('Razorpay error:', err);
      showToast('Razorpay error', 'error');
    }
  };

  if (showSuccess && successData) {
    return (
      <section data-screen-label="Wizard">
        <div className="gl2-wizard-card" style={{ margin: '0 auto' }}>
          <WizardDone
            title="Payment recorded"
            sub={`₹${paidNowVal.toLocaleString('en-IN')} collected from ${selectedMember?.name}${pendingAmount > 0 ? ` · ₹${pendingAmount.toLocaleString('en-IN')} pending` : ''}.`}
            ctaLabel="View receipt"
            onDone={() => navigate(`/owner/payments/${successData.paymentId}`)}
          />
          <button type="button" className="gl2-btn gl2-btn-secondary" style={{ width: '100%', marginTop: 4 }} onClick={() => navigate('/owner/payments')}>
            Back to payments
          </button>
        </div>
      </section>
    );
  }

  return (
    <section data-screen-label="Record payment">
      <button type="button" className="gl2-back-link" onClick={() => navigate(-1)}>
        <span className="material-symbols-outlined" style={{ fontSize: 17 }}>arrow_back_ios</span>Cancel
      </button>
      <div className="gl2-page-header">
        <h1 className="gl2-page-title">Record payment</h1>
        <button type="button" className="gl2-btn gl2-btn-secondary" onClick={() => navigate('/owner/payments')}>View history</button>
      </div>

      <div className="gl2-grid-2" style={{ alignItems: 'start' }}>
        <div>
          {!selectedMember ? (
            <div className="gl2-card">
              <p className="gl2-card-title" style={{ marginBottom: 12 }}>Find member</p>
              <input className="gl2-input" placeholder="Name or phone" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setShowResults(true); }} onFocus={() => setShowResults(true)} />
              {showResults && searchResults.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10, maxHeight: 300, overflowY: 'auto' }}>
                  {searchResults.map((m) => (
                    <div key={m.id} className="gl2-row" style={{ cursor: 'pointer', borderRadius: 11, border: '1px solid var(--gl2-border)' }} onClick={() => handleSelectMember(m)}>
                      <span className="gl2-avatar" style={{ background: getAvatarColor(m.name) }}>{getInitials(m.name)}</span>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, fontWeight: 700 }}>{m.name}</p>
                        <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--gl2-muted)' }}>{m.phone} · {getPlanName(gym, m.plan_id)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="gl2-card" style={{ position: 'relative' }}>
              <button type="button" className="gl2-icon-btn" style={{ position: 'absolute', top: 14, right: 14, width: 32, height: 32 }} onClick={() => setSelectedMember(null)}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                <span className="gl2-avatar gl2-avatar-lg" style={{ background: getAvatarColor(selectedMember.name) }}>{getInitials(selectedMember.name)}</span>
                <div>
                  <p style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{selectedMember.name}</p>
                  <Badge2 active={isMemberActive} />
                </div>
              </div>
              <div className="gl2-summary-rows">
                <div className="gl2-summary-row"><span className="gl2-summary-label">Current plan</span><span className="gl2-summary-value">{getPlanName(gym, selectedMember.plan_id)}</span></div>
                <div className="gl2-summary-row"><span className="gl2-summary-label">Expiry</span><span className="gl2-summary-value">{memberExpiry ? formatDate(memberExpiry) : 'N/A'}</span></div>
                <div className="gl2-summary-row"><span className="gl2-summary-label">Phone</span><span className="gl2-summary-value">{selectedMember.phone}</span></div>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, opacity: selectedMember ? 1 : 0.5, pointerEvents: selectedMember ? 'auto' : 'none' }}>
          <div className="gl2-card">
            <p className="gl2-card-title" style={{ marginBottom: 14 }}>Plan & amount</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <label className="gl2-field">
                <span className="gl2-field-label">Plan</span>
                <select className="gl2-select" value={planId} onChange={(e) => setPlanId(e.target.value)}>
                  <option value="">Select a plan</option>
                  {plans.map((p) => <option key={p.id} value={p.id}>{p.name} — ₹{p.price}</option>)}
                </select>
              </label>
              <label className="gl2-field">
                <span className="gl2-field-label">Discount (₹)</span>
                <input className="gl2-input" type="number" placeholder="0" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </label>
            </div>

            <label className="gl2-field" style={{ marginBottom: 14 }}>
              <span className="gl2-field-label">Payment status</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className={`gl2-filter-chip ${paymentStatus === 'paid' ? 'active' : ''}`} style={{ flex: 1 }} onClick={() => setPaymentStatus('paid')}>Fully paid</button>
                <button type="button" className={`gl2-filter-chip warn ${paymentStatus === 'pending' ? 'active' : ''}`} style={{ flex: 1 }} onClick={() => setPaymentStatus('pending')}>Pending / partial</button>
              </div>
            </label>

            {paymentStatus === 'pending' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <label className="gl2-field"><span className="gl2-field-label">Paid today (₹)</span><input className="gl2-input" type="number" placeholder="0" value={paidNow} onChange={(e) => setPaidNow(e.target.value)} /></label>
                <label className="gl2-field"><span className="gl2-field-label">Due date</span><input className="gl2-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
              </div>
            )}

            {(paymentStatus === 'paid' || paidNowVal > 0) && (
              <>
                <p className="gl2-field-label" style={{ marginBottom: 8 }}>Payment method</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(70px,1fr))', gap: 8, marginBottom: 14 }}>
                  {METHODS.map((m) => (
                    <button key={m.id} type="button" onClick={() => setMethod(m.id)} className={`gl2-filter-chip ${method === m.id ? 'active' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: 4, height: 60, alignItems: 'center', justifyContent: 'center' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{m.icon}</span>
                      <span style={{ fontSize: 11 }}>{m.label}</span>
                    </button>
                  ))}
                </div>
                {method === 'upi' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                    <label className="gl2-field"><span className="gl2-field-label">UPI reference</span><input className="gl2-input" placeholder="Optional" value={upiRef} onChange={(e) => setUpiRef(e.target.value)} /></label>
                    <label className="gl2-field">
                      <span className="gl2-field-label">Screenshot</span>
                      <div style={{ position: 'relative', height: 46, borderRadius: 11, border: '1px dashed var(--gl2-primary)', background: 'var(--gl2-primary-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        <input type="file" accept="image/*" style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} onChange={(e) => setUpiScreenshot(e.target.files[0])} />
                        <span style={{ fontSize: 13, color: 'var(--gl2-primary-deep)', fontWeight: 700 }}>{upiScreenshot ? `✓ ${upiScreenshot.name.slice(0, 15)}…` : 'Upload screenshot'}</span>
                      </div>
                    </label>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="gl2-card">
            <div className="gl2-summary-rows" style={{ marginBottom: 14 }}>
              <div className="gl2-summary-row"><span className="gl2-summary-label">Subtotal</span><span className="gl2-summary-value">₹{planPrice.toLocaleString('en-IN')}</span></div>
              {discountVal > 0 && <div className="gl2-summary-row"><span className="gl2-summary-label">Discount</span><span className="gl2-summary-value" style={{ color: 'var(--gl2-success-fg)' }}>-₹{discountVal.toLocaleString('en-IN')}</span></div>}
              {taxAmount > 0 && <div className="gl2-summary-row"><span className="gl2-summary-label">Tax ({taxRate}%)</span><span className="gl2-summary-value">+₹{taxAmount.toLocaleString('en-IN')}</span></div>}
              <div className="gl2-summary-row"><span className="gl2-summary-label" style={{ fontSize: 15 }}>Total</span><span className="gl2-summary-value" style={{ fontSize: 22, color: 'var(--gl2-primary-deep)' }}>₹{finalAmount.toLocaleString('en-IN')}</span></div>
              {paymentStatus === 'pending' && <div className="gl2-summary-row"><span className="gl2-summary-label" style={{ color: 'var(--gl2-warning-fg)' }}>Pending</span><span className="gl2-summary-value" style={{ color: 'var(--gl2-warning-fg)' }}>₹{pendingAmount.toLocaleString('en-IN')}</span></div>}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={generatePdf} onChange={(e) => setGeneratePdf(e.target.checked)} />
                <span style={{ fontSize: 14 }}>Generate invoice PDF</span>
              </label>
            </div>
          </div>

          <button type="button" className="gl2-btn gl2-btn-primary gl2-btn-lg" style={{ width: '100%' }} onClick={method === 'razorpay' ? handleRazorpay : handleSubmit} disabled={loading || !selectedMember || !selectedPlan}>
            {loading ? 'Recording…' : method === 'razorpay' ? 'Pay with Razorpay (test)' : paymentStatus === 'pending' && paidNowVal === 0 ? 'Record pending invoice' : 'Record payment & generate invoice'}
          </button>
        </div>
      </div>
    </section>
  );
}

function Badge2({ active }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, marginTop: 4, background: active ? 'var(--gl2-success-bg)' : 'var(--gl2-danger-bg)', color: active ? 'var(--gl2-success-fg)' : 'var(--gl2-danger-fg)' }}>
      <span style={{ width: 6, height: 6, borderRadius: 3, background: 'currentColor' }} />
      {active ? 'Active member' : 'Expired'}
    </span>
  );
}
