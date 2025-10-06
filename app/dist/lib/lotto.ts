// lib/lotto.ts
// Stable game keys (target convention)
 export type GameKey =
   | 'multi_powerball'
   | 'multi_megamillions'
   | 'multi_cash4life'
   | 'ga_fantasy5'
   | 'ga_scratchers';

const isMultiGame = (g: GameKey) =>
  g === 'multi_powerball' || g === 'multi_megamillions' || g === 'multi_cash4life';

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
};

export function apiPathForGame(game: GameKey): string {
  const p = GAME_TO_API_PATH[game];
  if (!p) throw new Error(`Unknown game key: ${game}`);
  return p;
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
export const DATASETS: Record<Exclude<GameKey,'ga_fantasy5'|'ga_scratchers'>, { id: string; dateField: string; winningField: string; specialField?: string }> = {
  multi_powerball:    { id: 'd6yy-54nr', dateField: 'draw_date', winningField: 'winning_numbers' },
  multi_megamillions: { id: '5xaw-6ayf', dateField: 'draw_date', winningField: 'winning_numbers', specialField: 'mega_ball' },
  multi_cash4life: { id: 'kwxv-fwze', dateField: 'draw_date', winningField: 'winning_numbers', specialField: 'cash_ball' }, // NY Open Data Cash4Life

};

export const DRAW_DOWS: Record<Exclude<GameKey,'ga_scratchers'>, Set<number>> = {
  multi_powerball: new Set([1, 3, 6]),
  multi_megamillions: new Set([2, 5]),
  multi_cash4life: new Set([0,1,2,3,4,5,6]), // daily 9:00 p.m. ET
  ga_fantasy5:  new Set([0,1,2,3,4,5,6]), // daily 11:34 p.m. ET
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

export const CURRENT_ERA: Record<Exclude<GameKey,'ga_scratchers'>, EraConfig> = {
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
    start: '2014-07-01', // conservative lower bound; matrix unchanged since launch in 2014 per NY Open Data
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
};

export function getCurrentEraConfig(game: GameKey): EraConfig {
  return CURRENT_ERA[game];
}

export function filterRowsForCurrentEra(rows: LottoRow[], game: GameKey): LottoRow[] {
  const era = CURRENT_ERA[game];
  return rows.filter(r => r.game === game && r.date >= era.start);
}

export function eraTooltipFor(game: GameKey): string {
  const era = CURRENT_ERA[game];
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
    g === 'multi_powerball' || g === 'multi_megamillions' || g === 'multi_cash4life' || g === 'ga_fantasy5';

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
  const dows = DRAW_DOWS[game];
  const { dow, hour, minute } = getNYParts();
  const inStartDay = dows.has(dow) && (hour > WINDOW_START.h || (hour === WINDOW_START.h && minute >= WINDOW_START.m));
  const prevDow = (dow + 6) % 7;
  const inAfterMidnight = dows.has(prevDow) && (hour < WINDOW_END.h || (hour === WINDOW_END.h && minute <= WINDOW_END.m));
  return inStartDay || inAfterMidnight;
}

export function nextDrawLabelNYFor(game: GameKey): string {
  const names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const target = DRAW_DOWS[game];
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
    const mains=[d.n1,d.n2,d.n3,d.n4,d.n5];
    mains.forEach(m=>{countsMain.set(m,(countsMain.get(m)||0)+1); lastSeenMain.set(m, Math.min(lastSeenMain.get(m)||Infinity, idx));});
    if (cfg.specialMax > 0 && typeof d.special === 'number') {
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
  const common = looksTooCommon(mains, game);
  if (common) hints.push('Common pattern');
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
function nCk(n:number,k:number): number {
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
