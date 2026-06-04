import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  createMember, getMemberByPhone, getGym, getTrainers,
  Timestamp, getPlanByName, assignWorkoutPlanToMember, updateDoc, doc
} from '../../firebase/firestore';
import { db } from '../../firebase/config';
import { createPayment, getNextInvoiceNumber } from '../../firebase/firestore-payments';
import { addDays, formatDate, calculateBMI } from '../../utils/helpers';
import { getRecommendedPlanName } from '../../data/exerciseLibrary';
import { generateInvoicePDF, uploadInvoice } from '../../utils/invoiceGenerator';
import {
  generateMemberNumber, generateEnrollmentNumber,
  generateMemberId, initializeNumberingSettings
} from '../../utils/numberingService';
import { uploadMemberPhoto } from '../../firebase/storage';
import BottomNav from '../../components/BottomNav';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GOALS = ['Fat loss', 'Muscle gain', 'Endurance', 'General fitness'];
const EXPERIENCE_LEVELS = ['Beginner', 'Intermediate', 'Advanced'];
const LIFESTYLES = ['Sedentary', 'Lightly active', 'Very active'];
const DIET_OPTIONS = ['Veg', 'Non-veg', 'Vegan', 'Keto', 'Other'];
const GENDERS = ['Male', 'Female', 'Other'];

