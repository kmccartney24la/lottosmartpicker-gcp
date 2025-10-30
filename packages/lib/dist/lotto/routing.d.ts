import type { LogicalGameKey, Period, UnderlyingKey } from './types.js';
export { LOGICAL_TO_UNDERLYING } from './types.js';
/** Return all underlying keys for a logical game + period. */
export declare function underlyingKeysFor(logical: LogicalGameKey, period: Period): UnderlyingKey[];
/**
 * Deterministic representative key (used by components that need *one* key).
 * - If someone passes a canonical GameKey by mistake, just return it.
 */
export declare function primaryKeyFor(logical: LogicalGameKey, period: Period): UnderlyingKey;
