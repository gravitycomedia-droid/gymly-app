// src/superadmin/components/Card.jsx
import { TriangleAlert, RefreshCw } from 'lucide-react';
import Button from './Button';
import { Skeleton } from './States';

/** Cards carry a 1px border and no shadow — depth is reserved for overlays. */
export function Card({ children, className = '', as: As = 'div', ...rest }) {
  return (
    <As className={`rounded-xl border border-sa-line bg-sa-surface ${className}`} {...rest}>
      {children}
    </As>
  );
}

export function CardHeader({ title, count, right, className = '' }) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 border-b border-sa-line-soft p-4 md:p-5 ${className}`}>
      <h2 className="text-base font-semibold text-sa-ink">{title}</h2>
      {count != null && <span className="text-[13px] tabular-nums text-sa-ink-3">{count}</span>}
      {right}
    </div>
  );
}

/** Uppercase section label used inside the gym-detail cards. */
export function SectionLabel({ children, right, className = '' }) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 ${className}`}>
      <h2 className="text-[13px] font-semibold uppercase tracking-[.05em] text-sa-ink-3">{children}</h2>
      {right}
    </div>
  );
}

/**
 * Each KPI owns its own loading and error state so one failing aggregate never
 * blanks the strip. README §7.1 / §10.
 */
export function KpiCard({ label, value, secondary, secondaryLead, leadTone = 'ink', loading, error, onRetry }) {
  const leadClass = {
    accent: 'text-sa-accent-ink',
    ink: 'text-sa-ink',
    muted: 'text-sa-ink-3',
  }[leadTone];

  return (
    <Card className="flex min-h-[104px] flex-col justify-between gap-2 p-3.5 md:min-h-[128px] md:p-5">
      <p className="text-[13px] font-medium leading-[18px] text-sa-ink-2">{label}</p>

      {loading ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <Skeleton className="h-6 w-[70%]" />
          <Skeleton className="h-3 w-[45%]" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-start gap-2">
          <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-sa-danger">
            <TriangleAlert aria-hidden="true" size={16} className="shrink-0" />
            Couldn’t load
          </span>
          {onRetry && (
            <Button size="sm" variant="secondary" onClick={onRetry}>
              <RefreshCw aria-hidden="true" size={14} />
              Retry
            </Button>
          )}
        </div>
      ) : (
        <>
          <p className="text-xl font-semibold leading-[23px] tracking-[-0.02em] tabular-nums text-sa-ink md:text-[28px] md:leading-[34px]">
            {value}
          </p>
          {secondary && (
            <p className="truncate text-xs leading-4 text-sa-ink-3">
              {secondaryLead && <span className={`font-semibold tabular-nums ${leadClass}`}>{secondaryLead}</span>}
              {secondaryLead ? ' ' : ''}{secondary}
            </p>
          )}
        </>
      )}
    </Card>
  );
}

/** Small tile used by the member-summary and payment-total grids. */
export function StatTile({ label, value, sub }) {
  return (
    <div className="min-w-0 rounded-lg border border-sa-line-soft bg-sa-subtle p-3">
      <p className="truncate text-xs leading-4 text-sa-ink-3">{label}</p>
      <p className="mt-1 truncate text-xl font-semibold leading-7 tabular-nums text-sa-ink">{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs leading-4 text-sa-ink-3">{sub}</p>}
    </div>
  );
}

/** Two-column definition row used inside the subscription card and dialogs. */
export function DefRow({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs leading-4 text-sa-ink-3">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium tabular-nums text-sa-ink">{value}</dd>
    </div>
  );
}
