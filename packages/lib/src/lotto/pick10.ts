// packages/lib/src/lotto/pick10.ts
import type { Pick10Row, AllOrNothingRow, WeightingRec } from './types.js';
import { weightedSampleDistinctFromWeights, coefVar, clampAlphaGeneric } from './stats.js';

/* ============================================================================
   Generic k-of-N engines (shared by Pick 10 and All or Nothing)
   ============================================================================ */
type KOfNRow = { values: number[] };

/** Core stats for any k-of-N set game (values are 1..N). Skips malformed rows. */
export function computeKOfNStats<T extends KOfNRow>(
  rows: T[],
  k: number,
  N: number
) {
  const counts = new Map<number, number>();
  const lastSeen = new Map<number, number>();
  for (let n = 1; n <= N; n++) { counts.set(n, 0); lastSeen.set(n, Infinity); }

  let validDraws = 0;
  // rows expected ascending; iterate newest→oldest without copying
  for (let i = rows.length - 1, idx = 0; i >= 0; i--, idx++) {
    const r = rows[i]; if (!r) continue;
    const v = (r.values || []).filter(n => Number.isFinite(n) && n >= 1 && n <= N);
    if (v.length !== k) continue;
    validDraws++;
    v.forEach(n => {
      counts.set(n, (counts.get(n) || 0) + 1);
      lastSeen.set(n, Math.min(lastSeen.get(n) || Infinity, idx));
    });
  }

  const totalDraws = validDraws;
  if (totalDraws === 0) return { counts, lastSeen, totalDraws: 0, z: new Map<number, number>() };

  const p = k / N;
  const expected = totalDraws * p;
  const variance = totalDraws * p * (1 - p);
  const sd = Math.max(Math.sqrt(Math.max(variance, 1e-9)), 1e-6);
  const z = new Map<number, number>();
  for (let n = 1; n <= N; n++) z.set(n, ((counts.get(n) || 0) - expected) / sd);

  return { counts, lastSeen, totalDraws, z };
}

/** Weight builder for any k-of-N game (hot/cold + alpha blend). */
export function buildKOfNWeights(
  stats: ReturnType<typeof computeKOfNStats>,
  N: number,
  mode: 'hot' | 'cold',
  alpha: number
): number[] {
  const arr = Array.from({ length: N }, (_, i) => (stats?.counts.get(i + 1) ?? 0));
  const total = arr.reduce((a, b) => a + b, 0);
  const avg = total / N;
  const eps = Math.min(1, Math.max(0.1, 0.05 * avg)); // light smoothing
  const smooth = arr.map(c => c + eps);
  const sum = smooth.reduce((a, b) => a + b, 0);
  const freq = sum > 0 ? smooth.map(c => c / sum) : Array(N).fill(1 / N);
  const max = Math.max(...freq);
  const invRaw = freq.map(p => (max - p) + 1e-9);
  const invSum = invRaw.reduce((a, b) => a + b, 0);
  const inv = invRaw.map(x => x / invSum);
  const base = Array(N).fill(1 / N);
  const chosen = mode === 'hot' ? freq : inv;
  const blended = chosen.map((p, i) => (1 - alpha) * base[i] + alpha * p);
  const s2 = blended.reduce((a, b) => a + b, 0);
  return blended.map(x => x / s2);
}

/** Ticket generator for any k-of-N game. */
export function generateKOfNTicket(
  stats: ReturnType<typeof computeKOfNStats>,
  k: number,
  N: number,
  opts: { mode: 'hot' | 'cold'; alpha: number }
): number[] {
  const w = buildKOfNWeights(stats, N, opts.mode, opts.alpha);
  return weightedSampleDistinctFromWeights(k, w);
}

/** Recommend weighting for any k-of-N game. */
export function recommendKOfNFromStats(
  stats: ReturnType<typeof computeKOfNStats>,
  N: number
): WeightingRec {
  const counts = Array.from({ length: N }, (_, i) => (stats?.counts.get(i + 1) ?? 0));
  const cv = coefVar(counts);
  // Generic heuristics; tuned around Pick10/QuickDraw ranges and scaled by clampAlphaGeneric
  let rec: WeightingRec;
  if (cv >= 0.20) rec = { mode: 'hot', alpha: 0.64 };
  else if (cv <= 0.10) rec = { mode: 'cold', alpha: 0.54 };
  else rec = { mode: 'hot', alpha: 0.60 };
  if (stats) rec.alpha = clampAlphaGeneric(rec.alpha, stats.totalDraws || 0, N, 0.50, 0.70);
  return rec;
}

