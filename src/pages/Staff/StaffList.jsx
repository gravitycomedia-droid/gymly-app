import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getGymStaff, deleteUser } from '../../firebase/firestore';
import { getInitials } from '../../utils/helpers';
import BottomNav from '../../components/BottomNav';
import DeleteConfirmModal from '../../components/DeleteConfirmModal';
import './Staff.css';

const ROLE_COLORS = {
  manager: { bg: '#EEEDFE', text: '#534AB7' },
  trainer: { bg: '#E1F5EE', text: '#0F6E56' },
  receptionist: { bg: '#FAEEDA', text: '#633806' },
};

const StaffList = () => {
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  const { showToast } = useToast();

  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchStaff = async () => {
    if (!userDoc?.gym_id) return;
    try {
      const data = await getGymStaff(userDoc.gym_id);
      setStaff(data);
    } catch (err) {
      console.error('Staff fetch error:', err);
      showToast('Database syncing... ' + err.code, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStaff(); }, [userDoc?.gym_id]);

  const managers = staff.filter((s) => s.role === 'manager');
  const trainers = staff.filter((s) => s.role === 'trainer');
  const receptionists = staff.filter((s) => s.role === 'receptionist');

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteUser(deleteTarget.id);
      showToast('Staff member removed', 'success');
      setDeleteTarget(null);
      fetchStaff();
    } catch (err) {
      showToast('Failed to remove staff member', 'error');
    }
  };

  const renderGroup = (title, members) => {
    if (members.length === 0) return null;
    return (
      <div className="staff-group" key={title}>
        <h3 className="staff-group-title">{title}</h3>
        {members.map((s) => {
          const colors = ROLE_COLORS[s.role] || ROLE_COLORS.manager;
          return (
            <div key={s.id} className="staff-card glass-card">
              <div className="staff-avatar" style={{ background: colors.bg, color: colors.text }}>
                {getInitials(s.name)}
              </div>
              <div className="staff-info">
                <div className="staff-name">{s.name}</div>
                <span className="staff-role-badge" style={{ background: colors.bg, color: colors.text }}>
                  {s.role.charAt(0).toUpperCase() + s.role.slice(1)}
                </span>
                <div className="staff-phone">{s.phone}</div>
              </div>
              <button
                className="staff-menu-btn"
                onClick={() => setDeleteTarget(s)}
                title="Remove"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="5" r="1.5" fill="currentColor" />
                  <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                  <circle cx="12" cy="19" r="1.5" fill="currentColor" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="screen staff-screen">
        <div className="screen-content spinner-center">
          <div className="spinner spinner-primary" style={{ width: 32, height: 32 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="screen staff-screen">
      <div className="screen-content">
        <div className="top-bar">
          <h1 className="top-bar-title">Staff</h1>
          <button
            className="top-bar-action"
            onClick={() => navigate('/owner/staff/add')}
            id="add-staff-btn"
          >
            + Add staff
          </button>
        </div>

        {staff.length > 0 ? (
          <>
            {renderGroup('Managers', managers)}
            {renderGroup('Trainers', trainers)}
            {renderGroup('Receptionists', receptionists)}
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-icon-wrapper">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197" stroke="#534AB7" strokeWidth="2" opacity="0.4" />
              </svg>
            </div>
            <h3 className="empty-title">No staff added yet</h3>
            <p className="empty-subtitle">Add your first staff member</p>
            <button className="btn-primary btn-add-member" onClick={() => navigate('/owner/staff/add')}>
              + Add staff member
            </button>
          </div>
        )}
      </div>

      {deleteTarget && (
        <DeleteConfirmModal
          memberName={deleteTarget.name}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      <BottomNav activeTab="staff" role="owner" />
    </div>
  );
};

export default StaffList;
