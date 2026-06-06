import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { sendOTP, verifyOTP, setupRecaptcha, destroyRecaptcha } from '../../firebase/auth';
import { useToast } from '../../context/ToastContext';
import './Login.css';

const COUNTRY_CODES = [
  { code: '+91', label: '🇮🇳 +91' },
  { code: '+1', label: '🇺🇸 +1' },
  { code: '+44', label: '🇬🇧 +44' },
  { code: '+971', label: '🇦🇪 +971' },
  { code: '+61', label: '🇦🇺 +61' },
  { code: '+65', label: '🇸🇬 +65' },
  { code: '+966', label: '🇸🇦 +966' },
  { code: '+974', label: '🇶🇦 +974' },
  { code: '+60', label: '🇲🇾 +60' },
  { code: '+49', label: '🇩🇪 +49' },
];

const OwnerLogin = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [step, setStep] = useState('phone'); // 'phone' | 'otp'
  const [countryCode, setCountryCode] = useState('+91');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(0);

  const otpRefs = useRef([]);

  // Pre-initialise reCAPTCHA on mount so it's ready before the button click.
  // Destroying on unmount prevents stale widget errors on remount.
  useEffect(() => {
    setupRecaptcha('owner-recaptcha-container');
    return () => destroyRecaptcha();
  }, []);

  // Resend timer countdown
  useEffect(() => {
    if (resendTimer <= 0) return;
    const timer = setInterval(() => {
      setResendTimer((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendTimer]);

  const handleSendOTP = async () => {
    if (!phone.trim()) {
      setError('Please enter your phone number');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const fullPhone = `${countryCode}${phone.replace(/\s/g, '')}`;
      const result = await sendOTP(fullPhone, 'owner-recaptcha-container');
      setConfirmationResult(result);
      setStep('otp');
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

  const handleOtpChange = (index, value) => {
    if (value.length > 1) {
      // Handle paste
      const digits = value.replace(/\D/g, '').slice(0, 6);
      const newOtp = [...otp];
      digits.split('').forEach((digit, i) => {
        if (index + i < 6) newOtp[index + i] = digit;
      });
      setOtp(newOtp);
      const nextIndex = Math.min(index + digits.length, 5);
      otpRefs.current[nextIndex]?.focus();
      return;
    }

    if (!/^\d?$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    setError('');

    // Auto-advance
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
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
      // Verify OTP — Firebase Auth signs the user in
      await verifyOTP(confirmationResult, code);

      // Navigate to root. AuthContext's onAuthStateChanged handler awaits
      // getIdToken(true) before reading Firestore, so by the time loading
      // becomes false the userDoc and gym_id claim are both ready.
      // AutoRedirect then routes owners to /owner/dashboard (existing) or
      // /owner/register (new — no userDoc found by AuthContext).
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
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0) return;
    setOtp(['', '', '', '', '', '']);
    setError('');
    // Stay on OTP step — don't reset to phone step (causes React batching issues)
    setLoading(true);
    try {
      const fullPhone = `${countryCode}${phone.replace(/\s/g, '')}`;
      const result = await sendOTP(fullPhone, 'owner-recaptcha-container');
      setConfirmationResult(result);
      setResendTimer(30);
    } catch (err) {
      console.error('Resend error:', err);
      setError('Failed to resend OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen login-screen">
      <div className="screen-content">
        <button className="back-btn" onClick={() => navigate('/select-role')}>
          ← Back
        </button>

        <div className="login-form-card glass-card">
          <h2 className="login-heading">Owner login</h2>
          <p className="login-subtext">
            We&apos;ll send a verification code to your phone
          </p>

          {step === 'phone' && (
            <>
              <div className="input-group">
                <label className="input-label">Phone number</label>
                <div className="phone-input-wrapper">
                  <select
                    className="country-select"
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    id="country-code-select"
                  >
                    {COUNTRY_CODES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    className={`input-field phone-number-input ${error ? 'error' : ''}`}
                    placeholder="98765 43210"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      setError('');
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendOTP()}
                    id="phone-input"
                  />
                </div>
                {error && <p className="input-error">{error}</p>}
              </div>

              <button
                className="btn-primary"
                onClick={handleSendOTP}
                disabled={loading}
                id="send-otp-btn"
              >
                {loading ? <div className="spinner" /> : 'Send OTP'}
              </button>
            </>
          )}

          {step === 'otp' && (
            <>
              <div className="input-group">
                <label className="input-label">Enter 6-digit code</label>
                <div className="otp-container">
                  {otp.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => (otpRefs.current[i] = el)}
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      className={`otp-box ${error ? 'error' : ''}`}
                      value={digit}
                      onChange={(e) => handleOtpChange(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      onPaste={(e) => {
                        e.preventDefault();
                        const pastedData = e.clipboardData.getData('text');
                        handleOtpChange(0, pastedData);
                      }}
                      autoFocus={i === 0}
                      id={`otp-box-${i}`}
                    />
                  ))}
                </div>
                {error && <p className="input-error" style={{ textAlign: 'center' }}>{error}</p>}
              </div>

              <button
                className="btn-primary"
                onClick={handleVerify}
                disabled={loading}
                id="verify-otp-btn"
              >
                {loading ? <div className="spinner" /> : 'Verify & continue'}
              </button>

              <div className="resend-row" style={{ marginTop: 16 }}>
                {resendTimer > 0 ? (
                  <span>Resend OTP in {resendTimer}s</span>
                ) : (
                  <button className="resend-btn" onClick={handleResend}>
                    Resend OTP
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div id="owner-recaptcha-container"></div>
    </div>
  );
};

export default OwnerLogin;
