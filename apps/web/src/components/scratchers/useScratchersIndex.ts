// app/components/scratchers/useScratchersIndex.ts
"use client";

import { useEffect, useMemo, useState } from "react";
import type { ActiveGame } from "./types";
import { fetchScratchersWithCache } from "@lsp/lib/scratchers";
// now you can use: require('node:fs'), require.resolve('some-pkg'), etc.


// Optional helper: prefer your existing lib if present in the repo
// Falls back to the provided public GCS base if the helper isn't available at runtime.
let _getPublicBaseUrl: (() => string) | undefined;
try {
  // If your project exposes this, use it (keeps one source of truth).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  _getPublicBaseUrl = require("@lsp/lib/gcs-public").getPublicBaseUrl;
} catch {}

// API response can be either { games: ActiveGame[], updatedAt?: string } or an array of ActiveGame
type ScratchersIndexPayload = { games: ActiveGame[]; updatedAt?: string } | ActiveGame[];

export function useScratchersIndex(opts?: { jurisdiction?: "ga" | "ny" | "fl" | "ca"}) {
  const jurisdiction: "ga" | "ny" | "fl" | "ca" = opts?.jurisdiction ?? "ga";
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
        let games: ActiveGame[] = [];
        if (jurisdiction === "ga") {
          // Preserve GA behavior
          games = await fetchScratchersWithCache();
        } else {
          // Prefer same-origin API (handles auth/CSP/image proxy) and fall back to GCS/local if needed
          const apiUrl = `/api/scratchers?j=${jurisdiction}`;
          try {
            const apiResp = await fetch(apiUrl, { cache: "no-store" });
            if (apiResp.ok) {
              const payload = (await apiResp.json()) as ScratchersIndexPayload;
              games = Array.isArray(payload) ? payload : payload?.games ?? [];
            } else {
              throw new Error(`API ${apiUrl} returned ${apiResp.status}`);
            }
          } catch (apiErr) {
            console.warn(`[${jurisdiction.toUpperCase()}] API fallback -> GCS`, apiErr);
            const base =
              (_getPublicBaseUrl ? _getPublicBaseUrl() : undefined) ||
              process.env.NEXT_PUBLIC_PUBLIC_BASE_URL ||
              "https://storage.googleapis.com/lottosmartpicker-data";
            const primaryUrl = `${base}/${jurisdiction}/scratchers/index.latest.json`;
            const fallbackUrl = `/data/${jurisdiction}/scratchers/index.latest.json`;
            let resp = await fetch(primaryUrl, { cache: "no-store" });
            if (!resp.ok) resp = await fetch(fallbackUrl, { cache: "no-store" });
            if (!resp.ok) throw new Error(`Failed to load ${jurisdiction} scratchers index`);
            const payload = (await resp.json()) as ScratchersIndexPayload;
            games = Array.isArray(payload) ? payload : payload?.games ?? [];
          }
        }
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
    return () => {
      alive = false;
    };
  }, [jurisdiction]);

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


