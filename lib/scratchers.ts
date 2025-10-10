// lib/scratchers.ts
// Aligns with scripts/scratchers/fetch_ga_scratchers.ts output
// IMPORTANT: Only import browser-safe helpers here.
import { getPublicBaseUrl, deriveBucketFromBaseUrl } from './gcs-public';

// -----------------------------
// Types (from scraper)
// -----------------------------
export type ActiveGame = {
  gameNumber: number;                  // primary key
  name: string;                        // already normalized to UPPERCASE in scraper
  price: number | undefined;           // from Top Prizes
  topPrizeValue: number | undefined;   // from Top Prizes
  topPrizesOriginal: number | undefined;
  topPrizesRemaining: number | undefined;
  overallOdds: number | undefined;     // from modal
  adjustedOdds: number | undefined;    // heuristic
  startDate?: string;                  // modal (string as scraped)
  oddsImageUrl?: string;               // modal (optional)
  ticketImageUrl?: string;             // modal (optional)
  updatedAt: string;                   // Top Prizes “last updated”
  lifecycle?: 'new' | 'continuing';    // UI hint (derived in scraper)
};

// For backward compatibility with earlier UI code that referenced ScratcherGame:
export type ScratcherGame = ActiveGame;

export type DeltaIndex = {
  new: number[];           // gameNumbers present in index and new this run
  continuing: number[];    // gameNumbers in index and also in previous run
  ended: number[];         // (always empty in index payload, ended items are not emitted)
  counts: { index: number };
};

export type DeltaGrid = {
  new: number[];
  continuing: number[];
  ended: number[];
  counts: { grid: number; union: number };
};

export type ScratchersIndexPayload = {
  updatedAt: string;       // ISO
  count: number;           // games.length
  deltaGrid: DeltaGrid;
  deltaIndex: DeltaIndex;
  games: ActiveGame[];     // ONLY currently active games (ended not emitted)
};

// -----------------------------
// Scoring Weights (mapped to available fields)
// -----------------------------
export type Weights = {
  /** Weight for absolute top prize dollar value (higher value favored). */
  w_jackpot: number;

  /** Weight for (top prizes remaining / original) — proportion availability (higher favored). */
  w_prizes: number;

  /** Weight for odds — we use 1/(adjustedOdds || overallOdds) so larger is better. */
  w_odds: number;

  /** Penalty for higher ticket price (subtracted). */
  w_price: number;

  /**
   * Retained for compatibility; not used with current data (no per-tier total value).
   * Leave at 0 in defaults.
   */
  w_value: number;
};

export const DEFAULT_WEIGHTS: Weights = {
  w_jackpot: 0.35,
  w_prizes:  0.30,
  w_odds:    0.25,
  w_price:   0.10,
  w_value:   0.00, // unused with current data shape
};

// -----------------------------
// Data locations
// -----------------------------
/**
 * Resolve the best URLs to fetch the scratchers index from, with **runtime** priority.
 *
 * Priority order of bases:
 *  1) PUBLIC_BASE_URL (runtime, preferred)
 *  2) NEXT_PUBLIC_DATA_BASE (fallback if present)
 *  3) Legacy envs: GA_SCRATCHERS_INDEX_URL (exact file), GA_SCRATCHERS_INDEX_BASE (folder),
 *     and their NEXT_PUBLIC_* variants
 *  4) Local dev fallbacks under /public
 *  5) Final hardcoded canonical fallback to GCS (safety net)
 *
 * For each "base", we try BOTH filenames (prefer latest):
 *   /ga/scratchers/{index.latest.json,index.json}
 *   (Legacy fallback also tries /ga_scratchers/{index.latest.json,index.json})
 *
 * If an env already points to a **file** (ends with .json), we keep it as-is and
 * (if it’s index.json) we also try the "latest" sibling first.
 */
