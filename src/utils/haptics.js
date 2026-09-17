// src/utils/haptics.js
// Tactile feedback for the app's main actions.
//
// Android / Chrome: navigator.vibrate patterns.
// iOS Safari (18+): no Vibration API, but toggling an <input type="checkbox" switch>
// through its <label> plays the system "selection" tick. We keep one hidden switch
// in the DOM and click it, repeating the tick for multi-pulse patterns.
// Everything is best-effort: unsupported browsers silently do nothing.

const PATTERNS = {
  light: { vibrate: 10, ticks: [0] },
  medium: { vibrate: 20, ticks: [0] },
  heavy: { vibrate: 35, ticks: [0] },
  selection: { vibrate: 8, ticks: [0] },
  success: { vibrate: [15, 60, 25], ticks: [0, 90] },
  warning: { vibrate: [25, 80, 25], ticks: [0, 110] },
  error: { vibrate: [35, 60, 35, 60, 35], ticks: [0, 80, 160] },
};

const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

let iosLabel = null;

const getIosSwitch = () => {
  if (iosLabel || typeof document === 'undefined' || !document.body) return iosLabel;
  const label = document.createElement('label');
  label.setAttribute('aria-hidden', 'true');
  label.style.cssText = 'position:fixed;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;left:-9999px;';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.tabIndex = -1;
  label.appendChild(input);
  document.body.appendChild(label);
  iosLabel = label;
  return iosLabel;
};

let lastFired = 0;

export function haptic(kind = 'light') {
  const pattern = PATTERNS[kind] || PATTERNS.light;
  // Collapse bursts (e.g. a tap and its toast landing in the same frame).
  const now = Date.now();
  if (now - lastFired < 40) return;
  lastFired = now;

  try {
    if (canVibrate) {
      navigator.vibrate(pattern.vibrate);
      return;
    }
    const label = getIosSwitch();
    if (!label) return;
    pattern.ticks.forEach((delay) => {
      if (delay === 0) label.click();
      else setTimeout(() => label.click(), delay);
    });
  } catch {
    // Haptics are decorative; never let them break an action.
  }
}

// Controls that count as a "main action". Any element can opt in (or pick a
// different strength) with data-haptic="success|medium|..."; data-haptic="off" opts out.
const ACTION_SELECTOR = [
  '[data-haptic]',
  '.gl2-btn-primary',
  '.gl2-btn-danger',
  '.gl2-fab-main',
  '.gl2-fab-item',
  '.gl2-bottom-nav-item',
  '.gl2-quick-item',
  '.bottom-nav-item',
  '.btn-primary',
].join(',');

let installed = false;

export function installTapHaptics() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener(
    'click',
    (e) => {
      const el = e.target instanceof Element ? e.target.closest(ACTION_SELECTOR) : null;
      if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
      const kind = el.getAttribute('data-haptic');
      if (kind === 'off') return;
      if (kind) haptic(kind);
      else if (el.matches('.gl2-btn-danger')) haptic('heavy');
      else if (el.matches('.gl2-bottom-nav-item, .bottom-nav-item')) haptic('selection');
      else haptic('medium');
    },
    { capture: true, passive: true },
  );
}
