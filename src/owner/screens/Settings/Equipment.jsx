import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { getGym, updateGym } from '../../../firebase/firestore';
import { storage } from '../../../firebase/config';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { compressImage } from '../../../firebase/storage';
import EditSheet from '../../components/EditSheet';
import EmptyState from '../../primitives/EmptyState';
import PageSkeleton from '../../primitives/PageSkeleton';
import { invalidateOwnerGym } from '../../hooks/useOwnerGym';

const MUSCLE_GROUPS = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Core', 'Cardio', 'Full Body', 'Glutes'];

export default function Equipment() {
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  const { showToast } = useToast();

  const [equipment, setEquipment] = useState([]);
  const [editingEquipment, setEditingEquipment] = useState(null);
  const [uploadingEquipImg, setUploadingEquipImg] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showSheet, setShowSheet] = useState(false);

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    getGym(userDoc.gym_id).then((g) => { if (g) setEquipment(g.equipment || []); setLoading(false); });
  }, [userDoc?.gym_id]);

  useEffect(() => () => { if (userDoc?.gym_id) invalidateOwnerGym(userDoc.gym_id); }, [userDoc?.gym_id]);

  const openAdd = () => { setEditingEquipment({ id: `eq_${Date.now()}`, name: '', photo: '', muscles: [] }); setShowSheet(true); };
  const openEdit = (eq) => { setEditingEquipment({ ...eq }); setShowSheet(true); };
  const closeSheet = () => { setShowSheet(false); setEditingEquipment(null); };

  const handleSaveEquipment = async () => {
    if (!editingEquipment?.name) { showToast('Equipment name required', 'error'); return; }
    const exists = equipment.find((e) => e.id === editingEquipment.id);
    const updated = exists ? equipment.map((e) => (e.id === editingEquipment.id ? editingEquipment : e)) : [...equipment, editingEquipment];
    setSaving(true);
    try {
      await updateGym(userDoc.gym_id, { equipment: updated });
      setEquipment(updated);
      showToast('Equipment saved!', 'success');
      closeSheet();
    } catch (e) { showToast(`Failed to save: ${e.message}`, 'error'); } finally { setSaving(false); }
  };

  const handleDeleteEquipment = async (eqId) => {
    const updated = equipment.filter((e) => e.id !== eqId);
    try { await updateGym(userDoc.gym_id, { equipment: updated }); setEquipment(updated); showToast('Equipment removed', 'success'); }
    catch (e) { console.error('Delete equipment error:', e); showToast('Failed to delete', 'error'); }
  };

  const handleEquipPhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingEquipImg(true);
    try {
      const storageRef = ref(storage, `gyms/${userDoc.gym_id}/equipment/${Date.now()}_${file.name}`);
      const compressed = await compressImage(file, 800, 0.85);
      await uploadBytes(storageRef, compressed, { contentType: 'image/webp', cacheControl: 'public,max-age=31536000' });
      const url = await getDownloadURL(storageRef);
      setEditingEquipment((prev) => ({ ...prev, photo: url }));
      showToast('Photo uploaded', 'success');
    } catch (err) {
      console.error('Equipment photo upload error:', err);
      showToast('Upload failed', 'error');
    } finally {
      setUploadingEquipImg(false);
      e.target.value = '';
    }
  };

  if (loading) return <PageSkeleton variant="grid" rows={6} />;

  return (
    <section data-screen-label="Gym equipment">
      <button type="button" className="gl2-back-link" onClick={() => navigate('/owner/settings')}>
        <span className="material-symbols-outlined" style={{ fontSize: 17 }}>arrow_back_ios</span>Settings
      </button>
      <div className="gl2-page-header">
        <h1 className="gl2-page-title">Gym equipment</h1>
        <button type="button" className="gl2-btn gl2-btn-primary" onClick={openAdd}>+ Add equipment</button>
      </div>

      <div className="gl2-card" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <span className="gl2-icon-btn" style={{ width: 44, height: 44, background: 'var(--gl2-primary-tint)', color: 'var(--gl2-primary-deep)' }}>
          <span className="material-symbols-outlined">fitness_center</span>
        </span>
        <div>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 17 }}>{equipment.length} equipment items</p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--gl2-muted)' }}>Track all your machines and gear</p>
        </div>
      </div>

      {equipment.length === 0 ? (
        <div className="gl2-list"><EmptyState title="No equipment added yet" sub="Add your first machine." /></div>
      ) : (
        <div className="gl2-grid-3">
          {equipment.map((eq) => (
            <div key={eq.id} className="gl2-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 52, height: 52, borderRadius: 12, overflow: 'hidden', flex: 'none', background: 'var(--gl2-primary-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {eq.photo ? <img src={eq.photo} alt={eq.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span className="material-symbols-outlined" style={{ color: 'var(--gl2-primary-deep)' }}>fitness_center</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 800 }}>{eq.name}</p>
                  {eq.muscles?.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                      {eq.muscles.slice(0, 3).map((m) => <span key={m} className="gl2-tag gl2-tag-neutral" style={{ fontSize: 10 }}>{m}</span>)}
                      {eq.muscles.length > 3 && <span className="gl2-tag" style={{ fontSize: 10, background: 'var(--gl2-divider)' }}>+{eq.muscles.length - 3}</span>}
                    </div>
                  ) : <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--gl2-muted)' }}>No muscles tagged</p>}
                </div>
                <button type="button" className="gl2-icon-btn" style={{ width: 34, height: 34 }} onClick={() => openEdit(eq)}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span></button>
                <button type="button" className="gl2-icon-btn danger" style={{ width: 34, height: 34 }} onClick={() => handleDeleteEquipment(eq.id)}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showSheet && editingEquipment && (
        <EditSheet title={equipment.find((e) => e.id === editingEquipment.id) ? 'Edit equipment' : 'Add equipment'} onClose={closeSheet}>
          {editingEquipment.photo ? (
            <div style={{ position: 'relative', width: '100%', height: 160, borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
              <img src={editingEquipment.photo} alt="Equipment" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button type="button" onClick={() => setEditingEquipment((p) => ({ ...p, photo: '' }))} style={{ position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: '50%', background: 'rgba(0,0,0,.5)', color: '#fff', border: 0, cursor: 'pointer' }}>✕</button>
            </div>
          ) : (
            <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 120, borderRadius: 14, border: '2px dashed var(--gl2-border)', cursor: 'pointer', marginBottom: 14 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 26, color: 'var(--gl2-muted)' }}>add_a_photo</span>
              <span style={{ fontSize: 13, color: 'var(--gl2-muted)', marginTop: 4 }}>{uploadingEquipImg ? 'Uploading…' : 'Upload equipment photo'}</span>
              <input type="file" hidden accept="image/*" onChange={handleEquipPhotoUpload} disabled={uploadingEquipImg} />
            </label>
          )}
          <label className="gl2-field" style={{ marginBottom: 14 }}>
            <span className="gl2-field-label">Equipment name</span>
            <input className="gl2-input" placeholder="e.g. Treadmill, Bench Press" value={editingEquipment.name} onChange={(e) => setEditingEquipment((p) => ({ ...p, name: e.target.value }))} />
          </label>
          <p className="gl2-field-label" style={{ marginBottom: 8 }}>Target muscles</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {MUSCLE_GROUPS.map((m) => {
              const selected = editingEquipment.muscles?.includes(m);
              return (
                <button key={m} type="button" className={`gl2-filter-chip ${selected ? 'active' : ''}`} onClick={() => setEditingEquipment((p) => ({ ...p, muscles: selected ? p.muscles.filter((x) => x !== m) : [...(p.muscles || []), m] }))}>{m}</button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="gl2-btn gl2-btn-secondary" style={{ flex: 1 }} onClick={closeSheet}>Cancel</button>
            <button type="button" className="gl2-btn gl2-btn-primary" style={{ flex: 2 }} onClick={handleSaveEquipment} disabled={saving}>{saving ? 'Saving…' : 'Save equipment'}</button>
          </div>
        </EditSheet>
      )}
    </section>
  );
}
