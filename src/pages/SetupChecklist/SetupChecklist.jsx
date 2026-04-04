import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getGym, updateGym } from '../../firebase/firestore';
import { uploadLogo, uploadPhoto } from '../../firebase/storage';
import './SetupChecklist.css';

const CONFETTI_COLORS = ['#534AB7', '#1D9E75', '#E8A838', '#E24B4A', '#3C97F7', '#F472B6'];

const SetupChecklist = () => {
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  const { showToast } = useToast();

  const [gym, setGym] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showConfetti, setShowConfetti] = useState(true);
  const [modal, setModal] = useState(null); // 'logo' | 'photos' | null
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const fetchGym = async () => {
      if (!userDoc?.gym_id) return;
      try {
        const gymData = await getGym(userDoc.gym_id);
        setGym(gymData);
      } catch (err) {
        console.error('Error fetching gym:', err);
        showToast('Failed to load gym data', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchGym();
  }, [userDoc]);

  useEffect(() => {
    const timer = setTimeout(() => setShowConfetti(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  const getChecklistItems = () => {
    if (!gym) return [];

    const plans = gym.settings?.plans || [];
    const photos = gym.photos || [];
    const logoUrl = gym.logo_url || '';

    return [
      {
        title: 'Gym info added',
        subtitle: `${gym.name} • ${gym.city}`,
        done: true,
        action: null,
      },
      {
        title: 'Membership plan added',
        subtitle: `${plans.length} plan${plans.length !== 1 ? 's' : ''} active`,
        done: plans.length > 0,
        action: null,
      },
      {
        title: 'Gym photos uploaded',
        subtitle: photos.length > 0 ? `${photos.length} photo${photos.length !== 1 ? 's' : ''}` : 'Add gym photos',
        done: photos.length > 0,
        action: 'photos',
      },
      {
        title: 'Logo uploaded',
        subtitle: logoUrl ? 'Looks great!' : 'Add your gym logo',
        done: !!logoUrl,
        action: 'logo',
      },
      {
        title: 'First member added',
        subtitle: 'Go to Members',
        done: false,
        action: 'members',
      },
    ];
  };

  const items = getChecklistItems();
  const completedCount = items.filter((i) => i.done).length;

  const circumference = 2 * Math.PI * 33;
  const strokeDashoffset = circumference - (completedCount / 5) * circumference;

  const handleUpload = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showToast('File size must be under 2MB', 'error');
      return;
    }

    setUploading(true);
    try {
      if (type === 'logo') {
        const url = await uploadLogo(gym.id, file);
        await updateGym(gym.id, { logo_url: url });
        setGym({ ...gym, logo_url: url });
        showToast('Logo uploaded successfully!', 'success');
      } else {
        const url = await uploadPhoto(gym.id, file, gym.photos?.length || 0);
        const newPhotos = [...(gym.photos || []), url];
        await updateGym(gym.id, { photos: newPhotos });
        setGym({ ...gym, photos: newPhotos });
        showToast('Photo uploaded successfully!', 'success');
      }
      setModal(null);
    } catch (err) {
      console.error('Upload error:', err);
      showToast('Upload failed. Please try again.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleItemAction = (action) => {
    if (!action) return;
    if (action === 'members') {
      navigate('/owner/dashboard');
    } else {
      setModal(action);
    }
  };

  if (loading) {
    return (
      <div className="screen checklist-screen">
        <div className="screen-content spinner-center">
          <div className="spinner spinner-primary" style={{ width: 32, height: 32 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="screen checklist-screen">
      {/* Confetti */}
      {showConfetti && (
        <div className="confetti-wrapper">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="confetti-piece"
              style={{
                left: `${Math.random() * 100}%`,
                backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                animationDelay: `${Math.random() * 0.5}s`,
                transform: `rotate(${Math.random() * 360}deg)`,
              }}
            />
          ))}
        </div>
      )}

      <div className="screen-content">
        {/* Header */}
        <div className="checklist-header">
          <h1 className="checklist-heading">
            You&apos;re all set, {userDoc?.name || 'Owner'}!
          </h1>
          <p className="checklist-subtext">
            Complete your profile to get the most out of Gymly
          </p>
        </div>

        {/* Progress Ring */}
        <div className="progress-ring-wrapper">
          <div className="progress-ring-container">
            <svg width="80" height="80" viewBox="0 0 80 80">
              <circle className="progress-ring-bg" cx="40" cy="40" r="33" />
              <circle
                className="progress-ring-fill"
                cx="40"
                cy="40"
                r="33"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
              />
            </svg>
            <span className="progress-ring-text">{completedCount}/5 done</span>
          </div>
        </div>

        {/* Checklist Items */}
        <div className="checklist-items">
          {items.map((item, index) => (
            <div key={index} className="checklist-item glass-card">
              <div className={`checklist-icon ${item.done ? 'done' : 'pending'}`}>
                {item.done ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" fill="#1D9E75"/>
                  </svg>
                ) : (
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(0,0,0,0.1)' }} />
                )}
              </div>
              <div className="checklist-text">
                <div className="checklist-title">{item.title}</div>
                <div className="checklist-subtitle">{item.subtitle}</div>
              </div>
              {item.done ? (
                <span className="checklist-badge done">Done</span>
              ) : item.action ? (
                <span
                  className="checklist-badge pending"
                  onClick={() => handleItemAction(item.action)}
                  role="button"
                  tabIndex={0}
                >
                  Add →
                </span>
              ) : null}
            </div>
          ))}
        </div>

        {/* Buttons */}
        <div className="checklist-buttons">
          <button
            className="btn-primary"
            onClick={() => navigate('/owner/dashboard')}
            id="go-to-dashboard-btn"
          >
            Go to dashboard
          </button>
          <button
            className="btn-ghost"
            onClick={() => navigate('/owner/dashboard')}
            id="complete-later-btn"
          >
            Complete later
          </button>
        </div>
      </div>

      {/* Upload Modal */}
      {modal && (
        <div className="upload-modal-overlay" onClick={() => !uploading && setModal(null)}>
          <div className="upload-modal glass-card" onClick={(e) => e.stopPropagation()}>
            <h3>{modal === 'logo' ? 'Upload logo' : 'Upload photo'}</h3>
            <div
              className="upload-zone"
              onClick={() => fileInputRef.current?.click()}
              style={{ height: 140 }}
            >
              {uploading ? (
                <div className="spinner spinner-primary" style={{ width: 28, height: 28 }} />
              ) : (
                <>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                    <path d="M12 12m-3 0a3 3 0 106 0 3 3 0 10-6 0" stroke="#534AB7" strokeWidth="1.5"/>
                    <path d="M16.01 4H7.99L6 6H3a1 1 0 00-1 1v11a1 1 0 001 1h18a1 1 0 001-1V7a1 1 0 00-1-1h-3l-1.99-2z" stroke="#534AB7" strokeWidth="1.5" fill="none"/>
                  </svg>
                  <span className="upload-zone-text">
                    Tap to upload {modal === 'logo' ? 'logo' : 'a photo'}
                  </span>
                  <span className="upload-zone-hint">PNG or JPG, max 2MB</span>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden-input"
                onChange={(e) => handleUpload(e, modal)}
              />
            </div>
            <div className="upload-modal-actions">
              <button
                className="btn-ghost"
                onClick={() => setModal(null)}
                disabled={uploading}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SetupChecklist;
