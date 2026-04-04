import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { createMember, getMemberByPhone, getGym, getTrainers, Timestamp } from '../../firebase/firestore';
import { addDays, formatDate, calculateBMI } from '../../utils/helpers';
import './AddMember.css';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GOALS = ['Fat loss', 'Muscle gain', 'Endurance', 'General fitness'];
const EXPERIENCE_LEVELS = ['Beginner', 'Intermediate', 'Advanced'];
const LIFESTYLES = ['Sedentary', 'Lightly active', 'Very active'];
const DIET_OPTIONS = ['Veg', 'Non-veg', 'Vegan', 'Keto', 'Other'];
const GENDERS = ['Male', 'Female', 'Other'];

const AddMember = ({ quickAddOnly = false }) => {
  const navigate = useNavigate();
  const { user, userDoc } = useAuth();
  const { showToast } = useToast();

  const [mode, setMode] = useState('quick');
  const [gym, setGym] = useState(null);
  const [trainers, setTrainers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [newMemberId, setNewMemberId] = useState(null);
  const [duplicate, setDuplicate] = useState(null);
  const [checkingPhone, setCheckingPhone] = useState(false);

  // Form state
  const [form, setForm] = useState({
    name: '',
    countryCode: '+91',
    phone: '',
    planId: '',
    paymentStatus: 'pending',
    // Full profile fields
    dob: '',
    gender: '',
    bloodGroup: '',
    address: '',
    emergencyContact: '',
    height: '',
    weight: '',
    goal: '',
    experience: '',
    lifestyle: '',
    diet: '',
    medicalNotes: '',
    trainerId: '',
  });

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

  const update = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  // Phone duplicate check
  const handlePhoneBlur = async () => {
    const phone = `${form.countryCode}${form.phone.replace(/\s/g, '')}`;
    if (form.phone.length < 10 || !userDoc?.gym_id) return;

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
      const fullPhone = `${form.countryCode}${form.phone.replace(/\s/g, '')}`;
      const memberData = {
        name: form.name.trim(),
        phone: fullPhone,
        role: 'member',
        gym_id: userDoc.gym_id,
        permissions: ['view_own_profile', 'view_own_workout'],
        plan_id: form.planId,
        start_date: Timestamp.now(),
        subscription_expiry: Timestamp.fromDate(calculatedExpiry),
        payment_status: form.paymentStatus,
        created_by: user.uid,
        // Profile fields
        profile_photo: null,
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
      };

      const id = await createMember(memberData);
      setNewMemberId(id);
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
      name: '', countryCode: '+91', phone: '', planId: '', paymentStatus: 'pending',
      dob: '', gender: '', bloodGroup: '', address: '', emergencyContact: '',
      height: '', weight: '', goal: '', experience: '', lifestyle: '',
      diet: '', medicalNotes: '', trainerId: '',
    });
    setErrors({});
    setDuplicate(null);
    setShowSuccess(false);
    setNewMemberId(null);
  };

  // Success bottom sheet
  if (showSuccess) {
    return (
      <div className="screen add-member-screen">
        <div className="screen-content">
          <div className="success-card glass-card">
            <div className="success-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="#1D9E75" strokeWidth="2" fill="none"/>
                <polyline points="8 12 11 15 16 9" stroke="#1D9E75" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Member added!</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
              {form.name} has been added to your gym.
            </p>
            <button className="btn-primary" onClick={resetForm} style={{ marginBottom: 10 }} id="add-another-btn">
              Add another member
            </button>
            <button
              className="btn-ghost"
              onClick={() => navigate(`/owner/members/${newMemberId}`)}
              id="view-profile-btn"
            >
              View member profile
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen add-member-screen">
      <div className="screen-content">
        {/* Top bar */}
        <div className="top-bar">
          <button className="back-btn" onClick={() => navigate(-1)} style={{ marginBottom: 0 }}>
            ← Back
          </button>
          <h1 className="top-bar-title">Add member</h1>
          <div style={{ width: 60 }} />
        </div>

        {/* Mode toggle */}
        {!quickAddOnly && (
          <div className="mode-toggle">
            <button
              className={`mode-toggle-btn ${mode === 'quick' ? 'active' : ''}`}
              onClick={() => setMode('quick')}
            >
              Quick add
            </button>
            <button
              className={`mode-toggle-btn ${mode === 'full' ? 'active' : ''}`}
              onClick={() => setMode('full')}
            >
              Full profile
            </button>
          </div>
        )}

        {/* Form */}
        <div className="glass-card" style={{ padding: '20px 18px' }}>
          {/* Basic info — always shown */}
          <div className="input-group">
            <label className="input-label">Member name</label>
            <input
              type="text"
              className={`input-field ${errors.name ? 'error' : ''}`}
              placeholder="Full name"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              id="member-name-input"
            />
            {errors.name && <p className="input-error">{errors.name}</p>}
          </div>

          <div className="input-group">
            <label className="input-label">Phone number</label>
            <div className="phone-input-wrapper">
              <select
                className="country-select"
                value={form.countryCode}
                onChange={(e) => update('countryCode', e.target.value)}
              >
                <option value="+91">🇮🇳 +91</option>
                <option value="+1">🇺🇸 +1</option>
                <option value="+44">🇬🇧 +44</option>
                <option value="+971">🇦🇪 +971</option>
              </select>
              <input
                type="tel"
                className={`input-field phone-number-input ${errors.phone ? 'error' : ''}`}
                placeholder="98765 43210"
                value={form.phone}
                onChange={(e) => update('phone', e.target.value)}
                onBlur={handlePhoneBlur}
                id="member-phone-input"
              />
            </div>
            {errors.phone && <p className="input-error">{errors.phone}</p>}
            {checkingPhone && <p className="text-muted" style={{ marginTop: 4 }}>Checking...</p>}
          </div>

          {/* Duplicate check card */}
          {duplicate && (
            <div className="duplicate-card glass-card">
              <div className="duplicate-info">
                <span style={{ fontWeight: 600, fontSize: 13 }}>{duplicate.name}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>This number is already registered.</span>
              </div>
              <div className="duplicate-actions">
                <button
                  className="btn-primary"
                  style={{ padding: '8px 14px', fontSize: 12, width: 'auto' }}
                  onClick={() => navigate(`/owner/members/${duplicate.id}`)}
                >
                  View profile
                </button>
                <button
                  className="btn-ghost"
                  style={{ padding: '8px 14px', fontSize: 12, width: 'auto' }}
                  onClick={() => setDuplicate(null)}
                >
                  Use anyway
                </button>
              </div>
            </div>
          )}

          <div className="input-group">
            <label className="input-label">Membership plan</label>
            <select
              className={`input-field ${errors.planId ? 'error' : ''}`}
              value={form.planId}
              onChange={(e) => update('planId', e.target.value)}
              id="plan-select"
            >
              <option value="">Select a plan</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} — ₹{plan.price} — {plan.duration_days} days
                </option>
              ))}
            </select>
            {errors.planId && <p className="input-error">{errors.planId}</p>}
            {calculatedExpiry && (
              <div className="info-chip">
                📅 Expires on {formatDate(calculatedExpiry)}
              </div>
            )}
          </div>

          <div className="input-group">
            <label className="input-label">Payment status</label>
            <div className="payment-toggle">
              <button
                className={`payment-pill ${form.paymentStatus === 'paid' ? 'paid' : ''}`}
                onClick={() => update('paymentStatus', 'paid')}
                type="button"
              >
                Paid
              </button>
              <button
                className={`payment-pill ${form.paymentStatus === 'pending' ? 'pending' : ''}`}
                onClick={() => update('paymentStatus', 'pending')}
                type="button"
              >
                Pending
              </button>
            </div>
          </div>

          {/* Full Profile Fields */}
          {mode === 'full' && !quickAddOnly && (
            <>
              {/* Personal Details */}
              <div className="section-header">
                <span className="section-header-text">Personal details</span>
                <div className="section-header-line" />
              </div>

              <div className="input-group">
                <label className="input-label">Date of birth</label>
                <input
                  type="date"
                  className="input-field"
                  value={form.dob}
                  onChange={(e) => update('dob', e.target.value)}
                />
              </div>

              <div className="input-group">
                <label className="input-label">Gender</label>
                <div className="pill-group">
                  {GENDERS.map((g) => (
                    <button
                      key={g}
                      className={`pill-option ${form.gender === g.toLowerCase() ? 'selected' : ''}`}
                      onClick={() => update('gender', g.toLowerCase())}
                      type="button"
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">Blood group</label>
                <select
                  className="input-field"
                  value={form.bloodGroup}
                  onChange={(e) => update('bloodGroup', e.target.value)}
                >
                  <option value="">Select</option>
                  {BLOOD_GROUPS.map((bg) => (
                    <option key={bg} value={bg}>{bg}</option>
                  ))}
                </select>
              </div>

              <div className="input-group">
                <label className="input-label">Address</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Home address"
                  value={form.address}
                  onChange={(e) => update('address', e.target.value)}
                />
              </div>

              <div className="input-group">
                <label className="input-label">Emergency contact</label>
                <input
                  type="tel"
                  className="input-field"
                  placeholder="Emergency contact number"
                  value={form.emergencyContact}
                  onChange={(e) => update('emergencyContact', e.target.value)}
                />
              </div>

              {/* Fitness Profile */}
              <div className="section-header">
                <span className="section-header-text">Fitness profile</span>
                <div className="section-header-line" />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <div className="input-group" style={{ flex: 1 }}>
                  <label className="input-label">Height</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="number"
                      className="input-field"
                      placeholder="170"
                      value={form.height}
                      onChange={(e) => update('height', e.target.value)}
                    />
                    <span className="unit-label">cm</span>
                  </div>
                </div>
                <div className="input-group" style={{ flex: 1 }}>
                  <label className="input-label">Weight</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="number"
                      className="input-field"
                      placeholder="70"
                      value={form.weight}
                      onChange={(e) => update('weight', e.target.value)}
                    />
                    <span className="unit-label">kg</span>
                  </div>
                </div>
              </div>

              {bmi && (
                <div className="bmi-chip" style={{ borderColor: bmi.color, color: bmi.color }}>
                  BMI: {bmi.value} — {bmi.category}
                </div>
              )}

              <div className="input-group">
                <label className="input-label">Goal</label>
                <div className="pill-group">
                  {GOALS.map((g) => (
                    <button
                      key={g}
                      className={`pill-option ${form.goal === g ? 'selected' : ''}`}
                      onClick={() => update('goal', g)}
                      type="button"
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">Experience level</label>
                <div className="pill-group">
                  {EXPERIENCE_LEVELS.map((e) => (
                    <button
                      key={e}
                      className={`pill-option ${form.experience === e ? 'selected' : ''}`}
                      onClick={() => update('experience', e)}
                      type="button"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">Lifestyle</label>
                <div className="pill-group">
                  {LIFESTYLES.map((l) => (
                    <button
                      key={l}
                      className={`pill-option ${form.lifestyle === l ? 'selected' : ''}`}
                      onClick={() => update('lifestyle', l)}
                      type="button"
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Diet & Medical */}
              <div className="section-header">
                <span className="section-header-text">Diet & Medical</span>
                <div className="section-header-line" />
              </div>

              <div className="input-group">
                <label className="input-label">Diet preference</label>
                <div className="pill-group">
                  {DIET_OPTIONS.map((d) => (
                    <button
                      key={d}
                      className={`pill-option ${form.diet === d ? 'selected' : ''}`}
                      onClick={() => update('diet', d)}
                      type="button"
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">Medical notes</label>
                <textarea
                  className="input-field"
                  placeholder="Any injuries, conditions, or medications..."
                  value={form.medicalNotes}
                  onChange={(e) => update('medicalNotes', e.target.value.slice(0, 300))}
                  rows={3}
                  style={{ resize: 'none' }}
                />
                <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  {form.medicalNotes.length}/300
                </div>
              </div>

              {/* Trainer Assignment */}
              <div className="section-header">
                <span className="section-header-text">Assign trainer (optional)</span>
                <div className="section-header-line" />
              </div>

              {trainers.length > 0 ? (
                <div className="input-group">
                  <select
                    className="input-field"
                    value={form.trainerId}
                    onChange={(e) => update('trainerId', e.target.value)}
                  >
                    <option value="">Select a trainer</option>
                    {trainers.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                  No trainers added yet. Add trainers from Staff section.
                </p>
              )}
            </>
          )}
        </div>

        {/* Submit */}
        <button
          className="btn-primary"
          onClick={handleSubmit}
          disabled={loading}
          style={{ marginTop: 20 }}
          id="submit-member-btn"
        >
          {loading ? <div className="spinner" /> : 'Add member'}
        </button>
      </div>
    </div>
  );
};

export default AddMember;
