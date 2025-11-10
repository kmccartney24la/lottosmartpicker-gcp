import type { GameKey, UnderlyingKey } from './types.js';
/** Always go through the app proxy (environment fallbacks). */
export declare const FILE_BASE: string;
/** Canonical Next API endpoints per game (remote-first to GCS, no-store). */
export declare const GAME_TO_API_PATH: Readonly<Record<GameKey, string>>;
/** Strict lookup (throws on unknown). */
export declare function apiPathForGame(game: GameKey): string;
/** Map any underlying key (canonical or flexible) to its CSV API path. */
export declare function apiPathForUnderlying(u: UnderlyingKey): string;
/** Swap a canonical CSV path for its tiny “latest” probe endpoint. */
export declare function latestApiPathForGame(game: GameKey): string;
export declare function latestApiPathForUnderlying(u: UnderlyingKey): string;
