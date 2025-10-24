import type { Page, BrowserContext } from "playwright";
export declare function qs<T = any>(root: any, sel: string): T | null;
export declare function qsa<T = any>(root: any, sel: string): T[];
/** Cast unknown → T at use-sites where TS complains about 'unknown' */
export declare function asAny<T = any>(x: unknown): T;
export declare function ensureDir(p: string): Promise<void>;
export declare function saveDebug(page: Page, basename: string): Promise<void>;
export declare function cleanText(s?: string | null): string;
export declare function parseIntLoose(s?: string | null): number | null;
type RetryOpts = {
    attempts?: number;
    label?: string;
    minDelayMs?: number;
    factor?: number;
};
export declare function withRetry<T>(fn: () => Promise<T>, opts?: RetryOpts): Promise<T>;
export declare function maybeStartTracing(context: BrowserContext): Promise<void>;
export declare function maybeStopTracing(context: BrowserContext, outPath: string): Promise<void>;
/** Odds parser: finds "1 in 3.47", "1:3.47", etc. Returns the numeric divisor (e.g. 3.47). */
export declare function oddsFromText(text?: string | null): number | undefined;
export declare function attachNetworkHarvester(page: Page): void;
type ReadyOpts = {
    loadMore?: boolean;
    maxScrolls?: number;
};
export declare function openAndReady(page: Page, url: string, opts?: ReadyOpts): Promise<void>;
export declare function waitForNumericGameLinks(page: Page, nameHint: string, minCount?: number, timeoutMs?: number): Promise<string[]>;
export {};
