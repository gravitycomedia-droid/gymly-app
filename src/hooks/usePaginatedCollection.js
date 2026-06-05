import { useState, useCallback } from 'react';
import { getDocs, query, limit, startAfter } from 'firebase/firestore';

const PAGE_SIZE = 25;

/**
 * Cursor-based pagination hook for Firestore collections.
 * Pass a stable base query (created with useMemo in the parent).
 * Filters and sorts work client-side on the loaded slice.
 */
export function usePaginatedCollection(baseQuery) {
  const [docs, setDocs] = useState([]);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadFirst = useCallback(async () => {
    if (!baseQuery) return;
    setLoading(true);
    setDocs([]);
    setLastDoc(null);
    try {
      const snap = await getDocs(query(baseQuery, limit(PAGE_SIZE)));
      setDocs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.size === PAGE_SIZE);
    } catch (err) {
      console.error('usePaginatedCollection load error:', err);
    } finally {
      setLoading(false);
    }
  }, [baseQuery]);

  const loadMore = useCallback(async () => {
    if (!lastDoc || loading || !hasMore || !baseQuery) return;
    setLoading(true);
    try {
      const snap = await getDocs(query(baseQuery, startAfter(lastDoc), limit(PAGE_SIZE)));
      setDocs(prev => [...prev, ...snap.docs.map(d => ({ id: d.id, ...d.data() }))]);
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.size === PAGE_SIZE);
    } catch (err) {
      console.error('usePaginatedCollection loadMore error:', err);
    } finally {
      setLoading(false);
    }
  }, [baseQuery, lastDoc, loading, hasMore]);

  return { docs, hasMore, loading, loadFirst, loadMore };
}
