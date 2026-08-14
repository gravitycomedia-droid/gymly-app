import StatTile from '../primitives/StatTile';

// Generic list-screen chrome (header + KPI row + search/filter row) ported
// from the prototype's ListScreen. Row rendering stays with each screen since
// row shape differs too much between Payments/Staff/WhatsApp/Kiosk to force
// into one schema.
export default function ListScreen({ title, subtitle, kpis, primaryAction, filters, activeFilter, onFilterChange, search, onSearchChange, searchPlaceholder = 'Search…', children }) {
  return (
    <section>
      <div className="gl2-page-header">
        <div>
          <h1 className="gl2-page-title">{title}</h1>
          {subtitle && <p className="gl2-page-sub">{subtitle}</p>}
        </div>
        {primaryAction && <div className="gl2-page-actions">{primaryAction}</div>}
      </div>

      {kpis && (
        <div className="gl2-kpi-grid">
          {kpis.map((k) => <StatTile key={k.label} {...k} />)}
        </div>
      )}

      {(filters || onSearchChange) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
          {onSearchChange && (
            <input className="gl2-input" placeholder={searchPlaceholder} value={search} onChange={(e) => onSearchChange(e.target.value)} />
          )}
          {filters && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', overflowX: 'auto' }}>
              {filters.map((f) => (
                <button key={f} type="button" className={`gl2-filter-chip ${activeFilter === f ? 'active' : ''}`} onClick={() => onFilterChange(f)}>{f}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {children}
    </section>
  );
}
