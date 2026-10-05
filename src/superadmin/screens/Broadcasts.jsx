// src/superadmin/screens/Broadcasts.jsx
// Compose · Drafts · Sent. The active tab lives in `?tab=`, and Compose is
// guarded against losing unsaved work by useBlocker + beforeunload.
// (README §7.3.)

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useBlocker } from 'react-router-dom';
import {
  Megaphone, Users, Inbox, Trash2, PencilLine, Eye, ChevronRight, TriangleAlert,
} from 'lucide-react';
import useAsync from '../hooks/useAsync';
import { fetchBroadcasts, fetchGyms, fetchPlans, saveBroadcast, deleteBroadcast } from '../lib/api';
import { formatDate, formatDateTime, formatTime, plural } from '../lib/format';
import { PageHeader } from '../SuperAdminLayout';
import Button, { IconButton, FOCUS } from '../components/Button';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/Badges';
import {
  Tabs, TextInput, TextareaWithCounter, RadioCard, CheckChip, SearchInput, FilterSelect,
} from '../components/Inputs';
import GymMultiSelect from '../components/GymMultiSelect';
import { EmptyState, ErrorState, Skeleton } from '../components/States';
import { ResponsiveDialog, SidePanel, useConfirm } from '../components/Overlays';
import { useSaToast } from '../components/Toast';

const TITLE_MAX = 80;
const MESSAGE_MAX = 1000;

const EMPTY_FORM = {
  title: '', message: '', audienceType: 'all', planIds: [], gymIds: [], editingId: null, editingUpdatedAt: null,
};

