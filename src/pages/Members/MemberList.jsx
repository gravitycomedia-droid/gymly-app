import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getGym, getGymMembersRealtime } from '../../firebase/firestore';
import { getExpiryStatus } from '../../utils/helpers';
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

    // Search (client-side)
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (m) =>
          m.name?.toLowerCase().includes(q) ||
          m.phone?.includes(q)
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
    <div className="screen member-list-screen">
      <div className="screen-content">
        {/* Top bar */}
        <div className="top-bar">
          <h1 className="top-bar-title">Members</h1>
          <button
            className="top-bar-action"
            onClick={() => navigate(`${basePath}/members/add`)}
            id="add-member-top-btn"
          >
            + Add
          </button>
        </div>

        {/* Search */}
        <div className="search-bar">
          <div className="search-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" fill="none" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <input
            type="text"
            className="search-input"
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            id="member-search"
          />
        </div>

        {/* Tabs */}
        <div className="tab-row">
          {['all', 'active', 'expired'].map((t) => (
            <button
              key={t}
              className={`tab-pill ${tab === t ? 'active' : ''}`}
              onClick={() => { setTab(t); setActiveFilter(''); }}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
              <span className="tab-count">({counts[t]})</span>
            </button>
          ))}
        </div>

        {/* Filter pills */}
        <div className="filter-row">
          {plans.map((plan) => (
            <button
              key={plan.id}
              className={`filter-pill ${activeFilter === plan.id ? 'active' : ''}`}
              onClick={() => setActiveFilter(activeFilter === plan.id ? '' : plan.id)}
            >
              {plan.name}
            </button>
          ))}
          <button
            className={`filter-pill ${activeFilter === 'paid' ? 'active' : ''}`}
            onClick={() => setActiveFilter(activeFilter === 'paid' ? '' : 'paid')}
          >
            Paid
          </button>
          <button
            className={`filter-pill ${activeFilter === 'pending' ? 'active' : ''}`}
            onClick={() => setActiveFilter(activeFilter === 'pending' ? '' : 'pending')}
          >
            Pending
          </button>
          <button
            className={`filter-pill ${activeFilter === 'expiring' ? 'active' : ''}`}
            onClick={() => setActiveFilter(activeFilter === 'expiring' ? '' : 'expiring')}
          >
            Expiring soon
          </button>
          <button
            className={`filter-pill ${activeFilter === 'this-month' ? 'active' : ''}`}
            onClick={() => setActiveFilter(activeFilter === 'this-month' ? '' : 'this-month')}
          >
            This month
          </button>
        </div>

        {/* Member cards */}
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
        ) : members.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon-wrapper">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="#534AB7" strokeWidth="2" opacity="0.4" />
                <circle cx="8.5" cy="7" r="4" stroke="#534AB7" strokeWidth="2" fill="none" opacity="0.4" />
              </svg>
            </div>
            <h3 className="empty-title">No members yet</h3>
            <p className="empty-subtitle">Add your first member to get started</p>
            <button
              className="btn-primary btn-add-member"
              onClick={() => navigate(`${basePath}/members/add`)}
            >
              + Add member
            </button>
          </div>
        ) : search.trim() ? (
          <div className="empty-state">
            <h3 className="empty-title">No members found for &apos;{search}&apos;</h3>
            <button className="text-link" onClick={() => setSearch('')}>Clear search</button>
          </div>
        ) : tab === 'expired' ? (
          <div className="empty-state">
            <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
            <h3 className="empty-title" style={{ color: '#1D9E75' }}>All members are active!</h3>
          </div>
        ) : (
          <div className="empty-state">
            <h3 className="empty-title">No matches</h3>
            <button className="text-link" onClick={() => { setActiveFilter(''); setTab('all'); }}>
              Clear filters
            </button>
          </div>
        )}
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
