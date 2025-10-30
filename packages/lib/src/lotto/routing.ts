// packages/lib/src/lotto/routing.ts
import type { LogicalGameKey, Period, UnderlyingKey, GameKey } from './types.js';
// Pull the *value* from a runtime module (not from types.ts).
import { LOGICAL_TO_UNDERLYING } from './types.js';
// Delegate digit-family normalization to the central registry to avoid duplication.

/** Return all underlying keys for a logical game + period. */
export function underlyingKeysFor(logical: LogicalGameKey | GameKey, period: Period): UnderlyingKey[] {
  const m = LOGICAL_TO_UNDERLYING[logical as LogicalGameKey];
  if (!m) return [];
  const p = period === 'both' ? 'all' : period; // legacy alias
  if (p !== 'all' && (m as any)[p]) return (m as any)[p] as UnderlyingKey[];
  // prefer m.all; fall back to legacy m.both if present
  return (m as any).all ?? (m as any).both ?? [];
}

/**
 * Deterministic representative key (used by components that need *one* key).
 * - If someone passes a canonical GameKey by mistake, just return it.
 */
export function primaryKeyFor(logical: LogicalGameKey | GameKey, period: Period): UnderlyingKey {
  // If it's not a logical family we know about, just pass it through as an underlying/canonical key.
 if (!(logical as string in LOGICAL_TO_UNDERLYING)) {
    return logical as unknown as UnderlyingKey; // canonical singles are valid UnderlyingKeys
  }

  const m = LOGICAL_TO_UNDERLYING[logical as LogicalGameKey];
  const p = period === 'both' ? 'all' : period;
  if (p !== 'all' && (m as any)[p]?.length) return (m as any)[p][0] as UnderlyingKey;
  return m.evening?.[0] ?? m.midday?.[0] ?? ((m as any).all?.[0] ?? (m as any).both?.[0])!;
}