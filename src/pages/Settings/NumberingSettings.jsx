import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getGym } from '../../firebase/firestore';
import {
  getNumberingSettings, saveNumberingSettings, initializeNumberingSettings,
  deriveGymPrefix, checkPrefixUniqueness, previewMemberNumber, previewEnrollmentNumber,
  MONTH_CODES, MONTH_CODE_LABELS,
} from '../../utils/numberingService';
import './Settings.css';

const MEMBER_VARS = [
  { key: '{GYM_PREFIX}', label: 'Gym Prefix', example: 'YNH' },
  { key: '{MONTH}', label: 'Month Code', example: 'JN' },
  { key: '{YY}', label: 'Year (2-digit)', example: '26' },
  { key: '{YYYY}', label: 'Year (4-digit)', example: '2026' },
  { key: '{SERIAL}', label: 'Serial #', example: '01' },
];

const ENROLLMENT_VARS = [
  { key: '{JOIN_DATE}', label: 'Join Date', example: 'JN01' },
  { key: '{PLAN_DURATION}', label: 'Plan Duration', example: '06' },
  { key: '{SERIAL}', label: 'Serial #', example: '01' },
  { key: '{MONTH}', label: 'Month Code', example: 'JN' },
  { key: '{GYM_CODE}', label: 'Gym Code', example: 'YNH' },
  { key: '{YY}', label: 'Year', example: '26' },
];

