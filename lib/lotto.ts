// lib/lotto.ts
// Stable game keys (target convention)
 export type GameKey =
   // Multi-state
   | 'multi_powerball'
   | 'multi_megamillions'
   | 'multi_cash4life'
   // GA
   | 'ga_fantasy5'
   | 'ga_scratchers'
   // Florida
   | 'fl_lotto'
   |'fl_jackpot_triple_play'
   | 'fl_pick5_midday' | 'fl_pick5_evening'
   | 'fl_pick4_midday' | 'fl_pick4_evening'
   | 'fl_pick3_midday' | 'fl_pick3_evening'
   | 'fl_pick2_midday' | 'fl_pick2_evening'
   // New York — underlying “file-backed” keys (exactly match update_csvs.ts objectPaths)
   | 'ny_nylotto'
   | 'ny_numbers_midday'
   | 'ny_numbers_evening'
   | 'ny_win4_midday'
   | 'ny_win4_evening'
   | 'ny_pick10'
   | 'ny_take5_midday'
   | 'ny_take5_evening'
   | 'ny_quick_draw'
   // New York — representative (UI/analysis) keys (no direct file; delegate to underlying)
   | 'ny_take5'
   | 'ny_numbers'
   | 'ny_win4'
   | 'ny_lotto'
   | 'ny_quick_draw_rep' // optional; see note below
   | 'ny_pick10_rep';    // optional; see note below

// ---------- NY logical keys & period model (for pages/UI) ----------
// Logical keys shown in the NY page UI
 export type LogicalGameKey =
   | 'ny_take5'
   | 'ny_numbers'
   | 'ny_win4'
   | 'ny_lotto'
   | 'ny_pick10'
   | 'ny_quick_draw'
   // Florida
   | 'fl_pick5'
   | 'fl_pick4'
   | 'fl_pick3'
   | 'fl_pick2'
   // also allow multi-state on that page
   | 'multi_powerball'
   | 'multi_megamillions'
   | 'multi_cash4life';

export type Period = 'midday' | 'evening' | 'both';

// ---- Narrow unions for specific registries ----
// Games that have an *era* used by 5-ball analysis/generator.
export type EraGame =
  | 'multi_powerball'
  | 'multi_megamillions'
  | 'multi_cash4life'
  | 'ga_fantasy5'
  | 'ny_take5'
  | 'ny_lotto'
  | 'fl_lotto'
  | 'fl_jackpot_triple_play';

// Games that we fetch from Socrata (NY Open Data).
export type SocrataGame =
  | 'multi_powerball'
  | 'multi_megamillions'
  | 'multi_cash4life';

// Games we present a weekly draw schedule for.
export type ScheduleGame =
  | 'multi_powerball'
  | 'multi_megamillions'
  | 'multi_cash4life'
  | 'ga_fantasy5'
  | 'ny_take5';

// Underlying CSV keys may include midday/evening variants that are not yet part
// of the canonical GameKey union (since many are flexible N-number shapes).
// We keep them separate so the UI can look them up, while draw analysis/generator
// can continue to use existing canonical GameKey rows.
export type UnderlyingKey =
  | GameKey
  | 'ny_take5_midday' | 'ny_take5_evening'
  | 'ny_numbers_midday' | 'ny_numbers_evening'
  | 'ny_win4_midday' | 'ny_win4_evening'
  | 'ny_nylotto'
  | 'ny_pick10'
  | 'ny_quick_draw';

// ---------- Feature Flags ----------
export const FEATURES = {
  DIGIT_HINTS: (process.env.NEXT_PUBLIC_ENABLE_DIGIT_HINTS ?? '1') === '1',
  PICK10:      (process.env.NEXT_PUBLIC_ENABLE_PICK10 ?? '0') === '1',
} as const;

// Source of truth: map logical → underlying keys by period
export const LOGICAL_TO_UNDERLYING: Record<
  LogicalGameKey,
  { both: UnderlyingKey[]; midday?: UnderlyingKey[]; evening?: UnderlyingKey[] }
> = {
  multi_powerball:    { both: ['multi_powerball'] },
  multi_megamillions: { both: ['multi_megamillions'] },
  multi_cash4life:    { both: ['multi_cash4life'] },
  ny_take5:           { both: ['ny_take5_midday','ny_take5_evening'], midday: ['ny_take5_midday'], evening: ['ny_take5_evening'] },
  ny_numbers:         { both: ['ny_numbers_midday','ny_numbers_evening'], midday: ['ny_numbers_midday'], evening: ['ny_numbers_evening'] },
  ny_win4:            { both: ['ny_win4_midday','ny_win4_evening'], midday: ['ny_win4_midday'], evening: ['ny_win4_evening'] },
  ny_lotto:           { both: ['ny_nylotto'] },
  ny_pick10:          { both: ['ny_pick10'] },
  ny_quick_draw:      { both: ['ny_quick_draw'] },
  fl_pick5:           {both:   ['fl_pick5_midday','fl_pick5_evening'], midday: ['fl_pick5_midday'], evening:['fl_pick5_evening'], },
  fl_pick4:           {both:   ['fl_pick4_midday','fl_pick4_evening'], midday: ['fl_pick4_midday'], evening:['fl_pick4_evening'], },
  fl_pick3:           {both:   ['fl_pick3_midday','fl_pick3_evening'], midday: ['fl_pick3_midday'], evening:['fl_pick3_evening'], },
  fl_pick2:           {both:   ['fl_pick2_midday','fl_pick2_evening'], midday: ['fl_pick2_midday'], evening:['fl_pick2_evening'], },
};

export function underlyingKeysFor(logical: LogicalGameKey, period: Period): UnderlyingKey[] {
  const m = LOGICAL_TO_UNDERLYING[logical];
  if (!m) return [];
  if (period !== 'both' && (m as any)[period]) return (m as any)[period] as UnderlyingKey[];
  return m.both;
}

// Deterministic representative key (used by components that need *one* key)
export function primaryKeyFor(logical: LogicalGameKey, period: Period): UnderlyingKey {
  const m = LOGICAL_TO_UNDERLYING[logical];
  if (!m) throw new Error(`Unknown logical game: ${logical}`);
  if (period === 'evening' && m.evening?.length) return m.evening[0]!;
  if (period === 'midday'  && m.midday?.length)  return m.midday[0]!;
  return m.midday?.[0] ?? m.both[0]!;
}

const isMultiGame = (g: GameKey) =>
  g === 'multi_powerball' || g === 'multi_megamillions' || g === 'multi_cash4life';

// Map any GameKey to the EraGame we use for analysis (generator, stats, labels).
function resolveEraGame(game: GameKey): EraGame {
  // Twice-daily Take 5 representatives & underlying collapse to 'ny_take5'
  if (game === 'ny_take5' || game === 'ny_take5_midday' || game === 'ny_take5_evening') return 'ny_take5';
  // NY Lotto maps to its own era (6 + Bonus)
  if (game === 'ny_lotto' || game === 'ny_nylotto') return 'ny_lotto';
  // All multi-state & GA Fantasy 5 are already EraGame members
  if (
    game === 'multi_powerball' ||
    game === 'multi_megamillions' ||
    game === 'multi_cash4life' ||
    game === 'ga_fantasy5' ||
    game === 'fl_lotto' ||
    game === 'fl_jackpot_triple_play'
  ) {
    return game;
  }
  // Fallback: use Cash4Life era (safe, 5+1) if someone passes a non-era NY key by mistake.
  return 'multi_cash4life';
}

// Safe accessor for weekly draw schedules.
function getScheduleGame(game: GameKey): ScheduleGame {
  if (game === 'multi_powerball' || game === 'multi_megamillions' || game === 'multi_cash4life' || game === 'ga_fantasy5') {
    return game;
  }
  // Use Take 5’s “daily/twice daily” semantics for NY logicals by default.
  return 'ny_take5';
}

// Always go through the app proxy
const FILE_BASE =
  process.env.NEXT_PUBLIC_DATA_BASE ||
  process.env.NEXT_PUBLIC_DATA_BASE_URL ||
  '/api/file';

function shouldSeedFullHistory(): boolean {
  // Guarded to Node/SSR; in browser `process` may not exist
  return typeof process !== 'undefined'
      && !!(process as any).env
      && (process as any).env.LSP_SEED_FULL === '1';
}

export type LottoRow = {
  game: GameKey;
  date: string;
  n1: number; n2: number; n3: number; n4: number; n5: number;
  special?: number; // Fantasy 5 has no special
};

 type CacheEnvelope = {
   rows: LottoRow[];
   cachedAtISO: string;    // when we cached
   nextRefreshISO: string; // when to invalidate
   eraStart: string;       // to nuke cache if era changes
 };

 function isBrowser() { return typeof window !== 'undefined' && typeof localStorage !== 'undefined'; }

 function cacheKey(game: GameKey) {
  // bump whenever caching logic/shape changes
  return `lsp.cache.v2.${game}`;
}

 /** Canonical Next API endpoints per game (remote-first to GCS, no-store). */
