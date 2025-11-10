import type { GameKey, LogicalGameKey, Period, LottoRow, DigitRowEx, Pick10Row, QuickDrawRow, CashPopRow, AllOrNothingRow, SocrataGame, CashPopPeriod, DigitRow } from './types.js';
import { computePick10Stats, buildPick10Weights, generatePick10Ticket, ticketHintsPick10, computeAllOrNothingStats, generateAllOrNothingTicket, recommendAllOrNothingFromStats } from './pick10.js';
import { computeQuickDrawStats, buildQuickDrawWeights, generateQuickDrawTicket, recommendQuickDrawFromStats, jackpotOddsQuickDraw } from './quickdraw.js';
export declare function formatISO(d: Date): string;
export declare function lastYearRange(): {
    since: string;
    until: string;
};
export declare function buildWhere(dateField: string, since?: string, until?: string): string | undefined;
export declare function computeNextRefreshISO(_game?: GameKey): string;
export declare function fetchRowsWithCache(options: {
    game: GameKey;
    since?: string;
    until?: string;
    latestOnly?: boolean;
    token?: string;
}): Promise<LottoRow[]>;
export declare const SOCRATA_BASE = "https://data.ny.gov/resource";
export declare const DATASETS: Record<SocrataGame, {
    id: string;
    dateField: string;
    winningField: string;
    specialField?: string;
}>;
export declare function fetchNY(options: {
    game: GameKey;
    since?: string;
    until?: string;
    latestOnly?: boolean;
    token?: string;
}): Promise<LottoRow[]>;
/** Merge one or more underlying files into canonical LottoRow "shims". */
export declare function fetchLogicalRows(opts: {
    logical: LogicalGameKey;
    period: Period;
    since?: string;
    until?: string;
}): Promise<LottoRow[]>;
export declare function fetchDigitRowsFor(logical: 'ny_numbers' | 'ny_win4' | 'fl_pick5' | 'fl_pick4' | 'fl_pick3' | 'fl_pick2' | 'ca_daily3' | 'ca_daily4' | 'tx_pick3' | 'tx_daily4', period: Period): Promise<DigitRowEx[]>;
export declare function fetchPick10RowsFor(logical: 'ny_pick10'): Promise<Pick10Row[]>;
export { computePick10Stats, buildPick10Weights, generatePick10Ticket, ticketHintsPick10 };
export declare function fetchAllOrNothingRows(period: 'morning' | 'day' | 'evening' | 'night' | 'all'): Promise<AllOrNothingRow[]>;
export declare function fetchAllOrNothingRowsFor(logical: 'tx_all_or_nothing', period: 'morning' | 'day' | 'evening' | 'night' | 'all'): Promise<AllOrNothingRow[]>;
export { computeAllOrNothingStats, generateAllOrNothingTicket, recommendAllOrNothingFromStats, };
export declare function computeAllOrNothingStatsAsync(rows: AllOrNothingRow[], signal?: AbortSignal): Promise<{
    counts: Map<number, number>;
    lastSeen: Map<number, number>;
    totalDraws: number;
    z: Map<number, number>;
}>;
export declare function generateAllOrNothingTicketAsync(stats: ReturnType<typeof computeAllOrNothingStats>, opts: {
    mode: 'hot' | 'cold';
    alpha: number;
}, signal?: AbortSignal): Promise<number[]>;
export declare function fetchQuickDrawRowsFor(logical: 'ny_quick_draw'): Promise<QuickDrawRow[]>;
export { computeQuickDrawStats, buildQuickDrawWeights, generateQuickDrawTicket, recommendQuickDrawFromStats, jackpotOddsQuickDraw };
export declare function fetchCashPopRows(period: CashPopPeriod | 'all'): Promise<CashPopRow[]>;
type EraOverride = {
    mainMax: number;
    specialMax: number;
    mainPick: number;
};
export declare function computeStatsAsync(rows: LottoRow[], game: GameKey, override?: EraOverride, signal?: AbortSignal): Promise<any>;
export declare function analyzeGameAsync(rows: LottoRow[], game: GameKey, signal?: AbortSignal): Promise<any>;
export declare function generateTicketAsync(rows: LottoRow[], game: GameKey, opts: {
    modeMain: 'hot' | 'cold';
    modeSpecial: 'hot' | 'cold';
    alphaMain: number;
    alphaSpecial: number;
    avoidCommon: boolean;
}, override?: EraOverride, signal?: AbortSignal): Promise<{
    mains: number[];
    special: number;
} | {
    mains: number[];
    special?: undefined;
}>;
export declare function computeDigitStatsAsync(rows: DigitRow[], k: 2 | 3 | 4 | 5, signal?: AbortSignal): Promise<{
    counts: any[];
    lastSeen: any[];
    totalDraws: number;
    k: 5 | 4 | 2 | 3;
    z: number[];
}>;
export declare function computePick10StatsAsync(rows: Pick10Row[], signal?: AbortSignal): Promise<{
    counts: Map<number, number>;
    lastSeen: Map<number, number>;
    totalDraws: number;
    z: Map<number, number>;
}>;
export declare function computeQuickDrawStatsAsync(rows: QuickDrawRow[], signal?: AbortSignal): Promise<{
    counts: Map<number, number>;
    lastSeen: Map<number, number>;
    totalDraws: number;
    z: Map<number, number>;
}>;
export declare function generatePick10TicketAsync(stats: ReturnType<typeof computePick10Stats>, opts: {
    mode: 'hot' | 'cold';
    alpha: number;
}, signal?: AbortSignal): Promise<number[]>;
export declare function generateQuickDrawTicketAsync(stats: ReturnType<typeof computeQuickDrawStats>, spots: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10, opts: {
    mode: 'hot' | 'cold';
    alpha: number;
}, signal?: AbortSignal): Promise<number[]>;
export declare function defaultSinceFor(game: GameKey): string | null;