const NumberingSettings = () => {
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  const { showToast } = useToast();
  const templateRef = useRef(null);
  const enrollTemplateRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gym, setGym] = useState(null);

  // Settings state
  const [gymPrefix, setGymPrefix] = useState('');
  const [memberTemplate, setMemberTemplate] = useState('{GYM_PREFIX}-{MONTH}{YY}-{SERIAL}');
  const [serialDigits, setSerialDigits] = useState(2);
  const [enrollTemplate, setEnrollTemplate] = useState('{JOIN_DATE}-{PLAN_DURATION}-{SERIAL}');
  const [enrollReset, setEnrollReset] = useState('monthly');

  // UI state
  const [prefixStatus, setPrefixStatus] = useState(null); // 'available' | 'taken' | 'checking' | null
  const [prefixError, setPrefixError] = useState('');

  useEffect(() => {
    loadSettings();
  }, [userDoc?.gym_id]);

  const loadSettings = async () => {
    if (!userDoc?.gym_id) return;

    try {
      const gymData = await getGym(userDoc.gym_id);
      setGym(gymData);

      let settings = await getNumberingSettings(userDoc.gym_id);
      if (!settings) {
        settings = await initializeNumberingSettings(userDoc.gym_id, gymData?.name || 'Gym');
      }

      setGymPrefix(settings.gymPrefix || deriveGymPrefix(gymData?.name));
      setMemberTemplate(settings.memberNumberTemplate || '{GYM_PREFIX}-{MONTH}{YY}-{SERIAL}');
      setSerialDigits(settings.serialDigits || 2);
      setEnrollTemplate(settings.enrollmentTemplate || '{JOIN_DATE}-{PLAN_DURATION}-{SERIAL}');
      setEnrollReset(settings.enrollmentSerialReset || 'monthly');
      setPrefixStatus('available');
    } catch (err) {
      console.error('Error loading numbering settings:', err);
      showToast('Failed to load numbering settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePrefixChange = async (val) => {
    const clean = val.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 5);
    setGymPrefix(clean);
    setPrefixError('');

    if (clean.length < 2) {
      setPrefixStatus(null);
      return;
    }

    setPrefixStatus('checking');
    try {
      const isAvailable = await checkPrefixUniqueness(clean, userDoc.gym_id);
      setPrefixStatus(isAvailable ? 'available' : 'taken');
      if (!isAvailable) {
        setPrefixError('This prefix is already used by another gym');
      }
    } catch (err) {
      setPrefixStatus(null);
    }
  };

  const insertVariable = (variable, ref) => {
    if (!ref.current) return;
    const input = ref.current;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const currentVal = input.value;
    const newVal = currentVal.substring(0, start) + variable + currentVal.substring(end);

    if (ref === templateRef) {
      setMemberTemplate(newVal);
    } else {
      setEnrollTemplate(newVal);
    }

    // Restore cursor after variable
    setTimeout(() => {
      input.focus();
      const newPos = start + variable.length;
      input.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const handleSave = async (section) => {
    if (prefixStatus === 'taken') {
      showToast('Please choose a unique gym prefix', 'error');
      return;
    }
    if (gymPrefix.length < 2) {
      showToast('Gym prefix must be at least 2 characters', 'error');
      return;
    }

    setSaving(true);
    try {
      const data = section === 'member'
        ? {
          gymPrefix: gymPrefix.toUpperCase(),
          memberNumberTemplate: memberTemplate,
          serialDigits,
        }
        : {
          enrollmentTemplate: enrollTemplate,
          enrollmentSerialReset: enrollReset,
        };

      await saveNumberingSettings(userDoc.gym_id, data);
      showToast(`${section === 'member' ? 'Member number' : 'Enrollment number'} format saved!`, 'success');
    } catch (err) {
      console.error('Save error:', err);
      showToast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Live previews
  const memberPreview = previewMemberNumber(memberTemplate, gymPrefix, serialDigits);
  const enrollPreview = previewEnrollmentNumber(enrollTemplate, gymPrefix);

  if (loading) {
    return (
      <div className="mesh-bg min-h-screen flex items-center justify-center">
        <div className="spinner spinner-primary" style={{ width: 32, height: 32 }} />
      </div>
    );
  }

  return (
    <div className="mesh-bg min-h-screen pb-24 md:pb-0 font-body-md antialiased pt-[80px]">

      {/* Mobile Header */}
      <header className="md:hidden fixed top-0 left-0 w-full z-50 bg-surface/30 backdrop-blur-3xl px-4 h-16 flex items-center shadow-sm">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-on-surface-variant hover:text-primary transition-colors">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <span className="font-display-lg text-xl ml-2 font-bold text-on-surface">Numbering System</span>
      </header>

      <main className="max-w-2xl mx-auto px-4 md:px-gutter mt-4 md:mt-0">

        {/* Page Title */}
        <div className="mb-6">
          <h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface mb-1">Numbering System</h2>
          <p className="font-body-md text-body-md text-on-surface-variant">Configure member numbers & enrollment codes</p>
        </div>

        {/* Month Code Reference */}
        <div className="glass-panel rounded-2xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>calendar_month</span>
            <span className="font-label-md text-sm text-on-surface font-semibold">Month Code Reference</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5 text-[11px]">
            {Object.entries(MONTH_CODE_LABELS).map(([code, name]) => (
              <div key={code} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-surface-variant/30">
                <span className="font-bold text-primary font-mono">{code}</span>
                <span className="text-on-surface-variant truncate">{name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ═════════════════════════ MEMBER NUMBER FORMAT ═════════════════════════ */}
        <div className="glass-panel rounded-2xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <span style={{ fontSize: 20 }}>🔢</span>
            <h3 className="font-headline-md text-lg text-on-surface font-semibold">Member Number Format</h3>
          </div>

          {/* Gym Prefix */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-on-surface-variant mb-1.5">Gym Prefix</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                className="glass-input rounded-xl px-4 py-2.5 font-mono text-base tracking-wider uppercase flex-1"
                value={gymPrefix}
                onChange={(e) => handlePrefixChange(e.target.value)}
                placeholder="YNH"
                maxLength={5}
                id="gym-prefix-input"
              />
              {prefixStatus === 'checking' && (
                <div className="spinner" style={{ width: 18, height: 18 }} />
              )}
              {prefixStatus === 'available' && (
                <span className="text-[#1D9E75] text-sm font-semibold flex items-center gap-1">
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check_circle</span> Available
                </span>
              )}
              {prefixStatus === 'taken' && (
                <span className="text-error text-sm font-semibold flex items-center gap-1">
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>error</span> Taken
                </span>
              )}
            </div>
            {prefixError && <p className="text-error text-[11px] mt-1">{prefixError}</p>}
            <p className="text-on-surface-variant text-[11px] mt-1">
              Auto-derived from "{gym?.name || 'your gym name'}". Must be unique across all gyms.
            </p>
          </div>

          {/* Template */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-on-surface-variant mb-1.5">Template</label>
            <input
              ref={templateRef}
              type="text"
              className="glass-input rounded-xl px-4 py-2.5 font-mono text-sm w-full"
              value={memberTemplate}
              onChange={(e) => setMemberTemplate(e.target.value)}
              id="member-template-input"
            />
          </div>

          {/* Variable Chips */}
          <div className="mb-4">
            <label className="block text-[11px] font-medium text-on-surface-variant mb-2 uppercase tracking-wider">Tap to insert</label>
            <div className="flex flex-wrap gap-1.5">
              {MEMBER_VARS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => insertVariable(v.key, templateRef)}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-mono font-semibold border transition-all hover:scale-105 active:scale-95"
                  style={{
                    background: 'rgba(83,74,183,0.06)',
                    borderColor: 'rgba(83,74,183,0.15)',
                    color: 'var(--primary)',
                  }}
                >
                  {v.key}
                </button>
              ))}
            </div>
          </div>

          {/* Serial Digits */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-on-surface-variant mb-1.5">Serial Digits</label>
            <select
              className="glass-input rounded-xl px-4 py-2.5 w-24"
              value={serialDigits}
              onChange={(e) => setSerialDigits(Number(e.target.value))}
              id="serial-digits-select"
            >
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
            </select>
          </div>

          {/* Live Preview */}
          <div className="rounded-xl p-4 mb-4" style={{ background: 'rgba(83,74,183,0.05)', border: '1px dashed rgba(83,74,183,0.2)' }}>
            <div className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-1 font-semibold">Live Preview</div>
            <div className="text-xl font-bold text-primary font-mono tracking-wider">{memberPreview}</div>
          </div>

          {/* Save */}
          <button
            onClick={() => handleSave('member')}
            disabled={saving || prefixStatus === 'taken'}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-secondary text-white font-label-md hover:opacity-90 transition-opacity disabled:opacity-50"
            id="save-member-format-btn"
          >
            {saving ? <div className="spinner" style={{ width: 18, height: 18, margin: '0 auto' }} /> : 'Save Member Number Format'}
          </button>
        </div>

        {/* ═════════════════════════ ENROLLMENT NUMBER FORMAT ═════════════════════════ */}
        <div className="glass-panel rounded-2xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <span style={{ fontSize: 20 }}>🧾</span>
            <h3 className="font-headline-md text-lg text-on-surface font-semibold">Enrollment Number Format</h3>
          </div>

          {/* Template */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-on-surface-variant mb-1.5">Template</label>
            <input
              ref={enrollTemplateRef}
              type="text"
              className="glass-input rounded-xl px-4 py-2.5 font-mono text-sm w-full"
              value={enrollTemplate}
              onChange={(e) => setEnrollTemplate(e.target.value)}
              id="enrollment-template-input"
            />
          </div>

          {/* Variable Chips */}
          <div className="mb-4">
            <label className="block text-[11px] font-medium text-on-surface-variant mb-2 uppercase tracking-wider">Tap to insert</label>
            <div className="flex flex-wrap gap-1.5">
              {ENROLLMENT_VARS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => insertVariable(v.key, enrollTemplateRef)}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-mono font-semibold border transition-all hover:scale-105 active:scale-95"
                  style={{
                    background: 'rgba(29,158,117,0.06)',
                    borderColor: 'rgba(29,158,117,0.15)',
                    color: '#1D9E75',
                  }}
                >
                  {v.key}
                </button>
              ))}
            </div>
          </div>

          {/* Serial Reset */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-on-surface-variant mb-1.5">Serial Resets</label>
            <select
              className="glass-input rounded-xl px-4 py-2.5 w-32"
              value={enrollReset}
              onChange={(e) => setEnrollReset(e.target.value)}
              id="serial-reset-select"
            >
              <option value="monthly">Monthly</option>
              <option value="daily">Daily</option>
            </select>
          </div>

          {/* Preset Templates */}
          <div className="mb-4">
            <label className="block text-[11px] font-medium text-on-surface-variant mb-2 uppercase tracking-wider">Quick Presets</label>
            <div className="flex flex-col gap-2">
              {[
                { tmpl: '{JOIN_DATE}-{PLAN_DURATION}-{SERIAL}', label: 'JN01-06-01' },
                { tmpl: '{GYM_CODE}-{MONTH}-{YY}-{SERIAL}', label: `${gymPrefix}-JN-26-01` },
                { tmpl: '{MONTH}-{SERIAL}', label: 'JN-01' },
              ].map((p) => (
                <button
                  key={p.tmpl}
                  type="button"
                  onClick={() => setEnrollTemplate(p.tmpl)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl border text-left transition-all text-sm ${
                    enrollTemplate === p.tmpl
                      ? 'bg-[#1D9E75]/8 border-[#1D9E75]/30 text-[#1D9E75]'
                      : 'bg-surface-variant/20 border-outline-variant/30 text-on-surface-variant'
                  }`}
                >
                  <span className="font-mono text-[12px]">{p.tmpl}</span>
                  <span className="font-mono text-[12px] font-bold">{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Live Preview */}
          <div className="rounded-xl p-4 mb-4" style={{ background: 'rgba(29,158,117,0.05)', border: '1px dashed rgba(29,158,117,0.2)' }}>
            <div className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-1 font-semibold">Live Preview</div>
            <div className="text-xl font-bold font-mono tracking-wider" style={{ color: '#1D9E75' }}>{enrollPreview}</div>
          </div>

          {/* Save */}
          <button
            onClick={() => handleSave('enrollment')}
            disabled={saving}
            className="w-full py-3 rounded-xl text-white font-label-md hover:opacity-90 transition-opacity disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #1D9E75, #378ADD)' }}
            id="save-enrollment-format-btn"
          >
            {saving ? <div className="spinner" style={{ width: 18, height: 18, margin: '0 auto' }} /> : 'Save Enrollment Number Format'}
          </button>
        </div>

      </main>
    </div>
  );
};

export default NumberingSettings;
