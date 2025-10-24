export type ActiveGame = {
    gameNumber: number;
    name: string;
    price: number | undefined;
    topPrizeValue: number | undefined;
    topPrizesOriginal: number | undefined;
    topPrizesRemaining: number | undefined;
    overallOdds: number | undefined;
    adjustedOdds: number | undefined;
    startDate?: string;
    oddsImageUrl?: string;
    ticketImageUrl?: string;
    updatedAt: string;
    lifecycle?: 'new' | 'continuing';
};
export type ScratcherGame = ActiveGame;
export type DeltaIndex = {
    new: number[];
    continuing: number[];
    ended: number[];
    counts: {
        index: number;
    };
};
export type DeltaGrid = {
    new: number[];
    continuing: number[];
    ended: number[];
    counts: {
        grid: number;
        union: number;
    };
};
export type ScratchersIndexPayload = {
    updatedAt: string;
    count: number;
    deltaGrid: DeltaGrid;
    deltaIndex: DeltaIndex;
    games: ActiveGame[];
};
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
export declare const DEFAULT_WEIGHTS: Weights;
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
export declare function resolveIndexUrls(): string[];
export declare function resolveNyIndexUrls(): string[];
/**
 * Fetch the current index of active games.
 * Tries latest first, falls back to archive. Returns the `games` array (active-only).
 */
export declare function fetchScratchersWithCache(): Promise<ActiveGame[]>;
/**
 * Try each URL until one returns 200 with valid JSON.
 * Returns both the parsed `data` and the winning `url`.
 * Intended for **server-side** usage (API route).
 */
export declare function fetchFirstAvailableJson<T = unknown>(urls: string[]): Promise<{
    data: T;
    url: string;
}>;
/**
 * Fetch with delta info. Uses the delta arrays baked into the index payload.
 * `endedIds` is derived from deltaIndex. (Note: ended games are not emitted in `games`.)
 */
export declare function fetchScratchersWithDelta(): Promise<{
    games: ActiveGame[];
    endedIds: Set<number>;
    updatedAt?: string;
}>;
export declare function rankScratchers(games: ActiveGame[], w?: Weights): {
    game: ActiveGame;
    score: number;
    parts: {
        jackpot: number;
        prizes: number;
        odds: number;
        price: number;
    };
}[];
export declare const filters: {
    byPrice(min?: number, max?: number): (g: ActiveGame) => boolean;
    /** Min top-prize availability ratio (0..1). */
    minTopPrizeAvailability(pct: number): (g: ActiveGame) => boolean;
    /** Minimum count of top prizes remaining. */
    minTopPrizesRemaining(n: number): (g: ActiveGame) => boolean;
    /** Search by name or game number. */
    search(q: string): (_: ActiveGame) => boolean;
    /** Show only 'new' or 'continuing'. If value is undefined, show all. */
    lifecycle(which?: "new" | "continuing"): (_: ActiveGame) => boolean;
};
export type SortKey = 'best' | 'adjusted' | 'odds' | 'topPrizeValue' | 'topPrizesRemain' | 'price' | 'launch';
export declare function sorters(key: SortKey, latestScores?: ReturnType<typeof rankScratchers>): ((a: ActiveGame, b: ActiveGame) => number) | ((a: any, b: any) => any);
