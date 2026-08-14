import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { getGym, getGymMembersRealtime } from '../../../firebase/firestore';
import { backfillMemberNumbers, getNumberingSettings } from '../../../utils/numberingService';
import { getInitials } from '../../../utils/helpers';
import { getAvatarColor } from '../../lib/avatarColor';
import { useOwnerShell } from '../../OwnerShellContext';
import Badge from '../../primitives/Badge';
import EmptyState from '../../primitives/EmptyState';

const PAGE_SIZE = 20;

export default function MembersList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { userDoc } = useAuth();
  const { showToast } = useToast();
  const { openQuickView } = useOwnerShell();

  const [gym, setGym] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const urlFilter = searchParams.get('filter') || '';
  const [tab, setTab] = useState(urlFilter === 'active' ? 'active' : urlFilter === 'expired' ? 'expired' : 'all');
  const [activeFilter, setActiveFilter] = useState(urlFilter === 'expiring' ? 'expiring' : '');
  const [numberingSettings, setNumberingSettings] = useState(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deletePayments, setDeletePayments] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const backfillRan = useRef(false);

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    getGym(userDoc.gym_id).then(setGym).catch((err) => console.error('Gym fetch error:', err));
  }, [userDoc?.gym_id]);

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    getNumberingSettings(userDoc.gym_id).then(setNumberingSettings).catch(() => {});
  }, [userDoc?.gym_id]);

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    const unsub = getGymMembersRealtime(userDoc.gym_id, (list) => { setMembers(list); setLoading(false); }, (err) => {
      console.error('Realtime members error:', err);
      showToast(`Database syncing… (${err.code})`, 'error');
      setLoading(false);
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userDoc?.gym_id]);

  useEffect(() => {
    if (backfillRan.current || loading || !members.length || !gym) return;
    const unnumbered = members.filter((m) => !m.memberNumber).sort((a, b) => (a.created_at?.toDate?.()?.getTime() || 0) - (b.created_at?.toDate?.()?.getTime() || 0));
    if (unnumbered.length > 0) {
      backfillRan.current = true;
      backfillMemberNumbers(userDoc.gym_id, gym.name, unnumbered).catch((err) => console.error('Backfill error (non-critical):', err));
    }
  }, [loading, members, gym, userDoc?.gym_id]);

  const visibleMembers = useMemo(() => members.filter((m) => !m.is_deleted), [members]);
  const now = new Date();
  const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const filteredMembers = useMemo(() => {
    let result = [...visibleMembers];
    if (tab === 'active') {
      result = result.filter((m) => { const exp = m.subscription_expiry?.toDate?.(); return exp && exp > now; });
    } else if (tab === 'expired') {
      result = result.filter((m) => { const exp = m.subscription_expiry?.toDate?.(); return !exp || exp <= now; });
    }
    if (activeFilter === 'expiring') {
      result = result.filter((m) => { const exp = m.subscription_expiry?.toDate?.(); return exp && exp > now && exp <= sevenDays; });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((m) =>
        m.name?.toLowerCase().includes(q) || m.phone?.includes(q) ||
        m.memberNumber?.toLowerCase().includes(q) || m.latestEnrollmentNumber?.toLowerCase().includes(q));
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleMembers, tab, activeFilter, search]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [tab, activeFilter, search]);

  const handleDeleteClick = (member) => { setDeletePayments(false); setPendingDelete({ id: member.id, name: member.name, gymId: member.gym_id }); };

  const confirmSingleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const { httpsCallable } = await import('firebase/functions');
      const { functions } = await import('../../../firebase/config');
      await httpsCallable(functions, 'softDeleteMember')({ memberId: pendingDelete.id, gymId: pendingDelete.gymId, deletePayments });
      showToast(deletePayments ? `${pendingDelete.name} and payments deleted` : `${pendingDelete.name} moved to Recycle Bin`, 'success');
      setPendingDelete(null);
    } catch (e) {
      console.error('Delete member error:', e);
      showToast('Failed to delete member', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const toggleSelect = (id) => setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSelectAll = () => setSelectedIds(selectedIds.size === filteredMembers.length ? new Set() : new Set(filteredMembers.map((m) => m.id)));
  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); };

  const confirmBulkDelete = async () => {
    setBulkDeleting(true);
    let success = 0;
    const { httpsCallable } = await import('firebase/functions');
    const { functions } = await import('../../../firebase/config');
    const softDelete = httpsCallable(functions, 'softDeleteMember');
    for (const id of selectedIds) {
      try { await softDelete({ memberId: id, gymId: userDoc.gym_id }); success++; } catch (e) { console.error('Failed to delete', id, e); }
    }
    showToast(`${success} member${success !== 1 ? 's' : ''} moved to Recycle Bin`, 'success');
    setBulkDeleting(false);
    setShowBulkDeleteConfirm(false);
    exitSelectMode();
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}><div className="spinner spinner-primary" style={{ width: 32, height: 32 }} /></div>;
  }

  const useEnrollId = numberingSettings?.useEnrollmentIdForAdmin || false;

  return (
    <section data-screen-label="Member List">
      <div className="gl2-page-header">
        <div>
          <h1 className="gl2-page-title">Members</h1>
          <p className="gl2-page-sub">{visibleMembers.length} member{visibleMembers.length !== 1 ? 's' : ''} · {filteredMembers.length} shown</p>
        </div>
        <div className="gl2-page-actions">
          <button type="button" className="gl2-btn gl2-btn-primary" onClick={() => navigate('/owner/members/add')}>+ Add Member</button>
          <button type="button" className="gl2-btn gl2-btn-secondary" onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}>
            {selectMode ? 'Cancel select' : 'Select'}
          </button>
          <button type="button" className="gl2-btn gl2-btn-secondary" onClick={() => navigate('/owner/recycle-bin')}>Recycle Bin</button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
        <input type="search" className="gl2-input" placeholder="Search by name or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['all', 'active', 'expired'].map((t) => (
            <button key={t} type="button" className={`gl2-filter-chip ${tab === t ? 'active' : ''}`} onClick={() => { setTab(t); setActiveFilter(''); }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
          <button type="button" className={`gl2-filter-chip warn ${activeFilter === 'expiring' ? 'active' : ''}`} onClick={() => setActiveFilter(activeFilter === 'expiring' ? '' : 'expiring')}>
            Expiring soon
          </button>
        </div>
      </div>

      {selectMode && (
        <div style={{ marginBottom: 10, padding: '10px 13px', borderRadius: 12, background: 'var(--gl2-primary-tint)', border: '1px solid var(--gl2-primary-border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={toggleSelectAll} style={{ border: 0, background: 'none', color: 'var(--gl2-primary-deep)', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
            {selectedIds.size === filteredMembers.length ? 'Deselect all' : 'Select all'}
          </button>
          <span style={{ fontSize: 14, color: 'var(--gl2-muted)' }}>{selectedIds.size} selected</span>
          {selectedIds.size > 0 && (
            <button type="button" className="gl2-btn gl2-btn-danger" style={{ marginLeft: 'auto', minHeight: 36 }} onClick={() => setShowBulkDeleteConfirm(true)}>Delete {selectedIds.size}</button>
          )}
        </div>
      )}

      <div className="gl2-list">
        {filteredMembers.length === 0 ? (
          <EmptyState title="No members match that" sub="Try a different name or phone number, or clear the filters." />
        ) : (
          filteredMembers.slice(0, visibleCount).map((m) => {
            const exp = m.subscription_expiry?.toDate?.();
            const isExpired = !exp || exp <= now;
            const isExpiring = !isExpired && exp <= sevenDays;
            const type = isExpired ? 'expired' : isExpiring ? 'expiring' : 'active';
            const label = isExpired ? 'Expired' : isExpiring ? 'Expiring' : 'Active';
            const selected = selectedIds.has(m.id);
            return (
              <div key={m.id} className="gl2-row" style={{ flexWrap: 'wrap' }}>
                {selectMode && (
                  <button type="button" onClick={() => toggleSelect(m.id)} style={{ flex: 'none', width: 22, height: 22, borderRadius: 6, border: `2px solid ${selected ? 'var(--gl2-primary)' : 'var(--gl2-border)'}`, background: selected ? 'var(--gl2-primary)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    {selected && <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#fff' }}>check</span>}
                  </button>
                )}
                <span className="gl2-avatar" style={{ background: getAvatarColor(m.name) }}>{getInitials(m.name)}</span>
                {useEnrollId && m.latestEnrollmentNumber && <span className="gl2-enroll">{m.latestEnrollmentNumber}</span>}
                <button type="button" onClick={() => navigate(`/owner/members/${m.id}`)} style={{ flex: 1, minWidth: 140, border: 0, background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', font: 'inherit' }}>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{m.name}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--gl2-muted)' }}>{m.phone}{!useEnrollId && m.memberNumber ? ` · #${m.memberNumber}` : ''}</p>
                </button>
                <Badge variant={type}>{label}</Badge>
                <button type="button" className="gl2-btn gl2-btn-secondary" style={{ minHeight: 36, padding: '0 11px' }} onClick={() => openQuickView({ ...m, status: type, planName: m.plan_name })}>Quick view</button>
                <button type="button" className="gl2-icon-btn" style={{ width: 36, height: 36 }} title="Edit" onClick={() => navigate(`/owner/members/${m.id}/edit`)}>
                  <span className="material-symbols-outlined" style={{ fontSize: 17 }}>edit</span>
                </button>
                <button type="button" className="gl2-icon-btn danger" style={{ width: 36, height: 36 }} title="Delete" onClick={() => handleDeleteClick(m)}>
                  <span className="material-symbols-outlined" style={{ fontSize: 17 }}>delete</span>
                </button>
              </div>
            );
          })
        )}
      </div>

      {filteredMembers.length > visibleCount && (
        <button type="button" className="gl2-btn gl2-btn-secondary" style={{ width: '100%', marginTop: 12, minHeight: 48 }} onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
          Load more members
        </button>
      )}

      {pendingDelete && (
        <div className="gl2-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14, zIndex: 200 }} onClick={() => setPendingDelete(null)}>
          <div className="gl2-card" style={{ maxWidth: 380, width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <p style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800, textAlign: 'center' }}>Delete member?</p>
            <p style={{ margin: '0 0 14px', fontSize: 14, color: 'var(--gl2-muted)', textAlign: 'center' }}>
              <strong>{pendingDelete.name}</strong> will be moved to Recycle Bin and can be restored within 30 days.
            </p>
            <label style={{ display: 'flex', gap: 10, padding: 11, borderRadius: 11, border: '1px solid var(--gl2-border)', marginBottom: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={deletePayments} onChange={(e) => setDeletePayments(e.target.checked)} />
              <span style={{ fontSize: 13.5 }}>
                <strong style={{ display: 'block' }}>Also delete all payments</strong>
                <span style={{ color: 'var(--gl2-muted)' }}>Permanently removes payment records. Cannot be undone.</span>
              </span>
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="gl2-btn gl2-btn-secondary" style={{ flex: 1 }} onClick={() => setPendingDelete(null)}>Cancel</button>
              <button type="button" className="gl2-btn gl2-btn-danger" style={{ flex: 1, background: 'var(--gl2-danger-strong)', color: '#fff', borderColor: 'var(--gl2-danger-strong)' }} onClick={confirmSingleDelete} disabled={deleting}>{deleting ? 'Deleting…' : 'Yes, delete'}</button>
            </div>
          </div>
        </div>
      )}

      {showBulkDeleteConfirm && (
        <div className="gl2-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14, zIndex: 200 }} onClick={() => setShowBulkDeleteConfirm(false)}>
          <div className="gl2-card" style={{ maxWidth: 380, width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <p style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800, textAlign: 'center' }}>Delete {selectedIds.size} members?</p>
            <p style={{ margin: '0 0 14px', fontSize: 14, color: 'var(--gl2-muted)', textAlign: 'center' }}>They can be restored from Recycle Bin within 30 days.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="gl2-btn gl2-btn-secondary" style={{ flex: 1 }} onClick={() => setShowBulkDeleteConfirm(false)}>Cancel</button>
              <button type="button" className="gl2-btn gl2-btn-danger" style={{ flex: 1, background: 'var(--gl2-danger-strong)', color: '#fff', borderColor: 'var(--gl2-danger-strong)' }} onClick={confirmBulkDelete} disabled={bulkDeleting}>{bulkDeleting ? 'Deleting…' : `Delete ${selectedIds.size}`}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
