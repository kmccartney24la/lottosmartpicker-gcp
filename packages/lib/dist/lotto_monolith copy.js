// packages/lib/src/lotto.ts
// Deterministic representative key (used by components that need *one* key)
// lib/lotto.ts
// Soft error used when a non-canonical game is routed to canonical fetchers.
export class NonCanonicalGameError extends Error {
    code = 'NON_CANONICAL';
    constructor(msg = 'Non-canonical game requested from canonical fetcher') { super(msg); }
}
// Dev-only self-check: ensure FL Pick keys exist in the loaded map
if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
    const mustHave = [
        'fl_pick2_midday', 'fl_pick2_evening',
        'fl_pick3_midday', 'fl_pick3_evening',
        'fl_pick4_midday', 'fl_pick4_evening',
        'fl_pick5_midday', 'fl_pick5_evening',
    ];
    const missing = mustHave.filter(k => !(k in GAME_TO_API_PATH));
    if (missing.length) {
        // eslint-disable-next-line no-console
        console.warn('DEV WARNING: Missing FL Pick keys in GAME_TO_API_PATH:', missing);
    }
}
function toISODateOnly(s) {
    if (!s)
        return null;
    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s))
        return s;
    // Try Date()
    const d = new Date(s);
    if (!Number.isNaN(d.getTime()))
        return d.toISOString().slice(0, 10);
    return null;
}
function getRowISODate(row) {
    return toISODateOnly(row?.draw_date) ?? toISODateOnly(row?.date);
}
// Normalizes any PB/MM/GA row shape to LottoRow used across the app
export function normalizeRowsLoose(rows) {
    if (!Array.isArray(rows))
        return [];
    const isGameKey = (g) => g === 'multi_powerball' || g === 'multi_megamillions' || g === 'multi_cash4life' ||
        g === 'ga_fantasy5' || g === 'ny_take5' || g === 'tx_cash5';
    const out = [];
    for (const r of rows) {
        // date → ISO
        const rawDate = r.draw_date ?? r.date ?? r.drawDate;
        if (!rawDate)
            continue;
        const d = new Date(rawDate);
        if (Number.isNaN(d.getTime()))
            continue;
        const date = d.toISOString().slice(0, 10);
        // mains → 5 numbers
        let mains;
        if (Array.isArray(r.mains) && r.mains.length >= 5) {
            mains = r.mains.map((n) => Number(n)).filter(Number.isFinite).slice(0, 5);
        }
        else {
            const candidate = [r.n1, r.n2, r.n3, r.n4, r.n5]
                .map((n) => Number(n))
                .filter(Number.isFinite);
            if (candidate.length >= 5)
                mains = candidate.slice(0, 5);
        }
        if (!mains || mains.length < 5)
            continue;
        const [n1, n2, n3, n4, n5] = mains;
        // special (optional)
        const specialRaw = r.special ?? r.special_ball ?? r.pb ?? r.mb;
        const special = specialRaw !== undefined && specialRaw !== null && specialRaw !== ''
            ? Number(specialRaw)
            : undefined;
        if (special !== undefined && !Number.isFinite(special))
            continue;
        // game
        const gameCandidate = r.game ?? r.gameKey ?? r.type;
        if (!isGameKey(gameCandidate))
            continue;
        const game = gameCandidate;
        out.push({ game, date, n1, n2, n3, n4, n5, special });
    }
    return out;
}
/** Recommend weighting for digits (domain 0–9, with replacement). */
export function recommendDigitsFromStats(stats) {
    if (!stats)
        return { mode: 'hot', alpha: 0.55 };
    const counts = stats.counts.slice(); // length 10
    const cv = coefVar(counts);
    let rec;
    if (cv >= 0.18)
        rec = { mode: 'hot', alpha: 0.60 };
    else if (cv <= 0.10)
        rec = { mode: 'cold', alpha: 0.50 };
    else
        rec = { mode: 'hot', alpha: 0.55 };
    rec.alpha = clampAlphaGeneric(rec.alpha, stats.totalDraws, 10, 0.45, 0.65);
    return rec;
}
// ---------- NEW: recommendations for Pick 10 (10-from-80) ----------
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
// ---------- NY Lotto: extended rows (6 mains + bonus) for Past Draws ----------
export async function fetchNyLottoExtendedRows() {
    const url = apiPathForUnderlying('ny_nylotto');
    const res = await fetch(url);
    if (!res.ok)
        return [];
    const csv = await res.text();
    const flex = parseFlexibleCsv(csv); // ascending
    return flex.map(fr => {
        const vals = fr.values.filter(Number.isFinite).map(Number);
        const mains = vals.slice(0, 6);
        const bonus = Number.isFinite(fr.special) ? fr.special : (Number.isFinite(vals[6]) ? vals[6] : NaN);
        return (mains.length === 6 && Number.isFinite(bonus))
            ? { date: fr.date, mains, bonus: bonus }
            : null;
    }).filter(Boolean);
}
