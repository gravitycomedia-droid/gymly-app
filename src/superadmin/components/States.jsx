// src/superadmin/components/States.jsx
// Loading / empty / error / 404 / pagination. Every list and data view in the
// console is required to have all three states (README acceptance criteria),
// so they live here rather than being re-invented per screen.

import { TriangleAlert, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import Button, { IconButton, FOCUS } from './Button';
import { Card } from './Card';

/** Shimmer block. Size it like the real content so nothing shifts on load. */
export function Skeleton({ className = '' }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-md bg-[linear-gradient(90deg,#EEEDE8_25%,#F7F6F2_50%,#EEEDE8_75%)]
        bg-[length:200%_100%] animate-sa-shimmer motion-reduce:animate-none ${className}`}
    />
  );
}

export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      {Icon && (
        <span className="mb-1 flex size-12 items-center justify-center rounded-xl bg-sa-muted text-sa-ink-3">
          <Icon aria-hidden="true" size={22} />
        </span>
      )}
      <h3 className="text-base font-semibold leading-6 text-sa-ink">{title}</h3>
      {body && <p className="max-w-[360px] text-sm text-sa-ink-3">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', body, onRetry, retryLabel = 'Try again' }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="mb-1 flex size-12 items-center justify-center rounded-xl bg-sa-danger-soft text-sa-danger">
        <TriangleAlert aria-hidden="true" size={22} />
      </span>
      <h3 className="text-base font-semibold leading-6 text-sa-ink">{title}</h3>
      {body && <p className="max-w-[360px] text-sm text-sa-ink-3">{body}</p>}
      {onRetry && (
        <div className="mt-2">
          <Button variant="secondary" onClick={onRetry}>
            <RefreshCw aria-hidden="true" size={16} />
            {retryLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Banner form, for a section that failed inside an otherwise healthy card. */
export function InlineSectionError({ message, onRetry }) {
  return (
    <div role="alert" className="m-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-sa-danger-soft p-4">
      <span className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-sa-danger">
        <TriangleAlert aria-hidden="true" size={18} className="shrink-0" />
        <span className="min-w-0">{message}</span>
      </span>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          <RefreshCw aria-hidden="true" size={14} />
          Retry
        </Button>
      )}
    </div>
  );
}

export function NotFound({ code = '404', title, body, action }) {
  return (
    <Card className="px-6 py-16">
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="font-sa-mono text-[13px] font-semibold tracking-[.08em] text-sa-ink-3">{code}</p>
        <h1 className="text-xl font-semibold leading-7 text-sa-ink">{title}</h1>
        {body && <p className="max-w-[360px] text-sm text-sa-ink-3">{body}</p>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </Card>
  );
}

// ── Pagination ─────────────────────────────────────────────────────────────
const pageWindow = (page, pages) => {
  if (pages <= 5) return Array.from({ length: pages }, (_, i) => i + 1);
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  return Array.from({ length: 5 }, (_, i) => start + i);
};

export function Pagination({ page, pages, total, pageSize, onChange }) {
  if (!total) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between gap-3 border-t border-sa-line-soft px-4 py-3">
      <p className="text-[13px] tabular-nums text-sa-ink-3">
        {from}–{to} of {total}
      </p>

      <div className="flex items-center gap-1.5">
        <IconButton
          label="Previous page"
          variant="secondary"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className={`size-11 md:size-10 ${page <= 1 ? 'opacity-40' : ''}`}
        >
          <ChevronLeft size={18} />
        </IconButton>

        <span className="px-1 text-[13px] tabular-nums text-sa-ink-2 md:hidden">
          Page {page} of {pages}
        </span>

        <span className="hidden items-center gap-1 md:flex">
          {pageWindow(page, pages).map((p) => (
            <button
              key={p}
              type="button"
              aria-current={p === page ? 'page' : undefined}
              onClick={() => onChange(p)}
              className={`h-10 min-w-10 rounded-lg border px-2 text-sm font-medium tabular-nums transition-colors
                ${p === page
              ? 'border-sa-ink bg-sa-ink text-white'
              : 'border-sa-line-strong bg-sa-surface text-sa-ink hover:bg-sa-canvas'} ${FOCUS}`}
            >
              {p}
            </button>
          ))}
        </span>

        <IconButton
          label="Next page"
          variant="secondary"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
          className={`size-11 md:size-10 ${page >= pages ? 'opacity-40' : ''}`}
        >
          <ChevronRight size={18} />
        </IconButton>
      </div>
    </div>
  );
}
