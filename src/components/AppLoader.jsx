import './AppLoader.css';

// Shown while a route's lazy chunk is still downloading — replaces the old
// spinning-dot Suspense fallback everywhere in the app (owner/member/staff).
export default function AppLoader() {
  return (
    <div className="app-loader" role="status" aria-live="polite" aria-label="Loading">
      <svg className="app-loader-figure" viewBox="0 0 200 220" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g className="al-bob">
          {/* legs */}
          <g className="al-leg-left">
            <line x1="100" y1="128" x2="84" y2="205" stroke="#6C63C7" strokeWidth="16" strokeLinecap="round" />
          </g>
          <g className="al-leg-right">
            <line x1="100" y1="128" x2="116" y2="205" stroke="#6C63C7" strokeWidth="16" strokeLinecap="round" />
          </g>

          {/* torso */}
          <line x1="100" y1="55" x2="100" y2="122" stroke="#4A438F" strokeWidth="27" strokeLinecap="round" />

          {/* left arm (upper arm static, forearm + dumbbell curl) */}
          <line x1="78" y1="68" x2="66" y2="98" stroke="#4A438F" strokeWidth="13" strokeLinecap="round" />
          <g className="al-arm-left">
            <line x1="66" y1="98" x2="60" y2="132" stroke="#4A438F" strokeWidth="12" strokeLinecap="round" />
            <g transform="translate(60,132)">
              <rect x="-10" y="-3.5" width="20" height="7" rx="2.5" fill="#14152B" />
              <circle cx="-11" cy="0" r="7.5" fill="#14152B" />
              <circle cx="11" cy="0" r="7.5" fill="#14152B" />
            </g>
          </g>

          {/* right arm (mirrored) */}
          <line x1="122" y1="68" x2="134" y2="98" stroke="#4A438F" strokeWidth="13" strokeLinecap="round" />
          <g className="al-arm-right">
            <line x1="134" y1="98" x2="140" y2="132" stroke="#4A438F" strokeWidth="12" strokeLinecap="round" />
            <g transform="translate(140,132)">
              <rect x="-10" y="-3.5" width="20" height="7" rx="2.5" fill="#14152B" />
              <circle cx="-11" cy="0" r="7.5" fill="#14152B" />
              <circle cx="11" cy="0" r="7.5" fill="#14152B" />
            </g>
          </g>

          {/* head */}
          <circle cx="100" cy="38" r="17" fill="#6C63C7" />
        </g>
      </svg>
      <div>
        <span className="app-loader-word">Gymloop</span>
        <span className="app-loader-dots"><i /><i /><i /></span>
      </div>
    </div>
  );
}
