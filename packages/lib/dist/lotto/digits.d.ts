import type { DigitRow, DigitRowEx, LogicalGameKey, WeightingRec } from './types.js';
/**
 * What digit-length does each logical game use?
 * Pure mapping; no runtime I/O.
 */
export declare function digitKFor(logical: LogicalGameKey): 2 | 3 | 4 | 5;
export declare function computeDigitStats(rows: DigitRow[], k: 2 | 3 | 4 | 5): {
    counts: any[];
    lastSeen: any[];
    totalDraws: number;
    k: 5 | 4 | 2 | 3;
    z: number[];
};
/** Optional UI helper for PastDraws view (adds Fireball when present). */
export declare function toPastDrawsDigitsView(r: DigitRowEx, k: 2 | 3 | 4 | 5): {
    date: string;
    values: number[];
    sep?: boolean;
    special?: number;
    specialLabel?: string;
};
export declare function isPalindrome(d: number[]): boolean;
export declare function longestRunLen(d: number[]): number;
/** Max digit multiplicity (e.g., AAAB → 3). */
export declare function maxMultiplicity(d: number[]): number;
export declare function digitSum(d: number[]): number;
/** Multiset permutation count for a k-digit selection (with replacement). */
export declare function multisetPermutationsCount(d: number[]): number;
/** Build a "<N>-Way Box" label. */
export declare function wayLabel(n: number, base?: 'Box'): string;
/** Box variant label from the digits themselves. */
export declare function boxVariantLabel(digits: number[], k: 2 | 3 | 4 | 5): string | null;
/** "Straight" when all digits equal (AA, AAA, AAAA, AAAAA). */
export declare function straightOnlyLabel(digits: number[], k: 2 | 3 | 4 | 5): string | null;
/**
 * Native digit-game hints (3 or 4 digits). Independent of GameKey.
 * Emits stable labels aligned with HINT_EXPLAIN.
 */
export declare function ticketHintsDigits(digits: number[], stats: ReturnType<typeof computeDigitStats>): string[];
/** Recommend weighting for digit games (domain 0–9, with replacement). */
export declare function recommendDigitsFromStats(stats: ReturnType<typeof computeDigitStats>): WeightingRec;
