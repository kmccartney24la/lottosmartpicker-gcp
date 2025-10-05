// app/components/scratchers/useScratchersIndex.ts
"use client";

import { useEffect, useMemo, useState } from "react";
import type { ActiveGame } from "./types";
import { fetchScratchersWithCache } from "@lib/scratchers";

// API response can be either { games: ActiveGame[], updatedAt?: string } or an array of ActiveGame
type ScratchersIndexPayload = { games: ActiveGame[]; updatedAt?: string } | ActiveGame[];

export function useScratchersIndex() {
  const [raw, setRaw] = useState<ScratchersIndexPayload | null>(null);
  const [loading, setLoading] = useState(false);

  const inferUpdatedAt = (games: ActiveGame[]): string | undefined => {
    // Prefer max per-game updatedAt if the API doesn’t send one at the top level
    let maxTs = 0;
    for (const g of games) {
      const t = Date.parse(g.updatedAt ?? "");
      if (Number.isFinite(t) && t > maxTs) maxTs = t;
    }
    return maxTs > 0 ? new Date(maxTs).toISOString() : undefined;
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const games = await fetchScratchersWithCache();
        // If your API ever returns { games, updatedAt }, feel free to use that directly.
        // For now, compute from per-game timestamps so FiltersPanel shows the correct date.
        if (alive) setRaw({ games, updatedAt: inferUpdatedAt(games) });
      } catch (err) {
        console.error(err);
        if (alive) setRaw({ games: [] });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const games: ActiveGame[] = useMemo(() => {
    if (!raw) return [];
    return Array.isArray(raw) ? raw : raw.games ?? [];
  }, [raw]);

  const updatedAt: string | undefined = useMemo(() => {
    if (!raw) return undefined;
    return Array.isArray(raw) ? undefined : raw.updatedAt;
  }, [raw]);

  return { games, updatedAt, loading };
}
