import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getUser, getGym, updateMember, getTrainers } from '../../firebase/firestore';
import { calculateBMI } from '../../utils/helpers';
import './AddMember.css';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GOALS = ['Fat loss', 'Muscle gain', 'Endurance', 'General fitness'];
const EXPERIENCE_LEVELS = ['Beginner', 'Intermediate', 'Advanced'];
const LIFESTYLES = ['Sedentary', 'Lightly active', 'Very active'];
const DIET_OPTIONS = ['Veg', 'Non-veg', 'Vegan', 'Keto', 'Other'];
const GENDERS = ['Male', 'Female', 'Other'];

const EditMember = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  const { showToast } = useToast();

  const [member, setMember] = useState(null);
  const [trainers, setTrainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '', dob: '', gender: '', bloodGroup: '', address: '',
    emergencyContact: '', height: '', weight: '', goal: '',
    experience: '', lifestyle: '', diet: '', medicalNotes: '', trainerId: '',
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
          setForm({
            name: memberDoc.name || '',
            dob: memberDoc.date_of_birth || '',
            gender: memberDoc.gender || '',
            bloodGroup: memberDoc.blood_group || '',
            address: memberDoc.address || '',
            emergencyContact: memberDoc.emergency_contact || '',
            height: memberDoc.height ? String(memberDoc.height) : '',
            weight: memberDoc.weight ? String(memberDoc.weight) : '',
            goal: memberDoc.goal || '',
            experience: memberDoc.experience || '',
            lifestyle: memberDoc.lifestyle || '',
            diet: memberDoc.diet || '',
            medicalNotes: memberDoc.medical_notes || '',
            trainerId: memberDoc.assigned_trainer_id || '',
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
  }, [id, userDoc?.gym_id]);

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const bmi = calculateBMI(Number(form.height), Number(form.weight));

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
    return (
      <div className="screen add-member-screen">
        <div className="screen-content spinner-center">
          <div className="spinner spinner-primary" style={{ width: 32, height: 32 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="screen add-member-screen">
      <div className="screen-content">
        <div className="top-bar">
          <button className="back-btn" onClick={() => navigate(-1)} style={{ marginBottom: 0 }}>← Back</button>
          <h1 className="top-bar-title">Edit profile</h1>
          <button
            className="top-bar-action"
            onClick={handleSave}
            disabled={saving}
            id="save-btn"
            style={{ padding: '8px 16px' }}
          >
            {saving ? '...' : 'Save'}
          </button>
        </div>

        <div className="glass-card" style={{ padding: '20px 18px' }}>
          <div className="input-group">
            <label className="input-label">Name</label>
            <input type="text" className="input-field" value={form.name} onChange={(e) => update('name', e.target.value)} />
          </div>

          <div className="section-header">
            <span className="section-header-text">Personal details</span>
            <div className="section-header-line" />
          </div>

          <div className="input-group">
            <label className="input-label">Date of birth</label>
            <input type="date" className="input-field" value={form.dob} onChange={(e) => update('dob', e.target.value)} />
          </div>

          <div className="input-group">
            <label className="input-label">Gender</label>
            <div className="pill-group">
              {GENDERS.map((g) => (
                <button key={g} className={`pill-option ${form.gender === g.toLowerCase() ? 'selected' : ''}`} onClick={() => update('gender', g.toLowerCase())} type="button">{g}</button>
              ))}
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Blood group</label>
            <select className="input-field" value={form.bloodGroup} onChange={(e) => update('bloodGroup', e.target.value)}>
              <option value="">Select</option>
              {BLOOD_GROUPS.map((bg) => (<option key={bg} value={bg}>{bg}</option>))}
            </select>
          </div>

          <div className="input-group">
            <label className="input-label">Address</label>
            <input type="text" className="input-field" value={form.address} onChange={(e) => update('address', e.target.value)} />
          </div>

          <div className="input-group">
            <label className="input-label">Emergency contact</label>
            <input type="tel" className="input-field" value={form.emergencyContact} onChange={(e) => update('emergencyContact', e.target.value)} />
          </div>

          <div className="section-header">
            <span className="section-header-text">Fitness profile</span>
            <div className="section-header-line" />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div className="input-group" style={{ flex: 1 }}>
              <label className="input-label">Height</label>
              <div style={{ position: 'relative' }}>
                <input type="number" className="input-field" value={form.height} onChange={(e) => update('height', e.target.value)} />
                <span className="unit-label">cm</span>
              </div>
            </div>
            <div className="input-group" style={{ flex: 1 }}>
              <label className="input-label">Weight</label>
              <div style={{ position: 'relative' }}>
                <input type="number" className="input-field" value={form.weight} onChange={(e) => update('weight', e.target.value)} />
                <span className="unit-label">kg</span>
              </div>
            </div>
          </div>

          {bmi && <div className="bmi-chip" style={{ borderColor: bmi.color, color: bmi.color }}>BMI: {bmi.value} — {bmi.category}</div>}

          <div className="input-group">
            <label className="input-label">Goal</label>
            <div className="pill-group">
              {GOALS.map((g) => (<button key={g} className={`pill-option ${form.goal === g ? 'selected' : ''}`} onClick={() => update('goal', g)} type="button">{g}</button>))}
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Experience level</label>
            <div className="pill-group">
              {EXPERIENCE_LEVELS.map((e) => (<button key={e} className={`pill-option ${form.experience === e ? 'selected' : ''}`} onClick={() => update('experience', e)} type="button">{e}</button>))}
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Lifestyle</label>
            <div className="pill-group">
              {LIFESTYLES.map((l) => (<button key={l} className={`pill-option ${form.lifestyle === l ? 'selected' : ''}`} onClick={() => update('lifestyle', l)} type="button">{l}</button>))}
            </div>
          </div>

          <div className="section-header">
            <span className="section-header-text">Diet & Medical</span>
            <div className="section-header-line" />
          </div>

          <div className="input-group">
            <label className="input-label">Diet preference</label>
            <div className="pill-group">
              {DIET_OPTIONS.map((d) => (<button key={d} className={`pill-option ${form.diet === d ? 'selected' : ''}`} onClick={() => update('diet', d)} type="button">{d}</button>))}
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Medical notes</label>
            <textarea className="input-field" value={form.medicalNotes} onChange={(e) => update('medicalNotes', e.target.value.slice(0, 300))} rows={3} style={{ resize: 'none' }} />
            <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{form.medicalNotes.length}/300</div>
          </div>

          <div className="section-header">
            <span className="section-header-text">Trainer</span>
            <div className="section-header-line" />
          </div>

          <div className="input-group">
            <select className="input-field" value={form.trainerId} onChange={(e) => update('trainerId', e.target.value)}>
              <option value="">No trainer</option>
              {trainers.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditMember;
