// packages/lib/src/lotto/fetch.ts
/* ===========================================================
   Imports from the new modularized code
   =========================================================== */
import type {
  GameKey, LogicalGameKey, Period,
  LottoRow, DigitRowEx, Pick10Row, QuickDrawRow,
  CashPopRow, AllOrNothingRow,
  UnderlyingKey, SocrataGame, CashPopPeriod, DigitRow,
} from './types.js';
import { parseCanonicalCsv, parseFlexibleCsv, parseTokens, USE_WORKER } from './parse.js';
import { getCurrentEraConfig, filterRowsForCurrentEra } from './era.js';
import { underlyingKeysFor } from './routing.js';
import {
  apiPathForGame,
  latestApiPathForGame,
  apiPathForUnderlying,
} from './paths.js';

/* ===========================================================
   Pull analytics & helpers from the new modules
   (No analytics implementations remain in this file.)
   =========================================================== */
import {
  computeStats, analyzeGame, generateTicket,
} from './stats.js';

import {
  digitKFor, computeDigitStats, toPastDrawsDigitsView, ticketHintsDigits,
} from './digits.js';

import {
  computePick10Stats,
  buildPick10Weights,
  generatePick10Ticket,
  ticketHintsPick10,
  computeAllOrNothingStats,
  generateAllOrNothingTicket,
  recommendAllOrNothingFromStats,
} from './pick10.js';

import {
  computeQuickDrawStats, buildQuickDrawWeights, generateQuickDrawTicket,
  recommendQuickDrawFromStats, jackpotOddsQuickDraw,
} from './quickdraw.js';

/* ===========================================================
   Shape/meta helpers from the central registry
   =========================================================== */
// Keep this import thin to avoid accidental circulars.
import { resolveGameMeta, isDigitShape } from '../gameRegistry.js';

/* ===========================================================
   Tiny utilities
   =========================================================== */
const isMultiGame = (g: GameKey) =>
  g === 'multi_powerball' || g === 'multi_megamillions' || g === 'multi_cash4life';

function shouldSeedFullHistory(): boolean {
  return typeof process !== 'undefined'
      && !!(process as any).env
      && (process as any).env.LSP_SEED_FULL === '1';
}

export function formatISO(d: Date): string { return d.toISOString().slice(0,10); }

export function lastYearRange(): { since: string; until: string } {
  const today = new Date();
  const until = formatISO(today);
  const sinceD = new Date(today);
  sinceD.setDate(sinceD.getDate() - 365);
  const since = formatISO(sinceD);
  return { since, until };
}

export function buildWhere(dateField: string, since?: string, until?: string): string | undefined {
  if (!since && !until) return undefined;
  if (since && until) {
    const end = new Date(until);
    end.setDate(end.getDate() + 1);
    const endISO = formatISO(end);
    return `${dateField} >= '${since}' AND ${dateField} < '${endISO}'`;
  }
  if (since) return `${dateField} >= '${since}'`;
  const end = new Date(until as string);
  end.setDate(end.getDate() + 1);
  return `${dateField} < '${formatISO(end)}'`;
}

/* ===========================================================
   Local cache (browser localStorage) + freshness probe
   =========================================================== */

type CacheEnvelope = {
  rawCsv?: string;       // canonical CSV text (preferred)
  rows?: LottoRow[];     // legacy parsed cache (read-only)
  cachedAtISO: string;
  nextRefreshISO: string;
  eraStart: string;
};

const isBrowser = () =>
  typeof window !== 'undefined' && typeof localStorage !== 'undefined';

function cacheKey(game: GameKey) {
  return `lsp.cache.v2.${game}`;
}

export function computeNextRefreshISO(_game?: GameKey): string {
  const now = new Date();
  now.setHours(now.getHours() + 6);
  return now.toISOString();
}

function readCache(game: GameKey): CacheEnvelope | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(cacheKey(game));
    if (!raw) return null;
    return JSON.parse(raw) as CacheEnvelope;
  } catch {
    try { localStorage.removeItem(cacheKey(game)); } catch {}
    return null;
  }
}

