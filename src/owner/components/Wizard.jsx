// Generic wizard chrome (step dots + card + cancel link) ported from the
// prototype's Wizard screen. Field rendering and step/validation logic stay in
// each screen (AddMember, EditMember, ...) since those carry real business
// rules (duplicate-phone checks, numbering, photo upload) that a fully
// data-driven field renderer would risk subtly breaking.
export default function Wizard({ title, onCancel, cancelLabel = 'Cancel', steps, activeStep, children }) {
  return (
    <section data-screen-label="Wizard">
      {onCancel && (
        <button type="button" className="gl2-back-link" onClick={onCancel}>
          <span className="material-symbols-outlined" style={{ fontSize: 17 }}>arrow_back_ios</span>
          {cancelLabel}
        </button>
      )}
      <h1 className="gl2-page-title" style={{ marginBottom: 14 }}>{title}</h1>

      {steps && steps.length > 1 && (
        <div className="gl2-wizard-steps">
          {steps.map((label, i) => (
            <div key={label} className={`gl2-wizard-step ${i === activeStep ? 'active' : i < activeStep ? 'done' : ''}`}>
              <span className="gl2-wizard-step-num">{i < activeStep ? '✓' : i + 1}</span>
              <span className="gl2-wizard-step-label">{label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="gl2-wizard-card">{children}</div>
    </section>
  );
}

export function WizardActions({ onBack, backLabel = 'Back', onNext, nextLabel = 'Next', nextDisabled, nextLoading }) {
  return (
    <div className="gl2-wizard-actions">
      {onBack && (
        <button type="button" className="gl2-btn gl2-btn-secondary gl2-btn-lg" onClick={onBack}>{backLabel}</button>
      )}
      <button type="button" className="gl2-btn gl2-btn-primary gl2-btn-lg" onClick={onNext} disabled={nextDisabled || nextLoading}>
        {nextLoading ? 'Please wait…' : nextLabel}
      </button>
    </div>
  );
}

export function Field({ label, required, optional, error, children }) {
  return (
    <label className="gl2-field">
      <span className="gl2-field-label">
        <span>{label}</span>
        {optional && <span className="gl2-field-tag optional">Optional</span>}
        {required && <span className="gl2-field-tag required">Required</span>}
      </span>
      {children}
      {error && <span className="gl2-field-error">{error}</span>}
    </label>
  );
}

export function WizardDone({ title, sub, ctaLabel = 'Done', onDone }) {
  return (
    <div className="gl2-wizard-done">
      <div className="gl2-wizard-done-icon">
        <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--gl2-success-fg)' }}>check_circle</span>
      </div>
      <p className="gl2-wizard-done-title">{title}</p>
      <p className="gl2-wizard-done-sub">{sub}</p>
      <button type="button" className="gl2-btn gl2-btn-primary gl2-btn-lg" onClick={onDone}>{ctaLabel}</button>
    </div>
  );
}
