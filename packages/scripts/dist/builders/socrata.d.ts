type DatasetCfg = {
    id: string;
    dateField: string;
    /** A single field with tokens OR an ordered list of fallbacks (midday/evening etc.) */
    winningField: string | string[];
    /** Optional explicit field for special ball/bonus (if provided). */
    specialField?: string;
    /** If the special ball is embedded inside the winningField tokens, where is it? (0-based) */
    specialIndexInWinning?: number;
    /** Minimum count of *main* numbers to accept (e.g., 3 for Numbers, 4 for Win4, 5 for Take 5, 6 for NY Lotto, 20 for Pick 10). */
    minMainCount?: number;
    /** If true and no special is found, we still emit the row without special. */
    specialOptional?: boolean;
};
declare const DATASETS: Record<string, DatasetCfg>;
export type SocrataLimitOpts = {
    mode: "lastN";
    n: number;
} | {
    mode: "since";
    sinceISO: string;
};
export declare function buildSocrataCsvFlexible(gameKey: keyof typeof DATASETS, token?: string, limitOpts?: SocrataLimitOpts): Promise<string>;
export declare const buildSocrataCsv: typeof buildSocrataCsvFlexible;
export declare function buildQuickDrawRecentCsv40k(token?: string): Promise<string>;
export {};
