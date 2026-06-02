import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  getKioskDevicesRealtime,
  createKioskDevice,
  deleteKioskDevice,
  updateKioskDevice,
  regeneratePairingCode,
} from '../../firebase/firestore-kiosk';
import useLiveOccupancy from '../../hooks/useLiveOccupancy';
import './KioskDevices.css';

const formatLastSeen = (ts) => {
  if (!ts) return 'Never';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

const formatCountdown = (expiry) => {
  if (!expiry) return '0:00';
  const d = expiry.toDate ? expiry.toDate() : new Date(expiry);
  const secs = Math.max(0, Math.floor((d - Date.now()) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

// ─── Add Device Bottom Sheet ──────────────────────────────────────
const AddDeviceSheet = ({ gymId, onClose, onSuccess }) => {
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
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="kd-sheet-backdrop" onClick={onClose}>
      <div className="kd-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="kd-sheet-handle" />
        <h2 className="kd-sheet-title">Add New Kiosk Device</h2>
        <p className="kd-sheet-sub">A 6-digit pairing code will be generated after you tap Add.</p>
        <form onSubmit={submit} className="kd-sheet-form">
          <div className="kd-field">
            <label className="kd-label">Device Name *</label>
            <input className="kd-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Front Desk Kiosk" maxLength={40} required />
          </div>
          <div className="kd-field">
            <label className="kd-label">Mode</label>
            <div className="kd-mode-toggle">
              <button type="button" className={`kd-mode-btn ${mode === 'both' ? 'active' : ''}`} onClick={() => setMode('both')}>
                <span className="material-symbols-outlined">sync_alt</span> Both
              </button>
              <button type="button" className={`kd-mode-btn ${mode === 'entry' ? 'active' : ''}`} onClick={() => setMode('entry')}>
                <span className="material-symbols-outlined">login</span> Entry
              </button>
              <button type="button" className={`kd-mode-btn ${mode === 'exit' ? 'active' : ''}`} onClick={() => setMode('exit')}>
                <span className="material-symbols-outlined">logout</span> Exit
              </button>
            </div>
          </div>
          <div className="kd-field">
            <label className="kd-label">Location (optional)</label>
            <input className="kd-input" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Main Entrance" maxLength={60} />
          </div>
          <button type="submit" className="kd-submit-btn" disabled={loading || !name.trim()}>
            {loading ? 'Generating...' : 'Generate Pairing Code →'}
          </button>
        </form>
      </div>
    </div>
  );
};

// ─── Pairing Code Modal ───────────────────────────────────────────
const PairingCodeModal = ({ pairingCode, deviceName, onClose }) => {
  const [timeLeft, setTimeLeft] = useState(300);
  useEffect(() => {
    const id = setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  const mins = Math.floor(timeLeft / 60);
  const secs = (timeLeft % 60).toString().padStart(2, '0');
  const expired = timeLeft === 0;

  return (
    <div className="kd-modal-backdrop">
      <div className="kd-modal">
        <div className="kd-modal-icon">📱</div>
        <h2 className="kd-modal-title">Pair: {deviceName}</h2>
        <p className="kd-modal-sub">Enter this code on the kiosk device to complete pairing.</p>
        <div className={`kd-pairing-code ${expired ? 'expired' : ''}`}>
          {pairingCode.split('').map((d, i) => <span key={i}>{d}</span>)}
        </div>
        {expired ? (
          <div className="kd-code-expired">Code expired. Please regenerate from the devices list.</div>
        ) : (
          <div className="kd-code-timer">
            Expires in <strong>{mins}:{secs}</strong>
          </div>
        )}
        <button className="kd-modal-close" onClick={onClose}>Done</button>
      </div>
    </div>
  );
};

// ─── Device Card ──────────────────────────────────────────────────
const DeviceCard = ({ device, onDelete, onRegenerate }) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [regen, setRegen] = useState(false);
  const [regenCode, setRegenCode] = useState(null);

  const statusColors = {
    active: { bg: '#e1f5ee', color: '#1D9E75', dot: '#1D9E75' },
    pairing: { bg: '#fff3d6', color: '#EF9F27', dot: '#EF9F27' },
    inactive: { bg: '#f0edef', color: '#787584', dot: '#787584' },
  };
  const s = statusColors[device.status] || statusColors.inactive;

  const handleRegenerate = async () => {
    setRegen(true);
    try {
      const code = await regeneratePairingCode(device.id);
      setRegenCode(code);
      onRegenerate && onRegenerate(code, device.name);
    } catch (_) {} finally {
      setRegen(false);
    }
  };

  return (
    <div className="kd-device-card">
      <div className="kd-device-card-top">
        {/* Mode badge */}
        <div className={`kd-mode-chip ${device.mode}`}>
          <span className="material-symbols-outlined">
            {device.mode === 'entry' ? 'login' : device.mode === 'exit' ? 'logout' : 'sync_alt'}
          </span>
          {device.mode === 'entry' ? 'Entry' : device.mode === 'exit' ? 'Exit' : 'Entry & Exit'}
        </div>
        <div className="kd-device-status" style={{ background: s.bg, color: s.color }}>
          <span className="kd-status-dot" style={{ background: s.dot }} />
          {device.status === 'active' ? 'Active' : device.status === 'pairing' ? 'Pairing' : 'Inactive'}
        </div>
      </div>

      <div className="kd-device-name">{device.name}</div>
      {device.location && <div className="kd-device-location">📍 {device.location}</div>}

      <div className="kd-device-meta">
        <div className="kd-meta-item">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>schedule</span>
          {formatLastSeen(device.lastSeen)}
        </div>
        {device.status === 'pairing' && device.pairingCode && (
          <div className="kd-meta-item" style={{ color: '#EF9F27', fontWeight: 600 }}>
            Code: {device.pairingCode} · {formatCountdown(device.pairingExpiry)}
          </div>
        )}
      </div>

      <div className="kd-device-actions">
        {device.status !== 'active' ? (
          <button className="kd-action-btn regen" onClick={handleRegenerate} disabled={regen}>
            <span className="material-symbols-outlined">refresh</span>
            {regen ? 'Regenerating...' : 'New Code'}
          </button>
        ) : (
          <button className="kd-action-btn deactivate" onClick={() => updateKioskDevice(device.id, { status: 'inactive' })}>
            <span className="material-symbols-outlined">pause_circle</span>Deactivate
          </button>
        )}
        {confirmDelete ? (
          <div className="kd-confirm-row">
            <button className="kd-action-btn danger" onClick={() => onDelete(device.id)}>Confirm Delete</button>
            <button className="kd-action-btn" onClick={() => setConfirmDelete(false)}>Cancel</button>
          </div>
        ) : (
          <button className="kd-action-btn delete" onClick={() => setConfirmDelete(true)}>
            <span className="material-symbols-outlined">delete</span>Delete
          </button>
        )}
      </div>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────
const KioskDevices = () => {
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
    const unsub = getKioskDevicesRealtime(gymId, (list) => {
      setDevices(list);
      setLoading(false);
    });
    return () => unsub();
  }, [gymId]);

  const handleDelete = async (deviceId) => {
    try {
      await deleteKioskDevice(deviceId);
      showToast('Device removed', 'success');
    } catch (_) {
      showToast('Failed to remove device', 'error');
    }
  };

  const handleAddSuccess = (code, name) => {
    setPairingCode(code);
    setPairingDeviceName(name);
    showToast('Device created — enter the code on your kiosk', 'success');
  };

  const handleRegenerate = (code, name) => {
    setPairingCode(code);
    setPairingDeviceName(name);
  };

  return (
    <div className="kd-screen">
      {/* Fixed header */}
      <div className="kd-header">
        <button className="kd-back-btn" onClick={() => navigate(-1)}>
          <span className="material-symbols-outlined">arrow_back_ios</span>
        </button>
        <div className="kd-header-center">
          <h1 className="kd-header-title">Kiosk Devices</h1>
          <div className="kd-live-badge">
            <span className="kd-live-dot" />
            {occupancy} inside now
          </div>
        </div>
        <button className="kd-add-btn" onClick={() => setShowAdd(true)}>
          <span className="material-symbols-outlined">add</span>
        </button>
      </div>

      <div className="kd-content">
        {/* Kiosk links */}
        <div className="kd-kiosk-links">
          <a href="/kiosk/entry" target="_blank" rel="noreferrer" className="kd-link-card entry">
            <span className="material-symbols-outlined">sync_alt</span>
            <span>Open Smart Kiosk</span>
            <span className="material-symbols-outlined" style={{ fontSize: 16, marginLeft: 'auto' }}>open_in_new</span>
          </a>
        </div>

        {/* Device list */}
        {loading ? (
          <div className="kd-loading"><div className="spinner spinner-primary" /></div>
        ) : devices.length === 0 ? (
          <div className="kd-empty">
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#c8c4d5' }}>point_of_sale</span>
            <h3>No kiosk devices yet</h3>
            <p>Add a device to start tracking entry and exit attendance with QR codes.</p>
            <button className="kd-empty-btn" onClick={() => setShowAdd(true)}>
              + Add First Device
            </button>
          </div>
        ) : (
          <div className="kd-devices-grid">
            {devices.map((d) => (
              <DeviceCard key={d.id} device={d} onDelete={handleDelete} onRegenerate={handleRegenerate} />
            ))}
          </div>
        )}

        {/* Analytics link */}
        <button className="kd-analytics-link" onClick={() => navigate('/owner/attendance')}>
          <span className="material-symbols-outlined">bar_chart</span>
          View Attendance Analytics
          <span className="material-symbols-outlined" style={{ marginLeft: 'auto', fontSize: 18 }}>chevron_right</span>
        </button>
      </div>

      {showAdd && <AddDeviceSheet gymId={gymId} onClose={() => setShowAdd(false)} onSuccess={handleAddSuccess} />}
      {pairingCode && (
        <PairingCodeModal
          pairingCode={pairingCode}
          deviceName={pairingDeviceName}
          onClose={() => setPairingCode(null)}
        />
      )}
    </div>
  );
};

export default KioskDevices;
