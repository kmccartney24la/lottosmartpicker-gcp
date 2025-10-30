import type { GameKey, LottoRow } from './types.js';
export declare function parseTokens(s: string): number[];
export declare function parseCanonicalCsv(csv: string, game: GameKey): LottoRow[];
type FlexibleRow = {
    date: string;
    values: number[];
    special?: number;
};
export declare function parseFlexibleCsv(csv: string): FlexibleRow[];
export declare const USE_WORKER: boolean;
export declare function parseCanonicalCsvAsync(csv: string, game: GameKey, signal?: AbortSignal): Promise<LottoRow[]>;
export declare function parseFlexibleCsvAsync(csv: string, signal?: AbortSignal): Promise<FlexibleRow[]>;
export {};