export function resolveIndexUrls(): string[] {
  const env =
    typeof process !== "undefined" ? (process.env as Record<string, string | undefined>) : {};

  // Highest-priority runtime base(s)
  const bases: string[] = [];
  const resolvedBase = (getPublicBaseUrl() || "").trim(); // PUBLIC_BASE_URL -> NEXT_* -> /api/file
  if (resolvedBase) bases.push(resolvedBase);
  // If a different NEXT_PUBLIC_* is set, consider it as a secondary base
  const altNextBase = (env.NEXT_PUBLIC_DATA_BASE ?? env.NEXT_PUBLIC_DATA_BASE_URL ?? "").trim();
  if (altNextBase && altNextBase !== resolvedBase) bases.push(altNextBase);

  // Legacy exact-file envs (if provided, we treat them as fully-qualified .json URLs)
  const legacyFileEnv =
    (env.GA_SCRATCHERS_INDEX_URL ?? env.NEXT_PUBLIC_GA_SCRATCHERS_INDEX_URL ?? "").trim();
  const legacyBaseEnv =
    (env.GA_SCRATCHERS_INDEX_BASE ?? env.NEXT_PUBLIC_GA_SCRATCHERS_INDEX_BASE ?? "").trim();

  const out: string[] = [];

  // If an exact file URL is provided, prefer its "latest" sibling first when applicable
  if (legacyFileEnv && /\.json(\?.*)?$/i.test(legacyFileEnv)) {
    const u = legacyFileEnv.replace(/\/+$/, "");
    if (u.endsWith("/index.json")) {
      out.push(u.replace(/\/index\.json$/, "/index.latest.json"), u);
    } else if (u.endsWith("/index.latest.json")) {
      out.push(u, u.replace(/\/index\.latest\.json$/, "/index.json"));
    } else {
      out.push(u);
    }
  }

  // Consider bases in the computed priority order
  const allBases: string[] = [
    ...bases,
    ...(legacyBaseEnv ? [legacyBaseEnv] : []), // legacy folder as a low-priority base
  ]
    .map((b) => b.trim())
    .filter(Boolean);

  // Expand a "base" (root, folder, or direct file)
  function expandBase(baseRaw: string): string[] {
    const base = baseRaw.replace(/\/+$/, ""); // strip trailing slash
    const isFile = /\.json(\?.*)?$/i.test(base);
    if (isFile) {
      // A second exact file was supplied as a "base" (rare but safe). Mirror the sibling logic.
      if (base.endsWith("/index.json")) {
        return [base.replace(/\/index\.json$/, "/index.latest.json"), base];
      }
      if (base.endsWith("/index.latest.json")) {
        return [base, base.replace(/\/index\.latest\.json$/, "/index.json")];
      }
      return [base];
    }

    // If base already includes a scratchers folder, only add file variants under that folder.
    const looksLikeScratchersFolder = /(\/ga\/scratchers|\/ga_scratchers)(\/|$)/.test(base);
    if (looksLikeScratchersFolder) {
      // Prefer canonical filenames
      const canon = [`${base}/index.latest.json`, `${base}/index.json`];
      return canon;
    }

    // Otherwise, treat base as the CDN/data root.
    // Prefer the **canonical** ga/scratchers path; then legacy ga_scratchers.
    return [
      `${base}/ga/scratchers/index.latest.json`,
      `${base}/ga/scratchers/index.json`,
      `${base}/ga_scratchers/index.latest.json`, // legacy fallback
      `${base}/ga_scratchers/index.json`,       // legacy fallback
    ];
  }

  for (const b of allBases) {
    for (const u of expandBase(b)) {
      if (!out.includes(u)) out.push(u);
    }
  }

  // Local dev fallbacks (served from /public) — prefer canonical folder first
  for (const u of [
    "/data/ga/scratchers/index.latest.json",
    "/data/ga/scratchers/index.json",
    "/data/ga_scratchers/index.latest.json", // legacy local
    "/data/ga_scratchers/index.json",        // legacy local
  ]) {
    if (!out.includes(u)) out.push(u);
  }

  // Final hardcoded canonical fallback (public GCS) as a safety net
  // This matches: gs://<bucket>/ga/scratchers/{index.latest.json,index.json}
  const fallbackBase = `https://storage.googleapis.com/${deriveBucketFromBaseUrl()}`;
  const publicCanonical = `${fallbackBase}/ga/scratchers/index.latest.json`;
  const publicCanonicalArchive = `${fallbackBase}/ga/scratchers/index.json`;
  for (const u of [publicCanonical, publicCanonicalArchive]) {
    if (!out.includes(u)) out.push(u);
  }

  return out;
}

