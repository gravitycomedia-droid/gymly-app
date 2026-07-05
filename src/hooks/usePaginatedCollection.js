import { useState, useCallback } from 'react';
import { getDocs, query, limit, startAfter } from 'firebase/firestore';

/**
 * Cursor-based pagination hook for Firestore collections.
 * Pass a stable base query (created with useMemo in the parent).
 * Filters and sorts work client-side on the loaded slice.
 * @param {import('firebase/firestore').Query} baseQuery
 * @param {number} pageSize - documents per page (default 25)
 */
export function usePaginatedCollection(baseQuery, pageSize = 25) {
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
      const snap = await getDocs(query(baseQuery, limit(pageSize)));
      setDocs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.size === pageSize);
    } catch (err) {
      console.error('usePaginatedCollection load error:', err);
    } finally {
      setLoading(false);
    }
  }, [baseQuery, pageSize]);

  const loadMore = useCallback(async () => {
    if (!lastDoc || loading || !hasMore || !baseQuery) return;
    setLoading(true);
    try {
      const snap = await getDocs(query(baseQuery, startAfter(lastDoc), limit(pageSize)));
      setDocs(prev => [...prev, ...snap.docs.map(d => ({ id: d.id, ...d.data() }))]);
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.size === pageSize);
    } catch (err) {
      console.error('usePaginatedCollection loadMore error:', err);
    } finally {
      setLoading(false);
    }
  }, [baseQuery, lastDoc, loading, hasMore, pageSize]);

  return { docs, hasMore, loading, loadFirst, loadMore };
}
