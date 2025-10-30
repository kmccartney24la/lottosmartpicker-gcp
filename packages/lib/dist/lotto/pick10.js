import { weightedSampleDistinctFromWeights, coefVar, clampAlphaGeneric } from './stats.js';
/** Basic stats for Pick 10 (10-from-80). */
export function computePick10Stats(rows) {
    const counts = new Map();
    const lastSeen = new Map();
    for (let n = 1; n <= 80; n++) {
        counts.set(n, 0);
        lastSeen.set(n, Infinity);
    }
    // rows expected ascending; iterate newest→oldest without copying
    for (let i = rows.length - 1, idx = 0; i >= 0; i--, idx++) {
        const r = rows[i];
        if (!r)
            continue;
        const v = (r.values || []).filter(n => Number.isFinite(n) && n >= 1 && n <= 80);
        if (v.length !== 10)
            return;
        v.forEach(n => {
            counts.set(n, (counts.get(n) || 0) + 1);
            lastSeen.set(n, Math.min(lastSeen.get(n) || Infinity, idx));
        });
    }
    const totalDraws = rows.length;
    const expected = (totalDraws * 10) / 80;
    const p = 10 / 80;
    const variance = totalDraws * p * (1 - p);
    const sd = Math.max(Math.sqrt(Math.max(variance, 1e-9)), 1e-6);
    const z = new Map();
    for (let n = 1; n <= 80; n++)
        z.set(n, ((counts.get(n) || 0) - expected) / sd);
    return { counts, lastSeen, totalDraws, z };
}
/** Weight builder for Pick 10 (hot/cold + alpha blend). */
export function buildPick10Weights(stats, mode, alpha) {
    // smoothing
    const arr = Array.from({ length: 80 }, (_, i) => (stats?.counts.get(i + 1) ?? 0));
    const total = arr.reduce((a, b) => a + b, 0);
    const avg = total / 80;
    const eps = Math.min(1, Math.max(0.1, 0.05 * avg));
    const smooth = arr.map(c => c + eps);
    const sum = smooth.reduce((a, b) => a + b, 0);
    const freq = smooth.map(c => c / sum);
    const max = Math.max(...freq);
    const invRaw = freq.map(p => (max - p) + 1e-9);
    const invSum = invRaw.reduce((a, b) => a + b, 0);
    const inv = invRaw.map(x => x / invSum);
    const base = Array(80).fill(1 / 80);
    const chosen = mode === 'hot' ? freq : inv;
    const blended = chosen.map((p, i) => (1 - alpha) * base[i] + alpha * p);
    const s2 = blended.reduce((a, b) => a + b, 0);
    return blended.map(x => x / s2);
}
/** Ticket generator for Pick 10, using weights. */
export function generatePick10Ticket(stats, opts) {
    const w = buildPick10Weights(stats, opts.mode, opts.alpha);
    return weightedSampleDistinctFromWeights(10, w);
}
/** Pattern-style hints for Pick 10 (UI sugar). */
export function ticketHintsPick10(values, stats) {
    const hints = [];
    if (!Array.isArray(values) || values.length !== 10)
        return ['Invalid'];
    const a = [...values].sort((x, y) => x - y);
    // Similar flavor to 5-ball hints but tuned for k=10
    const span = a[a.length - 1] - a[0];
    if (span <= 80 / 10)
        hints.push('Tight span');
    const run3 = a.some((_, i) => i >= 2 && a[i - 2] + 2 === a[i - 1] + 1 && a[i - 1] + 1 === a[i]);
    if (run3)
        hints.push('3-in-a-row');
    const bday = a.filter(n => n <= 31).length >= 6; // 6+ of first 31
    if (bday)
        hints.push('Birthday-heavy');
    const hot = a.filter(n => ((stats?.z.get(n) ?? 0) > 1)).length;
    const cold = a.filter(n => ((stats?.z.get(n) ?? 0) < -1)).length;
    if (hot >= 5)
        hints.push('Hot mains');
    if (cold >= 5)
        hints.push('Cold mains');
    if (hints.length === 0)
        hints.push('Balanced');
    return hints;
}
/** Recommend weighting for Pick 10 (10-from-80). */
export function recommendPick10FromStats(stats) {
    const counts = Array.from({ length: 80 }, (_, i) => (stats?.counts.get(i + 1) ?? 0));
    const cv = coefVar(counts);
    let rec;
    if (cv >= 0.22)
        rec = { mode: 'hot', alpha: 0.65 };
    else if (cv <= 0.12)
        rec = { mode: 'cold', alpha: 0.55 };
    else
        rec = { mode: 'hot', alpha: 0.60 };
    if (stats)
        rec.alpha = clampAlphaGeneric(rec.alpha, stats.totalDraws, 80, 0.50, 0.70);
    return rec;
}
