import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { sendOTP, verifyOTP, setupRecaptcha, destroyRecaptcha } from '../../firebase/auth';
import { trackEvent } from '../../lib/analytics';
import { linkMemberships } from '../../firebase/firestore';
import { auth } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { capPhoneDigits } from '../../utils/helpers';
import AuthShell from './AuthShell';
import OtpInput from './OtpInput';

const PANEL_POINTS = [
  'See your plan, dues and renewal date at a glance',
  'Your workout plan and progress, always up to date',
  'Digital membership card — no more paper receipts',
];

const MemberLogin = () => {
  const navigate = useNavigate();
  const { setActiveMembership } = useAuth();
  const { showToast } = useToast();

  const [screen, setScreen] = useState('phone'); // 'phone' | 'otp' | 'select-gym' | 'not-registered'
  const [memberships, setMemberships] = useState([]);
  const [selecting, setSelecting] = useState(false);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(0);

  const fullPhone = `+91${phone}`;
  const phoneMasked = phone.length === 10 ? `${phone.slice(0, 5)} ${phone.slice(5)}` : phone;

  useEffect(() => {
    setupRecaptcha('member-recaptcha-container');
    return () => destroyRecaptcha();
  }, []);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const timer = setInterval(() => setResendTimer((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [resendTimer]);

  const handleSendOtp = async () => {
    if (phone.length !== 10) {
      setError('Enter a valid 10-digit number');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await sendOTP(fullPhone, 'member-recaptcha-container');
      setConfirmationResult(result);
      setOtp(['', '', '', '', '', '']);
      setScreen('otp');
      setResendTimer(30);
    } catch (err) {
      console.error('OTP send error:', err.code, err.message);
      if (err.code === 'auth/invalid-phone-number') {
        setError('Invalid phone number. Please check and try again.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many attempts. Please try again later.');
      } else {
        showToast(`Failed to send OTP: ${err.code || err.message}`, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    const code = otp.join('');
    if (code.length !== 6) {
      setError('Please enter the full 6-digit code');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { user } = await verifyOTP(confirmationResult, code);
      trackEvent('login', { method: 'phone_otp' });
      let list = [];
      try {
        list = await linkMemberships(user.uid, fullPhone);
      } catch (linkErr) {
        console.warn('Failed to link memberships:', linkErr);
      }

      if (!list || list.length === 0) {
        setScreen('not-registered');
      } else if (list.length === 1) {
        await setActiveMembership(user.uid, list[0].id);
        navigate('/', { replace: true });
      } else {
        const sorted = [...list].sort((a, b) => (b.active === true) - (a.active === true));
        setMemberships(sorted);
        setScreen('select-gym');
      }
    } catch (err) {
      console.error('OTP verify error:', err.code, err.message);
      if (err.code === 'auth/invalid-verification-code') {
        setError('Incorrect code. Try again.');
      } else if (err.code === 'auth/code-expired') {
        setError('Code expired. Please resend.');
      } else if (err.code === 'auth/session-expired') {
        setError('Session expired. Please resend the OTP.');
      } else if (err.code === 'auth/invalid-app-credential') {
        setError('Verification failed. Please resend the OTP.');
      } else {
        showToast(`Verification failed: ${err.code || err.message}`, 'error');
      }
      setOtp(['', '', '', '', '', '']);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectGym = async (membershipId) => {
    if (selecting) return;
    setSelecting(true);
    try {
      await setActiveMembership(auth?.currentUser?.uid, membershipId);
      navigate('/', { replace: true });
    } catch (err) {
      console.error('Gym selection error:', err);
      showToast('Could not open that gym. Please try again.', 'error');
      setSelecting(false);
    }
  };

  const help = () => showToast('Ask your gym’s front desk for help signing in.', 'info');

  return (
    <AuthShell
      headline="Your gym membership, on your phone."
      sub="Renewals, workouts and your membership card — all in one place."
      points={PANEL_POINTS}
      onHelp={help}
      variant="member"
    >
      {screen === 'phone' && (
        <section data-screen-label="Member sign in">
          <h1 className="gla-title">Sign in as a member</h1>

          <label htmlFor="member-phone" className="gla-label">Mobile number</label>
          <div className="gla-phone-field">
            <span className="gla-phone-affix">+91</span>
            <input
              id="member-phone"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              className="gla-phone-input"
              placeholder="10-digit number"
              value={phone}
              onChange={(e) => { setPhone(capPhoneDigits(e.target.value)); setError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleSendOtp()}
            />
          </div>
          {error && <p className="gla-error-text">{error}</p>}
          <p className="gla-hint-text">We send a 6-digit code on WhatsApp, and by SMS if WhatsApp fails.</p>

          <button type="button" className="gla-btn-primary member" onClick={handleSendOtp} disabled={loading}>
            {loading ? <span className="gla-spinner" /> : 'Send code'}
          </button>
        </section>
      )}

      {screen === 'otp' && (
        <section data-screen-label="Verify code">
          <button type="button" className="gla-back-link" onClick={() => setScreen('phone')}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m14 6-6 6 6 6" /></svg>
            <span>Change number</span>
          </button>
          <h1 className="gla-title-tight">Enter the 6-digit code</h1>
          <p className="gla-subtitle">Sent on WhatsApp to <strong style={{ color: '#14152B' }}>+91 {phoneMasked}</strong>.</p>

          <OtpInput value={otp} onChange={setOtp} length={6} variant="otp" accent="member" error={!!error} />

          <div className="gla-resend-row">
            <span className="gla-resend-label">
              {resendTimer > 0 ? `You can ask again in ${resendTimer}s` : 'Didn’t get the code?'}
            </span>
            <button
              type="button"
              className="gla-resend-btn"
              onClick={handleSendOtp}
              disabled={resendTimer > 0}
              style={{ color: resendTimer > 0 ? '#A3A8BD' : '#0F5E3C', cursor: resendTimer > 0 ? 'default' : 'pointer' }}
            >
              Resend code
            </button>
          </div>
          {error && <p className="gla-error-text">{error}</p>}

          <button type="button" className="gla-btn-primary member" onClick={handleVerify} disabled={loading}>
            {loading ? <span className="gla-spinner" /> : 'Verify and sign in'}
          </button>
        </section>
      )}

      {screen === 'select-gym' && (
        <section data-screen-label="Choose your gym">
          <h1 className="gla-title-tight">Choose your gym</h1>
          <p className="gla-subtitle">You&apos;re a member at {memberships.length} gyms. Pick one to continue.</p>
          <div className="gla-gym-list">
            {memberships.map((m) => (
              <button key={m.id} className="gla-gym-card" onClick={() => handleSelectGym(m.id)} disabled={selecting}>
                <div className="gla-gym-info">
                  <span className="gla-gym-name">{m.gym_name}</span>
                  {m.plan_name && <span className="gla-gym-plan">{m.plan_name}</span>}
                </div>
                <span className={`gla-gym-badge ${m.active ? 'active' : 'inactive'}`}>{m.active ? 'Active' : 'Expired'}</span>
              </button>
            ))}
          </div>
          {selecting && <div className="gla-gym-loading"><span className="gla-spinner dark" /> Opening…</div>}
        </section>
      )}

      {screen === 'not-registered' && (
        <section data-screen-label="Not registered" className="gla-empty-state">
          <div className="gla-empty-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-2h2v2h-2zm0-4V7h2v6h-2z" fill="#8A4B00" />
            </svg>
          </div>
          <h3 className="gla-empty-title">You&apos;re not registered yet</h3>
          <p className="gla-empty-sub">Ask your gym owner to add you as a member.</p>
          <button type="button" className="gla-btn-primary member" onClick={() => navigate('/select-role', { replace: true })}>
            Go back
          </button>
        </section>
      )}

      <div id="member-recaptcha-container"></div>
    </AuthShell>
  );
};

export default MemberLogin;