// -----------------------------
// Fetchers
// -----------------------------

/**
 * Fetch the current index of active games.
 * Tries latest first, falls back to archive. Returns the `games` array (active-only).
 */
export async function fetchScratchersWithCache(): Promise<ActiveGame[]> {
  try {
    // Always use the API route to proxy the request and handle CORS
    const res = await fetch('/api/scratchers', { next: { revalidate: 3600 } as any, cache: 'no-store' as any });
    if (!res.ok) {
      console.error('Failed to fetch scratchers from API route:', res.status, res.statusText);
      return [];
    }
    const payload = await res.json() as ScratchersIndexPayload;
    // The API route should always return a payload with a 'games' array
    return payload.games ?? [];
  } catch (error) {
    console.error('Error fetching scratchers from API route:', error);
    return [];
  }
}

/**
 * Try each URL until one returns 200 with valid JSON.
 * Returns both the parsed `data` and the winning `url`.
 * Intended for **server-side** usage (API route).
 */
export async function fetchFirstAvailableJson<T = unknown>(
  urls: string[],
): Promise<{ data: T; url: string }> {
  let lastErr: unknown;
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        lastErr = new Error(`Fetch failed ${res.status} for ${url}`);
        continue;
      }
      const data = (await res.json()) as T;
      return { data, url };
    } catch (e) {
      lastErr = e;
    }
  }
  const err = new Error("No upstream responded with OK.");
  (err as any).cause = lastErr;
  (err as any).tried = urls;
  throw err;
}

/**
 * Fetch with delta info. Uses the delta arrays baked into the index payload.
 * `endedIds` is derived from deltaIndex. (Note: ended games are not emitted in `games`.)
 */
export async function fetchScratchersWithDelta(): Promise<{
  games: ActiveGame[];
  endedIds: Set<number>;
  updatedAt?: string;
}> {
  for (const url of resolveIndexUrls()) {
    try {
      const res = await fetch(url, { next: { revalidate: 3600 } as any, cache: 'no-store' as any });
      if (!res.ok) continue;
      const payload = await res.json() as ScratchersIndexPayload;
      const games = payload.games ?? [];
      const endedIds = new Set<number>(payload.deltaIndex?.ended ?? []);
      return { games, endedIds, updatedAt: payload.updatedAt };
    } catch {
      // keep trying
    }
  }
  return { games: [], endedIds: new Set<number>() };
}

// -----------------------------
// Helpers for scoring/sorting/filtering
// -----------------------------
function minMax(values: number[]) {
  let lo = Infinity, hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return { lo, hi };
}
function normOrMid(x: number, lo: number, hi: number) {
  if (!isFinite(x)) return 0.5;
  if (hi === lo) return 0.5;
  return (x - lo) / (hi - lo);
}
function pctTopPrizesRemain(g: ActiveGame): number {
  const orig = g.topPrizesOriginal ?? 0;
  const rem  = g.topPrizesRemaining ?? 0;
  if (orig <= 0) return 0; // unknown → treat as 0% to be conservative in filters/scores
  return rem / orig;
}
function oddsForScoring(g: ActiveGame): number {
  // prefer adjustedOdds; fall back to overallOdds
  const adj = g.adjustedOdds ?? g.overallOdds;
  return adj && adj > 0 ? 1 / adj : 0; // larger is better in scoring
}

