import { useState } from 'react';

const DeleteConfirmModal = ({ memberName, onConfirm, onClose }) => {
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="bottom-sheet glass-card" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />

        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'rgba(226, 75, 74, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#E24B4A" strokeWidth="2" fill="none" />
              <line x1="12" y1="8" x2="12" y2="12" stroke="#E24B4A" strokeWidth="2" strokeLinecap="round" />
              <line x1="12" y1="16" x2="12.01" y2="16" stroke="#E24B4A" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>

          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Delete member?</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            This will permanently remove <strong>{memberName}</strong> from your gym.
            This cannot be undone.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-ghost" onClick={onClose} style={{ flex: 1 }} id="cancel-delete-btn">
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleDelete}
            disabled={loading}
            style={{ flex: 1, background: '#E24B4A' }}
            id="confirm-delete-btn"
          >
            {loading ? <div className="spinner" /> : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmModal;