/** Basic stats for Pick 10 (10-from-80). */
export function computePick10Stats(rows: Pick10Row[]) {
  return computeKOfNStats(rows, 10, 80);
}

/** Weight builder for Pick 10 (hot/cold + alpha blend). */
export function buildPick10Weights(
  stats: ReturnType<typeof computePick10Stats>,
  mode: 'hot'|'cold',
  alpha: number
) {
  return buildKOfNWeights(stats as any, 80, mode, alpha);
}

/** Ticket generator for Pick 10, using weights. */
export function generatePick10Ticket(
  stats: ReturnType<typeof computePick10Stats>,
  opts: { mode:'hot'|'cold'; alpha:number }
) {
  return generateKOfNTicket(stats as any, 10, 80, opts);
}

/** Pattern-style hints for Pick 10 (UI sugar). */
export function ticketHintsPick10(values:number[], stats: ReturnType<typeof computePick10Stats>) {
  const hints:string[] = [];
  if (!Array.isArray(values) || values.length!==10) return ['Invalid'];
  const a = [...values].sort((x,y)=>x-y);

  // Similar flavor to 5-ball hints but tuned for k=10
  const span = a[a.length-1]! - a[0]!;
  if (span <= 80/10) hints.push('Tight span');

  const run3 = a.some((_,i)=> i>=2 && a[i-2]!+2===a[i-1]!+1 && a[i-1]!+1===a[i]);
  if (run3) hints.push('3-in-a-row');

  const bday = a.filter(n=>n<=31).length >= 6; // 6+ of first 31
  if (bday) hints.push('Birthday-heavy');

  const hot = a.filter(n => ((stats?.z.get(n) ?? 0) > 1)).length;
  const cold= a.filter(n => ((stats?.z.get(n) ?? 0) < -1)).length;
  if (hot >= 5) hints.push('Hot mains');
  if (cold>= 5) hints.push('Cold mains');

  if (hints.length===0) hints.push('Balanced');
  return hints;
}

/** Recommend weighting for Pick 10 (10-from-80). */
export function recommendPick10FromStats(
  stats: ReturnType<typeof computePick10Stats>
): WeightingRec {
  // Preserve legacy tuning for Pick 10 specifically
  const counts = Array.from({ length: 80 }, (_, i) => (stats?.counts.get(i + 1) ?? 0));
  const cv = coefVar(counts);
  let rec: WeightingRec;
  if (cv >= 0.22) rec = { mode: 'hot',  alpha: 0.65 };
  else if (cv <= 0.12) rec = { mode: 'cold', alpha: 0.55 };
  else rec = { mode: 'hot', alpha: 0.60 };
  if (stats) rec.alpha = clampAlphaGeneric(rec.alpha, stats.totalDraws || 0, 80, 0.50, 0.70);
  return rec;
}

/* ============================================================================
   Texas All or Nothing (12-from-24) — first-class wrappers
   ============================================================================ */

/** Stats for All or Nothing (12-from-24). */
export function computeAllOrNothingStats(rows: AllOrNothingRow[]) {
  return computeKOfNStats(rows, 12, 24);
}

/** Weights for All or Nothing (12-from-24). */
export function buildAllOrNothingWeights(
  stats: ReturnType<typeof computeAllOrNothingStats>,
  mode: 'hot' | 'cold',
  alpha: number
) {
  return buildKOfNWeights(stats as any, 24, mode, alpha);
}

/** Ticket generator for All or Nothing (12-from-24). */
export function generateAllOrNothingTicket(
  stats: ReturnType<typeof computeAllOrNothingStats>,
  opts: { mode:'hot'|'cold'; alpha:number }
) {
  return generateKOfNTicket(stats as any, 12, 24, opts);
}

/** Recommendation for All or Nothing; reuse generic k-of-N tuning, N=24. */
export function recommendAllOrNothingFromStats(
  stats: ReturnType<typeof computeAllOrNothingStats>
): WeightingRec {
  return recommendKOfNFromStats(stats as any, 24);
}