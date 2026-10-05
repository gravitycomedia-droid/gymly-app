// src/superadmin/components/GymMultiSelect.jsx
// Combobox for hand-picking gyms as a broadcast audience (README §6).
// Options use onMouseDown+preventDefault so clicking one never blurs the
// input — the list stays open for a second pick.

import { useId, useMemo, useRef, useState } from 'react';
import { Search, X, Check } from 'lucide-react';
import { FOCUS } from './Button';
import { FieldLabel, FieldError } from './Inputs';

const MAX_VISIBLE = 6;

export default function GymMultiSelect({ gyms, selectedIds, onChange, error, label = 'Gyms' }) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const blurTimer = useRef(null);

  const selected = useMemo(
    () => selectedIds.map((gid) => gyms.find((g) => g.id === gid)).filter(Boolean),
    [selectedIds, gyms],
  );

  const matches = useMemo(() => {
    const t = query.trim().toLowerCase();
    return gyms.filter((g) => !t || [g.name, g.city, g.planName].filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(t)));
  }, [gyms, query]);

  const visible = matches.slice(0, MAX_VISIBLE);
  const overflow = matches.length - visible.length;

  const toggle = (gid) => onChange(
    selectedIds.includes(gid) ? selectedIds.filter((x) => x !== gid) : [...selectedIds, gid],
  );

  return (
    <div className="flex flex-col gap-2">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {selected.map((g) => (
            <span
              key={g.id}
              className="inline-flex h-8 max-w-full items-center gap-1 rounded-full bg-sa-accent-soft pl-2.5 pr-0.5 text-[13px] font-medium text-sa-accent-ink"
            >
              <span className="truncate">{g.name}</span>
              <button
                type="button"
                aria-label={`Remove ${g.name}`}
                onClick={() => toggle(g.id)}
                className={`flex size-7 shrink-0 items-center justify-center rounded-full hover:bg-white/60 ${FOCUS}`}
              >
                <X size={14} />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => onChange([])}
            className={`rounded px-1 text-[13px] font-medium text-sa-ink-3 underline underline-offset-2 hover:text-sa-ink ${FOCUS}`}
          >
            Clear
          </button>
        </div>
      )}

      <div className="relative">
        <Search aria-hidden="true" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sa-ink-3" />
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-listbox`}
          autoComplete="off"
          placeholder="Search a gym by name or city"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { clearTimeout(blurTimer.current); setOpen(true); }}
          onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 0); }}
          aria-invalid={error ? true : undefined}
          className={`h-11 w-full rounded-lg border bg-sa-surface pl-[38px] pr-3 text-sm text-sa-ink
            placeholder:text-sa-ink-disabled md:h-10 ${FOCUS}
            ${error ? 'border-sa-danger-dot' : 'border-sa-line-strong'}`}
        />

        {open && (
          <ul
            id={`${id}-listbox`}
            role="listbox"
            aria-multiselectable="true"
            className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-[300px] overflow-y-auto
              rounded-[10px] border border-sa-line bg-sa-surface p-1 shadow-sa-md"
          >
            {visible.length === 0 ? (
              <li className="px-3 py-3 text-[13px] text-sa-ink-3">No gyms match that search.</li>
            ) : (
              visible.map((g) => {
                const checked = selectedIds.includes(g.id);
                return (
                  <li key={g.id} role="option" aria-selected={checked}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => toggle(g.id)}
                      className={`flex h-11 w-full items-center gap-2.5 rounded-md px-2 text-left hover:bg-sa-muted ${FOCUS}`}
                    >
                      <span
                        aria-hidden="true"
                        className={`flex size-[18px] shrink-0 items-center justify-center rounded border
                          ${checked ? 'border-sa-accent bg-sa-accent text-white' : 'border-sa-line-strong'}`}
                      >
                        {checked && <Check size={12} strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-sa-ink">{g.name}</span>
                        <span className="block truncate text-xs text-sa-ink-3">
                          {[g.city, g.planName].filter(Boolean).join(' · ') || '—'}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })
            )}
            {overflow > 0 && (
              <li className="px-3 py-2 text-xs text-sa-ink-3">
                +{overflow} more — keep typing to narrow down
              </li>
            )}
          </ul>
        )}
      </div>

      <FieldError>{error}</FieldError>
    </div>
  );
}
