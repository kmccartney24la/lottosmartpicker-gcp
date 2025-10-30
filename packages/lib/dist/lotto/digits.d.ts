import type { DigitRow, DigitRowEx, LogicalGameKey, WeightingRec } from './types.js';
/**
 * What digit-length does each logical game use?
 * Pure mapping; no runtime I/O.
 */
export declare function digitKFor(logical: LogicalGameKey): 2 | 3 | 4 | 5;
/** Basic stats for digit games (domain 0..9, repetition allowed). */
export declare function computeDigitStats(rows: DigitRow[], k: 3 | 4): {
    counts: any[];
    lastSeen: any[];
    totalDraws: number;
    k: 3 | 4;
    z: number[];
} | undefined;
/** Optional UI helper for PastDraws view (adds Fireball when present). */
export declare function toPastDrawsDigitsView(r: DigitRowEx, k: 2 | 3 | 4 | 5): {
    date: string;
    values: number[];
    sep?: boolean;
    special?: number;
    specialLabel?: string;
};
/**
 * Native digit-game hints (3 or 4 digits). Independent of GameKey.
 * Emits stable labels aligned with HINT_EXPLAIN.
 */
export declare function ticketHintsDigits(digits: number[], stats: ReturnType<typeof computeDigitStats>): string[];
/** Recommend weighting for digit games (domain 0–9, with replacement). */
export declare function recommendDigitsFromStats(stats: ReturnType<typeof computeDigitStats>): WeightingRec;
