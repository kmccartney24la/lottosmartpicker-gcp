// ---------- Feature Flags ----------
export const FEATURES = {
    DIGIT_HINTS: (process.env.NEXT_PUBLIC_ENABLE_DIGIT_HINTS ?? '1') === '1',
    PICK10: (process.env.NEXT_PUBLIC_ENABLE_PICK10 ?? '0') === '1',
};
export const LOGICAL_TO_UNDERLYING = {
    multi_powerball: { all: ['multi_powerball'] },
    multi_megamillions: { all: ['multi_megamillions'] },
    multi_cash4life: { all: ['multi_cash4life'] },
    // ---- New York ----
    ny_take5: { all: ['ny_take5_midday', 'ny_take5_evening'], midday: ['ny_take5_midday'], evening: ['ny_take5_evening'] },
    ny_numbers: { all: ['ny_numbers_midday', 'ny_numbers_evening'], midday: ['ny_numbers_midday'], evening: ['ny_numbers_evening'] },
    ny_win4: { all: ['ny_win4_midday', 'ny_win4_evening'], midday: ['ny_win4_midday'], evening: ['ny_win4_evening'] },
    ny_lotto: { all: ['ny_nylotto'] },
    ny_pick10: { all: ['ny_pick10'] },
    ny_quick_draw: { all: ['ny_quick_draw'] },
    // ---- California (5-ball canonical) ----
    ca_superlotto_plus: { all: ['ca_superlotto_plus'] },
    ca_fantasy5: { all: ['ca_fantasy5'] },
    // ---- California (digit) ----
    ca_daily3: { all: ['ca_daily3_midday', 'ca_daily3_evening'], midday: ['ca_daily3_midday'], evening: ['ca_daily3_evening'] },
    ca_daily4: { all: ['ca_daily4'] },
    // ---- Florida----
    fl_fantasy5: { all: ['fl_fantasy5_midday', 'fl_fantasy5_evening'], midday: ['fl_fantasy5_midday'], evening: ['fl_fantasy5_evening'] },
    fl_pick5: { all: ['fl_pick5_midday', 'fl_pick5_evening'], midday: ['fl_pick5_midday'], evening: ['fl_pick5_evening'] },
    fl_pick4: { all: ['fl_pick4_midday', 'fl_pick4_evening'], midday: ['fl_pick4_midday'], evening: ['fl_pick4_evening'] },
    fl_pick3: { all: ['fl_pick3_midday', 'fl_pick3_evening'], midday: ['fl_pick3_midday'], evening: ['fl_pick3_evening'] },
    fl_pick2: { all: ['fl_pick2_midday', 'fl_pick2_evening'], midday: ['fl_pick2_midday'], evening: ['fl_pick2_evening'] },
    // ---- Florida Cash Pop (5 periods) ----
    fl_cashpop: {
        all: ['fl_cashpop_morning', 'fl_cashpop_matinee', 'fl_cashpop_afternoon', 'fl_cashpop_evening', 'fl_cashpop_latenight'],
        morning: ['fl_cashpop_morning'],
        matinee: ['fl_cashpop_matinee'],
        afternoon: ['fl_cashpop_afternoon'],
        evening: ['fl_cashpop_evening'],
        latenight: ['fl_cashpop_latenight'],
    },
};
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
// Deterministic representative key (used by components that need *one* key)
// lib/lotto.ts
export function primaryKeyFor(logical, period) {
    const m = LOGICAL_TO_UNDERLYING[logical];
    // If someone passes a canonical GameKey by mistake, just return it.
    if (!m && GAME_TO_API_PATH[logical]) {
        return logical;
    }
    if (!m)
        throw new Error(`Unknown logical game: ${logical}`);
    const p = period === 'both' ? 'all' : period;
    if (p !== 'all' && m[p]?.length)
        return m[p][0];
    return m.evening?.[0] ?? m.midday?.[0] ?? (m.all?.[0] ?? m.both?.[0]);
}
const isMultiGame = (g) => g === 'multi_powerball' || g === 'multi_megamillions' || g === 'multi_cash4life';
// Map any GameKey to the EraGame we use for analysis (generator, stats, labels).
function resolveEraGame(game) {
    // Twice-daily Take 5 representatives & underlying collapse to 'ny_take5'
    if (game === 'ny_take5' || game === 'ny_take5_midday' || game === 'ny_take5_evening')
        return 'ny_take5';
    // Florida Fantasy 5 (midday/evening) collapse to 'fl_fantasy5'
    if (game === 'fl_fantasy5_midday' || game === 'fl_fantasy5_evening')
        return 'fl_fantasy5';
    // NY Lotto maps to its own era (6 + Bonus)
    if (game === 'ny_lotto' || game === 'ny_nylotto')
        return 'ny_lotto';
    // NEW: CA Fantasy 5 is canonical 5/39
    if (game === 'ca_fantasy5')
        return 'ca_fantasy5';
    // All multi-state & GA Fantasy 5 are already EraGame members
    if (game === 'multi_powerball' ||
        game === 'multi_megamillions' ||
        game === 'multi_cash4life' ||
        game === 'ga_fantasy5' ||
        game === 'ca_superlotto_plus' ||
        game === 'fl_lotto' ||
        game === 'fl_jackpot_triple_play') {
        return game;
    }
    // Fallback: use Cash4Life era (safe, 5+1) if someone passes a non-era NY key by mistake.
    return 'multi_cash4life';
}
// Safe accessor for weekly draw schedules.
function getScheduleGame(game) {
    if (game === 'multi_powerball' || game === 'multi_megamillions' || game === 'multi_cash4life' || game === 'ga_fantasy5' ||
        game === 'fl_fantasy5_midday' || game === 'fl_fantasy5_evening' ||
        game === 'ca_superlotto_plus' || game === 'ca_fantasy5') {
        return (game === 'fl_fantasy5_midday' || game === 'fl_fantasy5_evening') ? 'fl_fantasy5' : game;
    }
    // Use Take 5’s “daily/twice daily” semantics for NY logicals by default.
    return 'ny_take5';
}
// Always go through the app proxy
const FILE_BASE = process.env.NEXT_PUBLIC_DATA_BASE ||
    process.env.NEXT_PUBLIC_DATA_BASE_URL ||
    '/api/file';
