// src/superadmin/screens/GymDetail.jsx
// Read-only oversight for one gym, plus the Phase-2 control actions.
//
// Member data is AGGREGATE ONLY. Nothing on this screen reads an individual
// member document — the member summary comes from gyms/{id}/stats/summary,
// which a Cloud Function maintains. (README §7.2, §12.)

import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Phone, Mail, TriangleAlert, Users, Eye, CircleCheck,
} from 'lucide-react';
import useAsync from '../hooks/useAsync';
import {
  fetchGym, fetchGymMemberStats, fetchGymBilling, fetchPlans,
  assignPlan, setTrial, setGymStatus, markSubscriptionPaid,
} from '../lib/api';
import {
  formatNum, formatINR, formatDate, formatPhone, daysBetween, plural, getInitials,
} from '../lib/format';
import { healthOf } from '../lib/status';
import Button, { FOCUS } from '../components/Button';
import { Card, SectionLabel, StatTile, DefRow } from '../components/Card';
import { StatusBadge, HealthBadge } from '../components/Badges';
import {
  EmptyState, ErrorState, InlineSectionError, NotFound, Skeleton,
} from '../components/States';
import { useSaToast } from '../components/Toast';
import { ResponsiveDialog } from '../components/Overlays';
import { TextInput, FilterSelect, CurrencyInput } from '../components/Inputs';
import ViewAsOwner from '../../pages/Admin/ViewAsOwner';

// Static map — Tailwind's JIT can't see a class name built by interpolation.
const HEALTH_DOT = {
  healthy: 'bg-sa-success-dot',
  watch: 'bg-sa-warning-dot',
  at_risk: 'bg-sa-danger-dot',
};

