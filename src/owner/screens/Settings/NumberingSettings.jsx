import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { getGym } from '../../../firebase/firestore';
import {
  getNumberingSettings, saveNumberingSettings, initializeNumberingSettings,
  deriveGymPrefix, checkPrefixUniqueness, previewMemberNumber, previewEnrollmentNumber,
  MONTH_CODE_LABELS,
} from '../../../utils/numberingService';
import { ToggleRow } from '../../components/EditSheet';
import PageSkeleton from '../../primitives/PageSkeleton';

const MEMBER_VARS = ['{GYM_PREFIX}', '{MONTH}', '{YY}', '{YYYY}', '{SERIAL}'];
const ENROLLMENT_VARS = ['{JOIN_DATE}', '{PLAN_DURATION}', '{SERIAL}', '{MONTH}', '{GYM_CODE}', '{YY}'];

export default function NumberingSettings() {
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  const { showToast } = useToast();
  const templateRef = useRef(null);
  const enrollTemplateRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gym, setGym] = useState(null);

  const [gymPrefix, setGymPrefix] = useState('');
  const [memberTemplate, setMemberTemplate] = useState('{GYM_PREFIX}-{MONTH}{YY}-{SERIAL}');
  const [serialDigits, setSerialDigits] = useState(2);
  const [enrollTemplate, setEnrollTemplate] = useState('{JOIN_DATE}-{PLAN_DURATION}-{SERIAL}');
  const [enrollReset, setEnrollReset] = useState('monthly');
  const [prefixStatus, setPrefixStatus] = useState(null);
  const [prefixError, setPrefixError] = useState('');
  const [useEnrollmentIdForAdmin, setUseEnrollmentIdForAdmin] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      if (!userDoc?.gym_id) return;
      try {
        const gymData = await getGym(userDoc.gym_id);
        setGym(gymData);
        let settings = await getNumberingSettings(userDoc.gym_id);
        if (!settings) settings = await initializeNumberingSettings(userDoc.gym_id, gymData?.name || 'Gym');
        setGymPrefix(settings.gymPrefix || deriveGymPrefix(gymData?.name));
        setMemberTemplate(settings.memberNumberTemplate || '{GYM_PREFIX}-{MONTH}{YY}-{SERIAL}');
        setSerialDigits(settings.serialDigits || 2);
        setEnrollTemplate(settings.enrollmentTemplate || '{JOIN_DATE}-{PLAN_DURATION}-{SERIAL}');
        setEnrollReset(settings.enrollmentSerialReset || 'monthly');
        setUseEnrollmentIdForAdmin(settings.useEnrollmentIdForAdmin || false);
        setPrefixStatus('available');
      } catch (err) {
        console.error('Error loading numbering settings:', err);
        showToast('Failed to load numbering settings', 'error');
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userDoc?.gym_id]);

  const handlePrefixChange = async (val) => {
    const clean = val.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 5);
    setGymPrefix(clean);
    setPrefixError('');
    if (clean.length < 2) { setPrefixStatus(null); return; }
    setPrefixStatus('checking');
    try {
      const isAvailable = await checkPrefixUniqueness(clean, userDoc.gym_id);
      setPrefixStatus(isAvailable ? 'available' : 'taken');
      if (!isAvailable) setPrefixError('This prefix is already used by another gym');
    } catch (err) {
      console.error('Prefix uniqueness check error:', err);
      setPrefixStatus(null);
    }
  };

  const insertVariable = (variable, ref, isEnroll) => {
    if (!ref.current) return;
    const input = ref.current;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const newVal = input.value.substring(0, start) + variable + input.value.substring(end);
    if (isEnroll) setEnrollTemplate(newVal); else setMemberTemplate(newVal);
    setTimeout(() => { input.focus(); input.setSelectionRange(start + variable.length, start + variable.length); }, 0);
  };

  const handleSaveAdminPref = async () => {
    setSaving(true);
    try { await saveNumberingSettings(userDoc.gym_id, { useEnrollmentIdForAdmin }); showToast('Administration ID preference saved!', 'success'); }
    catch (e) { console.error('Save admin ID pref error:', e); showToast('Failed to save', 'error'); } finally { setSaving(false); }
  };

  const handleSave = async (section) => {
    if (prefixStatus === 'taken') { showToast('Please choose a unique gym prefix', 'error'); return; }
    if (gymPrefix.length < 2) { showToast('Gym prefix must be at least 2 characters', 'error'); return; }
    setSaving(true);
    try {
      const data = section === 'member'
        ? { gymPrefix: gymPrefix.toUpperCase(), memberNumberTemplate: memberTemplate, serialDigits, useEnrollmentIdForAdmin }
        : { enrollmentTemplate: enrollTemplate, enrollmentSerialReset: enrollReset, useEnrollmentIdForAdmin };
      await saveNumberingSettings(userDoc.gym_id, data);
      showToast(`${section === 'member' ? 'Member number' : 'Enrollment number'} format saved!`, 'success');
    } catch (err) {
      console.error('Save error:', err);
      showToast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const memberPreview = previewMemberNumber(memberTemplate, gymPrefix, serialDigits);
  const enrollPreview = previewEnrollmentNumber(enrollTemplate, gymPrefix);

  if (loading) return <PageSkeleton variant="card" />;

  return (
    <section data-screen-label="Numbering system">
      <button type="button" className="gl2-back-link" onClick={() => navigate('/owner/settings')}>
        <span className="material-symbols-outlined" style={{ fontSize: 17 }}>arrow_back_ios</span>Settings
      </button>
      <h1 className="gl2-page-title" style={{ marginBottom: 4 }}>Numbering system</h1>
      <p className="gl2-page-sub" style={{ marginBottom: 14 }}>Configure member numbers & enrollment codes</p>

      <div className="gl2-card" style={{ marginBottom: 14, maxWidth: 640 }}>
        <p className="gl2-card-title" style={{ marginBottom: 10 }}>Month code reference</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, fontSize: 11 }}>
          {Object.entries(MONTH_CODE_LABELS).map(([code, name]) => (
            <div key={code} style={{ display: 'flex', gap: 5, padding: '6px 8px', borderRadius: 8, background: 'var(--gl2-bg-soft)' }}>
              <span style={{ fontWeight: 800, color: 'var(--gl2-primary)', fontFamily: 'monospace' }}>{code}</span>
              <span style={{ color: 'var(--gl2-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="gl2-card" style={{ marginBottom: 14, maxWidth: 640 }}>
        <p className="gl2-card-title" style={{ marginBottom: 4 }}>Use enrollment ID for administration</p>
        <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--gl2-muted)' }}>
          When enabled, the member's latest Enrollment ID is shown prominently. Member ID is hidden and revealed only on click.
        </p>
        <ToggleRow label="Enabled" value={useEnrollmentIdForAdmin} onChange={setUseEnrollmentIdForAdmin} />
        <button type="button" className="gl2-btn gl2-btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={handleSaveAdminPref} disabled={saving}>{saving ? 'Saving…' : 'Save preference'}</button>
      </div>

      <div className="gl2-card" style={{ marginBottom: 14, maxWidth: 640 }}>
        <p className="gl2-card-title" style={{ marginBottom: 14 }}>🔢 Member number format</p>
        <label className="gl2-field" style={{ marginBottom: 14 }}>
          <span className="gl2-field-label">Gym prefix</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input className="gl2-input" style={{ fontFamily: 'monospace', textTransform: 'uppercase' }} value={gymPrefix} onChange={(e) => handlePrefixChange(e.target.value)} placeholder="YNH" maxLength={5} />
            {prefixStatus === 'checking' && <div className="spinner" style={{ width: 16, height: 16 }} />}
            {prefixStatus === 'available' && <span style={{ color: 'var(--gl2-success-fg)', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}>✓ Available</span>}
            {prefixStatus === 'taken' && <span style={{ color: 'var(--gl2-danger-fg)', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}>✕ Taken</span>}
          </div>
          {prefixError && <span className="gl2-field-error">{prefixError}</span>}
          <span style={{ fontSize: 11.5, color: 'var(--gl2-muted)' }}>Auto-derived from "{gym?.name || 'your gym name'}". Must be unique across all gyms.</span>
        </label>
        <label className="gl2-field" style={{ marginBottom: 10 }}>
          <span className="gl2-field-label">Template</span>
          <input ref={templateRef} className="gl2-input" style={{ fontFamily: 'monospace' }} value={memberTemplate} onChange={(e) => setMemberTemplate(e.target.value)} />
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {MEMBER_VARS.map((v) => <button key={v} type="button" className="gl2-filter-chip" style={{ fontFamily: 'monospace', fontSize: 12, minHeight: 32, padding: '0 10px' }} onClick={() => insertVariable(v, templateRef, false)}>{v}</button>)}
        </div>
        <label className="gl2-field" style={{ marginBottom: 14, maxWidth: 120 }}>
          <span className="gl2-field-label">Serial digits</span>
          <select className="gl2-select" value={serialDigits} onChange={(e) => setSerialDigits(Number(e.target.value))}>
            <option value={2}>2</option><option value={3}>3</option><option value={4}>4</option>
          </select>
        </label>
        <div style={{ padding: 12, borderRadius: 11, background: 'var(--gl2-primary-tint)', marginBottom: 14 }}>
          <p style={{ margin: '0 0 2px', fontSize: 10, fontWeight: 800, color: 'var(--gl2-muted)', textTransform: 'uppercase' }}>Live preview</p>
          <p style={{ margin: 0, fontSize: 19, fontWeight: 800, fontFamily: 'monospace', color: 'var(--gl2-primary-deep)' }}>{memberPreview}</p>
        </div>
        <button type="button" className="gl2-btn gl2-btn-primary gl2-btn-lg" style={{ width: '100%' }} onClick={() => handleSave('member')} disabled={saving || prefixStatus === 'taken'}>{saving ? 'Saving…' : 'Save member number format'}</button>
      </div>

      <div className="gl2-card" style={{ maxWidth: 640 }}>
        <p className="gl2-card-title" style={{ marginBottom: 14 }}>🧾 Enrollment number format</p>
        <label className="gl2-field" style={{ marginBottom: 10 }}>
          <span className="gl2-field-label">Template</span>
          <input ref={enrollTemplateRef} className="gl2-input" style={{ fontFamily: 'monospace' }} value={enrollTemplate} onChange={(e) => setEnrollTemplate(e.target.value)} />
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {ENROLLMENT_VARS.map((v) => <button key={v} type="button" className="gl2-filter-chip" style={{ fontFamily: 'monospace', fontSize: 12, minHeight: 32, padding: '0 10px' }} onClick={() => insertVariable(v, enrollTemplateRef, true)}>{v}</button>)}
        </div>
        <label className="gl2-field" style={{ marginBottom: 14, maxWidth: 140 }}>
          <span className="gl2-field-label">Serial resets</span>
          <select className="gl2-select" value={enrollReset} onChange={(e) => setEnrollReset(e.target.value)}>
            <option value="monthly">Monthly</option><option value="daily">Daily</option>
          </select>
        </label>
        <p className="gl2-field-label" style={{ marginBottom: 8 }}>Quick presets</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {[{ tmpl: '{JOIN_DATE}-{PLAN_DURATION}-{SERIAL}', label: 'JN01-06-01' }, { tmpl: '{GYM_CODE}-{MONTH}-{YY}-{SERIAL}', label: `${gymPrefix}-JN-26-01` }, { tmpl: '{MONTH}-{SERIAL}', label: 'JN-01' }].map((p) => (
            <button key={p.tmpl} type="button" className={`gl2-filter-chip ${enrollTemplate === p.tmpl ? 'active' : ''}`} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'monospace', fontSize: 12 }} onClick={() => setEnrollTemplate(p.tmpl)}>
              <span>{p.tmpl}</span><span style={{ fontWeight: 800 }}>{p.label}</span>
            </button>
          ))}
        </div>
        <div style={{ padding: 12, borderRadius: 11, background: 'var(--gl2-success-bg)', marginBottom: 14 }}>
          <p style={{ margin: '0 0 2px', fontSize: 10, fontWeight: 800, color: 'var(--gl2-muted)', textTransform: 'uppercase' }}>Live preview</p>
          <p style={{ margin: 0, fontSize: 19, fontWeight: 800, fontFamily: 'monospace', color: 'var(--gl2-success-fg)' }}>{enrollPreview}</p>
        </div>
        <button type="button" className="gl2-btn gl2-btn-lg" style={{ width: '100%', background: 'var(--gl2-success-fg)', color: '#fff' }} onClick={() => handleSave('enrollment')} disabled={saving}>{saving ? 'Saving…' : 'Save enrollment number format'}</button>
      </div>
    </section>
  );
}