const RANGES = [
  { value: '', label: 'All time' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

export default function Broadcasts() {
  const [params, setParams] = useSearchParams();
  const tab = ['compose', 'drafts', 'sent'].includes(params.get('tab')) ? params.get('tab') : 'compose';
  const { showToast } = useSaToast();
  const confirm = useConfirm();

  const listQ = useAsync(fetchBroadcasts, [], { initial: [] });
  // `useAsync` returns a fresh object each render, so anything memoised below
  // depends on this stable function instead — otherwise the blocker effect
  // would re-run (and re-open its dialog) on every render.
  const refetchList = listQ.refetch;
  const gymsQ = useAsync(fetchGyms, [], { initial: [] });
  const plansQ = useAsync(fetchPlans, [], { initial: [] });

  const gyms = gymsQ.data || [];
  const plans = plansQ.data || [];
  const all = listQ.data || [];

  const drafts = useMemo(
    () => all.filter((b) => b.status === 'draft').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    [all],
  );
  const sent = useMemo(
    () => all.filter((b) => b.status === 'published').sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0)),
    [all],
  );

  const [form, setForm] = useState(EMPTY_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const gymsWithPlan = useMemo(
    () => gyms.map((g) => ({ ...g, planName: plans.find((p) => p.id === g.planId)?.name || g.planId })),
    [gyms, plans],
  );

  const planCounts = useMemo(() => {
    const m = new Map();
    gyms.forEach((g) => m.set(g.planId, (m.get(g.planId) || 0) + 1));
    return m;
  }, [gyms]);

  const reach = useMemo(() => {
    if (form.audienceType === 'all') return gyms.length;
    if (form.audienceType === 'plans') return gyms.filter((g) => form.planIds.includes(g.planId)).length;
    return form.gymIds.length;
  }, [form, gyms]);

  const update = useCallback((patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
  }, []);

  const resetForm = useCallback(() => {
    setForm(EMPTY_FORM);
    setSubmitted(false);
    setDirty(false);
  }, []);

  const errors = useMemo(() => {
    const e = {};
    if (!form.title.trim()) e.title = 'Add a title';
    if (!form.message.trim()) e.message = 'Write a message';
    if (form.audienceType === 'plans' && form.planIds.length === 0) e.audience = 'Pick at least one plan';
    if (form.audienceType === 'gyms' && form.gymIds.length === 0) e.audience = 'Pick at least one gym';
    return e;
  }, [form]);

  const shown = submitted ? errors : {};

  const setTab = useCallback((next) => {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set('tab', next);
      return p;
    }, { replace: true });
  }, [setParams]);

  // ── Unsaved-changes guard ────────────────────────────────────────────────
  const hasContent = dirty && (form.title.trim() || form.message.trim());

  useEffect(() => {
    if (!hasContent) return undefined;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasContent]);

  const blocker = useBlocker(useCallback(
    ({ currentLocation, nextLocation }) => hasContent && currentLocation.pathname !== nextLocation.pathname,
    [hasContent],
  ));

  const saveDraft = useCallback(async ({ silent } = {}) => {
    if (!form.title.trim()) {
      setSubmitted(true);
      if (!silent) showToast('Add a title before saving a draft', 'error');
      return false;
    }
    setSaving(true);
    try {
      const res = await saveBroadcast({
        id: form.editingId || undefined,
        status: 'draft',
        title: form.title.trim(),
        body: form.message.trim(),
        audience: form.audienceType,
        plan_ids: form.audienceType === 'plans' ? form.planIds : [],
        gym_ids: form.audienceType === 'gyms' ? form.gymIds : [],
        reach_count: reach,
      });
      setForm((f) => ({ ...f, editingId: res?.id || f.editingId, editingUpdatedAt: new Date() }));
      setDirty(false);
      await refetchList();
      if (!silent) showToast('Draft saved');
      return true;
    } catch (e) {
      showToast(e?.message || 'Couldn’t save the draft', 'error');
      return false;
    } finally {
      setSaving(false);
    }
  }, [form, reach, refetchList, showToast]);

  // Resolve the blocker once the operator picks Keep editing / Save / Discard.
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    let cancelled = false;
    (async () => {
      const choice = await confirm({
        icon: TriangleAlert,
        destructive: true,
        title: 'Discard unsaved changes?',
        body: 'Your broadcast in Compose hasn’t been saved.',
        cancelLabel: 'Keep editing',
        alt: { label: 'Save as draft', value: 'save' },
        confirmLabel: 'Discard',
      });
      if (cancelled) return;
      if (choice === 'save') {
        const ok = await saveDraft({ silent: true });
        if (ok) { resetForm(); blocker.proceed(); } else blocker.reset();
      } else if (choice === true) {
        resetForm();
        blocker.proceed();
      } else {
        blocker.reset();
      }
    })();
    return () => { cancelled = true; };
  }, [blocker, confirm, saveDraft, resetForm]);

  /** Guarded tab change — Compose → elsewhere runs the same three-way prompt. */
  const requestTab = useCallback(async (next) => {
    if (tab !== 'compose' || !hasContent) { setTab(next); return; }
    const choice = await confirm({
      icon: TriangleAlert,
      destructive: true,
      title: 'Discard unsaved changes?',
      body: 'Your broadcast in Compose hasn’t been saved.',
      cancelLabel: 'Keep editing',
      alt: { label: 'Save as draft', value: 'save' },
      confirmLabel: 'Discard',
    });
    if (choice === 'save') {
      if (await saveDraft({ silent: true })) { resetForm(); setTab(next); }
    } else if (choice === true) {
      resetForm();
      setTab(next);
    }
  }, [tab, hasContent, confirm, saveDraft, resetForm, setTab]);

  const audienceSummary = useCallback((f = form) => {
    if (f.audienceType === 'all') return 'All gyms';
    if (f.audienceType === 'plans') {
      const names = f.planIds.map((id) => plans.find((p) => p.id === id)?.name || id);
      return `${plural(names.length, 'plan')} · ${names.join(', ')}`;
    }
    return plural(f.gymIds.length, 'gym');
  }, [form, plans]);

  const publish = useCallback(async (source) => {
    const target = source || form;
    const errs = {
      title: !target.title.trim(),
      message: !target.message.trim(),
      audience: (target.audienceType === 'plans' && target.planIds.length === 0)
        || (target.audienceType === 'gyms' && target.gymIds.length === 0),
    };
    if (errs.title || errs.message || errs.audience) {
      // A draft that can't be published opens in Compose with its errors shown.
      setForm({ ...target });
      setSubmitted(true);
      setDirty(false);
      setTab('compose');
      showToast('This broadcast needs a title, a message and an audience', 'error');
      return;
    }

    const targetReach = target.audienceType === 'all'
      ? gyms.length
      : target.audienceType === 'plans'
        ? gyms.filter((g) => target.planIds.includes(g.planId)).length
        : target.gymIds.length;

    const ok = await confirm({
      icon: Megaphone,
      title: 'Publish this broadcast?',
      body: 'It will appear immediately in the Gymly app for every gym owner in the audience. Published broadcasts can’t be edited.',
      rows: [
        { label: 'Title', value: target.title.trim() },
        { label: 'Audience', value: audienceSummary(target) },
        { label: 'Reach', value: plural(targetReach, 'gym') },
      ],
      confirmLabel: `Publish to ${plural(targetReach, 'gym')}`,
    });
    if (!ok) return;

    setSaving(true);
    try {
      await saveBroadcast({
        id: target.editingId || undefined,
        status: 'published',
        title: target.title.trim(),
        body: target.message.trim(),
        audience: target.audienceType,
        plan_ids: target.audienceType === 'plans' ? target.planIds : [],
        gym_ids: target.audienceType === 'gyms' ? target.gymIds : [],
        reach_count: targetReach,
      });
      // Publishing straight from the Drafts tab must not wipe whatever the
      // operator has half-written in Compose — only clear it when the thing
      // just published IS what Compose is holding.
      if (!source || source.editingId === form.editingId) resetForm();
      await refetchList();
      setTab('sent');
      showToast(`Broadcast published to ${plural(targetReach, 'gym')}`);
    } catch (e) {
      showToast(e?.message || 'Couldn’t publish the broadcast', 'error');
    } finally {
      setSaving(false);
    }
  }, [form, gyms, confirm, audienceSummary, resetForm, refetchList, setTab, showToast]);

  const editDraft = useCallback(async (d) => {
    if (hasContent) {
      const choice = await confirm({
        icon: TriangleAlert,
        destructive: true,
        title: 'Discard unsaved changes?',
        body: 'Your broadcast in Compose hasn’t been saved.',
        cancelLabel: 'Keep editing',
        alt: { label: 'Save as draft', value: 'save' },
        confirmLabel: 'Discard',
      });
      if (choice === 'save') { if (!(await saveDraft({ silent: true }))) return; }
      else if (choice !== true) return;
    }
    setForm({
      title: d.title,
      message: d.message,
      audienceType: d.audienceType === 'plan' ? 'plans' : d.audienceType === 'specific' ? 'gyms' : d.audienceType,
      planIds: d.planIds,
      gymIds: d.gymIds,
      editingId: d.id,
      editingUpdatedAt: d.updatedAt,
    });
    setSubmitted(false);
    setDirty(false);
    setTab('compose');
  }, [hasContent, confirm, saveDraft, setTab]);

  const removeDraft = useCallback(async (d) => {
    const ok = await confirm({
      icon: Trash2,
      destructive: true,
      title: 'Delete this draft?',
      body: `“${d.title}” will be permanently deleted. This can’t be undone.`,
      confirmLabel: 'Delete draft',
    });
    if (!ok) return;
    try {
      await deleteBroadcast(d.id);
      if (form.editingId === d.id) resetForm();
      await refetchList();
      showToast('Draft deleted');
    } catch (e) {
      showToast(e?.message || 'Couldn’t delete the draft', 'error');
    }
  }, [confirm, form.editingId, resetForm, refetchList, showToast]);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <PageHeader title="Broadcasts" subtitle="In-app announcements shown to gym owners." />

      <Tabs
        ariaLabel="Broadcasts"
        value={tab}
        onChange={requestTab}
        items={[
          { value: 'compose', label: 'Compose' },
          { value: 'drafts', label: 'Drafts', count: drafts.length },
          { value: 'sent', label: 'Sent', count: sent.length },
        ]}
      />

      {tab === 'compose' && (
        <Compose
          form={form}
          update={update}
          errors={shown}
          reach={reach}
          plans={plans}
          planCounts={planCounts}
          gyms={gymsWithPlan}
          loading={gymsQ.loading || plansQ.loading}
          saving={saving}
          audienceSummary={audienceSummary}
          onNewBroadcast={resetForm}
          onSaveDraft={() => saveDraft()}
          onPublish={() => { setSubmitted(true); publish(); }}
        />
      )}

      {tab === 'drafts' && (
        <DraftsTab
          query={listQ}
          drafts={drafts}
          plans={plans}
          onCompose={() => setTab('compose')}
          onEdit={editDraft}
          onDelete={removeDraft}
          onPublish={publish}
        />
      )}

      {tab === 'sent' && (
        <SentTab query={listQ} sent={sent} plans={plans} gyms={gyms} />
      )}
    </div>
  );
}

