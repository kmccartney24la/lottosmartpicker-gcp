export type ActiveGame = {
  gameNumber: number;
  name: string;
  price?: number;
  topPrizeValue?: number;
  topPrizesOriginal?: number;
  topPrizesRemaining?: number;
  overallOdds?: number | null;
  adjustedOdds?: number | null;
  startDate?: string;
  oddsImageUrl?: string;
  ticketImageUrl?: string;
  updatedAt: string;
  lifecycle?: 'new' | 'continuing';
};

export type IndexPayload = {
  updatedAt: string;
  count: number;
  games: ActiveGame[];
};

export type SortKey =
  | 'best'
  | 'adjusted'
  | 'odds'
  | 'price'
  | 'topPrizeValue'
  | 'topPrizesRemain'
  | '%topAvail'
  | 'name';
