// lib/scratchers.ts
// Aligns with scripts/scratchers/fetch_ga_scratchers.ts output
// IMPORTANT: Only import browser-safe helpers here.
import { getPublicBaseUrl, deriveBucketFromBaseUrl } from './gcs-public.js';
export const DEFAULT_WEIGHTS = {
    w_jackpot: 0.35,
    w_prizes: 0.30,
    w_odds: 0.25,
    w_price: 0.10,
    w_value: 0.00, // unused with current data shape
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
export function resolveIndexUrls() {
    const env = typeof process !== "undefined" ? process.env : {};
    // Highest-priority runtime base(s)
    const bases = [];
    const resolvedBase = (getPublicBaseUrl() || "").trim(); // PUBLIC_BASE_URL -> NEXT_* -> /api/file
    if (resolvedBase)
        bases.push(resolvedBase);
    // If a different NEXT_PUBLIC_* is set, consider it as a secondary base
    const altNextBase = (env.NEXT_PUBLIC_DATA_BASE ?? env.NEXT_PUBLIC_DATA_BASE_URL ?? "").trim();
    if (altNextBase && altNextBase !== resolvedBase)
        bases.push(altNextBase);
    // Legacy exact-file envs (if provided, we treat them as fully-qualified .json URLs)
    const legacyFileEnv = (env.GA_SCRATCHERS_INDEX_URL ?? env.NEXT_PUBLIC_GA_SCRATCHERS_INDEX_URL ?? "").trim();
    const legacyBaseEnv = (env.GA_SCRATCHERS_INDEX_BASE ?? env.NEXT_PUBLIC_GA_SCRATCHERS_INDEX_BASE ?? "").trim();
    const out = [];
    // If an exact file URL is provided, prefer its "latest" sibling first when applicable
    if (legacyFileEnv && /\.json(\?.*)?$/i.test(legacyFileEnv)) {
        const u = legacyFileEnv.replace(/\/+$/, "");
        if (u.endsWith("/index.json")) {
            out.push(u.replace(/\/index\.json$/, "/index.latest.json"), u);
        }
        else if (u.endsWith("/index.latest.json")) {
            out.push(u, u.replace(/\/index\.latest\.json$/, "/index.json"));
        }
        else {
            out.push(u);
        }
    }
    // Consider bases in the computed priority order
    const allBases = [
        ...bases,
        ...(legacyBaseEnv ? [legacyBaseEnv] : []), // legacy folder as a low-priority base
    ]
        .map((b) => b.trim())
        .filter(Boolean);
    // Expand a "base" (root, folder, or direct file)
    function expandBase(baseRaw) {
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
            `${base}/ga_scratchers/index.json`, // legacy fallback
        ];
    }
    for (const b of allBases) {
        for (const u of expandBase(b)) {
            if (!out.includes(u))
                out.push(u);
        }
    }
    // Local dev fallbacks (served from /public) — prefer canonical folder first
    for (const u of [
        "/data/ga/scratchers/index.latest.json",
        "/data/ga/scratchers/index.json",
        "/data/ga_scratchers/index.latest.json", // legacy local
        "/data/ga_scratchers/index.json", // legacy local
    ]) {
        if (!out.includes(u))
            out.push(u);
    }
    // Final hardcoded canonical fallback (public GCS) as a safety net
    // This matches: gs://<bucket>/ga/scratchers/{index.latest.json,index.json}
    const fallbackBase = `https://storage.googleapis.com/${deriveBucketFromBaseUrl()}`;
    const publicCanonical = `${fallbackBase}/ga/scratchers/index.latest.json`;
    const publicCanonicalArchive = `${fallbackBase}/ga/scratchers/index.json`;
    for (const u of [publicCanonical, publicCanonicalArchive]) {
        if (!out.includes(u))
            out.push(u);
    }
    return out;
}
// --- NY mirror (keeps GA logic untouched) ---
export function resolveNyIndexUrls() {
    const env = typeof process !== "undefined" ? process.env : {};
    const bases = [];
    const resolvedBase = (getPublicBaseUrl() || "").trim();
    if (resolvedBase)
        bases.push(resolvedBase);
    const altNextBase = (env.NEXT_PUBLIC_DATA_BASE ?? env.NEXT_PUBLIC_DATA_BASE_URL ?? "").trim();
    if (altNextBase && altNextBase !== resolvedBase)
        bases.push(altNextBase);
    const out = [];
    function expandBase(baseRaw) {
        const base = baseRaw.replace(/\/+$/, "");
        const isFile = /\.json(\?.*)?$/i.test(base);
        if (isFile) {
            if (base.endsWith("/index.json")) {
                return [base.replace(/\/index\.json$/, "/index.latest.json"), base];
            }
            if (base.endsWith("/index.latest.json")) {
                return [base, base.replace(/\/index\.latest\.json$/, "/index.json")];
            }
            return [base];
        }
        return [
            `${base}/ny/scratchers/index.latest.json`,
            `${base}/ny/scratchers/index.json`,
        ];
    }
    for (const b of bases) {
        for (const u of expandBase(b))
            if (!out.includes(u))
                out.push(u);
    }
    // Local dev fallbacks
    for (const u of [
        "/data/ny/scratchers/index.latest.json",
        "/data/ny/scratchers/index.json",
    ])
        if (!out.includes(u))
            out.push(u);
    // Public GCS fallback (derive bucket from the same helper as GA)
    const fallbackBase = `https://storage.googleapis.com/${deriveBucketFromBaseUrl()}`;
    for (const u of [
        `${fallbackBase}/ny/scratchers/index.latest.json`,
        `${fallbackBase}/ny/scratchers/index.json`,
    ])
        if (!out.includes(u))
            out.push(u);
    return out;
}
// -----------------------------
// Fetchers
// -----------------------------
/**
 * Fetch the current index of active games.
 * Tries latest first, falls back to archive. Returns the `games` array (active-only).
 */
