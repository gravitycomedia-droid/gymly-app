import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { getUser, updateMember, getTrainers } from '../../../firebase/firestore';
import { calculateBMI, capPhoneDigits } from '../../../utils/helpers';
import { uploadMemberPhoto } from '../../../firebase/storage';
import { Field } from '../../components/Wizard';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GOALS = ['Fat loss', 'Muscle gain', 'Endurance', 'General fitness'];
const EXPERIENCE_LEVELS = ['Beginner', 'Intermediate', 'Advanced'];
const LIFESTYLES = ['Sedentary', 'Lightly active', 'Very active'];
const DIET_OPTIONS = ['Veg', 'Non-veg', 'Vegan', 'Keto', 'Other'];
const GENDERS = ['Male', 'Female', 'Other'];

export default function EditMember() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  const { showToast } = useToast();

  const [member, setMember] = useState(null);
  const [trainers, setTrainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const photoInputRef = useRef(null);

  const [form, setForm] = useState({
    name: '', dob: '', gender: '', bloodGroup: '', address: '', emergencyContact: '',
    height: '', weight: '', goal: '', experience: '', lifestyle: '', diet: '', medicalNotes: '', trainerId: '',
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [memberDoc, trainerList] = await Promise.all([
          getUser(id),
          userDoc?.gym_id ? getTrainers(userDoc.gym_id) : [],
        ]);
        if (memberDoc) {
          setMember(memberDoc);
          setPhotoPreview(memberDoc.profile_photo || null);
          setForm({
            name: memberDoc.name || '', dob: memberDoc.date_of_birth || '', gender: memberDoc.gender || '',
            bloodGroup: memberDoc.blood_group || '', address: memberDoc.address || '', emergencyContact: memberDoc.emergency_contact || '',
            height: memberDoc.height ? String(memberDoc.height) : '', weight: memberDoc.weight ? String(memberDoc.weight) : '',
            goal: memberDoc.goal || '', experience: memberDoc.experience || '', lifestyle: memberDoc.lifestyle || '',
            diet: memberDoc.diet || '', medicalNotes: memberDoc.medical_notes || '', trainerId: memberDoc.assigned_trainer_id || '',
          });
        }
        setTrainers(trainerList);
      } catch (err) {
        console.error('Error:', err);
        showToast('Failed to load member', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, userDoc?.gym_id]);

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));
  const bmi = calculateBMI(Number(form.height), Number(form.weight));

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    if (!form.name.trim() || form.name.trim().length < 2) {
      showToast('Name must be at least 2 characters', 'error');
      return;
    }
    setSaving(true);
    try {
      const changes = {};
      if (form.name.trim() !== member.name) changes.name = form.name.trim();
      if (form.dob !== (member.date_of_birth || '')) changes.date_of_birth = form.dob || null;
      if (form.gender !== (member.gender || '')) changes.gender = form.gender || null;
      if (form.bloodGroup !== (member.blood_group || '')) changes.blood_group = form.bloodGroup || null;
      if (form.address !== (member.address || '')) changes.address = form.address || null;
      if (form.emergencyContact !== (member.emergency_contact || '')) changes.emergency_contact = form.emergencyContact || null;
      if (form.height !== String(member.height || '')) changes.height = form.height ? Number(form.height) : null;
      if (form.weight !== String(member.weight || '')) changes.weight = form.weight ? Number(form.weight) : null;
      if (form.goal !== (member.goal || '')) changes.goal = form.goal || null;
      if (form.experience !== (member.experience || '')) changes.experience = form.experience || null;
      if (form.lifestyle !== (member.lifestyle || '')) changes.lifestyle = form.lifestyle || null;
      if (form.diet !== (member.diet || '')) changes.diet = form.diet || null;
      if (form.medicalNotes !== (member.medical_notes || '')) changes.medical_notes = form.medicalNotes || null;
      if (form.trainerId !== (member.assigned_trainer_id || '')) changes.assigned_trainer_id = form.trainerId || null;

      if (photoFile && userDoc?.gym_id) {
        try {
          changes.profile_photo = await uploadMemberPhoto(userDoc.gym_id, id, photoFile);
        } catch (photoErr) {
          console.error('Photo upload error:', photoErr);
          showToast('Photo upload failed — other changes saved', 'error');
        }
      }

      if (Object.keys(changes).length === 0) {
        showToast('No changes to save', 'error');
        setSaving(false);
        return;
      }

      await updateMember(id, changes);
      showToast('Profile updated', 'success');
      navigate(-1);
    } catch (err) {
      console.error('Update error:', err);
      showToast('Failed to update profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}><div className="spinner spinner-primary" style={{ width: 32, height: 32 }} /></div>;
  }

  return (
    <section data-screen-label="Edit member">
      <button type="button" className="gl2-back-link" onClick={() => navigate(-1)}>
        <span className="material-symbols-outlined" style={{ fontSize: 17 }}>arrow_back_ios</span>Cancel
      </button>
      <div className="gl2-page-header">
        <h1 className="gl2-page-title">Edit member</h1>
        <button type="button" className="gl2-btn gl2-btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
      </div>

      <div className="gl2-wizard-card" style={{ maxWidth: 640 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <button type="button" onClick={() => photoInputRef.current?.click()} style={{ width: 88, height: 88, borderRadius: 44, overflow: 'hidden', border: '3px solid #fff', boxShadow: '0 4px 16px rgba(0,0,0,.12)', background: 'var(--gl2-primary-tint)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {photoPreview ? <img src={photoPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--gl2-primary)' }}>add_a_photo</span>}
          </button>
          <input ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Full name" required>
            <input className="gl2-input" value={form.name} onChange={(e) => update('name', e.target.value)} />
          </Field>

          <p className="gl2-eyebrow" style={{ marginTop: 6 }}>Personal details</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Date of birth"><input className="gl2-input" type="date" value={form.dob} onChange={(e) => update('dob', e.target.value)} /></Field>
            <Field label="Blood group">
              <select className="gl2-select" value={form.bloodGroup} onChange={(e) => update('bloodGroup', e.target.value)}>
                <option value="">Select</option>
                {BLOOD_GROUPS.map((bg) => <option key={bg} value={bg}>{bg}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Gender">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {GENDERS.map((g) => <button key={g} type="button" className={`gl2-filter-chip ${form.gender === g.toLowerCase() ? 'active' : ''}`} onClick={() => update('gender', g.toLowerCase())}>{g}</button>)}
            </div>
          </Field>
          <Field label="Address"><input className="gl2-input" value={form.address} onChange={(e) => update('address', e.target.value)} /></Field>
          <Field label="Emergency contact"><input className="gl2-input" type="tel" inputMode="numeric" maxLength={10} value={form.emergencyContact} onChange={(e) => update('emergencyContact', capPhoneDigits(e.target.value))} /></Field>

          <p className="gl2-eyebrow" style={{ marginTop: 6 }}>Fitness profile</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Height (cm)"><input className="gl2-input" type="number" value={form.height} onChange={(e) => update('height', e.target.value)} /></Field>
            <Field label="Weight (kg)"><input className="gl2-input" type="number" value={form.weight} onChange={(e) => update('weight', e.target.value)} /></Field>
          </div>
          {bmi && <div style={{ padding: 11, borderRadius: 10, border: `1px solid ${bmi.color}`, background: `${bmi.color}15`, color: bmi.color, fontWeight: 700, fontSize: 14 }}>BMI: {bmi.value} — {bmi.category}</div>}
          <Field label="Goal">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {GOALS.map((g) => <button key={g} type="button" className={`gl2-filter-chip ${form.goal === g ? 'active' : ''}`} onClick={() => update('goal', g)}>{g}</button>)}
            </div>
          </Field>
          <Field label="Experience level">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {EXPERIENCE_LEVELS.map((e) => <button key={e} type="button" className={`gl2-filter-chip ${form.experience === e ? 'active' : ''}`} onClick={() => update('experience', e)}>{e}</button>)}
            </div>
          </Field>
          <Field label="Lifestyle">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {LIFESTYLES.map((l) => <button key={l} type="button" className={`gl2-filter-chip ${form.lifestyle === l ? 'active' : ''}`} onClick={() => update('lifestyle', l)}>{l}</button>)}
            </div>
          </Field>

          <p className="gl2-eyebrow" style={{ marginTop: 6 }}>Diet & medical</p>
          <Field label="Diet preference">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {DIET_OPTIONS.map((d) => <button key={d} type="button" className={`gl2-filter-chip ${form.diet === d ? 'active' : ''}`} onClick={() => update('diet', d)}>{d}</button>)}
            </div>
          </Field>
          <Field label="Medical notes">
            <textarea className="gl2-input" style={{ minHeight: 80, padding: 11, resize: 'vertical' }} value={form.medicalNotes} onChange={(e) => update('medicalNotes', e.target.value.slice(0, 300))} />
            <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--gl2-muted)' }}>{form.medicalNotes.length}/300</div>
          </Field>

          <p className="gl2-eyebrow" style={{ marginTop: 6 }}>Trainer</p>
          <select className="gl2-select" value={form.trainerId} onChange={(e) => update('trainerId', e.target.value)}>
            <option value="">No trainer</option>
            {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>
    </section>
  );
}
