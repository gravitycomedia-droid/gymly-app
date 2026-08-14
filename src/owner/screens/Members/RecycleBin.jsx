import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { db } from '../../../firebase/config';
import EmptyState from '../../primitives/EmptyState';

export default function RecycleBin() {
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  const { showToast } = useToast();

  const [binMembers, setBinMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmPermanentId, setConfirmPermanentId] = useState(null);

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    const binRef = collection(db, 'deleted_members', userDoc.gym_id, 'bin');
    const unsub = onSnapshot(binRef, (snap) => {
      const docs = [];
      snap.forEach((d) => docs.push({ id: d.id, ...d.data() }));
      docs.sort((a, b) => (b.deleted_at?.toMillis?.() || 0) - (a.deleted_at?.toMillis?.() || 0));
      setBinMembers(docs);
      setLoading(false);
    }, (err) => { console.error('Recycle bin error:', err); setLoading(false); });
    return () => unsub();
  }, [userDoc?.gym_id]);

  const handleRestore = async (memberId) => {
    setRestoringId(memberId);
    try {
      const { httpsCallable } = await import('firebase/functions');
      const { functions } = await import('../../../firebase/config');
      await httpsCallable(functions, 'restoreMember')({ memberId, gymId: userDoc.gym_id });
      showToast('Member restored successfully', 'success');
    } catch (err) {
      showToast(`Failed to restore: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      setRestoringId(null);
    }
  };

  const handlePermanentDelete = async () => {
    if (!confirmPermanentId) return;
    setDeletingId(confirmPermanentId);
    setConfirmPermanentId(null);
    try {
      const { httpsCallable } = await import('firebase/functions');
      const { functions } = await import('../../../firebase/config');
      await httpsCallable(functions, 'permanentlyDeleteMember')({ memberId: confirmPermanentId, gymId: userDoc.gym_id });
      showToast('Member permanently deleted', 'success');
    } catch (err) {
      showToast(`Failed to delete: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (ts) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const daysRemaining = (expiresAt) => expiresAt ? Math.max(0, Math.ceil((expiresAt.toMillis() - Date.now()) / 86400000)) : 0;

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}><div className="spinner spinner-primary" style={{ width: 32, height: 32 }} /></div>;

  return (
    <section data-screen-label="Recycle bin">
      <button type="button" className="gl2-back-link" onClick={() => navigate('/owner/members')}>
        <span className="material-symbols-outlined" style={{ fontSize: 17 }}>arrow_back_ios</span>Members
      </button>
      <h1 className="gl2-page-title" style={{ marginBottom: 4 }}>Recycle Bin</h1>
      <p className="gl2-page-sub" style={{ marginBottom: 14 }}>Deleted members, kept for 30 days before permanent removal.</p>

      <div className="gl2-list">
        {binMembers.length === 0 ? (
          <EmptyState title="Recycle bin is empty" sub="Deleted members show up here for 30 days." />
        ) : (
          binMembers.map((entry) => {
            const days = daysRemaining(entry.expires_at);
            const isUrgent = days <= 5;
            return (
              <div key={entry.id} className="gl2-row" style={{ flexWrap: 'wrap' }}>
                <span className="gl2-avatar" style={{ background: 'var(--gl2-danger-strong)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>person_off</span>
                </span>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <p style={{ margin: 0, fontWeight: 700 }}>{entry.snapshot?.name || 'Unknown'}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--gl2-muted)' }}>{entry.snapshot?.phone || '—'}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 12.5, color: isUrgent ? 'var(--gl2-danger-fg)' : 'var(--gl2-muted)', fontWeight: isUrgent ? 700 : 500 }}>
                    Deleted {formatDate(entry.deleted_at)}{entry.deleted_by_name ? ` by ${entry.deleted_by_name}` : ''} · {days} day{days !== 1 ? 's' : ''} remaining
                  </p>
                </div>
                <button type="button" className="gl2-btn gl2-btn-secondary" disabled={restoringId === entry.id || deletingId === entry.id} onClick={() => handleRestore(entry.id)}>
                  {restoringId === entry.id ? 'Restoring…' : 'Restore'}
                </button>
                <button type="button" className="gl2-btn gl2-btn-danger" disabled={restoringId === entry.id || deletingId === entry.id} onClick={() => setConfirmPermanentId(entry.id)}>
                  {deletingId === entry.id ? 'Deleting…' : 'Delete forever'}
                </button>
              </div>
            );
          })
        )}
      </div>

      {confirmPermanentId && (
        <div className="gl2-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14, zIndex: 200 }} onClick={() => setConfirmPermanentId(null)}>
          <div className="gl2-card" style={{ maxWidth: 380, width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <p style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800, textAlign: 'center' }}>Permanently delete?</p>
            <p style={{ margin: '0 0 14px', fontSize: 14, color: 'var(--gl2-muted)', textAlign: 'center' }}>This removes the member and all their data. This cannot be undone.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="gl2-btn gl2-btn-secondary" style={{ flex: 1 }} onClick={() => setConfirmPermanentId(null)}>Cancel</button>
              <button type="button" className="gl2-btn gl2-btn-danger" style={{ flex: 1, background: 'var(--gl2-danger-strong)', color: '#fff', borderColor: 'var(--gl2-danger-strong)' }} onClick={handlePermanentDelete}>Delete forever</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
