import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { createStaffMember, getMemberByPhone } from '../../firebase/firestore';
import { ROLE_PERMISSIONS } from '../../utils/permissions';
import './Staff.css';

const ROLES = [
  { value: 'manager', label: 'Manager' },
  { value: 'trainer', label: 'Trainer' },
  { value: 'receptionist', label: 'Receptionist' },
];

const PERMISSION_DESCRIPTIONS = {
  manager: [
    'Add members', 'Edit members', 'Delete members',
    'View analytics', 'View payments', 'Mark attendance',
  ],
  trainer: ['View assigned members', 'Assign workouts'],
  receptionist: ['Add members', 'View member list', 'Mark attendance'],
};

const AddStaff = () => {
  const navigate = useNavigate();
  const { user, userDoc } = useAuth();
  const { showToast } = useToast();

  const [form, setForm] = useState({
    name: '',
    countryCode: '+91',
    phone: '',
    role: '',
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [duplicate, setDuplicate] = useState(null);

  const update = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const handlePhoneBlur = async () => {
    const phone = `${form.countryCode}${form.phone.replace(/\s/g, '')}`;
    if (form.phone.length < 10 || !userDoc?.gym_id) return;
    try {
      const existing = await getMemberByPhone(userDoc.gym_id, phone);
      setDuplicate(existing);
    } catch (err) {
      console.error(err);
    }
  };

  const validate = () => {
    const newErrors = {};
    if (!form.name.trim() || form.name.trim().length < 2) newErrors.name = 'Name required';
    if (!form.phone.trim() || form.phone.replace(/\s/g, '').length !== 10) newErrors.phone = 'Enter valid phone';
    if (!form.role) newErrors.role = 'Select a role';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);

    try {
      const fullPhone = `${form.countryCode}${form.phone.replace(/\s/g, '')}`;
      await createStaffMember({
        name: form.name.trim(),
        phone: fullPhone,
        role: form.role,
        gym_id: userDoc.gym_id,
        permissions: ROLE_PERMISSIONS[form.role],
        created_by: user.uid,
        profile_photo: null,
        subscription_expiry: null,
        payment_status: null,
        plan_id: null,
        start_date: null,
        height: null,
        weight: null,
        goal: null,
        experience: null,
        medical_notes: null,
        assigned_trainer_id: null,
        attendance_count: 0,
        last_seen: null,
        renewal_history: [],
      });

      showToast(`${form.name} added as ${form.role}`, 'success');
      navigate('/owner/staff');
    } catch (err) {
      console.error('Add staff error:', err);
      showToast('Failed to add staff member', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen staff-screen">
      <div className="screen-content">
        <div className="top-bar">
          <button className="back-btn" onClick={() => navigate(-1)} style={{ marginBottom: 0 }}>← Back</button>
          <h1 className="top-bar-title">Add staff</h1>
          <div style={{ width: 60 }} />
        </div>

        <div className="glass-card" style={{ padding: '20px 18px' }}>
          <div className="input-group">
            <label className="input-label">Staff name</label>
            <input
              type="text"
              className={`input-field ${errors.name ? 'error' : ''}`}
              placeholder="Full name"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              id="staff-name"
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
              </select>
              <input
                type="tel"
                className={`input-field phone-number-input ${errors.phone ? 'error' : ''}`}
                placeholder="98765 43210"
                value={form.phone}
                onChange={(e) => update('phone', e.target.value)}
                onBlur={handlePhoneBlur}
                id="staff-phone"
              />
            </div>
            {errors.phone && <p className="input-error">{errors.phone}</p>}
          </div>

          {duplicate && (
            <div className="duplicate-card glass-card" style={{ borderColor: '#EF9F27' }}>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                This number belongs to <strong>{duplicate.name}</strong> ({duplicate.role}).
                Adding as staff will change their role.
              </p>
            </div>
          )}

          <div className="input-group">
            <label className="input-label">Role</label>
            <div className="pill-group">
              {ROLES.map((r) => (
                <button
                  key={r.value}
                  className={`pill-option ${form.role === r.value ? 'selected' : ''}`}
                  onClick={() => update('role', r.value)}
                  type="button"
                >
                  {r.label}
                </button>
              ))}
            </div>
            {errors.role && <p className="input-error">{errors.role}</p>}
          </div>

          {/* Permissions preview */}
          {form.role && (
            <div className="permissions-preview glass-card">
              <p className="permissions-title">This role can:</p>
              <ul className="permissions-list">
                {PERMISSION_DESCRIPTIONS[form.role]?.map((perm) => (
                  <li key={perm}>{perm}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <button
          className="btn-primary"
          onClick={handleSubmit}
          disabled={loading}
          style={{ marginTop: 20 }}
          id="submit-staff-btn"
        >
          {loading ? <div className="spinner" /> : 'Add staff'}
        </button>
      </div>
    </div>
  );
};

export default AddStaff;
