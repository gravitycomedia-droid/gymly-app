const Step1BasicInfo = ({ data, setData, errors }) => {
  return (
    <>
      <div className="step-header">
        <h2 className="step-title">Basic info</h2>
        <p className="step-subtitle">Step 1 of 5 — Tell us about yourself</p>
      </div>

      <div className="input-group">
        <label className="input-label">Owner name</label>
        <input
          type="text"
          className={`input-field ${errors.ownerName ? 'error' : ''}`}
          placeholder="Your full name"
          value={data.ownerName}
          onChange={(e) => setData({ ...data, ownerName: e.target.value })}
          id="owner-name-input"
        />
        {errors.ownerName && <p className="input-error">{errors.ownerName}</p>}
      </div>

      <div className="input-group">
        <label className="input-label">Gym name</label>
        <input
          type="text"
          className={`input-field ${errors.gymName ? 'error' : ''}`}
          placeholder="Fitness First, Iron Club..."
          value={data.gymName}
          onChange={(e) => setData({ ...data, gymName: e.target.value })}
          id="gym-name-input"
        />
        {errors.gymName && <p className="input-error">{errors.gymName}</p>}
      </div>
    </>
  );
};

export default Step1BasicInfo;
