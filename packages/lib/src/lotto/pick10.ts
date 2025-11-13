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

  // include k and N so UI/data layers can build derived charts without re-inferring
  return {
    counts,
    lastSeen,
    totalDraws,
    z,
    k,
    N,
  };
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

// small helper: get a clean number[] from a row
function normalizedValues(r: KOfNRow | undefined): number[] {
  if (!r) return [];
  return (r.values || []).filter(
    (n): n is number => Number.isFinite(n) && n >= 1
  );
}

function maxValueFromRows<T extends KOfNRow>(rows: T[]): number {
  let max = 0;
  for (const r of rows) for (const v of normalizedValues(r)) if (v > max) max = v;
  return max;
}

/* ============================================================================
   Additional analysis helpers for k-of-N games (UI-neutral)
   These mirror what the PatternInsightsModal was doing by hand.
   ============================================================================ */

/** Try to infer k and N from plain rows, newest/oldest order doesn't matter here. */
export function inferKAndNFromKOfNRows<T extends KOfNRow>(rows: T[]): { k: number; N: number } | null {
  if (!rows || rows.length === 0) return null;
  const first = rows[0];
  if (!first) return null;

  const vals = normalizedValues(first);
  const k = vals.length;
  const N = maxValueFromRows(rows);
  if (!k || !N) return null;
  return { k, N };
}

/** Histogram of overlap between consecutive k-of-N draws. */
export function computeKOfNOverlapHistogram<T extends KOfNRow>(
  rows: T[]
): { k: number; data: Array<{ overlap: number; count: number }>; draws: number } | null {
  if (!rows || rows.length < 2) return null;
  const inferred = inferKAndNFromKOfNRows(rows);
  if (!inferred) return null;
  const { k } = inferred;

  const counts = Array.from({ length: k + 1 }, () => 0);

  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const currRow = rows[i];
    if (!prev || !currRow) continue;

    const prevSet = new Set(normalizedValues(prev));
    const curr = normalizedValues(currRow);
    let overlap = 0;
    for (const v of curr) {
      if (prevSet.has(v)) overlap++;
    }
    // tighten the guard so TS knows index is valid
    if (overlap >= 0 && overlap < counts.length) {
      counts[overlap] = (counts[overlap] ?? 0) + 1;
    }
}

  const data = counts.map((count, overlap) => ({ overlap, count }));
  return { k, data, draws: rows.length - 1 };
}

/**
 * Range / decade strip for k-of-N: group 1..N into segments and count hits per segment.
 * This returns the data your UI was rendering directly.
 */
export function computeKOfNRangeStrip<T extends KOfNRow>(
  rows: T[],
  stats: ReturnType<typeof computeKOfNStats> | null,
  opts?: { segmentSize?: number }
): {
  N: number;
  k: number;
  segmentSize: number;
  data: Array<{ label: string; hits: number; expected: number; ratio: number }>;
  totalDraws: number;
} | null {
  const inferred =
    stats && typeof stats.k === 'number' && typeof stats.N === 'number'
      ? { k: stats.k, N: stats.N }
      : inferKAndNFromKOfNRows(rows);
  if (!inferred) return null;
  const { k, N } = inferred as { k: number; N: number };
  if (!rows || rows.length === 0) return null;

  let segmentSize: number;
  if (opts?.segmentSize) {
    segmentSize = opts.segmentSize;
  } else if (N >= 80) {
    segmentSize = 10;
  } else if (N === 24) {
    segmentSize = 6;
  } else {
    segmentSize = Math.ceil(N / 6);
  }

  const segments: Array<{ start: number; end: number; hits: number; expected: number }> = [];
  for (let start = 1; start <= N; ) {
    const end = Math.min(start + segmentSize - 1, N);
    segments.push({ start, end, hits: 0, expected: 0 });
    start = end + 1;
  }

  const totalDraws = rows.length;

  for (const r of rows) {
    if (!r) continue;
    const vals = normalizedValues(r);
    for (const v of vals) {
      let idx = Math.floor((v - 1) / segmentSize);
      if (idx < 0) idx = 0;
      if (idx >= segments.length) idx = segments.length - 1;
      segments[idx]!.hits += 1;
    }
  }

  for (const seg of segments) {
    const segSize = seg.end - seg.start + 1;
    const prob = segSize / N;
    seg.expected = totalDraws * (k * prob);
  }

  const data = segments.map((seg) => {
    const ratio = seg.expected > 0 ? seg.hits / seg.expected : 1;
    return {
      label: `${seg.start}–${seg.end}`,
      hits: seg.hits,
      expected: seg.expected,
      ratio,
    };
  });

  return { N, k, segmentSize, data, totalDraws };
}

/**
 * All-or-nothing specific: how many of the 12 landed in 1–12 vs 13–24.
 * Returns null if the rows are not 12/24.
 */
export function computeAllOrNothingHalfBalance(rows: AllOrNothingRow[]) {
  const inferred = inferKAndNFromKOfNRows(rows as any);
  if (!inferred) return null;
  const { k, N } = inferred as { k: number; N: number };
  if (!(k === 12 && N === 24)) return null;

  const counts = Array.from({ length: k + 1 }, () => 0);
  // use indexed loop to make TS happy under strict mode
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;

    const vals = normalizedValues(r);
    let lowHits = 0;
    for (const v of vals) {
      if (v >= 1 && v <= 12) lowHits++;
    }

    if (lowHits >= 0 && lowHits < counts.length) {
      counts[lowHits] = (counts[lowHits] ?? 0) + 1;
    }
  }
  const data = counts.map((count, lowHits) => ({ lowHits, count }));
  return { k, N, data, draws: rows.length };
}

/**
 * Hot-set hits vs expected, in chronological order (oldest → newest).
 * This is the data your LineChart was consuming.
 */
export function buildKOfNHotSetHitsSeries<T extends KOfNRow>(
  rows: T[],
  stats: ReturnType<typeof computeKOfNStats>,
  opts?: { hotFraction?: number; maxPoints?: number }
): { data: Array<{ idx: number; hits: number; expected: number }>; hotSize: number; expectedPerDraw: number; total: number } {
  const hotFraction = opts?.hotFraction ?? 0.25;
  const maxPoints = opts?.maxPoints ?? 60;
  const k = typeof stats.k === 'number' ? stats.k : 0;
  const N = typeof stats.N === 'number' ? stats.N : 0;
  if (!k || !N) {
    return { data: [], hotSize: 0, expectedPerDraw: 0, total: 0 };
  }

  // build hot set from z
  const zEntries = Array.from(stats.z.entries()).map(([num, z]) => ({ num, z: z ?? 0 }));
  const targetBySize = Math.floor(N * hotFraction);
  const hotSize = Math.max(4, Math.min(20, targetBySize || 4));
  const hotSet = new Set(
    zEntries
      .sort((a, b) => b.z - a.z)
      .slice(0, hotSize)
      .map((e) => e.num)
  );

  const expectedPerDraw = k * (hotSet.size / N);

  const series: Array<{ idx: number; hits: number; expected: number }> = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const vals = normalizedValues(row);
    let hits = 0;
    for (const v of vals) {
      if (hotSet.has(v)) hits++;
    }
    series.push({ idx: i + 1, hits, expected: expectedPerDraw });
  }

  const trimmed = series.length > maxPoints ? series.slice(series.length - maxPoints) : series;
  return { data: trimmed, hotSize: hotSet.size, expectedPerDraw, total: series.length };
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