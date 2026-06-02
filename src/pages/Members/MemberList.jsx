import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getGym, getGymMembersRealtime } from '../../firebase/firestore';
import { getExpiryStatus } from '../../utils/helpers';
import { backfillMemberNumbers } from '../../utils/numberingService';
import MemberCard from '../../components/MemberCard';
import RenewModal from '../../components/RenewModal';
import BottomNav from '../../components/BottomNav';
import './MemberList.css';

const MemberList = ({ role = 'owner' }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { userDoc } = useAuth();
  const { showToast } = useToast();

  const [gym, setGym] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [activeFilter, setActiveFilter] = useState(searchParams.get('filter') || '');
  const [renewMember, setRenewMember] = useState(null);
  const [showFab, setShowFab] = useState(true);
  const addCardRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      setShowFab(!entry.isIntersecting);
    }, { threshold: 0.1 });
    
    if (addCardRef.current) {
      observer.observe(addCardRef.current);
    }
    
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    const fetchGym = async () => {
      try {
        const gymData = await getGym(userDoc.gym_id);
        setGym(gymData);
      } catch (err) {
        console.error('Gym fetch error:', err);
      }
    };
    fetchGym();
  }, [userDoc?.gym_id]);

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    const unsubscribe = getGymMembersRealtime(userDoc.gym_id, (membersList) => {
      setMembers(membersList);
      setLoading(false);
    }, (error) => {
      console.error('Realtime members error:', error);
      showToast(`Database syncing... (${error.code})`, 'error');
      setLoading(false);
    });
    return () => unsubscribe();
  }, [userDoc?.gym_id]);

  // One-time backfill: assign memberNumbers to existing members who don't have one
  const backfillRan = useRef(false);
  useEffect(() => {
    if (backfillRan.current || loading || !members.length || !gym) return;
    const unnumbered = members
      .filter(m => !m.memberNumber)
      .sort((a, b) => {
        const aTime = a.created_at?.toDate ? a.created_at.toDate().getTime() : 0;
        const bTime = b.created_at?.toDate ? b.created_at.toDate().getTime() : 0;
        return aTime - bTime;
      });
    if (unnumbered.length > 0) {
      backfillRan.current = true;
      backfillMemberNumbers(userDoc.gym_id, gym.name, unnumbered).catch(err => {
        console.error('Backfill error (non-critical):', err);
      });
    }
  }, [loading, members.length, gym]);

  const now = new Date();
  const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Counts
  const counts = useMemo(() => {
    let active = 0, expired = 0;
    members.forEach((m) => {
      const exp = m.subscription_expiry?.toDate ? m.subscription_expiry.toDate() : null;
      if (exp && exp > now) active++;
      else expired++;
    });
    return { all: members.length, active, expired };
  }, [members]);

  // Filter + search
  const filteredMembers = useMemo(() => {
    let result = [...members];

    // Tab filter
    if (tab === 'active') {
      result = result.filter((m) => {
        const exp = m.subscription_expiry?.toDate ? m.subscription_expiry.toDate() : null;
        return exp && exp > now;
      });
    } else if (tab === 'expired') {
      result = result.filter((m) => {
        const exp = m.subscription_expiry?.toDate ? m.subscription_expiry.toDate() : null;
        return !exp || exp <= now;
      });
    }

    // Active filters
    if (activeFilter === 'expiring') {
      result = result.filter((m) => {
        const exp = m.subscription_expiry?.toDate ? m.subscription_expiry.toDate() : null;
        return exp && exp > now && exp <= sevenDays;
      });
    } else if (activeFilter === 'paid') {
      result = result.filter((m) => m.payment_status === 'paid');
    } else if (activeFilter === 'pending') {
      result = result.filter((m) => m.payment_status === 'pending');
    } else if (activeFilter === 'this-month') {
      result = result.filter((m) => {
        const created = m.created_at?.toDate ? m.created_at.toDate() : null;
        return created && created >= startOfMonth;
      });
    } else if (activeFilter && activeFilter.startsWith('plan_')) {
      result = result.filter((m) => m.plan_id === activeFilter);
    }

    // Search (client-side) — also searches by memberNumber and enrollmentNumber
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (m) =>
          m.name?.toLowerCase().includes(q) ||
          m.phone?.includes(q) ||
          m.memberNumber?.toLowerCase().includes(q) ||
          m.latestEnrollmentNumber?.toLowerCase().includes(q) ||
          m.enrollmentNumber?.toLowerCase().includes(q) ||
          m.payment_history?.some(p => p.enrollment_number?.toLowerCase().includes(q))
      );
    }

    return result;
  }, [members, tab, activeFilter, search]);

  const plans = gym?.settings?.plans?.filter((p) => p.is_active) || [];

  const basePath = role === 'manager' ? '/manager' : '/owner';

  const handleView = (id) => navigate(`${basePath}/members/${id}`);
  const handleRenew = (member) => setRenewMember(member);

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
    <div className="pb-24 md:pb-0">
      {/* Gymly Global Header */}
      <header className="fixed top-0 w-full z-50 bg-surface/30 backdrop-blur-3xl border-b border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.1)]">
        <div className="flex justify-between items-center px-4 pt-12 pb-4 w-full max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white shadow-sm font-bold text-xl">
              G
            </div>
            <div>
              <p className="font-label-sm text-[10px] text-on-surface-variant uppercase tracking-wider">Owner Dashboard</p>
              <h1 className="font-headline-sm text-lg font-bold text-on-surface">Member Directory</h1>
            </div>
          </div>
          <button
            onClick={() => navigate(`${basePath}/members/add`)}
            className="w-10 h-10 rounded-full glass-panel flex items-center justify-center text-primary hover:backdrop-blur-xl hover:bg-white/10 transition-all duration-300 active:scale-95 hidden md:flex"
          >
            <span className="material-symbols-outlined">add</span>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-8">
        {/* Filters & Search */}
        <div className="flex flex-col gap-5 mb-8 w-full">
          {/* Filter Pills */}
          <div className="flex justify-start w-full">
            <div className="flex bg-white/40 backdrop-blur-md rounded-lg p-1.5 border border-white/50 w-full max-w-md overflow-x-auto hide-scrollbar flex-nowrap shrink-0 shadow-sm">
              {['all', 'active', 'expired'].map((t) => (
                <button
                  key={t}
                  className={`flex-1 px-4 py-2 rounded-md font-label-md text-sm font-semibold transition-all whitespace-nowrap ${tab === t ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant hover:text-primary'}`}
                  onClick={() => { setTab(t); setActiveFilter(''); }}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative w-full max-w-md shrink-0">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-outline flex items-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/>
                <path d="M21 21l-4.35-4.35"/>
              </svg>
            </span>
            <input 
              className="w-full pl-11 pr-4 py-3 bg-white/40 backdrop-blur-md rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 text-on-surface font-body-md text-sm border border-white/50 shadow-sm placeholder-outline-variant" 
              placeholder="Search members..." 
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Bento Grid Member List */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredMembers.length > 0 ? (
            filteredMembers.map((member) => (
              <MemberCard
                key={member.id}
                member={member}
                gym={gym}
                onView={handleView}
                onRenew={handleRenew}
              />
            ))
          ) : search.trim() ? (
            <div className="col-span-full py-12 text-center">
              <h3 className="text-xl text-on-surface mb-2">No members found for &apos;{search}&apos;</h3>
              <button className="text-primary underline" onClick={() => setSearch('')}>Clear search</button>
            </div>
          ) : tab === 'expired' ? (
            <div className="col-span-full py-12 text-center">
              <h3 className="text-xl text-tertiary mb-2">All members are active!</h3>
            </div>
          ) : members.length > 0 ? (
            <div className="col-span-full py-12 text-center">
              <h3 className="text-xl text-on-surface mb-2">No matches</h3>
              <button className="text-primary underline" onClick={() => { setActiveFilter(''); setTab('all'); }}>
                Clear filters
              </button>
            </div>
          ) : null}

          {/* Add New Member Action Card */}
          <div 
            ref={addCardRef}
            className="glass-card rounded-xl p-4 sm:p-6 flex flex-col items-center justify-center gap-3 cursor-pointer border-dashed border-2 border-primary/30 hover:border-primary/60 bg-transparent hover:bg-white/20 min-h-[180px] sm:min-h-[220px]"
            onClick={() => navigate(`${basePath}/members/add`)}
          >
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </div>
            <h3 className="font-headline-md text-headline-md !text-lg text-primary">Add New Member</h3>
            <p className="font-body-md text-body-md !text-sm text-outline text-center">Register a new client to the club.</p>
          </div>
        </div>
      </main>

      {/* Floating Action Button */}
      <div className={`fixed bottom-24 right-6 z-40 transition-all duration-300 ${showFab ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-10 scale-0 pointer-events-none'}`}>
        <button 
          onClick={() => navigate(`${basePath}/members/add`)}
          className="w-14 h-14 bg-primary text-white rounded-full shadow-[0_4px_16px_rgba(0,86,210,0.4)] flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 28 }}>add</span>
        </button>
      </div>

      {/* Renew Modal */}
      {renewMember && (
        <RenewModal
          member={renewMember}
          plans={plans}
          onClose={() => setRenewMember(null)}
          onSuccess={() => setRenewMember(null)}
        />
      )}

      <BottomNav activeTab="members" role={role} />
    </div>
  );
};

export default MemberList;
