import type { LogicalGameKey, Period, UnderlyingKey, GameKey } from './types.js';
/** Return all underlying keys for a logical game + period. */
export declare function underlyingKeysFor(logical: LogicalGameKey | GameKey, period: Period): UnderlyingKey[];
/**
 * Deterministic representative key (used by components that need *one* key).
 * - If someone passes a canonical GameKey by mistake, just return it.
 */
export declare function primaryKeyFor(logical: LogicalGameKey | GameKey, period: Period): UnderlyingKey;