export const GAME_TO_API_PATH: Record<GameKey, string> = {
  multi_powerball:    `${FILE_BASE}/multi/powerball.csv`,
  multi_megamillions: `${FILE_BASE}/multi/megamillions.csv`,
  multi_cash4life:    `${FILE_BASE}/multi/cash4life.csv`,
  ga_fantasy5:        `${FILE_BASE}/ga/fantasy5.csv`,
  ga_scratchers:      `${FILE_BASE}/ga/scratchers/index.latest.json`,
  // --- Florida ---
  fl_lotto:           `${FILE_BASE}/fl/lotto.csv`,
  fl_jackpot_triple_play: `${FILE_BASE}/fl/jackpot_triple_play.csv`,
  fl_pick5_midday:    `${FILE_BASE}/fl/pick5_midday.csv`,
  fl_pick5_evening:   `${FILE_BASE}/fl/pick5_evening.csv`,
  fl_pick4_midday:    `${FILE_BASE}/fl/pick4_midday.csv`,
  fl_pick4_evening:   `${FILE_BASE}/fl/pick4_evening.csv`,
  fl_pick3_midday:    `${FILE_BASE}/fl/pick3_midday.csv`,
  fl_pick3_evening:   `${FILE_BASE}/fl/pick3_evening.csv`,
  fl_pick2_midday:    `${FILE_BASE}/fl/pick2_midday.csv`,
  fl_pick2_evening:   `${FILE_BASE}/fl/pick2_evening.csv`,
  // --- New York (UNDERLYING, file-backed) ---
  ny_nylotto:         `${FILE_BASE}/ny/nylotto.csv`,
  ny_numbers_midday:  `${FILE_BASE}/ny/numbers_midday.csv`,
  ny_numbers_evening: `${FILE_BASE}/ny/numbers_evening.csv`,
  ny_win4_midday:     `${FILE_BASE}/ny/win4_midday.csv`,
  ny_win4_evening:    `${FILE_BASE}/ny/win4_evening.csv`,
  ny_pick10:          `${FILE_BASE}/ny/pick10.csv`,
  ny_take5_midday:    `${FILE_BASE}/ny/take5_midday.csv`,
  ny_take5_evening:   `${FILE_BASE}/ny/take5_evening.csv`,
  ny_quick_draw:      `${FILE_BASE}/ny/quick_draw.csv`,

  // --- New York (REPRESENTATIVE, single-source convention for “latest/overview” UIs) ---
  // For twice-daily games, use EVENING as the representative source.
  ny_take5:           `${FILE_BASE}/ny/take5_evening.csv`,
  ny_numbers:         `${FILE_BASE}/ny/numbers_evening.csv`,
  ny_win4:            `${FILE_BASE}/ny/win4_evening.csv`,
  ny_lotto:           `${FILE_BASE}/ny/nylotto.csv`,
  // If you keep these optional rep keys, map them to their single file:
  ny_quick_draw_rep:  `${FILE_BASE}/ny/quick_draw.csv`,
  ny_pick10_rep:      `${FILE_BASE}/ny/pick10.csv`,
};

export function apiPathForGame(game: GameKey): string {
  const p = GAME_TO_API_PATH[game];
  if (!p) throw new Error(`Unknown game key: ${game}`);
  return p;
}

// ===== Flexible/logical fetching (NY & future states) =====
function apiPathForUnderlying(k: UnderlyingKey): string {
  // Canonical keys reuse the existing map
  if (
    k === 'multi_powerball' ||
    k === 'multi_megamillions' ||
    k === 'multi_cash4life' ||
    k === 'ga_fantasy5' ||
    k === 'ga_scratchers'
  ) {
    return apiPathForGame(k as GameKey);
  }
  // NY flexible CSVs (served via same-origin proxy)
  switch (k) {
    case 'ny_take5_midday':    return `${FILE_BASE}/ny/take5_midday.csv`;
    case 'ny_take5_evening':   return `${FILE_BASE}/ny/take5_evening.csv`;
    case 'ny_numbers_midday':  return `${FILE_BASE}/ny/numbers_midday.csv`;
    case 'ny_numbers_evening': return `${FILE_BASE}/ny/numbers_evening.csv`;
    case 'ny_win4_midday':     return `${FILE_BASE}/ny/win4_midday.csv`;
    case 'ny_win4_evening':    return `${FILE_BASE}/ny/win4_evening.csv`;
    case 'ny_nylotto':         return `${FILE_BASE}/ny/nylotto.csv`;
    case 'ny_pick10':          return `${FILE_BASE}/ny/pick10.csv`;
    case 'ny_quick_draw':      return `${FILE_BASE}/ny/quick_draw.csv`;
  }
  throw new Error(`No API path for underlying key: ${k}`);
}

function latestApiPathForGame(game: GameKey): string {
  const p = apiPathForGame(game);
  return p.replace(/\.csv(\?.*)?$/i, '.latest.csv');
}

 function toISODateOnly(s?: string): string | null {
  if (!s) return null;
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Try Date()
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function getRowISODate(row: any): string | null {
  return toISODateOnly(row?.draw_date) ?? toISODateOnly(row?.date);
}

export function computeNextRefreshISO(_game?: GameKey): string {
  // Simple, safe TTL: refresh again in 6 hours
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
   } catch { return null; }
 }

 function writeCache(game: GameKey, rows: LottoRow[], eraStart: string) {
   if (!isBrowser()) return;
   const env: CacheEnvelope = {
     rows,
     eraStart,
     cachedAtISO: new Date().toISOString(),
     nextRefreshISO: computeNextRefreshISO(game),
   };
   try { localStorage.setItem(cacheKey(game), JSON.stringify(env)); } catch {}
 }

 function isCacheFresh(env: CacheEnvelope): boolean {
   return new Date(env.nextRefreshISO).getTime() > Date.now();
 }
 
export async function fetchRowsWithCache(options: {
  game: GameKey; since?: string; until?: string; latestOnly?: boolean; token?: string;
}): Promise<LottoRow[]> {
  const { game, since, until, token } = options;

  // 🔁 If CI asked to seed, force full history for multi games (PB/MM)
  const effectiveLatestOnly =
    options.latestOnly && !(isMultiGame(game) && shouldSeedFullHistory());

  const era = getCurrentEraConfig(game);
  if (!effectiveLatestOnly) {
    const env = readCache(game);
    if (env && env.eraStart === era.start && isCacheFresh(env)) {
      return filterRowsForCurrentEra(env.rows, game);
    }
  }

  const env = !effectiveLatestOnly ? readCache(game) : null;
  if (env && env.eraStart === era.start) {
    try {
      // Always prefer the tiny freshness probe; it’s cheap and precise.
      const remoteLatest = await fetchLatestDate(game);
      const cachedLatest = env.rows.length ? env.rows[env.rows.length - 1].date : null;
      if (remoteLatest && cachedLatest === remoteLatest) {
        // Cache matches the source — return immediately (even if TTL not elapsed).
        return filterRowsForCurrentEra(env.rows, game);
      }
      // If we couldn’t read latest date (null), fall back to TTL freshness.
      if (!remoteLatest && isCacheFresh(env)) {
        return filterRowsForCurrentEra(env.rows, game);
      }
      // else: stale → fall through to full fetch
    } catch {
      // If probe fails but TTL says fresh, still use cache.
      if (isCacheFresh(env)) return filterRowsForCurrentEra(env.rows, game);
    }
  }

  let rows: LottoRow[] = [];
  try {
    const all = await fetchCanonical(game); // remote-first via Next API → GCS
    rows = applyFilters(all, { since, until, latestOnly: effectiveLatestOnly });
  } catch (err) {
    // Fall back to Socrata only for Socrata-backed games
    if (game === 'multi_powerball' || game === 'multi_megamillions' || game === 'multi_cash4life') {
      rows = await fetchNY({ game, since, until, latestOnly: effectiveLatestOnly, token });
    } else {
      // For Fantasy 5 (no Socrata), rethrow so callers see the failure
      throw err;
    }
  }

  if (!effectiveLatestOnly) writeCache(game, rows, era.start);
  return filterRowsForCurrentEra(rows, game);
}

export const SOCRATA_BASE = 'https://data.ny.gov/resource';
export const DATASETS: Record<
  SocrataGame,
  { id: string; dateField: string; winningField: string; specialField?: string }
> = {
  multi_powerball:    { id: 'd6yy-54nr', dateField: 'draw_date', winningField: 'winning_numbers' },
  multi_megamillions: { id: '5xaw-6ayf', dateField: 'draw_date', winningField: 'winning_numbers', specialField: 'mega_ball' },
  multi_cash4life: { id: 'kwxv-fwze', dateField: 'draw_date', winningField: 'winning_numbers', specialField: 'cash_ball' }, // NY Open Data Cash4Life

};

