import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useNavigate } from 'react-router-dom';
import { getInitials, getAvatarColor } from '../../utils/helpers';
import BottomNav from '../../components/BottomNav';
import './LeadsDashboard.css';

const STATUS_CONFIG = {
  new: { label: 'New', color: 'text-tertiary-container', bg: 'bg-tertiary-container/20' },
  contacted: { label: 'Contacted', color: 'text-primary', bg: 'bg-primary/10' },
  converted: { label: 'Joined', color: 'text-secondary', bg: 'bg-secondary/10' },
};

const LeadsDashboard = () => {
  const { userDoc } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('new');

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    
    if (localStorage.getItem('mockRole')) {
      const mock = [
        { id: 'lead1', gym_id: 'mock_gym_123', name: 'Kabir Khan', phone: '9988776655', email: 'kabir@gmail.com', plan_interest: 'Gold Plan', goal: 'Strength Training', status: 'new', created_at: { toDate: () => new Date(Date.now() - 3600000) } },
        { id: 'lead2', gym_id: 'mock_gym_123', name: 'Ananya Sen', phone: '9922114433', email: 'ananya@gmail.com', plan_interest: 'Platinum Plan', goal: 'Fat Loss', status: 'contacted', created_at: { toDate: () => new Date(Date.now() - 4 * 3600000 * 24) } },
        { id: 'lead3', gym_id: 'mock_gym_123', name: 'Rajesh Koothrapali', phone: '9773123456', email: 'raj@outlook.com', plan_interest: 'Bronze Plan', goal: 'Cardio Fitness', status: 'converted', agreement_status: 'agreed', agreement_url: 'http://example.com', created_at: { toDate: () => new Date(Date.now() - 10 * 3600000 * 24) } }
      ];
      setLeads(mock);
      setLoading(false);
      return;
    }
    
    const q = query(
      collection(db, 'leads'),
      where('gym_id', '==', userDoc.gym_id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const leadsList = [];
      snapshot.forEach(d => {
        leadsList.push({ id: d.id, ...d.data() });
      });
      // Sort client-side descending by created_at
      leadsList.sort((a, b) => {
        const tA = a.created_at?.toDate?.()?.getTime() || 0;
        const tB = b.created_at?.toDate?.()?.getTime() || 0;
        return tB - tA;
      });
      setLeads(leadsList);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userDoc?.gym_id]);

  const handleUpdateStatus = async (leadId, newStatus) => {
    try {
      await updateDoc(doc(db, 'leads', leadId), {
        status: newStatus,
        updated_at: new Date()
      });
      showToast(`Lead marked as ${newStatus}`, 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to update lead status', 'error');
    }
  };

  const handleConvertToMember = (lead) => {
    navigate('/owner/members/add', {
      state: {
        leadData: {
          leadId: lead.id,
          name: lead.name,
          phone: lead.phone,
          goal: lead.goal || '',
        }
      }
    });
  };

  const handleOpenWhatsApp = (phone, name) => {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const msg = `Hi ${name}, this is ${userDoc?.name || 'the gym'} from the gym. Thanks for your inquiry — we'd love to help you get started!`;
    window.open(`https://wa.me/91${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const handleCall = (phone) => {
    window.open(`tel:${phone}`, '_self');
  };

  if (loading) {
    return (
      <div className="mesh-gradient min-h-screen text-on-background font-body-md pb-24 md:pb-0 pt-[80px]">
        <div className="flex justify-center items-center h-[60vh]">
          <div className="spinner spinner-primary" style={{ width: 32, height: 32 }} />
        </div>
        <BottomNav activeTab="home" role="owner" />
      </div>
    );
  }

  const filteredLeads = leads.filter(l => l.status === activeTab);
  const counts = {
    new: leads.filter(l => l.status === 'new').length,
    contacted: leads.filter(l => l.status === 'contacted').length,
    converted: leads.filter(l => l.status === 'converted').length,
  };
  
  const todayLeadsCount = leads.filter(l => {
    const date = l.created_at?.toDate ? l.created_at.toDate() : null;
    if (!date) return false;
    return (new Date() - date) < 86400000;
  }).length;
  
  const convRate = leads.length > 0 ? Math.round((counts.converted / leads.length) * 100) : 0;

  return (
    <div className="mesh-gradient min-h-screen text-on-background font-body-md pb-24 md:pb-0 md:pt-24 pt-[80px]">
      
      {/* Mobile Top Header (replaces standard Gymly Global Header here for custom Leads look) */}
      <header className="md:hidden fixed top-0 left-0 w-full z-50 bg-surface/30 backdrop-blur-3xl px-4 h-16 flex items-center shadow-sm">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-on-surface-variant hover:text-primary transition-colors">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <span className="font-display-lg text-xl ml-2 font-bold text-on-surface">Gymly CRM</span>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-gutter mt-4 md:mt-0">
        <div className="flex justify-between items-center mb-6">
          <h1 className="font-headline-lg text-headline-lg">Enquiries CRM</h1>
        </div>

        {/* Stats Bento Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {/* Total Enquiries */}
          <div className="glass-card rounded-xl p-4 flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Total</span>
              <span className="material-symbols-outlined text-primary text-lg">monitoring</span>
            </div>
            <div>
              <span className="font-headline-md text-headline-md text-on-surface">{leads.length}</span>
            </div>
          </div>
          {/* New Today */}
          <div className="glass-card rounded-xl p-4 flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Today</span>
              <span className="material-symbols-outlined text-secondary text-lg">fiber_new</span>
            </div>
            <div>
              <span className="font-headline-md text-headline-md text-on-surface">{todayLeadsCount}</span>
            </div>
          </div>
          {/* Converted */}
          <div className="glass-card rounded-xl p-4 flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Conv.</span>
              <span className="material-symbols-outlined text-tertiary-container text-lg">task_alt</span>
            </div>
            <div>
              <span className="font-headline-md text-headline-md text-on-surface">{convRate}%</span>
              <p className="font-label-sm text-label-sm text-on-surface-variant mt-0.5">Rate</p>
            </div>
          </div>
          {/* Add Metric Placeholder */}
          <div className="rounded-xl p-4 flex flex-col items-center justify-center border-2 border-dashed border-outline-variant/30 hover:border-primary/50 transition-colors cursor-pointer group">
            <span className="material-symbols-outlined text-outline-variant group-hover:text-primary transition-colors">add_circle</span>
            <span className="font-label-sm text-label-sm text-on-surface-variant mt-2">Add Metric</span>
          </div>
        </div>

        {/* Tab Pills Styled to Design System */}
        <div className="flex gap-3 mb-6 overflow-x-auto hide-scrollbar pb-2">
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <button 
              key={key}
              className={`px-4 py-2 rounded-full font-label-md text-label-md flex items-center gap-2 whitespace-nowrap transition-all duration-300 border ${activeTab === key ? 'bg-primary text-white border-primary shadow-[0_4px_12px_rgba(0,88,188,0.3)]' : 'glass-card text-on-surface-variant hover:text-on-surface'}`}
              onClick={() => setActiveTab(key)}
            >
              {cfg.label} <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeTab === key ? 'bg-white/20' : 'bg-surface-variant'}`}>{counts[key]}</span>
            </button>
          ))}
        </div>

        {/* Leads List */}
        <div className="glass-card rounded-xl p-4 md:p-6 shadow-sm overflow-hidden mb-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="font-headline-md text-headline-md">{STATUS_CONFIG[activeTab].label} Leads</h2>
            <button className="bg-gradient-to-r from-primary to-secondary text-white px-4 py-2 rounded-lg font-label-md text-label-md flex items-center gap-2 shadow-[0_4px_12px_rgba(0,88,188,0.2)] hover:opacity-90 transition-opacity">
              <span className="material-symbols-outlined text-sm">add</span> <span className="hidden md:inline">Add Lead</span>
            </button>
          </div>
          
          <div className="flex flex-col gap-3">
            {filteredLeads.length === 0 ? (
              <div className="py-12 text-center">
                <span className="material-symbols-outlined text-5xl text-outline-variant/50 mb-3">inbox</span>
                <h3 className="font-label-md text-label-md text-on-surface">No {STATUS_CONFIG[activeTab].label.toLowerCase()} leads found.</h3>
              </div>
            ) : (
              filteredLeads.map(lead => {
                const avatarColor = getAvatarColor(lead.name);
                const date = lead.created_at?.toDate ? lead.created_at.toDate() : null;
                const timeAgo = date ? getTimeAgo(date) : 'Just now';
                const statusCfg = STATUS_CONFIG[activeTab];
                
                return (
                  <div key={lead.id} className="glass-card bg-white/20 p-4 rounded-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-white/5 pb-4 last:border-0 hover:bg-white/30 transition-colors cursor-pointer">
                    
                    <div className="flex items-center gap-4 w-full md:w-auto">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg" style={{ background: avatarColor.bg, color: avatarColor.text }}>
                        {getInitials(lead.name)}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-label-md text-label-md text-on-surface font-semibold text-lg">{lead.name}</h3>
                        <div className="flex items-center gap-2 text-on-surface-variant text-sm mt-1 flex-wrap">
                          <span className="material-symbols-outlined text-[14px]">phone_iphone</span> {lead.phone}
                          <span className="mx-1">•</span>
                          <span>{timeAgo}</span>
                          {lead.goal && (
                            <>
                              <span className="mx-1">•</span>
                              <span className="text-tertiary">🎯 {lead.goal}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 md:gap-6 w-full md:w-auto justify-between md:justify-end">
                      <span className={`px-3 py-1 rounded-full ${statusCfg.bg} ${statusCfg.color} font-label-sm text-label-sm flex items-center gap-1`}>
                        {statusCfg.label}
                      </span>
                      <div className="flex gap-2">
                        <button onClick={(e) => { e.stopPropagation(); handleOpenWhatsApp(lead.phone, lead.name); }} className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center text-primary hover:bg-primary/10 transition-colors shadow-sm bg-white/40" title="WhatsApp">
                          <span className="material-symbols-outlined text-xl">chat</span>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleCall(lead.phone); }} className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center text-secondary hover:bg-secondary/10 transition-colors shadow-sm bg-white/40" title="Call">
                          <span className="material-symbols-outlined text-xl">call</span>
                        </button>
                        
                        {/* Dynamic Status Action */}
                        {activeTab === 'new' && (
                          <button onClick={(e) => { e.stopPropagation(); handleUpdateStatus(lead.id, 'contacted'); }} className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center text-tertiary-container hover:bg-tertiary-container/10 transition-colors shadow-sm bg-white/40" title="Mark Contacted">
                            <span className="material-symbols-outlined text-xl">task_alt</span>
                          </button>
                        )}
                        {activeTab === 'contacted' && (
                          <button onClick={(e) => { e.stopPropagation(); handleConvertToMember(lead); }} className="w-10 h-10 rounded-full border border-primary/30 flex items-center justify-center text-white bg-primary hover:bg-primary-container transition-colors shadow-[0_2px_8px_rgba(0,88,188,0.4)]" title="Convert to Member">
                            <span className="material-symbols-outlined text-xl">person_add</span>
                          </button>
                        )}
                      </div>
                    </div>

                  </div>
                );
              })
            )}
          </div>
        </div>
        
        <div style={{ height: 100 }} />
      </main>

      <BottomNav activeTab="home" role="owner" />
    </div>
  );
};

// Helper
function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export default LeadsDashboard;
