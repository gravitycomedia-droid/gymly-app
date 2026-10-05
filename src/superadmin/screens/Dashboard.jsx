// src/superadmin/screens/Dashboard.jsx
// KPI strip + the gyms list. Filter, search, sort and page all live in the URL
// so going Back from a gym detail restores exactly what the operator was
// looking at (README §7.1 "State persistence").

import { useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Inbox, TriangleAlert, ChevronRight } from 'lucide-react';
import useAsync from '../hooks/useAsync';
import { fetchGyms, fetchPlatformStats, fetchPlans } from '../lib/api';
import { formatNum, formatINR, formatINRCompact, formatDate, startOfThisMonth, plural } from '../lib/format';
import { healthOf, STATUS_LABEL, GYM_STATUSES } from '../lib/status';
import { PageHeader } from '../SuperAdminLayout';
import { Card, CardHeader, KpiCard } from '../components/Card';
import { StatusBadge, PlanBadge, HealthBadge } from '../components/Badges';
import { SearchInput, FilterSelect, FilterChip } from '../components/Inputs';
import { EmptyState, ErrorState, Skeleton, Pagination } from '../components/States';
import { FOCUS } from '../components/Button';

const PAGE_SIZE = 20;

const SORTS = [
  { value: 'newest', label: 'Sort: Newest' },
  { value: 'name', label: 'Sort: Name A–Z' },
  { value: 'members', label: 'Sort: Most members' },
];