export const DRAW_DOWS: Record<ScheduleGame, Set<number>> = {
  multi_powerball: new Set([1, 3, 6]),
  multi_megamillions: new Set([2, 5]),
  multi_cash4life: new Set([0,1,2,3,4,5,6]), // daily 9:00 p.m. ET
  ga_fantasy5:  new Set([0,1,2,3,4,5,6]), // daily 11:34 p.m. ET
  ny_take5:     new Set([0,1,2,3,4,5,6]),   // twice daily; treat as "daily" for window helpers
};

export const WINDOW_DOWS = new Set<number>([1,2,3,5,6]);
export const WINDOW_START = { h: 22, m: 30 };
export const WINDOW_END = { h: 1, m: 30 };

/* ---------------- Era awareness (CURRENT ERA ONLY) ----------------
   We always analyze/generate using the current matrices:
   - Powerball:    5/69 + 1/26 since 2015-10-07
   - Mega Millions:5/70 + 1/24 since 2025-04-08
-------------------------------------------------------------------*/
export type EraConfig = {
  start: string;            // inclusive YYYY-MM-DD
  mainMax: number;          // size of main ball domain
  specialMax: number;       // size of special ball domain (0 if none)
  mainPick: number;         // number of mains drawn (always 5)
  label: string;            // e.g. "5/69 + 1/26"
  description: string;      // human text about the change
};

export const CURRENT_ERA: Record<EraGame, EraConfig> = {
  multi_powerball: {
    start: '2015-10-07',
    mainMax: 69,
    specialMax: 26,
    mainPick: 5,
    label: '5/69 + 1/26',
    description:
      'Powerball’s current matrix took effect on Oct 7, 2015: 5 mains from 1–69 and Powerball 1–26 (changed from 59/35).',
  },
  multi_megamillions: {
    start: '2025-04-08',
    mainMax: 70,
    specialMax: 24,
    mainPick: 5,
    label: '5/70 + 1/24',
    description:
      'Mega Millions’ current matrix took effect on Apr 8, 2025: 5 mains from 1–70 and Mega Ball 1–24 (reduced from 25).',
  },
  multi_cash4life: {
    start: '2014-06-16', // conservative lower bound; matrix unchanged since launch in 2014 per NY Open Data
    mainMax: 60,
    specialMax: 4,
    mainPick: 5,
    label: '5/60 + Cash Ball 1/4',
    description:
      'Cash4Life: 5 mains from 1–60 and Cash Ball 1–4. Daily draws at 9:00 p.m. ET. Matrix stable since 2014.',
  },
  ga_fantasy5: {
    start: '2019-04-25', // rules doc date; safe “current era” bound under 5/42 daily drawings
    mainMax: 42,
    specialMax: 0,       // <-- no special ball
    mainPick: 5,
    label: '5/42 (no bonus)',
    description:
      'Fantasy 5: 5 mains from 1–42, no bonus ball. Daily draws at 11:34 p.m. ET.',
  },
  ny_take5: {
    start: '1992-01-17', // conservative lower bound (matrix is stable 5/39)
    mainMax: 39,
    specialMax: 0,
    mainPick: 5,
    label: '5/39 (no bonus)',
    description:
      'NY Take 5: 5 mains from 1–39, no bonus ball. Draws twice daily (midday/evening).',
  },
  ny_lotto: {
    // NY Lotto has been 6-from-59 + Bonus (59) for the modern era.
    start: '2001-09-12', // safe lower bound; adjust if you later version eras
    mainMax: 59,
    specialMax: 59,       // use the same domain for the Bonus UI
    mainPick: 6,          // ← key change: six mains
    label: '6/59 + Bonus (1–59)',
    description:
      'NY Lotto: 6 mains from 1–59 plus a Bonus ball (also 1–59). Jackpot odds = C(59,6); Bonus used for 2nd prize.',
  },
  fl_lotto: {
    start: '1999-10-24',   // matrix changed to 6/53 on Oct 24, 1999
    mainMax: 53,
    specialMax: 53,        // we store the 6th main in `special` for schema compatibility
    mainPick: 6,           // six mains
    label: '6/53 (no bonus; 6th stored as special)',
    description:
      'Florida LOTTO: 6 mains from 1–53. We store the 6th main in “special” to match the 5+special CSV schema. Double Play rows are excluded.',
  },
  fl_jackpot_triple_play: {
   start: '2019-01-30',     // JTP launch
   mainMax: 46,
   specialMax: 46,          // store 6th main in `special` (schema compatibility)
   mainPick: 6,
   label: '6/46 (no bonus; 6th stored as special)',
   description:
     'Florida Jackpot Triple Play: 6 mains from 1–46, no bonus ball. We store the 6th main in “special” to match the canonical 5+special schema.',
 },
};

export function getCurrentEraConfig(game: GameKey): EraConfig {
  return CURRENT_ERA[resolveEraGame(game)];
}

export function filterRowsForCurrentEra(rows: LottoRow[], game: GameKey): LottoRow[] {
  const eraKey = resolveEraGame(game);
  const era = CURRENT_ERA[eraKey];
  // Accept any row whose game resolves to the same era group (handles ny_lotto vs ny_nylotto, take5 rep vs underlying, etc.)
  return rows.filter(r => resolveEraGame(r.game) === eraKey && r.date >= era.start);
}

export function eraTooltipFor(game: GameKey): string {
  const era = CURRENT_ERA[resolveEraGame(game)];
  const name = game === 'multi_powerball' ? 'Powerball'
              : game === 'multi_megamillions' ? 'Mega Millions'
              : game === 'multi_cash4life' ? 'Cash4Life (GA)'
              : 'Fantasy 5 (GA)';
  return [
    `${name} (current era: ${era.label})`,
    `Effective date: ${era.start}`,
    era.description,
    'Analyses and ticket generation in LottoSmartPicker include ALL draws since this date and ignore earlier eras.',
  ].join('\n');
}

/* ---------------- Date/time helpers ---------------- */

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

// Normalizes any PB/MM/GA row shape to LottoRow used across the app
export function normalizeRowsLoose(rows: any[]): LottoRow[] {
  if (!Array.isArray(rows)) return [];

  // helper: ensure the game value is one of our supported keys
  const isGameKey = (g: any): g is GameKey =>
    g === 'multi_powerball' || g === 'multi_megamillions' || g === 'multi_cash4life' || g === 'ga_fantasy5' || g === 'ny_take5';

  const out: LottoRow[] = [];

  for (const r of rows) {
    // 1) date → ISO YYYY-MM-DD
    const rawDate: string | undefined = r.draw_date ?? r.date ?? r.drawDate;
    if (!rawDate) continue;
    const d = new Date(rawDate);
    if (Number.isNaN(d.getTime())) continue;
    const date = d.toISOString().slice(0, 10);

    // 2) mains → 5 numbers
    let mains: number[] | undefined;
    if (Array.isArray(r.mains) && r.mains.length >= 5) {
      mains = r.mains.map((n: any) => Number(n)).filter(Number.isFinite).slice(0, 5);
    } else {
      const candidate = [r.n1, r.n2, r.n3, r.n4, r.n5]
        .map((n: any) => Number(n))
        .filter(Number.isFinite);
      if (candidate.length >= 5) mains = candidate.slice(0, 5);
    }
    if (!mains || mains.length < 5) continue;
    const [n1, n2, n3, n4, n5] = mains;

    // 3) special (optional)
    const specialRaw = r.special ?? r.special_ball ?? r.pb ?? r.mb;
    const special =
      specialRaw !== undefined && specialRaw !== null && specialRaw !== ''
        ? Number(specialRaw)
        : undefined;
    if (special !== undefined && !Number.isFinite(special)) {
      // ignore invalid special values
      continue;
    }

    // 4) game
    const gameCandidate = r.game ?? r.gameKey ?? r.type;
    if (!isGameKey(gameCandidate)) continue;
    const game: GameKey = gameCandidate;

    out.push({ game, date, n1, n2, n3, n4, n5, special });
  }

  return out;
}

/* ---------------- Data fetching/parsing ---------------- */

export function parseTokens(s: string): number[] {
  return s.replace(/,/g,' ').replace(/-/g,' ').split(/\s+/).filter(Boolean).map(t=>parseInt(t,10)).filter(n=>Number.isFinite(n));
}

