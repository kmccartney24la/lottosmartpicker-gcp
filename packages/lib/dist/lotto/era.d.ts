import type { EraConfig, EraGame, GameKey, LottoRow } from './types.js';
export type { EraConfig, EraGame } from './types.js';
/** Map any GameKey to the EraGame we use for analysis (generator, stats, labels). */
export declare function resolveEraGame(game: GameKey): EraGame;
export declare const CURRENT_ERA: Record<EraGame, EraConfig>;
/** Return the current-era config for any (canonical or rep) GameKey. */
export declare function getCurrentEraConfig(game: GameKey): EraConfig;
/** Filter rows to the current era for the game (and collapse reps/underlyings consistently). */
export declare function filterRowsForCurrentEra(rows: LottoRow[], game: GameKey): LottoRow[];
/** Friendly tooltip text describing the active era for a game (unchanged content). */
export declare function eraTooltipFor(game: GameKey): string;
