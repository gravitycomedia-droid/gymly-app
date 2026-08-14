const EmptyState = ({ title, sub, action }) => (
  <div className="gl2-empty">
    <p className="gl2-empty-title">{title}</p>
    {sub && <p className="gl2-empty-sub">{sub}</p>}
    {action}
  </div>
);

export default EmptyState;