function writeCache(
  game: GameKey,
  payload: { rawCsv: string; rows?: LottoRow[] },
  eraStart: string
) {
  if (!isBrowser()) return;
  const env: CacheEnvelope = {
    rawCsv: payload.rawCsv,
    ...(payload.rows ? { rows: payload.rows } : {}),
    eraStart,
    cachedAtISO: new Date().toISOString(),
    nextRefreshISO: computeNextRefreshISO(game),
  };
  try { localStorage.setItem(cacheKey(game), JSON.stringify(env)); } catch {}
}

function isCacheFresh(env: CacheEnvelope): boolean {
  const hasData = !!(env.rawCsv && env.rawCsv.trim().length) || !!(env.rows && env.rows.length);
  if (!hasData) return false;
  return new Date(env.nextRefreshISO).getTime() > Date.now();
}

/** HEAD/GET probe used to validate if cached latest row matches the origin. */
async function fetchLatestDate(game: GameKey): Promise<string | null> {
  const url = latestApiPathForGame(game);
  // Try HEAD first
  const head = await fetch(url, { method: 'HEAD' });
  if (head.ok) {
    const lm = head.headers.get('last-modified');
    if (lm) {
      const d = new Date(lm);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    const etag = head.headers.get('etag');
    if (etag) return etag; // token for equality-only checks
  }
  // Fallback GET
  const res = await fetch(url);
  if (!res.ok) return null;
  const txt = await res.text();
  const lines = txt.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const last = lines[lines.length - 1]?.split(',')[0];
  if (!last) return null;
  const d = new Date(last);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function tryReadEraFilteredCache(game: GameKey): LottoRow[] | null {
  const era = getCurrentEraConfig(game);
  const env = readCache(game);
  if (!env || env.eraStart !== era.start || !isCacheFresh(env)) return null;

  if (env.rawCsv) {
    const parsed = parseCanonicalCsv(env.rawCsv, game);
    return filterRowsForCurrentEra(parsed, game);
  }
  if (env.rows) {
    return filterRowsForCurrentEra(env.rows, game);
  }
  return null;
}

function cachedLatestISO(env: CacheEnvelope | null, game: GameKey): string | null {
  if (!env) return null;
  if (env.rawCsv) {
    const r = parseCanonicalCsv(env.rawCsv, game);
    return r.length ? r[r.length - 1]!.date : null;
  }
  if (env.rows?.length) return env.rows[env.rows.length - 1]!.date;
  return null;
}

/* ===========================================================
   Canonical rows with cache (5+special)
   =========================================================== */

export async function fetchRowsWithCache(options: {
  game: GameKey; since?: string; until?: string; latestOnly?: boolean; token?: string;
}): Promise<LottoRow[]> {
  const { game, since, until, token } = options;

  // 🚧 Guard: use registry meta instead of hard-coded lists.
  // Only canonical 5/6-style draw files are supported here; digits/keno/cashpop/logicals have their own fetchers.
  {
    const meta = resolveGameMeta(game);
    const nonCanonical =
      isDigitShape(meta.shape) ||
      meta.shape === 'pick10' ||
      meta.shape === 'quickdraw' ||
      meta.shape === 'cashpop';
    if (nonCanonical) {
      // eslint-disable-next-line no-console
      console.warn('fetchRowsWithCache called for non-canonical shape:', game, meta.shape, new Error().stack);
      return [];
    }
  }
  // 🔁 If CI asked to seed, force full history for PB/MM (server-side only)
  const effectiveLatestOnly =
    options.latestOnly && !(isMultiGame(game) && shouldSeedFullHistory());

  const era = getCurrentEraConfig(game);

  if (!effectiveLatestOnly) {
    const hit = tryReadEraFilteredCache(game);
    if (hit) return hit;
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
    } catch {
      if (isCacheFresh(env)) return filterRowsForCurrentEra(env.rows ?? [], game);
    }
  }

  let rows: LottoRow[] = [];
  let csvText: string | null = null;
  try {
    const url = apiPathForGame(game);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Canonical ${game} ${res.status}`);
    csvText = await res.text();
    const all = parseCanonicalCsv(csvText, game);
    rows = applyFilters(all, { since, until, latestOnly: effectiveLatestOnly });
  } catch (err) {
    // Fallback to Socrata on server for multi-state only
    if (isMultiGame(game)) {
      if (typeof window === 'undefined') {
        rows = await fetchNY({ game, since, until, latestOnly: effectiveLatestOnly, token });
      } else {
        throw err;
      }
    } else {
      throw err;
    }
  }

  if (!effectiveLatestOnly && csvText) {
    writeCache(game, { rawCsv: csvText }, era.start);
  }
  return filterRowsForCurrentEra(rows, game);
}

function applyFilters(
  rows: LottoRow[],
  opts: { since?: string; until?: string; latestOnly?: boolean }
): LottoRow[] {
  let out = rows;
  if (opts.since) out = out.filter(r => r.date >= opts.since!);
  if (opts.until) {
    const end = new Date(opts.until);
    end.setDate(end.getDate() + 1);
    const endISO = end.toISOString().slice(0, 10);
    out = out.filter(r => r.date < endISO);
  }
  if (opts.latestOnly) out = out.slice(-1);
  return out;
}

/* ===========================================================
   Socrata (NY Open Data) for PB/MM/C4L
   =========================================================== */

export const SOCRATA_BASE = 'https://data.ny.gov/resource';
export const DATASETS: Record<
  SocrataGame,
  { id: string; dateField: string; winningField: string; specialField?: string }
> = {
  multi_powerball:    { id: 'd6yy-54nr', dateField: 'draw_date', winningField: 'winning_numbers' },
  multi_megamillions: { id: '5xaw-6ayf', dateField: 'draw_date', winningField: 'winning_numbers', specialField: 'mega_ball' },
  multi_cash4life:    { id: 'kwxv-fwze', dateField: 'draw_date', winningField: 'winning_numbers', specialField: 'cash_ball' },
};

export async function fetchNY(options: {
  game: GameKey;
  since?: string;
  until?: string;
  latestOnly?: boolean;
  token?: string;
}): Promise<LottoRow[]> {
  const { game, since, until, latestOnly, token } = options;

  const SOC_KEYS = Object.keys(DATASETS) as Array<keyof typeof DATASETS>;
  const isSocrataGame = (k: GameKey): k is keyof typeof DATASETS =>
    (SOC_KEYS as readonly string[]).includes(k as unknown as string);
  if (!isSocrataGame(game)) {
    throw new Error(`Unsupported Socrata dataset for game: ${String(game)}`);
  }

  const cfg = DATASETS[game];
  const params: Record<string, string> = {
    $select: cfg.specialField
      ? `${cfg.dateField},${cfg.winningField},${cfg.specialField}`
      : `${cfg.dateField},${cfg.winningField}`,
    $order: `${cfg.dateField} ${latestOnly ? 'DESC' : 'ASC'}`,
    $limit: latestOnly ? '1' : '50000',
  };

  if (!latestOnly) {
    const where = buildWhere(cfg.dateField, since, until);
    if (where) params.$where = where;
  }

  const url = `${SOCRATA_BASE}/${cfg.id}.json?` + new URLSearchParams(params).toString();
  const res = await fetch(url, {
    headers: token ? { 'X-App-Token': token } : undefined,
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Socrata ${res.status}: ${await res.text()}`);

  const rows: any[] = await res.json();
  const out: LottoRow[] = [];
  for (const r of rows) {
    const date = new Date(r[cfg.dateField]).toISOString().slice(0,10);
    const nums = parseTokens(r[cfg.winningField] || '');
    if (nums.length < 5) continue;

    let special: number | undefined;
    if (cfg.specialField && r[cfg.specialField] != null) {
      const s = parseInt(r[cfg.specialField], 10);
      if (Number.isFinite(s)) special = s;
    }
    if (special == null && nums.length >= 6) special = nums[5];
    if (special == null) continue;

    const [n1, n2, n3, n4, n5] = nums as [number, number, number, number, number];
    out.push({ game, date, n1, n2, n3, n4, n5, special });
  }
  return out;
}

/* ===========================================================
   Flexible CSV readers: logical games and specials
   =========================================================== */

type FlexibleRow = { date: string; values: number[]; special?: number };

// Convert a flexible row into a canonical LottoRow "shim" (first 5 mains).
function toLottoShim(fr: FlexibleRow, rep: GameKey): LottoRow {
  const [n1, n2, n3, n4, n5] = [
    fr.values[0] || 0,
    fr.values[1] || 0,
    fr.values[2] || 0,
    fr.values[3] || 0,
    fr.values[4] || 0,
  ];
  // For 6-main games, keep the 6th main in `special` (registry decides who qualifies).
  const repMeta = resolveGameMeta(rep);
  const sixth = fr.values[5];
  const treatAsSixMains = !!(repMeta.sixMainsNoSpecial || repMeta.isNyLotto);
  const special = (treatAsSixMains && Number.isFinite(sixth)) ? Number(sixth) : fr.special;
  return { game: rep, date: fr.date, n1, n2, n3, n4, n5, special };
}

/** Merge one or more underlying files into canonical LottoRow "shims". */
export async function fetchLogicalRows(opts: {
  logical: LogicalGameKey;
  period: Period;
  since?: string;
  until?: string;
}): Promise<LottoRow[]> {
  const { logical, period, until } = opts;

  // Use registry to route non-5/6 logicals away (digits/quickdraw/pick10/cashpop/AoN handled elsewhere).
  {
    const meta = resolveGameMeta(undefined, logical);
    const nonFiveSix =
      isDigitShape(meta.shape) ||
      meta.shape === 'pick10' ||
      meta.shape === 'quickdraw' ||
      meta.shape === 'cashpop' ||
      logical === 'tx_all_or_nothing';
    if (nonFiveSix) return [];
  }

  const keys = underlyingKeysFor(logical, period);

  // Choose a representative GameKey for shimming
  const REP_FOR_LOGICAL: Partial<Record<LogicalGameKey, GameKey>> = {
    ny_take5: 'ny_take5',
    ny_lotto: 'ny_lotto',
    fl_fantasy5: 'fl_fantasy5',
    ca_fantasy5: 'ca_fantasy5',
    ca_superlotto_plus: 'ca_superlotto_plus',
    multi_powerball: 'multi_powerball',
    multi_megamillions: 'multi_megamillions',
    multi_cash4life: 'multi_cash4life',
    tx_texas_two_step: 'tx_texas_two_step',
    // add others here if you introduce more 5/6-ball logicals
  };
  const rep: GameKey =
    REP_FOR_LOGICAL[logical] ??
    (['multi_powerball','multi_megamillions','multi_cash4life'][0] as GameKey);

  const parts = await Promise.all(
    keys.map(async (k) => {
      const url = apiPathForUnderlying(k);
      const res = await fetch(url);
      if (!res.ok) return [] as LottoRow[];
      const csv = await res.text();
      const flexAll = parseFlexibleCsv(csv); // ascending
      const flex = (!until) ? flexAll : flexAll.filter(fr => fr.date < until);
      return flex.map(fr => toLottoShim(fr as FlexibleRow, rep));
    })
  );

  const merged = ([] as LottoRow[]).concat(...parts);
  return merged.sort((a, b) => a.date.localeCompare(b.date));
}

/* ---------------- Digits (incl. Fireball) ---------------- */

export async function fetchDigitRowsFor(
  logical: 'ny_numbers' | 'ny_win4' | 'fl_pick5' | 'fl_pick4' | 'fl_pick3' | 'fl_pick2' | 'ca_daily3' | 'ca_daily4' | 'tx_pick3' | 'tx_daily4',
  period: Period
): Promise<DigitRowEx[]> {
  const keys = underlyingKeysFor(logical, period);
  const wantLen = digitKFor(logical);

  const parts = await Promise.all(
    keys.map(async (k) => {
      const url = apiPathForUnderlying(k as UnderlyingKey);
      const res = await fetch(url);
      if (!res.ok) return [] as DigitRowEx[];
      const csv = await res.text();
      const flex = parseFlexibleCsv(csv); // ascending by date

      // parseFlexibleCsv already maps 'fb'/'fireball' into special → that's our Fireball
      return flex.map(fr => {
        const d = (fr.values || []).filter(Number.isFinite).slice(0, wantLen) as number[];
        if (d.length !== wantLen) return null;
        const fb = ((logical.startsWith('fl_pick') || logical.startsWith('tx_')) && typeof fr.special === 'number' && Number.isFinite(fr.special))
          ? fr.special
          : undefined;
        return { date: fr.date, digits: d, fb } as DigitRowEx;
      }).filter(Boolean) as DigitRowEx[];
    })
  );

  return ([] as DigitRowEx[]).concat(...parts).sort((a,b)=>a.date.localeCompare(b.date));
}

/* ---------------- NY Pick 10 ---------------- */

export async function fetchPick10RowsFor(
  logical: 'ny_pick10'
): Promise<Pick10Row[]> {
  const keys = underlyingKeysFor(logical, 'all');
  const parts = await Promise.all(
    keys.map(async (k) => {
      const url = apiPathForUnderlying(k as UnderlyingKey);
      const res = await fetch(url);
      if (!res.ok) {
        console.warn('[pick10] failed to fetch', url, res.status);
        return [] as Pick10Row[];
      }
      const csv = await res.text();
      const flex = parseFlexibleCsv(csv); // ascending by date
      return flex
        .map(fr => {
          // keep up to 20 drawn numbers
          const vals = (fr.values || [])
            .filter(n => Number.isFinite(n) && n >= 1 && n <= 80)
            .slice(0, 20);
          // accept 10 or more (10-only files, or full 20)
          if (vals.length >= 10) {
            return { date: fr.date, values: vals } as Pick10Row;
          }
          return null;
        })
        .filter(Boolean) as Pick10Row[];
    })
  );
  const merged = ([] as Pick10Row[]).concat(...parts);
  return merged.sort((a, b) => a.date.localeCompare(b.date));
}


// Re-export Pick10 helpers (no implementations here)
export { computePick10Stats, buildPick10Weights, generatePick10Ticket, ticketHintsPick10 };

/* ---------------- Texas All or Nothing (12/24) ---------------- */

export async function fetchAllOrNothingRows(
  period: 'morning' | 'day' | 'evening' | 'night' | 'all'
): Promise<AllOrNothingRow[]> {
  const logical: LogicalGameKey = 'tx_all_or_nothing';
  const keys = underlyingKeysFor(logical, period as Period);
  const parts = await Promise.all(
    keys.map(async (k) => {
      const url = apiPathForUnderlying(k);
      const res = await fetch(url);
      if (!res.ok) return [] as AllOrNothingRow[];
      const csv = await res.text();
      const flex = parseFlexibleCsv(csv); // ascending
      return flex
        .map(fr => {
          const vals = (fr.values || []).filter(n => Number.isFinite(n) && n >= 1 && n <= 24).slice(0, 12);
          return vals.length === 12 ? ({ date: fr.date, values: vals } as AllOrNothingRow) : null;
        })
        .filter(Boolean) as AllOrNothingRow[];
    })
  );
  return ([] as AllOrNothingRow[]).concat(...parts).sort((a,b)=>a.date.localeCompare(b.date));
}

// Logical-style helper to mirror Pick 10 / Quick Draw API shape.
// (Generator calls this form.)
export async function fetchAllOrNothingRowsFor(
  logical: 'tx_all_or_nothing',
  period: 'morning' | 'day' | 'evening' | 'night' | 'all'
): Promise<AllOrNothingRow[]> {
  // internally it’s identical to fetchAllOrNothingRows, but we keep the
  // signature parallel to fetchPick10RowsFor / fetchQuickDrawRowsFor
  return fetchAllOrNothingRows(period);
}

// Re-export AON helpers (analytics live in pick10.ts generic k-of-N).
export {
  computeAllOrNothingStats,
  generateAllOrNothingTicket,
  recommendAllOrNothingFromStats,
};

export async function computeAllOrNothingStatsAsync(
  rows: AllOrNothingRow[], signal?: AbortSignal
) {
  if (!USE_WORKER) return computeAllOrNothingStats(rows);
  const { runTask } = await _bridge();
  return runTask<{rows:AllOrNothingRow[]}, ReturnType<typeof computeAllOrNothingStats>>(
    'computeAllOrNothingStats', { rows }, signal);
}

export async function generateAllOrNothingTicketAsync(
  stats: ReturnType<typeof computeAllOrNothingStats>,
  opts: { mode:'hot'|'cold'; alpha:number }, signal?: AbortSignal
) {
  if (!USE_WORKER) return generateAllOrNothingTicket(stats, opts);
  const { runTask } = await _bridge();
  return runTask<{stats:any;opts:{mode:'hot'|'cold';alpha:number}}, number[]>(
    'generateAllOrNothingTicket', { stats, opts }, signal);
}
/* ---------------- Quick Draw (20/80) ---------------- */

export async function fetchQuickDrawRowsFor(
  logical: 'ny_quick_draw'
): Promise<QuickDrawRow[]> {
  const keys = underlyingKeysFor(logical, 'all');
  const parts = await Promise.all(
    keys.map(async (k) => {
      const url = apiPathForUnderlying(k as UnderlyingKey);
      const res = await fetch(url);
      if (!res.ok) return [] as QuickDrawRow[];
      const csv = await res.text();
      const flex = parseFlexibleCsv(csv); // ascending by date
      return flex
        .map(fr => {
          const vals = (fr.values||[]).filter(n=>Number.isFinite(n) && n>=1 && n<=80).slice(0, 20);
          return vals.length === 20 ? ({ date: fr.date, values: vals } as QuickDrawRow) : null;
        })
        .filter(Boolean) as QuickDrawRow[];
    })
  );
  const merged = ([] as QuickDrawRow[]).concat(...parts);
  return merged.sort((a,b)=>a.date.localeCompare(b.date));
}

// Re-export Quick Draw helpers (no implementations here)
export { computeQuickDrawStats, buildQuickDrawWeights, generateQuickDrawTicket, recommendQuickDrawFromStats, jackpotOddsQuickDraw };

/* ---------------- Florida Cash Pop (5 daily periods) ---------------- */

export async function fetchCashPopRows(period: CashPopPeriod | 'all'): Promise<CashPopRow[]> {
  const logical: LogicalGameKey = 'fl_cashpop';
  const keys = underlyingKeysFor(logical, period as Period);
  const parts = await Promise.all(
    keys.map(async (k) => {
      const url = apiPathForUnderlying(k);
      const res = await fetch(url);
      if (!res.ok) return [] as CashPopRow[];
      const csv = await res.text();
      const flex = parseFlexibleCsv(csv); // ascending
      return flex
        .map(fr => {
          const v = (fr.values || []).filter(Number.isFinite).map(Number)[0];
          return Number.isFinite(v) ? ({ date: fr.date, value: v } as CashPopRow) : null;
        })
        .filter(Boolean) as CashPopRow[];
    })
  );
  return ([] as CashPopRow[]).concat(...parts).sort((a,b)=>a.date.localeCompare(b.date));
}

/* ===========================================================
   Async wrappers (call into analytics modules; worker-capable)
   =========================================================== */

async function _bridge(): Promise<typeof import('../workers/workerBridge.js')> {
  return await import('../workers/workerBridge.js');
}

type EraOverride = { mainMax: number; specialMax: number; mainPick: number };

export async function computeStatsAsync(
  rows: LottoRow[], game: GameKey, override?: EraOverride, signal?: AbortSignal
) {
  if (!USE_WORKER) return computeStats(rows, game, override);
  const { runTask } = await _bridge();
  return runTask<{rows:LottoRow[];game:GameKey;override?:EraOverride}, ReturnType<typeof computeStats>>(
    'computeStats', { rows, game, override }, signal);
}

export async function analyzeGameAsync(rows: LottoRow[], game: GameKey, signal?: AbortSignal) {
  if (!USE_WORKER) return analyzeGame(rows, game);
  const { runTask } = await _bridge();
  return runTask<{rows:LottoRow[];game:GameKey}, ReturnType<typeof analyzeGame>>('analyzeGame', { rows, game }, signal);
}

export async function generateTicketAsync(
  rows: LottoRow[],
  game: GameKey,
  opts:{modeMain:'hot'|'cold'; modeSpecial:'hot'|'cold'; alphaMain:number; alphaSpecial:number; avoidCommon:boolean},
  override?: EraOverride,
  signal?: AbortSignal
) {
  if (!USE_WORKER) return generateTicket(rows, game, opts, override);
  const { runTask } = await _bridge();
  return runTask<{rows:LottoRow[];game:GameKey;opts:any;override?:EraOverride}, ReturnType<typeof generateTicket>>(
    'generateTicket', { rows, game, opts, override }, signal);
}

// Non-5-ball async wrappers
export async function computeDigitStatsAsync(
  rows: DigitRow[], k: 2|3|4|5, signal?: AbortSignal
) {
  if (!USE_WORKER) return computeDigitStats(rows, k);
  const { runTask } = await _bridge();
  return runTask<{rows:DigitRow[];k:2|3|4|5}, ReturnType<typeof computeDigitStats>>(
    'computeDigitStats', { rows, k }, signal);
}

export async function computePick10StatsAsync(
  rows: Pick10Row[], signal?: AbortSignal
) {
  if (!USE_WORKER) return computePick10Stats(rows);
  const { runTask } = await _bridge();
  return runTask<{rows:Pick10Row[]}, ReturnType<typeof computePick10Stats>>(
    'computePick10Stats', { rows }, signal);
}

export async function computeQuickDrawStatsAsync(
  rows: QuickDrawRow[], signal?: AbortSignal
) {
  if (!USE_WORKER) return computeQuickDrawStats(rows);
  const { runTask } = await _bridge();
  return runTask<{rows:QuickDrawRow[]}, ReturnType<typeof computeQuickDrawStats>>(
    'computeQuickDrawStats', { rows }, signal);
}

export async function generatePick10TicketAsync(
  stats: ReturnType<typeof computePick10Stats>,
  opts: { mode:'hot'|'cold'; alpha:number },
  signal?: AbortSignal
) {
  if (!USE_WORKER) return generatePick10Ticket(stats, opts);
  const { runTask } = await _bridge();
  return runTask<{stats:any;opts:{mode:'hot'|'cold';alpha:number}}, number[]>(
    'generatePick10Ticket', { stats, opts }, signal);
}

export async function generateQuickDrawTicketAsync(
  stats: ReturnType<typeof computeQuickDrawStats>,
  spots: 1|2|3|4|5|6|7|8|9|10,
  opts: { mode:'hot'|'cold'; alpha:number },
  signal?: AbortSignal
) {
  if (!USE_WORKER) return generateQuickDrawTicket(stats, spots, opts);
  const { runTask } = await _bridge();
  return runTask<{stats:any;spots:number;opts:{mode:'hot'|'cold';alpha:number}}, number[]>(
    'generateQuickDrawTicket', { stats, spots, opts }, signal);
}

/* ===========================================================
   Defaults (data windowing)
   =========================================================== */

export function defaultSinceFor(game: GameKey): string | null {
  const today = new Date();
  const since = (months:number) => {
    const d = new Date(today); d.setMonth(d.getMonth() - months); return d.toISOString().slice(0,10);
  };
  if (game === 'multi_powerball' || game === 'multi_megamillions' || game === 'multi_cash4life') return since(24);
  if (game === 'ga_fantasy5' || game === 'ca_superlotto_plus' || game === 'ca_fantasy5'
   || game === 'fl_fantasy5' || game === 'ny_take5' || game === 'tx_cash5') return since(18);
  if (game === 'fl_lotto' || game === 'fl_jackpot_triple_play' || game === 'tx_lotto_texas' || game === 'tx_texas_two_step' || game === 'ny_lotto') return since(24);
  return null;
}
