export declare class NonCanonicalGameError extends Error {
    code: string;
    constructor(msg?: string);
}
export declare function normalizeRowsLoose(rows: any[]): LottoRow[];
/** Recommend weighting for digits (domain 0–9, with replacement). */
export declare function recommendDigitsFromStats(stats: ReturnType<typeof computeDigitStats>): WeightingRec;
/** Recommend weighting for Pick 10 (10-from-80). */
export declare function recommendPick10FromStats(stats: ReturnType<typeof computePick10Stats>): WeightingRec;
export declare function fetchNyLottoExtendedRows(): Promise<NyLottoExtendedRow[]>;
