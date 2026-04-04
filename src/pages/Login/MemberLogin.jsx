import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { sendOTP, verifyOTP } from '../../firebase/auth';
import { getUser, linkMemberAccount } from '../../firebase/firestore';
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

const MemberLogin = () => {
  const navigate = useNavigate();
  const { refreshUserDoc } = useAuth();
  const { showToast } = useToast();

  const [step, setStep] = useState('phone'); // 'phone' | 'otp' | 'not-registered'
  const [countryCode, setCountryCode] = useState('+91');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(0);

  const otpRefs = useRef([]);

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

      // Step 2: Ensure any unlinked member doc from Owner Dashboard is linked to this Auth UID
      const fullPhone = `${countryCode}${phone.replace(/\s/g, '')}`;
      try {
          await linkMemberAccount(user.uid, fullPhone);
      } catch (linkErr) {
          console.warn('Failed to link account (perhaps rules or network):', linkErr);
      }

      // Step 3: Fetch the newly linked (or already existing) user doc
      let userDoc = null;
      try {
        userDoc = await getUser(user.uid);
        await refreshUserDoc(user.uid);
      } catch (firestoreErr) {
        console.warn('Firestore read failed (likely rules not set):', firestoreErr.code);
      }

      if (userDoc && userDoc.role === 'member') {
        navigate('/member/home', { replace: true });
      } else if (!userDoc) {
        setStep('not-registered');
      } else {
        // User exists but is not a member (maybe owner) — redirect appropriately
        navigate('/', { replace: true });
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
    <div className="screen login-screen member">
      <div className="screen-content">
        <button className="back-btn" onClick={() => navigate('/select-role')}>
          ← Back
        </button>

        {step !== 'not-registered' ? (
          <div className="login-form-card glass-card">
            <h2 className="login-heading">Member login</h2>
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
                      id="member-country-code"
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
                      id="member-phone-input"
                    />
                  </div>
                  {error && <p className="input-error">{error}</p>}
                </div>

                <button
                  className="btn-primary btn-member"
                  onClick={handleSendOTP}
                  disabled={loading}
                  id="member-send-otp"
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
                        className={`otp-box member-accent ${error ? 'error' : ''}`}
                        value={digit}
                        onChange={(e) => handleOtpChange(i, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(i, e)}
                        onPaste={(e) => {
                          e.preventDefault();
                          const pastedData = e.clipboardData.getData('text');
                          handleOtpChange(0, pastedData);
                        }}
                        autoFocus={i === 0}
                        id={`member-otp-${i}`}
                      />
                    ))}
                  </div>
                  {error && <p className="input-error" style={{ textAlign: 'center' }}>{error}</p>}
                </div>

                <button
                  className="btn-primary btn-member"
                  onClick={handleVerify}
                  disabled={loading}
                  id="member-verify-otp"
                >
                  {loading ? <div className="spinner" /> : 'Verify & continue'}
                </button>

                <div className="resend-row" style={{ marginTop: 16 }}>
                  {resendTimer > 0 ? (
                    <span>Resend OTP in {resendTimer}s</span>
                  ) : (
                    <button className="resend-btn member-accent" onClick={handleResend}>
                      Resend OTP
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          /* Not registered message */
          <div className="login-form-card glass-card not-registered">
            <div className="not-registered-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-2h2v2h-2zm0-4V7h2v6h-2z" fill="#E8A838"/>
              </svg>
            </div>
            <h3>You&apos;re not registered yet</h3>
            <p>Ask your gym owner to add you as a member.</p>
            <button
              className="btn-primary btn-member"
              onClick={() => navigate('/select-role', { replace: true })}
              id="go-back-btn"
            >
              Go back
            </button>
          </div>
        )}
      </div>

      <div id="recaptcha-container"></div>
    </div>
  );
};

export default MemberLogin;