export async function fetchNY(options: {
  game: GameKey; since?: string; until?: string; latestOnly?: boolean; token?: string;
}): Promise<LottoRow[]> {
  const { game, since, until, latestOnly, token } = options;

  // Fantasy 5 is not a Socrata source. Only PB/MM/C4L go through Socrata here.
  if (game === 'ga_fantasy5') {
    throw new Error('fetchNY called for Fantasy 5 (no Socrata dataset).');
  }

  // ⬇️ Existing Socrata path (unchanged) for PB/MM/Cash4Life
  const cfg = DATASETS[game as Exclude<GameKey,'ga_fantasy5'>];
  const params: Record<string,string> = {
    $select: cfg.specialField ? `${cfg.dateField},${cfg.winningField},${cfg.specialField}` : `${cfg.dateField},${cfg.winningField}`,
    $order: `${cfg.dateField} ${latestOnly ? 'DESC':'ASC'}`,
    $limit: latestOnly ? '1' : '50000',
  };
  const where = latestOnly ? undefined : buildWhere(cfg.dateField, since, until);
  if (where) params.$where = where;
  const url = `${SOCRATA_BASE}/${cfg.id}.json?` + new URLSearchParams(params).toString();
  const res = await fetch(url, { headers: token ? { 'X-App-Token': token } : undefined, cache: 'no-store' });
  if (!res.ok) throw new Error(`Socrata ${res.status}: ${await res.text()}`);
  const rows: any[] = await res.json();
  const out: LottoRow[] = [];
  for (const r of rows) {
    const date = formatISO(new Date(r[cfg.dateField]));
    const nums = parseTokens(r[cfg.winningField] || '');
    if (nums.length < 5) continue;
    let special: number | undefined;
    if (cfg.specialField && r[cfg.specialField] != null) {
      const s = parseInt(r[cfg.specialField], 10);
      if (Number.isFinite(s)) special = s;
    }
    if (special == null && nums.length >= 6) special = nums[5];
    if (special == null) continue;
    const [n1,n2,n3,n4,n5] = nums;
    out.push({ game, date, n1,n2,n3,n4,n5, special });
  }
  return out;
}

// (Removed) Fantasy 5 special CSV parser — use parseCanonicalCsv for all canonical CSVs.

// ---- Canonical CSV parser (one game per file) ----
export function parseCanonicalCsv(csv: string, game: GameKey): LottoRow[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length === 0) return [];

  const header = lines.shift()!;
  const cols = header.split(',').map(s => s.trim().toLowerCase());
  const idx = (name: string) => cols.indexOf(name);

  const iDate = idx('draw_date');

  // Support both num1..num5 and m1..m5
  const i1 = idx('num1') >= 0 ? idx('num1') : idx('m1');
  const i2 = idx('num2') >= 0 ? idx('num2') : idx('m2');
  const i3 = idx('num3') >= 0 ? idx('num3') : idx('m3');
  const i4 = idx('num4') >= 0 ? idx('num4') : idx('m4');
  const i5 = idx('num5') >= 0 ? idx('num5') : idx('m5');

  const iSpec = idx('special'); // optional

  if (iDate < 0 || [i1, i2, i3, i4, i5].some(i => i < 0)) return [];

  const out: LottoRow[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const t = line.split(',').map(s => s.trim());

    const d = new Date(t[iDate]);
    if (Number.isNaN(d.getTime())) continue;
    const date = d.toISOString().slice(0, 10);

    const mains = [t[i1], t[i2], t[i3], t[i4], t[i5]].map(v => parseInt(v, 10));
    if (mains.some(n => !Number.isFinite(n))) continue;

    const spec =
      iSpec >= 0 && t[iSpec] !== '' && t[iSpec] != null
        ? parseInt(t[iSpec], 10)
        : undefined;

    const [n1, n2, n3, n4, n5] = mains;
    out.push({ game, date, n1, n2, n3, n4, n5, special: spec });
  }
  return out;
}

// ---- Flexible CSV parser (dynamic n1..nN[,special]) ----
type FlexibleRow = { date: string; values: number[]; special?: number };

