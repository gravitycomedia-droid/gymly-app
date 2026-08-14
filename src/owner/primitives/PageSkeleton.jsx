// Shimmering placeholder shown while a screen's data is loading — replaces
// the old spinning-dot loaders across every owner screen. Shape roughly
// matches what's about to render so content doesn't "pop" once it lands.

function Line({ width = '100%', height = 13, style }) {
  return <div className="gl2-skel gl2-skel-line" style={{ width, height, ...style }} />;
}

function Circle({ size = 40 }) {
  return <div className="gl2-skel gl2-skel-circle" style={{ width: size, height: size }} />;
}

function ListRows({ rows = 6, avatar = true }) {
  return (
    <div className="gl2-list">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="gl2-skel-list-row">
          {avatar && <Circle />}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <Line width={`${45 + (i % 3) * 10}%`} />
            <Line width={`${65 + (i % 2) * 15}%`} height={11} />
          </div>
          <div className="gl2-skel gl2-skel-line" style={{ width: 60, height: 22, borderRadius: 20 }} />
        </div>
      ))}
    </div>
  );
}

function KpiRow({ count = 3 }) {
  return (
    <div className="gl2-kpi-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="gl2-skel-card">
          <Line width="60%" height={11} style={{ marginBottom: 10 }} />
          <Line width="40%" height={26} />
        </div>
      ))}
    </div>
  );
}

export default function PageSkeleton({ variant = 'list', rows = 6 }) {
  if (variant === 'profile') {
    return (
      <div>
        <Line width={120} height={14} style={{ marginBottom: 14 }} />
        <div className="gl2-grid-2">
          <div className="gl2-skel-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 18 }}>
              <Circle size={60} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Line width="55%" height={18} />
                <Line width="35%" height={12} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
              <Line width={110} height={38} style={{ borderRadius: 10 }} />
              <Line width={110} height={38} style={{ borderRadius: 10 }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
              {[0, 1, 2].map((i) => <div key={i} className="gl2-skel gl2-skel-row" style={{ height: 64 }} />)}
            </div>
          </div>
          <div className="gl2-skel gl2-skel-block" style={{ height: 220 }} />
        </div>
      </div>
    );
  }

  if (variant === 'kpis') {
    return (
      <div>
        <Line width={160} height={14} style={{ marginBottom: 14 }} />
        <KpiRow />
        <ListRows rows={rows} />
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div>
        <Line width={160} height={14} style={{ marginBottom: 14 }} />
        <div className="gl2-skel-card" style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {Array.from({ length: 4 }).map((_, i) => <Line key={i} width={i % 2 ? '70%' : '45%'} height={40} style={{ borderRadius: 11 }} />)}
        </div>
      </div>
    );
  }

  if (variant === 'grid') {
    return (
      <div>
        <Line width={160} height={14} style={{ marginBottom: 14 }} />
        <div className="gl2-grid-3">
          {Array.from({ length: rows }).map((_, i) => <div key={i} className="gl2-skel gl2-skel-row" style={{ height: 140 }} />)}
        </div>
      </div>
    );
  }

  // 'list' (default)
  return (
    <div>
      <Line width={160} height={14} style={{ marginBottom: 14 }} />
      <ListRows rows={rows} />
    </div>
  );
}
