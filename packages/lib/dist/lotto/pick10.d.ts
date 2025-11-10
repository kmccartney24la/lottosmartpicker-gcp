import type { Pick10Row, AllOrNothingRow, WeightingRec } from './types.js';
type KOfNRow = {
    values: number[];
};
/** Core stats for any k-of-N set game (values are 1..N). Skips malformed rows. */
export declare function computeKOfNStats<T extends KOfNRow>(rows: T[], k: number, N: number): {
    counts: Map<number, number>;
    lastSeen: Map<number, number>;
    totalDraws: number;
    z: Map<number, number>;
};
/** Weight builder for any k-of-N game (hot/cold + alpha blend). */
export declare function buildKOfNWeights(stats: ReturnType<typeof computeKOfNStats>, N: number, mode: 'hot' | 'cold', alpha: number): number[];
/** Ticket generator for any k-of-N game. */
export declare function generateKOfNTicket(stats: ReturnType<typeof computeKOfNStats>, k: number, N: number, opts: {
    mode: 'hot' | 'cold';
    alpha: number;
}): number[];
/** Recommend weighting for any k-of-N game. */
export declare function recommendKOfNFromStats(stats: ReturnType<typeof computeKOfNStats>, N: number): WeightingRec;
/** Basic stats for Pick 10 (10-from-80). */
export declare function computePick10Stats(rows: Pick10Row[]): {
    counts: Map<number, number>;
    lastSeen: Map<number, number>;
    totalDraws: number;
    z: Map<number, number>;
};
/** Weight builder for Pick 10 (hot/cold + alpha blend). */
export declare function buildPick10Weights(stats: ReturnType<typeof computePick10Stats>, mode: 'hot' | 'cold', alpha: number): number[];
/** Ticket generator for Pick 10, using weights. */
export declare function generatePick10Ticket(stats: ReturnType<typeof computePick10Stats>, opts: {
    mode: 'hot' | 'cold';
    alpha: number;
}): number[];
/** Pattern-style hints for Pick 10 (UI sugar). */
export declare function ticketHintsPick10(values: number[], stats: ReturnType<typeof computePick10Stats>): string[];
/** Recommend weighting for Pick 10 (10-from-80). */
export declare function recommendPick10FromStats(stats: ReturnType<typeof computePick10Stats>): WeightingRec;
/** Stats for All or Nothing (12-from-24). */
export declare function computeAllOrNothingStats(rows: AllOrNothingRow[]): {
    counts: Map<number, number>;
    lastSeen: Map<number, number>;
    totalDraws: number;
    z: Map<number, number>;
};
/** Weights for All or Nothing (12-from-24). */
export declare function buildAllOrNothingWeights(stats: ReturnType<typeof computeAllOrNothingStats>, mode: 'hot' | 'cold', alpha: number): number[];
/** Ticket generator for All or Nothing (12-from-24). */
export declare function generateAllOrNothingTicket(stats: ReturnType<typeof computeAllOrNothingStats>, opts: {
    mode: 'hot' | 'cold';
    alpha: number;
}): number[];
/** Recommendation for All or Nothing; reuse generic k-of-N tuning, N=24. */
export declare function recommendAllOrNothingFromStats(stats: ReturnType<typeof computeAllOrNothingStats>): WeightingRec;
export {};
