import '../../owner/theme.css';

// Shared chrome for every auth/onboarding screen: the 430px brand panel
// (desktop only — hidden under 1024px by CSS) + the centred form column.
// Mirrors handoff/src/GymloopAuth.dc.html's shared layout so sign in, sign
// up, PIN and the setup wizard all look like one continuous flow.
//
// `mode` is a pure CSS media-query switch in production (no JS breakpoint
// state needed) — see .gla-panel / .gla-mobile-header in owner/theme.css.

const BrandMark = ({ size = 38, iconSize = 28 }) => (
  <span
    className="gla-brand-mark"
    style={{ width: size, height: size, borderRadius: size === 38 ? 12 : 10 }}
  >
    <svg width={iconSize} height={iconSize} viewBox="0 0 44 44" fill="none" aria-label="Gymloop">
      <path d="M26.8 8.8A14 14 0 1 1 17.2 8.8" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" />
      <path d="M21 7.4 18.3 11.8 16.1 5.8Z" fill="#fff" />
      <rect x="15" y="20" width="14" height="4" rx="2" fill="#fff" />
      <rect x="12.4" y="17.5" width="4" height="9" rx="2" fill="#fff" />
      <rect x="27.6" y="17.5" width="4" height="9" rx="2" fill="#fff" />
    </svg>
  </span>
);

const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4">
    <path d="m5 13 4.5 4.5L19 7" />
  </svg>
);

export default function AuthShell({ headline, sub, points, onHelp, variant, children }) {
  return (
    <div className={`gl2-app gla-shell ${variant || ''}`}>
      <aside className="gla-panel" aria-hidden="true">
        <svg
          className="gla-panel-decor"
          width="420"
          height="420"
          viewBox="0 0 44 44"
          fill="none"
        >
          <path d="M26.8 8.8A14 14 0 1 1 17.2 8.8" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
          <path d="M21 7.4 18.3 11.8 16.1 5.8Z" fill="#fff" />
          <rect x="15" y="20" width="14" height="4" rx="2" fill="#fff" />
          <rect x="12.4" y="17.5" width="4" height="9" rx="2" fill="#fff" />
          <rect x="27.6" y="17.5" width="4" height="9" rx="2" fill="#fff" />
        </svg>

        <div className="gla-brand">
          <BrandMark />
          <span className="gla-brand-name">Gymloop</span>
        </div>

        <p className="gla-panel-headline">{headline}</p>
        <p className="gla-panel-sub">{sub}</p>

        <div className="gla-panel-points">
          {(points || []).map((p, i) => (
            <div className="gla-panel-point" key={i}>
              <span className="gla-panel-point-check"><CheckIcon /></span>
              <span className="gla-panel-point-text">{p}</span>
            </div>
          ))}
        </div>

        <p className="gla-panel-footnote">
          Used by gyms across Telangana and Karnataka. Your data stays in India.
        </p>
      </aside>

      <div className="gla-form-col">
        <header className="gla-mobile-header">
          <div className="gla-mobile-brand">
            <BrandMark size={32} iconSize={24} />
            <span className="gla-mobile-brand-name">Gymloop</span>
          </div>
          {onHelp && (
            <a href="#" onClick={(e) => { e.preventDefault(); onHelp(); }} style={{ fontSize: 13.5, fontWeight: 700 }}>
              Need help?
            </a>
          )}
        </header>

        <main className="gla-main">{children}</main>
      </div>
    </div>
  );
}
