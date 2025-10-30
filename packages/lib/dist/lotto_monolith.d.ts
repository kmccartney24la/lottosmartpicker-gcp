export type GameKey = 'multi_powerball' | 'multi_megamillions' | 'multi_cash4life' | 'ga_fantasy5' | 'ca_superlotto_plus' | 'ca_fantasy5' | 'fl_lotto' | 'fl_jackpot_triple_play' | 'fl_fantasy5_midday' | 'fl_fantasy5_evening' | 'fl_pick5_midday' | 'fl_pick5_evening' | 'fl_pick4_midday' | 'fl_pick4_evening' | 'fl_pick3_midday' | 'fl_pick3_evening' | 'fl_pick2_midday' | 'fl_pick2_evening' | 'ny_nylotto' | 'ny_numbers_midday' | 'ny_numbers_evening' | 'ny_win4_midday' | 'ny_win4_evening' | 'ny_pick10' | 'ny_take5_midday' | 'ny_take5_evening' | 'ny_quick_draw' | 'ny_take5' | 'ny_numbers' | 'ny_win4' | 'ny_lotto' | 'ny_quick_draw_rep' | 'ny_pick10_rep' | 'tx_lotto_texas' | 'tx_texas_two_step' | 'tx_cash5';
export type LogicalGameKey = 'ny_take5' | 'ny_numbers' | 'ny_win4' | 'ny_lotto' | 'ny_pick10' | 'ny_quick_draw' | 'ca_superlotto_plus' | 'ca_fantasy5' | 'ca_daily3' | 'ca_daily4' | 'fl_cashpop' | 'fl_fantasy5' | 'fl_pick5' | 'fl_pick4' | 'fl_pick3' | 'fl_pick2' | 'tx_all_or_nothing' | 'tx_pick3' | 'tx_daily4' | 'multi_powerball' | 'multi_megamillions' | 'multi_cash4life';
export type CashPopPeriod = 'morning' | 'matinee' | 'afternoon' | 'evening' | 'latenight';
export type Period = 'midday' | 'evening' | 'day' | 'night' | 'both' | 'all' | CashPopPeriod;
export type EraGame = 'multi_powerball' | 'multi_megamillions' | 'multi_cash4life' | 'ga_fantasy5' | 'ca_superlotto_plus' | 'ca_fantasy5' | 'ny_take5' | 'ny_lotto' | 'fl_fantasy5' | 'fl_lotto' | 'fl_jackpot_triple_play' | 'tx_lotto_texas' | 'tx_cash5';
export type SocrataGame = 'multi_powerball' | 'multi_megamillions' | 'multi_cash4life';
export type ScheduleGame = 'multi_powerball' | 'multi_megamillions' | 'multi_cash4life' | 'ga_fantasy5' | 'ca_superlotto_plus' | 'ca_fantasy5' | 'fl_fantasy5' | 'ny_take5';
export type UnderlyingKey = GameKey | 'ny_take5_midday' | 'ny_take5_evening' | 'ny_numbers_midday' | 'ny_numbers_evening' | 'ny_win4_midday' | 'ny_win4_evening' | 'ny_nylotto' | 'ny_pick10' | 'ny_quick_draw' | 'fl_cashpop_morning' | 'fl_cashpop_matinee' | 'fl_cashpop_afternoon' | 'fl_cashpop_evening' | 'fl_cashpop_latenight' | 'ca_daily3_midday' | 'ca_daily3_evening' | 'ca_daily4' | 'tx_all_or_nothing_morning' | 'tx_all_or_nothing_day' | 'tx_all_or_nothing_evening' | 'tx_all_or_nothing_night' | 'tx_pick3_morning' | 'tx_pick3_day' | 'tx_pick3_evening' | 'tx_pick3_night' | 'tx_daily4_morning' | 'tx_daily4_day' | 'tx_daily4_evening' | 'tx_daily4_night';
export declare const FEATURES: {
    readonly DIGIT_HINTS: boolean;
    readonly PICK10: boolean;
};
type PeriodMap = {
    all: UnderlyingKey[];
    midday?: UnderlyingKey[];
    evening?: UnderlyingKey[];
    both?: UnderlyingKey[];
    morning?: UnderlyingKey[];
    matinee?: UnderlyingKey[];
    afternoon?: UnderlyingKey[];
    latenight?: UnderlyingKey[];
    day?: UnderlyingKey[];
    night?: UnderlyingKey[];
};
export declare const LOGICAL_TO_UNDERLYING: Record<LogicalGameKey, PeriodMap>;
export declare function underlyingKeysFor(logical: LogicalGameKey, period: Period): UnderlyingKey[];
export declare function primaryKeyFor(logical: LogicalGameKey, period: Period): UnderlyingKey;
export type LottoRow = {
    game: GameKey;
    date: string;
    n1: number;
    n2: number;
    n3: number;
    n4: number;
    n5: number;
    special?: number;
};
export declare class NonCanonicalGameError extends Error {
    code: string;
    constructor(msg?: string);
}
/** Canonical Next API endpoints per game (remote-first to GCS, no-store). */
export declare const GAME_TO_API_PATH: Readonly<Record<GameKey, string>>;
export declare function apiPathForGame(game: GameKey): string;
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
export declare const DRAW_DOWS: Record<ScheduleGame, Set<number>>;
export type EraConfig = {
    start: string;
    mainMax: number;
    specialMax: number;
    mainPick: number;
    label: string;
    description: string;
};
export declare const CURRENT_ERA: Record<EraGame, EraConfig>;
export declare function getCurrentEraConfig(game: GameKey): EraConfig;
export declare function filterRowsForCurrentEra(rows: LottoRow[], game: GameKey): LottoRow[];
export declare function eraTooltipFor(game: GameKey): string;
export declare function formatISO(d: Date): string;
export declare function lastYearRange(): {
    since: string;
    until: string;
};
export declare function buildWhere(dateField: string, since?: string, until?: string): string | undefined;
export declare function normalizeRowsLoose(rows: any[]): LottoRow[];
export declare function parseTokens(s: string): number[];
export declare function fetchNY(options: {
    game: GameKey;
    since?: string;
    until?: string;
    latestOnly?: boolean;
    token?: string;
}): Promise<LottoRow[]>;
export declare function parseCanonicalCsv(csv: string, game: GameKey): LottoRow[];
type FlexibleRow = {
    date: string;
    values: number[];
    special?: number;
};
export declare function parseFlexibleCsv(csv: string): FlexibleRow[];
export declare function fetchDigitRowsFor(logical: 'ny_numbers' | 'ny_win4' | 'fl_pick5' | 'fl_pick4' | 'fl_pick3' | 'fl_pick2' | 'ca_daily3' | 'ca_daily4' | 'tx_pick3' | 'tx_daily4', period: Period): Promise<DigitRowEx[]>;
export declare function toPastDrawsDigitsView(r: DigitRowEx, k: 2 | 3 | 4 | 5): {
    date: string;
    values: number[];
    sep?: boolean;
    special?: number;
    specialLabel?: string;
};
export declare function fetchPick10RowsFor(logical: 'ny_pick10'): Promise<Pick10Row[]>;
/**
 * Fetch & merge rows for a logical game + period.
 * - Canonical sources: uses fetchRowsWithCache (keeps cache/era logic).
 * - Flexible sources: reads CSV via same-origin API and parses dynamically.
 * - Returns LottoRow "shims" for flexible games (first 5 mains + optional special) so existing UI works.
 */
