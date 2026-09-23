import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { sendOTP, verifyOTP, setupRecaptcha, destroyRecaptcha, setPin } from '../../firebase/auth';
import { createGym, createUser } from '../../firebase/firestore';
import { trackEvent } from '../../lib/analytics';
import { createFreeSubscription } from '../../utils/subscriptionService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { capPhoneDigits } from '../../utils/helpers';
import AuthShell from '../Login/AuthShell';
import OtpInput from '../Login/OtpInput';

const CITIES = ['Hyderabad', 'Bengaluru', 'Vijayawada', 'Warangal', 'Mysuru', 'Other'];

const PANEL_POINTS = [
  'Members, renewals, payments and reminders in one place',
  'Enrol a member in under a minute',
  'Built for gyms in India',
];

const Signup = () => {
  const navigate = useNavigate();
  const { userDoc, refreshUserDoc } = useAuth();
  const { showToast } = useToast();

  // Existing owner who lands here by mistake → straight to the dashboard.
  useEffect(() => {
    if (userDoc?.gym_id) navigate('/owner/dashboard', { replace: true });
  }, [userDoc, navigate]);

  const [screen, setScreen] = useState('form'); // 'form' | 'otp' | 'pin' | 'creating'
  const [ownerName, setOwnerName] = useState('');
  const [gymName, setGymName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState(CITIES[0]);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [pin, setPinDigits] = useState(['', '', '', '']);
  const [pinConfirm, setPinConfirm] = useState(['', '', '', '']);
  const [pinError, setPinError] = useState('');
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [authedUser, setAuthedUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(0);

  const fullPhone = `+91${phone}`;
  const phoneMasked = phone.length === 10 ? `${phone.slice(0, 5)} ${phone.slice(5)}` : phone;

  useEffect(() => {
    setupRecaptcha('signup-recaptcha-container');
    return () => destroyRecaptcha();
  }, []);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const timer = setInterval(() => setResendTimer((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [resendTimer]);

  const handleSendOtp = async () => {
    if (!ownerName.trim() || !gymName.trim()) {
      setError('Enter your name and your gym’s name');
      return;
    }
    if (phone.length !== 10) {
      setError('Enter a valid 10-digit number');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await sendOTP(fullPhone, 'signup-recaptcha-container');
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

  const createGymAccount = async (user) => {
    const gymId = await createGym({
      name: gymName.trim(),
      owner_id: user.uid,
      owner_name: ownerName.trim(),
      phone: user.phoneNumber || fullPhone,
      city,
      address: '',
      gym_type: 'general',
      working_hours: { open: '', close: '' },
      photos: [],
      logo_url: '',
      no_of_branches: 1,
      settings: { plans: [] },
      setup_status: {},
    });

    await createUser(user.uid, {
      name: ownerName.trim(),
      phone: user.phoneNumber || fullPhone,
      role: 'owner',
      gym_id: gymId,
      permissions: ['all'],
      subscription_expiry: null,
      payment_status: null,
      plan_id: null,
      start_date: null,
      workout_plan_id: null,
      height: null,
      weight: null,
      goal: null,
      experience: null,
      medical_notes: null,
    });

    await createFreeSubscription(gymId);
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
      const { user, isNewUser } = await verifyOTP(confirmationResult, code);

      if (!isNewUser) {
        // Already has an account — this isn't a new signup, just sign them in.
        showToast('You already have a Gymloop account — signing you in.', 'success');
        navigate('/', { replace: true });
        return;
      }

      setLoading(true);
      setScreen('creating');
      await createGymAccount(user);
      trackEvent('sign_up', { method: 'phone_otp' });
      setAuthedUser(user);
      setScreen('pin');
    } catch (err) {
      console.error('Signup verify error:', err.code, err.message);
      if (err.code === 'auth/invalid-verification-code') {
        setError('Incorrect code. Try again.');
        setScreen('otp');
      } else if (err.code === 'auth/code-expired') {
        setError('Code expired. Please resend.');
        setScreen('otp');
      } else {
        showToast(`Something went wrong: ${err.code || err.message}`, 'error');
        setScreen('otp');
      }
      setOtp(['', '', '', '', '', '']);
    } finally {
      setLoading(false);
    }
  };

  const finishToOnboarding = async () => {
    await refreshUserDoc(authedUser.uid);
    navigate('/owner/setup', { replace: true });
  };

  const handleCreatePin = async () => {
    const code = pin.join('');
    const confirmCode = pinConfirm.join('');
    if (code.length !== 4) {
      setPinError('Choose a 4-digit PIN');
      return;
    }
    if (code !== confirmCode) {
      setPinError('PINs don’t match');
      return;
    }
    setLoading(true);
    setPinError('');
    try {
      await setPin(code);
      await finishToOnboarding();
    } catch (err) {
      console.error('setPin error:', err);
      showToast('Could not save your PIN — you can set it later.', 'error');
      await finishToOnboarding();
    } finally {
      setLoading(false);
    }
  };

  const help = () => showToast('Reach out to your Gymloop representative for help.', 'info');

  return (
    <AuthShell
      headline="Run the gym from your phone, not a register."
      sub="Members, renewals, payments and reminders in one place — built for gyms in India."
      points={PANEL_POINTS}
      onHelp={help}
    >
      {screen === 'form' && (
        <section data-screen-label="Sign up">
          <h1 className="gla-title-tight">Create your gym</h1>
          <p className="gla-subtitle">Four details now. Plans, members and payments come next, and you can change any of it later.</p>

          <div className="gla-field-group">
            <div>
              <label htmlFor="su-name" className="gla-label">Your name</label>
              <input id="su-name" type="text" className="gl2-input" placeholder="e.g. Ravi Teja" value={ownerName} onChange={(e) => { setOwnerName(e.target.value); setError(''); }} />
            </div>
            <div>
              <label htmlFor="su-gym" className="gla-label">Gym name</label>
              <input id="su-gym" type="text" className="gl2-input" placeholder="e.g. Iron Peak Fitness" value={gymName} onChange={(e) => { setGymName(e.target.value); setError(''); }} />
            </div>
            <div>
              <label htmlFor="su-phone" className="gla-label">Mobile number</label>
              <div className="gla-phone-field">
                <span className="gla-phone-affix">+91</span>
                <input
                  id="su-phone"
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  className="gla-phone-input"
                  placeholder="10-digit number"
                  value={phone}
                  onChange={(e) => { setPhone(capPhoneDigits(e.target.value)); setError(''); }}
                />
              </div>
              <p className="gla-hint-text">This becomes your login and the number members see.</p>
            </div>
            <div>
              <label htmlFor="su-city" className="gla-label">City</label>
              <select id="su-city" className="gl2-select" value={city} onChange={(e) => setCity(e.target.value)}>
                {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {error && <p className="gla-error-text">{error}</p>}

          <button type="button" className="gla-btn-primary" onClick={handleSendOtp} disabled={loading}>
            {loading ? <span className="gla-spinner" /> : 'Send code to verify'}
          </button>
          <p className="gla-hint-text">By continuing you agree to our terms and privacy policy. First 14 days are free — no card needed.</p>

          <p className="gla-note" style={{ fontWeight: 700, color: '#5A5E76' }}>
            Already have a gym here? <a href="#" onClick={(e) => { e.preventDefault(); navigate('/owner/login'); }}>Sign in</a>
          </p>
        </section>
      )}

      {screen === 'otp' && (
        <section data-screen-label="Verify code">
          <button type="button" className="gla-back-link" onClick={() => setScreen('form')}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m14 6-6 6 6 6" /></svg>
            <span>Change number</span>
          </button>
          <h1 className="gla-title-tight">Enter the 6-digit code</h1>
          <p className="gla-subtitle">Sent on WhatsApp to <strong style={{ color: '#14152B' }}>+91 {phoneMasked}</strong>.</p>

          <OtpInput value={otp} onChange={setOtp} length={6} variant="otp" error={!!error} />

          <div className="gla-resend-row">
            <span className="gla-resend-label">
              {resendTimer > 0 ? `You can ask again in ${resendTimer}s` : 'Didn’t get the code?'}
            </span>
            <button
              type="button"
              className="gla-resend-btn"
              onClick={handleSendOtp}
              disabled={resendTimer > 0}
              style={{ color: resendTimer > 0 ? '#A3A8BD' : '#4A438F', cursor: resendTimer > 0 ? 'default' : 'pointer' }}
            >
              Resend code
            </button>
          </div>
          {error && <p className="gla-error-text">{error}</p>}

          <button type="button" className="gla-btn-primary" onClick={handleVerify} disabled={loading}>
            {loading ? <span className="gla-spinner" /> : 'Verify and start setup'}
          </button>
        </section>
      )}

      {screen === 'creating' && (
        <section data-screen-label="Setting up your gym" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 240, gap: 14 }}>
          <span className="gla-spinner dark" style={{ width: 28, height: 28 }} />
          <p className="gla-subtitle" style={{ margin: 0 }}>Setting up your gym…</p>
        </section>
      )}

      {screen === 'pin' && (
        <section data-screen-label="Create a PIN">
          <h1 className="gla-title-tight">Create a PIN</h1>
          <p className="gla-subtitle">A 4-digit PIN lets you sign in faster next time, without waiting for a code. You can skip this and set it later.</p>

          <label className="gla-label">Choose a PIN</label>
          <OtpInput value={pin} onChange={setPinDigits} length={4} variant="pin" error={!!pinError} autoFocus />

          <label className="gla-label" style={{ marginTop: 14, display: 'block' }}>Confirm PIN</label>
          <OtpInput value={pinConfirm} onChange={setPinConfirm} length={4} variant="pin" error={!!pinError} autoFocus={false} />

          {pinError && <p className="gla-error-text">{pinError}</p>}

          <div className="gla-wizard-actions">
            <button type="button" className="gla-btn-primary" onClick={handleCreatePin} disabled={loading}>
              {loading ? <span className="gla-spinner" /> : 'Save PIN and continue'}
            </button>
            <button type="button" className="gla-skip-btn" onClick={finishToOnboarding}>Skip for now</button>
          </div>
        </section>
      )}

      <div id="signup-recaptcha-container"></div>
    </AuthShell>
  );
};

export default Signup;
