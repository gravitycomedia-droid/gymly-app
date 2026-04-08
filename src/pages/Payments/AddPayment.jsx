import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getGym, getGymMembersRealtime } from '../../firebase/firestore';
import { createPayment, getNextInvoiceNumber, formatDateKey, Timestamp } from '../../firebase/firestore-payments';
import { updateDoc, doc } from '../../firebase/firestore-payments';
import { db } from '../../firebase/config';
import { generateInvoicePDF, uploadInvoice } from '../../utils/invoiceGenerator';
import { sendWhatsApp, buildReceiptParams } from '../../utils/whatsapp';
import { initiateRazorpayPayment } from '../../utils/razorpay';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../firebase/config';
import { getInitials, getAvatarColor, formatDate, addDays, getPlanName } from '../../utils/helpers';
import './Payments.css';

const AddPayment = () => {
  const navigate = useNavigate();
  const { user, userDoc } = useAuth();
  const { showToast } = useToast();

  const [gym, setGym] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);

  // Member search
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);

  // Payment status: 'paid' or 'pending'
  const [paymentStatus, setPaymentStatus] = useState('paid');
  // Partially paid amount (when status = 'pending' or 'partial')
  const [paidNow, setPaidNow] = useState('');

  // Form fields
  const [planId, setPlanId] = useState('');
  const [discount, setDiscount] = useState('');
  const [method, setMethod] = useState('cash');
  const [upiRef, setUpiRef] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [upiScreenshot, setUpiScreenshot] = useState(null);

  // Success state
  const [showSuccess, setShowSuccess] = useState(false);
  const [successData, setSuccessData] = useState(null);

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    getGym(userDoc.gym_id).then(setGym);
    const unsub = getGymMembersRealtime(userDoc.gym_id, setMembers);
    return () => unsub();
  }, [userDoc?.gym_id]);

  const handleSelectMember = (member) => {
    setSelectedMember(member);
    setSearchQuery('');
    setShowResults(false);
    if (member.plan_id) setPlanId(member.plan_id);
  };

  const plans = gym?.settings?.plans?.filter(p => p.is_active) || [];
  const selectedPlan = plans.find(p => p.id === planId);
  const planPrice = selectedPlan?.price || 0;
  const discountVal = Number(discount) || 0;
  const finalAmount = Math.max(0, planPrice - discountVal);
  const paidNowVal = paymentStatus === 'paid' ? finalAmount : Number(paidNow) || 0;
  const pendingAmount = Math.max(0, finalAmount - paidNowVal);

  // Plan type auto-detected: extend if member is currently active, else start fresh
  const memberExpiry = selectedMember?.subscription_expiry?.toDate
    ? selectedMember.subscription_expiry.toDate()
    : selectedMember?.subscription_expiry ? new Date(selectedMember.subscription_expiry) : null;
  const isMemberActive = memberExpiry && memberExpiry > new Date();
  // Auto-extend: if active, append to current expiry; if expired, start from payment date
  const startDate = isMemberActive ? memberExpiry : new Date(paymentDate);
  const endDate = selectedPlan ? addDays(startDate, selectedPlan.duration_days || 30) : null;

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) return [];
    const q = searchQuery.toLowerCase();
    return members.filter(m =>
      m.name?.toLowerCase().includes(q) || m.phone?.includes(q)
    ).slice(0, 6);
  }, [searchQuery, members]);

  const handleSubmit = async () => {
    if (!selectedMember) { showToast('Please select a member', 'error'); return; }
    if (!selectedPlan) { showToast('Please select a plan', 'error'); return; }
    if (finalAmount <= 0) { showToast('Amount must be greater than 0', 'error'); return; }
    if (paymentStatus === 'pending' && !paidNow && !dueDate) {
      showToast('Set a due date for pending payments', 'error'); return;
    }

    setLoading(true);
    try {
      // 1. Invoice number
      const invoiceNumber = await getNextInvoiceNumber(userDoc.gym_id);

      // 2. Determine status
      const statusToSave = paymentStatus === 'paid'
        ? 'paid'
        : paidNowVal > 0
          ? 'partial'
          : 'pending';

      // 3. Build payment doc
      const paymentData = {
        gym_id: userDoc.gym_id,
        member_id: selectedMember.id,
        member_name: selectedMember.name,
        member_phone: selectedMember.phone,
        plan_id: planId,
        plan_name: selectedPlan.name,
        plan_auto_extend: isMemberActive,
        amount: planPrice,
        discount: discountVal,
        final_amount: finalAmount,
        paid_amount: paidNowVal,
        pending_amount: pendingAmount,
        method: method,
        upi_ref: method === 'upi' ? upiRef : null,
        status: statusToSave,
        payment_date: Timestamp.fromDate(new Date(paymentDate)),
        due_date: dueDate ? Timestamp.fromDate(new Date(dueDate)) : null,
        membership_start: Timestamp.fromDate(startDate),
        membership_end: Timestamp.fromDate(endDate),
        invoice_number: invoiceNumber,
        invoice_url: null,
        whatsapp_sent: false,
        recorded_by: user.uid,
        notes: notes || null,
      };

      // 4. Create payment doc
      const paymentId = await createPayment(paymentData);

      let finalScreenshotUrl = null;
      if (method === 'upi' && upiScreenshot) {
        const storageRef = ref(storage, `payment_screenshots/${paymentId}`);
        await uploadBytes(storageRef, upiScreenshot);
        finalScreenshotUrl = await getDownloadURL(storageRef);
        await updateDoc(doc(db, 'payments', paymentId), { screenshot_url: finalScreenshotUrl });
      }

      // 5. Update member doc — only update expiry if fully paid or partial with dates set
      const memberUpdate = {
        payment_status: statusToSave,
        plan_id: planId,
      };
      // Always update subscription if status is paid or partial
      if (statusToSave === 'paid' || statusToSave === 'partial') {
        memberUpdate.subscription_expiry = Timestamp.fromDate(endDate);
      }
      await updateDoc(doc(db, 'users', selectedMember.id), memberUpdate);

      // 6. Generate invoice PDF (non-blocking)
      let invoiceUrl = null;
      try {
        const blob = await generateInvoicePDF({ ...paymentData, id: paymentId }, gym, selectedMember);
        invoiceUrl = await uploadInvoice(userDoc.gym_id, invoiceNumber, blob);
        await updateDoc(doc(db, 'payments', paymentId), { invoice_url: invoiceUrl });
      } catch (pdfErr) {
        console.error('Invoice error (non-critical):', pdfErr);
      }

      // 7. Send WhatsApp receipt (only if paid)
      if (statusToSave === 'paid') {
        try {
          await sendWhatsApp({
            phone: selectedMember.phone,
            templateName: 'payment_receipt',
            params: buildReceiptParams(gym, selectedMember, paymentData),
            gymId: userDoc.gym_id,
            memberId: selectedMember.id,
          });
          await updateDoc(doc(db, 'payments', paymentId), { whatsapp_sent: true });
        } catch (waErr) {
          console.error('WhatsApp error (non-critical):', waErr);
        }
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
    if (!selectedMember || !selectedPlan) {
      showToast('Select a member and plan first', 'error');
      return;
    }
    try {
      await initiateRazorpayPayment({
        amount: finalAmount * 100,
        memberName: selectedMember.name,
        memberPhone: selectedMember.phone,
        gymName: gym?.name || 'Gymly',
        planName: selectedPlan.name,
        onSuccess: (result) => {
          setMethod('razorpay');
          setUpiRef(result.razorpay_payment_id);
          setPaymentStatus('paid');
          handleSubmit();
        },
        onFailure: (reason) => {
          if (reason !== 'dismissed') showToast('Payment failed', 'error');
        },
      });
    } catch (err) {
      showToast('Razorpay error', 'error');
    }
  };

  const resetForm = () => {
    setShowSuccess(false);
    setSelectedMember(null);
    setPlanId('');
    setPaymentStatus('paid');
    setDiscount('');
    setPaidNow('');
    setUpiRef('');
    setUpiScreenshot(null);
    setNotes('');
    setDueDate('');
  };

  // Success overlay
  if (showSuccess && successData) {
    const statusColors = {
      paid: '#1D9E75',
      partial: '#EF9F27',
      pending: '#534AB7',
    };
    const statusLabel = {
      paid: '✓ Fully Paid',
      partial: '◐ Partial Payment',
      pending: '⏱ Pending',
    };
    return (
      <div className="screen add-payment-screen">
        <div className="screen-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
          <div className="success-sheet glass-card">
            <div className="success-checkmark" style={{ background: `${statusColors[successData.status]}18` }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke={statusColors[successData.status]} strokeWidth="2" fill="none"/>
                <polyline points="8 12 11 15 16 9" stroke={statusColors[successData.status]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Payment recorded!</h2>
            <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
              background: `${statusColors[successData.status]}18`, color: statusColors[successData.status], marginBottom: 8 }}>
              {statusLabel[successData.status]}
            </span>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
              Invoice: <strong>{successData.invoiceNumber}</strong>
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
              {selectedMember?.name} — ₹{paidNowVal.toLocaleString('en-IN')}
              {pendingAmount > 0 && ` (₹${pendingAmount.toLocaleString('en-IN')} pending)`}
            </p>
            
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn-primary" onClick={() => navigate(`/owner/payments/${successData.paymentId}`)}>
                View Details
              </button>
              <button className="btn-ghost" onClick={resetForm}>Record another</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen add-payment-screen">
      <div className="screen-content">
        {/* Top bar */}
        <div className="top-bar">
          <button className="back-btn" onClick={() => navigate(-1)} style={{ marginBottom: 0 }}>← Back</button>
          <h1 className="top-bar-title">Record payment</h1>
          <div style={{ width: 60 }} />
        </div>

        {/* Member search */}
        {!selectedMember ? (
          <div className="member-search-wrapper">
            <div className="search-bar" style={{ marginBottom: 0 }}>
              <span className="search-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </span>
              <input
                type="text"
                className="search-input"
                placeholder="Search member by name or phone"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setShowResults(true); }}
                onFocus={() => setShowResults(true)}
                id="member-search-input"
              />
            </div>
            {showResults && searchResults.length > 0 && (
              <div className="member-search-results glass-card">
                {searchResults.map(m => {
                  const color = getAvatarColor(m.name);
                  const planName = getPlanName(gym, m.plan_id);
                  const exp = m.subscription_expiry?.toDate ? m.subscription_expiry.toDate() : null;
                  const isActive = exp && exp > new Date();
                  return (
                    <div key={m.id} className="member-search-item" onClick={() => handleSelectMember(m)}>
                      <div className="member-search-item-avatar" style={{ background: color.bg, color: color.text }}>
                        {getInitials(m.name)}
                      </div>
                      <div className="member-search-item-info">
                        <div className="member-search-item-name">{m.name}</div>
                        <div className="member-search-item-phone">
                          {m.phone} • {planName}
                          {isActive && <span style={{ color: '#1D9E75', marginLeft: 4, fontSize: 10 }}>● Active</span>}
                          {!isActive && exp && <span style={{ color: '#E24B4A', marginLeft: 4, fontSize: 10 }}>● Expired</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="selected-member-chip">
            <div className="member-search-item-avatar" style={{
              background: getAvatarColor(selectedMember.name).bg,
              color: getAvatarColor(selectedMember.name).text,
            }}>
              {getInitials(selectedMember.name)}
            </div>
            <div className="selected-member-chip-info">
              <div className="selected-member-chip-name">{selectedMember.name}</div>
              <div className="selected-member-chip-plan">
                {selectedMember.phone}
                {isMemberActive && <span style={{ color: '#1D9E75', marginLeft: 6, fontSize: 10, fontWeight: 600 }}>● Active till {formatDate(memberExpiry)}</span>}
                {!isMemberActive && <span style={{ color: '#E24B4A', marginLeft: 6, fontSize: 10, fontWeight: 600 }}>● Expired</span>}
              </div>
            </div>
            <button className="selected-member-chip-remove" onClick={() => { setSelectedMember(null); }}>×</button>
          </div>
        )}

        {/* Main form */}
        <div className="glass-card" style={{ padding: '20px 18px' }}>

          {/* Plan */}
          <div className="input-group">
            <label className="input-label">Membership plan</label>
            <select
              className="input-field"
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              id="payment-plan-select"
            >
              <option value="">Select a plan</option>
              {plans.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} — ₹{p.price} — {p.duration_days} days
                </option>
              ))}
            </select>
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
              id="discount-input"
            />
          </div>

          {/* Amount display */}
          {selectedPlan && (
            <div className="amount-display">₹{finalAmount.toLocaleString('en-IN')}</div>
          )}

          {/* ── Payment Status ── */}
          <div className="input-group">
            <label className="input-label">Payment status</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setPaymentStatus('paid')}
                className={`payment-pill ${paymentStatus === 'paid' ? 'paid' : ''}`}
                type="button"
                style={{ flex: 1 }}
              >
                ✓ Fully paid
              </button>
              <button
                onClick={() => setPaymentStatus('pending')}
                className={`payment-pill ${paymentStatus === 'pending' ? 'paid' : ''}`}
                type="button"
                style={{ flex: 1, background: paymentStatus === 'pending' ? 'rgba(239,159,39,0.12)' : undefined,
                  color: paymentStatus === 'pending' ? '#EF9F27' : undefined,
                  borderColor: paymentStatus === 'pending' ? '#EF9F27' : undefined }}
              >
                ⏱ Pending / Partial
              </button>
            </div>
          </div>

          {/* Partial payment amount (only if pending) */}
          {paymentStatus === 'pending' && selectedPlan && (
            <>
              <div className="input-group">
                <label className="input-label">Amount paid now (₹) <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>— leave 0 for fully pending</span></label>
                <input
                  type="number"
                  className="input-field"
                  placeholder="0"
                  value={paidNow}
                  onChange={(e) => setPaidNow(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
                <span>Pending: <strong style={{ color: '#EF9F27' }}>₹{pendingAmount.toLocaleString('en-IN')}</strong></span>
                <span>Paid: <strong style={{ color: '#1D9E75' }}>₹{paidNowVal.toLocaleString('en-IN')}</strong></span>
              </div>
              <div className="input-group">
                <label className="input-label">Due date</label>
                <input
                  type="date"
                  className="input-field"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </>
          )}

          {/* Payment method (hide if pending with 0 paid) */}
          {(paymentStatus === 'paid' || paidNowVal > 0) && (
            <div className="input-group">
              <label className="input-label">Payment method</label>
              <div className="payment-toggle" style={{ display: 'flex', gap: 6 }}>
                <button className={`payment-pill ${method === 'cash' ? 'paid' : ''}`} onClick={() => setMethod('cash')} type="button">Cash</button>
                <button className={`payment-pill ${method === 'upi' ? 'paid' : ''}`} onClick={() => setMethod('upi')} type="button">UPI</button>
                <button
                  className={`payment-pill ${method === 'razorpay' ? 'paid' : ''}`}
                  onClick={() => setMethod('razorpay')}
                  type="button"
                >
                  Razorpay <span className="razorpay-test-badge" style={{ padding: '1px 5px', fontSize: 8, marginLeft: 4 }}>Test</span>
                </button>
              </div>
            </div>
          )}

          {method === 'upi' && (
            <div className="input-group">
              <label className="input-label">UPI Reference Number (Optional)</label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. 123456789012"
                value={upiRef}
                onChange={(e) => setUpiRef(e.target.value)}
              />
            </div>
          )}

          {method === 'upi' && (
            <div className="input-group">
              <label className="input-label">Upload Screenshot (Optional)</label>
              <div className="upload-box" style={{ 
                border: '1px dashed rgba(83, 74, 183, 0.3)', 
                borderRadius: 8, 
                padding: '16px',
                textAlign: 'center',
                background: 'rgba(83, 74, 183, 0.02)',
                cursor: 'pointer',
                position: 'relative'
              }}>
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={(e) => setUpiScreenshot(e.target.files[0])}
                  style={{
                    position: 'absolute',
                    top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer'
                  }}
                />
                {upiScreenshot ? (
                  <div>
                    <div style={{ color: 'var(--primary)', fontWeight: 600, marginBottom: 4 }}>Image Selected ✅</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{upiScreenshot.name}</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ color: 'var(--primary)', fontSize: 24, marginBottom: 4 }}>📸</div>
                    <div style={{ fontSize: 13, color: 'var(--text-dark)' }}>Tap to browse or take photo</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Payment date */}
          <div className="input-group">
            <label className="input-label">Payment date</label>
            <input
              type="date"
              className="input-field"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div className="input-group">
            <label className="input-label">Notes (optional)</label>
            <textarea
              className="input-field"
              placeholder="Any notes about this payment..."
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 300))}
              rows={2}
              style={{ resize: 'none' }}
            />
          </div>

          {/* Membership dates preview */}
          {selectedPlan && endDate && (
            <div className="membership-info-card glass-card">
              <div className="membership-info-row">
                <span className="membership-info-label">Membership start</span>
                <span className="membership-info-value">{formatDate(startDate)}</span>
              </div>
              <div className="membership-info-row">
                <span className="membership-info-label">Membership end</span>
                <span className="membership-info-value" style={{ color: '#1D9E75', fontWeight: 600 }}>{formatDate(endDate)}</span>
              </div>
              <div className="membership-info-row">
                <span className="membership-info-label">Duration</span>
                <span className="membership-info-value">{selectedPlan.duration_days} days</span>
              </div>
              {isMemberActive && (
                <div className="membership-extend-note">
                  ↗ Extends from {formatDate(memberExpiry)} → {formatDate(endDate)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Submit */}
        {method === 'razorpay' ? (
          <button
            className="btn-primary"
            onClick={handleRazorpay}
            disabled={loading || !selectedMember || !selectedPlan}
            style={{ marginTop: 20 }}
          >
            {loading ? <div className="spinner" /> : 'Pay with Razorpay (Test)'}
          </button>
        ) : (
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={loading || !selectedMember || !selectedPlan}
            style={{ marginTop: 20 }}
            id="submit-payment-btn"
          >
            {loading ? <div className="spinner" /> : paymentStatus === 'paid' ? 'Record & Generate Invoice' : 'Record Pending Payment'}
          </button>
        )}
      </div>
    </div>
  );
};

export default AddPayment;
