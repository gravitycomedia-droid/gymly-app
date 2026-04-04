import { useState } from 'react';

const DEFAULT_PLANS = [
  { id: 'plan_monthly', name: 'Monthly', price: '', duration: '30', isActive: true, isDefault: true },
  { id: 'plan_quarterly', name: 'Quarterly', price: '', duration: '90', isActive: true, isDefault: true },
  { id: 'plan_annual', name: 'Annual', price: '', duration: '365', isActive: true, isDefault: true },
];

const Step4Plans = ({ data, setData, errors }) => {
  const plans = data.plans.length > 0 ? data.plans : DEFAULT_PLANS;

  if (data.plans.length === 0) {
    setData({ ...data, plans: DEFAULT_PLANS });
  }

  const updatePlan = (index, field, value) => {
    const newPlans = [...plans];
    newPlans[index] = { ...newPlans[index], [field]: value };
    setData({ ...data, plans: newPlans });
  };

  const togglePlan = (index) => {
    const newPlans = [...plans];
    newPlans[index] = { ...newPlans[index], isActive: !newPlans[index].isActive };
    setData({ ...data, plans: newPlans });
  };

  const addCustomPlan = () => {
    const newPlan = {
      id: `plan_custom_${Date.now()}`,
      name: '',
      price: '',
      duration: '',
      isActive: true,
      isDefault: false,
    };
    setData({ ...data, plans: [...plans, newPlan] });
  };

  const deletePlan = (index) => {
    const newPlans = plans.filter((_, i) => i !== index);
    setData({ ...data, plans: newPlans });
  };

  return (
    <>
      <div className="step-header">
        <h2 className="step-title">Membership plans</h2>
        <p className="step-subtitle">Step 4 of 5 — Add at least one membership plan to get started</p>
      </div>

      {errors.plans && <p className="input-error" style={{ marginBottom: 16 }}>{errors.plans}</p>}

      {plans.map((plan, index) => (
        <div key={plan.id} className="plan-card glass-card">
          <div className="plan-card-header">
            <input
              type="text"
              className="input-field"
              placeholder="Plan name"
              value={plan.name}
              onChange={(e) => updatePlan(index, 'name', e.target.value)}
              style={{ width: 'calc(100% - 60px)', fontSize: 15, fontWeight: 600 }}
              id={`plan-name-${index}`}
            />
            <button
              type="button"
              className={`plan-toggle ${plan.isActive ? 'active' : ''}`}
              onClick={() => togglePlan(index)}
              id={`plan-toggle-${index}`}
            >
              <div className="plan-toggle-knob" />
            </button>
          </div>

          <div className="plan-fields">
            <div className="input-group">
              <label className="input-label">Price</label>
              <div className="plan-price-wrapper">
                <span className="plan-price-prefix">₹</span>
                <input
                  type="number"
                  className="input-field plan-price-input"
                  placeholder="999"
                  value={plan.price}
                  onChange={(e) => updatePlan(index, 'price', e.target.value)}
                  id={`plan-price-${index}`}
                />
              </div>
            </div>
            <div className="input-group">
              <label className="input-label">Duration (days)</label>
              <input
                type="number"
                className="input-field"
                placeholder="30"
                value={plan.duration}
                onChange={(e) => updatePlan(index, 'duration', e.target.value)}
                id={`plan-duration-${index}`}
              />
            </div>
          </div>

          {!plan.isDefault && (
            <button
              type="button"
              className="plan-delete"
              onClick={() => deletePlan(index)}
              title="Remove plan"
            >
              ✕
            </button>
          )}
        </div>
      ))}

      <button
        type="button"
        className="btn-ghost"
        onClick={addCustomPlan}
        id="add-custom-plan-btn"
      >
        + Add custom plan
      </button>
    </>
  );
};

export default Step4Plans;
