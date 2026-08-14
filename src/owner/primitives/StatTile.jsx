const StatTile = ({ label, value, delta, color }) => (
  <div className="gl2-kpi-tile">
    <p className="gl2-kpi-label">{label}</p>
    <p className="gl2-kpi-value" style={color ? { color } : undefined}>{value}</p>
    {delta && <p className="gl2-kpi-delta">{delta}</p>}
  </div>
);

export default StatTile;
