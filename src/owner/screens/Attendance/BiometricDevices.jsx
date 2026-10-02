import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { useSubscription } from '../../../hooks/useSubscription';
import useAttendanceMode, { setCachedAttendanceMode } from '../../../hooks/useAttendanceMode';
import useLiveOccupancy from '../../../hooks/useLiveOccupancy';
import {
  watchBioDevices, claimBioDevice, syncBioDevice, setBioDeviceStatus, setAttendanceMode,
  getUnmatchedPunches, deviceState, lastSeenText, BIOMETRIC_PLANS,
} from '../../../firebase/firestore-bio';
import EmptyState from '../../primitives/EmptyState';
import PageSkeleton from '../../primitives/PageSkeleton';

const SN_RE = /^[A-Za-z0-9]{6,32}$/;
const STATE_TAG = {
  online: ['gl2-tag-active', 'Online'],
  offline: ['gl2-tag-expired', 'Offline'],
  waiting: ['gl2-tag-expiring', 'Waiting'],
  disabled: ['gl2-tag-neutral', 'Disabled'],
};
const errMsg = (err) => err?.message || 'Something went wrong';

function Chip({ ok, label, hint }) {
  const icon = ok === true ? 'check_circle' : ok === false ? 'block' : 'schedule';
  const color = ok === true ? 'var(--gl2-success-fg)' : ok === false ? 'var(--gl2-danger-fg)' : 'var(--gl2-muted)';
  return (
    <span className="gl2-tag gl2-tag-neutral" title={hint} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span className="material-symbols-outlined" style={{ fontSize: 14, color }}>{icon}</span>{label}
    </span>
  );
}

function ModeCard({ mode, entitled, onChange, busy }) {
  const isBio = mode === 'biometric';
  return (
    <div className="gl2-card" style={{ marginBottom: 14 }}>
      <p className="gl2-card-title" style={{ marginBottom: 4 }}>Attendance mode</p>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--gl2-muted)' }}>
        A gym uses one check-in method at a time. QR check-in is turned off while fingerprint attendance is on.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className={`gl2-filter-chip ${!isBio ? 'active' : ''}`} style={{ flex: 1 }} disabled={busy || !isBio} onClick={() => onChange('qr')}>
          <span className="material-symbols-outlined" style={{ fontSize: 15, verticalAlign: 'middle', marginRight: 4 }}>qr_code_scanner</span>QR code
        </button>
        <button type="button" className={`gl2-filter-chip ${isBio ? 'active' : ''}`} style={{ flex: 1 }} disabled={busy || isBio || !entitled} onClick={() => onChange('biometric')}>
          <span className="material-symbols-outlined" style={{ fontSize: 15, verticalAlign: 'middle', marginRight: 4 }}>fingerprint</span>Fingerprint
        </button>
      </div>
      {!entitled && !isBio && (
        <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--gl2-warning-fg)', fontWeight: 600 }}>
          Fingerprint attendance is included in Premium (₹999) and Premium Plus (₹1,499).
        </p>
      )}
    </div>
  );
}

function ConfirmModeSheet({ target, onConfirm, onClose, busy }) {
  const toBio = target === 'biometric';
  return (
    <div className="gl2-overlay" style={{ position: 'fixed', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14, zIndex: 210 }} onClick={onClose}>
      <div className="gl2-card" style={{ maxWidth: 380, width: '100%' }} onClick={(e) => e.stopPropagation()}>
        <p style={{ margin: '0 0 8px', fontWeight: 800, fontSize: 17 }}>{toBio ? 'Switch to fingerprint attendance?' : 'Switch back to QR check-in?'}</p>
        <p style={{ margin: '0 0 16px', fontSize: 13.5, color: 'var(--gl2-muted)', lineHeight: 1.5 }}>
          {toBio
            ? 'The QR scanner, tablet and kiosk will stop accepting check-ins. Members check in with their fingerprint at the door device.'
            : 'Fingerprint devices stop receiving member changes (they keep the members already on them). QR scanner, tablet and kiosk check-ins start working again.'}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="gl2-btn gl2-btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button type="button" className="gl2-btn gl2-btn-primary" style={{ flex: 1 }} onClick={onConfirm} disabled={busy}>{busy ? 'Switching…' : 'Switch'}</button>
        </div>
      </div>
    </div>
  );
}

