// src/superadmin/components/Badges.jsx
import { STATUS_LABEL, STATUS_TONE, TONE_CLASS, HEALTH_META } from '../lib/status';

/**
 * Status is never colour-only: the badge always carries its label, and the dot
 * is decoration. README §11.
 */
export function StatusBadge({ status, label, tone, size = 'md', className = '' }) {
  const t = TONE_CLASS[tone || STATUS_TONE[status] || 'neutral'];
  const text = label || STATUS_LABEL[status] || status || '—';
  const dims = size === 'sm' ? 'h-5 px-1.5 text-[11px]' : 'h-[22px] px-2 text-xs';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${dims} ${t.wrap} ${className}`}>
      <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${t.dot}`} />
      {text}
    </span>
  );
}

/**
 * Deliberately neutral — in a table row the status badge should be the only
 * thing carrying colour, so the plan never competes with it. README §6.
 */
export function PlanBadge({ children, className = '' }) {
  return (
    <span className={`inline-flex h-[22px] max-w-full items-center truncate rounded-md border border-sa-line-strong px-2 text-xs font-medium text-sa-ink ${className}`}>
      {children}
    </span>
  );
}

export function HealthBadge({ level, size = 'md', className = '' }) {
  const meta = HEALTH_META[level] || HEALTH_META.healthy;
  return <StatusBadge tone={meta.tone} label={meta.label} size={size} className={className} />;
}
