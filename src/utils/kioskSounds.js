// src/utils/kioskSounds.js
// Web Audio API tone generator for kiosk feedback sounds.
// Lazily creates AudioContext after first user interaction (browser policy).

let audioCtx = null;

const getAudioContext = () => {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  return audioCtx;
};

const playTone = (frequency, duration, type = 'sine', gainValue = 0.25) => {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
    oscillator.type = type;
    gainNode.gain.setValueAtTime(gainValue, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  } catch (_) {
    // Silently ignore audio errors (e.g. suspended context)
  }
};

/**
 * Play a kiosk feedback sound.
 * @param {'success'|'warning'|'alert'|'exit'} type
 */
export const playKioskSound = (type) => {
  switch (type) {
    case 'success':
      // Two ascending tones — pleasant confirmation
      playTone(523, 0.15); // C5
      setTimeout(() => playTone(784, 0.25), 150); // G5
      break;
    case 'warning':
      // Single mid tone — allowed but heads-up
      playTone(440, 0.4, 'triangle');
      break;
    case 'alert':
      // Two descending tones — clearly denied
      playTone(440, 0.2);
      setTimeout(() => playTone(330, 0.4), 200);
      break;
    case 'exit':
      // Soft ascending tones — gentle goodbye
      playTone(392, 0.2); // G4
      setTimeout(() => playTone(523, 0.3), 150); // C5
      break;
    default:
      break;
  }
};

/** Resume AudioContext if suspended (needed after page visibility change) */
export const resumeAudioContext = () => {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
};
