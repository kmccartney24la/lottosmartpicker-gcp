import { useEffect, useState } from 'react';
import type { ActiveGame, IndexPayload } from './types';

export function useScratchersIndex() {
  const [games, setGames] = useState<ActiveGame[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/data/ga_scratchers/index.latest.json', { cache: 'no-store' });
        if (!res.ok) throw new Error(`scratchers ${res.status}`);
        const payload: IndexPayload = await res.json();
        if (!alive) return;
        setGames(payload.games || []);
        setUpdatedAt(payload.updatedAt);
      } catch (err) {
        console.error(err);
        if (alive) setGames([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return { games, updatedAt, loading };
}
