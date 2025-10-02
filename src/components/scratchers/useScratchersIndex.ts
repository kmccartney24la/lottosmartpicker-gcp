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

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const games = await fetchScratchersWithCache();
        if (alive) setRaw({ games, updatedAt: new Date().toISOString() });
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
