import type { BrowserContext } from "playwright";
export type ScratcherListsNums = {
    activeNums: number[];
    endedNums: number[];
};
export declare function fetchActiveEndedNumbers(context: BrowserContext): Promise<ScratcherListsNums>;
