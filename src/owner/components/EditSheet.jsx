// Bottom-sheet wrapper for inline settings editors (gym info, hours, tax, ...).
export default function EditSheet({ title, onClose, children }) {
  return (
    <div className="gl2-overlay gl2-quicksheet-overlay" style={{ position: 'fixed', zIndex: 200 }} onClick={onClose}>
      <div className="gl2-quicksheet" style={{ maxWidth: 520, margin: '0 auto', borderRadius: 18, maxHeight: '85vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <p className="gl2-quicksheet-title" style={{ margin: 0 }}>{title}</p>
          <button type="button" onClick={onClose} className="gl2-icon-btn" style={{ width: 32, height: 32 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ToggleRow({ label, description, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{label}</p>
        {description && <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--gl2-muted)' }}>{description}</p>}
      </div>
      <button type="button" className={`gl2-toggle-track ${value ? 'on' : ''}`} onClick={() => onChange(!value)}>
        <span className="gl2-toggle-knob" />
      </button>
    </div>
  );
}

export function SettingsRow({ icon, label, desc, onClick, action }) {
  return (
    <div className="gl2-row" style={{ cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <span style={{ fontSize: 20, width: 28, textAlign: 'center', flex: 'none' }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 14.5 }}>{label}</p>
        {desc && <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--gl2-muted)' }}>{desc}</p>}
      </div>
      {action || (onClick && <span className="material-symbols-outlined" style={{ color: 'var(--gl2-muted-2)' }}>chevron_right</span>)}
    </div>
  );
}
