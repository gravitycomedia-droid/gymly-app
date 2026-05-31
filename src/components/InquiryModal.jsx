import React, { useState } from 'react';
import { addDoc, collection, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

const CLEOMITRA_API_KEY = import.meta.env.VITE_CLEOMITRA_API_KEY;

// Send Cleomitra WhatsApp notification to gym owner about new inquiry
async function notifyOwnerNewInquiry({ gymPhone, gymName, leadName, leadPhone, leadGoal }) {
  if (!CLEOMITRA_API_KEY || !gymPhone) return;
  const cleanPhone = gymPhone.replace(/[^0-9]/g, '');
  const toPhone = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;
  try {
    await fetch('https://api.cleomitra.app/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': CLEOMITRA_API_KEY,
      },
      body: JSON.stringify({
        channel: 'whatsapp',
        toId: toPhone,
        type: 'template',
        templateName: 'gymly_new_inquiry',
        components: {
          body_parameters: [gymName, leadName, leadPhone, leadGoal || 'General Fitness'],
        },
      }),
    });
  } catch (err) {
    console.error('Failed to notify owner via Cleomitra:', err);
  }
}

const InquiryModal = ({ gymId, gymPhone, gymName, onClose }) => {
  const [formData, setFormData] = useState({ name: '', phone: '', goal: '' });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) return;

    setLoading(true);
    try {
      await addDoc(collection(db, 'leads'), {
        gym_id: gymId,
        name: formData.name,
        phone: formData.phone,
        goal: formData.goal,
        status: 'new',
        agreement_status: 'pending',
        created_at: serverTimestamp(),
      });

      // Notify gym owner via Cleomitra WhatsApp
      await notifyOwnerNewInquiry({
        gymPhone,
        gymName,
        leadName: formData.name,
        leadPhone: formData.phone,
        leadGoal: formData.goal,
      });

      setSuccess(true);
      setTimeout(onClose, 3000);
    } catch (err) {
      console.error('Error submitting inquiry:', err);
      alert('Failed to send inquiry. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const overlayStyle = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
    padding: '20px',
  };

  const cardStyle = {
    width: '100%', maxWidth: '420px',
    backgroundColor: '#ffffff',
    borderRadius: '24px', overflow: 'hidden',
    boxShadow: '0 30px 80px rgba(0,0,0,0.2)',
  };

  const headerStyle = {
    background: 'linear-gradient(135deg, #534AB7 0%, #378ADD 100%)',
    padding: '28px 24px', color: '#fff', position: 'relative',
  };

  const closeStyle = {
    position: 'absolute', top: 14, right: 14,
    background: 'rgba(255,255,255,0.2)', border: 'none',
    width: 32, height: 32, borderRadius: '50%',
    color: '#fff', fontSize: 16, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  const inputStyle = {
    width: '100%', padding: '14px 16px', borderRadius: '12px',
    border: '1.5px solid #e5e7eb', fontSize: '15px',
    color: '#1a1a2e', background: '#f9fafb',
    outline: 'none', transition: 'border-color 0.2s',
    boxSizing: 'border-box',
  };

  const labelStyle = {
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: '13px', fontWeight: 600, color: '#374151',
    marginBottom: 6,
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={cardStyle} onClick={e => e.stopPropagation()}>
        {/* Gradient Header */}
        <div style={headerStyle}>
          <button onClick={onClose} style={closeStyle}>✕</button>
          <h3 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.3px' }}>
            Get Started 💪
          </h3>
          <p style={{ margin: '6px 0 0', opacity: 0.9, fontSize: 14 }}>
            Begin your fitness journey at {gymName}
          </p>
        </div>

        {/* Body */}
        <div style={{ padding: '24px' }}>
          {success ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: 'rgba(29,158,117,0.1)', color: '#1D9E75',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 36, margin: '0 auto 16px',
              }}>✓</div>
              <h3 style={{ color: '#1a1a2e', margin: '0 0 8px', fontSize: 20, fontWeight: 700 }}>
                Inquiry Submitted! 🎉
              </h3>
              <p style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.6 }}>
                We've notified {gymName}. They'll reach out to you shortly to get you started!
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label style={labelStyle}><span>👤</span> Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Rahul Sharma"
                  value={formData.name}
                  onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                  required
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'var(--primary)'}
                  onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                />
              </div>

              <div>
                <label style={labelStyle}><span>📱</span> Phone Number</label>
                <input
                  type="tel"
                  placeholder="10-digit mobile number"
                  value={formData.phone}
                  onChange={(e) => setFormData(p => ({ ...p, phone: e.target.value }))}
                  required
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'var(--primary)'}
                  onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                />
              </div>

              <div>
                <label style={labelStyle}><span>🎯</span> Fitness Goal</label>
                <select
                  value={formData.goal}
                  onChange={(e) => setFormData(p => ({ ...p, goal: e.target.value }))}
                  style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
                  onFocus={e => e.target.style.borderColor = 'var(--primary)'}
                  onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                >
                  <option value="">Choose your goal...</option>
                  <option value="Weight Loss">Weight Loss</option>
                  <option value="Muscle Building">Muscle Building</option>
                  <option value="General Fitness">General Fitness</option>
                  <option value="Personal Training">Personal Training</option>
                  <option value="Yoga & Flexibility">Yoga & Flexibility</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%', padding: '16px',
                  background: 'linear-gradient(135deg, #534AB7 0%, #378ADD 100%)',
                  color: '#fff', border: 'none', borderRadius: '14px',
                  fontSize: 16, fontWeight: 700, cursor: 'pointer',
                  boxShadow: '0 8px 24px var(--primary-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'transform 0.15s, box-shadow 0.15s',
                  marginTop: 4,
                }}
              >
                {loading ? (
                  <div style={{ width: 20, height: 20, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                ) : (
                  <>Get Started Now →</>
                )}
              </button>

              <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 11, margin: 0 }}>
                🔒 Your data is safe. No spam, ever.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default InquiryModal;