export default function GymDetail() {
  const { gymId } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { showToast } = useSaToast();

  const gymQ = useAsync(() => fetchGym(gymId), [gymId]);
  const statsQ = useAsync(() => fetchGymMemberStats(gymId), [gymId]);
  const billingQ = useAsync(() => fetchGymBilling(gymId), [gymId], { initial: [] });
  const plansQ = useAsync(fetchPlans, [], { initial: [] });
  // Stable across renders, unlike the query objects themselves.
  const refetchGym = gymQ.refetch;
  const refetchBilling = billingQ.refetch;

  const [showAllPayments, setShowAllPayments] = useState(false);
  const [action, setAction] = useState(null);
  const [viewAsOwner, setViewAsOwner] = useState(false);

  const gym = gymQ.data;
  const plans = plansQ.data || [];
  const payments = billingQ.data || [];

  // Preserve the dashboard's filters on the way back.
  const backToDashboard = useCallback(() => {
    const qs = params.toString();
    navigate(qs ? `/admin?${qs}` : '/admin');
  }, [navigate, params]);

  const onActionDone = useCallback((message) => {
    setAction(null);
    showToast(message, 'success');
    refetchGym();
    refetchBilling();
  }, [showToast, refetchGym, refetchBilling]);

  if (gymQ.loading) return <GymDetailSkeleton />;

  if (gymQ.error) {
    return (
      <Card>
        <ErrorState
          title="Couldn’t load this gym"
          body="Something went wrong while fetching the gym. Check your connection and try again."
          onRetry={gymQ.refetch}
        />
      </Card>
    );
  }

  if (!gym) {
    return (
      <NotFound
        title="Gym not found"
        body="This gym may have been removed, or the link is incorrect."
        action={<Button variant="primary" onClick={backToDashboard}>Back to dashboard</Button>}
      />
    );
  }

  const planName = plans.find((p) => p.id === gym.planId)?.name || gym.planId;
  const health = healthOf(gym);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <button
        type="button"
        onClick={backToDashboard}
        className={`hidden h-9 w-fit items-center gap-1.5 rounded-lg px-2 -ml-2 text-sm font-medium
          text-sa-ink-2 hover:bg-sa-muted hover:text-sa-ink md:inline-flex ${FOCUS}`}
      >
        <ArrowLeft aria-hidden="true" size={16} />
        Dashboard
      </button>

      {/* ── Header ── */}
      <header className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="min-w-0 text-xl font-semibold leading-7 tracking-[-0.01em] md:text-2xl md:leading-8">
            {gym.name}
          </h1>
          <StatusBadge status={gym.status} />
          <HealthBadge level={health.level} />
        </div>
        <p className="text-sm text-sa-ink-3">
          {[gym.city, gym.createdAt && `Joined ${formatDate(gym.createdAt)}`].filter(Boolean).join(' · ')}
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <OwnerCard gym={gym} />
        <SubscriptionCard gym={gym} planName={planName} />
      </div>

      {/* ── Controls ── */}
      <Card className="p-4 md:p-5">
        <SectionLabel>Controls</SectionLabel>
        <p className="mt-1.5 text-[13px] text-sa-ink-3">
          Every action here is recorded in the audit log.
        </p>
        <div className="mt-3.5 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setViewAsOwner(true)}>
            <Eye aria-hidden="true" size={16} />
            View as owner
          </Button>
          {['past_due', 'suspended', 'cancelled'].includes(gym.rawStatus) && (
            <Button variant="primary" onClick={() => setAction('mark_paid')}>
              <CircleCheck aria-hidden="true" size={16} />
              Mark as paid
            </Button>
          )}
          <Button variant="secondary" onClick={() => setAction('assign_plan')}>Change plan</Button>
          <Button variant="secondary" onClick={() => setAction('extend_trial')}>Extend trial</Button>
          <Button variant="secondary" onClick={() => setAction('expire_trial')}>Expire trial</Button>
          {gym.rawStatus === 'suspended' ? (
            <Button variant="secondary" onClick={() => setAction('reactivate')}>Reactivate</Button>
          ) : (
            <Button variant="danger" onClick={() => setAction('suspend')}>Suspend</Button>
          )}
        </div>
        {health.reasons.length > 0 && (
          <ul className="mt-3.5 flex flex-col gap-1 border-t border-sa-line-soft pt-3.5">
            {health.reasons.map((r) => (
              <li key={r} className="flex items-start gap-2 text-[13px] text-sa-ink-2">
                <span aria-hidden="true" className={`mt-1.5 size-1.5 shrink-0 rounded-full ${HEALTH_DOT[health.level]}`} />
                {r}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <PaymentsCard
        query={billingQ}
        payments={payments}
        showAll={showAllPayments}
        onToggleAll={() => setShowAllPayments((v) => !v)}
        isTrial={gym.isTrial}
      />

      <MemberSummaryCard query={statsQ} gym={gym} />

      <ActionDialog
        key={action || 'none'}
        action={action}
        gym={gym}
        plans={plans}
        onClose={() => setAction(null)}
        onDone={onActionDone}
        onError={(msg) => showToast(msg, 'error')}
      />

      <AnimatePresence>
        {viewAsOwner && <ViewAsOwner gym={gym} onClose={() => setViewAsOwner(false)} />}
      </AnimatePresence>
    </div>
  );
}

// ── Owner ──────────────────────────────────────────────────────────────────
function OwnerCard({ gym }) {
  const phone = gym.ownerPhone;
  const email = gym.ownerEmail;

  return (
    <Card className="flex flex-col p-4 md:p-5">
      <SectionLabel>Owner</SectionLabel>

      <div className="mt-3 flex items-center gap-3">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sa-muted text-sm font-semibold text-sa-ink-2">
          {getInitials(gym.ownerName)}
        </span>
        <p className="min-w-0 truncate text-base font-semibold leading-6">{gym.ownerName || 'Unknown owner'}</p>
      </div>

      <div className="mt-3 flex flex-col">
        {phone ? (
          <a
            href={`tel:+91${String(phone).replace(/\D/g, '').slice(-10)}`}
            className={`flex h-11 items-center gap-2.5 border-t border-sa-line-soft text-sm text-sa-ink-2 hover:text-sa-accent-ink ${FOCUS}`}
          >
            <Phone aria-hidden="true" size={18} className="shrink-0 text-sa-ink-3" />
            <span className="truncate tabular-nums">{formatPhone(phone)}</span>
          </a>
        ) : (
          <p className="flex h-11 items-center gap-2.5 border-t border-sa-line-soft text-sm text-sa-ink-3">
            <Phone aria-hidden="true" size={18} className="shrink-0" />
            No phone on file
          </p>
        )}

        {email ? (
          <a
            href={`mailto:${email}`}
            className={`flex h-11 items-center gap-2.5 border-t border-sa-line-soft text-sm text-sa-ink-2 hover:text-sa-accent-ink ${FOCUS}`}
          >
            <Mail aria-hidden="true" size={18} className="shrink-0 text-sa-ink-3" />
            <span className="truncate">{email}</span>
          </a>
        ) : (
          <p className="flex h-11 items-center gap-2.5 border-t border-sa-line-soft text-sm text-sa-ink-3">
            <Mail aria-hidden="true" size={18} className="shrink-0" />
            No email on file
          </p>
        )}
      </div>
    </Card>
  );
}

// ── Subscription ───────────────────────────────────────────────────────────
function SubscriptionCard({ gym, planName }) {
  const endAt = gym.isTrial ? gym.trialEndDate : gym.endAt;
  const days = endAt ? daysBetween(new Date(), endAt) : null;

  let banner = null;
  if (days != null) {
    if (days < 0) {
      banner = {
        tone: 'bg-sa-danger-soft border-sa-danger-line text-sa-danger',
        icon: true,
        head: `Expired ${plural(Math.abs(days), 'day')} ago`,
        sub: 'Access is limited until the gym renews.',
      };
    } else if (days === 0) {
      banner = {
        tone: 'bg-sa-warning-soft border-sa-warning-line text-sa-warning',
        icon: true,
        head: 'Expires today',
        sub: gym.isTrial ? 'Trial ends today.' : 'Renewal is due today.',
      };
    } else if (days < 7) {
      banner = {
        tone: 'bg-sa-warning-soft border-sa-warning-line text-sa-warning',
        icon: true,
        head: `${plural(days, 'day')} remaining`,
        sub: gym.isTrial ? 'Trial ends soon.' : 'Renewal is due soon.',
      };
    } else {
      banner = {
        tone: 'bg-sa-canvas border-sa-line text-sa-ink-2',
        icon: false,
        head: `${plural(days, 'day')} remaining`,
        sub: null,
      };
    }
  }

  return (
    <Card className="flex flex-col p-4 md:p-5">
      <SectionLabel right={gym.isTrial ? <StatusBadge tone="info" label="Free trial" /> : null}>
        Subscription
      </SectionLabel>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="min-w-0 truncate text-lg font-semibold leading-[26px]">{planName}</p>
        <p className="shrink-0 text-sm font-medium tabular-nums text-sa-ink-2">
          {formatINR(gym.monthlyInr)}<span className="text-sa-ink-3">/month</span>
        </p>
      </div>

      <dl className="mt-3.5 grid grid-cols-2 gap-3">
        <DefRow label={gym.isTrial ? 'Trial started' : 'Started'} value={formatDate(gym.startAt)} />
        <DefRow
          label={gym.isTrial ? 'Trial ends' : (days != null && days < 0 ? 'Expired on' : 'Renews on')}
          value={formatDate(endAt)}
        />
      </dl>

      {gym.failedPayments > 0 && (
        <p className="mt-3 text-[13px] font-medium text-sa-danger">
          {plural(gym.failedPayments, 'failed payment')} on record
        </p>
      )}

      {banner && (
        <div className={`mt-3.5 flex items-start gap-2 rounded-lg border px-3 py-2.5 ${banner.tone}`}>
          {banner.icon && <TriangleAlert aria-hidden="true" size={16} className="mt-0.5 shrink-0" />}
          <span className="min-w-0 text-[13px] leading-[18px]">
            <span className="font-semibold">{banner.head}</span>
            {banner.sub && <> · {banner.sub}</>}
          </span>
        </div>
      )}
    </Card>
  );
}

// ── Payments to Gymly ──────────────────────────────────────────────────────
function PaymentsCard({ query, payments, showAll, onToggleAll, isTrial }) {
  const totalPaid = useMemo(() => payments.reduce((sum, p) => sum + p.amount, 0), [payments]);
  const last = payments[0];
  const visible = showAll ? payments : payments.slice(0, 6);

  return (
    <Card>
      <div className="p-4 pb-0 md:p-5 md:pb-0">
        <SectionLabel>Payments to Gymly</SectionLabel>
      </div>

      {query.loading ? (
        <div className="p-4 md:p-5" aria-busy="true">
          <Skeleton className="h-[72px] w-full" />
          <Skeleton className="mt-3 h-[120px] w-full" />
        </div>
      ) : query.error ? (
        <InlineSectionError message="Couldn’t load payment history" onRetry={query.refetch} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 p-4 md:p-5">
            <StatTile label="Total paid to date" value={formatINR(totalPaid)} />
            <StatTile
              label="Last payment"
              value={last ? formatINR(last.amount) : '—'}
              sub={last ? `on ${formatDate(last.paidAt)}` : undefined}
            />
          </div>

          {payments.length === 0 ? (
            <div className="px-4 pb-4 md:px-5 md:pb-5">
              <p className="rounded-lg bg-sa-subtle px-3.5 py-3 text-[13px] text-sa-ink-3">
                {isTrial
                  ? 'No payments yet — this gym is on a free trial.'
                  : 'No payments recorded against this gym yet.'}
              </p>
            </div>
          ) : (
            <>
              {/* Table (md+) */}
              <div role="table" className="hidden border-t border-sa-line-soft md:block">
                <div
                  role="row"
                  className="grid h-10 grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_96px] items-center
                    gap-4 border-b border-sa-line-soft bg-sa-subtle px-5 text-xs font-semibold uppercase tracking-[.04em] text-[#5B606B]"
                >
                  <span role="columnheader">Date</span>
                  <span role="columnheader">Amount</span>
                  <span role="columnheader">Method</span>
                  <span role="columnheader">Status</span>
                </div>
                {visible.map((p) => (
                  <div
                    key={p.id}
                    role="row"
                    className="grid h-11 grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_96px] items-center gap-4 border-t border-sa-line-soft px-5"
                  >
                    <span role="cell" className="truncate text-sm tabular-nums text-sa-ink-2">{formatDate(p.paidAt)}</span>
                    <span role="cell" className="truncate text-sm font-semibold tabular-nums">{formatINR(p.amount)}</span>
                    <span role="cell" className="truncate text-sm capitalize text-sa-ink-2">{p.planName || p.method}</span>
                    <span role="cell"><StatusBadge status={p.status} /></span>
                  </div>
                ))}
              </div>

              {/* Rows (mobile) */}
              <div className="border-t border-sa-line-soft md:hidden">
                {visible.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 border-t border-sa-line-soft px-4 py-2.5 first:border-t-0">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium tabular-nums">{formatDate(p.paidAt)}</span>
                      <span className="block truncate text-xs capitalize text-sa-ink-3">{p.planName || p.method}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums">{formatINR(p.amount)}</span>
                      <StatusBadge status={p.status} size="sm" />
                    </span>
                  </div>
                ))}
              </div>

              {payments.length > 6 && (
                <button
                  type="button"
                  onClick={onToggleAll}
                  className={`w-full border-t border-sa-line-soft py-3 text-sm font-semibold text-sa-accent-ink hover:bg-sa-accent-tint ${FOCUS}`}
                >
                  {showAll ? 'Show fewer' : `Show all ${payments.length} payments`}
                </button>
              )}
            </>
          )}
        </>
      )}
    </Card>
  );
}

// ── Member summary (aggregates only) ───────────────────────────────────────
function MemberSummaryCard({ query, gym }) {
  const s = query.data;

  return (
    <Card className="p-4 md:p-5">
      <SectionLabel right={<span className="text-xs text-sa-ink-3">Aggregates only · no individual member data</span>}>
        Member summary
      </SectionLabel>

      {query.loading ? (
        <div className="mt-3.5 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5" aria-busy="true">
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-[76px]" />)}
        </div>
      ) : query.error ? (
        <InlineSectionError message="Couldn’t load member stats" onRetry={query.refetch} />
      ) : !s ? (
        <EmptyState
          icon={Users}
          title="No stats yet"
          body="Member aggregates appear once this gym records its first member."
        />
      ) : (
        <>
          <div className="mt-3.5 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
            <StatTile label="Total members" value={formatNum(s.totalMembers)} sub="All time" />
            <StatTile
              label="Active"
              value={formatNum(s.activeMembers)}
              sub={s.totalMembers ? `${Math.round((s.activeMembers / s.totalMembers) * 100)}% of total` : '—'}
            />
            <StatTile label="Expired" value={formatNum(s.expiredMembers)} sub="Membership lapsed" />
            <StatTile
              label="Expiring in 7 days"
              value={formatNum(s.expiring7d)}
              sub="Renewal window"
            />
            <StatTile label="Revenue this month" value={formatINR(s.monthRevenue)} sub="Collected from members" />
          </div>

          <MemberHistoryChart history={s.history} total={gym.memberCount} />
        </>
      )}
    </Card>
  );
}

/**
 * Six flex bars, no chart library. `member_history` is written by the
 * recordMemberHistory Cloud Function; gyms that predate it show the
 * explanatory note instead of a misleading empty chart.
 */
function MemberHistoryChart({ history }) {
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const bars = useMemo(() => {
    if (!Array.isArray(history) || history.length === 0) return null;
    return history.slice(-6).map((h) => {
      const [y, m] = String(h.month || '').split('-');
      return { label: MON[Number(m) - 1] || '—', year: y, value: Number(h.count) || 0 };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history]);

  if (!bars) {
    return (
      <div className="mt-4 rounded-lg border border-sa-line-soft bg-sa-subtle px-3.5 py-3">
        <p className="text-[13px] font-medium text-sa-ink-2">Members, last 6 months</p>
        <p className="mt-0.5 text-[13px] text-sa-ink-3">
          No history recorded yet. The first monthly snapshot is taken at the end of this month.
        </p>
      </div>
    );
  }

  const max = Math.max(...bars.map((b) => b.value), 1);
  const summary = bars.map((b) => `${b.label}: ${b.value}`).join(', ');

  return (
    <figure className="mt-4">
      <figcaption className="text-[13px] font-medium text-sa-ink-2">Members, last 6 months</figcaption>
      <div
        role="img"
        aria-label={`Members over the last six months. ${summary}.`}
        className="mt-2.5 flex h-[150px] items-end justify-between gap-2"
      >
        {bars.map((b, i) => (
          <div key={`${b.year}-${b.label}`} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <span className="text-xs tabular-nums text-sa-ink-3">{formatNum(b.value)}</span>
            <span
              aria-hidden="true"
              style={{ height: `${16 + (b.value / max) * 84}px` }}
              className={`w-full max-w-11 rounded-b-sm rounded-t-md ${i === bars.length - 1 ? 'bg-sa-accent' : 'bg-[#BFDDD0]'}`}
            />
            <span className="text-xs text-sa-ink-3">{b.label}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

// ── Control actions ────────────────────────────────────────────────────────
const ACTION_META = {
  assign_plan: { title: 'Change plan', confirm: 'Change plan' },
  extend_trial: { title: 'Extend trial', confirm: 'Extend trial' },
  expire_trial: { title: 'Expire trial', confirm: 'Expire trial' },
  suspend: { title: 'Suspend gym', confirm: 'Suspend gym', destructive: true },
  reactivate: { title: 'Reactivate gym', confirm: 'Reactivate' },
  mark_paid: { title: 'Mark as paid', confirm: 'Mark as paid' },
};

function ActionDialog({ action, gym, plans, onClose, onDone, onError }) {
  // Remounted by its `key` whenever a different action opens, so the form
  // state below resets without an effect.
  const activePlans = plans.filter((p) => p.isActive);
  const [planId, setPlanId] = useState(() => activePlans[0]?.id || '');
  const [days, setDays] = useState('7');
  const [amount, setAmount] = useState(() => String(gym.monthlyInr || ''));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const meta = ACTION_META[action];
  const open = !!action;

  const submit = async () => {
    setSaving(true);
    try {
      if (action === 'assign_plan') {
        if (!planId) { setSaving(false); return; }
        await assignPlan({ gymId: gym.id, planId, reason });
        onDone(`Plan changed to ${plans.find((p) => p.id === planId)?.name || planId}`);
      } else if (action === 'extend_trial') {
        await setTrial({ gymId: gym.id, days: Number(days), reason });
        onDone(`Trial extended by ${plural(Number(days), 'day')}`);
      } else if (action === 'expire_trial') {
        await setTrial({ gymId: gym.id, expire: true, reason });
        onDone('Trial expired');
      } else if (action === 'suspend') {
        await setGymStatus({ gymId: gym.id, status: 'suspended', reason });
        onDone('Gym suspended');
      } else if (action === 'reactivate') {
        await setGymStatus({ gymId: gym.id, status: 'active', reason });
        onDone('Gym reactivated');
      } else if (action === 'mark_paid') {
        await markSubscriptionPaid({ gymId: gym.id, amount: Number(amount) || undefined, reason });
        onDone('Marked as paid and reactivated');
      }
    } catch (e) {
      onError(e?.message || 'Action failed');
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      closeDisabled={saving}
      title={meta.title}
      sub={gym.name}
      labelledBy="sa-action-title"
      variant="sheet"
      footer={(
        <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            variant={meta.destructive ? 'danger' : 'primary'}
            onClick={submit}
            loading={saving}
            loadingLabel="Working…"
          >
            {meta.confirm}
          </Button>
        </div>
      )}
    >
      {action === 'assign_plan' && (
        activePlans.length === 0 ? (
          <p className="text-sm text-sa-ink-2">No active plans. Create one under Plans first.</p>
        ) : (
          <FilterSelect
            label="Plan"
            value={planId}
            onChange={setPlanId}
            allValue="__none__"
            options={activePlans.map((p) => ({ value: p.id, label: `${p.name} · ${formatINR(p.monthlyInr)}/mo` }))}
          />
        )
      )}

      {action === 'extend_trial' && (
        <TextInput
          label="Days to extend"
          type="number"
          min={1}
          max={365}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          className="max-w-[180px]"
        />
      )}

      {action === 'mark_paid' && (
        <>
          <p className="text-sm text-sa-ink-2">
            Records a payment, reactivates the subscription and clears the failed-payment counter.
          </p>
          <CurrencyInput label="Amount received" value={amount} onChange={setAmount} />
        </>
      )}

      {action === 'suspend' && (
        <p className="text-sm text-sa-ink-2">
          Suspends the subscription state. The owner app is <strong>not</strong> blocked in this phase.
        </p>
      )}

      {(action === 'expire_trial' || action === 'reactivate') && (
        <p className="text-sm text-sa-ink-2">
          Confirm {meta.title.toLowerCase()} for <strong>{gym.name}</strong>?
        </p>
      )}

      <TextInput
        label="Reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Optional — stored in the audit log"
      />
    </ResponsiveDialog>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────
function GymDetailSkeleton() {
  return (
    <div className="flex flex-col gap-4 md:gap-6" aria-busy="true">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-40" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-[168px] rounded-xl" />
        <Skeleton className="h-[168px] rounded-xl" />
      </div>
      <Skeleton className="h-[220px] rounded-xl" />
    </div>
  );
}
