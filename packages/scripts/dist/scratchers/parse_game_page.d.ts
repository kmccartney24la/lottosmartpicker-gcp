export type GameDetail = {
    slug: string;
    url: string;
    name?: string;
    gameNumber?: number;
    price?: number;
    overallOdds?: number;
    launchDate?: string;
    endDate?: string;
};
export declare function fetchGameDetails(slugs: string[]): Promise<GameDetail[]>;
