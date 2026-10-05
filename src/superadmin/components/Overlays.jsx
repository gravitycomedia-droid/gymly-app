// src/superadmin/components/Overlays.jsx
// ResponsiveDialog (modal on md+, sheet on mobile), SidePanel, and the
// ConfirmDialog provider that backs `useConfirm()`. README §6 "Overlays".

import {
  createContext, useCallback, useContext, useMemo, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import Button, { FOCUS } from './Button';
import { useOverlay, useIsMobile } from '../hooks/useOverlay';

const BACKDROP = 'rgba(22,24,29,.48)';

function Backdrop({ onClick, opacity = 1 }) {
  return (
    <motion.div
      aria-hidden="true"
      onClick={onClick}
      initial={{ opacity: 0 }}
      animate={{ opacity }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[80]"
      style={{ background: BACKDROP }}
    />
  );
}

/**
 * Modal above md, bottom/full sheet below it. `variant` picks how far the
 * mobile sheet travels: 'sheet' stops at its own height, 'full' fills.
 */
export function ResponsiveDialog({
  open, onClose, title, sub, children, footer, variant = 'full',
  labelledBy, role = 'dialog', maxWidth = 'max-w-[480px]', closeDisabled,
}) {
  const isMobile = useIsMobile();
  const reduce = useReducedMotion();
  const panelRef = useOverlay(open, closeDisabled ? () => {} : onClose);

  const motionProps = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.16 } }
    : isMobile
      ? {
        initial: { y: '100%' },
        animate: { y: 0 },
        exit: { y: '100%' },
        transition: { type: 'spring', stiffness: 400, damping: 40 },
      }
      : {
        initial: { opacity: 0, scale: 0.96 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 0.96 },
        transition: { duration: 0.16, ease: 'easeOut' },
      };

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <Backdrop onClick={closeDisabled ? undefined : onClose} />
          <div className="fixed inset-0 z-[81] flex items-end justify-center md:items-center md:p-6">
            <motion.div
              ref={panelRef}
              tabIndex={-1}
              role={role}
              aria-modal="true"
              aria-labelledby={labelledBy}
              {...motionProps}
              className={`flex w-full flex-col overflow-hidden bg-sa-surface shadow-sa-lg outline-none
                ${variant === 'full' ? 'h-full rounded-none' : 'max-h-[90%] rounded-t-2xl'}
                md:h-auto md:max-h-[calc(100%-48px)] md:rounded-xl ${maxWidth}`}
            >
              {title && (
                <div className="flex items-start gap-3 border-b border-sa-line px-4 py-3.5 md:px-5">
                  <div className="min-w-0 flex-1">
                    <h2 id={labelledBy} className="text-[17px] font-semibold leading-6 text-sa-ink md:text-lg md:leading-[26px]">
                      {title}
                    </h2>
                    {sub && <p className="mt-0.5 text-[13px] text-sa-ink-3">{sub}</p>}
                  </div>
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={onClose}
                    disabled={closeDisabled}
                    className={`-mr-1 flex size-11 shrink-0 items-center justify-center rounded-lg text-sa-ink-2
                      hover:bg-sa-muted disabled:opacity-40 md:size-10 ${FOCUS}`}
                  >
                    <X size={18} />
                  </button>
                </div>
              )}

              <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto p-4 md:p-5">
                {children}
              </div>

              {footer && (
                <div className="border-t border-sa-line px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom))] md:px-5 md:pb-3">
                  {footer}
                </div>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Right-docked panel on md+, full-screen sheet on mobile. */
export function SidePanel({ open, onClose, label, title, children, backdropOpacity = 1 }) {
  const isMobile = useIsMobile();
  const reduce = useReducedMotion();
  const panelRef = useOverlay(open, onClose);

  const motionProps = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.16 } }
    : isMobile
      ? {
        initial: { y: '100%' },
        animate: { y: 0 },
        exit: { y: '100%' },
        transition: { type: 'spring', stiffness: 400, damping: 40 },
      }
      : {
        initial: { x: '100%' },
        animate: { x: 0 },
        exit: { x: '100%' },
        transition: { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] },
      };

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <Backdrop onClick={onClose} opacity={backdropOpacity} />
          <div className="fixed inset-0 z-[81] flex justify-end">
            <motion.div
              ref={panelRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label={title}
              {...motionProps}
              className="flex h-full w-full flex-col bg-sa-surface shadow-sa-lg outline-none md:max-w-[460px]"
            >
              <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-sa-line px-4">
                <span className="text-[11px] font-semibold uppercase tracking-[.06em] text-sa-ink-3">{label}</span>
                <button
                  type="button"
                  aria-label="Close panel"
                  onClick={onClose}
                  className={`-mr-1 flex size-11 items-center justify-center rounded-lg text-sa-ink-2 hover:bg-sa-muted md:size-10 ${FOCUS}`}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 pb-[calc(16px+env(safe-area-inset-bottom))] md:p-5">
                {children}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ── Confirm dialog ─────────────────────────────────────────────────────────
const ConfirmContext = createContext(null);

/** `const confirm = useConfirm(); if (await confirm({...})) { … }` */
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside SuperAdminProviders');
  return ctx;
}

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolverRef = useRef(null);

  const confirm = useCallback((opts) => new Promise((resolve) => {
    resolverRef.current = resolve;
    setState(opts);
  }), []);

  const settle = useCallback((result) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setState(null);
  }, []);

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <ConfirmDialog state={state} onSettle={settle} />
    </ConfirmContext.Provider>
  );
}

