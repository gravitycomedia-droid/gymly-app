import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { getGymStaff, deleteUser } from '../../../firebase/firestore';
import { getInitials } from '../../../utils/helpers';
import DeleteConfirmModal from '../../../components/DeleteConfirmModal';
import ListScreen from '../../components/ListScreen';
import EmptyState from '../../primitives/EmptyState';

const ROLE_COLOR = { manager: 'neutral', trainer: 'active', receptionist: 'expiring' };

export default function StaffList() {
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  const { showToast } = useToast();

  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchStaff = async () => {
    if (!userDoc?.gym_id) return;
    try {
      setStaff(await getGymStaff(userDoc.gym_id));
    } catch (err) {
      console.error('Staff fetch error:', err);
      showToast(`Database syncing… ${err.code}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStaff(); }, [userDoc?.gym_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteUser(deleteTarget.id);
      showToast('Staff member removed', 'success');
      setDeleteTarget(null);
      fetchStaff();
    } catch (err) {
      console.error('Remove staff error:', err);
      showToast('Failed to remove staff member', 'error');
    }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}><div className="spinner spinner-primary" style={{ width: 32, height: 32 }} /></div>;

  const groups = [
    ['Managers', staff.filter((s) => s.role === 'manager')],
    ['Trainers', staff.filter((s) => s.role === 'trainer')],
    ['Receptionists', staff.filter((s) => s.role === 'receptionist')],
  ].filter(([, members]) => members.length > 0);

  return (
    <ListScreen
      title="Staff"
      subtitle={`${staff.length} people · grouped by role`}
      kpis={[
        { label: 'Team members', value: String(staff.length) },
        { label: 'Trainers', value: String(staff.filter((s) => s.role === 'trainer').length) },
        { label: 'Managers', value: String(staff.filter((s) => s.role === 'manager').length) },
      ]}
      primaryAction={<button type="button" className="gl2-btn gl2-btn-primary" onClick={() => navigate('/owner/staff/add')}>+ Add Staff</button>}
    >
      {staff.length === 0 ? (
        <div className="gl2-list"><EmptyState title="No staff added yet" sub="Add your first staff member." /></div>
      ) : (
        groups.map(([title, members]) => (
          <div key={title} style={{ marginBottom: 14 }}>
            <p className="gl2-eyebrow">{title}</p>
            <div className="gl2-list">
              {members.map((s) => (
                <div key={s.id} className="gl2-row">
                  <span className="gl2-avatar" style={{ background: 'var(--gl2-primary)' }}>{getInitials(s.name)}</span>
                  <div style={{ flex: 1, minWidth: 150 }}>
                    <p style={{ margin: 0, fontWeight: 700 }}>{s.name}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--gl2-muted)' }}>{s.phone}</p>
                  </div>
                  <span className={`gl2-tag gl2-tag-${ROLE_COLOR[s.role] === 'active' ? 'active' : ROLE_COLOR[s.role] === 'expiring' ? 'expiring' : 'neutral'}`}>
                    {s.role.charAt(0).toUpperCase() + s.role.slice(1)}
                  </span>
                  <button type="button" className="gl2-icon-btn danger" style={{ width: 36, height: 36 }} title="Remove" onClick={() => setDeleteTarget(s)}>
                    <span className="material-symbols-outlined" style={{ fontSize: 17 }}>delete</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {deleteTarget && <DeleteConfirmModal memberName={deleteTarget.name} onConfirm={handleDelete} onClose={() => setDeleteTarget(null)} />}
    </ListScreen>
  );
}
