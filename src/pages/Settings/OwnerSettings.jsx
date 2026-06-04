import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getGym, updateGym } from '../../firebase/firestore';
import { storage } from '../../firebase/config';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { logout } from '../../firebase/auth';
import { getInitials } from '../../utils/helpers';
import BottomNav from '../../components/BottomNav';
import './Settings.css';

const PLAN_COLORS = ['var(--primary)', '#1D9E75', '#EF9F27', 'var(--error)', '#378ADD', '#9333ea', '#f97316'];

const emptyPlan = () => ({
  id: `plan_${Date.now()}`,
  name: '',
  price: '',
  duration_days: 30,
  description: '',
  color: 'var(--primary)',
  is_active: true,
});

// ── Edit Sheet Wrapper ──
const EditSheet = ({ title, onClose, children }) => (
  <div className="settings-edit-overlay" onClick={onClose}>
    <div className="settings-edit-sheet glass-card" onClick={e => e.stopPropagation()}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingTop: 4 }}>
        <div className="sheet-handle" style={{ position: 'static', marginBottom: 0 }} />
        <h2 className="settings-edit-title" style={{ marginBottom: 0, flex: 1, textAlign: 'center' }}>{title}</h2>
        <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
      </div>
      {children}
    </div>
  </div>
);

