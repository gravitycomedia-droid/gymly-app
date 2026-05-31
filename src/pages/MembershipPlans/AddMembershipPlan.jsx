import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getGym, updateGym } from '../../firebase/firestore';
import { useToast } from '../../context/ToastContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';

export default function AddMembershipPlan() {
  const navigate = useNavigate();
  const { planId } = useParams();
  const { userDoc } = useAuth();
  const { showToast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState([]);
  
  // Form State
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Monthly');
  const [description, setDescription] = useState('');
  const [basePrice, setBasePrice] = useState(1000);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [maxVisits, setMaxVisits] = useState(0); // 0 = unlimited
  
  // Feature flags
  const [features, setFeatures] = useState({
    gymAccess: true,
    personalTrainer: false,
    dietPlan: false,
    poolSpa: false,
    groupClasses: false
  });

  const [access, setAccess] = useState({
    qrEntry: true,
    mobileApp: true
  });

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    
    getGym(userDoc.gym_id).then(gymData => {
      if (gymData) {
        const existingPlans = gymData.settings?.plans || [];
        setPlans(existingPlans);
        
        if (planId) {
          const planToEdit = existingPlans.find(p => p.id === planId);
          if (planToEdit) {
            setName(planToEdit.name || '');
            setCategory(planToEdit.category || 'Monthly');
            setDescription(planToEdit.description || '');
            setBasePrice(planToEdit.basePrice || planToEdit.price || 0);
            setDiscountPercent(planToEdit.discount || 0);
            setMaxVisits(planToEdit.maxVisits || 0);
            if (planToEdit.features) setFeatures(planToEdit.features);
            if (planToEdit.access) setAccess(planToEdit.access);
          }
        }
      }
      setLoading(false);
    });
  }, [userDoc?.gym_id, planId]);

  // Derived values
  const finalPrice = basePrice - (basePrice * (discountPercent / 100));
  
  const handleSave = async () => {
    if (!name || !basePrice) {
      showToast('Please fill all required fields', 'error');
      return;
    }

    try {
      const planData = {
        id: planId || Date.now().toString(),
        name,
        category,
        description,
        basePrice,
        discount: discountPercent,
        finalPrice,
        price: finalPrice, // Keep legacy field for backwards compatibility
        duration_days: category === 'Monthly' ? 30 : category === 'Yearly' ? 365 : 90, // Keep legacy field
        maxVisits,
        features,
        access,
        is_active: true
      };

      let updatedPlans = [];
      if (planId) {
        updatedPlans = plans.map(p => p.id === planId ? { ...p, ...planData } : p);
      } else {
        updatedPlans = [...plans, planData];
      }

      await updateGym(userDoc.gym_id, { 'settings.plans': updatedPlans });
      showToast('Membership plan saved!', 'success');
      navigate('/owner/plans');
    } catch (error) {
      showToast('Failed to save plan', 'error');
    }
  };

  const toggleFeature = (key) => setFeatures(prev => ({ ...prev, [key]: !prev[key] }));

  if (loading) {
    return (
      <div className="min-h-screen bg-mesh flex justify-center items-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mesh text-on-surface font-body-md pb-24 relative overflow-x-hidden">
      {/* Top Navigation Anchor */}
      <header className="fixed top-0 w-full z-50 bg-surface/60 backdrop-blur-xl border-b border-white/10 flex justify-between items-center px-4 md:px-8 h-16">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold">
            G
          </div>
          <span className="font-headline-md font-bold text-on-surface">Gymly CRM</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="h-8 w-8 rounded-full bg-primary-container flex items-center justify-center text-on-primary text-label-sm shadow-sm">
            {userDoc?.name ? userDoc.name.substring(0,2).toUpperCase() : 'OW'}
          </div>
        </div>
      </header>

      <main className="pt-24 pb-32 px-4 md:px-8 max-w-7xl mx-auto relative z-10">
        {/* Close/Back Action */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate('/owner/plans')}
              className="p-2 rounded-full glass-panel hover:bg-white transition-all shadow-sm flex items-center justify-center w-10 h-10"
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <h1 className="font-headline-md md:font-headline-lg text-on-surface font-bold">
              {planId ? 'Edit Membership Plan' : 'Add New Membership Plan'}
            </h1>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Form Side */}
          <div className="lg:col-span-8 space-y-8">
            
            {/* Section 1: Basic Details */}
            <section className="glass-panel rounded-3xl p-6 md:p-8 space-y-6">
              <div className="flex items-center gap-3 border-b border-white/20 pb-4">
                <span className="material-symbols-outlined text-secondary">info</span>
                <h2 className="font-headline-md font-semibold">Basic Details</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="font-label-md text-on-surface-variant ml-1">Plan Name</label>
                  <input 
                    type="text" 
                    value={name} 
                    onChange={e => setName(e.target.value)}
                    className="w-full bg-white/40 border border-white/50 rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-shadow" 
                    placeholder="e.g. Titanium Elite" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="font-label-md text-on-surface-variant ml-1">Billing Cycle</label>
                  <select 
                    value={category} 
                    onChange={e => setCategory(e.target.value)}
                    className="w-full bg-white/40 border border-white/50 rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-shadow appearance-none"
                  >
                    <option value="Monthly">Monthly</option>
                    <option value="Quarterly">Quarterly</option>
                    <option value="Yearly">Yearly</option>
                  </select>
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="font-label-md text-on-surface-variant ml-1">Description (Benefits)</label>
                  <textarea 
                    value={description} 
                    onChange={e => setDescription(e.target.value)}
                    className="w-full bg-white/40 border border-white/50 rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-shadow" 
                    placeholder="Describe the perks and unique value proposition..." 
                    rows="3"
                  />
                </div>
              </div>
            </section>

            {/* Section 2: Pricing */}
            <section className="glass-panel rounded-3xl p-6 md:p-8 space-y-6">
              <div className="flex items-center gap-3 border-b border-white/20 pb-4">
                <span className="material-symbols-outlined text-primary">payments</span>
                <h2 className="font-headline-md font-semibold">Pricing Strategy</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                <div className="space-y-2">
                  <label className="font-label-md text-on-surface-variant ml-1">Base Price (₹)</label>
                  <input 
                    type="number" 
                    value={basePrice} 
                    onChange={e => setBasePrice(Number(e.target.value))}
                    className="w-full bg-white/40 border border-white/50 rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="font-label-md text-on-surface-variant ml-1">Discount (%)</label>
                  <input 
                    type="number" 
                    value={discountPercent} 
                    onChange={e => setDiscountPercent(Number(e.target.value))}
                    className="w-full bg-white/40 border border-white/50 rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none" 
                  />
                </div>
                <div className="bg-primary/5 rounded-2xl p-4 border border-primary/20 flex flex-col justify-center relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent z-0 group-hover:opacity-100 transition-opacity opacity-0"></div>
                  <span className="text-[10px] text-primary uppercase font-bold tracking-wider relative z-10">Final Amount</span>
                  <div className="font-headline-md text-primary font-bold relative z-10">
                    ₹{finalPrice.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </div>
                  <p className="text-[10px] text-on-surface-variant italic relative z-10">
                    Base ₹{basePrice} - {discountPercent}%
                  </p>
                </div>
              </div>
            </section>

            {/* Section 3: Features */}
            <section className="glass-panel rounded-3xl p-6 md:p-8 space-y-6">
              <div className="flex items-center gap-3 border-b border-white/20 pb-4">
                <span className="material-symbols-outlined text-tertiary">star</span>
                <h2 className="font-headline-md font-semibold">Included Perks</h2>
              </div>
              <div className="flex flex-wrap gap-3">
                <button 
                  onClick={() => toggleFeature('gymAccess')}
                  className={`px-5 py-2.5 rounded-full flex items-center gap-2 transition-all hover:scale-105 shadow-sm ${features.gymAccess ? 'bg-primary text-white shadow-primary/30' : 'glass-panel text-on-surface border border-white/40'}`}
                >
                  <span className="material-symbols-outlined text-[18px]">check_circle</span>
                  <span className="font-label-md">Gym Access</span>
                </button>
                <button 
                  onClick={() => toggleFeature('personalTrainer')}
                  className={`px-5 py-2.5 rounded-full flex items-center gap-2 transition-all hover:scale-105 shadow-sm ${features.personalTrainer ? 'bg-primary text-white shadow-primary/30' : 'glass-panel text-on-surface border border-white/40'}`}
                >
                  <span className="material-symbols-outlined text-[18px]">person</span>
                  <span className="font-label-md">Personal Trainer</span>
                </button>
                <button 
                  onClick={() => toggleFeature('dietPlan')}
                  className={`px-5 py-2.5 rounded-full flex items-center gap-2 transition-all hover:scale-105 shadow-sm ${features.dietPlan ? 'bg-primary text-white shadow-primary/30' : 'glass-panel text-on-surface border border-white/40'}`}
                >
                  <span className="material-symbols-outlined text-[18px]">restaurant</span>
                  <span className="font-label-md">Diet Plan</span>
                </button>
                <button 
                  onClick={() => toggleFeature('poolSpa')}
                  className={`px-5 py-2.5 rounded-full flex items-center gap-2 transition-all hover:scale-105 shadow-sm ${features.poolSpa ? 'bg-primary text-white shadow-primary/30' : 'glass-panel text-on-surface border border-white/40'}`}
                >
                  <span className="material-symbols-outlined text-[18px]">pool</span>
                  <span className="font-label-md">Pool & Spa</span>
                </button>
                <button 
                  onClick={() => toggleFeature('groupClasses')}
                  className={`px-5 py-2.5 rounded-full flex items-center gap-2 transition-all hover:scale-105 shadow-sm ${features.groupClasses ? 'bg-primary text-white shadow-primary/30' : 'glass-panel text-on-surface border border-white/40'}`}
                >
                  <span className="material-symbols-outlined text-[18px]">group</span>
                  <span className="font-label-md">Group Classes</span>
                </button>
              </div>
            </section>

            {/* Section 4: Access & Limits */}
            <section className="glass-panel rounded-3xl p-6 md:p-8 space-y-6">
              <div className="flex items-center gap-3 border-b border-white/20 pb-4">
                <span className="material-symbols-outlined text-error">lock_open</span>
                <h2 className="font-headline-md font-semibold">Access & Limits</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-white/30 rounded-2xl border border-white/40">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-on-surface-variant">qr_code_2</span>
                      <div>
                        <p className="font-label-md font-bold text-on-surface">QR Entry Access</p>
                        <p className="text-[10px] text-on-surface-variant leading-tight">Members use app for gate entry</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={access.qrEntry} 
                        onChange={() => setAccess(prev => ({...prev, qrEntry: !prev.qrEntry}))}
                        className="sr-only peer" 
                      />
                      <div className="w-11 h-6 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 bg-white/30 rounded-2xl border border-white/40">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-on-surface-variant">smartphone</span>
                      <div>
                        <p className="font-label-md font-bold text-on-surface">Mobile App</p>
                        <p className="text-[10px] text-on-surface-variant leading-tight">Workout tracking & community</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={access.mobileApp}
                        onChange={() => setAccess(prev => ({...prev, mobileApp: !prev.mobileApp}))}
                        className="sr-only peer" 
                      />
                      <div className="w-11 h-6 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="font-label-md text-on-surface-variant ml-1">Max Visits per Month</label>
                    <div className="relative">
                      <input 
                        type="number" 
                        value={maxVisits}
                        onChange={e => setMaxVisits(Number(e.target.value))}
                        className="w-full bg-white/40 border border-white/50 rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none" 
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-[12px] font-bold uppercase tracking-wider">Visits</span>
                    </div>
                    <p className="text-[10px] text-on-surface-variant px-1 italic">Enter '0' for unlimited access.</p>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Preview Column */}
          <div className="lg:col-span-4">
            <div className="sticky top-24 space-y-6">
              <h3 className="font-label-sm text-[12px] text-outline px-2 flex items-center gap-2 font-bold tracking-widest uppercase">
                <span className="material-symbols-outlined text-[16px]">visibility</span>
                Live Preview
              </h3>

              {/* Preview Card */}
              <div className="glass-panel rounded-[32px] p-8 shadow-2xl shadow-primary/10 relative overflow-hidden group bg-white/50 border border-white/60">
                <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/20 rounded-full blur-3xl group-hover:bg-primary/30 transition-all"></div>
                <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-secondary/20 rounded-full blur-3xl group-hover:bg-secondary/30 transition-all"></div>
                
                <div className="relative z-10 space-y-6">
                  <div className="flex justify-between items-start">
                    <div className="px-3 py-1 bg-primary/10 text-primary text-[10px] font-bold rounded-full uppercase tracking-widest">
                      {category}
                    </div>
                    <span className="material-symbols-outlined text-primary">offline_bolt</span>
                  </div>
                  
                  <div>
                    <h4 className="font-headline-md font-bold mb-2 text-on-surface leading-tight">
                      {name || 'Plan Title'}
                    </h4>
                    <p className="text-[13px] text-on-surface-variant line-clamp-2 leading-relaxed">
                      {description || 'Add a compelling description to showcase the value...'}
                    </p>
                  </div>
                  
                  <div className="py-4 border-y border-white/30">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-primary">₹{finalPrice.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                      <span className="text-on-surface-variant text-[13px] font-medium">
                        / {category === 'Yearly' ? 'yr' : category === 'Quarterly' ? 'qtr' : 'mo'}
                      </span>
                    </div>
                    {discountPercent > 0 && (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[12px] line-through text-outline-variant">₹{basePrice.toLocaleString('en-IN')}</span>
                        <span className="text-[11px] font-bold text-tertiary bg-tertiary/10 px-1.5 py-0.5 rounded">Save {discountPercent}%</span>
                      </div>
                    )}
                  </div>
                  
                  <ul className="space-y-3">
                    <li className="flex items-center gap-2 text-[13px] font-medium text-on-surface">
                      <span className="material-symbols-outlined text-primary text-[18px]">check_circle</span>
                      <span>{features.gymAccess ? 'Full Gym Access' : 'No Gym Access'}</span>
                    </li>
                    {features.personalTrainer && (
                      <li className="flex items-center gap-2 text-[13px] font-medium text-on-surface">
                        <span className="material-symbols-outlined text-primary text-[18px]">check_circle</span>
                        <span>Personal Trainer Included</span>
                      </li>
                    )}
                    {features.dietPlan && (
                      <li className="flex items-center gap-2 text-[13px] font-medium text-on-surface">
                        <span className="material-symbols-outlined text-primary text-[18px]">check_circle</span>
                        <span>Custom Diet Plan</span>
                      </li>
                    )}
                    {features.poolSpa && (
                      <li className="flex items-center gap-2 text-[13px] font-medium text-on-surface">
                        <span className="material-symbols-outlined text-primary text-[18px]">check_circle</span>
                        <span>Pool & Spa Access</span>
                      </li>
                    )}
                    {features.groupClasses && (
                      <li className="flex items-center gap-2 text-[13px] font-medium text-on-surface">
                        <span className="material-symbols-outlined text-primary text-[18px]">check_circle</span>
                        <span>All Group Classes</span>
                      </li>
                    )}
                    <li className="flex items-center gap-2 text-[13px] font-medium text-on-surface">
                      <span className="material-symbols-outlined text-primary text-[18px]">check_circle</span>
                      <span>{maxVisits === 0 ? 'Unlimited Visits' : `${maxVisits} Visits per month`}</span>
                    </li>
                  </ul>
                  
                  <button disabled className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-secondary text-white font-bold opacity-70 cursor-not-allowed">
                    Select Plan
                  </button>
                </div>
              </div>

              {/* Guidance Tip */}
              <div className="p-5 rounded-2xl bg-secondary/5 border border-secondary/10 flex gap-4 mt-6">
                <span className="material-symbols-outlined text-secondary text-[24px]">lightbulb</span>
                <p className="text-[12px] text-on-surface-variant leading-relaxed">
                  Plans with <span className="font-bold text-on-surface">Yearly</span> billing typically see 40% higher retention rates. Consider offering a larger discount for annual plans.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Bar */}
      <footer className="fixed bottom-0 left-0 w-full glass-panel border-t border-white/20 py-4 px-4 md:px-6 z-50 bg-surface/80 backdrop-blur-2xl">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="hidden md:flex items-center gap-4 text-on-surface-variant text-[12px]">
            <span className="flex items-center gap-1 font-medium"><span className="material-symbols-outlined text-[16px] text-tertiary">task_alt</span> Live Preview Active</span>
          </div>
          <div className="flex items-center gap-4 w-full md:w-auto">
            <button 
              onClick={() => navigate('/owner/plans')}
              className="flex-1 md:flex-none px-8 py-3 rounded-xl border border-outline-variant text-on-surface font-label-md hover:bg-white/50 transition-all"
            >
              Cancel
            </button>
            <button 
              onClick={handleSave}
              className="flex-1 md:flex-none px-12 py-3 rounded-xl bg-gradient-to-tr from-primary to-secondary text-white font-bold shadow-lg shadow-primary/30 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all"
            >
              Save Plan
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
