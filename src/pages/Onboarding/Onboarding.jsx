import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getGym, updateGym, createStaffMember } from '../../firebase/firestore';
import { trackEvent } from '../../lib/analytics';
import { uploadLogo } from '../../firebase/storage';
import { capPhoneDigits } from '../../utils/helpers';
import AuthShell from '../Login/AuthShell';

const STEPS = [
  { label: 'Gym details', title: 'Tell us about the gym', sub: 'This shows on receipts, the membership card and your public page.' },
  { label: 'First plan', title: 'Add your first plan', sub: 'Pick one to start with — you can add the rest later. Nothing enrols a member without a plan.' },
  { label: 'Your team', title: 'Bring your team in', sub: 'Add reception and trainers so payments and check-ins are traceable. They sign in with their own phone number at the login screen.' },
  { label: 'Members', title: 'Get your members in', sub: 'Already keeping a register or an Excel sheet? Import it and skip the typing.' },
];

const PRESETS = [
  { name: 'Monthly Gym', detail: '1 month · the plan most gyms start with', price: 1200, duration: 30 },
  { name: 'Quarterly Gym', detail: '3 months · usually priced at a small discount', price: 3200, duration: 90 },
  { name: 'Annual Gym', detail: '12 months · best for cash flow', price: 11000, duration: 365 },
];

const PRESET_ROLES = [
  { role: 'receptionist', label: 'Reception desk', sub: 'Front desk & payments' },
  { role: 'trainer', label: 'Trainer', sub: 'Workouts & assigned members' },
];

const firstPendingStep = (setupStatus) => {
  for (let n = 1; n <= 4; n++) {
    if (!setupStatus?.[n]) return n;
  }
  return null; // all 4 have a status — go to done
};

