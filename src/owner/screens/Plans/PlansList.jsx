import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { getGym, updateGym } from '../../../firebase/firestore';
import EmptyState from '../../primitives/EmptyState';
import PageSkeleton from '../../primitives/PageSkeleton';
import { invalidateOwnerGym } from '../../hooks/useOwnerGym';

function periodStr(plan) {
  if (plan.category === 'Yearly') return 'yr';
  if (plan.category === 'Quarterly') return 'qtr';
  if (!plan.category && plan.duration_days) {
    if (plan.duration_days === 30) return 'mo';
    if (plan.duration_days === 365) return 'yr';
    return `${plan.duration_days}d`;
  }
  return 'mo';
}

function PlanCard({ plan, onToggle, onEdit }) {
  const displayPrice = plan.finalPrice || plan.price;
  const originalPrice = plan.basePrice;
  const hasDiscount = originalPrice && displayPrice < originalPrice;

  return (
    <div className="gl2-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <span className="gl2-icon-btn" style={{ width: 40, height: 40, background: 'var(--gl2-primary)', color: '#fff', border: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{plan.category === 'Yearly' ? 'star' : 'fitness_center'}</span>
          </span>
          <div>
            <p style={{ margin: 0, fontWeight: 800 }}>{plan.name}</p>
            <span className="gl2-tag gl2-tag-neutral" style={{ fontSize: 10 }}>{plan.category || (plan.duration_days ? `${plan.duration_days} days` : 'Custom')}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" className="gl2-icon-btn" style={{ width: 32, height: 32 }} onClick={onEdit}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span></button>
          <button type="button" className={`gl2-toggle-track ${plan.is_active !== false ? 'on' : ''}`} onClick={onToggle}><span className="gl2-toggle-knob" /></button>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--gl2-divider)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--gl2-primary-deep)' }}>₹{displayPrice}</span>
            <span style={{ fontSize: 13, color: 'var(--gl2-muted)' }}>/ {periodStr(plan)}</span>
          </div>
          {hasDiscount && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: 12, textDecoration: 'line-through', color: 'var(--gl2-muted-2)' }}>₹{originalPrice}</span>
              <span className="gl2-tag gl2-tag-active" style={{ fontSize: 10 }}>Save {plan.discount}%</span>
            </div>
          )}
        </div>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--gl2-muted)' }}>{plan.maxVisits > 0 ? `${plan.maxVisits} visits` : 'Unlimited visits'}</p>
      </div>
    </div>
  );
}

export default function PlansList() {
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  const { showToast } = useToast();
  const [plans, setPlans] = useState([]);

  useEffect(() => () => { if (userDoc?.gym_id) invalidateOwnerGym(userDoc.gym_id); }, [userDoc?.gym_id]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    getGym(userDoc.gym_id).then((g) => { if (g) setPlans(g.settings?.plans || []); setLoading(false); });
  }, [userDoc?.gym_id]);

  const savePlans = async (updatedPlans) => {
    try {
      await updateGym(userDoc.gym_id, { 'settings.plans': updatedPlans });
      setPlans(updatedPlans);
      showToast('Plan status updated', 'success');
    } catch (err) {
      console.error('Update plan error:', err);
      showToast('Failed to update plan', 'error');
    }
  };

  const handleToggle = (planId) => savePlans(plans.map((p) => (p.id === planId ? { ...p, is_active: !p.is_active } : p)));

  if (loading) return <PageSkeleton variant="grid" rows={6} />;

  const activePlans = plans.filter((p) => p.is_active);
  const inactivePlans = plans.filter((p) => !p.is_active);

  return (
    <section data-screen-label="Membership plans">
      <button type="button" className="gl2-back-link" onClick={() => navigate('/owner/settings')}>
        <span className="material-symbols-outlined" style={{ fontSize: 17 }}>arrow_back_ios</span>Settings
      </button>
      <div className="gl2-page-header">
        <div>
          <h1 className="gl2-page-title">Membership plans</h1>
          <p className="gl2-page-sub">{activePlans.length} active plan{activePlans.length !== 1 ? 's' : ''} · used by Add Member and your public page</p>
        </div>
        <button type="button" className="gl2-btn gl2-btn-primary" onClick={() => navigate('/owner/plans/add')}>+ Create plan</button>
      </div>

      <div style={{ marginBottom: 14 }}>
        <p className="gl2-eyebrow">Active plans</p>
        {activePlans.length === 0 ? (
          <div className="gl2-list"><EmptyState title="No active plans" sub="Create one to start selling memberships." /></div>
        ) : (
          <div className="gl2-grid-3">
            {activePlans.map((plan) => <PlanCard key={plan.id} plan={plan} onToggle={() => handleToggle(plan.id)} onEdit={() => navigate(`/owner/plans/edit/${plan.id}`)} />)}
          </div>
        )}
      </div>

      {inactivePlans.length > 0 && (
        <div>
          <p className="gl2-eyebrow">Inactive plans</p>
          <div className="gl2-grid-3" style={{ opacity: 0.7 }}>
            {inactivePlans.map((plan) => <PlanCard key={plan.id} plan={plan} onToggle={() => handleToggle(plan.id)} onEdit={() => navigate(`/owner/plans/edit/${plan.id}`)} />)}
          </div>
        </div>
      )}
    </section>
  );
}
