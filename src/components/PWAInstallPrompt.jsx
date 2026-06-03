import { useState, useEffect } from 'react';

/**
 * PWAInstallPrompt — shows a banner prompting users to install the app.
 * Uses the beforeinstallprompt event (Chrome/Android) and also shows
 * an iOS-specific instruction sheet for Safari.
 */
const PWAInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [installed, setInstalled] = useState(false);

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

  useEffect(() => {
    // Don't show if already installed or user dismissed before
    if (isInStandaloneMode) return;
    const dismissed = sessionStorage.getItem('pwa_dismissed');
    if (dismissed) return;

    if (isIOS) {
      // Show iOS guide after a brief delay
      const timer = setTimeout(() => setShowBanner(true), 2500);
      return () => clearTimeout(timer);
    }

    // Android / Chrome
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      const timer = setTimeout(() => setShowBanner(true), 2500);
      return () => clearTimeout(timer);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => {
      setInstalled(true);
      setShowBanner(false);
    });
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (isIOS) { setShowIOSGuide(true); return; }
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') { setShowBanner(false); }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    sessionStorage.setItem('pwa_dismissed', '1');
  };

  if (!showBanner || installed) return null;

  return (
    <>
      {/* ── Install Banner ── */}
      <div style={{
        position: 'fixed', bottom: 80, left: 12, right: 12, zIndex: 9999,
        animation: 'slideUp 0.4s cubic-bezier(0.34,1.56,0.64,1)',
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #1a1040 0%, #2d1b69 60%, #1a2980 100%)',
          borderRadius: 20, padding: '16px 18px',
          boxShadow: '0 8px 40px rgba(83,74,183,0.4), 0 2px 8px rgba(0,0,0,0.2)',
          display: 'flex', alignItems: 'center', gap: 14,
          border: '1px solid rgba(255,255,255,0.1)',
        }}>
          {/* App icon */}
          <div style={{
            width: 48, height: 48, borderRadius: 12, flexShrink: 0,
            background: 'rgba(255,255,255,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24,
          }}>
            🏋️
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: '#fff', marginBottom: 2 }}>
              Install Gymly
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.4 }}>
              Add to your home screen for the best experience
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
            <button
              onClick={handleInstall}
              style={{
                background: '#fff', color: '#534ab7', border: 'none',
                padding: '8px 14px', borderRadius: 10,
                fontSize: 12, fontWeight: 800, cursor: 'pointer',
                whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}
            >
              {isIOS ? 'How to →' : 'Install →'}
            </button>
            <button
              onClick={handleDismiss}
              style={{
                background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)',
                border: 'none', padding: '5px 14px', borderRadius: 10,
                fontSize: 11, cursor: 'pointer',
              }}
            >
              Not now
            </button>
          </div>
        </div>
      </div>

      {/* ── iOS Install Guide Sheet ── */}
      {showIOSGuide && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 10000, display: 'flex', alignItems: 'flex-end' }}
          onClick={() => setShowIOSGuide(false)}
        >
          <div
            style={{ background: '#fff', borderRadius: '24px 24px 0 0', padding: '24px 24px 40px', width: '100%', boxShadow: '0 -8px 32px rgba(0,0,0,0.15)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ width: 40, height: 4, background: '#e0e0e0', borderRadius: 99, margin: '0 auto 20px' }} />
            <div style={{ fontWeight: 800, fontSize: 18, color: '#1b1b1d', marginBottom: 6, textAlign: 'center' }}>Install Gymly on iOS</div>
            <p style={{ fontSize: 13, color: '#787584', textAlign: 'center', marginBottom: 24, lineHeight: 1.5 }}>
              To add Gymly to your home screen, follow these steps:
            </p>
            {[
              { step: '1', icon: '⬆️', text: 'Tap the Share button in Safari (the box with an arrow pointing up)' },
              { step: '2', icon: '➕', text: 'Scroll down and tap "Add to Home Screen"' },
              { step: '3', icon: '✅', text: 'Tap "Add" in the top right — Gymly is now installed!' },
            ].map(({ step, icon, text }) => (
              <div key={step} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(83,74,183,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                  {icon}
                </div>
                <p style={{ fontSize: 14, color: '#474553', lineHeight: 1.5, margin: 0, paddingTop: 8 }}>{text}</p>
              </div>
            ))}
            <button
              onClick={() => { setShowIOSGuide(false); handleDismiss(); }}
              style={{ width: '100%', marginTop: 8, padding: '14px', borderRadius: 14, background: 'linear-gradient(135deg, #534ab7, #378add)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
            >
              Got it!
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default PWAInstallPrompt;
