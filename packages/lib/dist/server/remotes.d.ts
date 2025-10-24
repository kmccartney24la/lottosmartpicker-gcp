import "server-only";
export type GameKey = "multi_powerball" | "multi_megamillions" | "multi_cash4life" | "ga_fantasy5";
export declare function remoteFor(game: GameKey): string;
