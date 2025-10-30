declare const SESSIONS: readonly ["morning", "day", "evening", "night"];
export type Session = typeof SESSIONS[number];
export type Row = {
    dateISO: string;
    session: Session;
    digits: [number, number, number];
    fb?: number;
};
export declare function buildTexasPick3Csvs(outMorningRel?: string, outDayRel?: string, outEveningRel?: string, outNightRel?: string): Promise<void>;
export {};