const OwnerSettings = () => {
  const navigate = useNavigate();
  const { user, userDoc } = useAuth();
  const { showToast } = useToast();

  const [gym, setGym] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Active editing sheet
  const [activeSheet, setActiveSheet] = useState(null);

  // Gym info form
  const [gymInfo, setGymInfo] = useState({
    name: '', phone: '', email: '', address: '', city: '', website: '',
    description: '',
  });

  // Working hours form
  const [hours, setHours] = useState({ open: '06:00', close: '22:00' });

  // Plans & Tax
  const [plans, setPlans] = useState([]);
  const [editingPlan, setEditingPlan] = useState(null);
  const [taxConfig, setTaxConfig] = useState({ enabled: false, rate: 0 });

  // Social links
  const [social, setSocial] = useState({ instagram: '', facebook: '', google_maps: '' });

  // Landing Page
  const [landingConfig, setLandingConfig] = useState({ isPublished: false, facilities: [] });

  // Messaging Config
  const [messagingConfig, setMessagingConfig] = useState({
    welcome_messages: true,
    expiry_alerts: true,
    payment_confirmations: true,
    equipment_alerts: true,
    inactivity_alerts: false,
  });

  // Equipment
  const [equipment, setEquipment] = useState([]);
  const [editingEquipment, setEditingEquipment] = useState(null);
  const [uploadingEquipImg, setUploadingEquipImg] = useState(false);

  // Member Experience
  const [requireAgreement, setRequireAgreement] = useState(true);
  const [workoutEnabled, setWorkoutEnabled] = useState(false); // default: locked

  // Gallery
  const [photos, setPhotos] = useState([]);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Coupon activation
  const [couponCode, setCouponCode] = useState('');
  const [couponSaving, setCouponSaving] = useState(false);
  const [activeSubInfo, setActiveSubInfo] = useState(null);

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    getGym(userDoc.gym_id).then(g => {
      if (!g) return;
      setGym(g);
      setGymInfo({
        name: g.name || '',
        phone: g.phone || '',
        email: g.email || '',
        address: g.address || '',
        city: g.city || '',
        website: g.website || '',
        description: g.description || '',
      });
      setHours({
        open: g.working_hours?.open || '06:00',
        close: g.working_hours?.close || '22:00',
      });
      setPlans(g.settings?.plans || []);
      setTaxConfig({
        enabled: g.settings?.taxEnabled || false,
        rate: g.settings?.taxRate || 0
      });
      setSocial(g.social || { instagram: '', facebook: '', google_maps: '' });
      setLandingConfig({
        isPublished: g.landingConfig?.isPublished || false,
        facilities: g.landingConfig?.facilities || []
      });
      setMessagingConfig(g.messaging_config || {
        welcome_messages: true,
        expiry_alerts: true,
        payment_confirmations: true,
        equipment_alerts: true,
        inactivity_alerts: false,
      });
      setEquipment(g.equipment || []);
      setPhotos(g.photos || []);
      setRequireAgreement(g.settings?.require_agreement !== false); // default true
      setWorkoutEnabled(g.settings?.workout_enabled === true); // default false (locked)
      // Load existing coupon subscription info
      if (g.subscription_valid_until) {
        const until = g.subscription_valid_until?.toDate ? g.subscription_valid_until.toDate() : new Date(g.subscription_valid_until);
        setActiveSubInfo({ validUntil: until, label: g.subscription_coupon_label || 'Active' });
      }
      setLoading(false);
    });
  }, [userDoc?.gym_id]);

  // ── Save gym info ──
  const saveGymInfo = async () => {
    setSaving(true);
    try {
      await updateGym(userDoc.gym_id, gymInfo);
      setGym(prev => ({ ...prev, ...gymInfo }));
      showToast('Gym details updated!', 'success');
      setActiveSheet(null);
    } catch (e) {
      showToast('Failed to save: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Save hours ──
  const saveHours = async () => {
    setSaving(true);
    try {
      await updateGym(userDoc.gym_id, { working_hours: hours });
      setGym(prev => ({ ...prev, working_hours: hours }));
      showToast('Working hours updated!', 'success');
      setActiveSheet(null);
    } catch (e) {
      showToast('Failed to save: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Save plans ──
  const savePlans = async (updatedPlans) => {
    setSaving(true);
    try {
      await updateGym(userDoc.gym_id, { 'settings.plans': updatedPlans });
      setPlans(updatedPlans);
      showToast('Plans updated!', 'success');
    } catch (e) {
      showToast('Failed to save: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePlan = () => {
    if (!editingPlan?.name || !editingPlan?.price) {
      showToast('Plan name and price are required', 'error'); return;
    }
    const exists = plans.find(p => p.id === editingPlan.id);
    const updated = exists
      ? plans.map(p => p.id === editingPlan.id ? editingPlan : p)
      : [...plans, editingPlan];
    savePlans(updated);
    setEditingPlan(null);
    setActiveSheet(null);
  };

  const handleDeletePlan = (planId) => {
    const updated = plans.filter(p => p.id !== planId);
    savePlans(updated);
  };

  const handleTogglePlan = (planId) => {
    const updated = plans.map(p => p.id === planId ? { ...p, is_active: !p.is_active } : p);
    savePlans(updated);
  };

  // ── Save Tax ──
  const saveTaxConfig = async () => {
    setSaving(true);
    try {
      await updateGym(userDoc.gym_id, { 
        'settings.taxEnabled': taxConfig.enabled,
        'settings.taxRate': Number(taxConfig.rate)
      });
      setGym(prev => ({ 
        ...prev, 
        settings: { ...prev.settings, taxEnabled: taxConfig.enabled, taxRate: Number(taxConfig.rate) } 
      }));
      showToast('Tax settings updated!', 'success');
      setActiveSheet(null);
    } catch (e) {
      showToast('Failed to save tax: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Save social ──
  const saveSocial = async () => {
    setSaving(true);
    try {
      await updateGym(userDoc.gym_id, { social });
      setGym(prev => ({ ...prev, social }));
      showToast('Social links updated!', 'success');
      setActiveSheet(null);
    } catch (e) {
      showToast('Failed to save: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Save landing config ──
  const saveLandingConfig = async () => {
    setSaving(true);
    try {
      await updateGym(userDoc.gym_id, { landingConfig });
      setGym(prev => ({ ...prev, landingConfig }));
      showToast('Landing page settings updated!', 'success');
      setActiveSheet(null);
    } catch (e) {
      showToast('Failed to save: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Save messaging config ──
  const saveMessagingConfig = async () => {
    setSaving(true);
    try {
      await updateGym(userDoc.gym_id, { messaging_config: messagingConfig });
      setGym(prev => ({ ...prev, messaging_config: messagingConfig }));
      showToast('Messaging settings updated!', 'success');
      setActiveSheet(null);
    } catch (e) {
      showToast('Failed to save: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Photos / Gallery ──
  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const ts = Date.now();
      const storageRef = ref(storage, `gyms/${userDoc.gym_id}/photos/${ts}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      
      const newPhotos = [...photos, { id: ts.toString(), url }];
      await updateGym(userDoc.gym_id, { photos: newPhotos });
      setPhotos(newPhotos);
      showToast('Photo uploaded successfully', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to upload photo', 'error');
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  const handlePhotoDelete = async (photoId, url) => {
    if (!window.confirm('Delete this photo?')) return;
    try {
      if (url.includes('firebase')) {
        const fileRef = ref(storage, url);
        try { await deleteObject(fileRef); } catch (e) { console.log('File missing', e); }
      }
      const newPhotos = photos.filter(p => p.id !== photoId);
      await updateGym(userDoc.gym_id, { photos: newPhotos });
      setPhotos(newPhotos);
      showToast('Photo deleted', 'success');
    } catch (err) {
      showToast('Failed to delete', 'error');
    }
  };

  // ── Activate Coupon ──
  const handleActivateCoupon = async () => {
    if (!couponCode.trim()) {
      showToast('Enter a coupon code', 'error'); return;
    }
    setCouponSaving(true);
    try {
      const { httpsCallable } = await import('firebase/functions');
      const { functions } = await import('../../firebase/config');
      const redeem = httpsCallable(functions, 'redeemCoupon');
      const result = await redeem({ code: couponCode.trim(), gymId: userDoc.gym_id });
      const newExpiry = new Date(result.data.newExpiry);
      setActiveSubInfo({ validUntil: newExpiry, label: result.data.label });
      setCouponCode('');
      setActiveSheet(null);
      showToast(`✅ ${result.data.label} activated until ${newExpiry.toLocaleDateString('en-IN')}!`, 'success');
    } catch (e) {
      const msg = e?.details?.message || e?.message || 'Invalid or already used code';
      showToast(msg, 'error');
    } finally {
      setCouponSaving(false);
    }
  };

  // ── Logout ──
  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const handleCopyLink = () => {
    const link = `${window.location.origin}/gym/${userDoc.gym_id}/plans`;
    navigator.clipboard.writeText(link)
      .then(() => showToast('Plans link copied!', 'success'))
      .catch(() => showToast('Failed to copy link', 'error'));
  };

  const handleCopyGymLink = () => {
    const link = `${window.location.origin}/gym/${userDoc.gym_id}`;
    navigator.clipboard.writeText(link)
      .then(() => showToast('Gym page link copied!', 'success'))
      .catch(() => showToast('Failed to copy link', 'error'));
  };

  // ── Save agreement toggle ──
  const saveRequireAgreement = async (value) => {
    setRequireAgreement(value);
    try {
      await updateGym(userDoc.gym_id, { 'settings.require_agreement': value });
      showToast(value ? 'Agreement required on login' : 'Agreement disabled', 'success');
    } catch (e) {
      showToast('Failed to save: ' + e.message, 'error');
      setRequireAgreement(!value);
    }
  };

  // ── Save workout enabled toggle ──
  const saveWorkoutEnabled = async (value) => {
    setWorkoutEnabled(value);
    try {
      await updateGym(userDoc.gym_id, { 'settings.workout_enabled': value });
      showToast(value ? 'Workout access enabled for members' : 'Workout access locked', 'success');
    } catch (e) {
      showToast('Failed to save: ' + e.message, 'error');
      setWorkoutEnabled(!value);
    }
  };

  // ── Equipment ──
  const MUSCLE_GROUPS = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Core', 'Cardio', 'Full Body', 'Glutes'];

  const emptyEquipment = () => ({
    id: `eq_${Date.now()}`,
    name: '',
    photo: '',
    muscles: [],
  });

  const handleSaveEquipment = async () => {
    if (!editingEquipment?.name) { showToast('Equipment name required', 'error'); return; }
    const exists = equipment.find(e => e.id === editingEquipment.id);
    const updated = exists
      ? equipment.map(e => e.id === editingEquipment.id ? editingEquipment : e)
      : [...equipment, editingEquipment];
    setSaving(true);
    try {
      await updateGym(userDoc.gym_id, { equipment: updated });
      setEquipment(updated);
      showToast('Equipment saved!', 'success');
      setEditingEquipment(null);
      setActiveSheet(null);
    } catch (e) {
      showToast('Failed to save: ' + e.message, 'error');
    } finally { setSaving(false); }
  };

  const handleDeleteEquipment = async (eqId) => {
    const updated = equipment.filter(e => e.id !== eqId);
    try {
      await updateGym(userDoc.gym_id, { equipment: updated });
      setEquipment(updated);
      showToast('Equipment removed', 'success');
    } catch (e) {
      showToast('Failed to delete', 'error');
    }
  };

  const handleEquipPhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingEquipImg(true);
    try {
      const ts = Date.now();
      const storageRef = ref(storage, `gyms/${userDoc.gym_id}/equipment/${ts}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setEditingEquipment(prev => ({ ...prev, photo: url }));
      showToast('Photo uploaded', 'success');
    } catch (err) {
      showToast('Upload failed', 'error');
    } finally {
      setUploadingEquipImg(false);
      e.target.value = '';
    }
  };

  if (loading) {
    return (
      <div className="screen settings-screen">
        <div className="screen-content spinner-center">
          <div className="spinner spinner-primary" style={{ width: 32, height: 32 }} />
        </div>
      </div>
    );
  }

  const initials = getInitials(gym?.name || 'G');

  return (
    <div className="screen settings-screen">
      <div className="screen-content">

        {/* Hero */}
        <div className="settings-hero">
          <div className="settings-gym-avatar">{initials}</div>
          <div className="settings-gym-name">{gym?.name || 'My Gym'}</div>
          <div className="settings-gym-id">ID: {userDoc?.gym_id?.slice(0, 12).toUpperCase()}</div>
        </div>

        {/* Gym Details */}
        <div className="settings-section">
          <div className="settings-section-title">Gym Info</div>
          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="settings-row" onClick={() => setActiveSheet('info')}>
              <div className="settings-row-icon" style={{ background: 'var(--primary-light)' }}>🏋️</div>
              <div className="settings-row-content">
                <div className="settings-row-label">Gym details</div>
                <div className="settings-row-desc">Name, phone, address, email</div>
              </div>
              <span className="settings-row-arrow">›</span>
            </div>
            <div className="settings-row" onClick={() => setActiveSheet('hours')}>
              <div className="settings-row-icon" style={{ background: 'rgba(29,158,117,0.08)' }}>🕐</div>
              <div className="settings-row-content">
                <div className="settings-row-label">Working hours</div>
                <div className="settings-row-desc">{hours.open} – {hours.close}</div>
              </div>
              <span className="settings-row-arrow">›</span>
            </div>
            <div className="settings-row" onClick={() => setActiveSheet('social')}>
              <div className="settings-row-icon" style={{ background: 'rgba(239,159,39,0.08)' }}>🔗</div>
              <div className="settings-row-content">
                <div className="settings-row-label">Social & Maps</div>
                <div className="settings-row-desc">Instagram, Facebook, Google Maps</div>
              </div>
              <span className="settings-row-arrow">›</span>
            </div>
          </div>
        </div>

        {/* Gallery / Photos */}
        <div className="settings-section">
          <div className="settings-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Gym Gallery</span>
            <label className="btn-ghost" style={{ fontSize: 12, padding: '4px 10px', height: 'auto', marginBottom: 0, cursor: 'pointer' }}>
              {uploadingImage ? 'Uploading...' : '+ Add Photo'}
              <input type="file" hidden accept="image/*" onChange={handlePhotoUpload} disabled={uploadingImage} />
            </label>
          </div>
          <div className="glass-card" style={{ padding: 12 }}>
            {photos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 13, color: 'var(--text-muted)' }}>
                No photos added yet
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {photos.map(p => (
                  <div key={p.id} style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden' }}>
                    <img src={p.url} alt="Gym" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button 
                      onClick={() => handlePhotoDelete(p.id, p.url)}
                      style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 12 }}
                    >✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Membership & Taxes */}
        <div className="settings-section">
          <div className="settings-section-title">Membership & Taxes</div>
          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="settings-row" onClick={() => navigate('/owner/plans')}>
              <div className="settings-row-icon" style={{ background: 'var(--primary-light)' }}>🎟️</div>
              <div className="settings-row-content">
                <div className="settings-row-label">Membership Plans</div>
                <div className="settings-row-desc">Manage plans, pricing & limits</div>
              </div>
              <span className="settings-row-arrow">›</span>
            </div>
            <div className="settings-row" onClick={() => setActiveSheet('tax')}>
              <div className="settings-row-icon" style={{ background: 'rgba(29,158,117,0.08)' }}>🧾</div>
              <div className="settings-row-content">
                <div className="settings-row-label">Tax settings</div>
                <div className="settings-row-desc">{taxConfig.enabled ? `Enabled (${taxConfig.rate}%)` : 'Disabled'}</div>
              </div>
              <span className="settings-row-arrow">›</span>
            </div>
            <div className="settings-row" onClick={() => navigate('/owner/settings/numbering')}>
              <div className="settings-row-icon" style={{ background: 'rgba(83,74,183,0.08)' }}>🔢</div>
              <div className="settings-row-content">
                <div className="settings-row-label">Numbering System</div>
                <div className="settings-row-desc">Member numbers & enrollment codes</div>
              </div>
              <span className="settings-row-arrow">›</span>
            </div>
          </div>
        </div>

        {/* Member Experience */}
        <div className="settings-section">
          <div className="settings-section-title">Member Experience</div>
          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="settings-row" onClick={() => navigate('/owner/settings/card-editor')}>
              <div className="settings-row-icon" style={{ background: 'rgba(83,74,183,0.08)' }}>🪪</div>
              <div className="settings-row-content">
                <div className="settings-row-label">Membership Card Design</div>
                <div className="settings-row-desc">Customise what appears on digital member ID</div>
              </div>
              <span className="settings-row-arrow">›</span>
            </div>
            <div className="settings-row">
              <div className="settings-row-icon" style={{ background: 'rgba(29,158,117,0.08)' }}>📝</div>
              <div className="settings-row-content">
                <div className="settings-row-label">Require Member Agreement</div>
                <div className="settings-row-desc">
                  {requireAgreement ? 'Members must sign agreement on first login' : 'Agreement disabled — members go straight to home'}
                </div>
              </div>
              <button
                className={`plan-toggle ${requireAgreement ? 'on' : 'off'}`}
                onClick={() => saveRequireAgreement(!requireAgreement)}
                title={requireAgreement ? 'Required' : 'Disabled'}
              />
            </div>
            <div className="settings-row">
              <div className="settings-row-icon" style={{ background: 'rgba(83,74,183,0.08)' }}>🏋️</div>
              <div className="settings-row-content">
                <div className="settings-row-label">Workout Plan Access</div>
                <div className="settings-row-desc">
                  {workoutEnabled ? 'Members can access workout & progress pages' : 'Workout pages are locked for members'}
                </div>
              </div>
              <button
                className={`plan-toggle ${workoutEnabled ? 'on' : 'off'}`}
                onClick={() => saveWorkoutEnabled(!workoutEnabled)}
                title={workoutEnabled ? 'Enabled' : 'Locked'}
              />
            </div>
          </div>
        </div>

        {/* Landing Page */}
        <div className="settings-section">
          <div className="settings-section-title">Landing Page</div>
          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="settings-row" onClick={() => setActiveSheet('landing')}>
              <div className="settings-row-icon" style={{ background: 'rgba(239,159,39,0.08)' }}>🌐</div>
              <div className="settings-row-content">
                <div className="settings-row-label">Landing page settings</div>
                <div className="settings-row-desc">Facilities, publish status</div>
              </div>
              <span className="settings-row-arrow">›</span>
            </div>
          </div>
        </div>

        {/* Gym Equipment */}
        <div className="settings-section">
          <div className="settings-section-title">Gym Equipment</div>
          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="settings-row" onClick={() => navigate('/owner/settings/equipment')}>
              <div className="settings-row-icon" style={{ background: 'var(--primary-light)' }}>🏋️</div>
              <div className="settings-row-content">
                <div className="settings-row-label">Gym Equipment</div>
                <div className="settings-row-desc">Manage your machines and gear</div>
              </div>
              <span className="settings-row-arrow">›</span>
            </div>
          </div>
        </div>

        {/* Marketing & Sharing */}
        <div className="settings-section">
          <div className="settings-section-title">Marketing & Sharing</div>
          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="settings-row" onClick={handleCopyGymLink}>
              <div className="settings-row-icon" style={{ background: 'rgba(29,158,117,0.08)' }}>🌐</div>
              <div className="settings-row-content">
                <div className="settings-row-label">Gym Details Share Link</div>
                <div className="settings-row-desc">Share your gym landing page</div>
              </div>
              <button className="copy-chip" onClick={(e) => { e.stopPropagation(); handleCopyGymLink(); }}>
                Copy
              </button>
            </div>
            <div className="settings-row" onClick={handleCopyLink}>
              <div className="settings-row-icon" style={{ background: 'var(--primary-light)' }}>📢</div>
              <div className="settings-row-content">
                <div className="settings-row-label">Share Subscription Plans</div>
                <div className="settings-row-desc">Copy plans link for social media</div>
              </div>
              <button className="copy-chip" onClick={(e) => { e.stopPropagation(); handleCopyLink(); }}>
                Copy
              </button>
            </div>
          </div>
        </div>

        {/* WhatsApp Messaging */}
        <div className="settings-section">
          <div className="settings-section-title">Communications</div>
          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="settings-row" onClick={() => setActiveSheet('messaging')}>
              <div className="settings-row-icon" style={{ background: 'rgba(37,211,102,0.08)' }}>💬</div>
              <div className="settings-row-content">
                <div className="settings-row-label">WhatsApp messaging</div>
                <div className="settings-row-desc">Manage automated alerts & notifications</div>
              </div>
              <span className="settings-row-arrow">›</span>
            </div>
          </div>
        </div>

        {/* Staff & Access */}
        <div className="settings-section">
          <div className="settings-section-title">Team & Access</div>
          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="settings-row" onClick={() => navigate('/owner/staff')}>
              <div className="settings-row-icon" style={{ background: 'rgba(55,138,221,0.08)' }}>👥</div>
              <div className="settings-row-content">
                <div className="settings-row-label">Staff & trainers</div>
                <div className="settings-row-desc">Manage your team members</div>
              </div>
              <span className="settings-row-arrow">›</span>
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="settings-section">
          <div className="settings-section-title">Quick Links</div>
          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="settings-row" onClick={() => navigate('/owner/settings/quick-links')}>
              <div className="settings-row-icon" style={{ background: 'var(--primary-light)' }}>🔗</div>
              <div className="settings-row-content">
                <div className="settings-row-label">Quick Links</div>
                <div className="settings-row-desc">Billing, analytics, logs & scanner</div>
              </div>
              <span className="settings-row-arrow">›</span>
            </div>
            <div className="settings-row" onClick={() => navigate('/owner/kiosk-devices')}>
              <div className="settings-row-icon" style={{ background: 'rgba(83,74,183,0.08)' }}>🖥️</div>
              <div className="settings-row-content">
                <div className="settings-row-label">Kiosk Mode</div>
                <div className="settings-row-desc">Manage kiosk devices & self check-in</div>
              </div>
              <span className="settings-row-arrow">›</span>
            </div>
          </div>
        </div>

        {/* Subscription */}
        <div className="settings-section">
          <div className="settings-section-title">Subscription</div>
          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="settings-row" onClick={() => setActiveSheet('coupon')}>
              <div className="settings-row-icon" style={{ background: 'rgba(109,54,212,0.08)' }}>🎟️</div>
              <div className="settings-row-content">
                <div className="settings-row-label">Activate with Coupon</div>
                <div className="settings-row-desc">
                  {activeSubInfo
                    ? `${activeSubInfo.label} — valid until ${activeSubInfo.validUntil.toLocaleDateString('en-IN')}`
                    : 'Enter a coupon code to unlock access'}
                </div>
              </div>
              <span className="settings-row-arrow">›</span>
            </div>
          </div>
        </div>

        {/* Account info */}
        <div className="settings-section">
          <div className="settings-section-title">Account</div>
          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="settings-row">
              <div className="settings-row-icon" style={{ background: 'rgba(0,0,0,0.04)' }}>📱</div>
              <div className="settings-row-content">
                <div className="settings-row-label">Phone</div>
                <div className="settings-row-desc">{user?.phoneNumber || '—'}</div>
              </div>
            </div>
            <div className="settings-row">
              <div className="settings-row-icon" style={{ background: 'rgba(0,0,0,0.04)' }}>🔑</div>
              <div className="settings-row-content">
                <div className="settings-row-label">Role</div>
                <div className="settings-row-desc">Gym Owner</div>
              </div>
            </div>
          </div>
        </div>

        {/* Danger zone */}
        <div className="settings-section settings-danger">
          <div className="settings-section-title">Account</div>
          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="settings-row" onClick={handleLogout}>
              <div className="settings-row-icon" style={{ background: 'rgba(226,75,74,0.08)' }}>🚪</div>
              <div className="settings-row-label">Log out</div>
              <span className="settings-row-arrow" style={{ color: 'var(--error)' }}>›</span>
            </div>
          </div>
        </div>

        <div style={{ height: 100 }} />
      </div>

      <BottomNav activeTab="settings" role="owner" />

      {/* ── Edit Sheets ── */}

      {/* Gym Info Sheet */}
      {activeSheet === 'info' && (
        <EditSheet title="Gym Details" onClose={() => setActiveSheet(null)}>
          {[
            ['Gym name', 'name', 'text', 'E.g. Anytime Fitness'],
            ['Phone number', 'phone', 'tel', '+91 XXXXX XXXXX'],
            ['Email', 'email', 'email', 'gym@email.com'],
            ['City', 'city', 'text', 'Mumbai'],
            ['Address', 'address', 'text', 'Full address'],
            ['Website', 'website', 'url', 'https://...'],
          ].map(([label, key, type, placeholder]) => (
            <div key={key} className="input-group">
              <label className="input-label">{label}</label>
              <input
                type={type}
                className="input-field"
                placeholder={placeholder}
                value={gymInfo[key] || ''}
                onChange={e => setGymInfo(prev => ({ ...prev, [key]: e.target.value }))}
              />
            </div>
          ))}
          <div className="input-group">
            <label className="input-label">Description</label>
            <textarea
              className="input-field"
              placeholder="About your gym..."
              value={gymInfo.description || ''}
              rows={3}
              style={{ resize: 'none' }}
              onChange={e => setGymInfo(prev => ({ ...prev, description: e.target.value }))}
            />
          </div>
          <button className="btn-primary" onClick={saveGymInfo} disabled={saving} style={{ marginTop: 8 }}>
            {saving ? <div className="spinner" /> : 'Save Gym Details'}
          </button>
        </EditSheet>
      )}

      {/* Working Hours Sheet */}
      {activeSheet === 'hours' && (
        <EditSheet title="Working Hours" onClose={() => setActiveSheet(null)}>
          <div className="hours-grid">
            <div className="input-group">
              <label className="input-label">Opens at</label>
              <input
                type="time"
                className="input-field"
                value={hours.open}
                onChange={e => setHours(prev => ({ ...prev, open: e.target.value }))}
              />
            </div>
            <div className="input-group">
              <label className="input-label">Closes at</label>
              <input
                type="time"
                className="input-field"
                value={hours.close}
                onChange={e => setHours(prev => ({ ...prev, close: e.target.value }))}
              />
            </div>
          </div>
          <button className="btn-primary" onClick={saveHours} disabled={saving} style={{ marginTop: 8 }}>
            {saving ? <div className="spinner" /> : 'Save Hours'}
          </button>
        </EditSheet>
      )}



      {/* Social Sheet */}
      {activeSheet === 'social' && (
        <EditSheet title="Social & Maps" onClose={() => setActiveSheet(null)}>
          {[
            ['Instagram', 'instagram', 'https://instagram.com/yourgym'],
            ['Facebook', 'facebook', 'https://facebook.com/yourgym'],
            ['Google Maps', 'google_maps', 'Paste Google Maps link'],
          ].map(([label, key, placeholder]) => (
            <div key={key} className="input-group">
              <label className="input-label">{label}</label>
              <input
                type="url"
                className="input-field"
                placeholder={placeholder}
                value={social[key] || ''}
                onChange={e => setSocial(prev => ({ ...prev, [key]: e.target.value }))}
              />
            </div>
          ))}
          <button className="btn-primary" onClick={saveSocial} disabled={saving} style={{ marginTop: 8 }}>
            {saving ? <div className="spinner" /> : 'Save Links'}
          </button>
        </EditSheet>
      )}

      {/* Tax Edit Sheet */}
      {activeSheet === 'tax' && (
        <EditSheet title="Tax Settings" onClose={() => setActiveSheet(null)}>
          <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <div className="input-label" style={{ marginBottom: 4 }}>Enable Tax on Payments</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Apply tax to all membership plans</div>
            </div>
            <button
              className={`plan-toggle ${taxConfig.enabled ? 'on' : 'off'}`}
              onClick={() => setTaxConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
              title={taxConfig.enabled ? 'Enabled' : 'Disabled'}
            />
          </div>
          
          {taxConfig.enabled && (
            <div className="input-group">
              <label className="input-label">Tax Percentage (%) *</label>
              <input
                type="number"
                className="input-field"
                placeholder="e.g. 18"
                value={taxConfig.rate}
                onChange={e => setTaxConfig(p => ({ ...p, rate: e.target.value }))}
                min="0"
                max="100"
                step="0.1"
              />
            </div>
          )}
          
          <button className="btn-primary" onClick={saveTaxConfig} disabled={saving} style={{ marginTop: 8 }}>
            {saving ? <div className="spinner" /> : 'Save Tax Settings'}
          </button>
        </EditSheet>
      )}

      {/* Landing Page Sheet */}
      {activeSheet === 'landing' && (
        <EditSheet title="Landing Page" onClose={() => setActiveSheet(null)}>
          <div className="input-group">
            <label className="input-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <span>Publish Public Landing Page</span>
              <button
                className={`plan-toggle ${landingConfig.isPublished ? 'on' : 'off'}`}
                onClick={() => setLandingConfig(prev => ({ ...prev, isPublished: !prev.isPublished }))}
                style={{ margin: 0 }}
                type="button"
              />
            </label>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '-8px', marginBottom: '24px' }}>
              Allows potential members to view your gym online and send inquiries.
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Available Facilities</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {['Cardio', 'Strength', 'CrossFit', 'Yoga Studio', 'Showers', 'Lockers', 'WiFi', 'Parking', 'Personal Training', 'Cafe'].map(facility => (
                <label key={facility} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px' }}>
                  <input
                    type="checkbox"
                    checked={landingConfig.facilities.includes(facility)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setLandingConfig(prev => ({ ...prev, facilities: [...prev.facilities, facility] }));
                      } else {
                        setLandingConfig(prev => ({ ...prev, facilities: prev.facilities.filter(f => f !== facility) }));
                      }
                    }}
                    style={{ accentColor: 'var(--primary)', width: '18px', height: '18px', margin: 0 }}
                  />
                  {facility}
                </label>
              ))}
            </div>
          </div>

          <button className="btn-primary" onClick={saveLandingConfig} disabled={saving} style={{ marginTop: 24 }}>
            {saving ? <div className="spinner" /> : 'Save Settings'}
          </button>
        </EditSheet>
      )}

      {/* Messaging Config Sheet */}
      {activeSheet === 'messaging' && (
        <EditSheet title="WhatsApp Settings" onClose={() => setActiveSheet(null)}>
          
          <div style={{ paddingBottom: 16 }}>
            <h3 style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Core Notifications</h3>
            
            <div className="input-group">
              <label className="input-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>Welcome Messages</span>
                <button
                  className={`plan-toggle ${messagingConfig.welcome_messages ? 'on' : 'off'}`}
                  onClick={() => setMessagingConfig(prev => ({ ...prev, welcome_messages: !prev.welcome_messages }))}
                  style={{ margin: 0 }}
                  type="button"
                />
              </label>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>Sent automatically when a new member is added.</div>
            </div>

            <div className="input-group">
              <label className="input-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>Expiry Alerts</span>
                <button
                  className={`plan-toggle ${messagingConfig.expiry_alerts ? 'on' : 'off'}`}
                  onClick={() => setMessagingConfig(prev => ({ ...prev, expiry_alerts: !prev.expiry_alerts }))}
                  style={{ margin: 0 }}
                  type="button"
                />
              </label>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>Reminders sent 7d, 3d, and 1d before subscription expiry.</div>
            </div>

            <div className="input-group">
              <label className="input-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>Payment Confirmations</span>
                <button
                  className={`plan-toggle ${messagingConfig.payment_confirmations ? 'on' : 'off'}`}
                  onClick={() => setMessagingConfig(prev => ({ ...prev, payment_confirmations: !prev.payment_confirmations }))}
                  style={{ margin: 0 }}
                  type="button"
                />
              </label>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>Payment confirmation receipts and due reminders.</div>
            </div>
            
            <div className="input-group">
              <label className="input-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>Equipment Alerts</span>
                <button
                  className={`plan-toggle ${messagingConfig.equipment_alerts ? 'on' : 'off'}`}
                  onClick={() => setMessagingConfig(prev => ({ ...prev, equipment_alerts: !prev.equipment_alerts }))}
                  style={{ margin: 0 }}
                  type="button"
                />
              </label>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>Notify relevant members when equipment goes under maintenance.</div>
            </div>
          </div>

          <div style={{ paddingBottom: 8 }}>
            <h3 style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Engagement</h3>
            
            <div className="input-group">
              <label className="input-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>Inactivity Alerts</span>
                <button
                  className={`plan-toggle ${messagingConfig.inactivity_alerts ? 'on' : 'off'}`}
                  onClick={() => setMessagingConfig(prev => ({ ...prev, inactivity_alerts: !prev.inactivity_alerts }))}
                  style={{ margin: 0 }}
                  type="button"
                />
              </label>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Send a "we miss you" text if a member hasn't visited in 3+ days.</div>
            </div>
          </div>

          <button className="btn-primary" onClick={saveMessagingConfig} disabled={saving} style={{ marginTop: 24 }}>
            {saving ? <div className="spinner" /> : 'Save Settings'}
          </button>
        </EditSheet>
      )}

      {/* Coupon Activation Sheet */}
      {activeSheet === 'coupon' && (
        <EditSheet title="Activate Subscription" onClose={() => { setActiveSheet(null); setCouponCode(''); }}>
          <div style={{ marginBottom: 16 }}>
            {activeSubInfo ? (
              <div style={{ background: 'rgba(0,103,98,0.08)', border: '1px solid rgba(0,103,98,0.2)', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)' }}>✅ Active Subscription</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  {activeSubInfo.label} — valid until {activeSubInfo.validUntil.toLocaleDateString('en-IN')}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
                Enter a coupon code provided by Gymly to activate or extend your subscription.
              </div>
            )}
          </div>
          <div className="input-group">
            <label className="input-label">Coupon Code</label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g. GYM1Y-XXXXXX"
              value={couponCode}
              onChange={e => setCouponCode(e.target.value.toUpperCase())}
              style={{ letterSpacing: '0.06em', fontFamily: 'Geist, monospace', fontSize: 15 }}
            />
          </div>
          <button className="btn-primary" onClick={handleActivateCoupon} disabled={couponSaving || !couponCode.trim()} style={{ marginTop: 8 }}>
            {couponSaving ? <div className="spinner" /> : '🎟️ Activate Code'}
          </button>
          <div style={{ marginTop: 16, padding: '12px', background: 'rgba(0,88,188,0.05)', borderRadius: 10, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            <strong>Available tiers:</strong> 1 Month · 3 Months · 6 Months · 1 Year<br />
            Each code is single-use. Codes can be stacked to extend access.
          </div>
        </EditSheet>
      )}

    </div>
  );
};

export default OwnerSettings;
