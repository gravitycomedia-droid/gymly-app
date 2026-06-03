import { getInitials, getPlanName } from '../utils/helpers';

const MemberCard = ({ member, gym, onView, onRenew, onEdit, onDelete, showActions = true, isSelected = false, onSelect = null, useEnrollmentIdForAdmin = false }) => {
  const now = new Date();
  const exp = member.subscription_expiry?.toDate ? member.subscription_expiry.toDate() : null;
  const isExpired = !exp || exp <= now;
  
  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(now.getDate() + 7);
  const isExpiringSoon = !isExpired && exp <= sevenDaysFromNow;

  let statusType = 'ACTIVE';
  let statusColorClass = 'bg-[#E6F4EA] text-[#137333]';

  if (isExpired) {
    statusType = 'EXPIRED';
    statusColorClass = 'bg-[#FCE8E6] text-[#C5221F]';
  } else if (isExpiringSoon) {
    statusType = 'EXPIRING SOON';
    statusColorClass = 'bg-[#FEF7E0] text-[#B06000]';
  }

  const planName = getPlanName(gym, member.plan_id);
  const isSelectMode = onSelect !== null;

  return (
    <div 
      className={`bg-white rounded-2xl p-5 flex flex-col gap-5 cursor-pointer relative overflow-hidden group shadow-[0_4px_24px_-4px_rgba(0,0,0,0.05)] border transition-all duration-200 ${
        isSelected 
          ? 'border-primary/50 ring-2 ring-primary/20 bg-primary/5' 
          : 'border-gray-100 hover:border-gray-200'
      }`}
      onClick={() => isSelectMode ? onSelect(member.id) : onView?.(member.id)} 
      role="button" 
      tabIndex={0}
    >
      {/* Decorative Blob */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-[#F8F9FA] rounded-bl-[100px] -mr-4 -mt-4 transition-transform group-hover:scale-110 z-0"></div>
      
      {/* Select checkbox (shown in select mode) */}
      {isSelectMode && (
        <div className={`absolute top-3 left-3 z-20 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
          isSelected ? 'bg-primary border-primary' : 'bg-white border-gray-300'
        }`}>
          {isSelected && (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
      )}
      
      <div className={`flex justify-between items-start z-10 relative ${isSelectMode ? 'pl-6' : ''}`}>
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Avatar */}
          {member.profile_photo ? (
            <img src={member.profile_photo} alt={member.name} className="w-12 h-12 rounded-full object-cover shadow-sm flex-shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-[#EBE5FF] text-[#0058bc] flex items-center justify-center font-headline-md text-xl shadow-sm flex-shrink-0">
              {getInitials(member.name)}
            </div>
          )}
          
          {/* Info */}
          <div className="min-w-0">
            <h3 className="font-headline-md text-[15px] text-[#1b1b1d] font-semibold truncate">{member.name}</h3>
            {useEnrollmentIdForAdmin ? (
              // Show enrollment ID prominently when feature is enabled
              member.latestEnrollmentNumber ? (
                <p className="font-body-md text-[11px] mt-0.5 font-mono tracking-wide font-semibold" style={{ color: '#1D9E75' }}>
                  {member.latestEnrollmentNumber}
                </p>
              ) : member.memberNumber ? (
                <p className="font-body-md text-[11px] text-[#9BA3B5] mt-0.5 font-mono tracking-wide">#{member.memberNumber}</p>
              ) : null
            ) : (
              // Default: show member number
              member.memberNumber && (
                <p className="font-body-md text-[11px] text-[#9BA3B5] mt-0.5 font-mono tracking-wide">#{member.memberNumber}</p>
              )
            )}
            <p className="font-body-md text-[13px] text-[#717786] mt-0.5 truncate">{planName}</p>
          </div>
        </div>

        {/* Status Pill */}
        <span className={`px-2.5 py-1 rounded-full font-body-md text-[10px] font-bold tracking-wide flex-shrink-0 ml-2 ${statusColorClass}`}>
          {statusType}
        </span>
      </div>

      {/* Bottom Section */}
      <div className="flex justify-between items-center z-10 relative">
        <div className="flex flex-col">
          <span className="font-headline-md text-[11px] text-[#c1c6d7] font-semibold">{isExpired ? 'Expired On' : 'Expires On'}</span>
          <span className="font-headline-md text-[15px] text-[#414755] font-bold mt-0.5">
            {exp ? exp.toLocaleDateString('en-US', {month: 'short', day: '2-digit', year: 'numeric'}) : 'N/A'}
          </span>
        </div>
        
        {/* Action buttons — hidden in select mode */}
        {!isSelectMode && (
          <div className="flex items-center gap-1.5">
            {/* Edit */}
            {onEdit && (
              <button 
                className="w-8 h-8 rounded-full border border-[#534ab7]/20 flex items-center justify-center text-[#534ab7] hover:bg-[#534ab7] hover:text-white transition-colors"
                onClick={(e) => { e.stopPropagation(); onEdit(member.id); }}
                title="Edit member"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
            )}
            {/* Delete */}
            {onDelete && (
              <button 
                className="w-8 h-8 rounded-full border border-red-200 flex items-center justify-center text-red-400 hover:bg-red-500 hover:text-white transition-colors"
                onClick={(e) => { e.stopPropagation(); onDelete(member); }}
                title="Delete member"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                  <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                </svg>
              </button>
            )}
            {/* View arrow */}
            <button 
              className="w-8 h-8 rounded-full border border-[#0058bc]/20 flex items-center justify-center text-[#0058bc] hover:bg-[#0058bc] hover:text-white transition-colors"
              onClick={(e) => { e.stopPropagation(); onView?.(member.id); }}
              title="View member"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MemberCard;