// ── Compose ────────────────────────────────────────────────────────────────
function Compose({
  form, update, errors, reach, plans, planCounts, gyms, loading, saving,
  audienceSummary, onNewBroadcast, onSaveDraft, onPublish,
}) {
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <div className="flex min-w-0 flex-col gap-[18px]">
        {form.editingId && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sa-warning-soft px-3.5 py-2.5 text-[13px] text-sa-warning">
            <span className="min-w-0">
              <strong className="font-semibold">Editing draft</strong>
              {form.editingUpdatedAt && ` · last saved ${formatDateTime(form.editingUpdatedAt)}`}
            </span>
            <button
              type="button"
              onClick={onNewBroadcast}
              className={`rounded px-1 font-medium underline underline-offset-2 ${FOCUS}`}
            >
              Start a new broadcast
            </button>
          </div>
        )}

        <TextInput
          label="Title"
          required
          value={form.title}
          maxLength={TITLE_MAX}
          error={errors.title}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="e.g. Scheduled maintenance on 28 Sep"
          help={`${form.title.length}/${TITLE_MAX}`}
        />

        <TextareaWithCounter
          label="Message"
          required
          value={form.message}
          maxLength={MESSAGE_MAX}
          error={errors.message}
          onChange={(e) => update({ message: e.target.value })}
          placeholder="Write what gym owners need to know…"
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-sa-ink">Audience</legend>
          <div role="radiogroup" className="grid gap-2 md:grid-cols-3">
            <RadioCard
              name="audience"
              selected={form.audienceType === 'all'}
              onSelect={() => update({ audienceType: 'all' })}
              title="All gyms"
              sub="Every gym on Gymly"
            />
            <RadioCard
              name="audience"
              selected={form.audienceType === 'plans'}
              onSelect={() => update({ audienceType: 'plans' })}
              title="By plan"
              sub="Gyms on selected plans"
            />
            <RadioCard
              name="audience"
              selected={form.audienceType === 'gyms'}
              onSelect={() => update({ audienceType: 'gyms' })}
              title="Specific gyms"
              sub="Hand-pick individual gyms"
            />
          </div>

          {form.audienceType === 'plans' && (
            <div className="mt-1 flex flex-col gap-2">
              <div className="flex flex-wrap gap-1.5">
                {plans.map((p) => (
                  <CheckChip
                    key={p.id}
                    checked={form.planIds.includes(p.id)}
                    onToggle={() => update({
                      planIds: form.planIds.includes(p.id)
                        ? form.planIds.filter((x) => x !== p.id)
                        : [...form.planIds, p.id],
                    })}
                    label={p.name}
                    meta={plural(planCounts.get(p.id) || 0, 'gym')}
                  />
                ))}
              </div>
              {errors.audience && <p role="alert" className="text-[13px] font-medium text-sa-danger">{errors.audience}</p>}
            </div>
          )}

          {form.audienceType === 'gyms' && (
            <div className="mt-1">
              {loading ? (
                <Skeleton className="h-11 w-full" />
              ) : (
                <GymMultiSelect
                  gyms={gyms}
                  selectedIds={form.gymIds}
                  onChange={(ids) => update({ gymIds: ids })}
                  error={errors.audience}
                />
              )}
            </div>
          )}
        </fieldset>

        <div
          aria-live="polite"
          className={`flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm
            ${reach > 0 ? 'bg-sa-accent-soft text-sa-accent-ink' : 'bg-sa-canvas text-sa-ink-3'}`}
        >
          <Users aria-hidden="true" size={18} className="shrink-0" />
          <span>Will reach <strong className="font-semibold tabular-nums">{plural(reach, 'gym')}</strong></span>
        </div>

        <div className="flex flex-col gap-2 border-t border-sa-line pt-4 md:flex-row md:items-center md:justify-end">
          <Button
            variant="ghost"
            onClick={() => setPreviewOpen(true)}
            className="w-full bg-sa-muted md:order-first md:mr-auto md:w-auto md:bg-transparent"
          >
            <Eye aria-hidden="true" size={16} />
            Preview
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onSaveDraft} disabled={saving} className="flex-1 md:w-[180px] md:flex-none">
              Save as draft
            </Button>
            <Button variant="primary" onClick={onPublish} loading={saving} loadingLabel="Publishing…" className="flex-1 md:w-[180px] md:flex-none">
              Publish
            </Button>
          </div>
        </div>
      </div>

      {/* Inline preview on lg, overlay below it. */}
      <div className="hidden lg:sticky lg:top-0 lg:block">
        <p className="mb-2 text-[13px] font-medium text-sa-ink-2">Live preview · gym owner’s app</p>
        <PreviewCard title={form.title} message={form.message} />
      </div>

      <ResponsiveDialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Preview"
        sub={`Audience: ${audienceSummary()} · ${plural(reach, 'gym')}`}
        labelledBy="sa-preview-title"
        variant="sheet"
        maxWidth="max-w-[420px]"
      >
        <PreviewCard title={form.title} message={form.message} />
      </ResponsiveDialog>
    </div>
  );
}

