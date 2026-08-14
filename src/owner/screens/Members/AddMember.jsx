import { useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import {
  createMember, getMemberByPhone,
  getPlanByName, assignWorkoutPlanToMember,
} from '../../../firebase/firestore';
import useOwnerGym from '../../hooks/useOwnerGym';
import { Timestamp, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { createPayment, getNextInvoiceNumber } from '../../../firebase/firestore-payments';
import { addDays, formatDate, calculateBMI, capPhoneDigits } from '../../../utils/helpers';
import { getRecommendedPlanName } from '../../../data/exerciseLibrary';
import { generateInvoicePDF, uploadInvoice } from '../../../utils/invoiceGenerator';
import { generateMemberNumber, generateEnrollmentNumber, generateMemberId, initializeNumberingSettings } from '../../../utils/numberingService';
import { uploadMemberPhoto } from '../../../firebase/storage';
import { Field, WizardDone } from '../../components/Wizard';

const GOALS = ['Fat loss', 'Muscle gain', 'Endurance', 'General fitness'];
const GENDERS = ['Male', 'Female', 'Other'];

export default function AddMember() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, userDoc } = useAuth();
  const { showToast } = useToast();
  const leadData = location.state?.leadData || null;

  const [showFull, setShowFull] = useState(false);
  const { gym } = useOwnerGym(userDoc?.gym_id);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(null); // { memberId, memberNumber, enrollmentNumber, name }
  const [duplicate, setDuplicate] = useState(null);
  const [checkingPhone, setCheckingPhone] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);

  const [form, setForm] = useState({
    name: leadData?.name || '', countryCode: '+91',
    phone: leadData?.phone ? leadData.phone.replace(/^\+91/, '') : '',
    planId: '', paymentStatus: 'paid', dob: '', gender: '', height: '', weight: '',
    goal: leadData?.goal || '', medicalNotes: '',
  });

  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paidNow, setPaidNow] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [discount, setDiscount] = useState('');
  const [errors, setErrors] = useState({});
  const photoInputRef = useRef(null);

  const plans = (gym?.settings?.plans?.filter((p) => p.is_active) || []).sort((a, b) => (a.duration_days || 0) - (b.duration_days || 0));
  const selectedPlan = plans.find((p) => p.id === form.planId);
  const calculatedExpiry = selectedPlan ? addDays(new Date(), selectedPlan.duration_days || 30) : null;
  const bmi = calculateBMI(Number(form.height), Number(form.weight));

  const planPrice = selectedPlan?.price || 0;
  const discountVal = Number(discount) || 0;
  const finalAmount = Math.max(0, planPrice - discountVal);
  const paidNowVal = form.paymentStatus === 'paid' ? finalAmount : Number(paidNow) || 0;
  const pendingAmount = Math.max(0, finalAmount - paidNowVal);
  const paymentStatusToSave = form.paymentStatus === 'paid' ? 'paid' : paidNowVal > 0 ? 'partial' : 'pending';

  const update = (field, value) => { setForm((prev) => ({ ...prev, [field]: value })); setErrors((prev) => ({ ...prev, [field]: '' })); };

  const handlePhoneBlur = async () => {
    const cleaned = form.phone.replace(/\s/g, '').replace(/^0+/, '');
    const phone = `${form.countryCode}${cleaned}`;
    if (cleaned.length < 9 || !userDoc?.gym_id) return;
    setCheckingPhone(true);
    try {
      setDuplicate(await getMemberByPhone(userDoc.gym_id, phone));
    } catch (err) {
      console.error('Phone check error:', err);
    } finally {
      setCheckingPhone(false);
    }
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const validate = () => {
    const next = {};
    if (!form.name.trim() || form.name.trim().length < 2) next.name = 'Name must be at least 2 characters.';
    if (!form.phone.trim() || form.phone.replace(/\s/g, '').length !== 10) next.phone = 'Enter a valid 10-digit mobile number.';
    if (!form.planId) next.planId = 'Please select a plan.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const cleaned = form.phone.replace(/\s/g, '').replace(/^0+/, '');
      const fullPhone = `${form.countryCode}${cleaned}`;

      let memberNumber = null;
      const memberId = generateMemberId();
      try {
        await initializeNumberingSettings(userDoc.gym_id, gym?.name || 'Gym');
        memberNumber = await generateMemberNumber(userDoc.gym_id, new Date());
      } catch (numErr) { console.error('Numbering error (non-critical):', numErr); }

      const memberData = {
        name: form.name.trim(), phone: fullPhone, role: 'member', gym_id: userDoc.gym_id,
        permissions: ['view_own_profile', 'view_own_workout'],
        plan_id: form.planId, plan_name: selectedPlan?.name || '',
        start_date: Timestamp.now(), subscription_expiry: Timestamp.fromDate(calculatedExpiry),
        payment_status: paymentStatusToSave, created_by: user.uid,
        memberId, memberNumber,
        send_welcome_whatsapp: true, qr_attendance_enabled: false, agreement_status: 'pending',
        profile_photo: null, date_of_birth: form.dob || null, gender: form.gender || null,
        height: form.height ? Number(form.height) : null, weight: form.weight ? Number(form.weight) : null,
        goal: form.goal || null, medical_notes: form.medicalNotes || null,
        attendance_count: 0, last_seen: null, renewal_history: [],
        source_lead_id: leadData?.leadId || null,
      };

      const docMemberId = await createMember(memberData);

      if (photoFile && userDoc.gym_id) {
        try {
          const photoUrl = await uploadMemberPhoto(userDoc.gym_id, docMemberId, photoFile);
          await updateDoc(doc(db, 'users', docMemberId), { profile_photo: photoUrl });
        } catch (photoErr) { console.error('Profile photo upload error (non-critical):', photoErr); }
      }

      try {
        const goalKey = form.goal ? form.goal.replace(' gain', '').replace(' fitness', '').replace(' ', '_').toLowerCase() : 'general';
        const planToAssign = await getPlanByName(getRecommendedPlanName('beginner', goalKey));
        if (planToAssign) await assignWorkoutPlanToMember(docMemberId, planToAssign.id);
      } catch (assignErr) { console.error('Failed to auto-assign workout plan:', assignErr); }

      let enrollmentNumber = null;
      if (selectedPlan) {
        try {
          try {
            const planDuration = selectedPlan.duration_days ? Math.round(selectedPlan.duration_days / 30) : 1;
            enrollmentNumber = await generateEnrollmentNumber(userDoc.gym_id, { joinDate: new Date(), planDurationMonths: planDuration });
          } catch (enErr) {
            console.error('Enrollment number error (non-critical):', enErr);
            enrollmentNumber = `ENR-${Date.now().toString(36).toUpperCase()}`;
          }
          const invoiceNumber = await getNextInvoiceNumber(userDoc.gym_id);
          const paymentData = {
            gym_id: userDoc.gym_id, member_id: docMemberId, member_name: form.name.trim(), member_phone: fullPhone,
            plan_id: form.planId, plan_name: selectedPlan.name, plan_auto_extend: false,
            amount: planPrice, discount: discountVal, final_amount: finalAmount, paid_amount: paidNowVal, pending_amount: pendingAmount,
            method: paymentMethod, upi_ref: null, status: paymentStatusToSave,
            payment_date: Timestamp.now(), due_date: dueDate ? Timestamp.fromDate(new Date(dueDate)) : null,
            membership_start: Timestamp.now(), membership_end: Timestamp.fromDate(calculatedExpiry),
            invoice_number: invoiceNumber, invoice_url: null, whatsapp_sent: false, recorded_by: user.uid, notes: null,
            enrollmentNumber,
          };
          const paymentId = await createPayment(paymentData);
          await updateDoc(doc(db, 'users', docMemberId), { latestEnrollmentNumber: enrollmentNumber }).catch((e) => console.error(e));

          if (finalAmount > 0) {
            try {
              const blob = await generateInvoicePDF({ ...paymentData, id: paymentId }, gym, { id: docMemberId, name: form.name.trim(), phone: fullPhone });
              const invoiceUrl = await uploadInvoice(userDoc.gym_id, invoiceNumber, blob);
              await updateDoc(doc(db, 'payments', paymentId), { invoice_url: invoiceUrl });
            } catch (pdfErr) { console.error('Invoice error (non-critical):', pdfErr); }
          }
        } catch (payErr) { console.error('Payment record error (non-critical):', payErr); }
      }

      if (leadData?.leadId) {
        await updateDoc(doc(db, 'leads', leadData.leadId), { status: 'converted', member_id: docMemberId, converted_at: new Date() }).catch((e) => console.error(e));
      }

      setDone({ memberId: docMemberId, memberNumber, enrollmentNumber, name: form.name.trim() });
      showToast('Member added successfully', 'success');
    } catch (err) {
      console.error('Add member error:', err);
      showToast(`Failed to add member: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <section data-screen-label="Wizard">
        <div className="gl2-wizard-card" style={{ margin: '0 auto' }}>
          <WizardDone
            title="Member added"
            sub={`${done.name} has been added${done.memberNumber ? ` — member #${done.memberNumber}` : ''}${done.enrollmentNumber ? `, enrollment ${done.enrollmentNumber}` : ''}.`}
            ctaLabel="View profile"
            onDone={() => navigate(`/owner/members/${done.memberId}`)}
          />
          <button type="button" className="gl2-btn gl2-btn-secondary" style={{ width: '100%', marginTop: 4 }} onClick={() => window.location.reload()}>
            Add another member
          </button>
        </div>
      </section>
    );
  }

  return (
    <section data-screen-label="Add member">
      <button type="button" className="gl2-back-link" onClick={() => navigate(-1)}>
        <span className="material-symbols-outlined" style={{ fontSize: 17 }}>arrow_back_ios</span>Cancel
      </button>
      <h1 className="gl2-page-title" style={{ marginBottom: 4 }}>{leadData ? `Add ${leadData.name}` : 'Add member'}</h1>
      <p className="gl2-page-sub" style={{ marginBottom: 14 }}>
        {leadData ? 'Converting inquiry — details pre-filled.' : 'Only name and mobile number are required. Everything else can be added later.'}
      </p>

      <div className="gl2-grid-2" style={{ alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="gl2-card">
            <p className="gl2-card-title" style={{ marginBottom: 14 }}>Member</p>

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <button type="button" onClick={() => photoInputRef.current?.click()} style={{ width: 84, height: 84, borderRadius: 42, overflow: 'hidden', border: '3px solid #fff', boxShadow: '0 4px 16px rgba(0,0,0,.12)', background: 'var(--gl2-primary-tint)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {photoPreview ? <img src={photoPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span className="material-symbols-outlined" style={{ fontSize: 30, color: 'var(--gl2-primary)' }}>add_a_photo</span>}
              </button>
              <input ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Full name" required error={errors.name}>
                <input className={`gl2-input ${errors.name ? 'err' : ''}`} placeholder="e.g. Kavya Reddy" value={form.name} onChange={(e) => update('name', e.target.value)} />
              </Field>
              <Field label="Mobile number" required error={errors.phone}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select className="gl2-select" style={{ width: 90 }} value={form.countryCode} onChange={(e) => update('countryCode', e.target.value)}>
                    <option value="+91">🇮🇳 +91</option>
                    <option value="+1">🇺🇸 +1</option>
                    <option value="+44">🇬🇧 +44</option>
                  </select>
                  <input className={`gl2-input ${errors.phone ? 'err' : ''}`} inputMode="numeric" maxLength={10} placeholder="10-digit number" value={form.phone} onChange={(e) => update('phone', capPhoneDigits(e.target.value))} onBlur={handlePhoneBlur} />
                </div>
                {checkingPhone && <span style={{ fontSize: 12.5, color: 'var(--gl2-primary)' }}>Checking…</span>}
              </Field>

              {duplicate && (
                <div style={{ padding: 13, borderRadius: 11, background: 'var(--gl2-danger-bg)', border: '1px solid #F0D5D2', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700 }}>Found {duplicate.name}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--gl2-muted)' }}>This number is already registered.</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="gl2-btn gl2-btn-danger" onClick={() => navigate(`/owner/members/${duplicate.id}`)}>View profile</button>
                    <button type="button" className="gl2-btn gl2-btn-secondary" onClick={() => setDuplicate(null)}>Use anyway</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="gl2-card">
            <p className="gl2-card-title" style={{ marginBottom: 14 }}>Plan & payment</p>
            <Field label="Membership plan" required error={errors.planId}>
              <select className={`gl2-select ${errors.planId ? 'err' : ''}`} value={form.planId} onChange={(e) => update('planId', e.target.value)}>
                <option value="">Choose a plan…</option>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name} — ₹{p.price} — {p.duration_days} days</option>)}
              </select>
            </Field>

            {selectedPlan && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <Field label="Discount (₹)">
                    <input className="gl2-input" type="number" placeholder="0" value={discount} onChange={(e) => setDiscount(e.target.value)} />
                  </Field>
                  <Field label="Payment status">
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className={`gl2-filter-chip ${form.paymentStatus === 'paid' ? 'active' : ''}`} style={{ flex: 1 }} onClick={() => update('paymentStatus', 'paid')}>✓ Fully paid</button>
                      <button type="button" className={`gl2-filter-chip warn ${form.paymentStatus === 'pending' ? 'active' : ''}`} style={{ flex: 1 }} onClick={() => update('paymentStatus', 'pending')}>⏱ Pending</button>
                    </div>
                  </Field>
                </div>

                {form.paymentStatus === 'pending' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, padding: 13, borderRadius: 11, background: 'var(--gl2-danger-bg)' }}>
                    <Field label="Amount collected now">
                      <input className="gl2-input" type="number" placeholder="0" value={paidNow} onChange={(e) => setPaidNow(e.target.value)} />
                    </Field>
                    <Field label="Due date">
                      <input className="gl2-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                    </Field>
                  </div>
                )}

                {(form.paymentStatus === 'paid' || paidNowVal > 0) && (
                  <Field label="Payment method">
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className={`gl2-filter-chip ${paymentMethod === 'cash' ? 'active' : ''}`} style={{ flex: 1 }} onClick={() => setPaymentMethod('cash')}>Cash</button>
                      <button type="button" className={`gl2-filter-chip ${paymentMethod === 'upi' ? 'active' : ''}`} style={{ flex: 1 }} onClick={() => setPaymentMethod('upi')}>UPI</button>
                    </div>
                  </Field>
                )}
              </div>
            )}
          </div>

          <button type="button" className="gl2-btn gl2-btn-secondary" onClick={() => setShowFull((v) => !v)}>
            {showFull ? 'Hide health & profile details' : '+ Add health & profile details (optional)'}
          </button>

          {showFull && (
            <div className="gl2-card">
              <p className="gl2-card-title" style={{ marginBottom: 14 }}>Health & profile</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <Field label="Gender">
                    <select className="gl2-select" value={form.gender} onChange={(e) => update('gender', e.target.value)}>
                      <option value="">Select…</option>
                      {GENDERS.map((g) => <option key={g} value={g.toLowerCase()}>{g}</option>)}
                    </select>
                  </Field>
                  <Field label="Date of birth">
                    <input className="gl2-input" type="date" value={form.dob} onChange={(e) => update('dob', e.target.value)} />
                  </Field>
                  <Field label="Height (cm)">
                    <input className="gl2-input" type="number" placeholder="175" value={form.height} onChange={(e) => update('height', e.target.value)} />
                  </Field>
                  <Field label="Weight (kg)">
                    <input className="gl2-input" type="number" placeholder="70" value={form.weight} onChange={(e) => update('weight', e.target.value)} />
                  </Field>
                </div>
                {bmi && (
                  <div style={{ padding: 11, borderRadius: 10, border: `1px solid ${bmi.color}`, background: `${bmi.color}15`, color: bmi.color, fontWeight: 700, fontSize: 14 }}>
                    BMI: {bmi.value} — {bmi.category}
                  </div>
                )}
                <Field label="Goal">
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {GOALS.map((g) => (
                      <button key={g} type="button" className={`gl2-filter-chip ${form.goal === g ? 'active' : ''}`} onClick={() => update('goal', g)}>{g}</button>
                    ))}
                  </div>
                </Field>
                <Field label="Medical notes">
                  <textarea className="gl2-input" style={{ minHeight: 80, padding: 11, resize: 'vertical' }} placeholder="Any injuries, conditions…" value={form.medicalNotes} onChange={(e) => update('medicalNotes', e.target.value)} />
                </Field>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="gl2-card">
            <p className="gl2-eyebrow">Summary</p>
            <div className="gl2-summary-rows">
              <div className="gl2-summary-row">
                <span className="gl2-summary-label">Plan</span>
                <span className="gl2-summary-value">{selectedPlan ? selectedPlan.name : 'No plan yet'}</span>
              </div>
              <div className="gl2-summary-row">
                <span className="gl2-summary-label">Amount</span>
                <span className="gl2-summary-value" style={{ color: 'var(--gl2-primary-deep)' }}>₹{finalAmount.toLocaleString('en-IN')}</span>
              </div>
              <div className="gl2-summary-row">
                <span className="gl2-summary-label">Expiry</span>
                <span className={`gl2-summary-value ${calculatedExpiry ? '' : 'muted'}`}>{calculatedExpiry ? formatDate(calculatedExpiry) : 'Select a plan'}</span>
              </div>
              {form.paymentStatus === 'pending' && pendingAmount > 0 && (
                <div className="gl2-summary-row">
                  <span className="gl2-summary-label">Pending</span>
                  <span className="gl2-summary-value" style={{ color: 'var(--gl2-warning-fg)' }}>₹{pendingAmount.toLocaleString('en-IN')}</span>
                </div>
              )}
            </div>
          </div>

          <button type="button" className="gl2-btn gl2-btn-primary gl2-btn-lg" style={{ width: '100%' }} onClick={handleSubmit} disabled={loading}>
            {loading ? 'Creating…' : 'Confirm & add member'}
          </button>
        </div>
      </div>
    </section>
  );
}
