import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getGym, getAssignedMembers } from '../../firebase/firestore';
import { getExpiryStatus, getInitials, getAvatarColor, getPlanName } from '../../utils/helpers';
import StatusBadge from '../../components/StatusBadge';
import BottomNav from '../../components/BottomNav';
import '../Members/MemberList.css';

const TrainerDashboard = () => {
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  const { showToast } = useToast();

  const [gym, setGym] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    getGym(userDoc.gym_id).then(setGym).catch(console.error);
  }, [userDoc?.gym_id]);

  useEffect(() => {
    if (!userDoc?.gym_id || !userDoc?.id) return;
    const unsubscribe = getAssignedMembers(userDoc.gym_id, userDoc.id, (list) => {
      setMembers(list);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [userDoc?.gym_id, userDoc?.id]);

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
          <h1 className="top-bar-title">My Members</h1>
        </div>

        {members.length > 0 ? (
          members.map((member) => {
            const { label, type, daysText } = getExpiryStatus(member.subscription_expiry);
            const avatarColor = getAvatarColor(member.name);
            return (
              <div key={member.id} className="member-card glass-card" onClick={() => navigate(`/trainer/members/${member.id}`)} role="button" tabIndex={0}>
                <div className="member-card-avatar" style={{ background: avatarColor.bg, color: avatarColor.text }}>
                  {getInitials(member.name)}
                </div>
                <div className="member-card-info">
                  <div className="member-card-name">{member.name}</div>
                  <div className="member-card-plan">{getPlanName(gym, member.plan_id)}</div>
                  <div className={`member-card-expiry ${type}`}>{daysText}</div>
                </div>
                <StatusBadge type={type} label={label} />
              </div>
            );
          })
        ) : (
          <div className="empty-state">
            <div className="empty-icon-wrapper">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="#534AB7" strokeWidth="2" opacity="0.4" />
                <circle cx="8.5" cy="7" r="4" stroke="#534AB7" strokeWidth="2" fill="none" opacity="0.4" />
              </svg>
            </div>
            <h3 className="empty-title">No members assigned to you yet</h3>
            <p className="empty-subtitle">Ask the gym owner to assign members to you</p>
          </div>
        )}
      </div>

      <BottomNav activeTab="members" role="trainer" />
    </div>
  );
};

export default TrainerDashboard;
