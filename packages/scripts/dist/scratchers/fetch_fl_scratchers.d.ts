export type FlScratcherTier = {
    prizeAmount: number;
    odds: number | null;
    prizesRemaining: number | null;
    prizesPaidOut?: number | null;
    totalPrizes?: number | null;
    prizeLevel?: number;
    prizeAmountLabel?: string;
};
export type FlScratcherRecord = {
    source: "fl";
    updatedAt: string;
    gameNumber: number;
    name: string;
    price: number;
    sourceImageUrl: string;
    ticketImageUrl: string;
    topPrizeValue: number;
    topPrizesRemaining: number | null;
    overallOdds: number | null;
    topPrizesOriginal?: number;
    tiers: FlScratcherTier[];
    detailUrl: string;
    listingUrl: string;
    adjustedOdds?: number | null;
};
