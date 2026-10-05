// src/superadmin/components/Inputs.jsx
// Form and filter primitives for the Super Admin console (handoff README §6).
// Built once here so every screen shares the same heights, focus ring and
// error treatment — the spec's "tokens and components are shared, not
// duplicated per screen" acceptance criterion.

import { forwardRef, useId, useMemo } from 'react';
import { Search, ChevronDown, X, Lock, Check } from 'lucide-react';
import { FOCUS } from './Button';
import { groupDigits } from '../lib/format';

const FIELD_BASE = `w-full rounded-lg border bg-sa-surface px-3 text-sm text-sa-ink
  placeholder:text-sa-ink-disabled h-11 md:h-10 ${FOCUS}`;

/** Label + optional required marker + optional right-hand slot (counters). */
export function FieldLabel({ htmlFor, children, required, right, className = '' }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${className}`}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-sa-ink">
        {children}
        {required && <span aria-hidden="true" className="ml-0.5 text-sa-danger">*</span>}
      </label>
      {right}
    </div>
  );
}

export function FieldError({ id, children }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="text-[13px] font-medium text-sa-danger">
      {children}
    </p>
  );
}

export function FieldHelp({ id, children }) {
  if (!children) return null;
  return <p id={id} className="text-[13px] text-sa-ink-3">{children}</p>;
}

// ── TextInput ──────────────────────────────────────────────────────────────
export const TextInput = forwardRef(function TextInput(
  { label, error, help, required, className = '', wrapClassName = '', id, ...rest },
  ref,
) {
  const auto = useId();
  const inputId = id || auto;
  const errId = `${inputId}-err`;
  const helpId = `${inputId}-help`;

  return (
    <div className={`flex flex-col gap-1.5 ${wrapClassName}`}>
      {label && <FieldLabel htmlFor={inputId} required={required}>{label}</FieldLabel>}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={[error && errId, help && helpId].filter(Boolean).join(' ') || undefined}
        className={`${FIELD_BASE} ${error ? 'border-sa-danger-dot' : 'border-sa-line-strong'} ${className}`}
        {...rest}
      />
      <FieldError id={errId}>{error}</FieldError>
      {!error && <FieldHelp id={helpId}>{help}</FieldHelp>}
    </div>
  );
});

// ── Locked (read-only) input ───────────────────────────────────────────────
export function LockedInput({ label, value, help, className = '' }) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && <FieldLabel htmlFor={id}>{label}</FieldLabel>}
      <div className="relative">
        <input
          id={id}
          readOnly
          value={value}
          className={`${FIELD_BASE} cursor-not-allowed border-sa-line bg-sa-canvas pr-10 font-sa-mono text-sa-ink-2 ${FOCUS}`}
        />
        <Lock aria-hidden="true" size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sa-ink-3" />
      </div>
      <FieldHelp>{help}</FieldHelp>
    </div>
  );
}

// ── Textarea with counter ──────────────────────────────────────────────────
export function TextareaWithCounter({
  label, value, onChange, maxLength, error, required, rows = 6, ...rest
}) {
  const id = useId();
  const errId = `${id}-err`;
  const len = (value || '').length;
  const ratio = maxLength ? len / maxLength : 0;
  const counterTone = ratio >= 1 ? 'text-sa-danger' : ratio >= 0.9 ? 'text-sa-warning' : 'text-sa-ink-3';

  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel
        htmlFor={id}
        required={required}
        right={maxLength ? (
          <span className={`text-xs tabular-nums ${counterTone}`}>{len}/{maxLength}</span>
        ) : null}
      >
        {label}
      </FieldLabel>
      <textarea
        id={id}
        rows={rows}
        value={value}
        maxLength={maxLength}
        onChange={onChange}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : undefined}
        className={`min-h-[136px] w-full resize-y rounded-lg border bg-sa-surface px-3 py-2.5 text-sm
          text-sa-ink placeholder:text-sa-ink-disabled ${FOCUS}
          ${error ? 'border-sa-danger-dot' : 'border-sa-line-strong'}`}
        {...rest}
      />
      <FieldError id={errId}>{error}</FieldError>
    </div>
  );
}

// ── Joined prefix field (phone / currency share this shell) ────────────────
function JoinedField({ id, error, prefix, suffix, children, maxW }) {
  return (
    <div
      className={`flex h-11 items-stretch overflow-hidden rounded-lg border md:h-10 ${maxW}
        ${error ? 'border-sa-danger-dot' : 'border-sa-line-strong'}
        focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-sa-accent`}
    >
      <span
        aria-hidden="true"
        className="flex shrink-0 items-center justify-center border-r border-sa-line bg-sa-canvas px-3 text-sm font-medium text-sa-ink-2"
      >
        {prefix}
      </span>
      {children}
      {suffix && (
        <span className="flex shrink-0 items-center pr-3 text-[13px] text-sa-ink-3">{suffix}</span>
      )}
      <label htmlFor={id} className="sr-only" />
    </div>
  );
}

/** +91 joined field. Stores 10 digits; strips anything else on the way in. */
export function PhoneInput({ label, value, onChange, error, onBlur, required, help }) {
  const id = useId();
  const errId = `${id}-err`;
  return (
    <div className="flex flex-col gap-1.5">
      {label && <FieldLabel htmlFor={id} required={required}>{label}</FieldLabel>}
      <JoinedField id={id} error={error} prefix="+91" maxW="max-w-[360px]">
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="98765 43210"
          value={value}
          onBlur={onBlur}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 10))}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
          className="min-w-0 flex-1 bg-sa-surface px-3 text-sm text-sa-ink tabular-nums placeholder:text-sa-ink-disabled focus:outline-none"
        />
      </JoinedField>
      <FieldError id={errId}>{error}</FieldError>
      {!error && <FieldHelp>{help}</FieldHelp>}
    </div>
  );
}

/**
 * ₹ joined field. Shows Indian grouping while typing (1,25,000) but hands the
 * caller digits only, so nothing downstream has to un-format it.
 */
export function CurrencyInput({ label, value, onChange, error, onBlur, required }) {
  const id = useId();
  const errId = `${id}-err`;
  const display = groupDigits(value);
  const help = value ? `₹${display} per month` : 'Whole rupees, charged monthly';

  return (
    <div className="flex flex-col gap-1.5">
      {label && <FieldLabel htmlFor={id} required={required}>{label}</FieldLabel>}
      <JoinedField id={id} error={error} prefix="₹" suffix="/month" maxW="max-w-[240px]">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          placeholder="1,999"
          value={display}
          onBlur={onBlur}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 9))}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
          className="min-w-0 flex-1 bg-sa-surface px-3 text-sm text-sa-ink tabular-nums placeholder:text-sa-ink-disabled focus:outline-none"
        />
      </JoinedField>
      <FieldError id={errId}>{error}</FieldError>
      {!error && <FieldHelp>{help}</FieldHelp>}
    </div>
  );
}

// ── Switch ─────────────────────────────────────────────────────────────────
export function Switch({ checked, onChange, label, disabled, labelClassName = '' }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      // 44px tap height on mobile without the track growing: the padding is
      // part of the button, the track is the inner span.
      className={`inline-flex min-h-[44px] items-center gap-2.5 rounded-lg pr-1 md:min-h-0
        disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`}
    >
      <span
        aria-hidden="true"
        className={`flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors
          ${checked ? 'bg-sa-accent' : 'bg-[#C9C8C1]'}`}
      >
        <span
          className={`size-5 rounded-full bg-white shadow-sa-sm transition-transform duration-150 ease-out
            ${checked ? 'translate-x-4' : 'translate-x-0'}`}
        />
      </span>
      {label && <span className={`text-sm font-medium text-sa-ink ${labelClassName}`}>{label}</span>}
    </button>
  );
}

// ── Search ─────────────────────────────────────────────────────────────────
export function SearchInput({ value, onChange, placeholder, label, className = '' }) {
  const id = useId();
  return (
    <div className={`relative ${className}`}>
      <label htmlFor={id} className="sr-only">{label || placeholder}</label>
      <Search aria-hidden="true" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sa-ink-3" />
      <input
        id={id}
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`${FIELD_BASE} border-sa-line-strong pl-[38px] ${value ? 'pr-10' : ''}
          [&::-webkit-search-cancel-button]:appearance-none`}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className={`absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center
            rounded-md text-sa-ink-3 hover:bg-sa-muted hover:text-sa-ink ${FOCUS}`}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

// ── Filter select ──────────────────────────────────────────────────────────
export function FilterSelect({ label, value, onChange, options, allValue = '', className = '' }) {
  const id = useId();
  const isSet = value !== allValue;
  return (
    <div className={`relative ${className}`}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${FIELD_BASE} appearance-none truncate pr-8 font-medium
          ${isSet ? 'border-sa-accent-line bg-sa-accent-tint text-sa-accent-ink' : 'border-sa-line-strong'}`}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown
        aria-hidden="true"
        size={16}
        className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 ${isSet ? 'text-sa-accent-ink' : 'text-sa-ink-3'}`}
      />
    </div>
  );
}

// ── Removable filter chip ──────────────────────────────────────────────────
export function FilterChip({ children, onRemove, removeLabel }) {
  return (
    <span className="inline-flex h-11 items-center gap-1 rounded-full border border-[#BFDDD0] bg-sa-accent-soft pl-3 pr-2 text-[13px] font-medium text-sa-accent-ink md:h-8">
      <span className="max-w-[180px] truncate">{children}</span>
      <button
        type="button"
        aria-label={removeLabel}
        onClick={onRemove}
        className={`flex size-7 shrink-0 items-center justify-center rounded-full hover:bg-white/60 ${FOCUS}`}
      >
        <X size={14} />
      </button>
    </span>
  );
}

// ── Segmented control ──────────────────────────────────────────────────────
export function SegmentedControl({ value, onChange, items, className = '', ariaLabel }) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`grid gap-0.5 rounded-[10px] bg-sa-line-soft p-[3px] ${className}`}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(it.value)}
            className={`flex h-[38px] min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-sm transition-colors md:h-[34px]
              ${active ? 'bg-sa-surface font-semibold text-sa-ink shadow-sa-seg' : 'text-[#5B606B] hover:text-sa-ink'} ${FOCUS}`}
          >
            <span className="truncate">{it.label}</span>
            {it.count != null && <span className="text-xs tabular-nums text-sa-ink-3">{it.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ── Underline tabs ─────────────────────────────────────────────────────────
export function Tabs({ value, onChange, items, ariaLabel }) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex gap-1 overflow-x-auto border-b border-sa-line">
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(it.value)}
            className={`-mb-px flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm transition-colors
              ${active ? 'border-sa-accent font-semibold text-sa-ink' : 'border-transparent text-sa-ink-3 hover:text-sa-ink-2'} ${FOCUS}`}
          >
            {it.label}
            {it.count != null && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-sa-line-soft px-1.5 text-xs font-semibold tabular-nums text-sa-ink-2">
                {it.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Radio card ─────────────────────────────────────────────────────────────
export function RadioCard({ selected, onSelect, title, sub, name }) {
  return (
    <button
      type="button"
      role="radio"
      name={name}
      aria-checked={selected}
      onClick={onSelect}
      className={`flex min-h-[44px] w-full items-start gap-2.5 rounded-[10px] border p-3 text-left transition-colors
        ${selected ? 'border-sa-accent bg-sa-accent-tint' : 'border-sa-line-strong hover:border-sa-accent-line'} ${FOCUS}`}
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full border-2
          ${selected ? 'border-sa-accent' : 'border-sa-line-strong'}`}
      >
        {selected && <span className="size-2 rounded-full bg-sa-accent" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-sa-ink">{title}</span>
        <span className="mt-0.5 block text-xs leading-4 text-sa-ink-3">{sub}</span>
      </span>
    </button>
  );
}

// ── Checkbox chip (plan targeting) ─────────────────────────────────────────
export function CheckChip({ checked, onToggle, label, meta }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border px-3 text-[13px] font-medium transition-colors md:min-h-[36px]
        ${checked
      ? 'border-[#BFDDD0] bg-sa-accent-soft text-sa-accent-ink'
      : 'border-sa-line-strong bg-sa-surface text-sa-ink-2 hover:border-sa-accent-line'} ${FOCUS}`}
    >
      {checked && <Check aria-hidden="true" size={14} className="shrink-0" />}
      <span className="truncate">{label}</span>
      {meta && <span className="shrink-0 text-xs tabular-nums opacity-70">{meta}</span>}
    </button>
  );
}

/** Shared by the toolbars: builds a "All x" + one-per-item option list. */
export function useSelectOptions(items, allLabel, allValue = '') {
  return useMemo(
    () => [{ value: allValue, label: allLabel }, ...items],
    [items, allLabel, allValue],
  );
}
