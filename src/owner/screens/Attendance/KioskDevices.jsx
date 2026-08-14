import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import {
  getKioskDevicesRealtime, createKioskDevice, deleteKioskDevice, updateKioskDevice, regeneratePairingCode,
} from '../../../firebase/firestore-kiosk';
import useLiveOccupancy from '../../../hooks/useLiveOccupancy';
import EmptyState from '../../primitives/EmptyState';
import PageSkeleton from '../../primitives/PageSkeleton';

const formatLastSeen = (ts) => {
  if (!ts) return 'Never';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};
const formatCountdown = (expiry) => {
  if (!expiry) return '0:00';
  const secs = Math.max(0, Math.floor(((expiry.toDate ? expiry.toDate() : new Date(expiry)) - Date.now()) / 1000));
  return `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}`;
};

function AddDeviceSheet({ gymId, onClose, onSuccess }) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState('both');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const { pairingCode } = await createKioskDevice(gymId, { name: name.trim(), mode, location: location.trim() });
      onSuccess(pairingCode, name.trim());
      onClose();
    } catch (err) {
      console.error('Create kiosk device error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="gl2-overlay gl2-quicksheet-overlay" style={{ position: 'fixed', zIndex: 200 }} onClick={onClose}>
      <div className="gl2-quicksheet" style={{ maxWidth: 480, margin: '0 auto', borderRadius: 18 }} onClick={(e) => e.stopPropagation()}>
        <p className="gl2-quicksheet-title">Add kiosk device</p>
        <p style={{ margin: '0 0 14px', fontSize: 13.5, color: 'var(--gl2-muted)' }}>A 6-digit pairing code will be generated after you tap add.</p>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label className="gl2-field">
            <span className="gl2-field-label">Device name</span>
            <input className="gl2-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Front Desk Kiosk" maxLength={40} required />
          </label>
          <label className="gl2-field">
            <span className="gl2-field-label">Mode</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {[['both', 'sync_alt', 'Both'], ['entry', 'login', 'Entry'], ['exit', 'logout', 'Exit']].map(([v, icon, label]) => (
                <button key={v} type="button" className={`gl2-filter-chip ${mode === v ? 'active' : ''}`} style={{ flex: 1 }} onClick={() => setMode(v)}>
                  <span className="material-symbols-outlined" style={{ fontSize: 15, verticalAlign: 'middle', marginRight: 4 }}>{icon}</span>{label}
                </button>
              ))}
            </div>
          </label>
          <label className="gl2-field">
            <span className="gl2-field-label">Location (optional)</span>
            <input className="gl2-input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Main entrance" maxLength={60} />
          </label>
          <button type="submit" className="gl2-btn gl2-btn-primary gl2-btn-lg" disabled={loading || !name.trim()}>
            {loading ? 'Generating…' : 'Generate pairing code'}
          </button>
        </form>
      </div>
    </div>
  );
}

function PairingCodeModal({ pairingCode, deviceName, onClose }) {
  const [timeLeft, setTimeLeft] = useState(300);
  useEffect(() => { const id = setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000); return () => clearInterval(id); }, []);
  const mins = Math.floor(timeLeft / 60);
  const secs = (timeLeft % 60).toString().padStart(2, '0');
  const expired = timeLeft === 0;

  return (
    <div className="gl2-overlay" style={{ position: 'fixed', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14, zIndex: 210 }}>
      <div className="gl2-card" style={{ maxWidth: 340, width: '100%', textAlign: 'center' }}>
        <p style={{ fontSize: 34, margin: '0 0 8px' }}>📱</p>
        <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 17 }}>Pair: {deviceName}</p>
        <p style={{ margin: '0 0 16px', fontSize: 13.5, color: 'var(--gl2-muted)' }}>Enter this code on the kiosk device to complete pairing.</p>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 14 }}>
          {pairingCode.split('').map((d, i) => (
            <span key={i} style={{ width: 34, height: 44, borderRadius: 9, background: expired ? 'var(--gl2-danger-bg)' : 'var(--gl2-primary-tint)', color: expired ? 'var(--gl2-danger-fg)' : 'var(--gl2-primary-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800 }}>{d}</span>
          ))}
        </div>
        {expired ? <p style={{ color: 'var(--gl2-danger-fg)', fontSize: 13 }}>Code expired. Regenerate from the devices list.</p> : <p style={{ fontSize: 13, color: 'var(--gl2-muted)' }}>Expires in <strong>{mins}:{secs}</strong></p>}
        <button type="button" className="gl2-btn gl2-btn-primary gl2-btn-lg" style={{ width: '100%', marginTop: 10 }} onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

function DeviceCard({ device, onDelete, onRegenerate }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [regen, setRegen] = useState(false);

  const status = device.status === 'active' ? 'active' : device.status === 'pairing' ? 'expiring' : 'neutral';
  const statusLabel = device.status === 'active' ? 'Active' : device.status === 'pairing' ? 'Pairing' : 'Inactive';

  const handleRegenerate = async () => {
    setRegen(true);
    try {
      const code = await regeneratePairingCode(device.id);
      onRegenerate?.(code, device.name);
    } catch (err) {
      console.error('Regenerate pairing code error:', err);
    } finally {
      setRegen(false);
    }
  };

  return (
    <div className="gl2-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <span className="gl2-tag gl2-tag-neutral">
          <span className="material-symbols-outlined" style={{ fontSize: 13, verticalAlign: 'middle', marginRight: 3 }}>{device.mode === 'entry' ? 'login' : device.mode === 'exit' ? 'logout' : 'sync_alt'}</span>
          {device.mode === 'entry' ? 'Entry' : device.mode === 'exit' ? 'Exit' : 'Entry & exit'}
        </span>
        <span className={`gl2-tag gl2-tag-${status}`}>{statusLabel}</span>
      </div>
      <p style={{ margin: 0, fontWeight: 800, fontSize: 16 }}>{device.name}</p>
      {device.location && <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--gl2-muted)' }}>📍 {device.location}</p>}
      <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--gl2-muted)' }}>Last seen {formatLastSeen(device.lastSeen)}</p>
      {device.status === 'pairing' && device.pairingCode && (
        <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--gl2-warning-fg)', fontWeight: 700 }}>Code: {device.pairingCode} · {formatCountdown(device.pairingExpiry)}</p>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        {device.status !== 'active' ? (
          <button type="button" className="gl2-btn gl2-btn-secondary" onClick={handleRegenerate} disabled={regen}>{regen ? 'Regenerating…' : 'New code'}</button>
        ) : (
          <button type="button" className="gl2-btn gl2-btn-secondary" onClick={() => updateKioskDevice(device.id, { status: 'inactive' })}>Deactivate</button>
        )}
        {confirmDelete ? (
          <>
            <button type="button" className="gl2-btn gl2-btn-danger" onClick={() => onDelete(device.id)}>Confirm delete</button>
            <button type="button" className="gl2-btn gl2-btn-secondary" onClick={() => setConfirmDelete(false)}>Cancel</button>
          </>
        ) : (
          <button type="button" className="gl2-btn gl2-btn-danger" onClick={() => setConfirmDelete(true)}>Delete</button>
        )}
      </div>
    </div>
  );
}

