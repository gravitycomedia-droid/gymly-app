const Step5Review = ({ data, loading }) => {
  const activePlans = data.plans.filter((p) => p.isActive && p.price);
  const photoCount = data.photos.filter(Boolean).length;

  return (
    <>
      <div className="step-header">
        <h2 className="step-title">Everything look good?</h2>
        <p className="step-subtitle">Step 5 of 5 — You can edit any details from your dashboard later.</p>
      </div>

      <div className="glass-card" style={{ padding: 20 }}>
        {/* Gym Info */}
        <div className="review-section">
          <div className="review-section-title">Gym Info</div>
          <div className="review-row">
            <span className="review-label">Gym name</span>
            <span className="review-value">{data.gymName}</span>
          </div>
          <div className="review-row">
            <span className="review-label">Owner</span>
            <span className="review-value">{data.ownerName}</span>
          </div>
          <div className="review-row">
            <span className="review-label">Type</span>
            <span className="review-value" style={{ textTransform: 'capitalize' }}>{data.gymType || '–'}</span>
          </div>
          <div className="review-row">
            <span className="review-label">City</span>
            <span className="review-value">{data.city}</span>
          </div>
          <div className="review-row">
            <span className="review-label">Hours</span>
            <span className="review-value">{data.openTime} – {data.closeTime}</span>
          </div>
          <div className="review-row">
            <span className="review-label">Branches</span>
            <span className="review-value">{data.branches || 1}</span>
          </div>
        </div>

        {/* Plans */}
        <div className="review-section">
          <div className="review-section-title">Plans</div>
          {activePlans.length > 0 ? (
            activePlans.map((plan) => (
              <div className="review-row" key={plan.id}>
                <span className="review-label">{plan.name}</span>
                <span className="review-value">₹{plan.price}</span>
              </div>
            ))
          ) : (
            <div className="review-row">
              <span className="review-label" style={{ color: 'var(--text-muted)' }}>No active plans</span>
            </div>
          )}
        </div>

        {/* Photos */}
        <div className="review-section" style={{ marginBottom: 0 }}>
          <div className="review-section-title">Photos</div>
          <div className="review-row" style={{ borderBottom: 'none' }}>
            <span className="review-label">
              {photoCount > 0 ? `${photoCount} photo${photoCount > 1 ? 's' : ''} uploaded` : 'No photos yet'}
            </span>
            {data.logoPreview && (
              <span className="review-value" style={{ color: 'var(--success)' }}>Logo ✓</span>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default Step5Review;
