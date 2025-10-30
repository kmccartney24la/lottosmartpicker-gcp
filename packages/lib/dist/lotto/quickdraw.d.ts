import type { QuickDrawRow } from './types.js';
/** Stats for Quick Draw (Keno-style, 20-from-80). */
export declare function computeQuickDrawStats(rows: QuickDrawRow[]): {
    counts: Map<number, number>;
    lastSeen: Map<number, number>;
    totalDraws: number;
    z: Map<number, number>;
} | undefined;
/** Weight builder for Quick Draw (hot/cold + alpha blend). */
export declare function buildQuickDrawWeights(stats: ReturnType<typeof computeQuickDrawStats>, mode: 'hot' | 'cold', alpha: number): number[];
/** Ticket generator for Quick Draw. */
export declare function generateQuickDrawTicket(stats: ReturnType<typeof computeQuickDrawStats>, spots: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10, opts: {
    mode: 'hot' | 'cold';
    alpha: number;
}): number[];
/** Recommend weighting for Quick Draw (20-from-80). */
export declare function recommendQuickDrawFromStats(stats: ReturnType<typeof computeQuickDrawStats>): {
    mode: 'hot' | 'cold';
    alpha: number;
};
/** Spots-aware top-prize odds (hit-all) for Quick Draw. */
export declare function jackpotOddsQuickDraw(spots: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10): number;
