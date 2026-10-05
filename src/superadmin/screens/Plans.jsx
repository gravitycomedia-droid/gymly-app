// src/superadmin/screens/Plans.jsx
// The Gymly subscription tiers gyms can subscribe to. The Plan ID is the
// Firestore doc id, which is what makes it unique and immutable — hence the
// lock in edit mode (README §7.4).

import { useCallback, useMemo, useState } from 'react';
import { Layers, Plus, PencilLine, TriangleAlert } from 'lucide-react';
import useAsync from '../hooks/useAsync';
import { fetchPlans, fetchGyms, upsertPlan, setPlanActive, seedDefaultPlans } from '../lib/api';
import { formatINR, formatNum, plural } from '../lib/format';
import { PageHeader } from '../SuperAdminLayout';
import Button, { FOCUS } from '../components/Button';
import { Card } from '../components/Card';
import {
  SegmentedControl, FilterSelect, Switch, TextInput, CurrencyInput, LockedInput, FieldLabel,
} from '../components/Inputs';
import { EmptyState, ErrorState, Skeleton } from '../components/States';
import { ResponsiveDialog, useConfirm } from '../components/Overlays';
import { useSaToast } from '../components/Toast';

const SORTS = [
  { value: 'amount_asc', label: 'Amount low→high' },
  { value: 'amount_desc', label: 'Amount high→low' },
  { value: 'name', label: 'Name A–Z' },
];

const ID_RE = /^[a-z0-9_]+$/;
const NAME_MAX = 40;

export default function Plans() {
  const plansQ = useAsync(fetchPlans, [], { initial: [] });
  const gymsQ = useAsync(fetchGyms, [], { initial: [] });
  // Stable across renders, unlike the query objects themselves.
  const { refetch: refetchPlans, setData: setPlansData } = plansQ;
  const { showToast } = useSaToast();
  const confirm = useConfirm();

  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('amount_asc');
  const [editor, setEditor] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  const plans = plansQ.data || [];
  const gyms = gymsQ.data || [];

  // One pass over the already-loaded gym list beats a getCountFromServer per
  // plan, and the dashboard has the same data in memory anyway.
  const gymCounts = useMemo(() => {
    const m = new Map();
    gyms.forEach((g) => m.set(g.planId, (m.get(g.planId) || 0) + 1));
    return m;
  }, [gyms]);

  const counts = useMemo(() => ({
    all: plans.length,
    active: plans.filter((p) => p.isActive).length,
    inactive: plans.filter((p) => !p.isActive).length,
  }), [plans]);

  const visible = useMemo(() => {
    const rows = plans.filter((p) => (
      filter === 'all' || (filter === 'active' ? p.isActive : !p.isActive)
    ));
    const sorted = [...rows];
    if (sort === 'amount_desc') sorted.sort((a, b) => b.monthlyInr - a.monthlyInr);
    else if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else sorted.sort((a, b) => a.monthlyInr - b.monthlyInr);
    return sorted;
  }, [plans, filter, sort]);

  const toggleActive = useCallback(async (plan) => {
    const next = !plan.isActive;
    const gymCount = gymCounts.get(plan.id) || 0;

    if (!next && gymCount > 0) {
      const ok = await confirm({
        icon: TriangleAlert,
        destructive: true,
        title: `Deactivate ${plan.name}?`,
        body: `${plural(gymCount, 'gym')} ${gymCount === 1 ? 'is' : 'are'} on this plan. They keep it until renewal; new gyms can’t select it.`,
        confirmLabel: 'Deactivate plan',
      });
      if (!ok) return;
    }

    setTogglingId(plan.id);
    try {
      await setPlanActive(plan.id, next);
      setPlansData((rows) => rows.map((p) => (p.id === plan.id ? { ...p, isActive: next } : p)));
      showToast(`${plan.name} ${next ? 'activated' : 'deactivated'}`);
    } catch (e) {
      showToast(e?.message || 'Couldn’t update the plan', 'error');
    } finally {
      setTogglingId(null);
    }
  }, [gymCounts, confirm, setPlansData, showToast]);

  const onSaved = useCallback(async (message) => {
    setEditor(null);
    await refetchPlans();
    showToast(message);
  }, [refetchPlans, showToast]);

  const newPlanButton = (
    <Button variant="primary" onClick={() => setEditor({ mode: 'new' })}>
      <Plus aria-hidden="true" size={16} />
      New plan
    </Button>
  );

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <PageHeader
        title="Plans"
        subtitle="Gymly subscription plans that gyms can choose from."
        right={newPlanButton}
      />

      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <SegmentedControl
          ariaLabel="Filter plans"
          value={filter}
          onChange={setFilter}
          className="w-full md:max-w-[360px]"
          items={[
            { value: 'all', label: 'All', count: counts.all },
            { value: 'active', label: 'Active', count: counts.active },
            { value: 'inactive', label: 'Inactive', count: counts.inactive },
          ]}
        />
        <FilterSelect
          label="Sort plans"
          value={sort}
          onChange={setSort}
          options={SORTS}
          allValue="amount_asc"
          className="md:w-[200px]"
        />
      </div>

      <div className="md:hidden">
        <Button variant="primary" className="w-full" onClick={() => setEditor({ mode: 'new' })}>
          <Plus aria-hidden="true" size={16} />
          New plan
        </Button>
      </div>

      {plansQ.loading ? (
        <Card aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 border-t border-sa-line-soft px-4 py-4 first:border-t-0 md:px-5">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-6 w-10 rounded-full" />
            </div>
          ))}
        </Card>
      ) : plansQ.error ? (
        <Card>
          <ErrorState
            title="Couldn’t load plans"
            body="Something went wrong while fetching the plans. Check your connection and try again."
            onRetry={plansQ.refetch}
          />
        </Card>
      ) : plans.length === 0 ? (
        <Card>
          <EmptyState
            icon={Layers}
            title="No plans yet"
            body="Create your first plan so gyms can subscribe to Gymly."
            action={(
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="primary" onClick={() => setEditor({ mode: 'new' })}>Create plan</Button>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    try {
                      const r = await seedDefaultPlans();
                      await plansQ.refetch();
                      showToast(`${plural(r?.created ?? 0, 'default plan')} created`);
                    } catch (e) {
                      showToast(e?.message || 'Couldn’t seed the default plans', 'error');
                    }
                  }}
                >
                  Seed default plans
                </Button>
              </div>
            )}
          />
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={Layers}
            title={`No ${filter} plans`}
            body={`None of your plans are currently ${filter}.`}
            action={<Button variant="secondary" onClick={() => setFilter('all')}>Show all plans</Button>}
          />
        </Card>
      ) : (
        <Card>
          <PlansTable
            rows={visible}
            gymCounts={gymCounts}
            togglingId={togglingId}
            onToggle={toggleActive}
            onEdit={(p) => setEditor({ mode: 'edit', plan: p })}
          />
          <PlansCards
            rows={visible}
            gymCounts={gymCounts}
            togglingId={togglingId}
            onToggle={toggleActive}
            onEdit={(p) => setEditor({ mode: 'edit', plan: p })}
          />
        </Card>
      )}

      {editor && (
        <PlanEditor
          key={editor.mode === 'edit' ? editor.plan.id : 'new'}
          editor={editor}
          existingIds={plans.map((p) => p.id)}
          onClose={() => setEditor(null)}
          onSaved={onSaved}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}
    </div>
  );
}

