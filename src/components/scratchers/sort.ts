// src/components/scratchers/sort.ts

import type { ActiveGame } from './types';

// ---------- Totals helpers (NY tiers) ----------
type Tier = { prizesRemaining?: number | null; prizesPaidOut?: number | null; totalPrizes?: number | null };
function totalsFromTiers(g: ActiveGame) {
  const tiers: Tier[] = Array.isArray((g as any).tiers) ? (g as any).tiers : [];
  let remaining = 0;
  let original = 0;
  for (const t of tiers) {
    const rem = t?.prizesRemaining ?? 0;
    const orig = t?.totalPrizes ?? (rem + (t?.prizesPaidOut ?? 0));
    remaining += rem;
    original  += orig;
  }
  return { remaining, original };
}

// Prefer explicit total* fields if your pipeline populates them; otherwise derive from tiers.
export function totalRemaining(g: ActiveGame): number {
  const explicit = (g as any).totalPrizesRemaining as number | undefined;
  if (typeof explicit === 'number' && Number.isFinite(explicit)) return explicit;
  return totalsFromTiers(g).remaining;
}
export function totalOriginal(g: ActiveGame): number {
  const explicit = (g as any).totalPrizesOriginal as number | undefined;
  if (typeof explicit === 'number' && Number.isFinite(explicit)) return explicit;
  return totalsFromTiers(g).original;
}
export function pctTotalAvail(g: ActiveGame): number {
  const orig = totalOriginal(g);
  return orig > 0 ? totalRemaining(g) / orig : -1; // -1 pushes N/A to the end on descending sorts
}

// ---------- Top-prize % helper ----------
export function pctTopAvail(g: ActiveGame): number {
  const orig = g.topPrizesOriginal ?? 0;
  const rem  = g.topPrizesRemaining ?? 0;
  return orig > 0 ? rem / orig : -1; // -1 → treat as N/A so it sorts after real values
}

// Comparator builders (parent can still reverse as needed)
export const comparators = {
  totalPrizesRemain(a: ActiveGame, b: ActiveGame) {
    return totalRemaining(a) - totalRemaining(b); // ascending; caller flips for desc
  },
  pctTotalAvail(a: ActiveGame, b: ActiveGame) {
    return pctTotalAvail(a) - pctTotalAvail(b); // ascending; caller flips for desc
  },

  /**
   * "Best" sort (shared GA/NY):
   * Adjusted/printed odds → %top → %total → #top → #total → topPrize$ → price → recency → name
   * Returns ASCENDING (caller flips via reverse flag as needed per key’s UX).
   */
  best(a: ActiveGame, b: ActiveGame) {
    const aOdds = Number.isFinite(a.adjustedOdds ?? NaN) ? (a.adjustedOdds as number)
                  : Number.isFinite(a.overallOdds  ?? NaN) ? (a.overallOdds  as number) : Infinity;
    const bOdds = Number.isFinite(b.adjustedOdds ?? NaN) ? (b.adjustedOdds as number)
                  : Number.isFinite(b.overallOdds  ?? NaN) ? (b.overallOdds  as number) : Infinity;
    if (aOdds !== bOdds) return aOdds - bOdds; // lower is better

    const aTopPct = pctTopAvail(a), bTopPct = pctTopAvail(b);
    if (aTopPct !== bTopPct) return aTopPct - bTopPct; // we will flip to DESC at the call site if needed

    const aTotPct = pctTotalAvail(a), bTotPct = pctTotalAvail(b);
    if (aTotPct !== bTotPct) return aTotPct - bTotPct;

    const aTopRem = a.topPrizesRemaining ?? -1, bTopRem = b.topPrizesRemaining ?? -1;
    if (aTopRem !== bTopRem) return aTopRem - bTopRem;

    const aTotRem = totalRemaining(a), bTotRem = totalRemaining(b);
    if (aTotRem !== bTotRem) return aTotRem - bTotRem;

    const aTop$ = a.topPrizeValue ?? -Infinity, bTop$ = b.topPrizeValue ?? -Infinity;
    if (aTop$ !== bTop$) return aTop$ - bTop$;

    const aPrice = Number.isFinite(a.price ?? NaN) ? (a.price as number) : Infinity;
    const bPrice = Number.isFinite(b.price ?? NaN) ? (b.price as number) : Infinity;
    if (aPrice !== bPrice) return aPrice - bPrice; // cheaper first

    // Recency: newest first. Use startDate when both available; else gameNumber desc as proxy.
    const at = a.startDate ? Date.parse(a.startDate) : NaN;
    const bt = b.startDate ? Date.parse(b.startDate) : NaN;
    const aHas = Number.isFinite(at), bHas = Number.isFinite(bt);
    if (aHas && bHas && at !== bt) return bt - at; // NEWEST first (desc)
    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;
    if ((a.gameNumber || 0) !== (b.gameNumber || 0)) return (b.gameNumber || 0) - (a.gameNumber || 0);

    return String(a.name).localeCompare(String(b.name));
  },

  /**
   * Start date with robust fallback:
   * - If both have dates → compare by date.
   * - If neither has a date → compare by game number (proxy for recency in NY).
   * - If only one has a date → treat the one WITHOUT a date as "older".
   *
   * NOTE: Returns ASCENDING. If you want newest-first in the UI, flip it using your
   * existing "reverse sort" toggle or by reversing at the call site.
   */
  startDate(a: ActiveGame, b: ActiveGame) {
    const at = a.startDate ? Date.parse(a.startDate) : NaN;
    const bt = b.startDate ? Date.parse(b.startDate) : NaN;
    const aHas = Number.isFinite(at);
    const bHas = Number.isFinite(bt);

    if (aHas && bHas) {
      // ASC by date (older first)
      if (at !== bt) return at - bt;
      // tie → ASC by gameNumber, then name A→Z
      const ag = Number(a.gameNumber) || 0;
      const bg = Number(b.gameNumber) || 0;
      if (ag !== bg) return ag - bg;
      return String(a.name).localeCompare(String(b.name));
    }

    if (!aHas && !bHas) {
      // ASC by gameNumber (small → large)
      const ag = Number(a.gameNumber) || 0;
      const bg = Number(b.gameNumber) || 0;
      if (ag !== bg) return ag - bg;
      return String(a.name).localeCompare(String(b.name));
    }

    // Mixed: in ASC, put UNDated first so that when flipped (DESC) Dated come first.
    return aHas ? 1 : -1;
  },
};

