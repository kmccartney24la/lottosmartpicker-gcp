import type { BrowserContext } from "playwright";
export type TopPrizeRow = {
    gameNumber: number;
    gameName: string;
    price?: number;
    topPrizeValue?: number;
    originalTopPrizes?: number;
    topPrizesRemaining?: number;
    lastUpdated?: string;
};
export declare function fetchTopPrizes(context: BrowserContext): Promise<Map<number, TopPrizeRow>>;
