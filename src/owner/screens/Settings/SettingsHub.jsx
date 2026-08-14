import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { getGym, updateGym } from '../../../firebase/firestore';
import { storage } from '../../../firebase/config';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { compressImage } from '../../../firebase/storage';
import { logout } from '../../../firebase/auth';
import { getInitials } from '../../../utils/helpers';
import EditSheet, { ToggleRow, SettingsRow } from '../../components/EditSheet';
import PageSkeleton from '../../primitives/PageSkeleton';
import { invalidateOwnerGym } from '../../hooks/useOwnerGym';

const FACILITIES = ['Cardio', 'Strength', 'CrossFit', 'Yoga Studio', 'Showers', 'Lockers', 'WiFi', 'Parking', 'Personal Training', 'Cafe'];

export default function SettingsHub() {
  const navigate = useNavigate();
  const { user, userDoc } = useAuth();
  const { showToast } = useToast();

  const [gym, setGym] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSheet, setActiveSheet] = useState(null);

  const [gymInfo, setGymInfo] = useState({ name: '', phone: '', email: '', address: '', city: '', website: '', description: '' });
  const [hours, setHours] = useState({ open: '06:00', close: '22:00' });
  const [taxConfig, setTaxConfig] = useState({ enabled: false, rate: 0 });
  const [social, setSocial] = useState({ instagram: '', facebook: '', google_maps: '' });
  const [landingConfig, setLandingConfig] = useState({ isPublished: false, facilities: [] });
  const [messagingConfig, setMessagingConfig] = useState({
    welcome_messages: true, expiry_alerts: true, payment_confirmations: true, equipment_alerts: true, inactivity_alerts: false,
  });
  const [requireAgreement, setRequireAgreement] = useState(true);
  const [workoutEnabled, setWorkoutEnabled] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponSaving, setCouponSaving] = useState(false);
  const [activeSubInfo, setActiveSubInfo] = useState(null);

  // Settings writes the gym doc directly (not through the shared read-only
  // cache) — invalidate on unmount so read-only screens (Members, Add
  // Member, Analytics, ...) don't serve stale gym data after edits here.
  useEffect(() => () => { if (userDoc?.gym_id) invalidateOwnerGym(userDoc.gym_id); }, [userDoc?.gym_id]);

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    getGym(userDoc.gym_id).then((g) => {
      if (!g) return;
      setGym(g);
      setGymInfo({ name: g.name || '', phone: g.phone || '', email: g.email || '', address: g.address || '', city: g.city || '', website: g.website || '', description: g.description || '' });
      setHours({ open: g.working_hours?.open || '06:00', close: g.working_hours?.close || '22:00' });
      setTaxConfig({ enabled: g.settings?.taxEnabled || false, rate: g.settings?.taxRate || 0 });
      setSocial(g.social || { instagram: '', facebook: '', google_maps: '' });
      setLandingConfig({ isPublished: g.landingConfig?.isPublished || false, facilities: g.landingConfig?.facilities || [] });
      setMessagingConfig(g.messaging_config || { welcome_messages: true, expiry_alerts: true, payment_confirmations: true, equipment_alerts: true, inactivity_alerts: false });
      setPhotos(g.photos || []);
      setRequireAgreement(g.settings?.require_agreement !== false);
      setWorkoutEnabled(g.settings?.workout_enabled === true);
      if (g.subscription_valid_until) {
        const until = g.subscription_valid_until?.toDate ? g.subscription_valid_until.toDate() : new Date(g.subscription_valid_until);
        setActiveSubInfo({ validUntil: until, label: g.subscription_coupon_label || 'Active' });
      }
      setLoading(false);
    });
  }, [userDoc?.gym_id]);

  const saveGymInfo = async () => {
    setSaving(true);
    try {
      await updateGym(userDoc.gym_id, gymInfo);
      setGym((prev) => ({ ...prev, ...gymInfo }));
      showToast('Gym details updated!', 'success');
      setActiveSheet(null);
    } catch (e) { showToast(`Failed to save: ${e.message}`, 'error'); } finally { setSaving(false); }
  };

  const saveHours = async () => {
    setSaving(true);
    try {
      await updateGym(userDoc.gym_id, { working_hours: hours });
      setGym((prev) => ({ ...prev, working_hours: hours }));
      showToast('Working hours updated!', 'success');
      setActiveSheet(null);
    } catch (e) { showToast(`Failed to save: ${e.message}`, 'error'); } finally { setSaving(false); }
  };

  const saveTaxConfig = async () => {
    setSaving(true);
    try {
      await updateGym(userDoc.gym_id, { 'settings.taxEnabled': taxConfig.enabled, 'settings.taxRate': Number(taxConfig.rate) });
      setGym((prev) => ({ ...prev, settings: { ...prev.settings, taxEnabled: taxConfig.enabled, taxRate: Number(taxConfig.rate) } }));
      showToast('Tax settings updated!', 'success');
      setActiveSheet(null);
    } catch (e) { showToast(`Failed to save tax: ${e.message}`, 'error'); } finally { setSaving(false); }
  };

  const saveSocial = async () => {
    setSaving(true);
    try {
      await updateGym(userDoc.gym_id, { social });
      setGym((prev) => ({ ...prev, social }));
      showToast('Social links updated!', 'success');
      setActiveSheet(null);
    } catch (e) { showToast(`Failed to save: ${e.message}`, 'error'); } finally { setSaving(false); }
  };

  const saveLandingConfig = async () => {
    setSaving(true);
    try {
      await updateGym(userDoc.gym_id, { landingConfig });
      setGym((prev) => ({ ...prev, landingConfig }));
      showToast('Landing page settings updated!', 'success');
      setActiveSheet(null);
    } catch (e) { showToast(`Failed to save: ${e.message}`, 'error'); } finally { setSaving(false); }
  };

  const saveMessagingConfig = async () => {
    setSaving(true);
    try {
      await updateGym(userDoc.gym_id, { messaging_config: messagingConfig });
      setGym((prev) => ({ ...prev, messaging_config: messagingConfig }));
      showToast('Messaging settings updated!', 'success');
      setActiveSheet(null);
    } catch (e) { showToast(`Failed to save: ${e.message}`, 'error'); } finally { setSaving(false); }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const ts = Date.now();
      const storageRef = ref(storage, `gyms/${userDoc.gym_id}/photos/${ts}_${file.name}`);
      const compressed = await compressImage(file, 800, 0.85);
      await uploadBytes(storageRef, compressed, { contentType: 'image/webp', cacheControl: 'public,max-age=31536000' });
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
        try { await deleteObject(ref(storage, url)); } catch (e) { console.log('File missing', e); }
      }
      const newPhotos = photos.filter((p) => p.id !== photoId);
      await updateGym(userDoc.gym_id, { photos: newPhotos });
      setPhotos(newPhotos);
      showToast('Photo deleted', 'success');
    } catch (err) {
      console.error('Delete photo error:', err);
      showToast('Failed to delete', 'error');
    }
  };

  const handleActivateCoupon = async () => {
    if (!couponCode.trim()) { showToast('Enter a coupon code', 'error'); return; }
    setCouponSaving(true);
    try {
      const { httpsCallable } = await import('firebase/functions');
      const { functions } = await import('../../../firebase/config');
      const result = await httpsCallable(functions, 'redeemCoupon')({ code: couponCode.trim(), gymId: userDoc.gym_id });
      const newExpiry = new Date(result.data.newExpiry);
      setActiveSubInfo({ validUntil: newExpiry, label: result.data.label });
      setCouponCode('');
      setActiveSheet(null);
      showToast(`✅ ${result.data.label} activated until ${newExpiry.toLocaleDateString('en-IN')}!`, 'success');
    } catch (e) {
      showToast(e?.details?.message || e?.message || 'Invalid or already used code', 'error');
    } finally {
      setCouponSaving(false);
    }
  };

  const handleLogout = async () => { await logout(); navigate('/select-role', { replace: true }); };
  const copyLink = (path, label) => {
    navigator.clipboard.writeText(`${window.location.origin}${path}`)
      .then(() => showToast(`${label} copied!`, 'success'))
      .catch(() => showToast('Failed to copy link', 'error'));
  };
  const saveRequireAgreement = async (value) => {
    setRequireAgreement(value);
    try { await updateGym(userDoc.gym_id, { 'settings.require_agreement': value }); showToast(value ? 'Agreement required on login' : 'Agreement disabled', 'success'); }
    catch (e) { showToast(`Failed to save: ${e.message}`, 'error'); setRequireAgreement(!value); }
  };
  const saveWorkoutEnabled = async (value) => {
    setWorkoutEnabled(value);
    try { await updateGym(userDoc.gym_id, { 'settings.workout_enabled': value }); showToast(value ? 'Workout access enabled for members' : 'Workout access locked', 'success'); }
    catch (e) { showToast(`Failed to save: ${e.message}`, 'error'); setWorkoutEnabled(!value); }
  };

  if (loading) return <PageSkeleton variant="list" rows={8} />;

  return (
    <section data-screen-label="Settings">
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <span className="gl2-avatar gl2-avatar-lg" style={{ background: 'var(--gl2-primary)' }}>{getInitials(gym?.name || 'G')}</span>
        <div>
          <h1 className="gl2-page-title">{gym?.name || 'My Gym'}</h1>
          <p className="gl2-page-sub">ID: {userDoc?.gym_id?.slice(0, 12).toUpperCase()}</p>
        </div>
      </div>

      <div className="gl2-settings-group">
        <p className="gl2-eyebrow">Gym info</p>
        <div className="gl2-list">
          <SettingsRow icon="🏋️" label="Gym details" desc="Name, phone, address, email" onClick={() => setActiveSheet('info')} />
          <SettingsRow icon="🕐" label="Working hours" desc={`${hours.open} – ${hours.close}`} onClick={() => setActiveSheet('hours')} />
          <SettingsRow icon="🔗" label="Social & maps" desc="Instagram, Facebook, Google Maps" onClick={() => setActiveSheet('social')} />
        </div>
      </div>

      <div className="gl2-settings-group">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <p className="gl2-eyebrow" style={{ margin: 0 }}>Gym gallery</p>
          <label className="gl2-btn gl2-btn-secondary" style={{ minHeight: 32, padding: '0 12px', fontSize: 12.5, cursor: 'pointer' }}>
            {uploadingImage ? 'Uploading…' : '+ Add photo'}
            <input type="file" hidden accept="image/*" onChange={handlePhotoUpload} disabled={uploadingImage} />
          </label>
        </div>
        <div className="gl2-card">
          {photos.length === 0 ? (
            <p style={{ margin: 0, textAlign: 'center', fontSize: 13, color: 'var(--gl2-muted)' }}>No photos added yet</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {photos.map((p) => (
                <div key={p.id} style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden' }}>
                  <img src={p.url} alt="Gym" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button type="button" onClick={() => handlePhotoDelete(p.id, p.url)} style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,.5)', color: '#fff', border: 0, borderRadius: '50%', width: 22, height: 22, cursor: 'pointer' }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="gl2-settings-group">
        <p className="gl2-eyebrow">Membership & taxes</p>
        <div className="gl2-list">
          <SettingsRow icon="🎟️" label="Membership plans" desc="Manage plans, pricing & limits" onClick={() => navigate('/owner/plans')} />
          <SettingsRow icon="🧾" label="Tax settings" desc={taxConfig.enabled ? `Enabled (${taxConfig.rate}%)` : 'Disabled'} onClick={() => setActiveSheet('tax')} />
          <SettingsRow icon="🔢" label="Numbering system" desc="Member numbers & enrollment codes" onClick={() => navigate('/owner/settings/numbering')} />
        </div>
      </div>

      <div className="gl2-settings-group">
        <p className="gl2-eyebrow">Member experience</p>
        <div className="gl2-list">
          <SettingsRow icon="🪪" label="Membership card design" desc="Customise the digital member ID" onClick={() => navigate('/owner/settings/card-editor')} />
          <div className="gl2-row">
            <span style={{ fontSize: 20, width: 28, textAlign: 'center' }}>📝</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 14.5 }}>Require member agreement</p>
              <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--gl2-muted)' }}>{requireAgreement ? 'Members must sign on first login' : 'Agreement disabled'}</p>
            </div>
            <button type="button" className={`gl2-toggle-track ${requireAgreement ? 'on' : ''}`} onClick={() => saveRequireAgreement(!requireAgreement)}><span className="gl2-toggle-knob" /></button>
          </div>
          <div className="gl2-row">
            <span style={{ fontSize: 20, width: 28, textAlign: 'center' }}>🏋️</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 14.5 }}>Workout plan access</p>
              <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--gl2-muted)' }}>{workoutEnabled ? 'Members can access workout pages' : 'Workout pages are locked'}</p>
            </div>
            <button type="button" className={`gl2-toggle-track ${workoutEnabled ? 'on' : ''}`} onClick={() => saveWorkoutEnabled(!workoutEnabled)}><span className="gl2-toggle-knob" /></button>
          </div>
        </div>
      </div>

      <div className="gl2-settings-group">
        <p className="gl2-eyebrow">Landing page</p>
        <div className="gl2-list">
          <SettingsRow icon="🌐" label="Landing page settings" desc="Facilities, publish status" onClick={() => setActiveSheet('landing')} />
        </div>
      </div>

      <div className="gl2-settings-group">
        <p className="gl2-eyebrow">Gym equipment</p>
        <div className="gl2-list">
          <SettingsRow icon="🏋️" label="Gym equipment" desc="Manage your machines and gear" onClick={() => navigate('/owner/settings/equipment')} />
        </div>
      </div>

      <div className="gl2-settings-group">
        <p className="gl2-eyebrow">Marketing & sharing</p>
        <div className="gl2-list">
          <SettingsRow icon="🌐" label="Gym details share link" desc="Share your gym landing page" onClick={() => copyLink(`/gym/${userDoc.gym_id}`, 'Gym page link')} action={<button type="button" className="gl2-btn gl2-btn-secondary" style={{ minHeight: 32, padding: '0 12px' }} onClick={(e) => { e.stopPropagation(); copyLink(`/gym/${userDoc.gym_id}`, 'Gym page link'); }}>Copy</button>} />
          <SettingsRow icon="📢" label="Share subscription plans" desc="Copy plans link for social media" onClick={() => copyLink(`/gym/${userDoc.gym_id}/plans`, 'Plans link')} action={<button type="button" className="gl2-btn gl2-btn-secondary" style={{ minHeight: 32, padding: '0 12px' }} onClick={(e) => { e.stopPropagation(); copyLink(`/gym/${userDoc.gym_id}/plans`, 'Plans link'); }}>Copy</button>} />
        </div>
      </div>

      <div className="gl2-settings-group">
        <p className="gl2-eyebrow">Communications</p>
        <div className="gl2-list">
          <SettingsRow icon="💬" label="WhatsApp messaging" desc="Manage automated alerts & notifications" onClick={() => setActiveSheet('messaging')} />
        </div>
      </div>

      <div className="gl2-settings-group">
        <p className="gl2-eyebrow">Team & access</p>
        <div className="gl2-list">
          <SettingsRow icon="👥" label="Staff & trainers" desc="Manage your team members" onClick={() => navigate('/owner/staff')} />
        </div>
      </div>

      <div className="gl2-settings-group">
        <p className="gl2-eyebrow">Quick links</p>
        <div className="gl2-list">
          <SettingsRow icon="🔗" label="Quick links" desc="Billing, analytics, logs & scanner" onClick={() => navigate('/owner/settings/quick-links')} />
          <SettingsRow icon="🖥️" label="Kiosk mode" desc="Manage kiosk devices & self check-in" onClick={() => navigate('/owner/kiosk-devices')} />
        </div>
      </div>

      <div className="gl2-settings-group">
        <p className="gl2-eyebrow">Subscription</p>
        <div className="gl2-list">
          <SettingsRow icon="🎟️" label="Activate with coupon" desc={activeSubInfo ? `${activeSubInfo.label} — valid until ${activeSubInfo.validUntil.toLocaleDateString('en-IN')}` : 'Enter a coupon code to unlock access'} onClick={() => setActiveSheet('coupon')} />
        </div>
      </div>

      <div className="gl2-settings-group">
        <p className="gl2-eyebrow">Account</p>
        <div className="gl2-list">
          <SettingsRow icon="📱" label="Phone" desc={user?.phoneNumber || '—'} />
          <SettingsRow icon="🔑" label="Role" desc="Gym Owner" />
          <SettingsRow icon="🚪" label="Log out" onClick={handleLogout} action={<span className="material-symbols-outlined" style={{ color: 'var(--gl2-danger-strong)' }}>chevron_right</span>} />
        </div>
      </div>

      {activeSheet === 'info' && (
        <EditSheet title="Gym details" onClose={() => setActiveSheet(null)}>
          {[['Gym name', 'name', 'text', 'e.g. Anytime Fitness'], ['Phone number', 'phone', 'tel', '+91 XXXXX XXXXX'], ['Email', 'email', 'email', 'gym@email.com'], ['City', 'city', 'text', 'Mumbai'], ['Address', 'address', 'text', 'Full address'], ['Website', 'website', 'url', 'https://…']].map(([label, key, type, placeholder]) => (
            <label key={key} className="gl2-field" style={{ marginBottom: 12 }}>
              <span className="gl2-field-label">{label}</span>
              <input type={type} className="gl2-input" placeholder={placeholder} value={gymInfo[key] || ''} onChange={(e) => setGymInfo((prev) => ({ ...prev, [key]: e.target.value }))} />
            </label>
          ))}
          <label className="gl2-field" style={{ marginBottom: 12 }}>
            <span className="gl2-field-label">Description</span>
            <textarea className="gl2-input" style={{ minHeight: 70, padding: 11, resize: 'vertical' }} placeholder="About your gym…" value={gymInfo.description || ''} onChange={(e) => setGymInfo((prev) => ({ ...prev, description: e.target.value }))} />
          </label>
          <button type="button" className="gl2-btn gl2-btn-primary gl2-btn-lg" style={{ width: '100%' }} onClick={saveGymInfo} disabled={saving}>{saving ? 'Saving…' : 'Save gym details'}</button>
        </EditSheet>
      )}

      {activeSheet === 'hours' && (
        <EditSheet title="Working hours" onClose={() => setActiveSheet(null)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <label className="gl2-field"><span className="gl2-field-label">Opens at</span><input type="time" className="gl2-input" value={hours.open} onChange={(e) => setHours((prev) => ({ ...prev, open: e.target.value }))} /></label>
            <label className="gl2-field"><span className="gl2-field-label">Closes at</span><input type="time" className="gl2-input" value={hours.close} onChange={(e) => setHours((prev) => ({ ...prev, close: e.target.value }))} /></label>
          </div>
          <button type="button" className="gl2-btn gl2-btn-primary gl2-btn-lg" style={{ width: '100%' }} onClick={saveHours} disabled={saving}>{saving ? 'Saving…' : 'Save hours'}</button>
        </EditSheet>
      )}

      {activeSheet === 'social' && (
        <EditSheet title="Social & maps" onClose={() => setActiveSheet(null)}>
          {[['Instagram', 'instagram', 'https://instagram.com/yourgym'], ['Facebook', 'facebook', 'https://facebook.com/yourgym'], ['Google Maps', 'google_maps', 'Paste Google Maps link']].map(([label, key, placeholder]) => (
            <label key={key} className="gl2-field" style={{ marginBottom: 12 }}>
              <span className="gl2-field-label">{label}</span>
              <input type="url" className="gl2-input" placeholder={placeholder} value={social[key] || ''} onChange={(e) => setSocial((prev) => ({ ...prev, [key]: e.target.value }))} />
            </label>
          ))}
          <button type="button" className="gl2-btn gl2-btn-primary gl2-btn-lg" style={{ width: '100%' }} onClick={saveSocial} disabled={saving}>{saving ? 'Saving…' : 'Save links'}</button>
        </EditSheet>
      )}

      {activeSheet === 'tax' && (
        <EditSheet title="Tax settings" onClose={() => setActiveSheet(null)}>
          <ToggleRow label="Enable tax on payments" description="Apply tax to all membership plans" value={taxConfig.enabled} onChange={(v) => setTaxConfig((prev) => ({ ...prev, enabled: v }))} />
          {taxConfig.enabled && (
            <label className="gl2-field" style={{ margin: '12px 0' }}>
              <span className="gl2-field-label">Tax percentage (%)</span>
              <input type="number" className="gl2-input" placeholder="e.g. 18" value={taxConfig.rate} onChange={(e) => setTaxConfig((p) => ({ ...p, rate: e.target.value }))} min="0" max="100" step="0.1" />
            </label>
          )}
          <button type="button" className="gl2-btn gl2-btn-primary gl2-btn-lg" style={{ width: '100%', marginTop: 8 }} onClick={saveTaxConfig} disabled={saving}>{saving ? 'Saving…' : 'Save tax settings'}</button>
        </EditSheet>
      )}

      {activeSheet === 'landing' && (
        <EditSheet title="Landing page" onClose={() => setActiveSheet(null)}>
          <ToggleRow label="Publish public landing page" description="Allows potential members to view your gym online and send inquiries." value={landingConfig.isPublished} onChange={(v) => setLandingConfig((prev) => ({ ...prev, isPublished: v }))} />
          <p className="gl2-field-label" style={{ margin: '14px 0 8px' }}>Available facilities</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {FACILITIES.map((facility) => (
              <label key={facility} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                <input type="checkbox" checked={landingConfig.facilities.includes(facility)} onChange={(e) => setLandingConfig((prev) => ({ ...prev, facilities: e.target.checked ? [...prev.facilities, facility] : prev.facilities.filter((f) => f !== facility) }))} />
                {facility}
              </label>
            ))}
          </div>
          <button type="button" className="gl2-btn gl2-btn-primary gl2-btn-lg" style={{ width: '100%', marginTop: 16 }} onClick={saveLandingConfig} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>
        </EditSheet>
      )}

      {activeSheet === 'messaging' && (
        <EditSheet title="WhatsApp settings" onClose={() => setActiveSheet(null)}>
          <p className="gl2-eyebrow">Core notifications</p>
          <ToggleRow label="Welcome messages" description="Sent automatically when a new member is added." value={messagingConfig.welcome_messages} onChange={(v) => setMessagingConfig((p) => ({ ...p, welcome_messages: v }))} />
          <ToggleRow label="Expiry alerts" description="Reminders sent 7d, 3d, and 1d before expiry." value={messagingConfig.expiry_alerts} onChange={(v) => setMessagingConfig((p) => ({ ...p, expiry_alerts: v }))} />
          <ToggleRow label="Payment confirmations" description="Receipts and due reminders." value={messagingConfig.payment_confirmations} onChange={(v) => setMessagingConfig((p) => ({ ...p, payment_confirmations: v }))} />
          <ToggleRow label="Equipment alerts" description="Notify members when equipment is under maintenance." value={messagingConfig.equipment_alerts} onChange={(v) => setMessagingConfig((p) => ({ ...p, equipment_alerts: v }))} />
          <p className="gl2-eyebrow" style={{ marginTop: 10 }}>Engagement</p>
          <ToggleRow label="Inactivity alerts" description={'Send a "we miss you" text after 3+ days away.'} value={messagingConfig.inactivity_alerts} onChange={(v) => setMessagingConfig((p) => ({ ...p, inactivity_alerts: v }))} />
          <button type="button" className="gl2-btn gl2-btn-primary gl2-btn-lg" style={{ width: '100%', marginTop: 16 }} onClick={saveMessagingConfig} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>
        </EditSheet>
      )}

      {activeSheet === 'coupon' && (
        <EditSheet title="Activate subscription" onClose={() => { setActiveSheet(null); setCouponCode(''); }}>
          {activeSubInfo ? (
            <div style={{ background: 'var(--gl2-success-bg)', borderRadius: 12, padding: '12px 16px', marginBottom: 14 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--gl2-success-fg)' }}>✅ Active subscription</p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--gl2-muted)' }}>{activeSubInfo.label} — valid until {activeSubInfo.validUntil.toLocaleDateString('en-IN')}</p>
            </div>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--gl2-muted)', marginBottom: 14 }}>Enter a coupon code provided by Gymly to activate or extend your subscription.</p>
          )}
          <label className="gl2-field">
            <span className="gl2-field-label">Coupon code</span>
            <input type="text" className="gl2-input" style={{ letterSpacing: '.06em', fontFamily: 'monospace' }} placeholder="e.g. GYM1Y-XXXXXX" value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} />
          </label>
          <button type="button" className="gl2-btn gl2-btn-primary gl2-btn-lg" style={{ width: '100%', marginTop: 14 }} onClick={handleActivateCoupon} disabled={couponSaving || !couponCode.trim()}>{couponSaving ? 'Activating…' : '🎟️ Activate code'}</button>
          <div style={{ marginTop: 14, padding: 12, background: 'var(--gl2-primary-tint)', borderRadius: 10, fontSize: 11.5, color: 'var(--gl2-muted)', lineHeight: 1.5 }}>
            <strong>Available tiers:</strong> 1 Month · 3 Months · 6 Months · 1 Year<br />Each code is single-use. Codes can be stacked to extend access.
          </div>
        </EditSheet>
      )}
    </section>
  );
}
