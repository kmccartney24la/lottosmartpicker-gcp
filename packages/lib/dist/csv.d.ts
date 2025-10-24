type NumberLike = number | string;
export type CanonicalRow = {
    draw_date: string;
    num1: NumberLike;
    num2: NumberLike;
    num3: NumberLike;
    num4: NumberLike;
    num5: NumberLike;
    special?: NumberLike;
};
export declare function toCanonicalCsv(rows: readonly CanonicalRow[] | null | undefined): string;
export declare function latestCsv(fullCsv: string): string;
/**
 * Flexible CSV for variable-length games (Pick3, Pick4, Pick10, Take5, NY Lotto, etc).
 * rowsFlex: Array<{ draw_date: string; nums: number[]; special?: number }>
 * - infers max number of 'numN' columns to emit
 * - includes a 'special' column only if any row has a special value
 */
export type FlexibleRow = {
    draw_date: string;
    nums: readonly NumberLike[];
    special?: NumberLike;
};
export declare function toFlexibleCsv(rowsFlex: readonly FlexibleRow[] | null | undefined): string;
export {};
