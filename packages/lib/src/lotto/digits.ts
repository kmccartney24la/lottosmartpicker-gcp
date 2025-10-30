// packages/lib/src/lotto/digits.ts
import type { DigitRow, DigitRowEx, LogicalGameKey, WeightingRec } from './types.js';
import { coefVar, clampAlphaGeneric } from './stats.js';

/**
 * What digit-length does each logical game use?
 * Pure mapping; no runtime I/O.
 */
export function digitKFor(logical: LogicalGameKey): 2|3|4|5 {
  if (logical === 'ny_numbers' || logical === 'fl_pick3') return 3;
  if (logical === 'ny_win4'   || logical === 'fl_pick4') return 4;
  if (logical === 'fl_pick5') return 5;
  if (logical === 'fl_pick2') return 2;
  if (logical === 'ca_daily3') return 3;
  if (logical === 'ca_daily4') return 4;
  if (logical === 'tx_pick3')  return 3;
  if (logical === 'tx_daily4') return 4;
  // sensible fallback; callers only pass digit games here
  return 3;
}

// k now supports 2|3|4|5 to match types.ts and callers (worker + fetch).
export function computeDigitStats(rows: DigitRow[], k: 2|3|4|5) {
  const counts = new Array(10).fill(0);
  let totalDraws = 0;
  const lastSeen = new Array(10).fill(Infinity);

  // rows are expected ascending by date; iterate newest→oldest without copying
  for (let i = rows.length - 1, idx = 0; i >= 0; i--, idx++) {
    const r = rows[i];
    if (!r) continue;
    // Skip malformed rows instead of returning undefined (normalizes return type)
    if (!Array.isArray(r.digits) || r.digits.length !== k) continue;
    totalDraws++;
    r.digits.forEach(d => {
      if (d>=0 && d<=9) {
        counts[d] += 1;
        lastSeen[d] = Math.min(lastSeen[d], idx);
      }
    });
  }

  // Z-scores vs expected = k * totalDraws / 10
  const expected = (k * totalDraws) / 10;
  const p = k / 10;
  const variance = totalDraws * p * (1 - p);
  const sd = Math.max(Math.sqrt(Math.max(variance, 1e-9)), 1e-6);
  const z = counts.map(c => (c - expected)/sd);

  return { counts, lastSeen, totalDraws, k, z };
}

/** Optional UI helper for PastDraws view (adds Fireball when present). */
export function toPastDrawsDigitsView(
  r: DigitRowEx,
  k: 2|3|4|5
): { date: string; values: number[]; sep?: boolean; special?: number; specialLabel?: string } {
  const values = (r.digits || []).slice(0, k);
  const view: { date: string; values: number[]; sep?: boolean; special?: number; specialLabel?: string } = {
    date: r.date,
    values,
  };
  if (typeof r.fb === 'number') {
    view.sep = true;                // render “|” gap if your component uses it
    view.special = r.fb;            // show as right-hand bubble
    view.specialLabel = 'Fireball'; // tooltip/accessibility label
  }
  return view;
}

// ------------- Shared digit helpers (exported) -------------

export function isPalindrome(d: number[]) { return d.join('') === [...d].reverse().join(''); }
export function longestRunLen(d: number[]) {
  let best=1, cur=1;
  for (let i=1;i<d.length;i++){
    if (d[i] === d[i-1]!+1 || d[i] === d[i-1]!-1) { cur++; best=Math.max(best,cur); }
    else cur=1;
  }
  return best;
}
/** Max digit multiplicity (e.g., AAAB → 3). */
export function maxMultiplicity(d: number[]) {
  const m = new Map<number,number>();
  d.forEach(x => m.set(x,(m.get(x)||0)+1));
  const counts = Array.from(m.values()).sort((a,b)=>b-a);
  return counts[0] ?? 1; // max multiplicity
}
export function digitSum(d: number[]) { return d.reduce((a,b)=>a+b,0); }

