import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import BottomNav from '../../components/BottomNav';

const RecycleBin = () => {
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  const { showToast } = useToast();

  const [binMembers, setBinMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState(null);

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    const binRef = collection(db, 'deleted_members', userDoc.gym_id, 'bin');
    const unsub = onSnapshot(binRef, (snap) => {
      const docs = [];
      snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
      docs.sort((a, b) => (b.deleted_at?.toMillis?.() || 0) - (a.deleted_at?.toMillis?.() || 0));
      setBinMembers(docs);
      setLoading(false);
    }, (err) => {
      console.error('Recycle bin error:', err);
      setLoading(false);
    });
    return () => unsub();
  }, [userDoc?.gym_id]);

  const handleRestore = async (memberId) => {
    setRestoringId(memberId);
    try {
      const { httpsCallable } = await import('firebase/functions');
      const { functions } = await import('../../firebase/config');
      const restore = httpsCallable(functions, 'restoreMember');
      await restore({ memberId, gymId: userDoc.gym_id });
      showToast('Member restored successfully', 'success');
    } catch (err) {
      showToast('Failed to restore: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setRestoringId(null);
    }
  };

  const formatDate = (ts) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const daysRemaining = (expiresAt) => {
    if (!expiresAt) return 0;
    return Math.max(0, Math.ceil((expiresAt.toMillis() - Date.now()) / 86400000));
  };

  if (loading) {
    return (
      <div className="screen">
        <div className="screen-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <div className="spinner spinner-primary" style={{ width: 32, height: 32 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24 md:pb-0">
      <header className="fixed top-0 w-full z-50 bg-surface/30 backdrop-blur-3xl border-b border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.1)]">
        <div className="flex justify-between items-center px-4 pt-12 pb-4 w-full max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/owner/members')}
              className="w-9 h-9 rounded-full glass-panel flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors"
            >
              <span className="material-symbols-outlined text-xl">arrow_back</span>
            </button>
            <div>
              <p className="font-label-sm text-[10px] text-on-surface-variant uppercase tracking-wider">Members</p>
              <h1 className="font-headline-sm text-lg font-bold text-on-surface">Recycle Bin</h1>
            </div>
          </div>
          <span className="material-symbols-outlined text-2xl text-on-surface-variant">delete</span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-8">
        {binMembers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-surface-variant/40 flex items-center justify-center">
              <span className="material-symbols-outlined text-3xl text-on-surface-variant">delete</span>
            </div>
            <h3 className="font-headline-sm text-lg text-on-surface">Recycle Bin is empty</h3>
            <p className="font-body-md text-sm text-on-surface-variant max-w-xs">
              No deleted members. Deleted members appear here for 30 days before permanent removal.
            </p>
          </div>
        ) : (
          <>
            <p className="font-body-md text-sm text-on-surface-variant mb-6">
              {binMembers.length} deleted member{binMembers.length !== 1 ? 's' : ''} · Automatically removed after 30 days
            </p>
            <div className="flex flex-col gap-4">
              {binMembers.map((entry) => {
                const days = daysRemaining(entry.expires_at);
                const isUrgent = days <= 5;
                return (
                  <div
                    key={entry.id}
                    className="glass-panel rounded-2xl p-5 border border-white/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-11 h-11 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-xl text-red-400">person_off</span>
                      </div>
                      <div>
                        <p className="font-headline-sm font-bold text-on-surface">
                          {entry.snapshot?.name || 'Unknown'}
                        </p>
                        <p className="font-body-sm text-sm text-on-surface-variant">
                          {entry.snapshot?.phone || '—'}
                        </p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                          <span className="font-label-sm text-xs text-on-surface-variant">
                            Deleted {formatDate(entry.deleted_at)}
                            {entry.deleted_by_name ? ` by ${entry.deleted_by_name}` : ''}
                          </span>
                          <span className={`font-label-sm text-xs font-semibold ${isUrgent ? 'text-red-500' : 'text-on-surface-variant'}`}>
                            {days} day{days !== 1 ? 's' : ''} remaining
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRestore(entry.id)}
                      disabled={restoringId === entry.id}
                      className="px-5 py-2.5 rounded-xl bg-primary/10 text-primary font-label-md font-semibold text-sm hover:bg-primary/20 transition-colors disabled:opacity-50 flex-shrink-0 flex items-center gap-2"
                    >
                      {restoringId === entry.id
                        ? <div className="spinner" style={{ width: 16, height: 16 }} />
                        : <span className="material-symbols-outlined text-base">restore</span>
                      }
                      {restoringId === entry.id ? 'Restoring...' : 'Restore'}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>

      <BottomNav activeTab="members" role="owner" />
    </div>
  );
};

export default RecycleBin;
