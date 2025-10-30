import type { GameKey, ScheduleGame } from './types.js';
/** Days-of-week sets for scheduling; 0=Sun..6=Sat. */
export declare const DRAW_DOWS: Record<ScheduleGame, Set<number>>;
/** Human-friendly schedule label derived from DRAW_DOWS + GAME_TIME_INFO. */
export declare function drawNightsLabel(game: GameKey, now?: Date): string;
/** Returns true if we’re within a ±90 minute window around the local draw time on a valid draw day. */
export declare function isInDrawWindowFor(game: GameKey, now?: Date): boolean;
/** Build a label like "Wed 6:30 PM PT" for the next draw in the game’s local timezone. */
export declare function nextDrawLabelFor(game: GameKey, now?: Date): string;
