import { getInitials, getPlanName } from '../utils/helpers';

const MemberCard = ({ member, gym, onView, onRenew, showActions = true, showAttendance = false, onAttendance }) => {
  const now = new Date();
  const exp = member.subscription_expiry?.toDate ? member.subscription_expiry.toDate() : null;
  const isExpired = !exp || exp <= now;
  
  // 7 days expiring soon logic
  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(now.getDate() + 7);
  const isExpiringSoon = !isExpired && exp <= sevenDaysFromNow;

  let statusType = 'ACTIVE';
  let statusColorClass = 'bg-[#E6F4EA] text-[#137333]'; // Green

  if (isExpired) {
    statusType = 'EXPIRED';
    statusColorClass = 'bg-[#FCE8E6] text-[#C5221F]'; // Red
  } else if (isExpiringSoon) {
    statusType = 'EXPIRING SOON';
    statusColorClass = 'bg-[#FEF7E0] text-[#B06000]'; // Orange
  }

  const planName = getPlanName(gym, member.plan_id);

  return (
    <div 
      className="bg-white rounded-2xl p-5 flex flex-col gap-6 cursor-pointer relative overflow-hidden group shadow-[0_4px_24px_-4px_rgba(0,0,0,0.05)] border border-gray-100" 
      onClick={() => onView?.(member.id)} 
      role="button" 
      tabIndex={0}
    >
      {/* Decorative Blob */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-[#F8F9FA] rounded-bl-[100px] -mr-4 -mt-4 transition-transform group-hover:scale-110 z-0"></div>
      
      <div className="flex justify-between items-start z-10 relative">
        <div className="flex items-center gap-4">
          {/* Avatar */}
          {member.profile_photo ? (
            <img src={member.profile_photo} alt={member.name} className="w-14 h-14 rounded-full object-cover shadow-sm" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-[#EBE5FF] text-[#0058bc] flex items-center justify-center font-headline-md text-xl shadow-sm">
              {getInitials(member.name)}
            </div>
          )}
          
          {/* Info */}
          <div>
            <h3 className="font-headline-md text-lg text-[#1b1b1d] font-semibold">{member.name}</h3>
            <p className="font-body-md text-[15px] text-[#717786] mt-0.5">{planName}</p>
          </div>
        </div>

        {/* Status Pill */}
        <span className={`px-3 py-1.5 rounded-full font-body-md text-xs font-bold tracking-wide ${statusColorClass}`}>
          {statusType}
        </span>
      </div>

      {/* Bottom Section */}
      <div className="mt-1 flex justify-between items-end z-10 relative">
        <div className="flex flex-col">
          <span className="font-headline-md text-sm text-[#c1c6d7] font-semibold">{isExpired ? 'Expired On' : 'Expires On'}</span>
          <span className="font-headline-md text-lg text-[#414755] font-bold mt-1">
            {exp ? exp.toLocaleDateString('en-US', {month: 'short', day: '2-digit', year: 'numeric'}) : 'N/A'}
          </span>
        </div>
        
        {/* Action Button */}
        <button 
          className="w-10 h-10 rounded-full border border-[#0058bc]/20 flex items-center justify-center text-[#0058bc] hover:bg-[#0058bc] hover:text-white transition-colors"
          onClick={(e) => { e.stopPropagation(); onView?.(member.id); }}
        >
          <span className="flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </span>
        </button>
      </div>
    </div>
  );
};

export default MemberCard;
