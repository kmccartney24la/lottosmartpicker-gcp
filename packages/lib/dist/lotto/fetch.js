import { parseCanonicalCsv, parseFlexibleCsv, parseTokens, USE_WORKER } from './parse.js';
import { getCurrentEraConfig, filterRowsForCurrentEra } from './era.js';
import { underlyingKeysFor } from './routing.js';
import { apiPathForGame, latestApiPathForGame, apiPathForUnderlying, } from './paths.js';
/* ===========================================================
   Pull analytics & helpers from the new modules
   (No analytics implementations remain in this file.)
   =========================================================== */
import { computeStats, analyzeGame, generateTicket, } from './stats.js';
import { digitKFor, computeDigitStats, toPastDrawsDigitsView, ticketHintsDigits, } from './digits.js';
import { computePick10Stats, buildPick10Weights, generatePick10Ticket, ticketHintsPick10, } from './pick10.js';
import { computeQuickDrawStats, buildQuickDrawWeights, generateQuickDrawTicket, recommendQuickDrawFromStats, jackpotOddsQuickDraw, } from './quickdraw.js';
/* ===========================================================
   Tiny utilities
   =========================================================== */
const isMultiGame = (g) => g === 'multi_powerball' || g === 'multi_megamillions' || g === 'multi_cash4life';
function shouldSeedFullHistory() {
    return typeof process !== 'undefined'
        && !!process.env
        && process.env.LSP_SEED_FULL === '1';
}
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
const isBrowser = () => typeof window !== 'undefined' && typeof localStorage !== 'undefined';
function cacheKey(game) {
    return `lsp.cache.v2.${game}`;
}
export function computeNextRefreshISO(_game) {
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
    const hasData = !!(env.rawCsv && env.rawCsv.trim().length) || !!(env.rows && env.rows.length);
    if (!hasData)
        return false;
    return new Date(env.nextRefreshISO).getTime() > Date.now();
}
/** HEAD/GET probe used to validate if cached latest row matches the origin. */
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
        return null;
    const last = lines[lines.length - 1]?.split(',')[0];
    if (!last)
        return null;
    const d = new Date(last);
    if (Number.isNaN(d.getTime()))
        return null;
    return d.toISOString().slice(0, 10);
}
function tryReadEraFilteredCache(game) {
    const era = getCurrentEraConfig(game);
    const env = readCache(game);
    if (!env || env.eraStart !== era.start || !isCacheFresh(env))
        return null;
    if (env.rawCsv) {
        const parsed = parseCanonicalCsv(env.rawCsv, game);
        return filterRowsForCurrentEra(parsed, game);
    }
    if (env.rows) {
        return filterRowsForCurrentEra(env.rows, game);
    }
    return null;
}
function cachedLatestISO(env, game) {
    if (!env)
        return null;
    if (env.rawCsv) {
        const r = parseCanonicalCsv(env.rawCsv, game);
        return r.length ? r[r.length - 1].date : null;
    }
    if (env.rows?.length)
        return env.rows[env.rows.length - 1].date;
    return null;
}
/* ===========================================================
   Canonical rows with cache (5+special)
   =========================================================== */
