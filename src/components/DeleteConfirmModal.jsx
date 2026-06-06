import { useState } from 'react';

const DeleteConfirmModal = ({ memberName, onConfirm, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [deletePayments, setDeletePayments] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    try {
      await onConfirm(deletePayments);
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
              background: 'rgba(186, 26, 26, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke='var(--error)' strokeWidth="2" fill="none" />
              <line x1="12" y1="8" x2="12" y2="12" stroke='var(--error)' strokeWidth="2" strokeLinecap="round" />
              <line x1="12" y1="16" x2="12.01" y2="16" stroke='var(--error)' strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>

          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Delete member?</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            <strong>{memberName}</strong> will be moved to Recycle Bin and can be restored within 30 days.
          </p>
        </div>

        {/* Delete payments option */}
        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '12px 14px',
            borderRadius: 10,
            background: deletePayments ? 'rgba(186,26,26,0.07)' : 'rgba(0,0,0,0.03)',
            border: `1px solid ${deletePayments ? 'rgba(186,26,26,0.25)' : 'rgba(0,0,0,0.08)'}`,
            cursor: 'pointer',
            marginBottom: 20,
            transition: 'all 0.15s',
          }}
        >
          <input
            type="checkbox"
            checked={deletePayments}
            onChange={(e) => setDeletePayments(e.target.checked)}
            style={{ marginTop: 2, accentColor: 'var(--error)', width: 16, height: 16, flexShrink: 0 }}
          />
          <span style={{ fontSize: 13, lineHeight: 1.5 }}>
            <strong style={{ display: 'block', marginBottom: 2 }}>Also delete all payments</strong>
            <span style={{ color: 'var(--text-muted)' }}>Permanently removes all payment records for this member. This cannot be undone.</span>
          </span>
        </label>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-ghost" onClick={onClose} style={{ flex: 1 }} id="cancel-delete-btn">
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleDelete}
            disabled={loading}
            style={{ flex: 1, background: 'var(--error)' }}
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
