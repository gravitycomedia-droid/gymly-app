// Fingerprint card on the member profile (biometric gyms only).
// Badge (Not enrolled / Enrolled / Frozen / Re-enroll needed on X) and the
// "Add fingerprint" remote-enrollment flow (§6): the request is queued for
// the device, the owner asks the member to place their finger, and the card
// flips to "Enrolled ✓" when the template arrives (live enrollment doc). If
// the device can't enroll remotely, or nothing happens in 90 s, it shows the
// keypad fallback.

import { useEffect, useState } from 'react';
import useAttendanceMode from '../../hooks/useAttendanceMode';
import {
  getBioDevices, watchMemberEnrollment, requestBioEnroll, FINGERS,
} from '../../firebase/firestore-bio';

const ENROLL_TIMEOUT_MS = 90 * 1000;

function badgeFor(enr, devices) {
  if (!enr || !(enr.fingers || []).length) return ['Not enrolled', 'gl2-tag-neutral'];
  const reenroll = (enr.needsReenrollOn || []).map((sn) => devices.find((d) => d.sn === sn)?.label || sn);
  if (reenroll.length) return [`Re-enroll needed on ${reenroll.join(', ')}`, 'gl2-tag-expiring'];
  if (!enr.desiredOnDevice) return ['Frozen', 'gl2-tag-expired'];
  return [`Enrolled · ${enr.fingers.length} finger${enr.fingers.length > 1 ? 's' : ''}`, 'gl2-tag-active'];
}

function Fallback({ pin, name }) {
  return (
    <div style={{ background: 'var(--gl2-warning-bg)', borderRadius: 12, padding: '12px 14px', fontSize: 13, lineHeight: 1.55 }}>
      <strong>Enroll on the device keypad instead:</strong><br />
      Menu → User Mgt → find <strong style={{ fontFamily: 'monospace' }}>{pin} {name}</strong> → Enroll fingerprint (2 fingers).
      <br /><span style={{ color: 'var(--gl2-muted)', fontSize: 12 }}>The fingerprint is copied to Gymly automatically afterwards.</span>
    </div>
  );
}