export async function fetchRowsWithCache(options) {
    const { game, since, until, token } = options;
    // 🚧 Guard: digit & non-5-ball games are handled elsewhere.
    if (game.startsWith('fl_pick') ||
        game === 'tx_texas_two_step' ||
        game.startsWith('ny_numbers') ||
        game.startsWith('ny_win4') ||
        game === 'ny_quick_draw' ||
        game === 'ny_pick10' ||
        game === 'ca_daily3' ||
        game === 'ca_daily4') {
        // eslint-disable-next-line no-console
        console.warn('BUG: fetchRowsWithCache called for non-canonical game:', game, new Error().stack);
        return [];
    }
    // 🔁 If CI asked to seed, force full history for PB/MM (server-side only)
    const effectiveLatestOnly = options.latestOnly && !(isMultiGame(game) && shouldSeedFullHistory());
    const era = getCurrentEraConfig(game);
    if (!effectiveLatestOnly) {
        const hit = tryReadEraFilteredCache(game);
        if (hit)
            return hit;
    }
    const env = !effectiveLatestOnly ? readCache(game) : null;
    if (env && env.eraStart === era.start) {
        try {
            const remoteLatest = await fetchLatestDate(game);
            const cachedLatest = cachedLatestISO(env, game);
            if (remoteLatest && cachedLatest === remoteLatest) {
                return filterRowsForCurrentEra(env.rows ?? [], game);
            }
            if (!remoteLatest && isCacheFresh(env)) {
                return filterRowsForCurrentEra(env.rows ?? [], game);
            }
            // else stale → proceed to full fetch
        }
        catch {
            if (isCacheFresh(env))
                return filterRowsForCurrentEra(env.rows ?? [], game);
        }
    }
    let rows = [];
    let csvText = null;
    try {
        const url = apiPathForGame(game);
        const res = await fetch(url);
        if (!res.ok)
            throw new Error(`Canonical ${game} ${res.status}`);
        csvText = await res.text();
        const all = parseCanonicalCsv(csvText, game);
        rows = applyFilters(all, { since, until, latestOnly: effectiveLatestOnly });
    }
    catch (err) {
        // Fallback to Socrata on server for multi-state only
        if (isMultiGame(game)) {
            if (typeof window === 'undefined') {
                rows = await fetchNY({ game, since, until, latestOnly: effectiveLatestOnly, token });
            }
            else {
                throw err;
            }
        }
        else {
            throw err;
        }
    }
    if (!effectiveLatestOnly && csvText) {
        writeCache(game, { rawCsv: csvText }, era.start);
    }
    return filterRowsForCurrentEra(rows, game);
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
/* ===========================================================
   Socrata (NY Open Data) for PB/MM/C4L
   =========================================================== */
export const SOCRATA_BASE = 'https://data.ny.gov/resource';
export const DATASETS = {
    multi_powerball: { id: 'd6yy-54nr', dateField: 'draw_date', winningField: 'winning_numbers' },
    multi_megamillions: { id: '5xaw-6ayf', dateField: 'draw_date', winningField: 'winning_numbers', specialField: 'mega_ball' },
    multi_cash4life: { id: 'kwxv-fwze', dateField: 'draw_date', winningField: 'winning_numbers', specialField: 'cash_ball' },
};
export async function fetchNY(options) {
    const { game, since, until, latestOnly, token } = options;
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
    if (!latestOnly) {
        const where = buildWhere(cfg.dateField, since, until);
        if (where)
            params.$where = where;
    }
    const url = `${SOCRATA_BASE}/${cfg.id}.json?` + new URLSearchParams(params).toString();
    const res = await fetch(url, {
        headers: token ? { 'X-App-Token': token } : undefined,
        cache: 'no-store',
    });
    if (!res.ok)
        throw new Error(`Socrata ${res.status}: ${await res.text()}`);
    const rows = await res.json();
    const out = [];
    for (const r of rows) {
        const date = new Date(r[cfg.dateField]).toISOString().slice(0, 10);
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
// Convert a flexible row into a canonical LottoRow "shim" (first 5 mains).
function toLottoShim(fr, rep) {
    const [n1, n2, n3, n4, n5] = [
        fr.values[0] || 0,
        fr.values[1] || 0,
        fr.values[2] || 0,
        fr.values[3] || 0,
        fr.values[4] || 0,
    ];
    // For Lotto-style 6-main games, keep 6th main in `special`
    const sixth = fr.values[5];
    const special = (rep === 'ny_lotto' && Number.isFinite(sixth))
        ? Number(sixth)
        : fr.special;
    return { game: rep, date: fr.date, n1, n2, n3, n4, n5, special };
}
/** Merge one or more underlying files into canonical LottoRow "shims". */
export async function fetchLogicalRows(opts) {
    const { logical, period, until } = opts;
    // Digit/Keno-style logicals are handled by dedicated helpers below
    if (logical === 'ny_numbers' ||
        logical === 'ny_win4' ||
        logical === 'fl_pick2' ||
        logical === 'fl_pick3' ||
        logical === 'fl_pick4' ||
        logical === 'fl_pick5' ||
        logical === 'fl_cashpop' ||
        logical === 'tx_all_or_nothing' ||
        logical === 'ny_quick_draw' ||
        logical === 'ny_pick10' ||
        logical === 'ca_daily3' ||
        logical === 'ca_daily4') {
        return [];
    }
    const keys = underlyingKeysFor(logical, period);
    // Choose a representative GameKey for shimming
    const REP_FOR_LOGICAL = {
        ny_take5: 'ny_take5',
        ny_lotto: 'ny_lotto',
    };
    const rep = REP_FOR_LOGICAL[logical] ??
        ['multi_powerball', 'multi_megamillions', 'multi_cash4life'][0];
    const parts = await Promise.all(keys.map(async (k) => {
        const url = apiPathForUnderlying(k);
        const res = await fetch(url);
        if (!res.ok)
            return [];
        const csv = await res.text();
        const flexAll = parseFlexibleCsv(csv); // ascending
        const flex = (!until) ? flexAll : flexAll.filter(fr => fr.date < until);
        return flex.map(fr => toLottoShim(fr, rep));
    }));
    const merged = [].concat(...parts);
    return merged.sort((a, b) => a.date.localeCompare(b.date));
}
/* ---------------- Digits (incl. Fireball) ---------------- */
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
            const d = (fr.values || []).filter(Number.isFinite).slice(0, wantLen);
            if (d.length !== wantLen)
                return null;
            const fb = ((logical.startsWith('fl_pick') || logical.startsWith('tx_')) && typeof fr.special === 'number' && Number.isFinite(fr.special))
                ? fr.special
                : undefined;
            return { date: fr.date, digits: d, fb };
        }).filter(Boolean);
    }));
    return [].concat(...parts).sort((a, b) => a.date.localeCompare(b.date));
}
// Re-export UI helper (kept here for convenience)
export { toPastDrawsDigitsView, ticketHintsDigits };
/* ---------------- NY Pick 10 ---------------- */
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
            const vals = (fr.values || []).filter(n => Number.isFinite(n) && n >= 1 && n <= 80).slice(0, 10);
            return vals.length === 10 ? { date: fr.date, values: vals } : null;
        })
            .filter(Boolean);
    }));
    const merged = [].concat(...parts);
    return merged.sort((a, b) => a.date.localeCompare(b.date));
}
// Re-export Pick10 helpers (no implementations here)
export { computePick10Stats, buildPick10Weights, generatePick10Ticket, ticketHintsPick10 };
/* ---------------- Texas All or Nothing (12/24) ---------------- */
export async function fetchAllOrNothingRows(period) {
    const logical = 'tx_all_or_nothing';
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
            const vals = (fr.values || []).filter(n => Number.isFinite(n) && n >= 1 && n <= 24).slice(0, 12);
            return vals.length === 12 ? { date: fr.date, values: vals } : null;
        })
            .filter(Boolean);
    }));
    return [].concat(...parts).sort((a, b) => a.date.localeCompare(b.date));
}
/* ---------------- Quick Draw (20/80) ---------------- */
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
            const vals = (fr.values || []).filter(n => Number.isFinite(n) && n >= 1 && n <= 80).slice(0, 20);
            return vals.length === 20 ? { date: fr.date, values: vals } : null;
        })
            .filter(Boolean);
    }));
    const merged = [].concat(...parts);
    return merged.sort((a, b) => a.date.localeCompare(b.date));
}
// Re-export Quick Draw helpers (no implementations here)
export { computeQuickDrawStats, buildQuickDrawWeights, generateQuickDrawTicket, recommendQuickDrawFromStats, jackpotOddsQuickDraw };
/* ---------------- Florida Cash Pop (5 daily periods) ---------------- */
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
/* ===========================================================
   Async wrappers (call into analytics modules; worker-capable)
   =========================================================== */
async function _bridge() {
    return await import('../workers/workerBridge.js');
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
// Non-5-ball async wrappers
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
/* ===========================================================
   Defaults (data windowing)
   =========================================================== */
export function defaultSinceFor(game) {
    const today = new Date();
    const since = (months) => {
        const d = new Date(today);
        d.setMonth(d.getMonth() - months);
        return d.toISOString().slice(0, 10);
    };
    if (game === 'multi_powerball' || game === 'multi_megamillions' || game === 'multi_cash4life')
        return since(24);
    if (game === 'ga_fantasy5' || game === 'ca_superlotto_plus' || game === 'ca_fantasy5'
        || game === 'fl_fantasy5_midday' || game === 'fl_fantasy5_evening' || game === 'ny_take5'
        || game === 'tx_cash5')
        return since(18);
    if (game === 'fl_lotto' || game === 'fl_jackpot_triple_play' || game === 'tx_lotto_texas' || game === 'ny_lotto')
        return since(24);
    return null;
}
