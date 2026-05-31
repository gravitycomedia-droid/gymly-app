import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { updateDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase/config';

const EditProfile = () => {
  const navigate = useNavigate();
  const { user, userDoc } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    goal: '',
    experience: '',
    height: '',
    weight: '',
    blood_group: '',
    gender: '',
    date_of_birth: '',
    address: '',
    emergency_contact: '',
  });

  useEffect(() => {
    if (userDoc) {
      setFormData({
        name: userDoc.name || '',
        goal: userDoc.goal || '',
        experience: userDoc.experience || '',
        height: userDoc.height || '',
        weight: userDoc.weight || '',
        blood_group: userDoc.blood_group || '',
        gender: userDoc.gender || '',
        date_of_birth: userDoc.date_of_birth || '',
        address: userDoc.address || '',
        emergency_contact: userDoc.emergency_contact || '',
      });
    }
  }, [userDoc]);

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user?.uid) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), formData);
      showToast('Profile updated successfully', 'success');
      navigate(-1);
    } catch (err) {
      console.error(err);
      showToast('Failed to update profile', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen member-profile-screen">
      <div className="screen-content">
        <div className="top-bar">
          <button className="back-btn" type="button" onClick={() => navigate(-1)}>← Back</button>
          <h1 className="top-bar-title">Edit Profile</h1>
          <div style={{ width: 60 }} />
        </div>

        <form onSubmit={handleSubmit} style={{ marginTop: 20, paddingBottom: 40 }}>
          <div className="input-group">
            <label className="input-label">Full Name</label>
            <input 
              type="text" 
              className="input-field" 
              name="name" 
              value={formData.name} 
              onChange={handleChange} 
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="input-group">
              <label className="input-label">Gender</label>
              <select className="input-field" name="gender" value={formData.gender} onChange={handleChange}>
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Date of Birth</label>
              <input 
                type="date" 
                className="input-field" 
                name="date_of_birth" 
                value={formData.date_of_birth} 
                onChange={handleChange} 
              />
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Fitness Goal</label>
            <select className="input-field" name="goal" value={formData.goal} onChange={handleChange}>
              <option value="">Select a goal</option>
              <option value="Weight Loss">Weight Loss</option>
              <option value="Muscle Gain">Muscle Gain</option>
              <option value="Maintenance">Maintenance</option>
              <option value="Strength">Strength</option>
              <option value="Endurance">Endurance</option>
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="input-group">
              <label className="input-label">Height (cm)</label>
              <input 
                type="number" 
                className="input-field" 
                name="height" 
                placeholder="cm" 
                value={formData.height} 
                onChange={handleChange} 
              />
            </div>
            <div className="input-group">
              <label className="input-label">Weight (kg)</label>
              <input 
                type="number" 
                className="input-field" 
                name="weight" 
                placeholder="kg" 
                value={formData.weight} 
                onChange={handleChange} 
              />
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Experience Level</label>
            <select className="input-field" name="experience" value={formData.experience} onChange={handleChange}>
              <option value="">Select level</option>
              <option value="Beginner">Beginner</option>
              <option value="Intermediate">Intermediate</option>
              <option value="Advanced">Advanced</option>
            </select>
          </div>

          <div className="input-group">
            <label className="input-label">Blood Group</label>
            <select className="input-field" name="blood_group" value={formData.blood_group} onChange={handleChange}>
              <option value="">Select group</option>
              <option value="A+">A+</option>
              <option value="A-">A-</option>
              <option value="B+">B+</option>
              <option value="B-">B-</option>
              <option value="O+">O+</option>
              <option value="O-">O-</option>
              <option value="AB+">AB+</option>
              <option value="AB-">AB-</option>
            </select>
          </div>

          <div className="input-group">
            <label className="input-label">Address</label>
            <textarea 
              className="input-field" 
              name="address" 
              rows="2"
              value={formData.address} 
              onChange={handleChange} 
              style={{ padding: '12px' }}
            />
          </div>

          <div className="input-group">
            <label className="input-label">Emergency Contact</label>
            <input 
              type="tel" 
              className="input-field" 
              name="emergency_contact" 
              placeholder="Phone number" 
              value={formData.emergency_contact} 
              onChange={handleChange} 
            />
          </div>

          <button 
            type="submit" 
            className="btn-primary" 
            style={{ width: '100%', marginTop: 12, padding: 16 }}
            disabled={loading}
          >
            {loading ? <div className="spinner" /> : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default EditProfile;