function DeviceCard({ device, onSync, onToggle, busy }) {
  const state = deviceState(device);
  const [tagClass, tagLabel] = STATE_TAG[state];
  const caps = device.caps || {};
  const enroll = caps.supportsEnroll === 'ENROLL_FP' || caps.supportsEnroll === 'ENROLL_BIO' ? true : caps.supportsEnroll === 'none' ? false : null;
  const door = caps.supportsDoorOpen === 'yes' ? true : caps.supportsDoorOpen === 'no' ? false : null;
  return (
    <div className="gl2-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span className="gl2-tag gl2-tag-neutral">
          <span className="material-symbols-outlined" style={{ fontSize: 13, verticalAlign: 'middle', marginRight: 3 }}>fingerprint</span>
          {caps.model || 'Fingerprint device'}
        </span>
        <span className={`gl2-tag ${tagClass}`}>{tagLabel}</span>
      </div>
      <p style={{ margin: 0, fontWeight: 800, fontSize: 16 }}>{device.label || 'Door device'}</p>
      <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--gl2-muted)', fontFamily: 'monospace' }}>{device.sn}</p>
      <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--gl2-muted)' }}>
        Last seen {lastSeenText(device.lastSeenAt)}
        {device.userCount != null && ` · ${device.userCount} users`}
        {device.fpCount != null && ` · ${device.fpCount} fingerprints`}
      </p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
        <Chip ok={enroll} label="Enroll from app" hint={enroll === null ? 'Not tested yet — try Add fingerprint on a member' : undefined} />
        <Chip ok={door} label="Door open" hint={door === null ? 'Not tested yet' : undefined} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        {device.status === 'active' && (
          <button type="button" className="gl2-btn gl2-btn-secondary" onClick={() => onSync(device)} disabled={busy}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>autorenew</span>Sync members
          </button>
        )}
        {device.status === 'active' && <button type="button" className="gl2-btn gl2-btn-secondary" onClick={() => onToggle(device, 'disabled')} disabled={busy}>Disable</button>}
        {device.status === 'disabled' && device.activatedAt && <button type="button" className="gl2-btn gl2-btn-secondary" onClick={() => onToggle(device, 'active')} disabled={busy}>Enable</button>}
      </div>
    </div>
  );
}

const DEVICE_STEPS = (server) => [
  ['Menu → Comm → Cloud Server Setting', 'On some eSSL models: Menu → Comm → ADMS'],
  ['Server mode', 'ADMS'],
  ['Enable Domain Name', 'ON'],
  ['Server address', server?.host || 'bio.gymly.online'],
  ['Server port', String(server?.port || 80)],
  ['Enable Proxy Server', 'OFF'],
  ['Save, then restart the device', 'Power it off and on — the time zone is only picked up on restart'],
];

