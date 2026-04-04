const STATUS_STYLES = {
  active: { bg: '#E1F5EE', color: '#0F6E56' },
  expiring: { bg: '#FAEEDA', color: '#633806' },
  expired: { bg: '#FCEBEB', color: '#A32D2D' },
};

const StatusBadge = ({ type = 'active', label }) => {
  const style = STATUS_STYLES[type] || STATUS_STYLES.active;
  const displayLabel = label || (type === 'active' ? 'Active' : type === 'expiring' ? 'Expiring' : 'Expired');

  return (
    <span
      className="status-badge"
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        background: style.bg,
        color: style.color,
        whiteSpace: 'nowrap',
      }}
    >
      {displayLabel}
    </span>
  );
};

export default StatusBadge;
