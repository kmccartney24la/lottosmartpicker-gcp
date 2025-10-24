declare const OUT: {
    morning: string;
    matinee: string;
    afternoon: string;
    evening: string;
    latenight: string;
};
export declare function buildFloridaCashPopCsvs(localPdfPath?: string, outOverride?: Partial<typeof OUT>): Promise<void>;
export {};