function AddDeviceWizard({ devices, onClose, showToast }) {
  const [step, setStep] = useState(1);
  const [sn, setSn] = useState('');
  const [label, setLabel] = useState('Main door');
  const [claim, setClaim] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [startedAt, setStartedAt] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [syncResult, setSyncResult] = useState(null);
  const syncStarted = useRef(false);
  const connectedAt = useRef(null);

  const device = devices.find((d) => d.sn === claim?.sn);
  const connected = device?.status === 'active' && now - (device.lastSeenAt?.toMillis?.() || 0) < 2 * 60 * 1000;

  useEffect(() => {
    if (step !== 3) return undefined;
    const id = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(id);
  }, [step]);

  // Once connected, load every member onto the device. Wait for the device's
  // INFO answer (fingerprint algorithm) so stored templates can go too — or
  // 20 s, whichever comes first.
  useEffect(() => {
    if (!connected || syncStarted.current || !device) return;
    if (!connectedAt.current) connectedAt.current = Date.now();
    const algoKnown = device.caps?.fpAlgo != null;
    if (!algoKnown && Date.now() - connectedAt.current < 20000) return;
    syncStarted.current = true;
    syncBioDevice({ sn: device.sn })
      .then(setSyncResult)
      .catch((err) => setSyncResult({ error: errMsg(err) }));
  }, [connected, device, now]);

  const submitSn = async (e) => {
    e.preventDefault();
    const clean = sn.trim().toUpperCase();
    if (!SN_RE.test(clean)) { setError('Serial numbers are 6–32 letters or digits, no spaces.'); return; }
    setBusy(true);
    setError('');
    try {
      const res = await claimBioDevice({ sn: clean, label: label.trim() });
      setClaim(res);
      setStep(res.alreadyActive ? 3 : 2);
      setStartedAt(Date.now());
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const waitedMin = startedAt ? (now - startedAt) / 60000 : 0;

  return (
    <div className="gl2-overlay gl2-quicksheet-overlay" style={{ position: 'fixed', zIndex: 200 }} onClick={onClose}>
      <div className="gl2-quicksheet" style={{ maxWidth: 520, margin: '0 auto', borderRadius: 18, maxHeight: '92vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <p className="gl2-eyebrow" style={{ margin: 0 }}>Step {step} of 3</p>
        {step === 1 && (
          <>
            <p className="gl2-quicksheet-title">Add a fingerprint device</p>
            <div style={{ background: 'var(--gl2-warning-bg)', borderRadius: 12, padding: '10px 14px', marginBottom: 14, fontSize: 12.5, lineHeight: 1.5 }}>
              <strong>Only ADMS models work.</strong> Buy the model whose name ends in <strong>/ADMS</strong> (e.g. “K40 Pro/ID/ADMS”). Check the device has <strong>Menu → Comm → Cloud Server Setting</strong> (or <strong>ADMS</strong>). Devices without it, or set to ZKBio Zlink / BEST mode, can’t connect.
            </div>
            <form onSubmit={submitSn} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label className="gl2-field">
                <span className="gl2-field-label">Serial number</span>
                <input className="gl2-input" style={{ fontFamily: 'monospace', letterSpacing: '.04em' }} value={sn} onChange={(e) => setSn(e.target.value.replace(/\s/g, ''))} placeholder="e.g. CQZ7232260180" maxLength={32} autoFocus required />
                <span style={{ fontSize: 12, color: 'var(--gl2-muted)' }}>On the sticker behind the device, or Menu → System Info → Device Info.</span>
              </label>
              <label className="gl2-field">
                <span className="gl2-field-label">Name</span>
                <input className="gl2-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Main door" maxLength={40} />
              </label>
              {error && <p style={{ margin: 0, fontSize: 13, color: 'var(--gl2-danger-fg)', fontWeight: 600 }}>{error}</p>}
              <button type="submit" className="gl2-btn gl2-btn-primary gl2-btn-lg" disabled={busy || !sn.trim()}>{busy ? 'Registering…' : 'Next'}</button>
            </form>
          </>
        )}

        {step === 2 && (
          <>
            <p className="gl2-quicksheet-title">Set up the device</p>
            <p style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--gl2-muted)' }}>On <strong>{claim?.sn}</strong>, enter these values exactly. You have 30 minutes to finish.</p>
            <div className="gl2-summary-rows" style={{ marginBottom: 16 }}>
              {DEVICE_STEPS(claim?.server).map(([k, v]) => (
                <div key={k} className="gl2-summary-row"><span className="gl2-summary-label">{k}</span><span className="gl2-summary-value" style={{ fontFamily: v.length < 24 ? 'monospace' : undefined }}>{v}</span></div>
              ))}
            </div>
            <button type="button" className="gl2-btn gl2-btn-primary gl2-btn-lg" style={{ width: '100%' }} onClick={() => setStep(3)}>I’ve restarted the device</button>
          </>
        )}

        {step === 3 && (
          <>
            <p className="gl2-quicksheet-title">{connected ? 'Connected ✓' : 'Waiting for the device…'}</p>
            <div className="gl2-card" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 30, color: connected ? 'var(--gl2-success-fg)' : 'var(--gl2-muted)' }}>{connected ? 'sensors' : 'sensors_off'}</span>
              <div>
                <p style={{ margin: 0, fontWeight: 700 }}>{device?.label || label} · <span style={{ fontFamily: 'monospace' }}>{claim?.sn}</span></p>
                <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--gl2-muted)' }}>
                  {connected ? `Last seen ${lastSeenText(device.lastSeenAt)}${device.caps?.model ? ` · ${device.caps.model}` : ''}` : 'This updates on its own as soon as the device calls in.'}
                </p>
              </div>
            </div>

            {connected && (
              <div style={{ background: 'var(--gl2-primary-tint)', borderRadius: 12, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
                {!syncResult && 'Loading your active members onto the device…'}
                {syncResult?.error && <span style={{ color: 'var(--gl2-danger-fg)' }}>Couldn’t load members: {syncResult.error}. Use “Sync members” on the device card.</span>}
                {syncResult && !syncResult.error && (
                  <>✓ {syncResult.upserts} active members queued{syncResult.templates ? `, ${syncResult.templates} fingerprints` : ''}. They appear on the device within a minute as “PIN Name”.</>
                )}
              </div>
            )}

            {!connected && waitedMin >= 10 && (
              <div style={{ background: 'var(--gl2-warning-bg)', borderRadius: 12, padding: '12px 14px', marginBottom: 14, fontSize: 12.5, lineHeight: 1.6 }}>
                <strong>Still nothing? Check:</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  <li>The device has internet at the door (try its network test).</li>
                  <li>The server address is exactly <strong>bio.gymly.online</strong> — no http://, no spaces.</li>
                  <li>The Cloud Server Setting / ADMS menu exists (otherwise this model can’t connect).</li>
                  <li>Try port <strong>8081</strong> instead of 80, then restart again.</li>
                  <li>More than 30 minutes since step 1? Close this and add the device again.</li>
                </ul>
              </div>
            )}
            <button type="button" className="gl2-btn gl2-btn-primary gl2-btn-lg" style={{ width: '100%' }} onClick={() => { if (!connected) showToast('The device will appear as soon as it connects', 'info'); onClose(); }}>
              {connected ? 'Done' : 'Close — keep waiting in the background'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function UnmatchedPunches({ gymId }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!open || rows) return;
    getUnmatchedPunches(gymId).then(setRows).catch(() => setRows([]));
  }, [open, rows, gymId]);
  return (
    <div className="gl2-card" style={{ marginTop: 14 }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="gl2-card-title" style={{ margin: 0 }}>Unrecognised punches</span>
        <span className="material-symbols-outlined" style={{ color: 'var(--gl2-muted)', transform: open ? 'rotate(90deg)' : undefined }}>chevron_right</span>
      </button>
      {open && (
        <>
          <p style={{ margin: '6px 0 10px', fontSize: 12.5, color: 'var(--gl2-muted)' }}>Fingerprints that opened the door but aren’t a Gymly member — usually admins added on the keypad (PIN below 1000).</p>
          {!rows ? <p style={{ fontSize: 13, color: 'var(--gl2-muted)' }}>Loading…</p> : rows.length === 0 ? <p style={{ fontSize: 13, color: 'var(--gl2-muted)' }}>None — every punch matched a member.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {rows.map((r) => (
                <div key={r.id} className="gl2-row">
                  <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>PIN {r.pin}</span>
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--gl2-muted)' }}>{r.at?.toDate ? r.at.toDate().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''}</span>
                  <span className="gl2-tag gl2-tag-neutral">{r.reason === 'device_local_pin' ? 'Device admin' : 'Unknown PIN'}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function BiometricDevices() {
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  const { showToast } = useToast();
  const gymId = userDoc?.gym_id;
  const { plan } = useSubscription();
  const { mode, loading: modeLoading } = useAttendanceMode(gymId);
  const { occupancy } = useLiveOccupancy(gymId);

  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmMode, setConfirmMode] = useState(null);
  const [busy, setBusy] = useState(false);

  const entitled = BIOMETRIC_PLANS.includes(plan);
  const isBio = mode === 'biometric';

  useEffect(() => {
    if (!gymId) return undefined;
    return watchBioDevices(gymId, (list) => { setDevices(list); setLoading(false); }, () => setLoading(false));
  }, [gymId]);

  const changeMode = async () => {
    setBusy(true);
    try {
      const res = await setAttendanceMode({ mode: confirmMode });
      setCachedAttendanceMode(gymId, res.mode);
      showToast(res.mode === 'biometric' ? 'Fingerprint attendance is on' : 'QR check-in is back on', 'success');
      setConfirmMode(null);
    } catch (err) {
      showToast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleSync = async (device) => {
    setBusy(true);
    try {
      const r = await syncBioDevice({ sn: device.sn });
      showToast(`Queued ${r.upserts} members${r.deletes ? `, removing ${r.deletes} expired` : ''}`, 'success');
    } catch (err) {
      showToast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleToggle = async (device, status) => {
    setBusy(true);
    try {
      await setBioDeviceStatus({ sn: device.sn, status });
      showToast(status === 'disabled' ? 'Device disabled' : 'Device enabled', 'success');
    } catch (err) {
      showToast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const online = devices.filter((d) => deviceState(d) === 'online').length;

  return (
    <section data-screen-label="Fingerprint devices">
      <button type="button" className="gl2-back-link" onClick={() => navigate('/owner/settings')}>
        <span className="material-symbols-outlined" style={{ fontSize: 17 }}>arrow_back_ios</span>Settings
      </button>
      <div className="gl2-page-header">
        <div>
          <h1 className="gl2-page-title">Fingerprint devices</h1>
          <p className="gl2-page-sub">{devices.length ? `${online} of ${devices.length} online · ` : ''}{occupancy} inside now</p>
        </div>
        {isBio && entitled && <button type="button" className="gl2-btn gl2-btn-primary" onClick={() => setShowAdd(true)}>+ Add device</button>}
      </div>

      {isBio && !entitled && (
        <div className="gl2-card" style={{ marginBottom: 14, background: 'var(--gl2-warning-bg)', borderColor: 'transparent' }}>
          <p style={{ margin: '0 0 4px', fontWeight: 800 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 17, verticalAlign: 'middle', marginRight: 6 }}>pause_circle</span>
            Device sync is paused
          </p>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
            Your plan no longer includes fingerprint attendance. Your devices keep working for the members already on them, but new members, renewals and expiries won’t reach the devices until you’re back on Premium or Premium Plus.
          </p>
          <button type="button" className="gl2-btn gl2-btn-primary" style={{ marginTop: 10 }} onClick={() => navigate('/owner/subscription')}>See plans</button>
        </div>
      )}

      {modeLoading ? <PageSkeleton variant="kpis" rows={1} /> : (
        <ModeCard mode={mode} entitled={entitled} busy={busy} onChange={setConfirmMode} />
      )}

      {loading ? (
        <PageSkeleton variant="grid" rows={2} />
      ) : devices.length === 0 ? (
        <div className="gl2-list">
          <EmptyState
            title="No fingerprint devices yet"
            sub={isBio ? 'Add your ZKTeco or eSSL device. Members are loaded onto it automatically, and expired members are removed every night.' : 'Turn on fingerprint attendance above, then add your door device.'}
            action={isBio && entitled ? <button type="button" className="gl2-btn gl2-btn-primary" onClick={() => setShowAdd(true)}>+ Add first device</button> : null}
          />
        </div>
      ) : (
        <div className="gl2-grid-3">
          {devices.map((d) => <DeviceCard key={d.sn} device={d} busy={busy} onSync={handleSync} onToggle={handleToggle} />)}
        </div>
      )}

      {gymId && devices.length > 0 && <UnmatchedPunches gymId={gymId} />}

      <button type="button" className="gl2-btn gl2-btn-secondary" style={{ width: '100%', marginTop: 14 }} onClick={() => navigate('/owner/attendance')}>
        View attendance analytics
      </button>

      {showAdd && <AddDeviceWizard devices={devices} showToast={showToast} onClose={() => setShowAdd(false)} />}
      {confirmMode && <ConfirmModeSheet target={confirmMode} busy={busy} onConfirm={changeMode} onClose={() => setConfirmMode(null)} />}
    </section>
  );
}