const PLAN_GRID = 'grid-cols-[minmax(0,1.4fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,.7fr)_minmax(0,1.1fr)_88px]';

function PlansTable({ rows, gymCounts, togglingId, onToggle, onEdit }) {
  return (
    <div role="table" className="hidden md:block">
      <div
        role="row"
        className={`grid ${PLAN_GRID} h-10 items-center gap-4 border-b border-sa-line-soft bg-sa-subtle
          px-5 text-xs font-semibold uppercase tracking-[.04em] text-[#5B606B]`}
      >
        <span role="columnheader">Plan ID</span>
        <span role="columnheader">Display name</span>
        <span role="columnheader" className="text-right">Monthly</span>
        <span role="columnheader" className="text-right">Gyms</span>
        <span role="columnheader">Status</span>
        <span role="columnheader" className="sr-only">Actions</span>
      </div>

      {rows.map((p) => (
        <div key={p.id} role="row" className={`grid ${PLAN_GRID} min-h-14 items-center gap-4 border-t border-sa-line-soft px-5 py-2`}>
          <span role="cell" className="min-w-0 truncate font-sa-mono text-[13px] text-sa-ink-2">{p.id}</span>
          <span role="cell" className="min-w-0 truncate text-sm font-medium">{p.name}</span>
          <span role="cell" className="truncate text-right text-sm tabular-nums">{formatINR(p.monthlyInr)}</span>
          <span role="cell" className="truncate text-right text-sm tabular-nums text-sa-ink-2">
            {formatNum(gymCounts.get(p.id) || 0)}
          </span>
          <span role="cell" className="min-w-0">
            <Switch
              checked={p.isActive}
              disabled={togglingId === p.id}
              onChange={() => onToggle(p)}
              label={p.isActive ? 'Active' : 'Inactive'}
            />
          </span>
          <span role="cell" className="flex justify-end">
            <button
              type="button"
              aria-label={`Edit ${p.name}`}
              onClick={() => onEdit(p)}
              className={`flex size-10 items-center justify-center rounded-lg text-sa-ink-2 hover:bg-sa-muted hover:text-sa-ink ${FOCUS}`}
            >
              <PencilLine size={18} />
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}

function PlansCards({ rows, gymCounts, togglingId, onToggle, onEdit }) {
  return (
    <div className="md:hidden">
      {rows.map((p) => (
        <div key={p.id} className="border-t border-sa-line-soft px-4 py-3.5 first:border-t-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold leading-[22px]">{p.name}</p>
              <p className="truncate font-sa-mono text-xs text-sa-ink-3">{p.id}</p>
            </div>
            <Switch
              checked={p.isActive}
              disabled={togglingId === p.id}
              onChange={() => onToggle(p)}
              label={p.isActive ? 'Active' : 'Inactive'}
              labelClassName="text-[13px]"
            />
          </div>

          <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-sa-line-soft pt-2.5">
            <p className="min-w-0 truncate text-[13px] text-sa-ink-2">
              <span className="font-semibold tabular-nums text-sa-ink">{formatINR(p.monthlyInr)}</span>
              /month · {plural(gymCounts.get(p.id) || 0, 'gym')}
            </p>
            <button
              type="button"
              onClick={() => onEdit(p)}
              className={`shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-sa-accent-ink hover:bg-sa-accent-tint ${FOCUS}`}
            >
              Edit
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Add / edit ─────────────────────────────────────────────────────────────
function PlanEditor({ editor, existingIds, onClose, onSaved, onError }) {
  const isEdit = editor.mode === 'edit';
  const plan = editor.plan;

  const [id, setId] = useState(isEdit ? plan.id : '');
  const [name, setName] = useState(isEdit ? plan.name : '');
  const [amount, setAmount] = useState(isEdit ? String(plan.monthlyInr || '') : '');
  const [active, setActive] = useState(isEdit ? plan.isActive : true);
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const errors = useMemo(() => {
    const e = {};
    if (!isEdit) {
      if (!id.trim()) e.id = 'Plan ID is required';
      else if (!ID_RE.test(id.trim())) e.id = 'Use lowercase letters, numbers and underscores only';
      else if (existingIds.includes(id.trim())) e.id = 'Plan ID already exists';
    }
    if (!name.trim()) e.name = 'Display name is required';
    if (!amount) e.amount = 'Monthly amount is required';
    else if (Number(amount) <= 0) e.amount = 'Amount must be more than ₹0';
    return e;
  }, [isEdit, id, name, amount, existingIds]);

  // Errors appear on blur, or on every field once a submit has been attempted.
  // The duplicate-ID error is the exception: it shows the moment it is true.
  const show = (field) => (
    (submitted || touched[field] || (field === 'id' && errors.id === 'Plan ID already exists'))
      ? errors[field]
      : undefined
  );

  const submit = async (e) => {
    e?.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      await upsertPlan({
        planId: isEdit ? plan.id : id.trim(),
        name: name.trim(),
        monthly_amount_inr: Number(amount),
        is_active: active,
      });
      onSaved(isEdit ? 'Changes saved' : 'Plan created');
    } catch (err) {
      onError(err?.message || 'Couldn’t save the plan');
      setSaving(false);
    }
  };

  return (
    <ResponsiveDialog
      open
      onClose={onClose}
      closeDisabled={saving}
      labelledBy="sa-plan-title"
      title={isEdit ? 'Edit plan' : 'New plan'}
      sub={isEdit
        ? 'Changes apply to new subscriptions and renewals.'
        : 'Gyms can subscribe to this plan once it’s active.'}
      footer={(
        <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={saving} loadingLabel="Saving…">
            {isEdit ? 'Save changes' : 'Create plan'}
          </Button>
        </div>
      )}
    >
      <form onSubmit={submit} className="flex flex-col gap-[18px]">
        {isEdit ? (
          <LockedInput
            label="Plan ID"
            value={plan.id}
            help="Locked after creation — gym subscriptions and payment records reference this ID."
          />
        ) : (
          <TextInput
            label="Plan ID"
            required
            value={id}
            onChange={(e) => setId(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, id: true }))}
            error={show('id')}
            help="Lowercase letters, numbers and underscores. Can’t be changed later."
            placeholder="e.g. growth_monthly"
            className="font-sa-mono"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        )}

        <TextInput
          label="Display name"
          required
          value={name}
          maxLength={NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, name: true }))}
          error={show('name')}
          help={`${name.length}/${NAME_MAX}`}
          placeholder="e.g. Growth"
        />

        <CurrencyInput
          label="Monthly amount"
          required
          value={amount}
          onChange={setAmount}
          onBlur={() => setTouched((t) => ({ ...t, amount: true }))}
          error={show('amount')}
        />

        <div className="flex min-h-14 items-center justify-between gap-3 rounded-[10px] border border-sa-line bg-sa-subtle px-3">
          <div className="min-w-0">
            <FieldLabel>Active</FieldLabel>
            <p className="mt-0.5 text-[13px] text-sa-ink-3">
              {active ? 'Active — gyms can select this plan' : 'Inactive — hidden from gyms'}
            </p>
          </div>
          <Switch checked={active} onChange={setActive} />
        </div>

        {/* Lets Enter submit the form without a visible duplicate button. */}
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">Save</button>
      </form>
    </ResponsiveDialog>
  );
}
