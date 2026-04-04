import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getGym, getGymMembersRealtime, markAttendance } from '../../firebase/firestore';
import { getExpiryStatus, getInitials, getAvatarColor, getPlanName } from '../../utils/helpers';
import StatusBadge from '../../components/StatusBadge';
import BottomNav from '../../components/BottomNav';
import '../Members/MemberList.css';

const ReceptionistDashboard = () => {
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  const { showToast } = useToast();

  const [gym, setGym] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [attendanceMarked, setAttendanceMarked] = useState(new Set());

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    getGym(userDoc.gym_id).then(setGym).catch(console.error);
  }, [userDoc?.gym_id]);

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    const unsubscribe = getGymMembersRealtime(userDoc.gym_id, (list) => {
      setMembers(list);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [userDoc?.gym_id]);

  const filteredMembers = search.trim()
    ? members.filter((m) =>
        m.name?.toLowerCase().includes(search.toLowerCase()) ||
        m.phone?.includes(search)
      )
    : members;

  const handleAttendance = async (member) => {
    try {
      await markAttendance(member.id);
      setAttendanceMarked((prev) => new Set(prev).add(member.id));
      showToast(`Attendance marked for ${member.name}`, 'success');
    } catch (err) {
      showToast('Failed to mark attendance', 'error');
    }
  };

  const basePath = '/receptionist';

  if (loading) {
    return (
      <div className="screen member-list-screen">
        <div className="screen-content spinner-center">
          <div className="spinner spinner-primary" style={{ width: 32, height: 32 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="screen member-list-screen">
      <div className="screen-content">
        <div className="top-bar">
          <h1 className="top-bar-title">Members</h1>
          <button className="top-bar-action" onClick={() => navigate(`${basePath}/members/add`)} id="add-member-btn">
            + Add
          </button>
        </div>

        <div className="search-bar">
          <div className="search-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" fill="none" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <input type="text" className="search-input" placeholder="Search by name or phone..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {filteredMembers.length > 0 ? (
          filteredMembers.map((member) => {
            const { label, type, daysText } = getExpiryStatus(member.subscription_expiry);
            const avatarColor = getAvatarColor(member.name);
            const isMarked = attendanceMarked.has(member.id);

            return (
              <div key={member.id} className="member-card glass-card">
                <div className="member-card-avatar" style={{ background: avatarColor.bg, color: avatarColor.text }}>
                  {getInitials(member.name)}
                </div>
                <div className="member-card-info">
                  <div className="member-card-name">{member.name}</div>
                  <div className="member-card-plan">{getPlanName(gym, member.plan_id)}</div>
                  <div className={`member-card-expiry ${type}`}>{daysText}</div>
                </div>
                <div className="member-card-right">
                  <StatusBadge type={type} label={label} />
                  <button
                    className={`member-action-btn ${isMarked ? 'attendance-marked' : ''}`}
                    onClick={() => handleAttendance(member)}
                    disabled={isMarked}
                    title={isMarked ? 'Attendance marked' : 'Mark attendance'}
                    style={isMarked ? { background: 'rgba(29,158,117,0.15)', color: '#1D9E75' } : {}}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <polyline points="20 6 9 17 4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="empty-state">
            <h3 className="empty-title">No members found</h3>
          </div>
        )}
      </div>

      <BottomNav activeTab="members" role="receptionist" />
    </div>
  );
};

export default ReceptionistDashboard;