export declare function fetchLogicalRows(opts: {
    logical: LogicalGameKey;
    period: Period;
    since?: string;
    until?: string;
}): Promise<LottoRow[]>;
/** Human-friendly schedule label derived from DRAW_DOWS + GAME_TIME_INFO. */
export declare function drawNightsLabel(game: GameKey, now?: Date): string;
/** Returns true if we’re within a ±90 minute window around the game’s local draw time on a valid draw day. */
export declare function isInDrawWindowFor(game: GameKey, now?: Date): boolean;
/** Builds a label like "Wed 6:30 PM PT" for the next draw in the game’s local timezone. */
export declare function nextDrawLabelFor(game: GameKey, now?: Date): string;
export declare function evaluateTicket(game: GameKey, mains: number[], special: number | 0, stats: ReturnType<typeof computeStats>): string[];
export declare function computeStats(rows: LottoRow[], game: GameKey, overrideCfg?: {
    mainMax: number;
    specialMax: number;
    mainPick: number;
}): any;
export declare function buildWeights(domainMax: number, counts: Map<number, number>, mode: 'hot' | 'cold', alpha: number): number[];
export declare function weightedSampleDistinct(k: number, weights: number[]): number[];
export declare function looksTooCommon(mains: number[], game: GameKey): boolean;
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
export declare const USE_WORKER: boolean;
type EraOverride = {
    mainMax: number;
    specialMax: number;
    mainPick: number;
};
export declare function parseCanonicalCsvAsync(csv: string, game: GameKey, signal?: AbortSignal): Promise<LottoRow[]>;
export declare function parseFlexibleCsvAsync(csv: string, signal?: AbortSignal): Promise<FlexibleRow[]>;
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
export declare function computeDigitStatsAsync(rows: DigitRow[], k: 3 | 4, signal?: AbortSignal): Promise<{
    counts: any[];
    lastSeen: any[];
    totalDraws: number;
    k: 3 | 4;
    z: number[];
} | undefined>;
export declare function computePick10StatsAsync(rows: Pick10Row[], signal?: AbortSignal): Promise<{
    counts: Map<number, number>;
    lastSeen: Map<number, number>;
    totalDraws: number;
    z: Map<number, number>;
} | undefined>;
export declare function computeQuickDrawStatsAsync(rows: QuickDrawRow[], signal?: AbortSignal): Promise<{
    counts: Map<number, number>;
    lastSeen: Map<number, number>;
    totalDraws: number;
    z: Map<number, number>;
} | undefined>;
export declare function generatePick10TicketAsync(stats: ReturnType<typeof computePick10Stats>, opts: {
    mode: 'hot' | 'cold';
    alpha: number;
}, signal?: AbortSignal): Promise<number[]>;
export declare function generateQuickDrawTicketAsync(stats: ReturnType<typeof computeQuickDrawStats>, spots: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10, opts: {
    mode: 'hot' | 'cold';
    alpha: number;
}, signal?: AbortSignal): Promise<number[]>;
export declare function defaultSinceFor(game: GameKey): string | null;
export declare function ticketHints(game: GameKey, mains: number[], special: number, stats: ReturnType<typeof computeStats>): string[];
export type DigitRow = {
    date: string;
    digits: number[];
};
export type DigitRowEx = DigitRow & {
    fb?: number;
};
export declare function digitKFor(logical: LogicalGameKey): 2 | 3 | 4 | 5;
export declare function computeDigitStats(rows: DigitRow[], k: 3 | 4): {
    counts: any[];
    lastSeen: any[];
    totalDraws: number;
    k: 3 | 4;
    z: number[];
} | undefined;
/**
 * Native digit-game hints (3 or 4 digits). Independent of GameKey.
 * Emits stable labels aligned with HINT_EXPLAIN.
 */