export default function KioskDevices() {
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  const { showToast } = useToast();
  const gymId = userDoc?.gym_id;

  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [pairingCode, setPairingCode] = useState(null);
  const [pairingDeviceName, setPairingDeviceName] = useState('');
  const { occupancy } = useLiveOccupancy(gymId);

  useEffect(() => {
    if (!gymId) return;
    const unsub = getKioskDevicesRealtime(gymId, (list) => { setDevices(list); setLoading(false); });
    return () => unsub();
  }, [gymId]);

  const handleDelete = async (deviceId) => {
    try { await deleteKioskDevice(deviceId); showToast('Device removed', 'success'); } catch (err) { console.error(err); showToast('Failed to remove device', 'error'); }
  };
  const handleAddSuccess = (code, name) => { setPairingCode(code); setPairingDeviceName(name); showToast('Device created — enter the code on your kiosk', 'success'); };
  const handleRegenerate = (code, name) => { setPairingCode(code); setPairingDeviceName(name); };

  return (
    <section data-screen-label="Kiosk devices">
      <div className="gl2-page-header">
        <div>
          <h1 className="gl2-page-title">Kiosk devices</h1>
          <p className="gl2-page-sub">{occupancy} inside now</p>
        </div>
        <button type="button" className="gl2-btn gl2-btn-primary" onClick={() => setShowAdd(true)}>+ Add device</button>
      </div>

      <a href="/kiosk/entry" target="_blank" rel="noreferrer" className="gl2-card" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, textDecoration: 'none', color: 'var(--gl2-ink)' }}>
        <span className="material-symbols-outlined" style={{ color: 'var(--gl2-primary)' }}>sync_alt</span>
        <span style={{ fontWeight: 700 }}>Open smart kiosk</span>
        <span className="material-symbols-outlined" style={{ fontSize: 16, marginLeft: 'auto', color: 'var(--gl2-muted)' }}>open_in_new</span>
      </a>

      {loading ? (
        <PageSkeleton variant="grid" rows={3} />
      ) : devices.length === 0 ? (
        <div className="gl2-list">
          <EmptyState title="No kiosk devices yet" sub="Add a device to start tracking entry and exit attendance with QR codes." action={<button type="button" className="gl2-btn gl2-btn-primary" onClick={() => setShowAdd(true)}>+ Add first device</button>} />
        </div>
      ) : (
        <div className="gl2-grid-3">
          {devices.map((d) => <DeviceCard key={d.id} device={d} onDelete={handleDelete} onRegenerate={handleRegenerate} />)}
        </div>
      )}

      <button type="button" className="gl2-btn gl2-btn-secondary" style={{ width: '100%', marginTop: 14 }} onClick={() => navigate('/owner/attendance')}>
        View attendance analytics
      </button>

      {showAdd && <AddDeviceSheet gymId={gymId} onClose={() => setShowAdd(false)} onSuccess={handleAddSuccess} />}
      {pairingCode && <PairingCodeModal pairingCode={pairingCode} deviceName={pairingDeviceName} onClose={() => setPairingCode(null)} />}
    </section>
  );
}
