// src/superadmin/hooks/useAsync.js
// One shape for every data read in the console: { data, loading, error, refetch }.
// Each screen section holds its own instance, which is what lets a single KPI
// or the payments list fail and retry without taking the page down (README §10).

import { useCallback, useEffect, useRef, useState } from 'react';

export default function useAsync(fn, deps = [], { enabled = true, initial = null } = {}) {
  const [state, setState] = useState({ data: initial, loading: enabled, error: null });
  // Holds the latest fetcher without making it a dependency of `run`, so an
  // inline arrow at the call site doesn't re-trigger the fetch every render.
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; });
  // Guards against a slow first request resolving after a newer one.
  const runIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const run = useCallback(async () => {
    if (!enabled) {
      setState({ data: initial, loading: false, error: null });
      return;
    }
    const id = ++runIdRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fnRef.current();
      if (mountedRef.current && id === runIdRef.current) setState({ data, loading: false, error: null });
    } catch (err) {
      if (import.meta.env.DEV) console.error('[superadmin] load failed:', err);
      if (mountedRef.current && id === runIdRef.current) {
        setState({ data: initial, loading: false, error: err || new Error('Load failed') });
      }
    }
    // `initial` is a caller-owned constant; deps come from the call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  useEffect(() => { run(); }, [run]);

  /** Patch loaded data in place after a mutation, without a re-fetch. */
  const setData = useCallback((updater) => {
    setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater }));
  }, []);

  return { ...state, refetch: run, setData };
}