export declare function ticketHintsDigits(digits: number[], stats: ReturnType<typeof computeDigitStats>): string[];
export type Pick10Row = {
    date: string;
    values: number[];
};
export type QuickDrawRow = {
    date: string;
    values: number[];
};
export declare function computePick10Stats(rows: Pick10Row[]): {
    counts: Map<number, number>;
    lastSeen: Map<number, number>;
    totalDraws: number;
    z: Map<number, number>;
} | undefined;
export type CashPopRow = {
    date: string;
    value: number;
};
export type AllOrNothingRow = {
    date: string;
    values: number[];
};
export declare function fetchAllOrNothingRows(period: 'morning' | 'day' | 'evening' | 'night' | 'all'): Promise<AllOrNothingRow[]>;
export declare function computeQuickDrawStats(rows: QuickDrawRow[]): {
    counts: Map<number, number>;
    lastSeen: Map<number, number>;
    totalDraws: number;
    z: Map<number, number>;
} | undefined;
export declare function buildPick10Weights(stats: ReturnType<typeof computePick10Stats>, mode: 'hot' | 'cold', alpha: number): number[];
export declare function buildQuickDrawWeights(stats: ReturnType<typeof computeQuickDrawStats>, mode: 'hot' | 'cold', alpha: number): number[];
export declare function generateQuickDrawTicket(stats: ReturnType<typeof computeQuickDrawStats>, spots: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10, opts: {
    mode: 'hot' | 'cold';
    alpha: number;
}): number[];
export declare function weightedSampleDistinctFromWeights(k: number, weights: number[]): number[];
export declare function generatePick10Ticket(stats: ReturnType<typeof computePick10Stats>, opts: {
    mode: 'hot' | 'cold';
    alpha: number;
}): number[];
/** Recommend weighting for Quick Draw (20-from-80). */
export declare function recommendQuickDrawFromStats(stats: ReturnType<typeof computeQuickDrawStats>): WeightingRec;
export declare function ticketHintsPick10(values: number[], stats: ReturnType<typeof computePick10Stats>): string[];
export declare function coefVar(values: number[]): number;
export declare function recommendFromDispersion(cv: number, domain: 'main' | 'special'): {
    mode: 'hot' | 'cold';
    alpha: number;
};
export type WeightingRec = {
    mode: 'hot' | 'cold';
    alpha: number;
};
/** Recommend weighting for digits (domain 0–9, with replacement). */
export declare function recommendDigitsFromStats(stats: ReturnType<typeof computeDigitStats>): WeightingRec;
/** Recommend weighting for Pick 10 (10-from-80). */
export declare function recommendPick10FromStats(stats: ReturnType<typeof computePick10Stats>): WeightingRec;
export declare function analyzeGame(rows: LottoRow[], game: GameKey): any;
export declare function nCk(n: number, k: number): number;
export declare function jackpotOdds(game: GameKey): number;
export declare function jackpotOddsForLogical(logical: LogicalGameKey): number | null;
export type NyLottoExtendedRow = {
    date: string;
    mains: number[];
    bonus: number;
};
export declare function fetchNyLottoExtendedRows(): Promise<NyLottoExtendedRow[]>;
export declare function jackpotOddsQuickDraw(spots: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10): number;
export declare function fetchQuickDrawRowsFor(logical: 'ny_quick_draw'): Promise<QuickDrawRow[]>;
export declare function fetchCashPopRows(period: CashPopPeriod | 'all'): Promise<CashPopRow[]>;
export {};