function shouldSeedFullHistory() {
    // Guarded to Node/SSR; in browser `process` may not exist
    return typeof process !== 'undefined'
        && !!process.env
        && process.env.LSP_SEED_FULL === '1';
}
// Soft error used when a non-canonical game is routed to canonical fetchers.
export class NonCanonicalGameError extends Error {
    code = 'NON_CANONICAL';
    constructor(msg = 'Non-canonical game requested from canonical fetcher') { super(msg); }
}
function isBrowser() { return typeof window !== 'undefined' && typeof localStorage !== 'undefined'; }
function cacheKey(game) {
    // bump whenever caching logic/shape changes
    return `lsp.cache.v2.${game}`;
}
/** Canonical Next API endpoints per game (remote-first to GCS, no-store). */
export const GAME_TO_API_PATH = Object.freeze({
    multi_powerball: `${FILE_BASE}/multi/powerball.csv`,
    multi_megamillions: `${FILE_BASE}/multi/megamillions.csv`,
    multi_cash4life: `${FILE_BASE}/multi/cash4life.csv`,
    // --- Georgia ---
    ga_fantasy5: `${FILE_BASE}/ga/fantasy5.csv`,
    // --- California ---
    ca_superlotto_plus: `${FILE_BASE}/ca/superlotto_plus.csv`,
    ca_fantasy5: `${FILE_BASE}/ca/fantasy5.csv`,
    // --- Florida ---
    fl_lotto: `${FILE_BASE}/fl/lotto.csv`,
    fl_jackpot_triple_play: `${FILE_BASE}/fl/jackpot_triple_play.csv`,
    fl_fantasy5_midday: `${FILE_BASE}/fl/fantasy5_midday.csv`,
    fl_fantasy5_evening: `${FILE_BASE}/fl/fantasy5_evening.csv`,
    fl_pick5_midday: `${FILE_BASE}/fl/pick5_midday.csv`,
    fl_pick5_evening: `${FILE_BASE}/fl/pick5_evening.csv`,
    fl_pick4_midday: `${FILE_BASE}/fl/pick4_midday.csv`,
    fl_pick4_evening: `${FILE_BASE}/fl/pick4_evening.csv`,
    fl_pick3_midday: `${FILE_BASE}/fl/pick3_midday.csv`,
    fl_pick3_evening: `${FILE_BASE}/fl/pick3_evening.csv`,
    fl_pick2_midday: `${FILE_BASE}/fl/pick2_midday.csv`,
    fl_pick2_evening: `${FILE_BASE}/fl/pick2_evening.csv`,
    // --- New York (UNDERLYING, file-backed) ---
    ny_nylotto: `${FILE_BASE}/ny/nylotto.csv`,
    ny_numbers_midday: `${FILE_BASE}/ny/numbers_midday.csv`,
    ny_numbers_evening: `${FILE_BASE}/ny/numbers_evening.csv`,
    ny_win4_midday: `${FILE_BASE}/ny/win4_midday.csv`,
    ny_win4_evening: `${FILE_BASE}/ny/win4_evening.csv`,
    ny_pick10: `${FILE_BASE}/ny/pick10.csv`,
    ny_take5_midday: `${FILE_BASE}/ny/take5_midday.csv`,
    ny_take5_evening: `${FILE_BASE}/ny/take5_evening.csv`,
    ny_quick_draw: `${FILE_BASE}/ny/quick_draw.csv`,
    // --- New York (REPRESENTATIVE, single-source convention for “latest/overview” UIs) ---
    // For twice-daily games, use EVENING as the representative source.
    ny_take5: `${FILE_BASE}/ny/take5_evening.csv`,
    ny_numbers: `${FILE_BASE}/ny/numbers_evening.csv`,
    ny_win4: `${FILE_BASE}/ny/win4_evening.csv`,
    ny_lotto: `${FILE_BASE}/ny/nylotto.csv`,
    // If you keep these optional rep keys, map them to their single file:
    ny_quick_draw_rep: `${FILE_BASE}/ny/quick_draw.csv`,
    ny_pick10_rep: `${FILE_BASE}/ny/pick10.csv`,
});
export function apiPathForGame(game) {
    const p = GAME_TO_API_PATH[game];
    if (!p)
        throw new Error(`Unknown game key: ${game}`);
    return p;
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
/** Map any underlying key (canonical or flexible) to its CSV API path. */
function apiPathForUnderlying(u) {
    // 1) Canonical keys reuse the existing map (fast path).
    const canonical = GAME_TO_API_PATH[u];
    if (canonical)
        return canonical;
    // Flexible CSVs (served via same-origin proxy)
    switch (u) {
        // --- Florida Pick (explicit fallbacks; protects against stale maps) ---
        case 'fl_pick2_midday': return `${FILE_BASE}/fl/pick2_midday.csv`;
        case 'fl_pick2_evening': return `${FILE_BASE}/fl/pick2_evening.csv`;
        case 'fl_pick3_midday': return `${FILE_BASE}/fl/pick3_midday.csv`;
        case 'fl_pick3_evening': return `${FILE_BASE}/fl/pick3_evening.csv`;
        case 'fl_pick4_midday': return `${FILE_BASE}/fl/pick4_midday.csv`;
        case 'fl_pick4_evening': return `${FILE_BASE}/fl/pick4_evening.csv`;
        case 'fl_pick5_midday': return `${FILE_BASE}/fl/pick5_midday.csv`;
        case 'fl_pick5_evening': return `${FILE_BASE}/fl/pick5_evening.csv`;
        // --- FL Cash Pop flexible files ---
        case 'fl_cashpop_morning': return `${FILE_BASE}/fl/cashpop_morning.csv`;
        case 'fl_cashpop_matinee': return `${FILE_BASE}/fl/cashpop_matinee.csv`;
        case 'fl_cashpop_afternoon': return `${FILE_BASE}/fl/cashpop_afternoon.csv`;
        case 'fl_cashpop_evening': return `${FILE_BASE}/fl/cashpop_evening.csv`;
        case 'fl_cashpop_latenight': return `${FILE_BASE}/fl/cashpop_latenight.csv`;
        // --- New York flexible files ---
        case 'ny_take5_midday': return `${FILE_BASE}/ny/take5_midday.csv`;
        case 'ny_take5_evening': return `${FILE_BASE}/ny/take5_evening.csv`;
        case 'ny_numbers_midday': return `${FILE_BASE}/ny/numbers_midday.csv`;
        case 'ny_numbers_evening': return `${FILE_BASE}/ny/numbers_evening.csv`;
        case 'ny_win4_midday': return `${FILE_BASE}/ny/win4_midday.csv`;
        case 'ny_win4_evening': return `${FILE_BASE}/ny/win4_evening.csv`;
        case 'ny_nylotto': return `${FILE_BASE}/ny/nylotto.csv`;
        case 'ny_pick10': return `${FILE_BASE}/ny/pick10.csv`;
        case 'ny_quick_draw': return `${FILE_BASE}/ny/quick_draw.csv`;
        // --- California flexible files ---
        case 'ca_daily3_midday': return `${FILE_BASE}/ca/daily3_midday.csv`;
        case 'ca_daily3_evening': return `${FILE_BASE}/ca/daily3_evening.csv`;
        case 'ca_daily4': return `${FILE_BASE}/ca/daily4.csv`;
    }
    throw new Error(`No API path for underlying key: ${u}`);
}
function latestApiPathForGame(game) {
    const p = apiPathForGame(game);
    return p.replace(/\.csv(\?.*)?$/i, '.latest.csv');
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
export function computeNextRefreshISO(_game) {
    // Simple, safe TTL: refresh again in 6 hours
    const now = new Date();
    now.setHours(now.getHours() + 6);
    return now.toISOString();
}
function readCache(game) {
    if (!isBrowser())
        return null;
    try {
        const raw = localStorage.getItem(cacheKey(game));
        if (!raw)
            return null;
        return JSON.parse(raw);
    }
    catch {
        // Explicitly clear corrupted entries so we don’t loop on bad JSON.
        try {
            localStorage.removeItem(cacheKey(game));
        }
        catch { }
        return null;
    }
}
function writeCache(game, payload, eraStart) {
    if (!isBrowser())
        return;
    const env = {
        rawCsv: payload.rawCsv,
        // do not persist legacy rows anymore, but allow caller to pass if needed
        ...(payload.rows ? { rows: payload.rows } : {}),
        eraStart,
        cachedAtISO: new Date().toISOString(),
        nextRefreshISO: computeNextRefreshISO(game),
    };
    try {
        localStorage.setItem(cacheKey(game), JSON.stringify(env));
    }
    catch { }
}
function isCacheFresh(env) {
    // consider an empty cache as stale to force a refetch
    const hasData = !!(env.rawCsv && env.rawCsv.trim().length) || !!(env.rows && env.rows.length);
    if (!hasData)
        return false;
    return new Date(env.nextRefreshISO).getTime() > Date.now();
}
export async function fetchRowsWithCache(options) {
    const { game, since, until, token } = options;
    // 🚧 Guard: digit & cashpop games must never use the canonical 5-ball parser.
    // Phase 0: convert to SOFT error so UI never crashes on fast tab switches.
    if (game.startsWith('fl_pick') ||
        game.startsWith('ny_numbers') ||
        game.startsWith('ny_win4') ||
        game === 'ny_quick_draw' ||
        game === 'ny_pick10' ||
        // Guard: CA digit games are not canonical 5-ball sources
        game === 'ca_daily3' ||
        game === 'ca_daily4') {
        // Optional breadcrumb for debugging (kept)
        // eslint-disable-next-line no-console
        console.warn('BUG: fetchRowsWithCache called for non-canonical game:', game, new Error().stack);
        return []; // ← soft-fail
    }
    // 🔁 If CI asked to seed, force full history for multi games (PB/MM)
    const effectiveLatestOnly = options.latestOnly && !(isMultiGame(game) && shouldSeedFullHistory());
    const era = getCurrentEraConfig(game);
    if (!effectiveLatestOnly) {
        const env = readCache(game);
        if (env && env.eraStart === era.start && isCacheFresh(env)) {
            // Prefer rawCsv if present
            if (env.rawCsv) {
                const parsed = parseCanonicalCsv(env.rawCsv, game);
                return filterRowsForCurrentEra(parsed, game);
            }
            if (env.rows) {
                return filterRowsForCurrentEra(env.rows, game);
            }
        }
    }
    const env = !effectiveLatestOnly ? readCache(game) : null;
    if (env && env.eraStart === era.start) {
        try {
            // Tiny freshness probe (cached by browser/CDN now that we removed no-store).
            const remoteLatest = await fetchLatestDate(game);
            // cachedLatest is an ISO date; remoteLatest may be an ISO date OR an ETag token.
            // Equality is all we need; if remote returns an ETag, this comparison will fail
            // and we’ll fall through to a full GET, which is still correct (and cached).
            const cachedLatest = (() => {
                if (env.rawCsv) {
                    const r = parseCanonicalCsv(env.rawCsv, game);
                    return r.length ? r[r.length - 1].date : null;
                }
                return env.rows && env.rows.length ? env.rows[env.rows.length - 1].date : null;
            })();
            if (remoteLatest && cachedLatest === remoteLatest) {
                // Cache matches the source — return immediately (even if TTL not elapsed).
                return filterRowsForCurrentEra(env.rows ?? [], game);
            }
            // If we couldn’t read latest date (null), fall back to TTL freshness.
            if (!remoteLatest && isCacheFresh(env)) {
                return filterRowsForCurrentEra(env.rows ?? [], game);
            }
            // else: stale → fall through to full fetch
        }
        catch {
            // If probe fails but TTL says fresh, still use cache.
            if (isCacheFresh(env))
                return filterRowsForCurrentEra(env.rows ?? [], game);
        }
    }
    let rows = [];
    let csvText = null;
    try {
        // Fetch CSV text directly so we can cache raw CSV
        const url = apiPathForGame(game);
        const res = await fetch(url);
        if (!res.ok)
            throw new Error(`Canonical ${game} ${res.status}`);
        csvText = await res.text();
        const all = parseCanonicalCsv(csvText, game); // remote-first via Next API → GCS
        rows = applyFilters(all, { since, until, latestOnly: effectiveLatestOnly });
    }
    catch (err) {
        // Fall back to Socrata only for Socrata-backed games
        if (game === 'multi_powerball' || game === 'multi_megamillions' || game === 'multi_cash4life') {
            if (typeof window === 'undefined') {
                rows = await fetchNY({ game, since, until, latestOnly: effectiveLatestOnly, token });
            }
            else {
                // Surface the error; let the UI show cached data + “refreshing” or a retry
                throw err;
            }
        }
        else {
            // For Fantasy 5 (no Socrata), rethrow so callers see the failure
            throw err;
        }
    }
    if (!effectiveLatestOnly) {
        // cache raw CSV (preferred). If we only fetched latest row, skip cache write.
        if (csvText)
            writeCache(game, { rawCsv: csvText }, era.start);
    }
    return filterRowsForCurrentEra(rows, game);
}
export const SOCRATA_BASE = 'https://data.ny.gov/resource';
export const DATASETS = {
    multi_powerball: { id: 'd6yy-54nr', dateField: 'draw_date', winningField: 'winning_numbers' },
    multi_megamillions: { id: '5xaw-6ayf', dateField: 'draw_date', winningField: 'winning_numbers', specialField: 'mega_ball' },
    multi_cash4life: { id: 'kwxv-fwze', dateField: 'draw_date', winningField: 'winning_numbers', specialField: 'cash_ball' }, // NY Open Data Cash4Life
};
export const DRAW_DOWS = {
    multi_powerball: new Set([1, 3, 6]),
    multi_megamillions: new Set([2, 5]),
    multi_cash4life: new Set([0, 1, 2, 3, 4, 5, 6]), // daily 9:00 p.m. ET
    ca_superlotto_plus: new Set([3, 6]), // Wed & Sat (0=Sun)
    ca_fantasy5: new Set([0, 1, 2, 3, 4, 5, 6]),
    ga_fantasy5: new Set([0, 1, 2, 3, 4, 5, 6]), // daily 11:34 p.m. ET
    fl_fantasy5: new Set([0, 1, 2, 3, 4, 5, 6]),
    ny_take5: new Set([0, 1, 2, 3, 4, 5, 6]), // twice daily; treat as "daily" for window helpers
};
export const CURRENT_ERA = {
    multi_powerball: {
        start: '2015-10-07',
        mainMax: 69,
        specialMax: 26,
        mainPick: 5,
        label: '5/69 + 1/26',
        description: 'Powerball’s current matrix took effect on Oct 7, 2015: 5 mains from 1–69 and Powerball 1–26 (changed from 59/35).',
    },
    multi_megamillions: {
        start: '2025-04-08',
        mainMax: 70,
        specialMax: 24,
        mainPick: 5,
        label: '5/70 + 1/24',
        description: 'Mega Millions’ current matrix took effect on Apr 8, 2025: 5 mains from 1–70 and Mega Ball 1–24 (reduced from 25).',
    },
    multi_cash4life: {
        start: '2014-06-16', // conservative lower bound; matrix unchanged since launch in 2014 per NY Open Data
        mainMax: 60,
        specialMax: 4,
        mainPick: 5,
        label: '5/60 + Cash Ball 1/4',
        description: 'Cash4Life: 5 mains from 1–60 and Cash Ball 1–4. Daily draws at 9:00 p.m. ET. Matrix stable since 2014.',
    },
    ga_fantasy5: {
        start: '2019-04-25', // rules doc date; safe “current era” bound under 5/42 daily drawings
        mainMax: 42,
        specialMax: 0, // <-- no special ball
        mainPick: 5,
        label: '5/42 (no bonus)',
        description: 'Fantasy 5: 5 mains from 1–42, no bonus ball. Daily draws at 11:34 p.m. ET.',
    },
    ny_take5: {
        start: '1992-01-17', // conservative lower bound (matrix is stable 5/39)
        mainMax: 39,
        specialMax: 0,
        mainPick: 5,
        label: '5/39 (no bonus)',
        description: 'NY Take 5: 5 mains from 1–39, no bonus ball. Draws twice daily (midday/evening).',
    },
    ny_lotto: {
        // NY Lotto has been 6-from-59 + Bonus (59) for the modern era.
        start: '2001-09-12', // safe lower bound; adjust if you later version eras
        mainMax: 59,
        specialMax: 59, // use the same domain for the Bonus UI
        mainPick: 6, // ← key change: six mains
        label: '6/59 + Bonus (1–59)',
        description: 'NY Lotto: 6 mains from 1–59 plus a Bonus ball (also 1–59). Jackpot odds = C(59,6); Bonus used for 2nd prize.',
    },
    fl_lotto: {
        start: '1999-10-24', // matrix changed to 6/53 on Oct 24, 1999
        mainMax: 53,
        specialMax: 53, // we store the 6th main in `special` for schema compatibility
        mainPick: 6, // six mains
        label: '6/53 (no bonus; 6th stored as special)',
        description: 'Florida LOTTO: 6 mains from 1–53. We store the 6th main in “special” to match the 5+special CSV schema. Double Play rows are excluded.',
    },
    fl_jackpot_triple_play: {
        start: '2019-01-30', // JTP launch
        mainMax: 46,
        specialMax: 46, // store 6th main in `special` (schema compatibility)
        mainPick: 6,
        label: '6/46 (no bonus; 6th stored as special)',
        description: 'Florida Jackpot Triple Play: 6 mains from 1–46, no bonus ball. We store the 6th main in “special” to match the canonical 5+special schema.',
    },
    fl_fantasy5: {
        start: '1999-04-25', // day after Sat, Apr 24, 1999 → 5/36 era
        mainMax: 36,
        specialMax: 0,
        mainPick: 5,
        label: '5/36 (no bonus)',
        description: 'Florida Fantasy 5: 5 mains from 1–36, no bonus ball. Midday & Evening draws; rows before 1999-04-25 are excluded.',
    },
    ca_superlotto_plus: {
        start: '2000-06-01', // SuperLotto → SuperLotto Plus 5/47 + 1/27 began June 2000
        mainMax: 47,
        specialMax: 27, // Mega number 1–27
        mainPick: 5,
        label: '5/47 + Mega 1/27',
        description: 'California SuperLotto Plus: 5 mains from 1–47 and a Mega number 1–27. Draws Wed & Sat; matrix in place since June 2000.',
    },
    ca_fantasy5: {
        start: '1992-01-01',
        mainMax: 39,
        specialMax: 0,
        mainPick: 5,
        label: '5/39 (no bonus)',
        description: 'California Fantasy 5: 5 mains from 1–39, no bonus ball. Daily draws; entry closes at 6:30 p.m. PT.',
    },
};
export function getCurrentEraConfig(game) {
    return CURRENT_ERA[resolveEraGame(game)];
}
export function filterRowsForCurrentEra(rows, game) {
    const eraKey = resolveEraGame(game);
    const era = CURRENT_ERA[eraKey];
    // Accept any row whose game resolves to the same era group (handles ny_lotto vs ny_nylotto, take5 rep vs underlying, etc.)
    return rows.filter(r => resolveEraGame(r.game) === eraKey && r.date >= era.start);
}
export function eraTooltipFor(game) {
    const era = CURRENT_ERA[resolveEraGame(game)];
    const name = game === 'multi_powerball' ? 'Powerball'
        : game === 'multi_megamillions' ? 'Mega Millions'
            : game === 'multi_cash4life' ? 'Cash4Life (GA)'
                : game === 'ca_superlotto_plus' ? 'SuperLotto Plus (CA)'
                    : game === 'ca_fantasy5' ? 'Fantasy 5 (CA)'
                        : (game === 'fl_fantasy5_midday' || game === 'fl_fantasy5_evening') ? 'Fantasy 5 (FL)'
                            : 'Fantasy 5 (GA)';
    return [
        `${name} (current era: ${era.label})`,
        `Effective date: ${era.start}`,
        era.description,
        'Analyses and ticket generation in LottoSmartPicker include ALL draws since this date and ignore earlier eras.',
    ].join('\n');
}
/* ---------------- Date/time helpers ---------------- */
export function formatISO(d) { return d.toISOString().slice(0, 10); }
export function lastYearRange() {
    const today = new Date();
    const until = formatISO(today);
    const sinceD = new Date(today);
    sinceD.setDate(sinceD.getDate() - 365);
    const since = formatISO(sinceD);
    return { since, until };
}
export function buildWhere(dateField, since, until) {
    if (!since && !until)
        return undefined;
    if (since && until) {
        const end = new Date(until);
        end.setDate(end.getDate() + 1);
        const endISO = formatISO(end);
        return `${dateField} >= '${since}' AND ${dateField} < '${endISO}'`;
    }
    if (since)
        return `${dateField} >= '${since}'`;
    const end = new Date(until);
    end.setDate(end.getDate() + 1);
    return `${dateField} < '${formatISO(end)}'`;
}
// Normalizes any PB/MM/GA row shape to LottoRow used across the app
export function normalizeRowsLoose(rows) {
    if (!Array.isArray(rows))
        return [];
    const isGameKey = (g) => g === 'multi_powerball' || g === 'multi_megamillions' || g === 'multi_cash4life' ||
        g === 'ga_fantasy5' || g === 'ny_take5';
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
/* ---------------- Data fetching/parsing ---------------- */
export function parseTokens(s) {
    return s.replace(/,/g, ' ').replace(/-/g, ' ').split(/\s+/).filter(Boolean).map(t => parseInt(t, 10)).filter(n => Number.isFinite(n));
}
export async function fetchNY(options) {
    const { game, since, until, latestOnly, token } = options;
    if (game === 'ga_fantasy5') {
        throw new Error('fetchNY called for Fantasy 5 (no Socrata dataset).');
    }
    const SOC_KEYS = Object.keys(DATASETS);
    const isSocrataGame = (k) => SOC_KEYS.includes(k);
    if (!isSocrataGame(game)) {
        throw new Error(`Unsupported Socrata dataset for game: ${String(game)}`);
    }
    const cfg = DATASETS[game];
    const params = {
        $select: cfg.specialField
            ? `${cfg.dateField},${cfg.winningField},${cfg.specialField}`
            : `${cfg.dateField},${cfg.winningField}`,
        $order: `${cfg.dateField} ${latestOnly ? 'DESC' : 'ASC'}`,
        $limit: latestOnly ? '1' : '50000',
    };
    const where = latestOnly ? undefined : buildWhere(cfg.dateField, since, until);
    if (where)
        params.$where = where;
    const url = `${SOCRATA_BASE}/${cfg.id}.json?` +
        new URLSearchParams(params).toString();
    const res = await fetch(url, {
        headers: token ? { 'X-App-Token': token } : undefined,
        cache: 'no-store',
    });
    if (!res.ok)
        throw new Error(`Socrata ${res.status}: ${await res.text()}`);
    const rows = await res.json();
    const out = [];
    for (const r of rows) {
        const date = formatISO(new Date(r[cfg.dateField]));
        const nums = parseTokens(r[cfg.winningField] || '');
        if (nums.length < 5)
            continue;
        let special;
        if (cfg.specialField && r[cfg.specialField] != null) {
            const s = parseInt(r[cfg.specialField], 10);
            if (Number.isFinite(s))
                special = s;
        }
        if (special == null && nums.length >= 6)
            special = nums[5];
        if (special == null)
            continue;
        const [n1, n2, n3, n4, n5] = nums;
        out.push({ game, date, n1, n2, n3, n4, n5, special });
    }
    return out;
}
// (Removed) Fantasy 5 special CSV parser — use parseCanonicalCsv for all canonical CSVs.
// ---- Canonical CSV parser (one game per file) ----
export function parseCanonicalCsv(csv, game) {
    const lines = csv.trim().split(/\r?\n/);
    if (lines.length === 0)
        return [];
    const header = lines.shift();
    const cols = header.split(',').map(s => s.trim().toLowerCase());
    const idx = (name) => cols.indexOf(name);
    const iDate = idx('draw_date');
    const i1 = idx('num1') >= 0 ? idx('num1') : idx('m1');
    const i2 = idx('num2') >= 0 ? idx('num2') : idx('m2');
    const i3 = idx('num3') >= 0 ? idx('num3') : idx('m3');
    const i4 = idx('num4') >= 0 ? idx('num4') : idx('m4');
    const i5 = idx('num5') >= 0 ? idx('num5') : idx('m5');
    const iSpec = idx('special'); // optional
    if (iDate < 0 || [i1, i2, i3, i4, i5].some(i => i < 0))
        return [];
    const out = [];
    for (const line of lines) {
        if (!line.trim())
            continue;
        const t = line.split(',').map(s => s.trim());
        const dStr = t[iDate];
        if (!dStr)
            continue;
        const d = new Date(dStr);
        if (Number.isNaN(d.getTime()))
            continue;
        const date = d.toISOString().slice(0, 10);
        const mains = [t[i1], t[i2], t[i3], t[i4], t[i5]]
            .map(v => (v == null ? NaN : parseInt(v, 10)));
        if (mains.some(n => !Number.isFinite(n)))
            continue;
        const [n1, n2, n3, n4, n5] = mains;
        const special = iSpec >= 0 && t[iSpec] !== '' && t[iSpec] != null
            ? parseInt(t[iSpec], 10)
            : undefined;
        out.push({ game, date, n1, n2, n3, n4, n5, special });
    }
    return out;
}
export function parseFlexibleCsv(csv) {
    const lines = csv.trim().split(/\r?\n/);
    if (lines.length < 2)
        return [];
    const header = lines.shift().split(',').map(s => s.trim().toLowerCase());
    const find = (n) => header.indexOf(n);
    const iDate = ['draw_date', 'date'].map(find).find(i => i >= 0) ?? -1;
    if (iDate < 0)
        return [];
    // discover columns for values:
    // 1) n1..nN, 2) m1..mN, 3) num1..numN, 4) ball1..ballN
    const nIdx = [];
    const trySeq = (prefix) => {
        const acc = [];
        for (let i = 1; i <= 40; i++) {
            const j = find(`${prefix}${i}`);
            if (j >= 0)
                acc.push(j);
            else
                break;
        }
        return acc;
    };
    let seq = trySeq('n');
    if (seq.length === 0)
        seq = trySeq('m');
    if (seq.length === 0)
        seq = trySeq('num');
    if (seq.length === 0)
        seq = trySeq('ball');
    nIdx.push(...seq);
    // optional special column
    // Support common aliases: 'special', 'fb' (Florida Fireball), 'fireball'
    let iSpec = find('special');
    if (iSpec < 0)
        iSpec = find('fb');
    if (iSpec < 0)
        iSpec = find('fireball');
    // optional single string column of winning numbers
    const iWinning = find('winning_numbers');
    const out = [];
    for (const line of lines) {
        if (!line.trim())
            continue;
        const t = line.split(',').map(s => s.trim());
        const dStr = t[iDate];
        if (!dStr)
            continue;
        const d = new Date(dStr);
        if (Number.isNaN(d.getTime()))
            continue;
        const date = d.toISOString().slice(0, 10);
        let values = nIdx.map(i => parseInt(t[i] ?? '', 10)).filter(Number.isFinite);
        // fallback: parse "winning_numbers" token list if no numbered columns found
        if (values.length === 0 && iWinning >= 0 && t[iWinning]) {
            values = t[iWinning]
                .replace(/[,;|]/g, ' ')
                .split(/\s+/)
                .map(s => parseInt(s, 10))
                .filter(Number.isFinite);
        }
        let special;
        if (iSpec >= 0 && t[iSpec] !== '' && t[iSpec] != null) {
            const sRaw = t[iSpec];
            if (sRaw != null) {
                const s = parseInt(sRaw, 10);
                if (Number.isFinite(s))
                    special = s;
            }
        }
        out.push({ date, values, special });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
}
// No longer needed as API routes handle the URL construction and data fetching
// function canonicalUrlFor(game: GameKey): string {
//   const base = apiPathForGame(game);
//   // Add a lightweight cache-buster to avoid any intermediate caching surprises.
//   const sep = base.includes('?') ? '&' : '?';
//   return `${base}${sep}ts=${Date.now()}`;
// }
// function latestCanonicalUrlFor(game: GameKey): string {
//   const base = latestApiPathForGame(game);
//   const sep = base.includes('?') ? '&' : '?';
//   return `${base}${sep}ts=${Date.now()}`;
// }
// Phase 1: HEAD-based probe that prefers Last-Modified / ETag
async function fetchLatestDate(game) {
    const url = latestApiPathForGame(game);
    // Try HEAD first
    const head = await fetch(url, { method: 'HEAD' });
    if (head.ok) {
        const lm = head.headers.get('last-modified');
        if (lm) {
            const d = new Date(lm);
            if (!Number.isNaN(d.getTime()))
                return d.toISOString().slice(0, 10);
        }
        const etag = head.headers.get('etag');
        if (etag)
            return etag; // token for equality-only checks
    }
    // Fallback GET
    const res = await fetch(url);
    if (!res.ok)
        return null;
    const txt = await res.text();
    const lines = txt.trim().split(/\r?\n/);
    if (lines.length < 2)
        return null; // header-only
    const last = lines[lines.length - 1]?.split(',')[0];
    if (!last)
        return null;
    const d = new Date(last);
    if (Number.isNaN(d.getTime()))
        return null;
    return d.toISOString().slice(0, 10);
}
// Canonical fetch parses CSV (not JSON)
async function fetchCanonical(game) {
    const url = apiPathForGame(game);
    // Phase 1: let your /api/file route + CDN handle caching/304s.
    const res = await fetch(url);
    if (!res.ok)
        throw new Error(`Canonical ${game} ${res.status}`);
    const csv = await res.text();
    const rows = parseCanonicalCsv(csv, game);
    const minRows = isMultiGame(game) ? 1000 : 10;
    if (rows.length < minRows)
        throw new Error(`Canonical ${game} too small (${rows.length} rows)`);
    return rows.sort((a, b) => a.date.localeCompare(b.date));
}
// Helper: convert a flexible row into a LottoRow "shim" (first 5 values)
function toLottoShim(fr, rep) {
    const [n1, n2, n3, n4, n5] = [
        fr.values[0] || 0,
        fr.values[1] || 0,
        fr.values[2] || 0,
        fr.values[3] || 0,
        fr.values[4] || 0,
    ];
    // For NY Lotto, preserve the 6th MAIN inside `special` so stats can count 6 mains
    // (Bonus will be fetched separately for Past Draws via extended fetcher).
    const sixth = fr.values[5];
    const special = (rep === 'ny_lotto' && Number.isFinite(sixth))
        ? Number(sixth)
        : fr.special;
    return { game: rep, date: fr.date, n1, n2, n3, n4, n5, special };
}
// ---- fetchers for digits (Numbers/Win4) and Pick 10 ----
// --- supports Florida digit logicals and returns optional fb ---
export async function fetchDigitRowsFor(logical, period) {
    const keys = underlyingKeysFor(logical, period);
    const wantLen = digitKFor(logical);
    const parts = await Promise.all(keys.map(async (k) => {
        const url = apiPathForUnderlying(k);
        const res = await fetch(url);
        if (!res.ok)
            return [];
        const csv = await res.text();
        const flex = parseFlexibleCsv(csv); // ascending by date
        // parseFlexibleCsv already maps 'fb'/'fireball' into special → that's our Fireball
        return flex.map(fr => {
            const d = fr.values.filter(Number.isFinite).slice(0, wantLen);
            if (d.length !== wantLen)
                return null;
            // NY has no Fireball; FL digits do, and we surface it as fb
            const fb = (logical.startsWith('fl_pick') && typeof fr.special === 'number' && Number.isFinite(fr.special))
                ? fr.special
                : undefined;
            return { date: fr.date, digits: d, fb };
        }).filter(Boolean);
    }));
    return [].concat(...parts).sort((a, b) => a.date.localeCompare(b.date));
}
// ---------- Optional UI helper for PastDraws ----------
export function toPastDrawsDigitsView(r, k) {
    const values = (r.digits || []).slice(0, k);
    const view = {
        date: r.date,
        values,
    };
    if (typeof r.fb === 'number') {
        view.sep = true; // render “|” gap if your component uses it
        view.special = r.fb; // show as right-hand bubble
        view.specialLabel = 'Fireball'; // tooltip/accessibility label
    }
    return view;
}
export async function fetchPick10RowsFor(logical) {
    const keys = underlyingKeysFor(logical, 'all');
    const parts = await Promise.all(keys.map(async (k) => {
        const url = apiPathForUnderlying(k);
        const res = await fetch(url);
        if (!res.ok)
            return [];
        const csv = await res.text();
        const flex = parseFlexibleCsv(csv); // ascending by date
        return flex
            .map(fr => {
            const vals = fr.values.filter(n => Number.isFinite(n) && n >= 1 && n <= 80).slice(0, 10);
            return vals.length === 10 ? { date: fr.date, values: vals } : null;
        })
            .filter(Boolean);
    }));
    const merged = [].concat(...parts);
    return merged.sort((a, b) => a.date.localeCompare(b.date));
}
// Any key present in GAME_TO_API_PATH is a canonical (single-file) source.
const isCanonicalUnderlying = (k) => Object.prototype.hasOwnProperty.call(GAME_TO_API_PATH, k);
/**
 * Fetch & merge rows for a logical game + period.
 * - Canonical sources: uses fetchRowsWithCache (keeps cache/era logic).
 * - Flexible sources: reads CSV via same-origin API and parses dynamically.
 * - Returns LottoRow "shims" for flexible games (first 5 mains + optional special) so existing UI works.
 */
// Note: New York draw games (Take 5, Numbers, Win 4, Lotto, Pick 10, Quick Draw)
// have used the same draw matrix and ball domains since their inception.
// Therefore, no era filtering is applied for NY logical games.
// If NY ever changes a matrix (e.g. adds/removes numbers or changes range),
// add a start date cutoff here similar to CURRENT_ERA for multi-state games.
export async function fetchLogicalRows(opts) {
    const { logical, period, since, until } = opts;
    // 🚫 Digit games (and Cash Pop / Keno-style) are handled by dedicated fetchers.
    // Never route them through the 5-ball canonical path.
    if (logical === 'ny_numbers' ||
        logical === 'ny_win4' ||
        logical === 'fl_pick2' ||
        logical === 'fl_pick3' ||
        logical === 'fl_pick4' ||
        logical === 'fl_pick5' ||
        logical === 'fl_cashpop' ||
        logical === 'ny_quick_draw' ||
        logical === 'ny_pick10' ||
        // Exclude CA digit logicals from 5-ball path
        logical === 'ca_daily3' ||
        logical === 'ca_daily4') {
        return [];
    }
    // 1) Resolve underlying keys for this logical game + period
    const keys = underlyingKeysFor(logical, period);
    // 2) Pick a representative canonical key for shimming flexible rows
    const canonical = keys.filter(isCanonicalUnderlying);
    const REP_FOR_LOGICAL = {
        ny_take5: 'ny_take5', // use Take 5’s own era (5/39, no bonus)
        ny_lotto: 'ny_lotto',
    };
    const rep = canonical[0] ?? REP_FOR_LOGICAL[logical] ?? 'multi_cash4life';
    // 3) Canonical games remain era-aware (CURRENT_ERA) via fetchRowsWithCache.
    //    NY flexible games: single continuous era since game start → NO extra filtering here.
    const eraStart = canonical.length
        ? canonical.map(k => getCurrentEraConfig(k).start).sort()[0]
        : (since ?? '2000-01-01');
    const parts = await Promise.all(keys.map(async (k) => {
        if (isCanonicalUnderlying(k)) {
            // Canonical source (PB/MM/C4L/Fantasy5): keep existing caching/era behavior.
            return fetchRowsWithCache({ game: k, since: eraStart, until });
        }
        // Flexible NY source: read everything (single continuous era) and shim to LottoRow.
        const url = apiPathForUnderlying(k);
        const res = await fetch(url);
        if (!res.ok)
            return [];
        const csv = await res.text();
        const flexAll = parseFlexibleCsv(csv); // ascending by date
        // No logical-era cutoff: NY games assumed unchanged since inception.
        const flex = (!until)
            ? flexAll
            : flexAll.filter(fr => fr.date < until); // still honor caller's "until" if provided
        return flex.map(fr => toLottoShim(fr, rep));
    }));
    const merged = [].concat(...parts);
    return merged.sort((a, b) => a.date.localeCompare(b.date));
}
function applyFilters(rows, opts) {
    let out = rows;
    if (opts.since)
        out = out.filter(r => r.date >= opts.since);
    if (opts.until) {
        const end = new Date(opts.until);
        end.setDate(end.getDate() + 1);
        const endISO = end.toISOString().slice(0, 10);
        out = out.filter(r => r.date < endISO);
    }
    if (opts.latestOnly)
        out = out.slice(-1);
    return out;
}
/* ---------------- UI helpers ---------------- */
/** Human-friendly schedule label derived from DRAW_DOWS + GAME_TIME_INFO. */
export function drawNightsLabel(game, now = new Date()) {
    // Twice-daily games: keep the explicit wording
    if (game === 'ny_take5' || game === 'ny_take5_midday' || game === 'ny_take5_evening' ||
        game === 'fl_fantasy5_midday' || game === 'fl_fantasy5_evening') {
        return 'Daily · Midday & Evening';
    }
    const schedKey = getScheduleGame(game);
    const sched = DRAW_DOWS[schedKey];
    const info = GAME_TIME_INFO[schedKey];
    // Fallbacks (shouldn’t happen if sched/info are maintained together)
    if (!sched && !info)
        return 'Daily';
    if (!sched) {
        const t = formatTimeLabel(info.tz, info.hour, info.minute, info.approx, now);
        return `Daily · ${t}`;
    }
    const dayPart = dayPatternFor(sched);
    if (!info)
        return dayPart; // no time known → just days
    const t = formatTimeLabel(info.tz, info.hour, info.minute, info.approx, now);
    return `${dayPart} · ${t}`;
}
const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function dayPatternFor(sched) {
    if (sched.size === 7)
        return 'Daily';
    // Show days in Mon..Sun order (Mon=1 ... Sun=0) to match typical lotto phrasing
    const order = [1, 2, 3, 4, 5, 6, 0];
    const parts = order.filter(d => sched.has(d)).map(d => DOW_NAMES[d]);
    return parts.join('/');
}
function formatTimeLabel(tz, hour, minute, approx, base) {
    const d = new Date(base);
    d.setHours(hour, minute, 0, 0);
    const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
    const timeStr = timeFmt.format(d);
    const tzStr = tzAbbrev(tz, d);
    return (approx ? `≈${timeStr}` : timeStr) + ` ${tzStr}`;
}
function getLocalParts(tz, d = new Date()) {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
    const parts = fmt.formatToParts(d);
    const m = {};
    for (const p of parts)
        if (p.type !== 'literal')
            m[p.type] = p.value;
    const weekMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dow = weekMap[m.weekday] ?? 0;
    return {
        dow,
        hour: parseInt(m.hour ?? '0', 10),
        minute: parseInt(m.minute ?? '0', 10)
    };
}
function tzAbbrev(tz, d = new Date()) {
    // Compact “ET / PT” style label
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short', hour: '2-digit' });
    const str = fmt.format(d);
    const abbr = str.split(' ').pop() || '';
    // Normalize common variants like "GMT-4" → "ET" fallback
    if (/ET/i.test(abbr))
        return 'ET';
    if (/PT/i.test(abbr))
        return 'PT';
    if (/GMT[+-]\d+/.test(abbr))
        return tz === 'America/New_York' ? 'ET' : 'PT';
    return abbr.toUpperCase();
}
/** Per-game local draw time + timezone (local clock of the jurisdiction). */
const GAME_TIME_INFO = {
    // Multi
    multi_powerball: { tz: 'America/New_York', hour: 23, minute: 0, approx: true }, // ≈11:00 PM ET
    multi_megamillions: { tz: 'America/New_York', hour: 23, minute: 0, approx: true }, // ≈11:00 PM ET
    multi_cash4life: { tz: 'America/New_York', hour: 21, minute: 0 }, // 9:00 PM ET
    // Georgia
    ga_fantasy5: { tz: 'America/New_York', hour: 23, minute: 34 }, // 11:34 PM ET
    // California
    ca_superlotto_plus: { tz: 'America/Los_Angeles', hour: 19, minute: 45, approx: true }, // ≈7:45 PM PT
    ca_fantasy5: { tz: 'America/Los_Angeles', hour: 18, minute: 30 }, // 6:30 PM PT
    // Florida (logical → “daily” windowing; we use this for next-draw labeling elsewhere)
    fl_fantasy5: { tz: 'America/New_York', hour: 23, minute: 0, approx: true }, // EV rep for label
    ny_take5: { tz: 'America/New_York', hour: 23, minute: 0, approx: true }, // use evening rep
};
/** Returns true if we’re within a ±90 minute window around the game’s local draw time on a valid draw day. */
export function isInDrawWindowFor(game, now = new Date()) {
    const sched = DRAW_DOWS[getScheduleGame(game)];
    const info = GAME_TIME_INFO[getScheduleGame(game)];
    if (!sched || !info)
        return false;
    const { tz, hour, minute } = info;
    // Determine "today" in the game’s local timezone
    const { dow, hour: h, minute: m } = getLocalParts(tz, now);
    // If today is not a draw day, also consider the window that spills past midnight from the previous draw day.
    const isDrawDay = sched.has(dow);
    const windowMinutes = 90; // ±90 minutes around draw time
    const minutesNow = h * 60 + m;
    const minutesDraw = hour * 60 + minute;
    const start = minutesDraw - windowMinutes;
    const end = minutesDraw + windowMinutes;
    const inTodayWindow = minutesNow >= start && minutesNow <= end && isDrawDay;
    // Cross-midnight spillover: if it’s shortly after midnight local, check previous day’s window.
    const prevDow = (dow + 6) % 7;
    const isPrevDrawDay = sched.has(prevDow);
    const afterMidnight = minutesNow < Math.max(end - 24 * 60, 0); // if draw window spills past midnight
    const inPrevWindow = isPrevDrawDay && afterMidnight && (minutesNow + 24 * 60) <= end && (minutesNow + 24 * 60) >= start;
    return inTodayWindow || inPrevWindow;
}
/** Builds a label like "Wed 6:30 PM PT" for the next draw in the game’s local timezone. */
export function nextDrawLabelFor(game, now = new Date()) {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const sched = DRAW_DOWS[getScheduleGame(game)];
    const info = GAME_TIME_INFO[getScheduleGame(game)];
    if (!sched || !info)
        return 'See local draw time';
    const { tz, hour, minute, approx } = info;
    // Find the next calendar day (including today) that’s a draw day, using the game’s local weekday.
    for (let i = 0; i < 8; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() + i);
        const { dow } = getLocalParts(tz, d);
        if (sched.has(dow)) {
            const labelDay = names[dow];
            // Format local time and tz abbreviation
            const t = new Date(d);
            t.setHours(hour, minute, 0, 0);
            const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
            const timeStr = timeFmt.format(t);
            const tzStr = tzAbbrev(tz, t);
            return approx ? `${labelDay} ≈${timeStr} ${tzStr}` : `${labelDay} ${timeStr} ${tzStr}`;
        }
    }
    // Fallbacks (shouldn’t hit if sched isn’t empty)
    if (game === 'multi_powerball')
        return 'Mon/Wed/Sat ≈11:00 PM ET';
    if (game === 'multi_megamillions')
        return 'Tue/Fri ≈11:00 PM ET';
    if (game === 'multi_cash4life')
        return 'Daily 9:00 PM ET';
    return 'Daily';
}
export function evaluateTicket(game, mains, special, stats) {
    return ticketHints(game, mains, special ?? 0, stats);
}
/* ---------------- Stats / weighting ---------------- */
export function computeStats(rows, game, overrideCfg) {
    const _globalAny = globalThis;
    if (!_globalAny.__lsp_stats_lru__) {
        _globalAny.__lsp_stats_lru__ = {
            map: new Map(),
            touch(k, v) {
                this.map.delete(k);
                this.map.set(k, v);
                if (this.map.size > 12)
                    this.map.delete(this.map.keys().next().value);
            },
        };
    }
    const ST = _globalAny.__lsp_stats_lru__;
    const eraStart = (overrideCfg ? 'override' : getCurrentEraConfig(game).start);
    const last = rows.length ? rows[rows.length - 1].date : 'none';
    const key = `${game}|${eraStart}|${last}|${rows.length}`;
    const cached = ST.map.get(key);
    if (cached) {
        ST.touch(key, cached);
        return cached;
    }
    // Use override if provided (e.g., current era), else the current era.
    // This keeps Mega Millions (24) correct and future-proofs defaults.
    const cfg = overrideCfg ?? getCurrentEraConfig(game);
    const countsMain = new Map();
    const countsSpecial = new Map();
    const lastSeenMain = new Map();
    const lastSeenSpecial = new Map();
    for (let n = 1; n <= cfg.mainMax; n++) {
        countsMain.set(n, 0);
        lastSeenMain.set(n, Infinity);
    }
    for (let n = 1; n <= cfg.specialMax; n++) {
        countsSpecial.set(n, 0);
        lastSeenSpecial.set(n, Infinity);
    }
    const totalDraws = rows.length;
    // Phase 1: avoid array copy + reverse; iterate from newest→oldest
    for (let i = rows.length - 1, idx = 0; i >= 0; i--, idx++) {
        const d = rows[i];
        if (!d)
            continue; // narrow away undefined from sparse or OOB indexes
        // Base mains from the canonical 5 fields
        // Base mains from the canonical 5 fields
        const mains = [d.n1, d.n2, d.n3, d.n4, d.n5];
        // Lotto-style 6-main games store the 6th main in `special` for CSV compatibility.
        // Treat that `special` as a MAIN for stats purposes (do NOT count it as a special).
        const isSixMainGame = (game === 'ny_lotto' || game === 'ny_nylotto' ||
            game === 'fl_lotto' || game === 'fl_jackpot_triple_play');
        if ((overrideCfg?.mainPick ?? getCurrentEraConfig(game).mainPick) > 5
            && isSixMainGame
            && typeof d.special === 'number') {
            mains.push(d.special);
        }
        mains.forEach(m => {
            countsMain.set(m, (countsMain.get(m) || 0) + 1);
            lastSeenMain.set(m, Math.min(lastSeenMain.get(m) || Infinity, idx));
        });
        // For 6-main games, do NOT count `special` in the special domain.
        if (cfg.specialMax > 0 && typeof d.special === 'number' && !(isSixMainGame)) {
            countsSpecial.set(d.special, (countsSpecial.get(d.special) || 0) + 1);
            lastSeenSpecial.set(d.special, Math.min(lastSeenSpecial.get(d.special) || Infinity, idx));
        }
    }
    const expectedMain = (totalDraws * 5) / cfg.mainMax;
    const expectedSpecial = cfg.specialMax > 0 ? totalDraws / cfg.specialMax : 0;
    const varMain = totalDraws * (5 / cfg.mainMax) * (1 - 5 / cfg.mainMax);
    const sdMain = Math.sqrt(Math.max(varMain, 1e-9));
    const varSpecial = cfg.specialMax > 0 ? totalDraws * (1 / cfg.specialMax) * (1 - 1 / cfg.specialMax) : 0;
    const sdSpecial = cfg.specialMax > 0 ? Math.sqrt(Math.max(varSpecial, 1e-9)) : 1; // avoid div/0
    const zMain = new Map();
    const zSpecial = new Map();
    for (let n = 1; n <= cfg.mainMax; n++)
        zMain.set(n, ((countsMain.get(n) || 0) - expectedMain) / sdMain);
    if (cfg.specialMax > 0)
        for (let n = 1; n <= cfg.specialMax; n++)
            zSpecial.set(n, ((countsSpecial.get(n) || 0) - expectedSpecial) / sdSpecial);
    const result = { countsMain, countsSpecial, lastSeenMain, lastSeenSpecial, totalDraws, zMain, zSpecial, cfg };
    ST.touch(key, result);
    return result;
}
export function buildWeights(domainMax, counts, mode, alpha) {
    // Add a light smoothing prior to reduce early-era overfit.
    const arr = Array.from({ length: domainMax }, (_, i) => counts.get(i + 1) || 0);
    const total = arr.reduce((a, b) => a + b, 0);
    const avg = domainMax > 0 ? (total / domainMax) : 0;
    const eps = Math.min(0.5, Math.max(0.05, 0.05 * avg)); // in [0.05, 0.5]
    const arrSmooth = arr.map(c => c + eps);
    const totalSmooth = arrSmooth.reduce((a, b) => a + b, 0);
    const freq = totalSmooth > 0 ? arrSmooth.map(c => c / totalSmooth) : Array(domainMax).fill(1 / domainMax);
    const max = Math.max(...freq);
    const invRaw = freq.map(p => (max - p) + 1e-9);
    const invSum = invRaw.reduce((a, b) => a + b, 0);
    const inv = invRaw.map(x => x / invSum);
    const base = Array(domainMax).fill(1 / domainMax);
    const chosen = mode === 'hot' ? freq : inv;
    const blended = chosen.map((p, i) => (1 - alpha) * base[i] + alpha * p);
    const s = blended.reduce((a, b) => a + b, 0);
    return blended.map(x => x / s);
}
export function weightedSampleDistinct(k, weights) {
    const n = weights.length;
    const picks = [];
    const w = weights.map(v => (Number.isFinite(v) && v > 0 ? v : 0));
    const available = new Set(Array.from({ length: n }, (_, i) => i));
    const drawOne = () => {
        let sum = 0;
        for (const i of available)
            sum += w[i];
        if (sum <= 1e-12) {
            const arr = Array.from(available);
            const ri = Math.floor(Math.random() * arr.length);
            const val = arr[ri];
            return val;
        }
        let r = Math.random() * sum;
        let acc = 0;
        for (const i of available) {
            acc += w[i];
            if (acc >= r)
                return i;
        }
        return Array.from(available).pop();
    };
    const limit = Math.min(k, n);
    for (let t = 0; t < limit; t++) {
        const idx = drawOne();
        picks.push(idx + 1);
        available.delete(idx);
    }
    return picks.sort((a, b) => a - b);
}
export function looksTooCommon(mains, game) {
    const mainMax = getCurrentEraConfig(game).mainMax;
    const arr = [...mains].sort((a, b) => a - b); // harden against unsorted input
    // Any 3-in-a-row (triplet)
    const tripleRun = arr.some((_, i) => i >= 2 && arr[i - 2] + 2 === arr[i - 1] + 1 && arr[i - 1] + 1 === arr[i]);
    // Any 4-in-a-row (strictly stronger; catches very obvious sequences)
    const fourRun = arr.some((_, i) => i >= 3 && arr[i - 3] + 3 === arr[i - 2] + 2 && arr[i - 2] + 2 === arr[i - 1] + 1 && arr[i - 1] + 1 === arr[i]);
    // “Date bias”: ≥4 numbers ≤31
    const lowBias = arr.filter(n => n <= 31).length >= 4;
    // Pure arithmetic progression
    const d1 = arr[1] - arr[0];
    const arithmetic = arr.every((_, i) => (i === 0 ? true : arr[i] - arr[i - 1] === d1));
    // Tight cluster: span narrower than ~1/7 of the domain
    const span = arr[arr.length - 1] - arr[0];
    const clustered = span <= Math.floor(mainMax / 7);
    return fourRun || tripleRun || lowBias || arithmetic || clustered;
}
// --- granular detectors for hint labeling (5-ball sets; works great for Take 5 as well) ---
function hasConsecutiveRun(mains, runLen) {
    const a = [...mains].sort((x, y) => x - y);
    for (let i = runLen - 1; i < a.length; i++) {
        let ok = true;
        for (let k = 1; k < runLen; k++)
            if (a[i - k] + k !== a[i]) {
                ok = false;
                break;
            }
        if (ok)
            return true;
    }
    return false;
}
function isArithmeticSequence(mains) {
    const a = [...mains].sort((x, y) => x - y);
    const d = a[1] - a[0];
    for (let i = 2; i < a.length; i++)
        if (a[i] - a[i - 1] !== d)
            return false;
    return true;
}
function isBirthdayHeavy(mains) {
    return mains.filter(n => n <= 31).length >= 4;
}
function isTightlyClustered(mains, domainMax) {
    const a = [...mains].sort((x, y) => x - y);
    const span = a[a.length - 1] - a[0];
    return span <= Math.floor(domainMax / 7);
}
export function generateTicket(rows, game, opts, overrideCfg) {
    const s = computeStats(rows, game, overrideCfg);
    const wMain = buildWeights(s.cfg.mainMax, s.countsMain, opts.modeMain, opts.alphaMain);
    const wSpecial = s.cfg.specialMax > 0 ? buildWeights(s.cfg.specialMax, s.countsSpecial, opts.modeSpecial, opts.alphaSpecial) : [];
    let mains = [];
    let special = undefined;
    let tries = 0;
    do {
        mains = weightedSampleDistinct(s.cfg.mainPick, wMain);
        if (s.cfg.specialMax > 0)
            special = weightedSampleDistinct(1, wSpecial)[0];
        tries++;
        if (tries > 50)
            break;
    } while (opts.avoidCommon && looksTooCommon(mains, game));
    return s.cfg.specialMax > 0 ? { mains, special: special } : { mains };
}
/* ===========================
   Phase 2: Worker offload (opt-in)
   =========================== */
export const USE_WORKER = typeof window !== 'undefined' && (window.__LSP_USE_WORKER__ === true ||
    ((typeof process !== 'undefined') && process.env?.NEXT_PUBLIC_USE_WORKER === '1'));
// Lazy import with types so runTask<TArgs, TResult> stays generic
async function _bridge() {
    return await import('./workers/workerBridge.js');
}
export async function parseCanonicalCsvAsync(csv, game, signal) {
    if (!USE_WORKER)
        return parseCanonicalCsv(csv, game);
    const { runTask } = await _bridge();
    return runTask('parseCanonicalCsv', { csv, game }, signal);
}
export async function parseFlexibleCsvAsync(csv, signal) {
    if (!USE_WORKER)
        return parseFlexibleCsv(csv);
    const { runTask } = await _bridge();
    return runTask('parseFlexibleCsv', { csv }, signal);
}
export async function computeStatsAsync(rows, game, override, signal) {
    if (!USE_WORKER)
        return computeStats(rows, game, override);
    const { runTask } = await _bridge();
    return runTask('computeStats', { rows, game, override }, signal);
}
export async function analyzeGameAsync(rows, game, signal) {
    if (!USE_WORKER)
        return analyzeGame(rows, game);
    const { runTask } = await _bridge();
    return runTask('analyzeGame', { rows, game }, signal);
}
export async function generateTicketAsync(rows, game, opts, override, signal) {
    if (!USE_WORKER)
        return generateTicket(rows, game, opts, override);
    const { runTask } = await _bridge();
    return runTask('generateTicket', { rows, game, opts, override }, signal);
}
// ---- NEW: non-5-ball async wrappers ---------------------------------------
export async function computeDigitStatsAsync(rows, k, signal) {
    if (!USE_WORKER)
        return computeDigitStats(rows, k);
    const { runTask } = await _bridge();
    return runTask('computeDigitStats', { rows, k }, signal);
}
export async function computePick10StatsAsync(rows, signal) {
    if (!USE_WORKER)
        return computePick10Stats(rows);
    const { runTask } = await _bridge();
    return runTask('computePick10Stats', { rows }, signal);
}
export async function computeQuickDrawStatsAsync(rows, signal) {
    if (!USE_WORKER)
        return computeQuickDrawStats(rows);
    const { runTask } = await _bridge();
    return runTask('computeQuickDrawStats', { rows }, signal);
}
export async function generatePick10TicketAsync(stats, opts, signal) {
    if (!USE_WORKER)
        return generatePick10Ticket(stats, opts);
    const { runTask } = await _bridge();
    return runTask('generatePick10Ticket', { stats, opts }, signal);
}
export async function generateQuickDrawTicketAsync(stats, spots, opts, signal) {
    if (!USE_WORKER)
        return generateQuickDrawTicket(stats, spots, opts);
    const { runTask } = await _bridge();
    return runTask('generateQuickDrawTicket', { stats, spots, opts }, signal);
}
/* ===========================
   Phase 3: Data windowing hook (no behavior change)
   =========================== */
export function defaultSinceFor(game) {
    // Conservative defaults; tune later per product needs.
    // PB/MM/C4L: 24 months; 5-ball state games: 18 months; 6-main state games: 24 months.
    const today = new Date();
    const since = (months) => {
        const d = new Date(today);
        d.setMonth(d.getMonth() - months);
        return d.toISOString().slice(0, 10);
    };
    if (game === 'multi_powerball' || game === 'multi_megamillions' || game === 'multi_cash4life')
        return since(24);
    if (game === 'ga_fantasy5' || game === 'ca_superlotto_plus' || game === 'ca_fantasy5' || game === 'fl_fantasy5_midday' || game === 'fl_fantasy5_evening' || game === 'ny_take5')
        return since(18);
    if (game === 'fl_lotto' || game === 'fl_jackpot_triple_play' || game === 'ny_lotto')
        return since(24);
    return null; // leave rest unlimited for now
}
export function ticketHints(game, mains, special, stats) {
    const hints = [];
    // Granular pattern tags (always derived from main numbers only)
    const domainMax = stats.cfg.mainMax;
    if (hasConsecutiveRun(mains, 4))
        hints.push('4-in-a-row');
    else if (hasConsecutiveRun(mains, 3))
        hints.push('3-in-a-row');
    if (isArithmeticSequence(mains))
        hints.push('Arithmetic sequence');
    if (isBirthdayHeavy(mains))
        hints.push('Birthday-heavy');
    if (isTightlyClustered(mains, domainMax))
        hints.push('Tight span');
    // Back-compat umbrella if none of the above but still “too common”
    if (hints.length === 0 && looksTooCommon(mains, game))
        hints.push('Common pattern');
    const lowCount = mains.filter(n => (stats.countsMain.get(n) || 0) <= 1).length;
    if (lowCount >= 3)
        hints.push('Cold mains');
    const hotCount = mains.filter(n => (stats.zMain.get(n) || 0) > 1).length;
    if (hotCount >= 3)
        hints.push('Hot mains');
    if (stats.cfg.specialMax > 0 && typeof special === 'number') {
        const specialZ = (stats.zSpecial.get(special) || 0);
        if (specialZ > 1)
            hints.push('Hot special');
        if (specialZ < -1)
            hints.push('Cold special');
    }
    if (hints.length === 0)
        hints.push('Balanced');
    return hints;
}
// what digit-length does each logical use?
export function digitKFor(logical) {
    if (logical === 'ny_numbers' || logical === 'fl_pick3')
        return 3;
    if (logical === 'ny_win4' || logical === 'fl_pick4')
        return 4;
    if (logical === 'fl_pick5')
        return 5;
    if (logical === 'fl_pick2')
        return 2;
    if (logical === 'ca_daily3')
        return 3;
    if (logical === 'ca_daily4')
        return 4;
    // sensible fallback; callers only pass digit games here
    return 3;
}
export function computeDigitStats(rows, k) {
    // domain 0..9, repetition allowed
    const counts = new Array(10).fill(0);
    let totalDraws = 0;
    const lastSeen = new Array(10).fill(Infinity);
    // rows from fetchDigitRowsFor are ascending by date; walk newest→oldest without copying
    for (let i = rows.length - 1, idx = 0; i >= 0; i--, idx++) {
        const r = rows[i];
        if (!r)
            continue;
        if (!Array.isArray(r.digits) || r.digits.length !== k)
            return;
        totalDraws++;
        r.digits.forEach(d => {
            if (d >= 0 && d <= 9) {
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
    const z = counts.map(c => (c - expected) / sd);
    return { counts, lastSeen, totalDraws, k, z };
}
function isPalindrome(d) { return d.join('') === [...d].reverse().join(''); }
function longestRunLen(d) {
    let best = 1, cur = 1;
    for (let i = 1; i < d.length; i++) {
        if (d[i] === d[i - 1] + 1 || d[i] === d[i - 1] - 1) {
            cur++;
            best = Math.max(best, cur);
        }
        else
            cur = 1;
    }
    return best;
}
function multiplicity(d) {
    const m = new Map();
    d.forEach(x => m.set(x, (m.get(x) || 0) + 1));
    const counts = Array.from(m.values()).sort((a, b) => b - a);
    return counts[0] ?? 1; // max multiplicity
}
function digitSum(d) { return d.reduce((a, b) => a + b, 0); }
/**
 * Native digit-game hints (3 or 4 digits). Independent of GameKey.
 * Emits stable labels aligned with HINT_EXPLAIN.
 */
export function ticketHintsDigits(digits, stats) {
    const hints = [];
    if (!stats)
        return ['Insufficient data'];
    if (digits.length !== stats.k)
        return ['Invalid'];
    const maxMult = multiplicity(digits); // 2=pair, 3=triple, 4=quad
    if (maxMult === 4)
        hints.push('Quad');
    else if (maxMult === 3)
        hints.push('Triple');
    else if (maxMult === 2)
        hints.push('Pair');
    if (isPalindrome(digits))
        hints.push('Palindrome');
    const run = longestRunLen(digits);
    if (run >= 3)
        hints.push('Sequential digits');
    const sum = digitSum(digits);
    // Heuristic outliers for 3/4-digit sums
    const sumLo = stats.k === 3 ? 6 : 8; // conservative
    const sumHi = stats.k === 3 ? 21 : 28; // conservative
    if (sum <= sumLo || sum >= sumHi)
        hints.push('Sum outlier');
    // Low/High heavy (>= 2/3 on one side for k=3, >=3/4 for k=4)
    const low = digits.filter(d => d <= 4).length;
    const high = digits.filter(d => d >= 5).length;
    if (low >= Math.ceil(stats.k * 2 / 3))
        hints.push('Low-heavy');
    if (high >= Math.ceil(stats.k * 2 / 3))
        hints.push('High-heavy');
    // Hot/cold by per-digit z-scores (>= 1 or <= -1)
    const hot = digits.filter(d => (stats.z[d] || 0) > 1).length;
    const cold = digits.filter(d => (stats.z[d] || 0) < -1).length;
    if (hot >= Math.ceil(stats.k / 2))
        hints.push('Hot digits');
    if (cold >= Math.ceil(stats.k / 2))
        hints.push('Cold digits');
    if (hints.length === 0)
        hints.push('Balanced');
    return hints;
}
export function computePick10Stats(rows) {
    const counts = new Map();
    const lastSeen = new Map();
    for (let n = 1; n <= 80; n++) {
        counts.set(n, 0);
        lastSeen.set(n, Infinity);
    }
    // rows from fetchPick10RowsFor are ascending; iterate newest→oldest without copying
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
// ---- Quick Draw (Keno-style, 20-from-80) ----
export function computeQuickDrawStats(rows) {
    const counts = new Map();
    const lastSeen = new Map();
    for (let n = 1; n <= 80; n++) {
        counts.set(n, 0);
        lastSeen.set(n, Infinity);
    }
    // rows from fetchQuickDrawRowsFor are ascending; iterate newest→oldest without copying
    for (let i = rows.length - 1, idx = 0; i >= 0; i--, idx++) {
        const r = rows[i];
        if (!r)
            continue;
        const v = (r.values || []).filter(n => Number.isFinite(n) && n >= 1 && n <= 80);
        if (v.length !== 20)
            return;
        v.forEach(n => {
            counts.set(n, (counts.get(n) || 0) + 1);
            lastSeen.set(n, Math.min(lastSeen.get(n) || Infinity, idx));
        });
    }
    const totalDraws = rows.length;
    const expected = (totalDraws * 20) / 80;
    const p = 20 / 80;
    const variance = totalDraws * p * (1 - p);
    const sd = Math.max(Math.sqrt(Math.max(variance, 1e-9)), 1e-6);
    const z = new Map();
    for (let n = 1; n <= 80; n++)
        z.set(n, ((counts.get(n) || 0) - expected) / sd);
    return { counts, lastSeen, totalDraws, z };
}
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
// ---------- Quick Draw (Keno-style) ticket generation ----------
export function buildQuickDrawWeights(stats, mode, alpha) {
    // counts over 1..80 (from 20-of-80 draws)
    const arr = Array.from({ length: 80 }, (_, i) => (stats?.counts.get(i + 1) ?? 0));
    // light smoothing (same spirit as Pick 10)
    const total = arr.reduce((a, b) => a + b, 0);
    const avg = total / 80;
    const eps = Math.min(1, Math.max(0.1, 0.05 * avg));
    const smooth = arr.map(c => c + eps);
    const sum = smooth.reduce((a, b) => a + b, 0);
    const freq = sum > 0 ? smooth.map(c => c / sum) : Array(80).fill(1 / 80);
    // invert for cold
    const max = Math.max(...freq);
    const invRaw = freq.map(p => (max - p) + 1e-9);
    const invSum = invRaw.reduce((a, b) => a + b, 0);
    const inv = invRaw.map(x => x / invSum);
    // blend with uniform by alpha
    const base = Array(80).fill(1 / 80);
    const chosen = mode === 'hot' ? freq : inv;
    const blended = chosen.map((p, i) => (1 - alpha) * base[i] + alpha * p);
    const s2 = blended.reduce((a, b) => a + b, 0);
    return blended.map(x => x / s2);
}
export function generateQuickDrawTicket(stats, spots, opts) {
    const w = buildQuickDrawWeights(stats, opts.mode, opts.alpha);
    // reuse distinct sampler used for Pick 10
    return weightedSampleDistinctFromWeights(spots, w);
}
export function weightedSampleDistinctFromWeights(k, weights) {
    const n = weights.length;
    const picks = [];
    const available = new Set(Array.from({ length: n }, (_, i) => i));
    const w = weights.slice();
    while (picks.length < Math.min(k, n)) {
        let sum = 0;
        for (const i of available)
            sum += w[i];
        let r = Math.random() * sum, acc = 0, chosen = -1;
        for (const i of available) {
            acc += w[i];
            if (acc >= r) {
                chosen = i;
                break;
            }
        }
        if (chosen < 0)
            break;
        picks.push(chosen + 1);
        available.delete(chosen);
    }
    return picks.sort((a, b) => a - b);
}
export function generatePick10Ticket(stats, opts) {
    const w = buildPick10Weights(stats, opts.mode, opts.alpha);
    return weightedSampleDistinctFromWeights(10, w);
}
/** Recommend weighting for Quick Draw (20-from-80). */
export function recommendQuickDrawFromStats(stats) {
    const counts = Array.from({ length: 80 }, (_, i) => (stats?.counts.get(i + 1) ?? 0));
    const cv = coefVar(counts);
    let rec;
    if (cv >= 0.18)
        rec = { mode: 'hot', alpha: 0.64 };
    else if (cv <= 0.10)
        rec = { mode: 'cold', alpha: 0.54 };
    else
        rec = { mode: 'hot', alpha: 0.60 };
    if (stats)
        rec.alpha = clampAlphaGeneric(rec.alpha, stats.totalDraws, 80, 0.50, 0.70);
    return rec;
}
export function ticketHintsPick10(values, stats) {
    const hints = [];
    if (!Array.isArray(values) || values.length !== 10)
        return ['Invalid'];
    const a = [...values].sort((x, y) => x - y);
    // pattern-style hints similar to 5-ball, tuned for larger k
    const span = a[a.length - 1] - a[0];
    if (span <= 80 / 10)
        hints.push('Tight span');
    const run3 = a.some((_, i) => i >= 2 && a[i - 2] + 2 === a[i - 1] + 1 && a[i - 1] + 1 === a[i]);
    if (run3)
        hints.push('3-in-a-row');
    const bday = a.filter(n => n <= 31).length >= 6; // 6+ of first 31 is pretty birthday-heavy at k=10
    if (bday)
        hints.push('Birthday-heavy');
    // hot/cold mains by z
    const hot = a.filter(n => ((stats?.z.get(n) ?? 0) > 1)).length;
    const cold = a.filter(n => ((stats?.z.get(n) ?? 0) < -1)).length;
    if (hot >= 5)
        hints.push('Hot mains'); // half or more
    if (cold >= 5)
        hints.push('Cold mains');
    if (hints.length === 0)
        hints.push('Balanced');
    return hints;
}
export function coefVar(values) {
    const n = values.length;
    if (n === 0)
        return 0;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const varr = values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n;
    return mean === 0 ? 0 : Math.sqrt(varr) / mean;
}
export function recommendFromDispersion(cv, domain) {
    if (domain === 'special') {
        if (cv >= 0.30)
            return { mode: 'hot', alpha: 0.70 };
        if (cv <= 0.18)
            return { mode: 'cold', alpha: 0.55 };
        return { mode: 'hot', alpha: 0.60 };
    }
    else {
        if (cv >= 0.25)
            return { mode: 'hot', alpha: 0.65 };
        if (cv <= 0.15)
            return { mode: 'cold', alpha: 0.55 };
        return { mode: 'hot', alpha: 0.60 };
    }
}
/** Clamp alpha for non-era domains where we don't have (mainMax,specialMax) */
function clampAlphaGeneric(alpha, draws, domainSize, lo, hi) {
    let hi2 = hi;
    if (draws < domainSize)
        hi2 = Math.max(lo, hi - 0.10);
    return Math.min(hi2, Math.max(lo, alpha));
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
function clampAlphaFor(game, domain, alpha, draws) {
    const era = getCurrentEraConfig(game);
    let lo = 0.5, hi = 0.75;
    if (domain === 'main') {
        if (era.mainMax <= 45) {
            lo = 0.40;
            hi = 0.70;
        } // Fantasy 5
        else {
            lo = 0.50;
            hi = 0.75;
        } // PB/MM/C4L
    }
    else {
        if (era.specialMax <= 5) {
            lo = 0.35;
            hi = 0.65;
        } // C4L: tiny domain, keep conservative
        else {
            lo = 0.45;
            hi = 0.75;
        } // PB/MM
    }
    // Early-era guard: before ~one full domain of draws, avoid very spiky alphas
    if (draws < era.mainMax) {
        hi = Math.max(lo, hi - 0.10);
    }
    return Math.min(hi, Math.max(lo, alpha));
}
export function analyzeGame(rows, game) {
    const _globalAny = globalThis;
    if (!_globalAny.__lsp_analyze_lru__) {
        _globalAny.__lsp_analyze_lru__ = {
            map: new Map(),
            touch(k, v) { this.map.delete(k); this.map.set(k, v); if (this.map.size > 12)
                this.map.delete(this.map.keys().next().value); }
        };
    }
    // Always analyze the CURRENT era only
    const era = getCurrentEraConfig(game);
    const filtered = filterRowsForCurrentEra(rows, game);
    const last = filtered.length ? filtered[filtered.length - 1].date : 'none';
    const key = `${game}|${era.start}|${last}|${filtered.length}`;
    const cached = _globalAny.__lsp_analyze_lru__.map.get(key);
    if (cached) {
        _globalAny.__lsp_analyze_lru__.touch(key, cached);
        return cached;
    }
    const s = computeStats(filtered, game, era);
    const mainCounts = Array.from({ length: s.cfg.mainMax }, (_, i) => s.countsMain.get(i + 1) || 0);
    const specialCounts = s.cfg.specialMax > 0 ? Array.from({ length: s.cfg.specialMax }, (_, i) => s.countsSpecial.get(i + 1) || 0) : [];
    const cvMain = coefVar(mainCounts);
    const cvSpec = s.cfg.specialMax > 0 ? coefVar(specialCounts) : 0;
    const recencyHotFracMain = (() => { const threshold = 10; let hot = 0; for (let i = 1; i <= s.cfg.mainMax; i++)
        if ((s.lastSeenMain.get(i) || Infinity) <= threshold)
            hot++; return hot / s.cfg.mainMax; })();
    const recencyHotFracSpec = s.cfg.specialMax > 0 ? (() => { const threshold = 10; let hot = 0; for (let i = 1; i <= s.cfg.specialMax; i++)
        if ((s.lastSeenSpecial.get(i) || Infinity) <= threshold)
            hot++; return hot / s.cfg.specialMax; })() : 0;
    const recMain0 = recommendFromDispersion(cvMain, 'main');
    const recSpec0 = s.cfg.specialMax > 0 ? recommendFromDispersion(cvSpec, 'special') : { mode: 'hot', alpha: 0.60 };
    const recMain = { ...recMain0, alpha: clampAlphaFor(game, 'main', recMain0.alpha, s.totalDraws) };
    const recSpec = s.cfg.specialMax > 0 ? { ...recSpec0, alpha: clampAlphaFor(game, 'special', recSpec0.alpha, s.totalDraws) } : recSpec0;
    const result = {
        game,
        draws: s.totalDraws,
        cvMain, cvSpec,
        recencyHotFracMain, recencyHotFracSpec,
        recMain, recSpec,
        eraStart: era.start,
        eraCfg: { mainMax: era.mainMax, specialMax: era.specialMax, mainPick: era.mainPick, label: era.label, description: era.description }
    };
    _globalAny.__lsp_analyze_lru__.touch(key, result);
    return result;
}
// ---- Jackpot odds (exact, era-aware) ---------------------------------------
export function nCk(n, k) {
    if (k < 0 || k > n)
        return 0;
    k = Math.min(k, n - k);
    let num = 1, den = 1;
    for (let i = 1; i <= k; i++) {
        num *= (n - (k - i));
        den *= i;
    }
    return Math.round(num / den);
}
export function jackpotOdds(game) {
    const _globalAny = globalThis;
    if (!_globalAny.__lsp_jackpot_cache__)
        _globalAny.__lsp_jackpot_cache__ = new Map();
    const hit = _globalAny.__lsp_jackpot_cache__.get(game);
    if (hit)
        return hit;
    const era = getCurrentEraConfig(game);
    const mains = nCk(era.mainMax, era.mainPick);
    const specials = Math.max(era.specialMax, 1);
    const val = mains * specials; // “1 in <return value>”
    _globalAny.__lsp_jackpot_cache__.set(game, val);
    return val;
}
// ---- Odds for logical games that aren’t 5+special ----
export function jackpotOddsForLogical(logical) {
    switch (logical) {
        case 'ny_take5': return jackpotOdds('ny_take5');
        case 'ny_numbers': return Math.pow(10, 3);
        case 'ny_win4': return Math.pow(10, 4);
        case 'ca_daily3': return Math.pow(10, 3); // straight, exact order
        case 'ca_daily4': return Math.pow(10, 4); // straight, exact order
        case 'ny_pick10': return Math.round(nCk(80, 10) / nCk(20, 10));
        case 'ny_lotto': return nCk(59, 6);
        case 'ny_quick_draw': return null;
        // NEW: Florida digit odds (straight, exact order)
        case 'fl_pick2': return Math.pow(10, 2);
        case 'fl_pick3': return Math.pow(10, 3);
        case 'fl_pick4': return Math.pow(10, 4);
        case 'fl_pick5': return Math.pow(10, 5);
        // multis handled via jackpotOdds() elsewhere
        default: return null;
    }
}
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
// Spots-aware odds for Quick Draw (hit-all top prize)
export function jackpotOddsQuickDraw(spots) {
    // Odds = C(80,spots) / C(20,spots)
    return Math.round(nCk(80, spots) / nCk(20, spots));
}
// ---- Fetchers ----
export async function fetchQuickDrawRowsFor(logical) {
    const keys = underlyingKeysFor(logical, 'all');
    const parts = await Promise.all(keys.map(async (k) => {
        const url = apiPathForUnderlying(k);
        const res = await fetch(url);
        if (!res.ok)
            return [];
        const csv = await res.text();
        const flex = parseFlexibleCsv(csv); // ascending by date
        return flex
            .map(fr => {
            const vals = fr.values.filter(n => Number.isFinite(n) && n >= 1 && n <= 80).slice(0, 20);
            return vals.length === 20 ? { date: fr.date, values: vals } : null;
        })
            .filter(Boolean);
    }));
    const merged = [].concat(...parts);
    return merged.sort((a, b) => a.date.localeCompare(b.date));
}
// ---- Cash Pop fetcher (one period at a time) ----
export async function fetchCashPopRows(period) {
    const logical = 'fl_cashpop';
    const keys = underlyingKeysFor(logical, period);
    const parts = await Promise.all(keys.map(async (k) => {
        const url = apiPathForUnderlying(k);
        const res = await fetch(url);
        if (!res.ok)
            return [];
        const csv = await res.text();
        const flex = parseFlexibleCsv(csv); // ascending
        return flex
            .map(fr => {
            const v = (fr.values || []).filter(Number.isFinite).map(Number)[0];
            return Number.isFinite(v) ? { date: fr.date, value: v } : null;
        })
            .filter(Boolean);
    }));
    return [].concat(...parts).sort((a, b) => a.date.localeCompare(b.date));
}
