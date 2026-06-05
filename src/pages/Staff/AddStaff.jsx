import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { createStaffMember, getMemberByPhone } from '../../firebase/firestore';
import { storage } from '../../firebase/config';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { compressImage } from '../../firebase/storage';
import { ROLE_PERMISSIONS } from '../../utils/permissions';
import './Staff.css';

const ROLES = [
  { value: 'manager', label: 'Manager' },
  { value: 'trainer', label: 'Trainer' },
  { value: 'receptionist', label: 'Receptionist' },
];

const PERMISSION_DESCRIPTIONS = {
  manager: ['Add members', 'Edit members', 'Delete members', 'View analytics', 'View payments', 'Mark attendance'],
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
    // Trainer-specific fields
    age: '',
    qualification: '',
    specialization: '',
    experience_years: '',
    certificate_photo: '',
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [duplicate, setDuplicate] = useState(null);
  const [uploadingCert, setUploadingCert] = useState(false);

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

  const handleCertUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingCert(true);
    try {
      const ts = Date.now();
      const storageRef = ref(storage, `gyms/${userDoc.gym_id}/certificates/${ts}_${file.name}`);
      const compressed = await compressImage(file, 1200, 0.90);
      await uploadBytes(storageRef, compressed, { contentType: 'image/webp', cacheControl: 'public,max-age=31536000' });
      const url = await getDownloadURL(storageRef);
      update('certificate_photo', url);
      showToast('Certificate uploaded', 'success');
    } catch (err) {
      showToast('Upload failed', 'error');
    } finally {
      setUploadingCert(false);
      e.target.value = '';
    }
  };

  const validate = () => {
    const newErrors = {};
    if (!form.name.trim() || form.name.trim().length < 2) newErrors.name = 'Name required';
    if (!form.phone.trim() || form.phone.replace(/\s/g, '').length !== 10) newErrors.phone = 'Enter valid phone';
    if (!form.role) newErrors.role = 'Select a role';
    if (form.role === 'trainer') {
      if (!form.age || isNaN(form.age)) newErrors.age = 'Enter valid age';
      if (!form.qualification.trim()) newErrors.qualification = 'Qualification required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);

    try {
      const fullPhone = `${form.countryCode}${form.phone.replace(/\s/g, '')}`;
      const staffData = {
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
      };

      // Add trainer-specific fields
      if (form.role === 'trainer') {
        staffData.age = Number(form.age);
        staffData.qualification = form.qualification.trim();
        staffData.specialization = form.specialization.trim();
        staffData.experience_years = form.experience_years ? Number(form.experience_years) : null;
        staffData.certificate_photo = form.certificate_photo || null;
      }

      await createStaffMember(staffData);

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
            <label className="input-label">Staff name *</label>
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
            <label className="input-label">Phone number *</label>
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
            <label className="input-label">Role *</label>
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

          {/* Trainer-specific fields */}
          {form.role === 'trainer' && (
            <div style={{ marginTop: 8, borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary)', marginBottom: 14 }}>
                🏋️ Trainer Details
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="input-group">
                  <label className="input-label">Age *</label>
                  <input
                    type="number"
                    className={`input-field ${errors.age ? 'error' : ''}`}
                    placeholder="25"
                    value={form.age}
                    onChange={(e) => update('age', e.target.value)}
                  />
                  {errors.age && <p className="input-error">{errors.age}</p>}
                </div>
                <div className="input-group">
                  <label className="input-label">Experience (yrs)</label>
                  <input
                    type="number"
                    className="input-field"
                    placeholder="3"
                    value={form.experience_years}
                    onChange={(e) => update('experience_years', e.target.value)}
                  />
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">Qualification *</label>
                <input
                  type="text"
                  className={`input-field ${errors.qualification ? 'error' : ''}`}
                  placeholder="E.g. Certified Personal Trainer"
                  value={form.qualification}
                  onChange={(e) => update('qualification', e.target.value)}
                />
                {errors.qualification && <p className="input-error">{errors.qualification}</p>}
              </div>

              <div className="input-group">
                <label className="input-label">Specialization</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="E.g. Strength & Conditioning"
                  value={form.specialization}
                  onChange={(e) => update('specialization', e.target.value)}
                />
              </div>

              <div className="input-group">
                <label className="input-label">Certificate Photo</label>
                {form.certificate_photo ? (
                  <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', height: 140 }}>
                    <img src={form.certificate_photo} alt="Certificate" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button
                      onClick={() => update('certificate_photo', '')}
                      style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', borderRadius: '50%', width: 26, height: 26, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}
                    >✕</button>
                  </div>
                ) : (
                  <label className="btn-ghost" style={{ display: 'block', textAlign: 'center', cursor: 'pointer', padding: '16px 0' }}>
                    {uploadingCert ? 'Uploading...' : '📄 Upload Certificate'}
                    <input type="file" hidden accept="image/*" onChange={handleCertUpload} disabled={uploadingCert} />
                  </label>
                )}
              </div>
            </div>
          )}

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
