import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { createStaffMember, getMemberByPhone } from '../../../firebase/firestore';
import { storage } from '../../../firebase/config';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { compressImage } from '../../../firebase/storage';
import { ROLE_PERMISSIONS } from '../../../utils/permissions';
import { capPhoneDigits } from '../../../utils/helpers';
import { Field } from '../../components/Wizard';

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

export default function AddStaff() {
  const navigate = useNavigate();
  const { user, userDoc } = useAuth();
  const { showToast } = useToast();

  const [form, setForm] = useState({
    name: '', countryCode: '+91', phone: '', role: '',
    age: '', qualification: '', specialization: '', experience_years: '', certificate_photo: '',
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [duplicate, setDuplicate] = useState(null);
  const [uploadingCert, setUploadingCert] = useState(false);

  const update = (field, value) => { setForm((prev) => ({ ...prev, [field]: value })); setErrors((prev) => ({ ...prev, [field]: '' })); };

  const handlePhoneBlur = async () => {
    const phone = `${form.countryCode}${form.phone.replace(/\s/g, '')}`;
    if (form.phone.length < 10 || !userDoc?.gym_id) return;
    try { setDuplicate(await getMemberByPhone(userDoc.gym_id, phone)); } catch (err) { console.error(err); }
  };

  const handleCertUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingCert(true);
    try {
      const storageRef = ref(storage, `gyms/${userDoc.gym_id}/certificates/${Date.now()}_${file.name}`);
      const compressed = await compressImage(file, 1200, 0.9);
      await uploadBytes(storageRef, compressed, { contentType: 'image/webp', cacheControl: 'public,max-age=31536000' });
      update('certificate_photo', await getDownloadURL(storageRef));
      showToast('Certificate uploaded', 'success');
    } catch (err) {
      console.error('Certificate upload error:', err);
      showToast('Upload failed', 'error');
    } finally {
      setUploadingCert(false);
      e.target.value = '';
    }
  };

  const validate = () => {
    const next = {};
    if (!form.name.trim() || form.name.trim().length < 2) next.name = 'Name required.';
    if (!form.phone.trim() || form.phone.replace(/\s/g, '').length !== 10) next.phone = 'Enter a valid 10-digit number.';
    if (!form.role) next.role = 'Select a role.';
    if (form.role === 'trainer') {
      if (!form.age || Number.isNaN(Number(form.age))) next.age = 'Enter a valid age.';
      if (!form.qualification.trim()) next.qualification = 'Qualification required.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const fullPhone = `${form.countryCode}${form.phone.replace(/\s/g, '')}`;
      const staffData = {
        name: form.name.trim(), phone: fullPhone, role: form.role, gym_id: userDoc.gym_id,
        permissions: ROLE_PERMISSIONS[form.role], created_by: user.uid, profile_photo: null,
        subscription_expiry: null, payment_status: null, plan_id: null, start_date: null,
        height: null, weight: null, goal: null, experience: null, medical_notes: null,
        assigned_trainer_id: null, attendance_count: 0, last_seen: null, renewal_history: [],
      };
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
    <section data-screen-label="Add staff">
      <button type="button" className="gl2-back-link" onClick={() => navigate(-1)}>
        <span className="material-symbols-outlined" style={{ fontSize: 17 }}>arrow_back_ios</span>Cancel
      </button>
      <h1 className="gl2-page-title" style={{ marginBottom: 14 }}>Add staff member</h1>

      <div className="gl2-wizard-card">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Staff name" required error={errors.name}>
            <input className={`gl2-input ${errors.name ? 'err' : ''}`} placeholder="Full name" value={form.name} onChange={(e) => update('name', e.target.value)} />
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
          </Field>

          {duplicate && (
            <div style={{ padding: 12, borderRadius: 11, background: 'var(--gl2-warning-bg)', fontSize: 13 }}>
              This number belongs to <strong>{duplicate.name}</strong> ({duplicate.role}). Adding as staff will change their role.
            </div>
          )}

          <Field label="Role" required error={errors.role}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ROLES.map((r) => <button key={r.value} type="button" className={`gl2-filter-chip ${form.role === r.value ? 'active' : ''}`} onClick={() => update('role', r.value)}>{r.label}</button>)}
            </div>
          </Field>

          {form.role === 'trainer' && (
            <>
              <p className="gl2-eyebrow" style={{ marginTop: 4 }}>Trainer details</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="Age" required error={errors.age}>
                  <input className={`gl2-input ${errors.age ? 'err' : ''}`} type="number" placeholder="25" value={form.age} onChange={(e) => update('age', e.target.value)} />
                </Field>
                <Field label="Experience (yrs)">
                  <input className="gl2-input" type="number" placeholder="3" value={form.experience_years} onChange={(e) => update('experience_years', e.target.value)} />
                </Field>
              </div>
              <Field label="Qualification" required error={errors.qualification}>
                <input className={`gl2-input ${errors.qualification ? 'err' : ''}`} placeholder="e.g. Certified Personal Trainer" value={form.qualification} onChange={(e) => update('qualification', e.target.value)} />
              </Field>
              <Field label="Specialization">
                <input className="gl2-input" placeholder="e.g. Strength & Conditioning" value={form.specialization} onChange={(e) => update('specialization', e.target.value)} />
              </Field>
              <Field label="Certificate photo">
                {form.certificate_photo ? (
                  <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', height: 140 }}>
                    <img src={form.certificate_photo} alt="Certificate" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button type="button" onClick={() => update('certificate_photo', '')} style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,.5)', color: '#fff', border: 0, borderRadius: '50%', width: 26, height: 26, cursor: 'pointer' }}>✕</button>
                  </div>
                ) : (
                  <label className="gl2-btn gl2-btn-secondary" style={{ justifyContent: 'center', cursor: 'pointer' }}>
                    {uploadingCert ? 'Uploading…' : '📄 Upload certificate'}
                    <input type="file" hidden accept="image/*" onChange={handleCertUpload} disabled={uploadingCert} />
                  </label>
                )}
              </Field>
            </>
          )}

          {form.role && (
            <div style={{ padding: 13, borderRadius: 11, background: 'var(--gl2-primary-tint)' }}>
              <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 800, color: 'var(--gl2-primary-deep)' }}>This role can:</p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: 'var(--gl2-text)' }}>
                {PERMISSION_DESCRIPTIONS[form.role]?.map((perm) => <li key={perm}>{perm}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>

      <button type="button" className="gl2-btn gl2-btn-primary gl2-btn-lg" style={{ width: '100%', maxWidth: 640, marginTop: 14 }} onClick={handleSubmit} disabled={loading}>
        {loading ? 'Adding…' : 'Add staff'}
      </button>
    </section>
  );
}
