import { useRef } from 'react';

// Shared digit-cell row for OTP (length=6, text) and PIN (length=4, password)
// entry — auto-advance on type, backspace-to-previous, paste-fills-all.
// Factors out logic that used to be duplicated between OwnerLogin and
// MemberLogin. Fill-state border/background is inline (like the prototype's
// `cell()` helper) since it's per-digit and driven by value, not a class.
const ACCENTS = {
  primary: { border: '#6C63C7', bg: '#F7F6FD' },
  member: { border: '#0F5E3C', bg: '#EAF6EF' },
};

export default function OtpInput({ value, onChange, length = 6, variant = 'otp', accent = 'primary', error, autoFocus = true }) {
  const refs = useRef([]);
  const fillColor = ACCENTS[accent] || ACCENTS.primary;

  const setDigit = (index, next) => {
    const digits = next.replace(/\D/g, '').slice(0, length);
    if (digits.length > 1) {
      // Paste — fill from this index onward.
      const arr = [...value];
      digits.split('').forEach((d, i) => {
        if (index + i < length) arr[index + i] = d;
      });
      onChange(arr);
      refs.current[Math.min(index + digits.length, length - 1)]?.focus();
      return;
    }
    const arr = [...value];
    arr[index] = digits;
    onChange(arr);
    if (digits && index < length - 1) refs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  return (
    <div className={`gla-code-row ${variant === 'pin' ? 'pin' : ''}`}>
      {Array.from({ length }).map((_, i) => {
        const filled = !!value[i];
        return (
          <input
            key={i}
            ref={(el) => (refs.current[i] = el)}
            type={variant === 'pin' ? 'password' : 'text'}
            inputMode="numeric"
            maxLength={length}
            aria-label={variant === 'pin' ? 'PIN digit' : 'Code digit'}
            className={`gla-code-cell ${variant === 'pin' ? 'pin' : ''}`}
            style={{
              borderColor: error ? '#C1362C' : filled ? fillColor.border : undefined,
              background: filled ? fillColor.bg : undefined,
            }}
            value={value[i] || ''}
            onChange={(e) => setDigit(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={(e) => {
              e.preventDefault();
              setDigit(i, e.clipboardData.getData('text'));
            }}
            autoFocus={autoFocus && i === 0}
          />
        );
      })}
    </div>
  );
}
