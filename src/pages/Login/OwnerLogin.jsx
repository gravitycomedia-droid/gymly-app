import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { sendOTP, verifyOTP } from '../../firebase/auth';
import { getUser } from '../../firebase/firestore';
import { useAuth } from '../../context/AuthContext';
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
  const { refreshUserDoc } = useAuth();
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
      const result = await sendOTP(fullPhone);
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
      // Step 1: Verify OTP with Firebase Auth
      const user = await verifyOTP(confirmationResult, code);

      // Step 2: Try to fetch user doc from Firestore
      let userDoc = null;
      try {
        userDoc = await getUser(user.uid);
        await refreshUserDoc(user.uid);
      } catch (firestoreErr) {
        console.warn('Firestore read failed (likely rules not set):', firestoreErr.code);
        // If Firestore denies read, user is new — proceed to registration
      }

      if (userDoc) {
        navigate('/owner/dashboard', { replace: true });
      } else {
        navigate('/owner/register', { replace: true });
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
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0) return;
    setOtp(['', '', '', '', '', '']);
    setError('');
    setStep('phone');
    await handleSendOTP();
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

      <div id="recaptcha-container"></div>
    </div>
  );
};

export default OwnerLogin;
