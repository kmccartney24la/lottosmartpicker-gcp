import type { GameKey, LogicalGameKey, LottoRow } from './types.js';
export declare function computeStats(rows: LottoRow[], game: GameKey, overrideCfg?: {
    mainMax: number;
    specialMax: number;
    mainPick: number;
}): any;
export declare function buildWeights(domainMax: number, counts: Map<number, number>, mode: 'hot' | 'cold', alpha: number): number[];
export declare function weightedSampleDistinct(k: number, weights: number[]): number[];
export declare function looksTooCommon(mains: number[], game: GameKey): boolean;
export declare function ticketHints(game: GameKey, mains: number[], special: number, stats: ReturnType<typeof computeStats>): string[];
/** Small helper kept with hints to keep fetch.ts analytics-free. */
export declare function evaluateTicket(game: GameKey, mains: number[], special: number | 0, stats: ReturnType<typeof computeStats>): string[];
export declare function generateTicket(rows: LottoRow[], game: GameKey, opts: {
    modeMain: 'hot' | 'cold';
    modeSpecial: 'hot' | 'cold';
    alphaMain: number;
    alphaSpecial: number;
    avoidCommon: boolean;
}, overrideCfg?: {
    mainMax: number;
    specialMax: number;
    mainPick: number;
}): {
    mains: number[];
    special: number;
} | {
    mains: number[];
    special?: undefined;
};
export declare function analyzeGame(rows: LottoRow[], game: GameKey): any;
export declare function nCk(n: number, k: number): number;
export declare function jackpotOdds(game: GameKey): number;
export declare function jackpotOddsForLogical(logical: LogicalGameKey): number | null;
export declare function weightedSampleDistinctFromWeights(k: number, weights: number[]): number[];
export declare function coefVar(values: number[]): number;
export declare function recommendFromDispersion(cv: number, domain: 'main' | 'special'): {
    mode: 'hot' | 'cold';
    alpha: number;
};
/** Clamp alpha for non-era domains where we don't have (mainMax,specialMax) */
export declare function clampAlphaGeneric(alpha: number, draws: number, domainSize: number, lo: number, hi: number): number;
export declare function clampAlphaFor(game: GameKey, domain: 'main' | 'special', alpha: number, draws: number): number;