/**
 * Resolves `true` on confirm, `false` on cancel/dismiss, and the option's
 * `value` when an `alt` action is supplied (Compose's three-way discard).
 */
function ConfirmDialog({ state, onSettle }) {
  const isMobile = useIsMobile();
  const reduce = useReducedMotion();
  const open = !!state;
  const panelRef = useOverlay(open, () => onSettle(false));

  const Icon = state?.icon;
  const destructive = state?.destructive;

  const motionProps = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.16 } }
    : isMobile
      ? {
        initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' },
        transition: { type: 'spring', stiffness: 400, damping: 40 },
      }
      : {
        initial: { opacity: 0, scale: 0.96 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.96 },
        transition: { duration: 0.16, ease: 'easeOut' },
      };

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <Backdrop onClick={() => onSettle(false)} />
          <div className="fixed inset-0 z-[91] flex items-end justify-center md:items-center md:p-6">
            <motion.div
              ref={panelRef}
              tabIndex={-1}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="sa-confirm-title"
              {...motionProps}
              className="flex w-full max-w-[440px] flex-col rounded-t-2xl bg-sa-surface px-4 pb-[calc(16px+env(safe-area-inset-bottom))]
                pt-5 shadow-sa-lg outline-none md:rounded-xl md:p-6"
            >
              <span aria-hidden="true" className="mx-auto mb-4 h-1 w-9 rounded-full bg-sa-line-strong md:hidden" />

              {Icon && (
                <span
                  className={`mb-3.5 flex size-10 items-center justify-center rounded-full
                    ${destructive ? 'bg-sa-danger-soft text-sa-danger' : 'bg-sa-accent-soft text-sa-accent-ink'}`}
                >
                  <Icon aria-hidden="true" size={20} />
                </span>
              )}

              <h2 id="sa-confirm-title" className="text-[17px] font-semibold leading-6 text-sa-ink">
                {state.title}
              </h2>
              {state.body && <p className="mt-1.5 text-sm leading-5 text-sa-ink-2">{state.body}</p>}

              {state.rows?.length > 0 && (
                <dl className="mt-4 rounded-[10px] border border-sa-line-soft bg-sa-subtle px-3.5">
                  {state.rows.map((r, i) => (
                    <div
                      key={r.label}
                      className={`flex items-start justify-between gap-4 py-2.5 ${i > 0 ? 'border-t border-sa-line-soft' : ''}`}
                    >
                      <dt className="shrink-0 text-[13px] text-sa-ink-3">{r.label}</dt>
                      <dd className="min-w-0 truncate text-right text-[13px] font-medium text-sa-ink">{r.value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              <div className="mt-5 flex flex-col-reverse gap-2 md:flex-row md:justify-end">
                <Button variant="secondary" onClick={() => onSettle(false)} className="md:w-auto">
                  {state.cancelLabel || 'Cancel'}
                </Button>
                {state.alt && (
                  <Button variant="secondary" onClick={() => onSettle(state.alt.value)} className="md:w-auto">
                    {state.alt.label}
                  </Button>
                )}
                <Button
                  data-autofocus
                  variant={destructive ? 'danger' : 'primary'}
                  onClick={() => onSettle(true)}
                  className="md:w-auto"
                >
                  {state.confirmLabel || 'Confirm'}
                </Button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