const Onboarding = () => {
  const navigate = useNavigate();
  const { userDoc, refreshGymDoc } = useAuth();
  const { showToast } = useToast();
  const logoInputRef = useRef(null);

  const [gym, setGym] = useState(null);
  const [loadingGym, setLoadingGym] = useState(true);
  const [screen, setScreen] = useState('wizard'); // 'wizard' | 'done'
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1 — gym details
  const [address, setAddress] = useState('');
  const [openTime, setOpenTime] = useState('');
  const [closeTime, setCloseTime] = useState('');
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState('');

  // Step 2 — first plan
  const [planPick, setPlanPick] = useState(0); // index into PRESETS, or null for custom
  const [customPlanName, setCustomPlanName] = useState('');
  const [customPlanPrice, setCustomPlanPrice] = useState('');

  // Step 3 — team
  const [invites, setInvites] = useState(PRESET_ROLES.map((r) => ({ ...r, added: false })));
  const [inviteForm, setInviteForm] = useState(null); // { index, name, phone } | { extra: true, name, phone, role }

  // Step 4 — members
  const [importPick, setImportPick] = useState(null);

  useEffect(() => {
    const load = async () => {
      if (!userDoc?.gym_id) return;
      try {
        const g = await getGym(userDoc.gym_id);
        setGym(g);
        setAddress(g?.address || '');
        setOpenTime(g?.working_hours?.open || '');
        setCloseTime(g?.working_hours?.close || '');
        const pending = firstPendingStep(g?.setup_status);
        if (pending == null) {
          setScreen('done');
        } else {
          setStep(pending);
        }
      } catch (err) {
        console.error('Error loading gym:', err);
        showToast('Failed to load gym data', 'error');
      } finally {
        setLoadingGym(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userDoc?.gym_id]);

  const persistSetupStatus = async (n, status) => {
    const next = { ...(gym?.setup_status || {}), [n]: status };
    await updateGym(gym.id, { [`setup_status.${n}`]: status });
    setGym((g) => ({ ...g, setup_status: next }));
    return next;
  };

  const advanceAfter = (next) => {
    if (step === 4) {
      // Last wizard step cleared — the only place onboarding reaches 'done'.
      trackEvent('gym_setup_completed', {});
      setScreen('done');
    } else {
      setStep(step + 1);
    }
    return next;
  };

  const handleLogoPick = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast('File size must be under 2MB', 'error');
      return;
    }
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const saveStep1 = async () => {
    setSaving(true);
    try {
      let logo_url = gym?.logo_url || '';
      if (logoFile) {
        try {
          logo_url = await uploadLogo(gym.id, logoFile);
        } catch (err) {
          console.error('Logo upload failed:', err);
          showToast('Logo upload failed — continuing without it.', 'error');
        }
      }
      await updateGym(gym.id, { address: address.trim(), working_hours: { open: openTime.trim(), close: closeTime.trim() }, logo_url });
      setGym((g) => ({ ...g, address: address.trim(), working_hours: { open: openTime, close: closeTime }, logo_url }));
      await persistSetupStatus(1, 'done');
      await refreshGymDoc(gym.id);
      advanceAfter();
    } catch (err) {
      console.error('Save step 1 error:', err);
      showToast('Could not save — please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveStep2 = async () => {
    let plan;
    if (planPick != null) {
      const preset = PRESETS[planPick];
      plan = { id: `plan_${Date.now()}`, name: preset.name, type: 'preset', price: preset.price, duration_days: preset.duration, benefits: [], is_active: true };
    } else {
      if (!customPlanName.trim() || !customPlanPrice) {
        showToast('Enter a plan name and price', 'error');
        return;
      }
      plan = { id: `plan_${Date.now()}`, name: customPlanName.trim(), type: 'custom', price: Number(customPlanPrice), duration_days: 30, benefits: [], is_active: true };
    }
    setSaving(true);
    try {
      const plans = [...(gym?.settings?.plans || []), plan];
      await updateGym(gym.id, { 'settings.plans': plans });
      setGym((g) => ({ ...g, settings: { ...(g.settings || {}), plans } }));
      await persistSetupStatus(2, 'done');
      await refreshGymDoc(gym.id);
      advanceAfter();
    } catch (err) {
      console.error('Save step 2 error:', err);
      showToast('Could not save the plan — please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const submitInvite = async () => {
    if (!inviteForm) return;
    if (!inviteForm.name.trim() || inviteForm.phone.length !== 10) {
      showToast('Enter a name and 10-digit number', 'error');
      return;
    }
    setSaving(true);
    try {
      const role = inviteForm.role || PRESET_ROLES[inviteForm.index]?.role;
      await createStaffMember({
        name: inviteForm.name.trim(),
        phone: `+91${inviteForm.phone}`,
        role,
        gym_id: gym.id,
        permissions: [],
        subscription_expiry: null, payment_status: null, plan_id: null, start_date: null,
        height: null, weight: null, goal: null, experience: null, medical_notes: null,
      });
      if (inviteForm.index != null) {
        setInvites((prev) => prev.map((r, i) => (i === inviteForm.index ? { ...r, added: true } : r)));
      } else {
        setInvites((prev) => [...prev, { role, label: inviteForm.name.trim(), sub: role, added: true }]);
      }
      showToast(`${inviteForm.name.trim()} added — they can sign in with their number.`, 'success');
      setInviteForm(null);
    } catch (err) {
      console.error('Add staff error:', err);
      showToast('Could not add them — please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveStep3 = async () => {
    setSaving(true);
    try {
      await persistSetupStatus(3, 'done');
      advanceAfter();
    } finally {
      setSaving(false);
    }
  };

  const saveStep4 = async (pick) => {
    setImportPick(pick);
    setSaving(true);
    try {
      await persistSetupStatus(4, pick === 'later' ? 'skipped' : 'done');
      if (pick === 'import') {
        showToast('Import isn’t available yet — add members manually or do this later.', 'info');
      }
      advanceAfter();
    } finally {
      setSaving(false);
    }
  };

  const skip = async () => {
    setSaving(true);
    try {
      await persistSetupStatus(step, 'skipped');
      advanceAfter();
    } finally {
      setSaving(false);
    }
  };

  const back = () => { if (step > 1) setStep(step - 1); };

  const doneCount = Object.values(gym?.setup_status || {}).filter((s) => s === 'done').length;
  const progressPct = Math.round(((step - 1) / 4) * 100);

  if (loadingGym) {
    return (
      <AuthShell headline="Setting up your gym" sub="" points={[]}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 240 }}>
          <span className="gla-spinner dark" style={{ width: 28, height: 28 }} />
        </div>
      </AuthShell>
    );
  }

  if (screen === 'done') {
    const recap = STEPS.map((s, i) => {
      const n = i + 1;
      const status = gym?.setup_status?.[n];
      const isDone = status === 'done';
      return {
        label: s.label,
        state: isDone ? 'Done' : 'Later',
        stateFg: isDone ? '#1E7A4B' : '#8A4B00',
        mark: isDone ? '✓' : '•',
        iconBg: isDone ? '#EAF6EF' : '#FDF1E2',
        iconFg: isDone ? '#0F5E3C' : '#8A4B00',
      };
    });
    return (
      <AuthShell
        headline="You are set. Now go enrol someone."
        sub="Everything you skipped is waiting on the dashboard checklist."
        points={['Renewal reminders go out on WhatsApp without you touching them', 'Every payment gets a receipt with your gym name on it', 'Reception and trainers get their own limited sign-in']}
      >
        <section data-screen-label="Setup complete">
          <span className="gla-done-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1E7A4B" strokeWidth="2.8"><path d="m5 13 4.5 4.5L19 7" /></svg>
          </span>
          <h1 className="gla-title-tight">{gym?.name || 'Your gym'} is ready</h1>
          <p className="gla-subtitle">Your gym is live. Members can be enrolled right away and every renewal reminder goes out on its own from now on.</p>

          <div className="gla-recap-list">
            {recap.map((r) => (
              <div className="gla-recap-row" key={r.label}>
                <span className="gla-recap-icon" style={{ background: r.iconBg, color: r.iconFg }}>{r.mark}</span>
                <span className="gla-recap-label">{r.label}</span>
                <span className="gla-recap-state" style={{ color: r.stateFg }}>{r.state}</span>
              </div>
            ))}
          </div>

          <button type="button" className="gla-btn-primary" onClick={() => navigate('/owner/dashboard')}>Go to dashboard</button>
          <button
            type="button"
            className="gla-skip-btn"
            style={{ width: '100%', marginTop: 10 }}
            onClick={() => { setStep(firstPendingStep(gym?.setup_status) || 1); setScreen('wizard'); }}
          >
            Finish the remaining steps
          </button>
        </section>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      headline="Five minutes now saves an hour every week."
      sub="Your gym details, one plan, your team, your members. Skip anything and finish it later."
      points={['Renewal reminders go out on WhatsApp without you touching them', 'Every payment gets a receipt with your gym name on it', 'Reception and trainers get their own limited sign-in']}
    >
      <section data-screen-label={`Onboarding step ${step}`}>
        <div className="gla-onb-topline">
          <p className="gla-onb-step-label">Step {step} of 4</p>
          <p className="gla-onb-progress-label">{doneCount} of 4 done</p>
        </div>
        <div className="gl2-progress-track" style={{ marginBottom: 18 }}>
          <div className="gl2-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>

        <div className="gla-onb-chips gl2-wizard-steps">
          {STEPS.map((s, i) => {
            const n = i + 1;
            const status = gym?.setup_status?.[n];
            const active = n === step;
            return (
              <button
                key={s.label}
                type="button"
                className={`gl2-wizard-step ${active ? 'active' : ''} ${status === 'done' ? 'done' : ''}`}
                onClick={() => setStep(n)}
              >
                <span className="gl2-wizard-step-num">{status === 'done' ? '✓' : n}</span>
                <span className="gl2-wizard-step-label">{s.label}</span>
              </button>
            );
          })}
        </div>

        <h2 className="gla-title-tight" style={{ fontSize: 25 }}>{STEPS[step - 1].title}</h2>
        <p className="gla-subtitle">{STEPS[step - 1].sub}</p>

        {step === 1 && (
          <div className="gla-field-group">
            <div>
              <label className="gla-label">Gym name</label>
              <input className="gl2-input" value={gym?.name || ''} disabled />
            </div>
            <div>
              <label className="gla-label">Address <span style={{ color: 'var(--gl2-muted-2)', fontWeight: 700 }}>· shown on receipts</span></label>
              <input className="gl2-input" placeholder="Plot 42, KPHB Phase 3" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="gla-label">Opens</label>
                <input className="gl2-input" placeholder="5:00 AM" value={openTime} onChange={(e) => setOpenTime(e.target.value)} />
              </div>
              <div>
                <label className="gla-label">Closes</label>
                <input className="gl2-input" placeholder="10:00 PM" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 14px', border: '1px dashed var(--gl2-divider)', borderRadius: 12, background: 'var(--gl2-bg-soft)' }}>
              {logoPreview ? (
                <img src={logoPreview} alt="Logo preview" style={{ width: 46, height: 46, borderRadius: 11, objectFit: 'cover' }} />
              ) : (
                <span style={{ flex: 'none', width: 46, height: 46, borderRadius: 11, background: 'var(--gl2-primary-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6C63C7" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="2.5" /><circle cx="9" cy="10.5" r="1.8" /><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5" /></svg>
                </span>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 800 }}>Gym logo</p>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--gl2-muted-2)' }}>Used on receipts and membership cards. Optional.</p>
              </div>
              <button type="button" className="gl2-btn gl2-btn-secondary" onClick={() => logoInputRef.current?.click()}>Upload</button>
              <input ref={logoInputRef} type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={handleLogoPick} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {PRESETS.map((p, i) => (
              <button key={p.name} type="button" className={`gla-plan-card ${planPick === i ? 'selected' : ''}`} onClick={() => setPlanPick(i)}>
                <span className="gla-plan-radio"><span className="gla-plan-radio-dot" /></span>
                <span className="gla-plan-info">
                  <span className="gla-plan-name">{p.name}</span>
                  <span className="gla-plan-detail">{p.detail}</span>
                </span>
                <span className="gla-plan-price">₹{p.price.toLocaleString('en-IN')}</span>
              </button>
            ))}

            <div className="gla-custom-plan-card">
              <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 800 }}>Or set your own</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="gla-label">Plan name</label>
                  <input className="gl2-input" placeholder="Monthly Gym" value={customPlanName} onChange={(e) => { setCustomPlanName(e.target.value); setPlanPick(null); }} />
                </div>
                <div>
                  <label className="gla-label">Price (₹)</label>
                  <input className="gl2-input" inputMode="numeric" placeholder="1200" value={customPlanPrice} onChange={(e) => { setCustomPlanPrice(e.target.value.replace(/\D/g, '')); setPlanPick(null); }} />
                </div>
              </div>
            </div>
            <p className="gla-hint-text">You can add more plans any time from Settings → Membership Plans.</p>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {invites.map((r, i) => (
              <div className="gla-invite-row" key={r.label}>
                <span className="gla-invite-avatar" style={{ background: r.role === 'trainer' ? '#4A438F' : '#1E7A4B' }}>
                  {r.label.slice(0, 2).toUpperCase()}
                </span>
                <span className="gla-invite-info">
                  <span className="gla-invite-name">{r.label}</span>
                  <span className="gla-invite-sub">{r.sub}</span>
                </span>
                <button
                  type="button"
                  className={`gla-invite-btn ${r.added ? 'sent' : ''}`}
                  disabled={r.added}
                  onClick={() => setInviteForm({ index: i, name: '', phone: '' })}
                >
                  {r.added ? 'Added' : 'Invite'}
                </button>
              </div>
            ))}

            {inviteForm && (
              <div className="gla-custom-plan-card">
                <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 800 }}>
                  {inviteForm.index != null ? `Add ${PRESET_ROLES[inviteForm.index]?.label || invites[inviteForm.index]?.label}` : 'Invite someone else'}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {inviteForm.index == null && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {['receptionist', 'trainer', 'manager'].map((r) => (
                        <button key={r} type="button" className={`gl2-filter-chip ${inviteForm.role === r ? 'active' : ''}`} onClick={() => setInviteForm((f) => ({ ...f, role: r }))}>
                          {r === 'receptionist' ? 'Reception' : r === 'trainer' ? 'Trainer' : 'Manager'}
                        </button>
                      ))}
                    </div>
                  )}
                  <input className="gl2-input" placeholder="Name" value={inviteForm.name} onChange={(e) => setInviteForm((f) => ({ ...f, name: e.target.value }))} />
                  <div className="gla-phone-field">
                    <span className="gla-phone-affix">+91</span>
                    <input className="gla-phone-input" inputMode="numeric" maxLength={10} placeholder="10-digit number" value={inviteForm.phone} onChange={(e) => setInviteForm((f) => ({ ...f, phone: capPhoneDigits(e.target.value) }))} />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="gl2-btn gl2-btn-primary" style={{ flex: 1 }} onClick={submitInvite} disabled={saving}>Add</button>
                    <button type="button" className="gl2-btn gl2-btn-secondary" onClick={() => setInviteForm(null)}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            <button type="button" className="gla-invite-add" onClick={() => setInviteForm({ index: null, name: '', phone: '', role: 'receptionist' })}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 5v14M5 12h14" /></svg>
              <span>Invite someone else</span>
            </button>
            <p className="gla-hint-text">Each person signs in themselves with their own phone number at the login screen. Trainers see members but not money; reception can collect payments.</p>
          </div>
        )}

        {step === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {[
              { key: 'import', badge: 'XLS', title: 'Import from Excel or Google Sheets', sub: 'Name, phone, plan and expiry — we map the columns for you.', bg: '#EAF6EF', fg: '#0F5E3C' },
              { key: 'manual', badge: '＋', title: 'Add the first member myself', sub: 'Takes about a minute. Good if you have only a few to start.', bg: '#F0EFFA', fg: '#4A438F' },
              { key: 'later', badge: '⏱', title: 'I’ll do this later', sub: 'The dashboard will keep reminding you until members are in.', bg: '#FDF1E2', fg: '#8A4B00' },
            ].map((c) => (
              <button key={c.key} type="button" className={`gla-import-tile ${importPick === c.key ? 'selected' : ''}`} onClick={() => {
                if (c.key === 'manual') { navigate('/owner/members/add'); return; }
                saveStep4(c.key);
              }}>
                <span className="gla-import-badge" style={{ background: c.bg, color: c.fg }}>{c.badge}</span>
                <span className="gla-import-info">
                  <span className="gla-import-title">{c.title}</span>
                  <span className="gla-import-sub">{c.sub}</span>
                </span>
              </button>
            ))}
            <p className="gla-hint-text">Importing keeps the joining dates and expiry dates from your sheet, so renewal reminders start working straight away.</p>
          </div>
        )}

        {step !== 4 && (
          <div className="gla-wizard-actions">
            <button
              type="button"
              className="gla-btn-primary"
              disabled={saving}
              onClick={step === 1 ? saveStep1 : step === 2 ? saveStep2 : saveStep3}
            >
              {saving ? <span className="gla-spinner" /> : step === 3 ? 'Continue' : 'Save and continue'}
            </button>
            <button type="button" className="gla-skip-btn" onClick={skip} disabled={saving}>Skip for now</button>
          </div>
        )}
        {step > 1 && (
          <button type="button" className="gla-back-link" style={{ marginTop: 8 }} onClick={back}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m14 6-6 6 6 6" /></svg>
            <span>Back</span>
          </button>
        )}
        <p className="gla-note">Nothing here is final — skipped steps wait for you on the dashboard checklist.</p>
      </section>
    </AuthShell>
  );
};

export default Onboarding;