const AddMember = ({ quickAddOnly = false }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, userDoc } = useAuth();
  const { showToast } = useToast();

  const leadData = location.state?.leadData || null;

  const [mode, setMode] = useState('quick');
  const [gym, setGym] = useState(null);
  const [trainers, setTrainers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [newMemberId, setNewMemberId] = useState(null);
  const [newMemberNumber, setNewMemberNumber] = useState(null);
  const [newEnrollmentNumber, setNewEnrollmentNumber] = useState(null);
  const [duplicate, setDuplicate] = useState(null);
  const [checkingPhone, setCheckingPhone] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const photoInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setShowPhotoPicker(false);
  };

  // Form state
  const [form, setForm] = useState({
    name: leadData?.name || '',
    countryCode: '+91',
    phone: leadData?.phone ? leadData.phone.replace(/^\+91/, '') : '',
    planId: '',
    paymentStatus: 'paid',
    dob: '',
    gender: '',
    bloodGroup: '',
    address: '',
    emergencyContact: '',
    height: '',
    weight: '',
    goal: leadData?.goal || '',
    experience: '',
    lifestyle: '',
    diet: '',
    medicalNotes: '',
    trainerId: '',
  });

  // Payment fields
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paidNow, setPaidNow] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [discount, setDiscount] = useState('');
  const [upiRef, setUpiRef] = useState('');
  const [paymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentNotes, setPaymentNotes] = useState('');

  // Smart Actions
  const [sendWhatsApp, setSendWhatsApp] = useState(true);
  const [generateQR, setGenerateQR] = useState(false);
  const [requireAgreement, setRequireAgreement] = useState(true);

  const [errors, setErrors] = useState({});

  useEffect(() => {
    const fetchData = async () => {
      if (!userDoc?.gym_id) return;
      try {
        const [gymData, trainerList] = await Promise.all([
          getGym(userDoc.gym_id),
          getTrainers(userDoc.gym_id),
        ]);
        setGym(gymData);
        setTrainers(trainerList);
      } catch (err) {
        console.error('Error fetching data:', err);
      }
    };
    fetchData();
  }, [userDoc?.gym_id]);

  const plans = gym?.settings?.plans?.filter((p) => p.is_active) || [];
  const selectedPlan = plans.find((p) => p.id === form.planId);
  const calculatedExpiry = selectedPlan ? addDays(new Date(), selectedPlan.duration_days || 30) : null;
  const bmi = calculateBMI(Number(form.height), Number(form.weight));

  // Payment calculations
  const planPrice = selectedPlan?.price || 0;
  const discountVal = Number(discount) || 0;
  const finalAmount = Math.max(0, planPrice - discountVal);
  const paidNowVal = form.paymentStatus === 'paid' ? finalAmount : Number(paidNow) || 0;
  const pendingAmount = Math.max(0, finalAmount - paidNowVal);
  const paymentStatusToSave = form.paymentStatus === 'paid' ? 'paid' : paidNowVal > 0 ? 'partial' : 'pending';

  const update = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const handlePhoneBlur = async () => {
    const cleaned = form.phone.replace(/\s/g, '').replace(/^0+/, '');
    const phone = `${form.countryCode}${cleaned}`;
    if (cleaned.length < 9 || !userDoc?.gym_id) return;

    setCheckingPhone(true);
    try {
      const existing = await getMemberByPhone(userDoc.gym_id, phone);
      setDuplicate(existing);
    } catch (err) {
      console.error('Phone check error:', err);
    } finally {
      setCheckingPhone(false);
    }
  };

  const validate = () => {
    const newErrors = {};
    if (!form.name.trim() || form.name.trim().length < 2)
      newErrors.name = 'Name must be at least 2 characters';
    if (!form.phone.trim() || form.phone.replace(/\s/g, '').length !== 10)
      newErrors.phone = 'Enter a valid 10-digit phone number';
    if (!form.planId)
      newErrors.planId = 'Please select a plan';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);

    try {
      const cleaned = form.phone.replace(/\s/g, '').replace(/^0+/, '');
      const fullPhone = `${form.countryCode}${cleaned}`;

      // Generate numbering
      let memberNumber = null;
      let memberId = generateMemberId();
      try {
        await initializeNumberingSettings(userDoc.gym_id, gym?.name || 'Gym');
        memberNumber = await generateMemberNumber(userDoc.gym_id, new Date());
      } catch (numErr) {
        console.error('Numbering error (non-critical):', numErr);
      }

      const memberData = {
        name: form.name.trim(),
        phone: fullPhone,
        role: 'member',
        gym_id: userDoc.gym_id,
        permissions: ['view_own_profile', 'view_own_workout'],
        plan_id: form.planId,
        plan_name: selectedPlan?.name || '',
        start_date: Timestamp.now(),
        subscription_expiry: Timestamp.fromDate(calculatedExpiry),
        payment_status: paymentStatusToSave,
        created_by: user.uid,
        
        // Numbering System
        memberId,
        memberNumber,
        
        // Smart Actions
        send_welcome_whatsapp: sendWhatsApp,
        qr_attendance_enabled: generateQR,
        agreement_status: requireAgreement ? 'pending' : 'not_required',
        
        // Profile fields
        profile_photo: null, // will be updated below if photo uploaded
        date_of_birth: form.dob || null,
        gender: form.gender || null,
        blood_group: form.bloodGroup || null,
        address: form.address || null,
        emergency_contact: form.emergencyContact || null,
        height: form.height ? Number(form.height) : null,
        weight: form.weight ? Number(form.weight) : null,
        goal: form.goal || null,
        experience: form.experience || null,
        lifestyle: form.lifestyle || null,
        diet: form.diet || null,
        medical_notes: form.medicalNotes || null,
        assigned_trainer_id: form.trainerId || null,
        attendance_count: 0,
        last_seen: null,
        renewal_history: [],
        source_lead_id: leadData?.leadId || null,
      };

      const docMemberId = await createMember(memberData);

      // Upload profile photo if selected
      if (photoFile && userDoc.gym_id) {
        try {
          const photoUrl = await uploadMemberPhoto(userDoc.gym_id, docMemberId, photoFile);
          await updateDoc(doc(db, 'users', docMemberId), { profile_photo: photoUrl });
        } catch (photoErr) {
          console.error('Profile photo upload error (non-critical):', photoErr);
        }
      }

      // Auto-assign workout plan
      try {
        const goalKey = form.goal ? form.goal.replace(' gain', '').replace(' fitness', '').replace(' ', '_').toLowerCase() : 'general';
        const expKey = form.experience ? form.experience.toLowerCase() : 'beginner';
        const planName = getRecommendedPlanName(expKey, goalKey);
        const planToAssign = await getPlanByName(planName);
        if (planToAssign) {
          await assignWorkoutPlanToMember(docMemberId, planToAssign.id);
        }
      } catch (assignErr) {
        console.error('Failed to auto-assign workout plan:', assignErr);
      }

      // Create payment record if plan selected
      let enrollmentNumber = null;
      if (selectedPlan) {
        try {
          // Generate enrollment number
          try {
            const planDuration = selectedPlan.duration_days ? Math.round(selectedPlan.duration_days / 30) : 1;
            enrollmentNumber = await generateEnrollmentNumber(userDoc.gym_id, {
              joinDate: new Date(),
              planDurationMonths: planDuration,
            });
          } catch (enErr) {
            console.error('Enrollment number error (non-critical):', enErr);
            // Fallback enrollment number if generation fails
            enrollmentNumber = `ENR-${Date.now().toString(36).toUpperCase()}`;
          }

          const invoiceNumber = await getNextInvoiceNumber(userDoc.gym_id);
          const paymentData = {
            gym_id: userDoc.gym_id,
            member_id: docMemberId,
            member_name: form.name.trim(),
            member_phone: fullPhone,
            plan_id: form.planId,
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
            payment_date: Timestamp.fromDate(new Date(paymentDate)),
            due_date: dueDate ? Timestamp.fromDate(new Date(dueDate)) : null,
            membership_start: Timestamp.now(),
            membership_end: Timestamp.fromDate(calculatedExpiry),
            invoice_number: invoiceNumber,
            invoice_url: null,
            whatsapp_sent: false,
            recorded_by: user.uid,
            notes: paymentNotes || null,
            enrollmentNumber: enrollmentNumber,
          };
          const paymentId = await createPayment(paymentData);

          try {
            await updateDoc(doc(db, 'users', docMemberId), { latestEnrollmentNumber: enrollmentNumber });
          } catch (enUpdateErr) {
            console.error('Member enrollment update error:', enUpdateErr);
          }

          if (finalAmount > 0) {
            try {
              const blob = await generateInvoicePDF({ ...paymentData, id: paymentId }, gym, { id: docMemberId, name: form.name.trim(), phone: fullPhone });
              const invoiceUrl = await uploadInvoice(userDoc.gym_id, invoiceNumber, blob);
              await updateDoc(doc(db, 'payments', paymentId), { invoice_url: invoiceUrl });
            } catch (pdfErr) {
              console.error('Invoice error (non-critical):', pdfErr);
            }
          }
        } catch (payErr) {
          console.error('Payment record error (non-critical):', payErr);
        }
      }

      if (leadData?.leadId) {
        try {
          await updateDoc(doc(db, 'leads', leadData.leadId), {
            status: 'converted',
            member_id: docMemberId,
            converted_at: new Date(),
          });
        } catch (leadErr) {
          console.error('Lead update error (non-critical):', leadErr);
        }
      }

      setNewMemberId(docMemberId);
      setNewMemberNumber(memberNumber);
      setNewEnrollmentNumber(enrollmentNumber);
      setShowSuccess(true);
      showToast('Member added successfully', 'success');
    } catch (err) {
      console.error('Add member error:', err);
      showToast(`Failed to add member: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm({
      name: '', countryCode: '+91', phone: '', planId: '', paymentStatus: 'paid',
      dob: '', gender: '', bloodGroup: '', address: '', emergencyContact: '',
      height: '', weight: '', goal: '', experience: '', lifestyle: '',
      diet: '', medicalNotes: '', trainerId: '',
    });
    setErrors({});
    setDuplicate(null);
    setShowSuccess(false);
    setNewMemberId(null);
    setNewMemberNumber(null);
    setNewEnrollmentNumber(null);
    setPaymentMethod('cash');
    setPaidNow('');
    setDiscount('');
    setUpiRef('');
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  // Success screen
  if (showSuccess) {
    return (
      <div className="mesh-bg min-h-screen text-on-background font-body-md flex items-center justify-center p-4">
        <div className="glass-panel max-w-sm w-full p-8 rounded-2xl text-center shadow-lg">
          <div className="w-16 h-16 bg-tertiary-container/20 text-tertiary-container rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="material-symbols-outlined text-4xl">check_circle</span>
          </div>
          <h2 className="font-headline-md text-headline-md text-on-surface mb-2">Member Added! 🎉</h2>
          <p className="font-body-md text-body-md text-on-surface-variant mb-1">
            {form.name} has been successfully added to your gym.
          </p>
          
          {newMemberNumber && (
            <div className="mt-3 mb-1 px-4 py-2.5 rounded-xl bg-primary/8 border border-primary/15">
              <div className="text-[11px] text-on-surface-variant font-medium uppercase tracking-wider mb-1">Member Number</div>
              <div className="text-lg font-bold text-primary font-mono tracking-wide">#{newMemberNumber}</div>
            </div>
          )}
          {newEnrollmentNumber && (
            <div className="mt-2 px-4 py-2 rounded-xl bg-[#1D9E75]/10 border border-[#1D9E75]/20">
              <div className="text-[11px] text-on-surface-variant font-medium uppercase tracking-wider mb-1">Enrollment</div>
              <div className="text-sm font-semibold text-[#1D9E75] font-mono tracking-wide">{newEnrollmentNumber}</div>
            </div>
          )}
          
          <div className="flex flex-col gap-3 mt-8">
            <button onClick={resetForm} className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-secondary text-white font-label-md hover:opacity-90 transition-opacity">
              Add Another Member
            </button>
            <button onClick={() => navigate(`/owner/members/${newMemberId}`)} className="w-full py-3 rounded-xl glass-input text-primary font-label-md hover:bg-white/60 transition-colors">
              View Profile
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mesh-bg min-h-screen pb-24 md:pb-0 font-body-md antialiased pt-[80px]">
      
      {/* Mobile Top Header */}
      <header className="md:hidden fixed top-0 left-0 w-full z-50 bg-surface/30 backdrop-blur-3xl px-4 h-16 flex items-center shadow-sm">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-on-surface-variant hover:text-primary transition-colors">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <span className="font-display-lg text-xl ml-2 font-bold text-on-surface">Gymly</span>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 md:px-gutter mt-4 md:mt-0">
        
        {/* Header Section */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface mb-1">
              {leadData ? `Add ${leadData.name}` : 'Add Member'}
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant">Create a new gym membership</p>
          </div>
          <button onClick={() => navigate(-1)} className="hidden md:flex text-on-surface-variant hover:text-primary transition-colors items-center gap-1 font-label-md">
            <span className="material-symbols-outlined text-[18px]">close</span> Cancel
          </button>
        </div>

        {/* Lead notice */}
        {leadData && (
          <div className="glass-panel bg-primary/10 border-primary/20 rounded-xl p-4 mb-6 flex items-center gap-3">
            <span className="material-symbols-outlined text-primary">link</span>
            <span className="font-label-md text-label-md text-primary">Converting inquiry from Leads Dashboard — details pre-filled.</span>
          </div>
        )}

        {/* Tabs */}
        {!quickAddOnly && (
          <div className="flex gap-4 mb-8 border-b border-outline-variant/30 pb-2">
            <button 
              className={`font-label-md text-label-md pb-2 px-2 transition-colors ${mode === 'quick' ? 'text-primary border-b-2 border-primary' : 'text-on-surface-variant hover:text-primary'}`}
              onClick={() => setMode('quick')}
            >
              Quick Add
            </button>
            <button 
              className={`font-label-md text-label-md pb-2 px-2 transition-colors ${mode === 'full' ? 'text-primary border-b-2 border-primary' : 'text-on-surface-variant hover:text-primary'}`}
              onClick={() => setMode('full')}
            >
              Full Profile
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          
          {/* Form Column */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Personal Details */}
            <div className="glass-panel rounded-xl p-6 md:p-8">
              <h3 className="font-headline-md text-headline-md text-on-surface mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">person</span>
                Personal Details
              </h3>

              {/* Photo Picker */}
              <div className="flex justify-center mb-6">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowPhotoPicker(true)}
                    className="w-24 h-24 rounded-full overflow-hidden border-4 border-white/50 shadow-lg bg-primary/10 flex items-center justify-center text-on-surface-variant hover:bg-primary/20 transition-colors group"
                    title="Add photo"
                  >
                    {photoPreview ? (
                      <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <span className="material-symbols-outlined text-3xl text-primary/60 group-hover:text-primary transition-colors">add_a_photo</span>
                    )}
                  </button>
                  <div className="absolute bottom-0 right-0 w-7 h-7 bg-primary rounded-full flex items-center justify-center shadow-md pointer-events-none">
                    <span className="material-symbols-outlined text-white text-[14px]">photo_camera</span>
                  </div>
                </div>
                {/* Hidden file inputs */}
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="font-label-sm text-label-sm text-on-surface-variant uppercase">Full Name <span className="text-error">*</span></label>
                  <input 
                    type="text"
                    className={`w-full rounded-lg px-4 py-3 glass-input text-on-surface placeholder:text-outline/50 font-body-md ${errors.name ? 'border-error' : ''}`}
                    placeholder="John Doe" 
                    value={form.name}
                    onChange={(e) => update('name', e.target.value)}
                  />
                  {errors.name && <span className="text-error text-xs">{errors.name}</span>}
                </div>
                
                <div className="space-y-2">
                  <label className="font-label-sm text-label-sm text-on-surface-variant uppercase">Phone Number <span className="text-error">*</span></label>
                  <div className="flex gap-2">
                    <select 
                      className="w-24 rounded-lg px-2 py-3 glass-input text-on-surface font-body-md appearance-none bg-transparent"
                      value={form.countryCode}
                      onChange={(e) => update('countryCode', e.target.value)}
                    >
                      <option value="+91">🇮🇳 +91</option>
                      <option value="+1">🇺🇸 +1</option>
                      <option value="+44">🇬🇧 +44</option>
                    </select>
                    <input 
                      type="tel"
                      className={`w-full rounded-lg px-4 py-3 glass-input text-on-surface placeholder:text-outline/50 font-body-md ${errors.phone ? 'border-error' : ''}`}
                      placeholder="98765 43210" 
                      value={form.phone}
                      onChange={(e) => update('phone', e.target.value)}
                      onBlur={handlePhoneBlur}
                    />
                  </div>
                  {errors.phone && <span className="text-error text-xs block mt-1">{errors.phone}</span>}
                  {checkingPhone && <span className="text-primary text-xs block mt-1">Checking...</span>}
                </div>
              </div>

              {/* Duplicate Warning */}
              {duplicate && (
                <div className="mt-6 p-4 rounded-xl bg-error-container/50 border border-error/20 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <span className="font-label-md block text-on-surface">Found {duplicate.name}</span>
                    <span className="font-body-md text-sm text-on-surface-variant">This phone number is already registered.</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => navigate(`/owner/members/${duplicate.id}`)} className="px-4 py-2 bg-error text-white rounded-lg font-label-md text-sm hover:opacity-90">View Profile</button>
                    <button onClick={() => setDuplicate(null)} className="px-4 py-2 glass-input text-on-surface rounded-lg font-label-md text-sm hover:bg-white/50">Use Anyway</button>
                  </div>
                </div>
              )}
            </div>

            {/* Membership Plan */}
            <div className="glass-panel rounded-xl p-6 md:p-8">
              <h3 className="font-headline-md text-headline-md text-on-surface mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary">fitness_center</span>
                Membership Plan
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="space-y-2 md:col-span-2">
                  <label className="font-label-sm text-label-sm text-on-surface-variant uppercase">Select Plan <span className="text-error">*</span></label>
                  <select 
                    className={`w-full rounded-lg px-4 py-3 glass-input text-on-surface font-body-md appearance-none bg-transparent ${errors.planId ? 'border-error' : ''}`}
                    value={form.planId}
                    onChange={(e) => update('planId', e.target.value)}
                  >
                    <option value="">Choose a plan...</option>
                    {plans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name} — ₹{plan.price} — {plan.duration_days} days
                      </option>
                    ))}
                  </select>
                  {errors.planId && <span className="text-error text-xs">{errors.planId}</span>}
                </div>
              </div>

              {selectedPlan && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div className="space-y-2">
                      <label className="font-label-sm text-label-sm text-on-surface-variant uppercase">Discount (₹)</label>
                      <input 
                        type="number"
                        className="w-full rounded-lg px-4 py-3 glass-input text-on-surface font-body-md"
                        placeholder="0"
                        value={discount}
                        onChange={(e) => setDiscount(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="font-label-sm text-label-sm text-on-surface-variant uppercase">Payment Status</label>
                      <div className="flex gap-2">
                        <button 
                          className={`flex-1 py-3 rounded-lg font-label-md border border-black/15 transition-all ${form.paymentStatus === 'paid' ? 'bg-tertiary-container/20 border-tertiary text-tertiary shadow-sm' : 'glass-input text-on-surface-variant'}`}
                          onClick={() => update('paymentStatus', 'paid')}
                          type="button"
                        >
                          ✓ Fully Paid
                        </button>
                        <button 
                          className={`flex-1 py-3 rounded-lg font-label-md border border-black/15 transition-all ${form.paymentStatus === 'pending' ? 'bg-error-container/40 border-[#d97706] text-[#d97706] shadow-sm' : 'glass-input text-on-surface-variant'}`}
                          onClick={() => update('paymentStatus', 'pending')}
                          type="button"
                        >
                          ⏱ Pending
                        </button>
                      </div>
                    </div>
                  </div>

                  {form.paymentStatus === 'pending' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 p-4 rounded-xl bg-error-container/20 border border-error-container">
                      <div className="space-y-2">
                        <label className="font-label-sm text-label-sm text-on-surface-variant uppercase">Amount Collected Now</label>
                        <div className="relative">
                          <span className="absolute left-4 top-3 text-on-surface-variant">₹</span>
                          <input 
                            type="number"
                            className="w-full rounded-lg pl-8 pr-4 py-3 glass-input text-on-surface font-body-md bg-white/50"
                            placeholder="0"
                            value={paidNow}
                            onChange={(e) => setPaidNow(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="font-label-sm text-label-sm text-on-surface-variant uppercase">Due Date</label>
                        <input 
                          type="date"
                          className="w-full rounded-lg px-4 py-3 glass-input text-on-surface font-body-md bg-white/50"
                          value={dueDate}
                          onChange={(e) => setDueDate(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  {(form.paymentStatus === 'paid' || paidNowVal > 0) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                      <div className="space-y-2">
                        <label className="font-label-sm text-label-sm text-on-surface-variant uppercase">Payment Method</label>
                        <div className="flex gap-2">
                          <button className={`flex-1 py-3 rounded-lg font-label-md border border-black/15 transition-colors ${paymentMethod === 'cash' ? 'bg-primary text-white shadow-md border-primary' : 'glass-input text-on-surface'}`} onClick={() => setPaymentMethod('cash')} type="button">Cash</button>
                          <button className={`flex-1 py-3 rounded-lg font-label-md border border-black/15 transition-colors ${paymentMethod === 'upi' ? 'bg-primary text-white shadow-md border-primary' : 'glass-input text-on-surface'}`} onClick={() => setPaymentMethod('upi')} type="button">UPI</button>
                        </div>
                      </div>
                      {paymentMethod === 'upi' && (
                        <div className="space-y-2">
                          <label className="font-label-sm text-label-sm text-on-surface-variant uppercase">UPI Reference</label>
                          <input 
                            type="text"
                            className="w-full rounded-lg px-4 py-3 glass-input text-on-surface font-body-md"
                            placeholder="Optional"
                            value={upiRef}
                            onChange={(e) => setUpiRef(e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    <label className="font-label-sm text-label-sm text-on-surface-variant uppercase">Payment Notes</label>
                    <input 
                      type="text"
                      className="w-full rounded-lg px-4 py-3 glass-input text-on-surface font-body-md"
                      placeholder="Optional notes..."
                      value={paymentNotes}
                      onChange={(e) => setPaymentNotes(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Full Profile Fields */}
            {mode === 'full' && !quickAddOnly && (
              <>
                <div className="glass-panel rounded-xl p-6 md:p-8 space-y-6">
                  <h3 className="font-headline-md text-headline-md text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-tertiary">health_and_safety</span>
                    Health & Profile
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="font-label-sm text-label-sm text-on-surface-variant uppercase">Gender</label>
                      <select className="w-full rounded-lg px-4 py-3 glass-input text-on-surface font-body-md appearance-none bg-transparent" value={form.gender} onChange={(e) => update('gender', e.target.value)}>
                        <option value="">Select...</option>
                        {GENDERS.map(g => <option key={g} value={g.toLowerCase()}>{g}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="font-label-sm text-label-sm text-on-surface-variant uppercase">Date of Birth</label>
                      <input type="date" className="w-full rounded-lg px-4 py-3 glass-input text-on-surface font-body-md bg-transparent" value={form.dob} onChange={(e) => update('dob', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <label className="font-label-sm text-label-sm text-on-surface-variant uppercase">Height (cm)</label>
                      <input type="number" className="w-full rounded-lg px-4 py-3 glass-input text-on-surface font-body-md" placeholder="175" value={form.height} onChange={(e) => update('height', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <label className="font-label-sm text-label-sm text-on-surface-variant uppercase">Weight (kg)</label>
                      <input type="number" className="w-full rounded-lg px-4 py-3 glass-input text-on-surface font-body-md" placeholder="70" value={form.weight} onChange={(e) => update('weight', e.target.value)} />
                    </div>
                  </div>
                  
                  {bmi && (
                    <div className="p-3 rounded-lg border flex items-center gap-2" style={{ backgroundColor: `${bmi.color}15`, borderColor: bmi.color, color: bmi.color }}>
                      <span className="material-symbols-outlined">monitor_weight</span>
                      <span className="font-label-md">BMI: {bmi.value} — {bmi.category}</span>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="font-label-sm text-label-sm text-on-surface-variant uppercase">Goal</label>
                    <div className="flex flex-wrap gap-2">
                      {GOALS.map(g => (
                        <button key={g} type="button" onClick={() => update('goal', g)} className={`px-4 py-2 rounded-full font-label-md transition-colors border ${form.goal === g ? 'bg-primary text-white border-primary shadow-md' : 'glass-input text-on-surface-variant hover:text-on-surface'}`}>{g}</button>
                      ))}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="font-label-sm text-label-sm text-on-surface-variant uppercase">Medical Notes</label>
                    <textarea className="w-full rounded-lg px-4 py-3 glass-input text-on-surface font-body-md" placeholder="Any injuries, conditions..." value={form.medicalNotes} onChange={(e) => update('medicalNotes', e.target.value)} rows={3}></textarea>
                  </div>
                </div>
              </>
            )}

          </div>

          {/* Summary & Actions Column */}
          <div className="space-y-6">
            
            {/* Summary Card */}
            <div className="glass-panel rounded-xl p-6 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-16 -mt-16 transition-all group-hover:bg-primary/20"></div>
              <h3 className="font-label-sm text-label-sm text-on-surface-variant uppercase mb-4 tracking-widest">Membership Summary</h3>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center pb-4 border-b border-outline-variant/20">
                  <span className="font-body-md text-body-md text-on-surface">{selectedPlan ? selectedPlan.name : 'No Plan Selected'}</span>
                  <span className="font-headline-md text-headline-md text-primary">₹{finalAmount.toLocaleString('en-IN')}</span>
                </div>
                
                {calculatedExpiry ? (
                  <div className="flex items-center gap-3 text-on-surface-variant pt-2">
                    <span className="material-symbols-outlined text-secondary text-sm">event_available</span>
                    <span className="font-label-md text-label-md">Expires: {formatDate(calculatedExpiry)}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 text-outline/60 pt-2">
                    <span className="material-symbols-outlined text-sm">hourglass_empty</span>
                    <span className="font-label-md text-label-md">Select a plan to see expiry</span>
                  </div>
                )}
                
                {form.paymentStatus === 'pending' && pendingAmount > 0 && (
                  <div className="flex items-center gap-3 text-[#EF9F27] pt-2 font-semibold">
                    <span className="material-symbols-outlined text-sm">warning</span>
                    <span className="font-label-md text-label-md">Pending: ₹{pendingAmount.toLocaleString('en-IN')}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Smart Features Card */}
            <div className="glass-panel rounded-xl p-6">
              <h3 className="font-label-sm text-label-sm text-on-surface-variant uppercase mb-4 tracking-widest">Smart Actions</h3>
              <div className="space-y-4">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={`relative flex items-center justify-center w-5 h-5 border border-black/30 rounded transition-colors ${sendWhatsApp ? 'bg-primary' : 'glass-input group-hover:border-black/50'}`}>
                    <span className={`material-symbols-outlined text-[16px] text-white transition-opacity ${sendWhatsApp ? 'opacity-100' : 'opacity-0'}`}>check</span>
                  </div>
                  <input type="checkbox" className="hidden" checked={sendWhatsApp} onChange={(e) => setSendWhatsApp(e.target.checked)} />
                  <span className="font-body-md text-body-md text-on-surface group-hover:text-primary transition-colors">Send Welcome WhatsApp</span>
                </label>
                
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={`relative flex items-center justify-center w-5 h-5 border border-black/30 rounded transition-colors ${generateQR ? 'bg-primary' : 'glass-input group-hover:border-black/50'}`}>
                    <span className={`material-symbols-outlined text-[16px] text-white transition-opacity ${generateQR ? 'opacity-100' : 'opacity-0'}`}>check</span>
                  </div>
                  <input type="checkbox" className="hidden" checked={generateQR} onChange={(e) => setGenerateQR(e.target.checked)} />
                  <span className="font-body-md text-body-md text-on-surface group-hover:text-primary transition-colors">Enable QR Attendance</span>
                </label>
                
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={`relative flex items-center justify-center w-5 h-5 border border-black/30 rounded transition-colors ${requireAgreement ? 'bg-primary' : 'glass-input group-hover:border-black/50'}`}>
                    <span className={`material-symbols-outlined text-[16px] text-white transition-opacity ${requireAgreement ? 'opacity-100' : 'opacity-0'}`}>check</span>
                  </div>
                  <input type="checkbox" className="hidden" checked={requireAgreement} onChange={(e) => setRequireAgreement(e.target.checked)} />
                  <span className="font-body-md text-body-md text-on-surface group-hover:text-primary transition-colors">Require Membership Agreement</span>
                </label>
              </div>
            </div>

            {/* CTA */}
            <button 
              onClick={handleSubmit} 
              disabled={loading}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-primary to-secondary text-white font-label-md text-label-md tracking-wide hover:shadow-[0_0_20px_rgba(109,54,212,0.4)] active:scale-95 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="spinner spinner-primary !border-white !border-t-transparent" />
              ) : (
                <>
                  <span className="material-symbols-outlined">person_add</span>
                  Create Member
                </>
              )}
            </button>
            
          </div>
        </div>

        <div style={{ height: 100 }} />
      </main>

      <BottomNav activeTab="home" role="owner" />

      {/* Photo Picker Modal */}
      {showPhotoPicker && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-end justify-center"
          onClick={() => setShowPhotoPicker(false)}
        >
          <div
            className="glass-panel w-full max-w-sm mx-4 mb-6 rounded-3xl p-6 flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-black/20 rounded-full mx-auto mb-2" />
            <p className="font-label-md text-on-surface-variant text-center text-sm mb-2">Add Member Photo</p>
            <button
              onClick={() => { cameraInputRef.current?.click(); }}
              className="flex items-center gap-4 w-full px-5 py-4 rounded-2xl bg-primary/10 hover:bg-primary/15 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-white text-[20px]">photo_camera</span>
              </div>
              <div className="text-left">
                <p className="font-label-md text-on-surface font-semibold">Open Camera</p>
                <p className="text-xs text-on-surface-variant">Take a new photo</p>
              </div>
            </button>
            <button
              onClick={() => { photoInputRef.current?.click(); }}
              className="flex items-center gap-4 w-full px-5 py-4 rounded-2xl bg-secondary/10 hover:bg-secondary/15 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-white text-[20px]">photo_library</span>
              </div>
              <div className="text-left">
                <p className="font-label-md text-on-surface font-semibold">Choose from Gallery</p>
                <p className="text-xs text-on-surface-variant">Pick an existing photo</p>
              </div>
            </button>
            <button
              onClick={() => setShowPhotoPicker(false)}
              className="mt-1 py-3 rounded-xl border border-outline-variant text-on-surface-variant font-label-md text-sm hover:bg-black/5 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddMember;
