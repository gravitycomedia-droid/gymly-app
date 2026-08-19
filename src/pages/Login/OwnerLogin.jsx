import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { sendOTP, verifyOTP, setupRecaptcha, destroyRecaptcha, verifyPin } from '../../firebase/auth';
import { useToast } from '../../context/ToastContext';
import { capPhoneDigits } from '../../utils/helpers';
import { importOwnerDashboard } from '../../routePreload';
import AuthShell from './AuthShell';
import OtpInput from './OtpInput';

const PANEL_POINTS = [
  'Enrol a member in under a minute',
  'Automatic renewal and dues reminders on WhatsApp',
  'Works offline at the desk and syncs later',
];

const OwnerLogin = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [screen, setScreen] = useState('phone'); // 'phone' | 'otp' | 'pin'
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [pin, setPinDigits] = useState(['', '', '', '']);
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pinError, setPinError] = useState('');
  const [resendTimer, setResendTimer] = useState(0);

  const fullPhone = `+91${phone}`;
  const phoneMasked = phone.length === 10 ? `${phone.slice(0, 5)} ${phone.slice(5)}` : phone;

  useEffect(() => {
    setupRecaptcha('owner-recaptcha-container');
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
      const result = await sendOTP(fullPhone, 'owner-recaptcha-container');
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
      await verifyOTP(confirmationResult, code);
      importOwnerDashboard();
      navigate('/', { replace: true });
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

  const handlePinSignIn = async () => {
    const code = pin.join('');
    if (code.length !== 4) {
      setPinError('Enter your 4-digit PIN');
      return;
    }
    setLoading(true);
    setPinError('');
    try {
      await verifyPin(fullPhone, code);
      importOwnerDashboard();
      navigate('/', { replace: true });
    } catch (err) {
      console.error('PIN verify error:', err.code, err.message, err.details);
      if (err.code === 'functions/not-found') {
        setPinError('No PIN set for this number yet — sign in with a code instead.');
      } else if (err.code === 'functions/resource-exhausted') {
        setPinError('Too many attempts. Please sign in with a code instead.');
      } else if (err.code === 'functions/permission-denied') {
        const left = err.details?.attemptsLeft;
        setPinError(left != null ? `Incorrect PIN. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Incorrect PIN.');
      } else {
        showToast(`Sign-in failed: ${err.code || err.message}`, 'error');
      }
      setPinDigits(['', '', '', '']);
    } finally {
      setLoading(false);
    }
  };

  const goPin = () => {
    if (phone.length !== 10) {
      setError('Enter your mobile number first');
      return;
    }
    setError('');
    setPinError('');
    setPinDigits(['', '', '', '']);
    setScreen('pin');
  };

  const forgotPin = () => {
    setPinError('');
    setScreen('phone');
    handleSendOtp();
  };

  const help = () => showToast('Reach out to your Gymloop representative for help.', 'info');

  return (
    <AuthShell
      headline="Welcome back to Gymloop."
      sub="Renewals due, dues pending and today's check-ins are waiting on your dashboard."
      points={PANEL_POINTS}
      onHelp={help}
    >
      {screen === 'phone' && (
        <section data-screen-label="Sign in">
          <h1 className="gla-title">Sign in to your gym</h1>

          <label htmlFor="owner-phone" className="gla-label">Mobile number</label>
          <div className="gla-phone-field">
            <span className="gla-phone-affix">+91</span>
            <input
              id="owner-phone"
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

          <button type="button" className="gla-btn-primary" onClick={handleSendOtp} disabled={loading}>
            {loading ? <span className="gla-spinner" /> : 'Send code'}
          </button>

          <div className="gla-divider-row">
            <span className="gla-divider-line" />
            <span className="gla-divider-text">OR</span>
            <span className="gla-divider-line" />
          </div>

          <button type="button" className="gla-btn-secondary" onClick={goPin}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6C63C7" strokeWidth="2">
              <rect x="4" y="10" width="16" height="10" rx="2.5" />
              <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
            </svg>
            <span>Sign in with PIN instead</span>
          </button>

          <div className="gla-promo-card">
            <p className="gla-promo-title">New to Gymloop?</p>
            <p className="gla-promo-sub">Set your gym up in about five minutes — plans, members and payments all in one place.</p>
            <button type="button" className="gla-promo-btn" onClick={() => navigate('/owner/register')}>Create your gym</button>
          </div>
        </section>
      )}

      {screen === 'pin' && (
        <section data-screen-label="PIN sign in">
          <button type="button" className="gla-back-link" onClick={() => setScreen('phone')}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m14 6-6 6 6 6" /></svg>
            <span>All sign-in options</span>
          </button>
          <h1 className="gla-title-tight">Enter your PIN</h1>
          <p className="gla-subtitle">Signing in as <strong style={{ color: '#14152B' }}>+91 {phoneMasked}</strong>.</p>

          <OtpInput value={pin} onChange={setPinDigits} length={4} variant="pin" error={!!pinError} />
          <a href="#" onClick={(e) => { e.preventDefault(); forgotPin(); }}>Forgot PIN? Sign in with a code instead</a>
          {pinError && <p className="gla-error-text">{pinError}</p>}

          <button type="button" className="gla-btn-primary" onClick={handlePinSignIn} disabled={loading}>
            {loading ? <span className="gla-spinner" /> : 'Sign in'}
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
            {loading ? <span className="gla-spinner" /> : 'Verify and sign in'}
          </button>
          <p className="gla-note">Code not arriving? Check that WhatsApp is installed on this number.</p>
        </section>
      )}

      <div id="owner-recaptcha-container"></div>
    </AuthShell>
  );
};

export default OwnerLogin;