export default function FingerprintPanel({ member, gymId, canEnroll = true }) {
  const { isBiometric } = useAttendanceMode(gymId);
  const [devices, setDevices] = useState([]);
  const [enr, setEnr] = useState(undefined);
  const [sn, setSn] = useState('');
  const [finger, setFinger] = useState(6);
  const [request, setRequest] = useState(null); // { at, sn, finger, pin } | { fallback: {pin} }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isBiometric || !gymId) return;
    getBioDevices(gymId).then((list) => {
      const active = list.filter((d) => d.status === 'active');
      setDevices(list);
      if (active.length) setSn((cur) => cur || active[0].sn);
    }).catch(() => setDevices([]));
  }, [isBiometric, gymId]);

  useEffect(() => {
    if (!isBiometric || !gymId || !member?.id) return undefined;
    return watchMemberEnrollment(gymId, member.id, setEnr);
  }, [isBiometric, gymId, member?.id]);

  useEffect(() => {
    if (!request?.at) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [request]);

  if (!isBiometric) return null;

  const activeDevices = devices.filter((d) => d.status === 'active');
  const [badge, badgeClass] = badgeFor(enr, devices);
  const device = devices.find((d) => d.sn === sn);
  const unsupported = device?.caps?.supportsEnroll === 'none';

  // Outcome of an in-flight request, from the live enrollment doc.
  const reqMs = request?.at || 0;
  const enrollState = enr?.enroll;
  const updatedMs = enrollState?.updatedAt?.toMillis?.() || 0;
  const fresh = request?.at && enrollState?.sn === request.sn && updatedMs >= reqMs - 5000;
  const done = fresh && enrollState.state === 'done';
  const failed = fresh && (enrollState.state === 'failed' || enrollState.state === 'timeout');
  const timedOut = request?.at && !done && now - reqMs > ENROLL_TIMEOUT_MS;

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await requestBioEnroll({ memberId: member.id, sn, fingerIndex: finger });
      setRequest({ at: Date.now(), sn, finger, pin: res.bioPin });
      setNow(Date.now());
    } catch (err) {
      if (err?.details?.bioPin) setRequest({ fallback: { pin: err.details.bioPin } });
      else setError(err?.message || 'Could not start enrollment');
    } finally {
      setBusy(false);
    }
  };

  const pin = enr?.bioPin || request?.pin || request?.fallback?.pin;

  return (
    <div className="gl2-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
        <p className="gl2-card-title" style={{ margin: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, verticalAlign: 'middle', marginRight: 6 }}>fingerprint</span>
          Fingerprint
        </p>
        {enr !== undefined && <span className={`gl2-tag ${badgeClass}`}>{badge}</span>}
      </div>
      {pin && <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--gl2-muted)' }}>Device user: <strong style={{ fontFamily: 'monospace' }}>{pin}</strong></p>}

      {activeDevices.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--gl2-muted)' }}>No fingerprint device is connected yet.</p>
      ) : !canEnroll ? null : request?.fallback || (request?.at && (failed || timedOut)) || unsupported ? (
        <>
          {request?.at && (failed || timedOut) && <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--gl2-danger-fg)', fontWeight: 600 }}>{timedOut && !failed ? 'The device didn’t respond in time.' : 'The device couldn’t take the remote request.'}</p>}
          <Fallback pin={pin || '—'} name={member.name} />
          {(request?.at || request?.fallback) && <button type="button" className="gl2-btn gl2-btn-secondary" style={{ marginTop: 10 }} onClick={() => setRequest(null)}>Back</button>}
        </>
      ) : done ? (
        <>
          <p style={{ margin: '0 0 10px', fontWeight: 800, color: 'var(--gl2-success-fg)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, verticalAlign: 'middle', marginRight: 4 }}>check_circle</span>
            Enrolled ✓
          </p>
          <button type="button" className="gl2-btn gl2-btn-secondary" onClick={() => setRequest(null)}>Add another finger</button>
        </>
      ) : request?.at ? (
        <div style={{ background: 'var(--gl2-primary-tint)', borderRadius: 12, padding: '12px 14px', fontSize: 13.5, lineHeight: 1.5 }}>
          <strong>Ask {member.name} to place their {FINGERS.find(([i]) => i === request.finger)?.[1].toLowerCase() || 'finger'} on the device now…</strong>
          <br /><span style={{ fontSize: 12.5, color: 'var(--gl2-muted)' }}>The device asks for the same finger 3 times. Waiting {Math.max(0, Math.ceil((ENROLL_TIMEOUT_MS - (now - reqMs)) / 1000))}s</span>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {activeDevices.length > 1 && (
            <label className="gl2-field" style={{ flex: '1 1 140px' }}>
              <span className="gl2-field-label">Device</span>
              <select className="gl2-input" value={sn} onChange={(e) => setSn(e.target.value)}>
                {activeDevices.map((d) => <option key={d.sn} value={d.sn}>{d.label || d.sn}</option>)}
              </select>
            </label>
          )}
          <label className="gl2-field" style={{ flex: '1 1 140px' }}>
            <span className="gl2-field-label">Finger</span>
            <select className="gl2-input" value={finger} onChange={(e) => setFinger(Number(e.target.value))}>
              {FINGERS.map(([i, label]) => <option key={i} value={i}>{label}{(enr?.fingers || []).includes(i) ? ' ✓' : ''}</option>)}
            </select>
          </label>
          <button type="button" className="gl2-btn gl2-btn-primary" onClick={start} disabled={busy || !sn}>
            {busy ? 'Sending…' : 'Add fingerprint'}
          </button>
          {error && <p style={{ width: '100%', margin: 0, fontSize: 13, color: 'var(--gl2-danger-fg)' }}>{error}</p>}
        </div>
      )}
    </div>
  );
}
