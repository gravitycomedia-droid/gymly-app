import { getInitials, getAvatarColor, getExpiryStatus, getPlanName } from '../utils/helpers';
import StatusBadge from './StatusBadge';

const MemberCard = ({ member, gym, onView, onRenew, showActions = true, showAttendance = false, onAttendance }) => {
  const { label, type, daysText } = getExpiryStatus(member.subscription_expiry);
  const avatarColor = getAvatarColor(member.name);
  const planName = getPlanName(gym, member.plan_id);

  return (
    <div className="member-card glass-card" onClick={() => onView?.(member.id)} role="button" tabIndex={0}>
      {/* Avatar */}
      <div className="member-card-avatar" style={{ background: avatarColor.bg, color: avatarColor.text }}>
        {member.profile_photo ? (
          <img src={member.profile_photo} alt={member.name} className="member-card-photo" />
        ) : (
          getInitials(member.name)
        )}
      </div>

      {/* Info */}
      <div className="member-card-info">
        <div className="member-card-name">{member.name}</div>
        <div className="member-card-plan">{planName}</div>
        <div className={`member-card-expiry ${type}`}>{daysText}</div>
      </div>

      {/* Right side */}
      <div className="member-card-right" onClick={(e) => e.stopPropagation()}>
        <StatusBadge type={type} label={label} />

        {showActions && (
          <div className="member-card-actions">
            {onRenew && (
              <button
                className="member-action-btn"
                onClick={() => onRenew(member)}
                title="Renew"
                id={`renew-${member.id}`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <polyline points="23 4 23 10 17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            <button
              className="member-action-btn"
              onClick={() => onView?.(member.id)}
              title="View"
              id={`view-${member.id}`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2" fill="none" />
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" fill="none" />
              </svg>
            </button>
          </div>
        )}

        {showAttendance && (
          <button
            className="member-action-btn attendance-btn"
            onClick={() => onAttendance?.(member)}
            title="Mark attendance"
            id={`attendance-${member.id}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <polyline points="20 6 9 17 4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};

export default MemberCard;
