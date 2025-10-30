export type TxScratcherTier = {
    prizeAmount: number;
    odds: number | null;
    prizesRemaining: number | null;
    prizesPaidOut?: number | null;
    totalPrizes?: number | null;
    prizeLevel?: number;
    prizeAmountLabel?: string;
};
export type TxScratcherRecord = {
    source: "tx";
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
    tiers: TxScratcherTier[];
    detailUrl: string;
    listingUrl: string;
    adjustedOdds?: number | null;
    startDate?: string;
};