const HEALTH_OPTIONS = [
  { value: '', label: 'All health' },
  { value: 'at_risk', label: 'At risk' },
  { value: 'watch', label: 'Watch' },
  { value: 'healthy', label: 'Healthy' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const gymsQ = useAsync(fetchGyms, [], { initial: [] });
  const statsQ = useAsync(fetchPlatformStats, []);
  const plansQ = useAsync(fetchPlans, [], { initial: [] });

  const gyms = gymsQ.data || [];
  const plans = plansQ.data || [];
  const stats = statsQ.data;

  const q = params.get('q') || '';
  const plan = params.get('plan') || '';
  const status = params.get('status') || '';
  const city = params.get('city') || '';
  const health = params.get('health') || '';
  const sort = params.get('sort') || 'newest';
  const page = Math.max(1, Number(params.get('page')) || 1);

  // Any filter change resets to page 1 — otherwise a narrower result set can
  // strand the operator on an empty page 3.
  const setParam = useCallback((key, value) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
      if (key !== 'page') next.delete('page');
      return next;
    }, { replace: true });
  }, [setParams]);

  const clearFilters = useCallback(() => {
    setParams(new URLSearchParams(), { replace: true });
  }, [setParams]);

  const planName = useCallback(
    (planId) => plans.find((p) => p.id === planId)?.name || planId,
    [plans],
  );

  const cities = useMemo(
    () => [...new Set(gyms.map((g) => g.city).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [gyms],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const rows = gyms.filter((g) => {
      if (plan && g.planId !== plan) return false;
      if (status && g.status !== status) return false;
      if (city && g.city !== city) return false;
      if (health && healthOf(g).level !== health) return false;
      if (!term) return true;
      return [g.name, g.ownerName, g.city].filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    });

    const sorted = [...rows];
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'members') sorted.sort((a, b) => b.memberCount - a.memberCount);
    else sorted.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
    return sorted;
  }, [gyms, q, plan, status, city, health, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const isFiltered = !!(q || plan || status || city || health);
  const newThisMonth = useMemo(() => {
    const from = startOfThisMonth();
    return gyms.filter((g) => g.createdAt && g.createdAt >= from).length;
  }, [gyms]);

  const atRisk = useMemo(() => gyms.filter((g) => healthOf(g).level === 'at_risk').length, [gyms]);

  const openGym = (gymId) => navigate(`/admin/gyms/${gymId}?${params.toString()}`);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <PageHeader
        title="Dashboard"
        subtitle="Every gym on Gymly, at a glance."
        right={stats?.updated_at && (
          <p className="text-[13px] tabular-nums text-sa-ink-3">
            As of {formatDate(stats.updated_at)}
          </p>
        )}
      />

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 gap-2 md:gap-4 lg:grid-cols-4">
        <KpiCard
          label="Total gyms"
          value={formatNum(stats?.total_gyms ?? gyms.length)}
          secondaryLead={`+${formatNum(newThisMonth)}`}
          secondary="this month"
          leadTone="accent"
          loading={statsQ.loading}
          error={statsQ.error}
          onRetry={statsQ.refetch}
        />
        <KpiCard
          label="Active gyms"
          value={formatNum(stats?.active_gyms)}
          secondaryLead={stats?.total_gyms ? `${Math.round((stats.active_gyms / stats.total_gyms) * 100)}%` : '—'}
          secondary="of total"
          loading={statsQ.loading}
          error={statsQ.error}
          onRetry={statsQ.refetch}
        />
        <KpiCard
          label="Total members"
          value={formatNum(stats?.total_members)}
          secondaryLead="Across"
          secondary={plural(stats?.total_gyms ?? gyms.length, 'gym')}
          leadTone="muted"
          loading={statsQ.loading}
          error={statsQ.error}
          onRetry={statsQ.refetch}
        />
        <KpiCard
          label="Monthly recurring"
          value={formatINRCompact(stats?.mrr_inr)}
          secondaryLead={stats?.past_due_inr ? formatINR(stats.past_due_inr) : '—'}
          secondary={stats?.past_due_inr ? 'past due' : 'nothing past due'}
          loading={statsQ.loading}
          error={statsQ.error}
          onRetry={statsQ.refetch}
        />
      </div>

      {/* Dunning: the one thing worth interrupting the operator for. */}
      {stats?.past_due_gyms > 0 && status !== 'past_due' && (
        <button
          type="button"
          onClick={() => setParam('status', 'past_due')}
          className={`flex items-center gap-2.5 rounded-lg border border-sa-warning-line bg-sa-warning-soft px-3.5 py-3
            text-left text-sm font-medium text-sa-warning hover:brightness-[.98] ${FOCUS}`}
        >
          <TriangleAlert aria-hidden="true" size={18} className="shrink-0" />
          <span className="min-w-0 flex-1">
            {plural(stats.past_due_gyms, 'gym')} past due
            {stats.past_due_inr ? ` · ${formatINR(stats.past_due_inr)}/mo at risk` : ''}
          </span>
          <ChevronRight aria-hidden="true" size={18} className="shrink-0" />
        </button>
      )}

      {/* ── Gyms ── */}
      <Card>
        <CardHeader
          title="Gyms"
          count={gymsQ.loading ? null : isFiltered
            ? `${formatNum(filtered.length)} of ${formatNum(gyms.length)}`
            : `${formatNum(gyms.length)} total`}
        />

        <div className="flex flex-col gap-2 p-4 md:p-5">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-[minmax(180px,1fr)_repeat(5,minmax(0,140px))]">
            <SearchInput
              value={q}
              onChange={(v) => setParam('q', v)}
              placeholder="Search gym, owner or city"
              label="Search gyms"
              className="col-span-2 md:col-span-4 lg:col-span-1"
            />
            <FilterSelect
              label="Filter by plan"
              value={plan}
              onChange={(v) => setParam('plan', v)}
              options={[{ value: '', label: 'All plans' }, ...plans.map((p) => ({ value: p.id, label: p.name }))]}
            />
            <FilterSelect
              label="Filter by status"
              value={status}
              onChange={(v) => setParam('status', v)}
              options={[
                { value: '', label: 'All statuses' },
                ...GYM_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
              ]}
            />
            <FilterSelect
              label="Filter by city"
              value={city}
              onChange={(v) => setParam('city', v)}
              options={[{ value: '', label: 'All cities' }, ...cities.map((c) => ({ value: c, label: c }))]}
            />
            <FilterSelect
              label="Filter by health"
              value={health}
              onChange={(v) => setParam('health', v)}
              options={HEALTH_OPTIONS.map((o) => (
                o.value === '' && atRisk ? { ...o, label: `All health · ${atRisk} at risk` } : o
              ))}
            />
            <FilterSelect
              label="Sort gyms"
              value={sort}
              onChange={(v) => setParam('sort', v)}
              options={SORTS}
              allValue="newest"
            />
          </div>

          {isFiltered && (
            <div className="flex flex-wrap items-center gap-1.5">
              {q && <FilterChip onRemove={() => setParam('q', '')} removeLabel={`Remove filter ${q}`}>“{q}”</FilterChip>}
              {plan && <FilterChip onRemove={() => setParam('plan', '')} removeLabel="Remove plan filter">Plan: {planName(plan)}</FilterChip>}
              {status && <FilterChip onRemove={() => setParam('status', '')} removeLabel="Remove status filter">Status: {STATUS_LABEL[status]}</FilterChip>}
              {city && <FilterChip onRemove={() => setParam('city', '')} removeLabel="Remove city filter">City: {city}</FilterChip>}
              {health && <FilterChip onRemove={() => setParam('health', '')} removeLabel="Remove health filter">Health: {HEALTH_OPTIONS.find((h) => h.value === health)?.label}</FilterChip>}
              <button
                type="button"
                onClick={clearFilters}
                className={`rounded px-1 text-[13px] font-medium text-sa-ink-3 underline underline-offset-2 hover:text-sa-ink ${FOCUS}`}
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {gymsQ.loading ? (
          <GymListSkeleton />
        ) : gymsQ.error ? (
          <ErrorState
            title="Couldn’t load gyms"
            body="Something went wrong while fetching the gyms list. Check your connection and try again."
            onRetry={gymsQ.refetch}
          />
        ) : gyms.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No gyms yet"
            body="Gyms appear here as soon as an owner signs up for Gymly."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={q ? `No gyms match “${q}”` : 'No gyms match these filters'}
            body="Try a different name, owner or city, or clear your filters."
            action={(
              <button
                type="button"
                onClick={clearFilters}
                className={`h-11 rounded-lg border border-sa-line-strong bg-sa-surface px-4 text-sm font-semibold hover:bg-sa-canvas md:h-10 ${FOCUS}`}
              >
                Clear filters
              </button>
            )}
          />
        ) : (
          <>
            <GymTable rows={pageRows} planName={planName} onOpen={openGym} />
            <GymCards rows={pageRows} planName={planName} onOpen={openGym} />
            <Pagination
              page={safePage}
              pages={pages}
              total={filtered.length}
              pageSize={PAGE_SIZE}
              onChange={(p) => setParam('page', String(p))}
            />
          </>
        )}
      </Card>
    </div>
  );
}

// ── Table (md+) ────────────────────────────────────────────────────────────
// Tablet drops the City column and folds the city under the gym name.
const GRID = 'grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_76px] '
  + 'lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_88px]';

function GymTable({ rows, planName, onOpen }) {
  return (
    <div role="table" className="hidden md:block">
      <div
        role="row"
        className={`sticky top-0 z-[2] grid ${GRID} h-10 items-center gap-4 border-b border-sa-line-soft
          bg-sa-subtle px-5 text-xs font-semibold uppercase tracking-[.04em] text-[#5B606B]`}
      >
        <span role="columnheader" className="truncate">Gym</span>
        <span role="columnheader" className="hidden truncate lg:block">City</span>
        <span role="columnheader" className="truncate">Owner</span>
        <span role="columnheader" className="truncate">Plan</span>
        <span role="columnheader" className="truncate">Status</span>
        <span role="columnheader" className="truncate">Health</span>
        <span role="columnheader" className="truncate text-right">Members</span>
      </div>

      {rows.map((g) => {
        const h = healthOf(g);
        return (
          <div
            key={g.id}
            role="row"
            tabIndex={0}
            onClick={() => onOpen(g.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(g.id); }
            }}
            className={`grid ${GRID} min-h-14 cursor-pointer items-center gap-4 border-t border-sa-line-soft
              px-5 py-2 hover:bg-[#FAFAF7] ${FOCUS}`}
          >
            <span role="cell" className="min-w-0">
              <span className="block truncate text-sm font-semibold">{g.name}</span>
              <span className="block truncate text-xs text-sa-ink-3 lg:hidden">{g.city || '—'}</span>
            </span>
            <span role="cell" className="hidden min-w-0 truncate text-sm text-sa-ink-2 lg:block">{g.city || '—'}</span>
            <span role="cell" className="min-w-0 truncate text-sm text-sa-ink-2">{g.ownerName || '—'}</span>
            <span role="cell" className="min-w-0"><PlanBadge>{planName(g.planId)}</PlanBadge></span>
            <span role="cell" className="min-w-0"><StatusBadge status={g.status} /></span>
            <span role="cell" className="min-w-0"><HealthBadge level={h.level} /></span>
            <span role="cell" className="truncate text-right text-sm font-semibold tabular-nums">
              {formatNum(g.memberCount)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Cards (mobile) ─────────────────────────────────────────────────────────
function GymCards({ rows, planName, onOpen }) {
  return (
    <div className="md:hidden">
      {rows.map((g) => (
        <button
          key={g.id}
          type="button"
          onClick={() => onOpen(g.id)}
          className={`flex w-full flex-col gap-1.5 border-t border-sa-line-soft px-4 py-3.5 text-left active:bg-sa-canvas ${FOCUS}`}
        >
          <span className="flex items-start justify-between gap-2">
            <span className="min-w-0 truncate text-[15px] font-semibold leading-5">{g.name}</span>
            <StatusBadge status={g.status} className="shrink-0" />
          </span>
          <span className="truncate text-[13px] leading-[18px] text-sa-ink-2">
            {[g.city, g.ownerName].filter(Boolean).join(' · ') || '—'}
          </span>
          <span className="flex items-center justify-between gap-2">
            <PlanBadge>{planName(g.planId)}</PlanBadge>
            <span className="shrink-0 text-[13px] text-sa-ink-2">
              <span className="font-semibold tabular-nums text-sa-ink">{formatNum(g.memberCount)}</span> members
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function GymListSkeleton() {
  return (
    <div aria-busy="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-t border-sa-line-soft px-4 py-4 md:px-5">
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="hidden h-4 w-24 md:block" />
          <Skeleton className="h-[22px] w-20 rounded-full" />
          <Skeleton className="hidden h-4 w-12 md:block" />
        </div>
      ))}
    </div>
  );
}