/** Internal factorial for small k (<=5). */
function fact(n: number): number { return n<=1 ? 1 : n*fact(n-1); }
/** Multiset permutation count for a k-digit selection (with replacement). */
export function multisetPermutationsCount(d: number[]): number {
  const k = d.length;
  const m = new Map<number, number>();
  d.forEach(x => m.set(x, (m.get(x)||0) + 1));
  const denom = Array.from(m.values()).reduce((acc,c)=>acc*fact(c), 1);
  return fact(k)/denom;
}
/** Build a "<N>-Way Box" label. */
export function wayLabel(n: number, base: 'Box' = 'Box'): string {
  return `${n}-Way ${base}`;
}
/** Box variant label from the digits themselves. */
export function boxVariantLabel(digits: number[], k: 2|3|4|5): string | null {
  if (!Array.isArray(digits) || digits.length !== k) return null;
  const ways = multisetPermutationsCount(digits);
  return ways <= 1 ? null : wayLabel(ways, 'Box');
}
/** "Straight" when all digits equal (AA, AAA, AAAA, AAAAA). */
export function straightOnlyLabel(digits: number[], k: 2|3|4|5): string | null {
  if (!Array.isArray(digits) || digits.length !== k) return null;
  return maxMultiplicity(digits) === k ? 'Straight' : null;
}

/**
 * Native digit-game hints (3 or 4 digits). Independent of GameKey.
 * Emits stable labels aligned with HINT_EXPLAIN.
 */
export function ticketHintsDigits(
  digits: number[],
  stats: ReturnType<typeof computeDigitStats>
): string[] {
  const hints: string[] = [];
  if (!stats) return ['Insufficient data'];
  if (digits.length !== stats.k) return ['Invalid'];

  const maxMult = maxMultiplicity(digits); // 2=pair, 3=triple, 4=quad
  if (maxMult === 4) hints.push('Quad');
  else if (maxMult === 3) hints.push('Triple');
  else if (maxMult === 2) hints.push('Pair');

  if (isPalindrome(digits)) hints.push('Palindrome');
  const run = longestRunLen(digits);
  if (run >= 3) hints.push('Sequential digits');

  const sum = digitSum(digits);
  // Heuristic outliers for 3/4-digit sums
  const sumLo = stats.k === 3 ? 6  : 8;   // conservative
  const sumHi = stats.k === 3 ? 21 : 28;  // conservative
  if (sum <= sumLo || sum >= sumHi) hints.push('Sum outlier');

  // Low/High heavy (>= 2/3 on one side for k=3, >=3/4 for k=4)
  const low = digits.filter(d => d <= 4).length;
  const high = digits.filter(d => d >= 5).length;
  if (low >= Math.ceil(stats.k*2/3))  hints.push('Low-heavy');
  if (high >= Math.ceil(stats.k*2/3)) hints.push('High-heavy');

  // Hot/cold by per-digit z-scores (>= 1 or <= -1)
  const hot = digits.filter(d => (stats.z[d]||0) >  1).length;
  const cold= digits.filter(d => (stats.z[d]||0) < -1).length;
  if (hot  >= Math.ceil(stats.k/2)) hints.push('Hot digits');
  if (cold >= Math.ceil(stats.k/2)) hints.push('Cold digits');

  if (hints.length === 0) hints.push('Balanced');
  return hints;
}

/** Recommend weighting for digit games (domain 0–9, with replacement). */
export function recommendDigitsFromStats(
  stats: ReturnType<typeof computeDigitStats>
): WeightingRec {
  if (!stats) return { mode: 'hot', alpha: 0.55 };
  const counts = stats.counts.slice(); // 10-length array
  const cv = coefVar(counts);
  let rec: WeightingRec;
  if (cv >= 0.18) rec = { mode: 'hot',  alpha: 0.60 };
  else if (cv <= 0.10) rec = { mode: 'cold', alpha: 0.50 };
  else rec = { mode: 'hot', alpha: 0.55 };
  rec.alpha = clampAlphaGeneric(rec.alpha, stats.totalDraws, 10, 0.45, 0.65);
  return rec;
}