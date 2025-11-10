import type { EraConfig, EraGame, GameKey, LogicalGameKey, LottoRow } from './types.js';
export type { EraConfig, EraGame } from './types.js';
export declare const CURRENT_ERA: Record<EraGame, EraConfig>;
/** Map any canonical or logical key to the EraGame we use for analysis (generator, stats, labels). */
export declare function resolveEraGame(game: GameKey | LogicalGameKey): EraGame;
/** Return the current-era config for any (canonical or logical) key. */
export declare function getCurrentEraConfig(game: GameKey | LogicalGameKey): EraConfig;
/** Filter rows to the current era for the game (and collapse reps/underlyings consistently). */
export declare function filterRowsForCurrentEra(rows: LottoRow[], game: GameKey | LogicalGameKey): LottoRow[];
/** Friendly tooltip text describing the active era for a game (unchanged content). */
export declare function eraTooltipFor(game: GameKey | LogicalGameKey): string;
