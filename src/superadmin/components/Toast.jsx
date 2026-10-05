// src/superadmin/components/Toast.jsx
// Console-local toast. The app already has a global ToastContext, but its
// markup and placement belong to the old CSS design system and it stacks
// unlimited toasts. The spec calls for one dark toast at a time, positioned
// above the mobile tab bar — so the console ships its own and leaves the
// global one untouched for the rest of the app.

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { CircleCheck, TriangleAlert, X } from 'lucide-react';
import { FOCUS } from './Button';
import { haptic } from '../../utils/haptics';

const ToastContext = createContext(null);

export function useSaToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useSaToast must be used inside SuperAdminProviders');
  return ctx;
}

const AUTO_DISMISS_MS = 3200;

export function SaToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  const dismiss = useCallback(() => {
    clearTimeout(timerRef.current);
    setToast(null);
  }, []);

  const showToast = useCallback((message, type = 'success') => {
    clearTimeout(timerRef.current);
    haptic(type === 'error' ? 'error' : 'success');
    setToast({ id: Date.now(), message, type });
    timerRef.current = setTimeout(() => setToast(null), AUTO_DISMISS_MS);
  }, []);

  const value = useMemo(() => ({ showToast, dismiss }), [showToast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toast={toast} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ toast, onDismiss }) {
  const reduce = useReducedMotion();

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      // bottom-20 clears the 64px mobile tab bar; md+ docks it bottom-right.
      className="pointer-events-none fixed bottom-20 left-4 right-4 z-[95] flex justify-center
        md:bottom-6 md:left-auto md:right-6 md:w-[380px]"
    >
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="pointer-events-auto flex w-full items-start gap-2.5 rounded-[10px] bg-sa-ink py-2.5 pl-3.5 pr-2 text-white shadow-sa-toast"
          >
            {toast.type === 'error'
              ? <TriangleAlert aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-[#FF9A8F]" />
              : <CircleCheck aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-[#6FD3A8]" />}
            <p className="min-w-0 flex-1 text-sm leading-5">{toast.message}</p>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={onDismiss}
              className={`-mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white ${FOCUS}`}
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
