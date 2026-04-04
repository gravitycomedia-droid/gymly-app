const GYM_TYPES = ['Local', 'Premium', 'Studio', 'CrossFit', 'Yoga'];

const Step2Location = ({ data, setData, errors }) => {
  return (
    <>
      <div className="step-header">
        <h2 className="step-title">Location &amp; Type</h2>
        <p className="step-subtitle">Step 2 of 5 — Where is your gym?</p>
      </div>

      <div className="input-group">
        <label className="input-label">City</label>
        <input
          type="text"
          className={`input-field ${errors.city ? 'error' : ''}`}
          placeholder="Hyderabad"
          value={data.city}
          onChange={(e) => setData({ ...data, city: e.target.value })}
          id="city-input"
        />
        {errors.city && <p className="input-error">{errors.city}</p>}
      </div>

      <div className="input-group">
        <label className="input-label">Full address</label>
        <input
          type="text"
          className={`input-field ${errors.address ? 'error' : ''}`}
          placeholder="Banjara Hills, Road No. 12..."
          value={data.address}
          onChange={(e) => setData({ ...data, address: e.target.value })}
          id="address-input"
        />
        {errors.address && <p className="input-error">{errors.address}</p>}
      </div>

      <div className="input-group">
        <label className="input-label">Gym type</label>
        <div className="pill-group">
          {GYM_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={`pill ${data.gymType === type.toLowerCase() ? 'selected' : ''}`}
              onClick={() => setData({ ...data, gymType: type.toLowerCase() })}
              id={`gym-type-${type.toLowerCase()}`}
            >
              {type}
            </button>
          ))}
        </div>
        {errors.gymType && <p className="input-error">{errors.gymType}</p>}
      </div>

      <div className="input-group">
        <label className="input-label">Working hours</label>
        <div className="time-row">
          <div className="input-group" style={{ marginBottom: 0 }}>
            <input
              type="text"
              className={`input-field ${errors.openTime ? 'error' : ''}`}
              placeholder="5:00 AM"
              value={data.openTime}
              onChange={(e) => setData({ ...data, openTime: e.target.value })}
              id="open-time-input"
            />
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <input
              type="text"
              className={`input-field ${errors.closeTime ? 'error' : ''}`}
              placeholder="11:00 PM"
              value={data.closeTime}
              onChange={(e) => setData({ ...data, closeTime: e.target.value })}
              id="close-time-input"
            />
          </div>
        </div>
        {(errors.openTime || errors.closeTime) && (
          <p className="input-error">{errors.openTime || errors.closeTime}</p>
        )}
      </div>

      <div className="input-group">
        <label className="input-label">Number of branches</label>
        <input
          type="number"
          className="input-field"
          placeholder="1"
          min="1"
          value={data.branches}
          onChange={(e) => setData({ ...data, branches: e.target.value })}
          id="branches-input"
        />
      </div>
    </>
  );
};

export default Step2Location;
