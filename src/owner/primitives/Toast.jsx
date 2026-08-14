const Toast = ({ message }) => {
  if (!message) return null;
  return (
    <div className="gl2-toast-wrap">
      <div className="gl2-toast">
        <span className="material-symbols-outlined" style={{ fontSize: 17, color: '#7BE3AE' }}>check_circle</span>
        <span>{message}</span>
      </div>
    </div>
  );
};

export default Toast;
