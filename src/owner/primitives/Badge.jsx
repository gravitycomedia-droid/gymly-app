const VARIANT_CLASS = {
  active: 'gl2-tag-active',
  expiring: 'gl2-tag-expiring',
  expired: 'gl2-tag-expired',
  neutral: 'gl2-tag-neutral',
};

const Badge = ({ children, variant = 'neutral', bg, fg }) => (
  <span
    className={`gl2-tag ${VARIANT_CLASS[variant] || VARIANT_CLASS.neutral}`}
    style={bg || fg ? { background: bg, color: fg } : undefined}
  >
    {children}
  </span>
);

export default Badge;
