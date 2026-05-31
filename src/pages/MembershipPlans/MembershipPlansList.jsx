import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getGym, updateGym } from '../../firebase/firestore';
import { useToast } from '../../context/ToastContext';

export default function MembershipPlansList() {
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  const { showToast } = useToast();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    
    getGym(userDoc.gym_id).then(gymData => {
      if (gymData) {
        setPlans(gymData.settings?.plans || []);
      }
      setLoading(false);
    });
  }, [userDoc?.gym_id]);

  const savePlans = async (updatedPlans) => {
    if (!userDoc?.gym_id) return;
    try {
      await updateGym(userDoc.gym_id, { 'settings.plans': updatedPlans });
      setPlans(updatedPlans);
      showToast('Plan status updated', 'success');
    } catch (err) {
      showToast('Failed to update plan', 'error');
    }
  };

  const handleTogglePlan = (planId) => {
    const updated = plans.map(p => p.id === planId ? { ...p, is_active: !p.is_active } : p);
    savePlans(updated);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-mesh flex justify-center items-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const activePlans = plans.filter(p => p.is_active);
  const inactivePlans = plans.filter(p => !p.is_active);

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
              <h1 className="font-headline-sm text-lg font-bold text-on-surface">Membership Plans</h1>
            </div>
          </div>
          <button 
            onClick={() => navigate('/owner/plans/add')}
            className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-secondary flex items-center justify-center text-white shadow-lg hover:scale-105 active:scale-95 transition-transform"
          >
            <span className="material-symbols-outlined">add</span>
          </button>
        </div>
      </header>

      <main className="pt-28 px-4 max-w-3xl mx-auto space-y-8">
        
        {/* KPI / Summary */}
        <div className="glass-panel rounded-2xl p-6 flex flex-col md:flex-row gap-6 justify-between items-center bg-white/40">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-2xl">card_membership</span>
            </div>
            <div>
              <h2 className="font-headline-md font-bold">{activePlans.length} Active Plans</h2>
              <p className="text-label-md text-on-surface-variant">Offering a variety of plans increases conversion</p>
            </div>
          </div>
          <button 
            onClick={() => navigate('/owner/plans/add')}
            className="px-6 py-3 rounded-xl bg-primary text-white font-label-md shadow-md hover:-translate-y-0.5 transition-all w-full md:w-auto"
          >
            Add New Plan
          </button>
        </div>

        {/* Active Plans List */}
        <section>
          <h3 className="font-label-md text-outline mb-4 ml-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">check_circle</span>
            ACTIVE PLANS
          </h3>
          <div className="space-y-4">
            {activePlans.length === 0 ? (
              <div className="glass-panel p-8 rounded-2xl text-center text-on-surface-variant border border-dashed border-outline-variant">
                No active plans found. Create one to start selling memberships.
              </div>
            ) : (
              activePlans.map(plan => (
                <PlanCard key={plan.id} plan={plan} onToggle={() => handleTogglePlan(plan.id)} onEdit={() => navigate(`/owner/plans/edit/${plan.id}`)} />
              ))
            )}
          </div>
        </section>

        {/* Inactive Plans List */}
        {inactivePlans.length > 0 && (
          <section>
            <h3 className="font-label-md text-outline mb-4 ml-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">cancel</span>
              INACTIVE PLANS
            </h3>
            <div className="space-y-4 opacity-70">
              {inactivePlans.map(plan => (
                <PlanCard key={plan.id} plan={plan} onToggle={() => handleTogglePlan(plan.id)} onEdit={() => navigate(`/owner/plans/edit/${plan.id}`)} />
              ))}
            </div>
          </section>
        )}

      </main>
    </div>
  );
}

function PlanCard({ plan, onToggle, onEdit }) {
  // Use new fields if available, fallback to old fields
  const displayPrice = plan.finalPrice || plan.price;
  const originalPrice = plan.basePrice;
  const hasDiscount = originalPrice && displayPrice < originalPrice;
  
  // Format period string
  let periodStr = 'mo';
  if (plan.category === 'Yearly') periodStr = 'yr';
  if (plan.category === 'Quarterly') periodStr = 'qtr';
  if (!plan.category && plan.duration_days) {
    if (plan.duration_days == 30) periodStr = 'mo';
    else if (plan.duration_days == 365) periodStr = 'yr';
    else periodStr = `${plan.duration_days}d`;
  }

  return (
    <div className="glass-panel rounded-2xl p-5 hover:bg-white/50 transition-colors group relative overflow-hidden">
      <div className="flex justify-between items-start mb-4">
        <div className="flex gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary to-secondary flex items-center justify-center text-white shadow-sm">
            <span className="material-symbols-outlined">{plan.category === 'Yearly' ? 'star' : 'fitness_center'}</span>
          </div>
          <div>
            <h4 className="font-headline-sm font-bold text-on-surface leading-tight">{plan.name}</h4>
            <span className="font-label-sm text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-full uppercase tracking-wide">
              {plan.category || (plan.duration_days ? `${plan.duration_days} Days` : 'Custom')}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={onEdit}
            className="w-8 h-8 rounded-full glass-panel flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">edit</span>
          </button>
          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              className="sr-only peer" 
              checked={plan.is_active !== false} 
              onChange={onToggle}
            />
            <div className="w-11 h-6 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>
      </div>

      <div className="flex items-end justify-between mt-2 pt-4 border-t border-white/20">
        <div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-primary">₹{displayPrice}</span>
            <span className="text-on-surface-variant font-label-md">/ {periodStr}</span>
          </div>
          {hasDiscount && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[12px] line-through text-outline-variant">₹{originalPrice}</span>
              <span className="text-[10px] font-bold text-tertiary bg-tertiary/10 px-1.5 py-[2px] rounded">
                Save {plan.discount}%
              </span>
            </div>
          )}
        </div>
        
        <div className="text-right">
          {plan.maxVisits > 0 ? (
            <p className="text-[12px] text-on-surface-variant flex items-center justify-end gap-1">
              <span className="material-symbols-outlined text-[14px]">event_available</span>
              {plan.maxVisits} visits
            </p>
          ) : (
            <p className="text-[12px] text-on-surface-variant flex items-center justify-end gap-1">
              <span className="material-symbols-outlined text-[14px]">all_inclusive</span>
              Unlimited visits
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
