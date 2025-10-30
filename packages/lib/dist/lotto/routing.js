export { LOGICAL_TO_UNDERLYING } from './types.js';
/** Return all underlying keys for a logical game + period. */
export function underlyingKeysFor(logical, period) {
    // The map lives in types.ts and is re-exported above.
    // We import it lazily via re-export to avoid accidental writes here.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { LOGICAL_TO_UNDERLYING } = require('./types.js');
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
    // Treat canonical GameKeys as already “primary” to avoid hard dependency on paths.ts.
    const isCanonicalGameKey = (k) => typeof k === 'string'; // GameKey is a string union; callers only reach here with known keys.
    if (isCanonicalGameKey(logical)) {
        // If it was actually a GameKey (common mistake), just pass it through.
        // (At runtime our unions are strings; this preserves the prior behavior
        // of returning the same key when it’s canonical.)
        return logical;
    }
    // Normal logical flow:
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { LOGICAL_TO_UNDERLYING } = require('./types');
    const m = LOGICAL_TO_UNDERLYING[logical];
    if (!m)
        throw new Error(`Unknown logical game: ${logical}`);
    const p = period === 'both' ? 'all' : period;
    if (p !== 'all' && m[p]?.length)
        return m[p][0];
    return m.evening?.[0] ?? m.midday?.[0] ?? (m.all?.[0] ?? m.both?.[0]);
}
