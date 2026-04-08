import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { logout } from '../../firebase/auth';
import { getMemberPaymentsRealtime } from '../../firebase/firestore-payments';
import { getInitials, getAvatarColor, formatDate } from '../../utils/helpers';
import BottomNav from '../../components/BottomNav';
import './MemberProfile.css';

const MemberProfile = () => {
  const navigate = useNavigate();
  const { user, userDoc } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [payments, setPayments] = useState([]);

  useEffect(() => {
    if (!user?.uid || !userDoc?.gym_id) return;
    const unsub = getMemberPaymentsRealtime(userDoc.gym_id, user.uid, (data) => {
      setPayments(data);
    });
    return () => unsub();
  }, [user?.uid, userDoc?.gym_id]);

  const handleLogout = async () => {
    setLoggingOut(true);
    await logout();
    navigate('/select-role', { replace: true });
  };

  const avatarColor = getAvatarColor(userDoc?.name);

  return (
    <div className="screen member-profile-screen">
      <div className="screen-content">
        <h1 className="top-bar-title" style={{ marginBottom: 24 }}>Profile</h1>

        <div className="profile-header">
          <div className="profile-avatar-large" style={{ background: avatarColor.bg, color: avatarColor.text }}>
            {getInitials(userDoc?.name)}
            <div className="avatar-edit-btn">✎</div>
          </div>
          <h2 className="profile-name">{userDoc?.name}</h2>
          <p className="profile-phone">{userDoc?.phone}</p>
        </div>

        <div className="profile-menu">
          <button className="profile-menu-item glass-card" onClick={() => setShowQRModal(true)}>
            <div className="menu-item-icon" style={{ background: 'rgba(83,74,183,0.1)', color: 'var(--primary)' }}>📱</div>
            <div className="menu-item-text">
              <div className="menu-item-title">My Membership QR</div>
              <div className="menu-item-subtitle">Show to owner for quick access</div>
            </div>
            <div className="menu-item-arrow">→</div>
          </button>

          <button className="profile-menu-item glass-card" onClick={() => navigate('/member/card')}>
            <div className="menu-item-icon" style={{ background: 'rgba(83,74,183,0.1)', color: 'var(--primary)' }}>💳</div>
            <div className="menu-item-text">
              <div className="menu-item-title">Digital Membership Card</div>
              <div className="menu-item-subtitle">View and share your ID</div>
            </div>
            <div className="menu-item-arrow">→</div>
          </button>

          <button className="profile-menu-item glass-card" onClick={() => {}}>
            <div className="menu-item-icon" style={{ background: 'rgba(29, 158, 117,0.1)', color: 'var(--success)' }}>⚙️</div>
            <div className="menu-item-text">
              <div className="menu-item-title">Account Settings</div>
              <div className="menu-item-subtitle">Edit personal details</div>
            </div>
            <div className="menu-item-arrow">→</div>
          </button>

          <button className="profile-menu-item glass-card" onClick={() => {}}>
            <div className="menu-item-icon" style={{ background: 'rgba(239, 159, 39,0.1)', color: 'var(--amber)' }}>🔔</div>
            <div className="menu-item-text">
              <div className="menu-item-title">Notifications</div>
              <div className="menu-item-subtitle">Reminders and alerts</div>
            </div>
            <div className="menu-item-arrow">→</div>
          </button>
        </div>

        <div className="profile-details glass-card" style={{ padding: '20px', marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Fitness Profile</h3>
          
          <div className="detail-row">
            <span className="detail-label">Goal</span>
            <span className="detail-value">{userDoc?.goal || 'Not set'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Experience</span>
            <span className="detail-value">{userDoc?.experience || 'Not set'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Height</span>
            <span className="detail-value">{userDoc?.height ? `${userDoc.height} cm` : 'Not set'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Blood Group</span>
            <span className="detail-value">{userDoc?.blood_group || 'Not set'}</span>
          </div>
        </div>

        {/* Payment History */}
        <div className="profile-details glass-card" style={{ padding: '20px', marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Payment History</h3>
          
          {payments.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No payments recorded yet.</p>
          ) : (
            payments.map(p => {
              const d = p.payment_date?.toDate ? p.payment_date.toDate() : new Date(p.payment_date);
              return (
                <div key={p.id} style={{
                  padding: '12px 0',
                  borderBottom: '1px solid rgba(0,0,0,0.05)',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{p.plan_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {formatDate(d)} · {p.method === 'cash' ? 'Cash' : p.method === 'upi' ? 'UPI' : 'Online'}
                      · #{p.invoice_number}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>₹{(p.final_amount || 0).toLocaleString('en-IN')}</div>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 8,
                      background: p.status === 'paid' ? 'rgba(29,158,117,0.1)' : p.status === 'partial' ? 'rgba(239,159,39,0.1)' : 'rgba(226,75,74,0.1)',
                      color: p.status === 'paid' ? '#1D9E75' : p.status === 'partial' ? '#EF9F27' : '#E24B4A',
                    }}>
                      {p.status === 'paid' ? 'Paid' : p.status === 'partial' ? 'Partial' : 'Pending'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <button 
          className="btn-ghost logout-btn" 
          onClick={handleLogout}
          disabled={loggingOut}
          style={{ width: '100%', padding: '16px', color: 'var(--danger)', marginBottom: 80 }}
        >
          {loggingOut ? <div className="spinner" style={{ borderTopColor: 'var(--danger)' }}/> : 'Log out'}
        </button>
      </div>

      {/* Membership QR Modal */}
      {showQRModal && (
        <div className="modal-overlay" onClick={() => setShowQRModal(false)}>
          <div className="qr-modal glass-card" onClick={e => e.stopPropagation()}>
            <div className="qr-modal-header">
              <h3>Membership QR</h3>
              <button className="qr-close" onClick={() => setShowQRModal(false)}>×</button>
            </div>
            <div className="qr-container">
              <div className="qr-placeholder" style={{ background: '#fff', padding: 10, borderRadius: 12 }}>
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=gymly://member/${user?.uid}/${userDoc?.gym_id}`} 
                  alt="Membership QR" 
                />
              </div>
              <p className="qr-help">Show this code to your gym owner to quickly pull up your membership details.</p>
            </div>
          </div>
        </div>
      )}

      <BottomNav activeTab="profile" role="member" />
    </div>
  );
};

export default MemberProfile;
