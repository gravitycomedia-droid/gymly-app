import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getGym, getGymMembersRealtime } from '../../firebase/firestore';
import { createPayment, getNextInvoiceNumber, formatDateKey, Timestamp } from '../../firebase/firestore-payments';
import { updateDoc, doc } from '../../firebase/firestore-payments';
import { db, storage } from '../../firebase/config';
import { generateInvoicePDF, uploadInvoice } from '../../utils/invoiceGenerator';
import { sendWhatsApp, buildReceiptParams } from '../../utils/whatsapp';
import { generateEnrollmentNumber, initializeNumberingSettings } from '../../utils/numberingService';
import { initiateRazorpayPayment } from '../../utils/razorpay';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getInitials, getAvatarColor, formatDate, addDays, getPlanName } from '../../utils/helpers';
import BottomNav from '../../components/BottomNav';

const AddPayment = () => {
  const navigate = useNavigate();
  const { user, userDoc } = useAuth();
  const { showToast } = useToast();

  const [gym, setGym] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);

  // Payment status & partial
  const [paymentStatus, setPaymentStatus] = useState('paid');
  const [paidNow, setPaidNow] = useState('');

  // Form
  const [planId, setPlanId] = useState('');
  const [discount, setDiscount] = useState('');
  const [method, setMethod] = useState('cash');
  const [upiRef, setUpiRef] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [upiScreenshot, setUpiScreenshot] = useState(null);

  // Smart Features
  const [sendWaReceipt, setSendWaReceipt] = useState(true);
  const [generatePdf, setGeneratePdf] = useState(true);

  // Success
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
  const subtotal = Math.max(0, planPrice - discountVal);
  
  // Tax Logic
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
    return members.filter(m => m.name?.toLowerCase().includes(q) || m.phone?.includes(q)).slice(0, 6);
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
      const invoiceNumber = await getNextInvoiceNumber(userDoc.gym_id);
      const statusToSave = paymentStatus === 'paid' ? 'paid' : paidNowVal > 0 ? 'partial' : 'pending';

      // Generate enrollment number for this payment
      let enrollmentNumber = null;
      try {
        await initializeNumberingSettings(userDoc.gym_id, gym?.name || 'Gym');
        const planDuration = selectedPlan.duration_days ? Math.round(selectedPlan.duration_days / 30) : 1;
        enrollmentNumber = await generateEnrollmentNumber(userDoc.gym_id, {
          joinDate: new Date(),
          planDurationMonths: planDuration,
        });
      } catch (enErr) {
        console.error('Enrollment number error (non-critical):', enErr);
      }

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
        tax_rate: taxRate,
        tax_amount: taxAmount,
        final_amount: finalAmount,
        paid_amount: paidNowVal,
        pending_amount: pendingAmount,
        method: method,
        upi_ref: method === 'upi' ? upiRef : null,
        status: statusToSave,
        payment_date: Timestamp.fromDate(new Date()),
        due_date: dueDate ? Timestamp.fromDate(new Date(dueDate)) : null,
        membership_start: Timestamp.fromDate(startDate),
        membership_end: Timestamp.fromDate(endDate),
        invoice_number: invoiceNumber,
        invoice_url: null,
        whatsapp_sent: false,
        recorded_by: user.uid,
        enrollmentNumber: enrollmentNumber,
      };

      const paymentId = await createPayment(paymentData);

      if (method === 'upi' && upiScreenshot) {
        const storageRef = ref(storage, `payment_screenshots/${paymentId}`);
        await uploadBytes(storageRef, upiScreenshot);
        const finalScreenshotUrl = await getDownloadURL(storageRef);
        await updateDoc(doc(db, 'payments', paymentId), { screenshot_url: finalScreenshotUrl });
      }

      const memberUpdate = { payment_status: statusToSave, plan_id: planId };
      if (statusToSave === 'paid' || statusToSave === 'partial') {
        memberUpdate.subscription_expiry = Timestamp.fromDate(endDate);
      }
      if (enrollmentNumber) {
        memberUpdate.latestEnrollmentNumber = enrollmentNumber;
      }
      await updateDoc(doc(db, 'users', selectedMember.id), memberUpdate);

      let invoiceUrl = null;
      if (generatePdf) {
        try {
          const blob = await generateInvoicePDF({ ...paymentData, id: paymentId }, gym, selectedMember);
          invoiceUrl = await uploadInvoice(userDoc.gym_id, invoiceNumber, blob);
          await updateDoc(doc(db, 'payments', paymentId), { invoice_url: invoiceUrl });
        } catch (pdfErr) {
          console.error('Invoice error (non-critical):', pdfErr);
        }
      }

      if (statusToSave === 'paid' && sendWaReceipt) {
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
          console.error('WhatsApp error:', waErr);
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
    if (!selectedMember || !selectedPlan) { showToast('Select a member and plan first', 'error'); return; }
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
    setDueDate('');
  };

  if (showSuccess && successData) {
    const statusColors = { paid: '#1D9E75', partial: '#EF9F27', pending: 'var(--primary)' };
    const statusLabel = { paid: 'Fully Paid', partial: 'Partial Payment', pending: 'Pending' };
    return (
      <div className="mesh-bg min-h-screen text-on-surface flex items-center justify-center p-4">
        <div className="glass-panel max-w-md w-full p-8 rounded-[32px] text-center border-white/60 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-secondary/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
          
          <div className="w-20 h-20 mx-auto rounded-full mb-6 flex items-center justify-center" style={{ background: `${statusColors[successData.status]}18`, color: statusColors[successData.status] }}>
            <span className="material-symbols-outlined text-4xl">{successData.status === 'paid' ? 'check_circle' : 'schedule'}</span>
          </div>
          
          <h2 className="font-display-lg text-2xl font-bold mb-2">Payment Recorded!</h2>
          <span className="inline-flex items-center px-3 py-1 rounded-full font-label-sm text-xs mb-6" style={{ background: `${statusColors[successData.status]}18`, color: statusColors[successData.status] }}>
            {statusLabel[successData.status]}
          </span>
          
          <div className="bg-surface/40 rounded-2xl p-4 mb-8 text-left border border-white/40">
            <div className="flex justify-between mb-2"><span className="text-on-surface-variant text-sm">Invoice</span><span className="font-bold">{successData.invoiceNumber}</span></div>
            <div className="flex justify-between mb-2"><span className="text-on-surface-variant text-sm">Member</span><span className="font-bold">{selectedMember?.name}</span></div>
            <div className="flex justify-between mb-2"><span className="text-on-surface-variant text-sm">Amount Paid</span><span className="font-bold text-[#1D9E75]">₹{paidNowVal.toLocaleString('en-IN')}</span></div>
            {pendingAmount > 0 && <div className="flex justify-between"><span className="text-on-surface-variant text-sm">Pending</span><span className="font-bold text-[#EF9F27]">₹{pendingAmount.toLocaleString('en-IN')}</span></div>}
          </div>
          
          <div className="flex flex-col gap-3">
            <button className="w-full py-3.5 bg-gradient-to-r from-primary to-secondary text-white rounded-xl font-label-md font-bold hover:shadow-lg hover:scale-[1.02] transition-all" onClick={() => navigate(`/owner/payments/${successData.paymentId}`)}>View Receipt</button>
            <button className="w-full py-3.5 bg-white/40 text-on-surface rounded-xl font-label-md border border-white/60 hover:bg-white/60 transition-colors" onClick={resetForm}>Record Another</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mesh-bg min-h-screen text-on-surface pb-24 md:pb-0 overflow-x-hidden">
      
      {/* Top Header */}
      <header className="sticky top-0 w-full bg-surface/60 backdrop-blur-3xl border-b border-white/10 shadow-sm flex justify-between items-center px-4 md:px-8 py-3 z-50">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-white/40 transition-colors text-on-surface-variant flex items-center justify-center">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 className="font-headline-lg text-xl md:text-2xl font-bold text-on-surface">
            Record Payment
          </h1>
        </div>
        <button className="text-secondary font-label-md text-sm md:text-base flex items-center gap-1 hover:opacity-80 transition-opacity bg-secondary/10 px-3 py-1.5 rounded-full" onClick={() => navigate('/owner/payments')}>
          <span className="material-symbols-outlined text-[18px]">history</span> <span className="hidden sm:inline">View History</span>
        </button>
      </header>

      <main className="w-full max-w-7xl mx-auto px-4 md:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: Search & Member Info */}
          <div className="lg:col-span-4 space-y-6">
            {!selectedMember ? (
              <div className="glass-panel rounded-[24px] p-6 border border-white/50 shadow-sm">
                <h3 className="font-label-md text-on-surface-variant mb-4">Find Member</h3>
                <div className="relative mb-4">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/60">search</span>
                  <input
                    type="text"
                    className="w-full pl-12 pr-4 py-3.5 rounded-xl glass-input text-on-surface font-body-md placeholder:text-on-surface-variant/50 focus:ring-2 focus:ring-primary/20 transition-all border-white/60"
                    placeholder="Name, Phone, or ID"
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setShowResults(true); }}
                    onFocus={() => setShowResults(true)}
                  />
                </div>
                
                {showResults && searchResults.length > 0 && (
                  <div className="space-y-2 mt-2 max-h-[300px] overflow-y-auto">
                    {searchResults.map(m => {
                      const color = getAvatarColor(m.name);
                      return (
                        <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/40 cursor-pointer hover:bg-white/60 transition-colors border border-transparent hover:border-white/50" onClick={() => handleSelectMember(m)}>
                          <div className="w-12 h-12 rounded-full flex items-center justify-center font-label-md font-bold text-lg flex-shrink-0" style={{ background: color.bg, color: color.text }}>
                            {getInitials(m.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-label-md text-on-surface truncate">{m.name}</p>
                            <p className="font-body-md text-xs text-on-surface-variant truncate">{m.phone} • {getPlanName(gym, m.plan_id)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="glass-panel rounded-[24px] p-6 border border-white/50 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-secondary/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
                <button onClick={() => setSelectedMember(null)} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-surface-variant/50 hover:bg-surface-variant flex items-center justify-center text-on-surface-variant transition-colors z-10"><span className="material-symbols-outlined text-[18px]">close</span></button>
                
                <div className="flex items-start gap-4 mb-6 relative z-10">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center font-display-lg text-2xl font-bold shadow-sm border-2 border-white/80" style={{ background: getAvatarColor(selectedMember.name).bg, color: getAvatarColor(selectedMember.name).text }}>
                    {getInitials(selectedMember.name)}
                  </div>
                  <div className="flex-1 pt-1">
                    <h3 className="font-headline-md text-xl font-bold text-on-surface leading-tight">{selectedMember.name}</h3>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-label-sm text-[10px] mt-1.5 ${isMemberActive ? 'bg-[#1D9E75]/10 text-[#1D9E75]' : 'bg-[var(--error)]/10 text-[var(--error)]'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isMemberActive ? 'bg-[#1D9E75]' : 'bg-[var(--error)]'}`}></span> {isMemberActive ? 'Active Member' : 'Expired'}
                    </span>
                  </div>
                </div>
                
                <div className="space-y-3 relative z-10">
                  <div className="flex justify-between items-center py-2.5 border-b border-white/20">
                    <span className="text-on-surface-variant font-body-md text-sm">Current Plan</span>
                    <span className="font-label-md text-on-surface">{getPlanName(gym, selectedMember.plan_id)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2.5 border-b border-white/20">
                    <span className="text-on-surface-variant font-body-md text-sm">Expiry Date</span>
                    <span className="font-label-md text-on-surface">{memberExpiry ? formatDate(memberExpiry) : 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center py-2.5">
                    <span className="text-on-surface-variant font-body-md text-sm">Phone</span>
                    <span className="font-label-md text-on-surface">{selectedMember.phone}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Payment Form */}
          <div className="lg:col-span-8">
            <div className={`glass-panel rounded-[24px] p-6 lg:p-8 border border-white/50 shadow-sm transition-opacity duration-300 ${!selectedMember ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
              
              {/* Plan Selection */}
              <h3 className="font-label-md text-base text-on-surface-variant mb-4 flex items-center gap-2 font-bold">
                <span className="material-symbols-outlined text-[20px] text-primary">inventory_2</span> Membership Plan Details
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
                <div>
                  <label className="block font-label-sm text-on-surface-variant mb-2">Select Plan</label>
                  <select className="w-full p-3.5 rounded-xl glass-input text-on-surface font-body-md focus:ring-2 focus:ring-primary/20 appearance-none bg-white/40 border-white/60" value={planId} onChange={(e) => setPlanId(e.target.value)}>
                    <option value="">Select a plan</option>
                    {plans.map(p => <option key={p.id} value={p.id}>{p.name} — ₹{p.price}</option>)}
                  </select>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-label-sm text-on-surface-variant mb-2">Discount (₹)</label>
                    <input type="number" className="w-full p-3.5 rounded-xl glass-input text-on-surface font-body-md focus:ring-2 focus:ring-primary/20 bg-white/40 border-white/60" placeholder="0" value={discount} onChange={e => setDiscount(e.target.value)} />
                  </div>
                  <div>
                    <label className="block font-label-sm text-on-surface-variant mb-2 flex items-center justify-between">
                      Tax (%) {taxEnabled ? '' : <span className="text-[10px] text-[var(--error)] bg-[var(--error)]/10 px-1.5 rounded">Off</span>}
                    </label>
                    <input type="number" className="w-full p-3.5 rounded-xl glass-input text-on-surface font-body-md bg-surface-variant/30 text-on-surface-variant cursor-not-allowed border-white/60" value={taxRate} readOnly title={taxEnabled ? "Edit in Settings" : "Tax is disabled in Settings"} />
                  </div>
                </div>
              </div>

              {/* Payment Status & Due Date (Gym Logic) */}
              <h3 className="font-label-md text-base text-on-surface-variant mb-4 flex items-center gap-2 font-bold">
                <span className="material-symbols-outlined text-[20px] text-primary">flag</span> Payment Status
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
                <div className="flex bg-white/30 rounded-xl p-1 border border-white/50">
                  <button className={`flex-1 py-2.5 rounded-lg font-label-md text-sm transition-all ${paymentStatus === 'paid' ? 'bg-white shadow-sm text-primary font-bold' : 'text-on-surface-variant hover:bg-white/40'}`} onClick={() => setPaymentStatus('paid')}>Fully Paid</button>
                  <button className={`flex-1 py-2.5 rounded-lg font-label-md text-sm transition-all ${paymentStatus === 'pending' ? 'bg-white shadow-sm text-[#EF9F27] font-bold' : 'text-on-surface-variant hover:bg-white/40'}`} onClick={() => setPaymentStatus('pending')}>Pending / Partial</button>
                </div>
                
                {paymentStatus === 'pending' && (
                  <div className="grid grid-cols-2 gap-4 animate-fadeIn">
                    <div>
                      <label className="block font-label-sm text-on-surface-variant mb-1">Paid Today (₹)</label>
                      <input type="number" className="w-full p-2.5 rounded-lg glass-input bg-white/40 border-white/60 font-body-md" placeholder="0" value={paidNow} onChange={e => setPaidNow(e.target.value)} />
                    </div>
                    <div>
                      <label className="block font-label-sm text-on-surface-variant mb-1">Due Date</label>
                      <input type="date" className="w-full p-2.5 rounded-lg glass-input bg-white/40 border-white/60 font-body-md" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                    </div>
                  </div>
                )}
              </div>

              {/* Payment Method */}
              {(paymentStatus === 'paid' || paidNowVal > 0) && (
                <>
                  <h3 className="font-label-md text-base text-on-surface-variant mb-4 flex items-center gap-2 font-bold">
                    <span className="material-symbols-outlined text-[20px] text-primary">account_balance_wallet</span> Payment Method
                  </h3>
                  <div className="grid grid-cols-3 md:grid-cols-5 gap-3 mb-8">
                    {[
                      { id: 'cash', icon: 'payments', label: 'Cash' },
                      { id: 'upi', icon: 'qr_code_scanner', label: 'UPI' },
                      { id: 'card', icon: 'credit_card', label: 'Card' },
                      { id: 'bank', icon: 'account_balance', label: 'Bank' },
                      { id: 'razorpay', icon: 'link', label: 'Online' },
                    ].map(m => (
                      <button key={m.id} onClick={() => setMethod(m.id)} className={`glass-panel rounded-xl p-3 md:p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all border ${method === m.id ? 'bg-secondary/10 border-secondary shadow-[0_0_15px_rgba(109,54,212,0.15)] text-secondary scale-[1.02]' : 'border-white/50 text-on-surface-variant hover:bg-white/40'}`}>
                        <span className="material-symbols-outlined text-[24px]">{m.icon}</span>
                        <span className="font-label-sm text-[11px] md:text-xs">{m.label}</span>
                      </button>
                    ))}
                  </div>

                  {method === 'upi' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 animate-fadeIn">
                      <div>
                        <label className="block font-label-sm text-on-surface-variant mb-2">UPI Reference No.</label>
                        <input type="text" className="w-full p-3.5 rounded-xl glass-input bg-white/40 border-white/60" placeholder="Optional" value={upiRef} onChange={e => setUpiRef(e.target.value)} />
                      </div>
                      <div>
                        <label className="block font-label-sm text-on-surface-variant mb-2">Screenshot</label>
                        <div className="relative w-full h-[52px] rounded-xl border border-dashed border-primary bg-primary/5 flex items-center justify-center cursor-pointer hover:bg-primary/10 transition-colors">
                          <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={e => setUpiScreenshot(e.target.files[0])} />
                          <span className="font-label-sm text-primary flex items-center gap-2">{upiScreenshot ? <><span className="material-symbols-outlined text-[16px]">check_circle</span> {upiScreenshot.name.slice(0, 15)}...</> : <><span className="material-symbols-outlined text-[18px]">add_a_photo</span> Upload Screenshot</>}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Live Calculation */}
              <div className="bg-gradient-to-br from-surface-container-lowest to-secondary-fixed/30 rounded-2xl p-6 border border-white/50 mb-8 shadow-sm">
                <div className="space-y-3 mb-6">
                  <div className="flex justify-between text-body-md text-on-surface-variant"><span>Subtotal</span><span>₹{planPrice.toLocaleString('en-IN')}</span></div>
                  {discountVal > 0 && <div className="flex justify-between text-body-md text-secondary"><span>Discount</span><span>-₹{discountVal.toLocaleString('en-IN')}</span></div>}
                  {taxAmount > 0 && <div className="flex justify-between text-body-md text-on-surface-variant"><span>Tax ({taxRate}%)</span><span>+₹{taxAmount.toLocaleString('en-IN')}</span></div>}
                  
                  <div className="border-t border-white/40 pt-4 mt-2 flex justify-between items-end">
                    <div>
                      <div className="font-headline-md text-xl text-on-surface font-bold">Total Amount</div>
                      {paymentStatus === 'pending' && <div className="font-label-sm text-[#EF9F27] mt-1">Pending: ₹{pendingAmount.toLocaleString('en-IN')}</div>}
                    </div>
                    <div className="font-display-lg text-3xl md:text-4xl text-primary font-bold">₹{finalAmount.toLocaleString('en-IN')}</div>
                  </div>
                </div>

                {/* Smart Features */}
                <div className="space-y-3 pt-5 border-t border-white/20">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input type="checkbox" checked={sendWaReceipt} onChange={(e) => setSendWaReceipt(e.target.checked)} className="w-5 h-5 rounded border-white/60 text-secondary focus:ring-secondary/50 bg-white/50" />
                    <span className="font-body-md text-sm text-on-surface group-hover:text-secondary transition-colors">Send WhatsApp Receipt</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input type="checkbox" checked={generatePdf} onChange={(e) => setGeneratePdf(e.target.checked)} className="w-5 h-5 rounded border-white/60 text-secondary focus:ring-secondary/50 bg-white/50" />
                    <span className="font-body-md text-sm text-on-surface group-hover:text-secondary transition-colors">Generate Invoice PDF</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer group opacity-80" title="Auto-extends from current expiry date if active">
                    <input type="checkbox" checked={isMemberActive} readOnly disabled className="w-5 h-5 rounded border-white/60 text-secondary focus:ring-secondary/50 bg-white/50" />
                    <span className="font-body-md text-sm text-on-surface">Renew Membership Automatically</span>
                  </label>
                </div>
              </div>

              {/* CTA */}
              <button 
                className="w-full py-4 rounded-xl bg-gradient-to-r from-primary to-secondary text-white font-label-md text-lg font-bold shadow-[0_8px_20px_rgba(109,54,212,0.25)] hover:shadow-[0_12px_25px_rgba(109,54,212,0.35)] hover:scale-[1.01] active:scale-[0.99] transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={method === 'razorpay' ? handleRazorpay : handleSubmit}
                disabled={loading || !selectedMember || !selectedPlan}
              >
                {loading ? <div className="spinner w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : (
                  <>
                    <span className="material-symbols-outlined text-[22px]">receipt_long</span>
                    {method === 'razorpay' ? 'Pay with Razorpay (Test)' : paymentStatus === 'pending' && paidNowVal === 0 ? 'Record Pending Invoice' : 'Record Payment & Generate Invoice'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </main>

      <BottomNav activeTab="payments" role="owner" />
    </div>
  );
};

export default AddPayment;
