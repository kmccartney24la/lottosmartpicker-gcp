export type ActiveGame = {
    gameNumber: number;
    name: string;
    price: number | undefined;
    topPrizeValue: number | undefined;
    topPrizesOriginal: number | undefined;
    topPrizesRemaining: number | undefined;
    overallOdds: number | undefined;
    adjustedOdds: number | undefined;
    startDate?: string;
    oddsImageUrl?: string;
    ticketImageUrl?: string;
    updatedAt: string;
    lifecycle?: "new" | "continuing";
};
