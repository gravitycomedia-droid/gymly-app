// src/superadmin/components/Button.jsx
import { forwardRef } from 'react';

// One focus ring for the whole console. Every interactive element imports this
// rather than restating the four utilities, so the ring can never drift.
export const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sa-accent';

const VARIANT = {
  primary:
    'bg-sa-accent text-white hover:bg-sa-accent-700 active:bg-sa-accent-800 '
    + 'disabled:bg-sa-line disabled:text-sa-ink-disabled',
  secondary:
    'bg-sa-surface border border-sa-line-strong text-sa-ink hover:bg-sa-canvas active:bg-sa-line-soft '
    + 'disabled:text-sa-ink-disabled disabled:border-sa-line disabled:bg-sa-surface',
  ghost:
    'bg-transparent text-sa-ink-2 hover:bg-sa-muted hover:text-sa-ink active:bg-sa-line '
    + 'disabled:text-[#9CA0A9] disabled:bg-transparent',
  danger:
    'bg-sa-danger text-white hover:bg-sa-danger-700 active:bg-sa-danger-800 '
    + 'disabled:bg-[#F3D3CF] disabled:text-white',
};

const SIZE = {
  // 44px on mobile so the tap target clears the minimum, 40px from md up.
  md: 'h-11 md:h-10 px-4 text-sm font-semibold',
  sm: 'h-8 px-2.5 text-[13px] font-medium',
};

const Button = forwardRef(function Button(
  {
    variant = 'secondary', size = 'md', loading = false, loadingLabel,
    disabled, className = '', children, type = 'button', ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;
  // The spinner borrows the text colour on light variants so it stays visible.
  const spinnerTone = variant === 'primary' || variant === 'danger'
    ? 'border-white/35 border-t-white'
    : 'border-sa-ink/20 border-t-sa-ink-2';

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-lg whitespace-nowrap transition-colors',
        'disabled:cursor-not-allowed',
        SIZE[size], VARIANT[variant], FOCUS, className,
      ].join(' ')}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden="true"
          className={`size-4 shrink-0 rounded-full border-2 ${spinnerTone} animate-spin`}
        />
      )}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  );
});

export default Button;

/** Square icon-only button. `label` becomes the accessible name. */
export const IconButton = forwardRef(function IconButton(
  { label, variant = 'ghost', className = '', children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={[
        'inline-flex items-center justify-center rounded-lg transition-colors shrink-0',
        'size-11 md:size-10 disabled:cursor-not-allowed disabled:opacity-40',
        VARIANT[variant], FOCUS, className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
});