export function parseFlexibleCsv(csv: string): FlexibleRow[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines.shift()!.split(',').map(s => s.trim().toLowerCase());
  const find = (n: string) => header.indexOf(n);
  const iDate = ['draw_date', 'date'].map(find).find(i => i >= 0) ?? -1;
  if (iDate < 0) return [];

  // discover columns for values:
  // 1) n1..nN, 2) m1..mN, 3) num1..numN, 4) ball1..ballN
  const nIdx: number[] = [];
  const trySeq = (prefix: string) => {
    const acc: number[] = [];
    for (let i = 1; i <= 40; i++) {
      const j = find(`${prefix}${i}`);
      if (j >= 0) acc.push(j);
      else break;
    }
    return acc;
  };
  let seq = trySeq('n');
  if (seq.length === 0) seq = trySeq('m');
  if (seq.length === 0) seq = trySeq('num');
  if (seq.length === 0) seq = trySeq('ball');
  nIdx.push(...seq);

  // optional special column
  const iSpec = find('special');
  // optional single string column of winning numbers
  const iWinning = find('winning_numbers');

  const out: FlexibleRow[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const t = line.split(',').map(s => s.trim());
    const d = new Date(t[iDate]); if (Number.isNaN(d.getTime())) continue;
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
    let special: number | undefined;
    if (iSpec >= 0 && t[iSpec] !== '' && t[iSpec] != null) {
      const s = parseInt(t[iSpec], 10); if (Number.isFinite(s)) special = s;
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

async function fetchLatestDate(game: GameKey): Promise<string | null> {
  if (game === 'ga_scratchers') return null;
  const url = latestApiPathForGame(game);
  const res = await fetch(url, { cache: 'no-store', next: { revalidate: 0 } as any });
  if (!res.ok) return null;
  const txt = await res.text();
  const lines = txt.trim().split(/\r?\n/);
  if (lines.length < 2) return null; // header-only
  const last = lines[lines.length - 1].split(',')[0];
  const d = new Date(last);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// Canonical fetch parses CSV (not JSON)
async function fetchCanonical(game: GameKey): Promise<LottoRow[]> {
  if (game === 'ga_scratchers') throw new Error('not a draw game');
  const url = apiPathForGame(game);
  const res = await fetch(url, { cache: 'no-store', next: { revalidate: 0 } as any });
  if (!res.ok) throw new Error(`Canonical ${game} ${res.status}`);
  const csv = await res.text();
  const rows = parseCanonicalCsv(csv, game);
  const minRows = isMultiGame(game) ? 1000 : 10;
  if (rows.length < minRows) throw new Error(`Canonical ${game} too small (${rows.length} rows)`);
  return rows.sort((a,b)=>a.date.localeCompare(b.date));
}

// Helper: convert a flexible row into a LottoRow "shim" (first 5 values)
function toLottoShim(fr: FlexibleRow, rep: GameKey): LottoRow {
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

// ---- New: fetchers for digits (Numbers/Win4) and Pick 10 ----
export async function fetchDigitRowsFor(
  logical: 'ny_numbers' | 'ny_win4',
  period: Period
): Promise<DigitRow[]> {
  const keys = underlyingKeysFor(logical, period);
  const parts = await Promise.all(
    keys.map(async (k) => {
      const url = apiPathForUnderlying(k as UnderlyingKey);
      const res = await fetch(url, { cache: 'no-store', next: { revalidate: 0 } as any });
      if (!res.ok) return [] as DigitRow[];
      const csv = await res.text();
      const flex = parseFlexibleCsv(csv); // ascending by date
      const wantLen = logical === 'ny_numbers' ? 3 : 4;
      return flex
        .map(fr => {
          const d = fr.values.filter(Number.isFinite).slice(0, wantLen);
          return d.length === wantLen ? ({ date: fr.date, digits: d } as DigitRow) : null;
        })
        .filter(Boolean) as DigitRow[];
    })
  );
  const merged = ([] as DigitRow[]).concat(...parts);
  return merged.sort((a,b)=>a.date.localeCompare(b.date));
}

export async function fetchPick10RowsFor(
  logical: 'ny_pick10'
): Promise<Pick10Row[]> {
  const keys = underlyingKeysFor(logical, 'both');
  const parts = await Promise.all(
    keys.map(async (k) => {
      const url = apiPathForUnderlying(k as UnderlyingKey);
      const res = await fetch(url, { cache: 'no-store', next: { revalidate: 0 } as any });
      if (!res.ok) return [] as Pick10Row[];
      const csv = await res.text();
      const flex = parseFlexibleCsv(csv); // ascending by date
      return flex
        .map(fr => {
          const vals = fr.values.filter(n=>Number.isFinite(n) && n>=1 && n<=80).slice(0, 10);
          return vals.length === 10 ? ({ date: fr.date, values: vals } as Pick10Row) : null;
        })
        .filter(Boolean) as Pick10Row[];
    })
  );
  const merged = ([] as Pick10Row[]).concat(...parts);
  return merged.sort((a,b)=>a.date.localeCompare(b.date));
}

const isCanonicalUnderlying = (k: UnderlyingKey): k is GameKey =>
  k === 'multi_powerball' || k === 'multi_megamillions' || k === 'multi_cash4life' || k === 'ga_fantasy5';

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
export async function fetchLogicalRows(opts: {
  logical: LogicalGameKey;
  period: Period;
  since?: string;
  until?: string;
}): Promise<LottoRow[]> {
  const { logical, period, since, until } = opts;

  // 1) Resolve underlying keys for this logical game + period
  const keys = underlyingKeysFor(logical, period);

  // 2) Pick a representative canonical key for shimming flexible rows
  const canonical = keys.filter(isCanonicalUnderlying);
  const REP_FOR_LOGICAL: Partial<Record<LogicalGameKey, GameKey>> = {
    ny_take5: 'ny_take5', // use Take 5’s own era (5/39, no bonus)
    ny_lotto: 'ny_lotto',
  };
  const rep: GameKey = canonical[0] ?? REP_FOR_LOGICAL[logical] ?? 'multi_cash4life';

  // 3) Canonical games remain era-aware (CURRENT_ERA) via fetchRowsWithCache.
  //    NY flexible games: single continuous era since game start → NO extra filtering here.
  const eraStart = canonical.length
    ? canonical.map(k => getCurrentEraConfig(k).start).sort()[0]!
    : (since ?? '2000-01-01');

  const parts = await Promise.all(
    keys.map(async (k) => {
      if (isCanonicalUnderlying(k)) {
        // Canonical source (PB/MM/C4L/Fantasy5): keep existing caching/era behavior.
        return fetchRowsWithCache({ game: k, since: eraStart, until });
      }
      // Flexible NY source: read everything (single continuous era) and shim to LottoRow.
      const url = apiPathForUnderlying(k);
      const res = await fetch(url, { cache: 'no-store', next: { revalidate: 0 } as any });
      if (!res.ok) return [] as LottoRow[];
      const csv = await res.text();
      const flexAll = parseFlexibleCsv(csv); // ascending by date
      // No logical-era cutoff: NY games assumed unchanged since inception.
      const flex = (!until)
        ? flexAll
        : flexAll.filter(fr => fr.date < until); // still honor caller's "until" if provided
      return flex.map(fr => toLottoShim(fr, rep));
    })
  );

  const merged = ([] as LottoRow[]).concat(...parts);
  return merged.sort((a, b) => a.date.localeCompare(b.date));
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

/* ---------------- UI helpers ---------------- */

export function drawNightsLabel(game: GameKey): string {
  if (game === 'multi_powerball') return 'Mon/Wed/Sat';
  if (game === 'multi_megamillions') return 'Tue/Fri';
  if (game === 'multi_cash4life') return 'Daily · 9:00 PM ET';
  return 'Daily · 11:34 PM ET'; // ga_fantasy5
}

export function getNYParts(now = new Date()): { dow:number; hour:number; minute:number } {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday:'short', hour:'2-digit', minute:'2-digit', hour12:false });
  const parts = fmt.formatToParts(now);
  const m: Record<string,string> = {};
  for (const p of parts) if (p.type !== 'literal') m[p.type] = p.value;
  const weekMap: Record<string,number> = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
  return { dow: weekMap[m.weekday as keyof typeof weekMap], hour: parseInt(m.hour||'0',10), minute: parseInt(m.minute||'0',10) };
}

export function isInDrawWindowNYFor(game: GameKey): boolean {
  const dows = DRAW_DOWS[getScheduleGame(game)];
  const { dow, hour, minute } = getNYParts();
  const inStartDay = dows.has(dow) && (hour > WINDOW_START.h || (hour === WINDOW_START.h && minute >= WINDOW_START.m));
  const prevDow = (dow + 6) % 7;
  const inAfterMidnight = dows.has(prevDow) && (hour < WINDOW_END.h || (hour === WINDOW_END.h && minute <= WINDOW_END.m));
  return inStartDay || inAfterMidnight;
}

export function nextDrawLabelNYFor(game: GameKey): string {
  const names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const target = DRAW_DOWS[getScheduleGame(game)];
  const now = new Date();
  for (let i=0;i<8;i++) {
    const d = new Date(now);
    d.setDate(d.getDate()+i);
    const { dow } = getNYParts(d);
    if (target.has(dow)) {
      if (game==='multi_cash4life') return `${names[dow]} 9:00 PM ET`;
      if (game==='ga_fantasy5')  return `${names[dow]} 11:34 PM ET`;
      return `${names[dow]} ≈11:00 PM ET`;
    }
  }
  if (game === 'multi_powerball') return 'Mon/Wed/Sat ≈11:00 PM ET';
  if (game === 'multi_megamillions') return 'Tue/Fri ≈11:00 PM ET';
  if (game === 'multi_cash4life') return 'Daily 9:00 PM ET';
  return 'Daily 11:34 PM ET';
}

export function evaluateTicket(
  game: GameKey,
  mains: number[],
  special: number | 0,
  stats: ReturnType<typeof computeStats>
): string[] {
  return ticketHints(game, mains, special ?? 0, stats);
}
/* ---------------- Stats / weighting ---------------- */

export function computeStats(
  rows: LottoRow[],
  game: GameKey,
  overrideCfg?: { mainMax: number; specialMax: number; mainPick: number }
) {
  // Use override if provided (e.g., current era), else the current era.
  // This keeps Mega Millions (24) correct and future-proofs defaults.
  const cfg = overrideCfg ?? getCurrentEraConfig(game);

  const countsMain = new Map<number, number>();
  const countsSpecial = new Map<number, number>();
  const lastSeenMain = new Map<number, number>();
  const lastSeenSpecial = new Map<number, number>();
  for (let n=1;n<=cfg.mainMax;n++){countsMain.set(n,0); lastSeenMain.set(n,Infinity);}
  for (let n=1;n<=cfg.specialMax;n++){countsSpecial.set(n,0); lastSeenSpecial.set(n,Infinity);}
  const totalDraws = rows.length;
  const reversed = [...rows].reverse();
  reversed.forEach((d, idx)=>{
    // Base mains from the canonical 5 fields
    const mains=[d.n1,d.n2,d.n3,d.n4,d.n5];
    // NY Lotto: treat the stored `special` as the 6th MAIN for stats purposes
    if ((overrideCfg?.mainPick ?? getCurrentEraConfig(game).mainPick) > 5
        && (game === 'ny_lotto' || game === 'ny_nylotto')
        && typeof d.special === 'number') {
      mains.push(d.special);
    }
    mains.forEach(m=>{countsMain.set(m,(countsMain.get(m)||0)+1); lastSeenMain.set(m, Math.min(lastSeenMain.get(m)||Infinity, idx));});
    // For NY Lotto we do NOT treat Bonus as special in stats (it lives outside LottoRow here).
    if (cfg.specialMax > 0
        && typeof d.special === 'number'
        && !(game === 'ny_lotto' || game === 'ny_nylotto')) {
      countsSpecial.set(d.special,(countsSpecial.get(d.special)||0)+1);
      lastSeenSpecial.set(d.special, Math.min(lastSeenSpecial.get(d.special)||Infinity, idx));
    }
  });
  const expectedMain = (totalDraws*5)/cfg.mainMax;
  const expectedSpecial = cfg.specialMax>0 ? totalDraws/cfg.specialMax : 0;
  const varMain = totalDraws*(5/cfg.mainMax)*(1-5/cfg.mainMax);
  const sdMain = Math.sqrt(Math.max(varMain,1e-9));
  const varSpecial = cfg.specialMax>0 ? totalDraws*(1/cfg.specialMax)*(1-1/cfg.specialMax) : 0;
  const sdSpecial = cfg.specialMax>0 ? Math.sqrt(Math.max(varSpecial,1e-9)) : 1; // avoid div/0
  const zMain = new Map<number,number>();
  const zSpecial = new Map<number,number>();
  for (let n=1;n<=cfg.mainMax;n++) zMain.set(n, ((countsMain.get(n)||0)-expectedMain)/sdMain);
  if (cfg.specialMax>0) for (let n=1;n<=cfg.specialMax;n++) zSpecial.set(n, ((countsSpecial.get(n)||0)-expectedSpecial)/sdSpecial);
  return { countsMain, countsSpecial, lastSeenMain, lastSeenSpecial, totalDraws, zMain, zSpecial, cfg };
}

export function buildWeights(domainMax: number, counts: Map<number,number>, mode:'hot'|'cold', alpha:number): number[] {
  // Add a light smoothing prior to reduce early-era overfit.
  const arr = Array.from({length:domainMax},(_,i)=>counts.get(i+1)||0);
  const total = arr.reduce((a,b)=>a+b,0);
  const avg = domainMax > 0 ? (total / domainMax) : 0;
  const eps = Math.min(0.5, Math.max(0.05, 0.05 * avg)); // in [0.05, 0.5]
  const arrSmooth = arr.map(c => c + eps);
  const totalSmooth = arrSmooth.reduce((a,b)=>a+b,0);
  const freq = totalSmooth>0 ? arrSmooth.map(c=>c/totalSmooth) : Array(domainMax).fill(1/domainMax);
  const max = Math.max(...freq);
  const invRaw = freq.map(p=>(max-p)+1e-9);
  const invSum = invRaw.reduce((a,b)=>a+b,0);
  const inv = invRaw.map(x=>x/invSum);
  const base = Array(domainMax).fill(1/domainMax);
  const chosen = mode==='hot'?freq:inv;
  const blended = chosen.map((p,i)=>(1-alpha)*base[i] + alpha*p);
  const s = blended.reduce((a,b)=>a+b,0);
  return blended.map(x=>x/s);
}

export function weightedSampleDistinct(k:number, weights:number[]): number[] {
  const n = weights.length;
  const picks:number[] = [];
  const w = weights.map(v=>(Number.isFinite(v)&&v>0?v:0));
  const available = new Set<number>(Array.from({length:n},(_,i)=>i));
  const drawOne = ():number => {
    let sum = 0;
    for (const i of available) sum += w[i];
    if (sum <= 1e-12) {
      const arr = Array.from(available);
      const ri = Math.floor(Math.random()*arr.length);
      return arr[ri];
    }
    let r = Math.random()*sum;
    let acc = 0;
    for (const i of available) { acc += w[i]; if (acc >= r) return i; }
    return Array.from(available).pop() as number;
  };
  const limit = Math.min(k,n);
  for (let t=0;t<limit;t++){ const idx=drawOne(); picks.push(idx+1); available.delete(idx); }
  return picks.sort((a,b)=>a-b);
}

export function looksTooCommon(mains:number[], game:GameKey): boolean {
  const mainMax = getCurrentEraConfig(game).mainMax;
  const arr = [...mains].sort((a,b)=>a-b); // harden against unsorted input
  // Any 3-in-a-row (triplet)
  const tripleRun = arr.some((_,i)=> i>=2 && arr[i-2]+2===arr[i-1]+1 && arr[i-1]+1===arr[i]);
  // Any 4-in-a-row (strictly stronger; catches very obvious sequences)
  const fourRun = arr.some((_,i)=> i>=3 && arr[i-3]+3===arr[i-2]+2 && arr[i-2]+2===arr[i-1]+1 && arr[i-1]+1===arr[i]);
  // “Date bias”: ≥4 numbers ≤31
  const lowBias = arr.filter(n=>n<=31).length >= 4;
  // Pure arithmetic progression
  const d1 = arr[1]-arr[0];
  const arithmetic = arr.every((_,i)=>(i===0?true:arr[i]-arr[i-1]===d1));
  // Tight cluster: span narrower than ~1/7 of the domain
  const span = arr[arr.length-1]-arr[0];
  const clustered = span <= Math.floor(mainMax/7);
  return fourRun || tripleRun || lowBias || arithmetic || clustered;
}

// --- granular detectors for hint labeling (5-ball sets; works great for Take 5 as well) ---
function hasConsecutiveRun(mains:number[], runLen:number): boolean {
  const a = [...mains].sort((x,y)=>x-y);
  for (let i=runLen-1;i<a.length;i++){
    let ok=true;
    for (let k=1;k<runLen;k++) if (a[i-k]+k!==a[i]) { ok=false; break; }
    if (ok) return true;
  }
  return false;
}
function isArithmeticSequence(mains:number[]): boolean {
  const a=[...mains].sort((x,y)=>x-y);
  const d=a[1]-a[0];
  for (let i=2;i<a.length;i++) if (a[i]-a[i-1]!==d) return false;
  return true;
}
function isBirthdayHeavy(mains:number[]): boolean {
  return mains.filter(n=>n<=31).length >= 4;
}
function isTightlyClustered(mains:number[], domainMax:number): boolean {
  const a=[...mains].sort((x,y)=>x-y);
  const span=a[a.length-1]-a[0];
  return span <= Math.floor(domainMax/7);
}

export function generateTicket(
  rows:LottoRow[],
  game:GameKey,
  opts:{modeMain:'hot'|'cold'; modeSpecial:'hot'|'cold'; alphaMain:number; alphaSpecial:number; avoidCommon:boolean},
  overrideCfg?: { mainMax: number; specialMax: number; mainPick: number }
) {
  const s = computeStats(rows, game, overrideCfg);
  const wMain = buildWeights(s.cfg.mainMax, s.countsMain, opts.modeMain, opts.alphaMain);
  const wSpecial = s.cfg.specialMax>0 ? buildWeights(s.cfg.specialMax, s.countsSpecial, opts.modeSpecial, opts.alphaSpecial) : [];
  let mains:number[]=[]; let special:number|undefined=undefined; let tries=0;
  do {
    mains = weightedSampleDistinct(s.cfg.mainPick, wMain);
    if (s.cfg.specialMax>0) special = weightedSampleDistinct(1, wSpecial)[0];
    tries++; if (tries>50) break;
  } while (opts.avoidCommon && looksTooCommon(mains, game));
  return s.cfg.specialMax>0 ? { mains, special: special! } : { mains };
}

export function ticketHints(game:GameKey, mains:number[], special:number, stats: ReturnType<typeof computeStats>): string[] {
  const hints:string[] = [];
  // Granular pattern tags (always derived from main numbers only)
  const domainMax = stats.cfg.mainMax;
  if (hasConsecutiveRun(mains, 4)) hints.push('4-in-a-row');
  else if (hasConsecutiveRun(mains, 3)) hints.push('3-in-a-row');
  if (isArithmeticSequence(mains)) hints.push('Arithmetic sequence');
  if (isBirthdayHeavy(mains)) hints.push('Birthday-heavy');
  if (isTightlyClustered(mains, domainMax)) hints.push('Tight span');
  // Back-compat umbrella if none of the above but still “too common”
  if (hints.length===0 && looksTooCommon(mains, game)) hints.push('Common pattern');

  const lowCount = mains.filter(n=>(stats.countsMain.get(n)||0) <= 1).length;
  if (lowCount >= 3) hints.push('Cold mains');
  const hotCount = mains.filter(n=> (stats.zMain.get(n)||0) > 1).length;
  if (hotCount >= 3) hints.push('Hot mains');
  if (stats.cfg.specialMax>0 && typeof special === 'number') {
    const specialZ = (stats.zSpecial.get(special)||0);
    if (specialZ > 1) hints.push('Hot special');
    if (specialZ < -1) hints.push('Cold special');
  }
  if (hints.length===0) hints.push('Balanced');
  return hints;
}

// ---------- Digit-game support (Numbers / Win4) ----------
export type DigitRow = { date: string; digits: number[] };

export function computeDigitStats(rows: DigitRow[], k: 3|4) {
  // domain 0..9, repetition allowed
  const counts = new Array(10).fill(0);
  let totalDraws = 0;
  const lastSeen = new Array(10).fill(Infinity);
  const reversed = [...rows].sort((a,b)=>a.date.localeCompare(b.date)).reverse();
  reversed.forEach((r, idx) => {
    if (!Array.isArray(r.digits) || r.digits.length !== k) return;
    totalDraws++;
    r.digits.forEach(d => {
      if (d>=0 && d<=9) {
        counts[d] += 1;
        lastSeen[d] = Math.min(lastSeen[d], idx);
      }
    });
  });
  // Z-scores vs expected = k * totalDraws / 10
  const expected = (k * totalDraws) / 10;
  const p = k / 10;
  const variance = totalDraws * p * (1 - p);
  const sd = Math.max(Math.sqrt(Math.max(variance, 1e-9)), 1e-6);
  const z = counts.map(c => (c - expected)/sd);
  return { counts, lastSeen, totalDraws, k, z };
}

function isPalindrome(d: number[]) { return d.join('') === [...d].reverse().join(''); }
function longestRunLen(d: number[]) {
  let best=1, cur=1;
  for (let i=1;i<d.length;i++){
    if (d[i] === d[i-1]+1 || d[i] === d[i-1]-1) { cur++; best=Math.max(best,cur); }
    else cur=1;
  }
  return best;
}
function multiplicity(d: number[]) {
  const m = new Map<number,number>();
  d.forEach(x => m.set(x,(m.get(x)||0)+1));
  const counts = Array.from(m.values()).sort((a,b)=>b-a);
  return counts[0] ?? 1; // max multiplicity
}
function digitSum(d: number[]) { return d.reduce((a,b)=>a+b,0); }

/**
 * Native digit-game hints (3 or 4 digits). Independent of GameKey.
 * Emits stable labels aligned with HINT_EXPLAIN.
 */
export function ticketHintsDigits(
  digits: number[],
  stats: ReturnType<typeof computeDigitStats>
): string[] {
  const hints: string[] = [];
  if (digits.length !== stats.k) return ['Invalid'];
  const maxMult = multiplicity(digits); // 2=pair, 3=triple, 4=quad
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

// ---------- Pick 10 (10-from-80), behind FEATURES.PICK10 ----------
export type Pick10Row = { date: string; values: number[] }; // 10 numbers, 1..80
export type QuickDrawRow = { date: string; values: number[] }; // 20 numbers, 1..80 (Keno-style)

export function computePick10Stats(rows: Pick10Row[]) {
  const counts = new Map<number, number>();
  const lastSeen = new Map<number, number>();
  for (let n=1;n<=80;n++){counts.set(n,0); lastSeen.set(n,Infinity);}
  const ordered = [...rows].sort((a,b)=>a.date.localeCompare(b.date));
  const reversed = [...ordered].reverse();
  reversed.forEach((r, idx) => {
    const v = (r.values||[]).filter(n=>Number.isFinite(n) && n>=1 && n<=80);
    if (v.length !== 10) return;
    v.forEach(n => {
      counts.set(n, (counts.get(n)||0) + 1);
      lastSeen.set(n, Math.min(lastSeen.get(n)||Infinity, idx));
    });
  });
  const totalDraws = ordered.length;
  const expected = (totalDraws * 10) / 80;
  const p = 10/80;
  const variance = totalDraws * p * (1 - p);
  const sd = Math.max(Math.sqrt(Math.max(variance, 1e-9)), 1e-6);
  const z = new Map<number, number>();
  for (let n=1;n<=80;n++) z.set(n, ((counts.get(n)||0)-expected)/sd);
  return { counts, lastSeen, totalDraws, z };
}

// ---- Quick Draw (Keno-style, 20-from-80) ----
export function computeQuickDrawStats(rows: QuickDrawRow[]) {
  const counts = new Map<number, number>();
  const lastSeen = new Map<number, number>();
  for (let n=1;n<=80;n++){counts.set(n,0); lastSeen.set(n,Infinity);}
  const ordered = [...rows].sort((a,b)=>a.date.localeCompare(b.date));
  const reversed = [...ordered].reverse();
  reversed.forEach((r, idx) => {
    const v = (r.values||[]).filter(n=>Number.isFinite(n) && n>=1 && n<=80);
    if (v.length !== 20) return;
    v.forEach(n => {
      counts.set(n, (counts.get(n)||0) + 1);
      lastSeen.set(n, Math.min(lastSeen.get(n)||Infinity, idx));
    });
  });
  const totalDraws = ordered.length;
  const expected = (totalDraws * 20) / 80;
  const p = 20/80;
  const variance = totalDraws * p * (1 - p);
  const sd = Math.max(Math.sqrt(Math.max(variance, 1e-9)), 1e-6);
  const z = new Map<number, number>();
  for (let n=1;n<=80;n++) z.set(n, ((counts.get(n)||0)-expected)/sd);
  return { counts, lastSeen, totalDraws, z };
}

export function buildPick10Weights(
  stats: ReturnType<typeof computePick10Stats>,
  mode: 'hot'|'cold',
  alpha: number
) {
  // smoothing
  const arr = Array.from({length:80},(_,i)=>stats.counts.get(i+1)||0);
  const total = arr.reduce((a,b)=>a+b,0);
  const avg = total/80;
  const eps = Math.min(1, Math.max(0.1, 0.05*avg));
  const smooth = arr.map(c => c + eps);
  const sum = smooth.reduce((a,b)=>a+b,0);
  const freq = smooth.map(c => c/sum);
  const max = Math.max(...freq);
  const invRaw = freq.map(p => (max - p) + 1e-9);
  const invSum = invRaw.reduce((a,b)=>a+b,0);
  const inv = invRaw.map(x => x/invSum);
  const base = Array(80).fill(1/80);
  const chosen = mode==='hot' ? freq : inv;
  const blended = chosen.map((p,i)=>(1-alpha)*base[i]+alpha*p);
  const s2 = blended.reduce((a,b)=>a+b,0);
  return blended.map(x=>x/s2);
}

// ---------- Quick Draw (Keno-style) ticket generation ----------
export function buildQuickDrawWeights(
  stats: ReturnType<typeof computeQuickDrawStats>,
  mode: 'hot'|'cold',
  alpha: number
): number[] {
  // counts over 1..80 (from 20-of-80 draws)
  const arr = Array.from({length:80}, (_, i) => stats.counts.get(i+1) || 0);

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

export function generateQuickDrawTicket(
  stats: ReturnType<typeof computeQuickDrawStats>,
  spots: 1|2|3|4|5|6|7|8|9|10,
  opts: { mode:'hot'|'cold'; alpha:number }
): number[] {
  const w = buildQuickDrawWeights(stats, opts.mode, opts.alpha);
  // reuse distinct sampler used for Pick 10
  return weightedSampleDistinctFromWeights(spots, w);
}


export function weightedSampleDistinctFromWeights(k:number, weights:number[]): number[] {
  const n = weights.length;
  const picks:number[] = [];
  const available = new Set<number>(Array.from({length:n},(_,i)=>i));
  const w = weights.slice();
  while (picks.length < Math.min(k, n)) {
    let sum = 0; for (const i of available) sum += w[i];
    let r = Math.random()*sum, acc=0, chosen=-1;
    for (const i of available) { acc+=w[i]; if (acc>=r){chosen=i;break;} }
    if (chosen<0) break;
    picks.push(chosen+1);
    available.delete(chosen);
  }
  return picks.sort((a,b)=>a-b);
}

export function generatePick10Ticket(
  stats: ReturnType<typeof computePick10Stats>,
  opts: { mode:'hot'|'cold'; alpha:number }
) {
  const w = buildPick10Weights(stats, opts.mode, opts.alpha);
  return weightedSampleDistinctFromWeights(10, w);
}

/** Recommend weighting for Quick Draw (20-from-80). */
export function recommendQuickDrawFromStats(
  stats: ReturnType<typeof computeQuickDrawStats>
): WeightingRec {
  const counts = Array.from({length:80},(_,i)=> stats.counts.get(i+1) || 0);
  const cv = coefVar(counts);
  let rec: WeightingRec;
  if (cv >= 0.18) rec = { mode: 'hot',  alpha: 0.64 };
  else if (cv <= 0.10) rec = { mode: 'cold', alpha: 0.54 };
  else rec = { mode: 'hot', alpha: 0.60 };
  rec.alpha = clampAlphaGeneric(rec.alpha, stats.totalDraws, 80, 0.50, 0.70);
  return rec;
}

export function ticketHintsPick10(values:number[], stats: ReturnType<typeof computePick10Stats>) {
  const hints:string[] = [];
  if (!Array.isArray(values) || values.length!==10) return ['Invalid'];
  const a = [...values].sort((x,y)=>x-y);
  // pattern-style hints similar to 5-ball, tuned for larger k
  const span = a[a.length-1] - a[0];
  if (span <= 80/10) hints.push('Tight span');
  const run3 = a.some((_,i)=> i>=2 && a[i-2]+2===a[i-1]+1 && a[i-1]+1===a[i]);
  if (run3) hints.push('3-in-a-row');
  const bday = a.filter(n=>n<=31).length >= 6; // 6+ of first 31 is pretty birthday-heavy at k=10
  if (bday) hints.push('Birthday-heavy');
  // hot/cold mains by z
  const hot = a.filter(n => (stats.z.get(n)||0) > 1).length;
  const cold= a.filter(n => (stats.z.get(n)||0) < -1).length;
  if (hot >= 5) hints.push('Hot mains');    // half or more
  if (cold>= 5) hints.push('Cold mains');
  if (hints.length===0) hints.push('Balanced');
  return hints;
}

export function coefVar(values:number[]): number {
  const n = values.length; if (n===0) return 0;
  const mean = values.reduce((a,b)=>a+b,0)/n;
  const varr = values.reduce((a,b)=>a+(b-mean)*(b-mean),0)/n;
  return mean===0?0:Math.sqrt(varr)/mean;
}

export function recommendFromDispersion(cv:number, domain:'main'|'special'):{mode:'hot'|'cold';alpha:number} {
  if (domain==='special') {
    if (cv>=0.30) return { mode:'hot', alpha:0.70 };
    if (cv<=0.18) return { mode:'cold', alpha:0.55 };
    return { mode:'hot', alpha:0.60 };
  } else {
    if (cv>=0.25) return { mode:'hot', alpha:0.65 };
    if (cv<=0.15) return { mode:'cold', alpha:0.55 };
    return { mode:'hot', alpha:0.60 };
  }
}

// ---------- NEW: recommendations for Digit games (Pick 3 / Pick 4) ----------
export type WeightingRec = { mode:'hot'|'cold'; alpha:number };

/** Clamp alpha for non-era domains where we don't have (mainMax,specialMax) */
function clampAlphaGeneric(
  alpha:number,
  draws:number,
  domainSize:number,
  lo:number,
  hi:number
): number {
  let hi2 = hi;
  if (draws < domainSize) hi2 = Math.max(lo, hi - 0.10);
  return Math.min(hi2, Math.max(lo, alpha));
}

/** Recommend weighting for digits (domain 0–9, with replacement). */
export function recommendDigitsFromStats(
  stats: ReturnType<typeof computeDigitStats>
): WeightingRec {
  const counts = stats.counts.slice(); // length 10
  const cv = coefVar(counts);
  let rec: WeightingRec;
  if (cv >= 0.18) rec = { mode: 'hot',  alpha: 0.60 };
  else if (cv <= 0.10) rec = { mode: 'cold', alpha: 0.50 };
  else rec = { mode: 'hot', alpha: 0.55 };
  rec.alpha = clampAlphaGeneric(rec.alpha, stats.totalDraws, 10, 0.45, 0.65);
  return rec;
}

// ---------- NEW: recommendations for Pick 10 (10-from-80) ----------
/** Recommend weighting for Pick 10 (10-from-80). */
export function recommendPick10FromStats(
  stats: ReturnType<typeof computePick10Stats>
): WeightingRec {
  const counts = Array.from({length:80},(_,i)=> stats.counts.get(i+1) || 0);
  const cv = coefVar(counts);
  let rec: WeightingRec;
  if (cv >= 0.22) rec = { mode: 'hot',  alpha: 0.65 };
  else if (cv <= 0.12) rec = { mode: 'cold', alpha: 0.55 };
  else rec = { mode: 'hot', alpha: 0.60 };
  rec.alpha = clampAlphaGeneric(rec.alpha, stats.totalDraws, 80, 0.50, 0.70);
  return rec;
}

function clampAlphaFor(game:GameKey, domain:'main'|'special', alpha:number, draws:number): number {
  const era = getCurrentEraConfig(game);
  let lo = 0.5, hi = 0.75;
  if (domain==='main') {
    if (era.mainMax <= 45) { lo = 0.40; hi = 0.70; }  // Fantasy 5
    else { lo = 0.50; hi = 0.75; }                    // PB/MM/C4L
  } else {
    if (era.specialMax <= 5) { lo = 0.35; hi = 0.65; } // C4L: tiny domain, keep conservative
    else { lo = 0.45; hi = 0.75; }                     // PB/MM
  }
  // Early-era guard: before ~one full domain of draws, avoid very spiky alphas
  if (draws < era.mainMax) { hi = Math.max(lo, hi - 0.10); }
  return Math.min(hi, Math.max(lo, alpha));
}

export function analyzeGame(rows:LottoRow[], game:GameKey) {
  // Always analyze the CURRENT era only
  const era = getCurrentEraConfig(game);
  const filtered = filterRowsForCurrentEra(rows, game);
  const s = computeStats(filtered, game, era);

  const mainCounts = Array.from({length:s.cfg.mainMax},(_,i)=> s.countsMain.get(i+1) || 0);
  const specialCounts = s.cfg.specialMax>0 ? Array.from({length:s.cfg.specialMax},(_,i)=> s.countsSpecial.get(i+1) || 0) : [];
  const cvMain = coefVar(mainCounts);
  const cvSpec = s.cfg.specialMax>0 ? coefVar(specialCounts) : 0;
  const recencyHotFracMain = (()=>{ const threshold=10; let hot=0; for (let i=1;i<=s.cfg.mainMax;i++) if ((s.lastSeenMain.get(i)||Infinity)<=threshold) hot++; return hot/s.cfg.mainMax; })();
  const recencyHotFracSpec = s.cfg.specialMax>0 ? (()=>{ const threshold=10; let hot=0; for (let i=1;i<=s.cfg.specialMax;i++) if ((s.lastSeenSpecial.get(i)||Infinity)<=threshold) hot++; return hot/s.cfg.specialMax; })() : 0;
  const recMain0 = recommendFromDispersion(cvMain, 'main');
  const recSpec0 = s.cfg.specialMax>0 ? recommendFromDispersion(cvSpec,'special') : { mode:'hot' as const, alpha:0.60 };
  const recMain = { ...recMain0, alpha: clampAlphaFor(game, 'main', recMain0.alpha, s.totalDraws) };
  const recSpec = s.cfg.specialMax>0 ? { ...recSpec0, alpha: clampAlphaFor(game, 'special', recSpec0.alpha, s.totalDraws) } : recSpec0;

  return {
    game,
    draws: s.totalDraws,
    cvMain, cvSpec,
    recencyHotFracMain, recencyHotFracSpec,
    recMain, recSpec,
    eraStart: era.start,
    eraCfg: { mainMax: era.mainMax, specialMax: era.specialMax, mainPick: era.mainPick, label: era.label, description: era.description }
  };
}

// ---- Jackpot odds (exact, era-aware) ---------------------------------------
export function nCk(n:number,k:number): number {
  if (k<0 || k>n) return 0;
  k = Math.min(k, n-k);
  let num=1, den=1;
  for (let i=1;i<=k;i++){ num *= (n - (k - i)); den *= i; }
  return Math.round(num/den);
}
export function jackpotOdds(game:GameKey): number {
  const era = getCurrentEraConfig(game);
  const mains = nCk(era.mainMax, era.mainPick);
  const specials = Math.max(era.specialMax, 1);
  return mains * specials; // “1 in <return value>”
}

// ---- NEW: Odds for logical NY games that aren’t 5+special ----
export function jackpotOddsForLogical(logical: LogicalGameKey): number | null {
  switch (logical) {
    case 'ny_take5':
      // reuse canonical era-aware odds
      return jackpotOdds('ny_take5');
    case 'ny_numbers':
      // straight (exact order) odds for 3 digits (0..9, with replacement)
      return Math.pow(10, 3); // 1 in 1000
    case 'ny_win4':
      return Math.pow(10, 4); // 1 in 10,000
    case 'ny_pick10':
      // Player picks 10; draw is 20 of 80. Jackpot = hit all 10.
      // Probability = C(20,10) / C(80,10)  → odds = 1 / that = C(80,10) / C(20,10)
      return Math.round(nCk(80,10) / nCk(20,10));
    case 'ny_lotto':
      // NY Lotto is a 6-from-59 game (bonus ball used for 2nd prize only).
      // Jackpot odds = C(59,6)
      return nCk(59, 6);
    case 'ny_quick_draw':
      // Needs a spots parameter; leave null here (UI supplies a spots-aware odds below).
      return null;
    // multi_* already use jackpotOdds(game) elsewhere
    default:
      return null;
  }
}

// ---------- NY Lotto: extended rows (6 mains + bonus) for Past Draws ----------
export type NyLottoExtendedRow = { date: string; mains: number[]; bonus: number };
export async function fetchNyLottoExtendedRows(): Promise<NyLottoExtendedRow[]> {
  const url = apiPathForUnderlying('ny_nylotto');
  const res = await fetch(url, { cache: 'no-store', next: { revalidate: 0 } as any });
  if (!res.ok) return [];
  const csv = await res.text();
  const flex = parseFlexibleCsv(csv); // ascending
  return flex.map(fr => {
    const vals = fr.values.filter(Number.isFinite).map(Number);
    const mains = vals.slice(0, 6);
    const bonus = Number.isFinite(fr.special) ? (fr.special as number) : (Number.isFinite(vals[6]) ? vals[6] : NaN);
    return (mains.length === 6 && Number.isFinite(bonus))
      ? { date: fr.date, mains, bonus: bonus as number }
      : null;
  }).filter(Boolean) as NyLottoExtendedRow[];
}

// Spots-aware odds for Quick Draw (hit-all top prize)
export function jackpotOddsQuickDraw(spots: 1|2|3|4|5|6|7|8|9|10): number {
  // Odds = C(80,spots) / C(20,spots)
  return Math.round(nCk(80, spots) / nCk(20, spots));
}

// ---- Fetchers ----
export async function fetchQuickDrawRowsFor(
  logical: 'ny_quick_draw'
): Promise<QuickDrawRow[]> {
  const keys = underlyingKeysFor(logical, 'both');
  const parts = await Promise.all(
    keys.map(async (k) => {
      const url = apiPathForUnderlying(k as UnderlyingKey);
      const res = await fetch(url, { cache: 'no-store', next: { revalidate: 0 } as any });
      if (!res.ok) return [] as QuickDrawRow[];
      const csv = await res.text();
      const flex = parseFlexibleCsv(csv); // ascending by date
      return flex
        .map(fr => {
          const vals = fr.values.filter(n=>Number.isFinite(n) && n>=1 && n<=80).slice(0, 20);
          return vals.length === 20 ? ({ date: fr.date, values: vals } as QuickDrawRow) : null;
        })
        .filter(Boolean) as QuickDrawRow[];
    })
  );
  const merged = ([] as QuickDrawRow[]).concat(...parts);
  return merged.sort((a,b)=>a.date.localeCompare(b.date));
}