function PreviewCard({ title, message }) {
  return (
    <div className="rounded-2xl bg-sa-line-soft p-4">
      <div className="rounded-xl bg-sa-surface p-4 shadow-sa-sm">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sa-accent-soft text-sa-accent-ink">
            <Megaphone size={15} />
          </span>
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-sa-accent-ink">
            Announcement from Gymly
          </span>
          <span className="shrink-0 text-xs text-sa-ink-3">Just now</span>
        </div>

        <p className={`mt-3 text-base font-semibold leading-[22px] ${title ? 'text-sa-ink' : 'text-[#9CA0A9]'}`}>
          {title || 'Your announcement title'}
        </p>
        <p className={`mt-1.5 whitespace-pre-wrap break-words text-sm leading-5 ${message ? 'text-sa-ink-2' : 'text-[#9CA0A9]'}`}>
          {message || 'Your message will appear here as gym owners will see it.'}
        </p>

        <span aria-hidden="true" className="mt-3.5 inline-flex h-9 items-center rounded-lg bg-sa-accent px-3.5 text-[13px] font-semibold text-white">
          Got it
        </span>
      </div>
      <p className="mt-3 text-xs leading-4 text-sa-ink-3">
        Shown in the owner’s in-app announcement banner while it stays active.
      </p>
    </div>
  );
}