// -----------------------------
// Ranking
// -----------------------------
export function rankScratchers(games: ActiveGame[], w: Weights = DEFAULT_WEIGHTS) {
  // Build vectors
  const jackpotVals = games.map(g => g.topPrizeValue ?? 0);
  const prizePcts   = games.map(pctTopPrizesRemain);
  const oddsInvs    = games.map(oddsForScoring);
  const prices      = games.map(g => g.price ?? 0);

  // Norm factors
  const { lo: jLo, hi: jHi } = minMax(jackpotVals);
  const { lo: pLo, hi: pHi } = minMax(prizePcts);
  const { lo: oLo, hi: oHi } = minMax(oddsInvs);
  const { lo: $Lo, hi: $Hi } = minMax(prices);

  const scored = games.map(g => {
    const jackpotN = normOrMid((g.topPrizeValue ?? 0), jLo, jHi);
    const prizesN  = normOrMid(pctTopPrizesRemain(g), pLo, pHi);
    const oddsN    = normOrMid(oddsForScoring(g), oLo, oHi);
    const priceN   = normOrMid((g.price ?? 0), $Lo, $Hi);

    // w_value intentionally ignored (no per-tier total value with current data)
    const score = (
      w.w_jackpot * jackpotN +
      w.w_prizes  * prizesN  +
      w.w_odds    * oddsN    -
      w.w_price   * priceN
    );

    return {
      game: g,
      score,
      parts: {
        jackpot: jackpotN,
        prizes: prizesN,
        odds: oddsN,
        price: priceN,
      }
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// -----------------------------
// Filters
// -----------------------------
export const filters = {
  byPrice(min?: number, max?: number) {
    const lo = min ?? 0;
    const hi = max ?? Number.POSITIVE_INFINITY;
    return (g: ActiveGame) => {
      const p = g.price ?? Number.POSITIVE_INFINITY;
      return lo <= p && p <= hi;
    };
  },

  /** Min top-prize availability ratio (0..1). */
  minTopPrizeAvailability(pct: number) {
    return (g: ActiveGame) => pctTopPrizesRemain(g) >= pct;
  },

  /** Minimum count of top prizes remaining. */
  minTopPrizesRemaining(n: number) {
    return (g: ActiveGame) => (g.topPrizesRemaining ?? 0) >= n;
  },

  /** Search by name or game number. */
  search(q: string) {
    const s = q.trim().toLowerCase();
    if (!s) return (_: ActiveGame) => true;
    return (g: ActiveGame) =>
      g.name.toLowerCase().includes(s) ||
      String(g.gameNumber).includes(s);
  },

  /** Show only 'new' or 'continuing'. If value is undefined, show all. */
  lifecycle(which?: 'new' | 'continuing') {
    if (!which) return (_: ActiveGame) => true;
    return (g: ActiveGame) => g.lifecycle === which;
  },
};

// -----------------------------
// Sorters
// -----------------------------
export type SortKey =
  | 'best'
  | 'adjusted'        // adjusted odds (asc; lower=better)
  | 'odds'            // printed odds (asc; lower=better)
  | 'topPrizeValue'   // top prize $ (desc)
  | 'topPrizesRemain' // remaining count (desc)
  | 'price'           // ticket price (asc)
  | 'launch';         // startDate (desc; newest first)

export function sorters(key: SortKey, latestScores?: ReturnType<typeof rankScratchers>) {
  switch (key) {
    case 'best':
      return (a: ActiveGame, b: ActiveGame) =>
        (latestScores?.find(s => s.game.gameNumber === b.gameNumber)?.score ?? 0) -
        (latestScores?.find(s => s.game.gameNumber === a.gameNumber)?.score ?? 0);

    case 'adjusted':
      return (a, b) => (a.adjustedOdds ?? Number.POSITIVE_INFINITY) - (b.adjustedOdds ?? Number.POSITIVE_INFINITY);

    case 'odds':
      return (a, b) => (a.overallOdds ?? Number.POSITIVE_INFINITY) - (b.overallOdds ?? Number.POSITIVE_INFINITY);

    case 'topPrizeValue':
      return (a, b) => (b.topPrizeValue ?? -Infinity) - (a.topPrizeValue ?? -Infinity);

    case 'topPrizesRemain':
      return (a, b) => (b.topPrizesRemaining ?? -Infinity) - (a.topPrizesRemaining ?? -Infinity);

    case 'price':
      return (a, b) => (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY);

    case 'launch':
      // Keep newest first; fall back to empty string (lowest)
      return (a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? '');
  }
}
