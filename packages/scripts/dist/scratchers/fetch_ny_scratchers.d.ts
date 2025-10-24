export type NyScratcherTier = {
    prizeAmount: number;
    odds: number | null;
    prizesRemaining: number | null;
    prizesPaidOut?: number | null;
    totalPrizes?: number | null;
    prizeLevel?: number;
    prizeAmountLabel?: string;
};
export type NyScratcherRecord = {
    source: "ny";
    updatedAt: string;
    gameNumber: number;
    name: string;
    price: number;
    sourceImageUrl: string;
    ticketImageUrl: string;
    topPrizeValue: number;
    topPrizesRemaining: number | null;
    overallOdds: number | null;
    /**
     * Sum of the original count of TOP prizes (i.e., tiers whose prize value equals the max tier prize).
     * This mirrors what we scrape per-tier as `topPrizesOriginal` on NyScratcherTier.
     */
    topPrizesOriginal?: number;
    tiers: NyScratcherTier[];
    detailUrl: string;
    listingUrl: string;
    adjustedOdds?: number | null;
};