// ── Drafts ─────────────────────────────────────────────────────────────────
function DraftsTab({ query, drafts, plans, onCompose, onEdit, onDelete, onPublish }) {
  if (query.loading) return <ListSkeleton />;
  if (query.error) {
    return (
      <Card>
        <ErrorState title="Couldn’t load drafts" body="Check your connection and try again." onRetry={query.refetch} />
      </Card>
    );
  }
  if (drafts.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Inbox}
          title="No drafts"
          body="Broadcasts you save without publishing will show up here."
          action={<Button variant="secondary" onClick={onCompose}>Compose a broadcast</Button>}
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {drafts.map((d) => (
        <Card key={d.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-start md:justify-between md:p-5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status="draft" />
              <p className="min-w-0 truncate text-[15px] font-semibold leading-[22px]">{d.title || 'Untitled'}</p>
            </div>
            <p className="mt-1.5 line-clamp-2 text-sm text-sa-ink-2">{d.message || 'No message yet.'}</p>
            <p className="mt-1.5 text-xs text-sa-ink-3">
              {describeAudience(d, plans)} · Edited {formatDate(d.updatedAt)}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <IconButton label="Delete draft" variant="ghost" onClick={() => onDelete(d)} className="text-sa-danger hover:bg-sa-danger-soft hover:text-sa-danger">
              <Trash2 size={18} />
            </IconButton>
            <Button variant="secondary" onClick={() => onEdit(d)}>
              <PencilLine aria-hidden="true" size={16} />
              Edit
            </Button>
            <Button
              variant="primary"
              onClick={() => onPublish({
                title: d.title,
                message: d.message,
                audienceType: d.audienceType === 'plan' ? 'plans' : d.audienceType === 'specific' ? 'gyms' : d.audienceType,
                planIds: d.planIds,
                gymIds: d.gymIds,
                editingId: d.id,
              })}
            >
              Publish
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Sent ───────────────────────────────────────────────────────────────────
function SentTab({ query, sent, plans, gyms }) {
  const [search, setSearch] = useState('');
  // The range's reference point is captured when the operator picks it, so the
  // filter stays a pure function of state instead of re-reading the clock on
  // every render.
  const [{ range, pickedAt }, setRange] = useState({ range: '', pickedAt: 0 });
  const [selected, setSelected] = useState(null);
  const onRangeChange = (v) => setRange({ range: v, pickedAt: Date.now() });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const cutoff = range ? pickedAt - Number(range) * 86400000 : null;
    return sent.filter((b) => {
      if (term && !b.title.toLowerCase().includes(term)) return false;
      if (cutoff && (!b.publishedAt || b.publishedAt.getTime() < cutoff)) return false;
      return true;
    });
  }, [sent, search, range, pickedAt]);

  if (query.loading) return <ListSkeleton />;
  if (query.error) {
    return (
      <Card>
        <ErrorState title="Couldn’t load broadcasts" body="Check your connection and try again." onRetry={query.refetch} />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px]">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by title" label="Search sent broadcasts" />
        <FilterSelect label="Date range" value={range} onChange={onRangeChange} options={RANGES} />
      </div>

      {sent.length === 0 ? (
        <Card>
          <EmptyState icon={Inbox} title="No broadcasts sent yet" body="Published announcements appear here." />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={Inbox}
            title="No broadcasts match"
            body="Try a different title, or widen the date range."
            action={(
              <Button variant="secondary" onClick={() => { setSearch(''); onRangeChange(''); }}>
                Clear filters
              </Button>
            )}
          />
        </Card>
      ) : (
        <Card>
          {filtered.map((b, i) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setSelected(b)}
              className={`flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-[#FAFAF7] md:px-5
                ${i > 0 ? 'border-t border-sa-line-soft' : ''} ${FOCUS}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold leading-[22px]">{b.title}</span>
                <span className="mt-0.5 block truncate text-sm text-sa-ink-2">{b.message}</span>
                <span className="mt-1 block truncate text-xs text-sa-ink-3">
                  {describeAudience(b, plans)} · {formatDateTime(b.publishedAt)}
                  {b.reachCount != null && ` · reached ${plural(b.reachCount, 'gym')}`}
                </span>
              </span>
              <ChevronRight aria-hidden="true" size={18} className="shrink-0 text-sa-ink-3" />
            </button>
          ))}
        </Card>
      )}

      <SidePanel
        open={!!selected}
        onClose={() => setSelected(null)}
        label="Sent broadcast"
        title={selected?.title}
        backdropOpacity={0.83}
      >
        {selected && (
          <div className="flex flex-col gap-4">
            <div>
              <StatusBadge status="published" />
              <h2 className="mt-2.5 text-xl font-semibold leading-7">{selected.title}</h2>
              <p className="mt-1 text-[13px] tabular-nums text-sa-ink-3">
                {formatDate(selected.publishedAt)} at {formatTime(selected.publishedAt)}
              </p>
            </div>

            <p className="whitespace-pre-wrap break-words text-sm leading-5 text-sa-ink-2">{selected.message}</p>

            <div className="border-t border-sa-line-soft pt-4">
              <h3 className="text-[13px] font-semibold uppercase tracking-[.05em] text-sa-ink-3">Audience</h3>
              <p className="mt-2 text-sm font-medium">{describeAudience(selected, plans)}</p>
              {selected.reachCount != null && (
                <p className="mt-0.5 text-[13px] tabular-nums text-sa-ink-3">
                  Reached {plural(selected.reachCount, 'gym')}
                </p>
              )}

              {selected.audienceType === 'all' && (
                <p className="mt-2.5 text-[13px] text-sa-ink-3">Every gym on Gymly at the time of publishing.</p>
              )}

              {selected.planIds?.length > 0 && (
                <ul className="mt-2.5 flex flex-col gap-1.5">
                  {selected.planIds.map((id) => (
                    <li key={id} className="flex items-center justify-between gap-3 text-[13px]">
                      <span className="truncate">{plans.find((p) => p.id === id)?.name || id}</span>
                      <span className="shrink-0 tabular-nums text-sa-ink-3">
                        {plural(gyms.filter((g) => g.planId === id).length, 'gym')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {selected.gymIds?.length > 0 && (
                <ul className="mt-2.5 flex flex-col gap-1.5">
                  {selected.gymIds.map((id) => {
                    const g = gyms.find((x) => x.id === id);
                    return (
                      <li key={id} className="flex items-center justify-between gap-3 text-[13px]">
                        <span className="truncate">{g?.name || id}</span>
                        <span className="shrink-0 text-sa-ink-3">{g?.city || '—'}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </SidePanel>
    </div>
  );
}

function describeAudience(b, plans) {
  const type = b.audienceType;
  if (type === 'all') return 'All gyms';
  if (type === 'plans' || type === 'plan') {
    const names = (b.planIds || []).map((id) => plans.find((p) => p.id === id)?.name || id);
    return names.length ? `${plural(names.length, 'plan')} · ${names.join(', ')}` : 'By plan';
  }
  if (type === 'status') return `Status: ${b.statusFilter || '—'}`;
  return plural((b.gymIds || []).length, 'gym');
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-[104px] rounded-xl" />)}
    </div>
  );
}

