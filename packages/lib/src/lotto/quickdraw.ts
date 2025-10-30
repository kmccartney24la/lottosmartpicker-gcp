// packages/lib/src/lotto/quickdraw.ts
import type { QuickDrawRow } from './types.js';
import {
  weightedSampleDistinctFromWeights,
  coefVar,
  clampAlphaGeneric,
  nCk,
} from './stats.js';

/** Stats for Quick Draw (Keno-style, 20-from-80). */
export function computeQuickDrawStats(rows: QuickDrawRow[]) {
  const counts = new Map<number, number>();
  const lastSeen = new Map<number, number>();
  for (let n=1;n<=80;n++){counts.set(n,0); lastSeen.set(n,Infinity);}

  // rows expected ascending; iterate newest→oldest without copying.
  // Skip malformed rows instead of bailing out entirely.
  let validDraws = 0;
  for (let i = rows.length - 1, idx = 0; i >= 0; i--, idx++) {
    const r = rows[i];
    if (!r) continue;
    const v = (r.values||[]).filter(n=>Number.isFinite(n) && n>=1 && n<=80);
    if (v.length !== 20) continue;
    validDraws++;
    v.forEach(n => {
      counts.set(n, (counts.get(n)||0) + 1);
      lastSeen.set(n, Math.min(lastSeen.get(n)||Infinity, idx));
    });
  }

  const totalDraws = validDraws;
  // Guard against empty input after filtering
  if (totalDraws === 0) return { counts, lastSeen, totalDraws: 0, z: new Map<number, number>() };

  const expected = (totalDraws * 20) / 80;
  const p = 20/80;
  const variance = totalDraws * p * (1 - p);
  const sd = Math.max(Math.sqrt(Math.max(variance, 1e-9)), 1e-6);
  const z = new Map<number, number>();
  for (let n=1;n<=80;n++) z.set(n, ((counts.get(n)||0)-expected)/sd);

  return { counts, lastSeen, totalDraws, z };
}

/** Weight builder for Quick Draw (hot/cold + alpha blend). */
export function buildQuickDrawWeights(
  stats: ReturnType<typeof computeQuickDrawStats>,
  mode: 'hot'|'cold',
  alpha: number
): number[] {
  // counts over 1..80 (from 20-of-80 draws)
  const arr = Array.from({length:80}, (_, i) => (stats?.counts.get(i+1) ?? 0));

  // light smoothing (same spirit as Pick 10)
  const total = arr.reduce((a,b)=>a+b,0);
  const avg = total/80;
  const eps = Math.min(1, Math.max(0.1, 0.05*avg));
  const smooth = arr.map(c => c + eps);
  const sum = smooth.reduce((a,b)=>a+b,0);
  const freq = sum>0 ? smooth.map(c => c/sum) : Array(80).fill(1/80);

  // invert for cold
  const max = Math.max(...freq);
  const invRaw = freq.map(p => (max - p) + 1e-9);
  const invSum = invRaw.reduce((a,b)=>a+b,0);
  const inv = invRaw.map(x => x/invSum);

  // blend with uniform by alpha
  const base = Array(80).fill(1/80);
  const chosen = mode === 'hot' ? freq : inv;
  const blended = chosen.map((p,i) => (1 - alpha)*base[i] + alpha*p);
  const s2 = blended.reduce((a,b)=>a+b,0);
  return blended.map(x => x/s2);
}

/** Ticket generator for Quick Draw. */
export function generateQuickDrawTicket(
  stats: ReturnType<typeof computeQuickDrawStats>,
  spots: 1|2|3|4|5|6|7|8|9|10,
  opts: { mode:'hot'|'cold'; alpha:number }
): number[] {
  const w = buildQuickDrawWeights(stats, opts.mode, opts.alpha);
  return weightedSampleDistinctFromWeights(spots, w);
}

/** Recommend weighting for Quick Draw (20-from-80). */
export function recommendQuickDrawFromStats(
  stats: ReturnType<typeof computeQuickDrawStats>
): { mode:'hot'|'cold'; alpha:number } {
  const counts = Array.from({length:80},(_,i)=> (stats?.counts.get(i+1) ?? 0));
  const cv = coefVar(counts);
  let rec: { mode:'hot'|'cold'; alpha:number };
  if (cv >= 0.18) rec = { mode: 'hot',  alpha: 0.64 };
  else if (cv <= 0.10) rec = { mode: 'cold', alpha: 0.54 };
  else rec = { mode: 'hot', alpha: 0.60 };
  if (stats) rec.alpha = clampAlphaGeneric(rec.alpha, stats.totalDraws || 0, 80, 0.50, 0.70);
  return rec;
}

/** Spots-aware top-prize odds (hit-all) for Quick Draw. */
export function jackpotOddsQuickDraw(spots: 1|2|3|4|5|6|7|8|9|10): number {
  // Odds = C(80,spots) / C(20,spots)
  return Math.round(nCk(80, spots) / nCk(20, spots));
}