export async function fetchScratchersWithCache() {
    try {
        // Always use the API route to proxy the request and handle CORS
        const res = await fetch('/api/scratchers', { cache: 'no-store' });
        if (!res.ok) {
            console.error('Failed to fetch scratchers from API route:', res.status, res.statusText);
            return [];
        }
        const payload = await res.json();
        // The API route should always return a payload with a 'games' array
        return payload.games ?? [];
    }
    catch (error) {
        console.error('Error fetching scratchers from API route:', error);
        return [];
    }
}
/**
 * Try each URL until one returns 200 with valid JSON.
 * Returns both the parsed `data` and the winning `url`.
 * Intended for **server-side** usage (API route).
 */
export async function fetchFirstAvailableJson(urls) {
    let lastErr;
    for (const url of urls) {
        try {
            const res = await fetch(url, { cache: "no-store" });
            if (!res.ok) {
                lastErr = new Error(`Fetch failed ${res.status} for ${url}`);
                continue;
            }
            const data = (await res.json());
            return { data, url };
        }
        catch (e) {
            lastErr = e;
        }
    }
    const err = new Error("No upstream responded with OK.");
    err.cause = lastErr;
    err.tried = urls;
    throw err;
}
/**
 * Fetch with delta info. Uses the delta arrays baked into the index payload.
 * `endedIds` is derived from deltaIndex. (Note: ended games are not emitted in `games`.)
 */
export async function fetchScratchersWithDelta() {
    for (const url of resolveIndexUrls()) {
        try {
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok)
                continue;
            const payload = await res.json();
            const games = payload.games ?? [];
            const endedIds = new Set(payload.deltaIndex?.ended ?? []);
            return { games, endedIds, updatedAt: payload.updatedAt };
        }
        catch {
            // keep trying
        }
    }
    return { games: [], endedIds: new Set() };
}
// -----------------------------
// Helpers for scoring/sorting/filtering
// -----------------------------
function minMax(values) {
    let lo = Infinity, hi = -Infinity;
    for (const v of values) {
        if (v < lo)
            lo = v;
        if (v > hi)
            hi = v;
    }
    return { lo, hi };
}
function normOrMid(x, lo, hi) {
    if (!isFinite(x))
        return 0.5;
    if (hi === lo)
        return 0.5;
    return (x - lo) / (hi - lo);
}
function pctTopPrizesRemain(g) {
    const orig = g.topPrizesOriginal ?? 0;
    const rem = g.topPrizesRemaining ?? 0;
    if (orig <= 0)
        return 0; // unknown → treat as 0% to be conservative in filters/scores
    return rem / orig;
}
function oddsForScoring(g) {
    // prefer adjustedOdds; fall back to overallOdds
    const adj = g.adjustedOdds ?? g.overallOdds;
    return adj && adj > 0 ? 1 / adj : 0; // larger is better in scoring
}
// -----------------------------
// Ranking
// -----------------------------
export function rankScratchers(games, w = DEFAULT_WEIGHTS) {
    // Build vectors
    const jackpotVals = games.map(g => g.topPrizeValue ?? 0);
    const prizePcts = games.map(pctTopPrizesRemain);
    const oddsInvs = games.map(oddsForScoring);
    const prices = games.map(g => g.price ?? 0);
    // Norm factors
    const { lo: jLo, hi: jHi } = minMax(jackpotVals);
    const { lo: pLo, hi: pHi } = minMax(prizePcts);
    const { lo: oLo, hi: oHi } = minMax(oddsInvs);
    const { lo: $Lo, hi: $Hi } = minMax(prices);
    const scored = games.map(g => {
        const jackpotN = normOrMid((g.topPrizeValue ?? 0), jLo, jHi);
        const prizesN = normOrMid(pctTopPrizesRemain(g), pLo, pHi);
        const oddsN = normOrMid(oddsForScoring(g), oLo, oHi);
        const priceN = normOrMid((g.price ?? 0), $Lo, $Hi);
        // w_value intentionally ignored (no per-tier total value with current data)
        const score = (w.w_jackpot * jackpotN +
            w.w_prizes * prizesN +
            w.w_odds * oddsN -
            w.w_price * priceN);
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
    byPrice(min, max) {
        const lo = min ?? 0;
        const hi = max ?? Number.POSITIVE_INFINITY;
        return (g) => {
            const p = g.price ?? Number.POSITIVE_INFINITY;
            return lo <= p && p <= hi;
        };
    },
    /** Min top-prize availability ratio (0..1). */
    minTopPrizeAvailability(pct) {
        return (g) => pctTopPrizesRemain(g) >= pct;
    },
    /** Minimum count of top prizes remaining. */
    minTopPrizesRemaining(n) {
        return (g) => (g.topPrizesRemaining ?? 0) >= n;
    },
    /** Search by name or game number. */
    search(q) {
        const s = q.trim().toLowerCase();
        if (!s)
            return (_) => true;
        return (g) => g.name.toLowerCase().includes(s) ||
            String(g.gameNumber).includes(s);
    },
    /** Show only 'new' or 'continuing'. If value is undefined, show all. */
    lifecycle(which) {
        if (!which)
            return (_) => true;
        return (g) => g.lifecycle === which;
    },
};
export function sorters(key, latestScores) {
    switch (key) {
        case 'best':
            return (a, b) => (latestScores?.find(s => s.game.gameNumber === b.gameNumber)?.score ?? 0) -
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
