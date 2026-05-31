import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getGym } from '../../firebase/firestore';
import { getInitials, getAvatarColor } from '../../utils/helpers';
import './SubscriptionPlans.css';

const SubscriptionPlans = () => {
  const { gymId } = useParams();
  const navigate = useNavigate();
  const [gym, setGym] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!gymId) return;
    getGym(gymId)
      .then((data) => {
        if (data) {
          setGym(data);
        } else {
          setError('Gym not found');
        }
      })
      .catch((err) => {
        console.error('Error fetching gym:', err);
        setError('Failed to load plans');
      })
      .finally(() => setLoading(false));
  }, [gymId]);

  if (loading) {
    return (
      <div className="subscription-public-screen">
        <div className="spinner-center">
          <div className="spinner spinner-primary" style={{ width: 40, height: 40 }} />
        </div>
      </div>
    );
  }

  if (error || !gym) {
    return (
      <div className="subscription-public-screen">
        <div className="error-container">
          <div className="error-icon">⚠️</div>
          <h2 className="error-title">{error || 'Something went wrong'}</h2>
          <p className="error-desc">We couldn't find the gym subscription plans you're looking for.</p>
          <button className="btn-primary" onClick={() => navigate('/')} style={{ marginTop: 20 }}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const allPlans = gym?.settings?.plans?.filter((p) => p.is_active) || [];
  
  // Categorize plans
  const trainerPlans = allPlans.filter(p => p.name.toLowerCase().includes('trainer'));
  const membershipPlans = allPlans.filter(p => !p.name.toLowerCase().includes('trainer'));

  const monthlyPlans = membershipPlans.filter(p => p.duration_days >= 28 && p.duration_days <= 35);
  const yearlyPlans = membershipPlans.filter(p => p.duration_days >= 360);
  const otherPlans = membershipPlans.filter(p => 
    !(p.duration_days >= 28 && p.duration_days <= 35) && 
    !(p.duration_days >= 360)
  );

  const handleJoinPlan = (plan) => {
    const gymPhone = gym.phone || '';
    const cleanPhone = gymPhone.replace(/[^0-9]/g, '');
    const message = `Hi ${gym.name}! I'm interested in joining the "${plan.name}" plan I saw on Gymly. Can you help me with the next steps?`;
    const whatsappUrl = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const avatarColor = getAvatarColor(gym.name);

  return (
    <div className="subscription-public-screen">
      <div className="subscription-public-content">
        
        {/* Header */}
        <header className="subscription-header">
          <div className="gym-brand">
            <div className="gym-logo" style={{ background: avatarColor.bg, color: avatarColor.text }}>
              {getInitials(gym.name)}
            </div>
            <div className="gym-info">
              <h1 className="gym-name">{gym.name}</h1>
              <p className="gym-location">
                {gym.city} {gym.address && `• ${gym.address}`}
              </p>
            </div>
          </div>
          {gym.description && <p className="gym-description">{gym.description}</p>}
        </header>

        {/* Plans Sections */}
        <main className="plans-container">
          
          {/* Monthly Plans */}
          {monthlyPlans.length > 0 && (
            <section className="plan-section">
              <h2 className="section-title">Monthly Plans</h2>
              <div className="plans-grid">
                {monthlyPlans.map(plan => (
                  <PlanCard key={plan.id} plan={plan} onJoin={() => handleJoinPlan(plan)} />
                ))}
              </div>
            </section>
          )}

          {/* Yearly Plans */}
          {yearlyPlans.length > 0 && (
            <section className="plan-section">
              <h2 className="section-title">Yearly Savings</h2>
              <div className="plans-grid">
                {yearlyPlans.map(plan => (
                  <PlanCard key={plan.id} plan={plan} onJoin={() => handleJoinPlan(plan)} />
                ))}
              </div>
            </section>
          )}

          {/* Other Plans */}
          {otherPlans.length > 0 && (
            <section className="plan-section">
              <h2 className="section-title">Special Memberships</h2>
              <div className="plans-grid">
                {otherPlans.map(plan => (
                  <PlanCard key={plan.id} plan={plan} onJoin={() => handleJoinPlan(plan)} />
                ))}
              </div>
            </section>
          )}

          {/* Trainer Plans */}
          {trainerPlans.length > 0 && (
            <section className="plan-section">
              <h2 className="section-title">Trainer Packages</h2>
              <div className="plans-grid">
                {trainerPlans.map(plan => (
                  <PlanCard key={plan.id} plan={plan} onJoin={() => handleJoinPlan(plan)} isTrainer />
                ))}
              </div>
            </section>
          )}

          {allPlans.length === 0 && (
            <div className="no-plans">
              <p>No active plans available at the moment. Please contact the gym directly.</p>
              {gym.phone && (
                <button className="btn-primary" onClick={() => window.open(`tel:${gym.phone}`)}>
                  Call {gym.phone}
                </button>
              )}
            </div>
          )}
        </main>

        <footer className="subscription-footer">
          <p>Powered by <span>Gymly</span></p>
        </footer>
      </div>
    </div>
  );
};

const PlanCard = ({ plan, onJoin, isTrainer }) => {
  return (
    <div className="plan-card glass-card" style={{ borderTop: `4px solid ${plan.color || 'var(--primary)'}` }}>
      <div className="plan-header">
        <h3 className="plan-name">{plan.name}</h3>
        {isTrainer && <span className="trainer-badge">Personal Training</span>}
      </div>
      <div className="plan-price-box">
        <span className="currency">₹</span>
        <span className="price">{plan.price.toLocaleString('en-IN')}</span>
        <span className="duration">/ {plan.duration_days} days</span>
      </div>
      {plan.description && <p className="plan-desc">{plan.description}</p>}
      <button className="btn-primary join-btn" onClick={onJoin}>
        Join Now
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12"></line>
          <polyline points="12 5 19 12 12 19"></polyline>
        </svg>
      </button>
    </div>
  );
};

export default SubscriptionPlans;
