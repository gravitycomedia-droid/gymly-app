// src/superadmin/hooks/useOverlay.js
// Overlay plumbing: body-scroll lock, focus trap, focus restore and an Esc
// stack so only the TOPMOST overlay closes on Escape. Hand-rolled rather than
// pulling in Headless UI — this app has no headless-ui dependency and the
// console needs exactly these four behaviours.

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

// Module-level so nested overlays (a confirm opened from inside a dialog)
// close in the right order, and so the scroll lock is only released by the
// last one standing.
const escStack = [];
let lockCount = 0;
let savedOverflow = '';
let savedPaddingRight = '';

function lockScroll() {
  if (lockCount === 0) {
    const { body } = document;
    savedOverflow = body.style.overflow;
    savedPaddingRight = body.style.paddingRight;
    // Compensate for the scrollbar so the page doesn't jump sideways.
    const gap = window.innerWidth - document.documentElement.clientWidth;
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    body.style.overflow = 'hidden';
  }
  lockCount += 1;
}

function unlockScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = savedOverflow;
    document.body.style.paddingRight = savedPaddingRight;
  }
}

/**
 * @param {boolean} open
 * @param {() => void} onClose
 * @returns ref to put on the overlay panel
 */
export function useOverlay(open, onClose) {
  const panelRef = useRef(null);
  const returnFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!open) return undefined;

    returnFocusRef.current = document.activeElement;
    lockScroll();

    const token = { close: () => onCloseRef.current?.() };
    escStack.push(token);

    // Move focus into the panel on the next frame, once it has mounted and
    // (for the sheet) started animating in.
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector('[data-autofocus]') || panel.querySelector(FOCUSABLE);
      (first || panel).focus({ preventScroll: true });
    });

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (escStack[escStack.length - 1] === token) {
          e.stopPropagation();
          token.close();
        }
        return;
      }
      if (e.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll(FOCUSABLE))
        .filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) { e.preventDefault(); panel.focus(); return; }

      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown, true);
      const i = escStack.indexOf(token);
      if (i > -1) escStack.splice(i, 1);
      unlockScroll();
      const back = returnFocusRef.current;
      if (back && typeof back.focus === 'function') back.focus({ preventScroll: true });
    };
  }, [open]);

  return panelRef;
}

/** True below Tailwind's `md` (768px). Drives modal-vs-sheet and table-vs-cards. */
export function useIsMobile(query = '(max-width: 767px)') {
  const subscribe = useCallback((onChange) => {
    const mql = window.matchMedia(query);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
