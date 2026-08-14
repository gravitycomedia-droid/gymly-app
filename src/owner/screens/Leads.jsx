import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getInitials } from '../../utils/helpers';
import { getAvatarColor } from '../lib/avatarColor';
import EmptyState from '../primitives/EmptyState';

const TABS = [
  { id: 'new', label: 'New' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'converted', label: 'Joined' },
];

function timeAgo(date) {
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

export default function Leads() {
  const { userDoc } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('new');

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    const q = query(collection(db, 'leads'), where('gym_id', '==', userDoc.gym_id));
    const unsub = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.created_at?.toDate?.()?.getTime() || 0) - (a.created_at?.toDate?.()?.getTime() || 0));
      setLeads(list);
      setLoading(false);
    });
    return () => unsub();
  }, [userDoc?.gym_id]);

  const handleMarkContacted = async (leadId) => {
    try {
      await updateDoc(doc(db, 'leads', leadId), { status: 'contacted', updated_at: new Date() });
      showToast('Lead marked as contacted', 'success');
    } catch (err) {
      console.error('Update lead error:', err);
      showToast('Failed to update lead', 'error');
    }
  };

  const handleConvert = (lead) => {
    navigate('/owner/members/add', { state: { leadData: { leadId: lead.id, name: lead.name, phone: lead.phone, goal: lead.goal || '' } } });
  };

  const openWhatsApp = (phone, name) => {
    const clean = String(phone).replace(/[^0-9]/g, '');
    const msg = `Hi ${name}, this is ${userDoc?.name || 'the gym'} from the gym. Thanks for your inquiry — we'd love to help you get started!`;
    window.open(`https://wa.me/91${clean}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
        <div className="spinner spinner-primary" style={{ width: 32, height: 32 }} />
      </div>
    );
  }

  const counts = {
    new: leads.filter((l) => l.status === 'new').length,
    contacted: leads.filter((l) => l.status === 'contacted').length,
    converted: leads.filter((l) => l.status === 'converted').length,
  };
  const todayCount = leads.filter((l) => {
    const d = l.created_at?.toDate ? l.created_at.toDate() : null;
    return d && (new Date() - d) < 86400000;
  }).length;
  const convRate = leads.length > 0 ? Math.round((counts.converted / leads.length) * 100) : 0;
  const filtered = leads.filter((l) => l.status === tab);
  const tabLabel = TABS.find((t) => t.id === tab)?.label || 'New';

  return (
    <section data-screen-label="Leads">
      <div className="gl2-page-header">
        <div>
          <h1 className="gl2-page-title">Inquiries</h1>
          <p className="gl2-page-sub">Walk-ins, calls and web enquiries</p>
        </div>
      </div>

      <div className="gl2-kpi-grid">
        <div className="gl2-kpi-tile">
          <p className="gl2-kpi-label">New enquiries</p>
          <p className="gl2-kpi-value">{counts.new}</p>
        </div>
        <div className="gl2-kpi-tile">
          <p className="gl2-kpi-label">Today</p>
          <p className="gl2-kpi-value">{todayCount}</p>
        </div>
        <div className="gl2-kpi-tile">
          <p className="gl2-kpi-label">Conversion rate</p>
          <p className="gl2-kpi-value">{convRate}%</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {TABS.map((t) => (
          <button key={t.id} type="button" className={`gl2-filter-chip ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label} ({counts[t.id]})
          </button>
        ))}
      </div>

      <div className="gl2-list">
        {filtered.length === 0 ? (
          <EmptyState title={`No ${tabLabel.toLowerCase()} leads`} sub="They'll show up here as enquiries come in." />
        ) : (
          filtered.map((lead) => {
            const date = lead.created_at?.toDate ? lead.created_at.toDate() : null;
            return (
              <div key={lead.id} className="gl2-row">
                <span className="gl2-avatar" style={{ background: getAvatarColor(lead.name) }}>{getInitials(lead.name)}</span>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{lead.name}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--gl2-muted)' }}>
                    {lead.phone} · {date ? timeAgo(date) : 'Just now'}{lead.goal ? ` · 🎯 ${lead.goal}` : ''}
                  </p>
                </div>
                <button type="button" className="gl2-icon-btn" title="WhatsApp" onClick={() => openWhatsApp(lead.phone, lead.name)}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chat</span>
                </button>
                <button type="button" className="gl2-icon-btn" title="Call" onClick={() => window.open(`tel:${lead.phone}`, '_self')}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>call</span>
                </button>
                {tab === 'new' && (
                  <button type="button" className="gl2-btn gl2-btn-secondary" onClick={() => handleMarkContacted(lead.id)}>Mark contacted</button>
                )}
                {tab === 'contacted' && (
                  <button type="button" className="gl2-btn gl2-btn-primary" onClick={() => handleConvert(lead)}>Convert</button>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
