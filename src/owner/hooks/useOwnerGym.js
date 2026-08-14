import { useEffect, useState } from 'react';
import { getGym } from '../../firebase/firestore';

// Short-lived in-memory cache for the gym doc, mirroring the pattern already
// used by numberingService's getNumberingSettings (30-min cache there).
// Read-only owner screens (member list/profile, add member, add payment,
// payment detail, analytics) hit `getGym` on every mount; sharing one cached
// read means navigating between them doesn't re-fetch the same doc over the
// network each time. Screens that *write* the gym doc (Settings, Plans,
// Equipment, Card Design, Numbering) keep calling `getGym`/`updateGym`
// directly — they call `invalidateOwnerGym` after a save so the cache never
// serves stale data back to the read-only screens for more than the TTL.
const TTL_MS = 45_000;
const cache = new Map(); // gymId -> { data, promise, ts }

function fetchGym(gymId) {
  const entry = cache.get(gymId);
  const fresh = entry && Date.now() - entry.ts < TTL_MS;
  if (fresh) return entry.promise;
  const promise = getGym(gymId).then((data) => {
    cache.set(gymId, { data, promise, ts: Date.now() });
    return data;
  });
  cache.set(gymId, { data: entry?.data ?? null, promise, ts: Date.now() });
  return promise;
}

export function invalidateOwnerGym(gymId) {
  if (gymId) cache.delete(gymId);
}

export default function useOwnerGym(gymId) {
  const cached = gymId ? cache.get(gymId) : null;
  const [gym, setGym] = useState(cached?.data ?? null);
  const [loading, setLoading] = useState(!cached?.data);

  useEffect(() => {
    if (!gymId) return;
    let cancelled = false;
    const entry = cache.get(gymId);
    if (entry?.data) setGym(entry.data); else setLoading(true);
    fetchGym(gymId).then((data) => {
      if (!cancelled) { setGym(data); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [gymId]);

  return { gym, loading, setGym };
}
