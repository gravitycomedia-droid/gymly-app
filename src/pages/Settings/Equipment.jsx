import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getGym, updateGym } from '../../firebase/firestore';
import { storage } from '../../firebase/config';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const MUSCLE_GROUPS = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Core', 'Cardio', 'Full Body', 'Glutes'];

const MUSCLE_ICONS = {
  Chest: 'fitness_center',
  Back: 'sports_gymnastics',
  Shoulders: 'sports_handball',
  Biceps: 'sports_martial_arts',
  Triceps: 'sports_martial_arts',
  Legs: 'directions_run',
  Core: 'self_improvement',
  Cardio: 'monitor_heart',
  'Full Body': 'accessibility_new',
  Glutes: 'directions_walk',
};

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
    getGym(userDoc.gym_id).then(g => {
      if (g) setEquipment(g.equipment || []);
      setLoading(false);
    });
  }, [userDoc?.gym_id]);

  const emptyEquipment = () => ({
    id: `eq_${Date.now()}`,
    name: '',
    photo: '',
    muscles: [],
  });

  const openAdd = () => {
    setEditingEquipment(emptyEquipment());
    setShowSheet(true);
  };

  const openEdit = (eq) => {
    setEditingEquipment({ ...eq });
    setShowSheet(true);
  };

  const closeSheet = () => {
    setShowSheet(false);
    setEditingEquipment(null);
  };

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
      closeSheet();
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
      <div className="min-h-screen bg-mesh flex justify-center items-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mesh text-on-surface font-body-md pb-24">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 bg-surface/30 backdrop-blur-3xl border-b border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.1)]">
        <div className="flex justify-between items-center px-4 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/owner/settings')}
              className="w-10 h-10 rounded-full glass-panel flex items-center justify-center text-on-surface hover:bg-white/20 transition-colors"
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <div>
              <p className="font-label-sm text-[10px] text-on-surface-variant uppercase tracking-wider">Gym Configuration</p>
              <h1 className="font-headline-sm text-lg font-bold text-on-surface">Gym Equipment</h1>
            </div>
          </div>
          <button
            onClick={openAdd}
            className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-secondary flex items-center justify-center text-white shadow-lg hover:scale-105 active:scale-95 transition-transform"
          >
            <span className="material-symbols-outlined">add</span>
          </button>
        </div>
      </header>

      <main className="pt-28 px-4 max-w-3xl mx-auto space-y-8">

        {/* KPI Card */}
        <div className="glass-panel rounded-2xl p-6 flex flex-col md:flex-row gap-6 justify-between items-center bg-white/40">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-2xl">fitness_center</span>
            </div>
            <div>
              <h2 className="font-headline-md font-bold">{equipment.length} Equipment Items</h2>
              <p className="text-label-md text-on-surface-variant">Track all your machines and gear</p>
            </div>
          </div>
          <button
            onClick={openAdd}
            className="px-6 py-3 rounded-xl bg-primary text-white font-label-md shadow-md hover:-translate-y-0.5 transition-all w-full md:w-auto"
          >
            Add Equipment
          </button>
        </div>

        {/* Equipment List */}
        <section>
          <h3 className="font-label-md text-outline mb-4 ml-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">sports_gymnastics</span>
            EQUIPMENT
          </h3>
          <div className="space-y-4">
            {equipment.length === 0 ? (
              <div className="glass-panel p-8 rounded-2xl text-center text-on-surface-variant border border-dashed border-outline-variant">
                No equipment added yet. Add your first machine!
              </div>
            ) : (
              equipment.map(eq => (
                <EquipmentCard
                  key={eq.id}
                  equipment={eq}
                  onEdit={() => openEdit(eq)}
                  onDelete={() => handleDeleteEquipment(eq.id)}
                />
              ))
            )}
          </div>
        </section>
      </main>

      {/* Bottom Sheet Overlay */}
      {showSheet && editingEquipment && (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(12px)' }}
          onClick={closeSheet}
        >
          <div
            className="w-full glass-panel rounded-t-3xl p-5 pb-10 max-h-[90vh] overflow-y-auto"
            style={{ animation: 'slideSheetUp 300ms cubic-bezier(0.16, 1, 0.3, 1)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Sheet Handle */}
            <div className="w-10 h-1 rounded-full bg-outline-variant mx-auto mb-5" />

            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-on-surface">
                {equipment.find(e => e.id === editingEquipment.id) ? 'Edit Equipment' : 'Add Equipment'}
              </h2>
              <button
                onClick={closeSheet}
                className="w-8 h-8 rounded-full glass-panel flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Photo Preview */}
            {editingEquipment.photo ? (
              <div className="relative w-full h-44 rounded-2xl overflow-hidden mb-5">
                <img src={editingEquipment.photo} alt="Equipment" className="w-full h-full object-cover" />
                <button
                  onClick={() => setEditingEquipment(p => ({ ...p, photo: '' }))}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-32 rounded-2xl border-2 border-dashed border-outline-variant cursor-pointer mb-5 hover:bg-white/10 transition-colors">
                <span className="material-symbols-outlined text-3xl text-outline mb-2">add_a_photo</span>
                <span className="text-sm text-on-surface-variant">
                  {uploadingEquipImg ? 'Uploading...' : 'Upload Equipment Photo'}
                </span>
                <input type="file" hidden accept="image/*" onChange={handleEquipPhotoUpload} disabled={uploadingEquipImg} />
              </label>
            )}

            {/* Name Input */}
            <div className="mb-4">
              <label className="block text-sm font-semibold text-on-surface-variant mb-2">Equipment Name *</label>
              <input
                type="text"
                className="input-field"
                placeholder="E.g. Treadmill, Bench Press"
                value={editingEquipment.name}
                onChange={e => setEditingEquipment(p => ({ ...p, name: e.target.value }))}
              />
            </div>

            {/* Muscle Groups */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-on-surface-variant mb-3">Target Muscles</label>
              <div className="flex flex-wrap gap-2">
                {MUSCLE_GROUPS.map(m => {
                  const selected = editingEquipment.muscles?.includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        if (selected) {
                          setEditingEquipment(p => ({ ...p, muscles: p.muscles.filter(x => x !== m) }));
                        } else {
                          setEditingEquipment(p => ({ ...p, muscles: [...(p.muscles || []), m] }));
                        }
                      }}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                        selected
                          ? 'bg-primary text-white border-primary shadow-sm'
                          : 'bg-transparent text-on-surface-variant border-outline-variant hover:border-primary/50'
                      }`}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                className="flex-1 py-3 rounded-xl border border-outline-variant text-on-surface-variant font-semibold text-sm hover:bg-white/10 transition-colors"
                onClick={closeSheet}
              >
                Cancel
              </button>
              <button
                className="flex-2 px-8 py-3 rounded-xl bg-primary text-white font-semibold text-sm shadow-md hover:-translate-y-0.5 transition-all disabled:opacity-60"
                style={{ flex: 2 }}
                onClick={handleSaveEquipment}
                disabled={saving}
              >
                {saving ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </span>
                ) : 'Save Equipment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EquipmentCard({ equipment: eq, onEdit, onDelete }) {
  return (
    <div className="glass-panel rounded-2xl p-5 hover:bg-white/50 transition-colors group relative overflow-hidden">
      <div className="flex items-center gap-4">
        {/* Icon / Photo */}
        <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0">
          {eq.photo ? (
            <img src={eq.photo} alt={eq.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-primary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-2xl">fitness_center</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-on-surface text-base leading-tight">{eq.name}</h4>
          {eq.muscles?.length > 0 ? (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {eq.muscles.slice(0, 3).map(m => (
                <span key={m} className="text-[10px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full uppercase tracking-wide">
                  {m}
                </span>
              ))}
              {eq.muscles.length > 3 && (
                <span className="text-[10px] font-semibold bg-outline-variant/30 text-on-surface-variant px-2 py-0.5 rounded-full">
                  +{eq.muscles.length - 3} more
                </span>
              )}
            </div>
          ) : (
            <p className="text-xs text-on-surface-variant mt-1">No muscles tagged</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onEdit}
            className="w-9 h-9 rounded-full glass-panel flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">edit</span>
          </button>
          <button
            onClick={onDelete}
            className="w-9 h-9 rounded-full flex items-center justify-center text-error bg-error/10 hover:bg-error/20 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </div>
      </div>
    </div>
  );
}
