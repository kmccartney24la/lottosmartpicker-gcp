import type { Pick10Row, WeightingRec } from './types.js';
/** Basic stats for Pick 10 (10-from-80). */
export declare function computePick10Stats(rows: Pick10Row[]): {
    counts: Map<number, number>;
    lastSeen: Map<number, number>;
    totalDraws: number;
    z: Map<number, number>;
} | undefined;
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
