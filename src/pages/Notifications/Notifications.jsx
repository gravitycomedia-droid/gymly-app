import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase/config';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';

const Notifications = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Request Browser Notification Permission
    if ('Notification' in window) {
      if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
      }
    }

    const fetchNotifications = async () => {
      if (!user?.uid) return;
      if (localStorage.getItem('mockRole')) {
        setNotifications([
          { id: 'n1', title: 'Plan Expiring Soon', body: 'Your Gold Plan subscription expires in 4 days. Please renew to avoid interruption.', created_at: { toDate: () => new Date() } },
          { id: 'n2', title: 'New Workout Plan Assigned', body: 'Coach Vicky assigned "4-Day Hypertrophy Split" to you. Check it out in the Workout tab!', created_at: { toDate: () => new Date(Date.now() - 86400000) } }
        ]);
        setLoading(false);
        return;
      }
      try {
        const q = query(
          collection(db, 'notifications'),
          where('user_id', '==', user.uid),
          orderBy('created_at', 'desc'),
          limit(20)
        );
        const snap = await getDocs(q);
        const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setNotifications(data);
      } catch (err) {
        console.error('Failed to fetch notifications', err);
      } finally {
        setLoading(false);
      }
    };
    fetchNotifications();
  }, [user?.uid]);

  return (
    <div className="screen" style={{ background: '#f8f9fc', minHeight: '100vh' }}>
      <div className="screen-content">
        <div className="top-bar">
          <button className="back-btn" onClick={() => navigate(-1)}>← Back</button>
          <h1 className="top-bar-title">Notifications</h1>
          <div style={{ width: 60 }} />
        </div>

        {loading ? (
          <div className="spinner-center"><div className="spinner spinner-primary" /></div>
        ) : notifications.length === 0 ? (
          <div style={{ textAlign: 'center', marginTop: 100, color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
            <h3>No notifications yet</h3>
            <p>You're all caught up!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 }}>
            {notifications.map(n => (
              <div key={n.id} className="glass-card" style={{ padding: 16 }}>
                <h4 style={{ margin: '0 0 6px', fontSize: 15, color: 'var(--text-primary)' }}>{n.title}</h4>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>{n.body}</p>
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>
                  {n.created_at?.toDate ? n.created_at.toDate().toLocaleString() : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Notifications;
