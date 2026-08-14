import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { getGym, updateGym } from '../../../firebase/firestore';
import { useToast } from '../../../context/ToastContext';
import { Field } from '../../components/Wizard';
import PageSkeleton from '../../primitives/PageSkeleton';
import { invalidateOwnerGym } from '../../hooks/useOwnerGym';

const DURATION_DAYS = { Monthly: 30, Quarterly: 90, 'Six Months': 180, 'Nine Months': 270, Yearly: 365 };
const DURATION_LABEL = { Monthly: 'mo', Quarterly: 'qtr', 'Six Months': '6mo', 'Nine Months': '9mo', Yearly: 'yr' };
const FEATURE_OPTIONS = [
  ['gymAccess', 'check_circle', 'Gym Access'],
  ['personalTrainer', 'person', 'Personal Trainer'],
  ['dietPlan', 'restaurant', 'Diet Plan'],
  ['poolSpa', 'pool', 'Pool & Spa'],
  ['groupClasses', 'group', 'Group Classes'],
];

export default function AddPlan() {
  const navigate = useNavigate();
  const { planId } = useParams();
  const { userDoc } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState([]);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Monthly');
  const [customDays, setCustomDays] = useState(30);
  const [description, setDescription] = useState('');
  const [basePrice, setBasePrice] = useState(1000);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [maxVisits, setMaxVisits] = useState(0);
  const [features, setFeatures] = useState({ gymAccess: true, personalTrainer: false, dietPlan: false, poolSpa: false, groupClasses: false });

  useEffect(() => () => { if (userDoc?.gym_id) invalidateOwnerGym(userDoc.gym_id); }, [userDoc?.gym_id]);
  const [access, setAccess] = useState({ qrEntry: true, mobileApp: true });

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    getGym(userDoc.gym_id).then((gymData) => {
      if (gymData) {
        const existingPlans = gymData.settings?.plans || [];
        setPlans(existingPlans);
        if (planId) {
          const planToEdit = existingPlans.find((p) => p.id === planId);
          if (planToEdit) {
            setName(planToEdit.name || '');
            setCategory(planToEdit.category || 'Monthly');
            setDescription(planToEdit.description || '');
            setBasePrice(planToEdit.basePrice || planToEdit.price || 0);
            setDiscountPercent(planToEdit.discount || 0);
            setMaxVisits(planToEdit.maxVisits || 0);
            if (planToEdit.customDays) setCustomDays(planToEdit.customDays);
            if (planToEdit.features) setFeatures(planToEdit.features);
            if (planToEdit.access) setAccess(planToEdit.access);
          }
        }
      }
      setLoading(false);
    });
  }, [userDoc?.gym_id, planId]);

  const durationDays = category === 'Custom' ? customDays : (DURATION_DAYS[category] ?? 30);
  const durationLabel = category === 'Custom' ? `${customDays}d` : (DURATION_LABEL[category] || 'mo');
  const finalPrice = basePrice - (basePrice * (discountPercent / 100));

  const handleSave = async () => {
    if (!name || !basePrice) { showToast('Please fill all required fields', 'error'); return; }
    try {
      const planData = {
        id: planId || Date.now().toString(), name, category, description, basePrice,
        discount: discountPercent, finalPrice, price: finalPrice, duration_days: durationDays,
        customDays: category === 'Custom' ? customDays : null, maxVisits, features, access, is_active: true,
      };
      const updatedPlans = planId ? plans.map((p) => (p.id === planId ? { ...p, ...planData } : p)) : [...plans, planData];
      await updateGym(userDoc.gym_id, { 'settings.plans': updatedPlans });
      showToast('Membership plan saved!', 'success');
      navigate('/owner/plans');
    } catch (error) {
      console.error('Failed to save plan:', error);
      showToast(`Failed to save plan: ${error?.message || 'Unknown error'}`, 'error');
    }
  };

  const toggleFeature = (key) => setFeatures((prev) => ({ ...prev, [key]: !prev[key] }));

  if (loading) return <PageSkeleton variant="card" />;

  return (
    <section data-screen-label="Add plan">
      <button type="button" className="gl2-back-link" onClick={() => navigate('/owner/plans')}>
        <span className="material-symbols-outlined" style={{ fontSize: 17 }}>arrow_back_ios</span>Plans
      </button>
      <div className="gl2-page-header">
        <h1 className="gl2-page-title">{planId ? 'Edit membership plan' : 'Create membership plan'}</h1>
        <button type="button" className="gl2-btn gl2-btn-primary" onClick={handleSave}>Save plan</button>
      </div>

      <div className="gl2-grid-2" style={{ alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="gl2-card">
            <p className="gl2-card-title" style={{ marginBottom: 14 }}>Basic details</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Plan name" required><input className="gl2-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Titanium Elite" /></Field>
              <Field label="Billing cycle">
                <select className="gl2-select" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="Monthly">Monthly (30 days)</option>
                  <option value="Quarterly">Quarterly (90 days)</option>
                  <option value="Six Months">Six Months (180 days)</option>
                  <option value="Nine Months">Nine Months (270 days)</option>
                  <option value="Yearly">Yearly (365 days)</option>
                  <option value="Custom">Custom (specify days)</option>
                </select>
              </Field>
              {category === 'Custom' && (
                <Field label="Number of days"><input className="gl2-input" type="number" min="1" max="3650" value={customDays} onChange={(e) => setCustomDays(Math.max(1, Number(e.target.value)))} /></Field>
              )}
              <Field label="Description (benefits)"><textarea className="gl2-input" style={{ minHeight: 80, padding: 11, resize: 'vertical' }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the perks…" /></Field>
            </div>
          </div>

          <div className="gl2-card">
            <p className="gl2-card-title" style={{ marginBottom: 14 }}>Pricing</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <Field label="Base price (₹)"><input className="gl2-input" type="number" value={basePrice} onChange={(e) => setBasePrice(Number(e.target.value))} /></Field>
              <Field label="Discount (%)"><input className="gl2-input" type="number" value={discountPercent} onChange={(e) => setDiscountPercent(Number(e.target.value))} /></Field>
              <div style={{ padding: 11, borderRadius: 11, background: 'var(--gl2-primary-tint)' }}>
                <p style={{ margin: '0 0 2px', fontSize: 10, fontWeight: 800, color: 'var(--gl2-primary-deep)', textTransform: 'uppercase' }}>Final amount</p>
                <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--gl2-primary-deep)' }}>₹{finalPrice.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
              </div>
            </div>
          </div>

          <div className="gl2-card">
            <p className="gl2-card-title" style={{ marginBottom: 14 }}>Included perks</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {FEATURE_OPTIONS.map(([key, icon, label]) => (
                <button key={key} type="button" className={`gl2-filter-chip ${features[key] ? 'active' : ''}`} onClick={() => toggleFeature(key)}>
                  <span className="material-symbols-outlined" style={{ fontSize: 15, verticalAlign: 'middle', marginRight: 4 }}>{icon}</span>{label}
                </button>
              ))}
            </div>
          </div>

          <div className="gl2-card">
            <p className="gl2-card-title" style={{ marginBottom: 14 }}>Access & limits</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              <div className="gl2-row" style={{ border: '1px solid var(--gl2-border)', borderRadius: 11 }}>
                <span className="material-symbols-outlined" style={{ color: 'var(--gl2-muted)' }}>qr_code_2</span>
                <div style={{ flex: 1 }}><p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>QR entry access</p><p style={{ margin: 0, fontSize: 11.5, color: 'var(--gl2-muted)' }}>Members use app for gate entry</p></div>
                <button type="button" className={`gl2-toggle-track ${access.qrEntry ? 'on' : ''}`} onClick={() => setAccess((prev) => ({ ...prev, qrEntry: !prev.qrEntry }))}><span className="gl2-toggle-knob" /></button>
              </div>
              <div className="gl2-row" style={{ border: '1px solid var(--gl2-border)', borderRadius: 11 }}>
                <span className="material-symbols-outlined" style={{ color: 'var(--gl2-muted)' }}>smartphone</span>
                <div style={{ flex: 1 }}><p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>Mobile app</p><p style={{ margin: 0, fontSize: 11.5, color: 'var(--gl2-muted)' }}>Workout tracking & community</p></div>
                <button type="button" className={`gl2-toggle-track ${access.mobileApp ? 'on' : ''}`} onClick={() => setAccess((prev) => ({ ...prev, mobileApp: !prev.mobileApp }))}><span className="gl2-toggle-knob" /></button>
              </div>
            </div>
            <Field label="Max visits per month">
              <input className="gl2-input" type="number" value={maxVisits} onChange={(e) => setMaxVisits(Number(e.target.value))} />
            </Field>
            <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--gl2-muted)', fontStyle: 'italic' }}>Enter '0' for unlimited access.</p>
          </div>
        </div>

        <div>
          <p className="gl2-eyebrow">Live preview</p>
          <div className="gl2-card" style={{ position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              <span className="gl2-tag gl2-tag-neutral">{category}</span>
              <span className="material-symbols-outlined" style={{ color: 'var(--gl2-primary)' }}>offline_bolt</span>
            </div>
            <p style={{ margin: '0 0 6px', fontWeight: 800, fontSize: 18 }}>{name || 'Plan title'}</p>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--gl2-muted)' }}>{description || 'Add a compelling description…'}</p>
            <div style={{ padding: '14px 0', borderTop: '1px solid var(--gl2-divider)', borderBottom: '1px solid var(--gl2-divider)', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 30, fontWeight: 800, color: 'var(--gl2-primary-deep)' }}>₹{finalPrice.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                <span style={{ fontSize: 13, color: 'var(--gl2-muted)' }}>/ {durationLabel}</span>
              </div>
              {discountPercent > 0 && (
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 12, textDecoration: 'line-through', color: 'var(--gl2-muted-2)' }}>₹{basePrice.toLocaleString('en-IN')}</span>
                  <span className="gl2-tag gl2-tag-active" style={{ fontSize: 10 }}>Save {discountPercent}%</span>
                </div>
              )}
            </div>
            <ul style={{ margin: '0 0 14px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <li style={{ display: 'flex', gap: 8, fontSize: 13, fontWeight: 600 }}><span className="material-symbols-outlined" style={{ fontSize: 17, color: 'var(--gl2-primary)' }}>check_circle</span>{features.gymAccess ? 'Full gym access' : 'No gym access'}</li>
              {features.personalTrainer && <li style={{ display: 'flex', gap: 8, fontSize: 13, fontWeight: 600 }}><span className="material-symbols-outlined" style={{ fontSize: 17, color: 'var(--gl2-primary)' }}>check_circle</span>Personal trainer included</li>}
              {features.dietPlan && <li style={{ display: 'flex', gap: 8, fontSize: 13, fontWeight: 600 }}><span className="material-symbols-outlined" style={{ fontSize: 17, color: 'var(--gl2-primary)' }}>check_circle</span>Custom diet plan</li>}
              {features.poolSpa && <li style={{ display: 'flex', gap: 8, fontSize: 13, fontWeight: 600 }}><span className="material-symbols-outlined" style={{ fontSize: 17, color: 'var(--gl2-primary)' }}>check_circle</span>Pool & spa access</li>}
              {features.groupClasses && <li style={{ display: 'flex', gap: 8, fontSize: 13, fontWeight: 600 }}><span className="material-symbols-outlined" style={{ fontSize: 17, color: 'var(--gl2-primary)' }}>check_circle</span>All group classes</li>}
              <li style={{ display: 'flex', gap: 8, fontSize: 13, fontWeight: 600 }}><span className="material-symbols-outlined" style={{ fontSize: 17, color: 'var(--gl2-primary)' }}>check_circle</span>{maxVisits === 0 ? 'Unlimited visits' : `${maxVisits} visits per month`}</li>
            </ul>
            <button type="button" className="gl2-btn gl2-btn-primary gl2-btn-lg" style={{ width: '100%', opacity: 0.7 }} disabled>Select plan</button>
          </div>
          <div style={{ marginTop: 14, padding: 13, borderRadius: 11, background: 'var(--gl2-primary-tint)', fontSize: 12.5, color: 'var(--gl2-primary-deep)' }}>
            💡 Plans with Yearly billing typically see 40% higher retention. Consider a larger discount for annual plans.
          </div>
        </div>
      </div>
    </section>
  );
}
