// Pull the *value* from a runtime module (not from types.ts).
import { LOGICAL_TO_UNDERLYING } from './types.js';
// Delegate digit-family normalization to the central registry to avoid duplication.
/** Return all underlying keys for a logical game + period. */
export function underlyingKeysFor(logical, period) {
    const m = LOGICAL_TO_UNDERLYING[logical];
    if (!m)
        return [];
    const p = period === 'both' ? 'all' : period; // legacy alias
    if (p !== 'all' && m[p])
        return m[p];
    // prefer m.all; fall back to legacy m.both if present
    return m.all ?? m.both ?? [];
}
/**
 * Deterministic representative key (used by components that need *one* key).
 * - If someone passes a canonical GameKey by mistake, just return it.
 */
export function primaryKeyFor(logical, period) {
    // If it's not a logical family we know about, just pass it through as an underlying/canonical key.
    if (!(logical in LOGICAL_TO_UNDERLYING)) {
        return logical; // canonical singles are valid UnderlyingKeys
    }
    const m = LOGICAL_TO_UNDERLYING[logical];
    const p = period === 'both' ? 'all' : period;
    if (p !== 'all' && m[p]?.length)
        return m[p][0];
    return m.evening?.[0] ?? m.midday?.[0] ?? (m.all?.[0] ?? m.both?.[0]);
}
