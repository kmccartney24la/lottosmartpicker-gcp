export type GameKey = 'powerball' | 'megamillions' | 'ga_cash4life' | 'ga_fantasy5';

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
   // bump "v1" if you change the structure
   return `lsp.cache.v1.${game}`;
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
   const { game, since, until, latestOnly, token } = options;
   const era = getCurrentEraConfig(game);
   if (!latestOnly) {
     const env = readCache(game);
     if (env && env.eraStart === era.start && isCacheFresh(env)) {
       return filterRowsForCurrentEra(env.rows, game);
     }
   }
   // fetch fresh
  let rows: LottoRow[] = [];
  let usedCanonical = false;

  try {
    const all = await fetchCanonical(game);   // ✅ canonical first
    rows = applyFilters(all, { since, until, latestOnly });
    usedCanonical = true;
  } catch {
    // fallback to existing path (Socrata/adapter)
    rows = await fetchNY({ game, since, until, latestOnly, token });
  }
   // store (only if not latestOnly)
   if (!latestOnly) writeCache(game, rows, era.start);
   return filterRowsForCurrentEra(rows, game);
 }

export const SOCRATA_BASE = 'https://data.ny.gov/resource';
export const DATASETS: Record<Exclude<GameKey,'ga_fantasy5'>, { id: string; dateField: string; winningField: string; specialField?: string }> = {
  powerball:    { id: 'd6yy-54nr', dateField: 'draw_date', winningField: 'winning_numbers' },
  megamillions: { id: '5xaw-6ayf', dateField: 'draw_date', winningField: 'winning_numbers', specialField: 'mega_ball' },
  ga_cash4life: { id: 'kwxv-fwze', dateField: 'draw_date', winningField: 'winning_numbers', specialField: 'cash_ball' }, // NY Open Data Cash4Life

};

export const DRAW_DOWS: Record<GameKey, Set<number>> = {
  powerball: new Set([1, 3, 6]),
  megamillions: new Set([2, 5]),
  ga_cash4life: new Set([0,1,2,3,4,5,6]), // daily 9:00 p.m. ET
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

export const CURRENT_ERA: Record<GameKey, EraConfig> = {
  powerball: {
    start: '2015-10-07',
    mainMax: 69,
    specialMax: 26,
    mainPick: 5,
    label: '5/69 + 1/26',
    description:
      'Powerball’s current matrix took effect on Oct 7, 2015: 5 mains from 1–69 and Powerball 1–26 (changed from 59/35).',
  },
  megamillions: {
    start: '2025-04-08',
    mainMax: 70,
    specialMax: 24,
    mainPick: 5,
    label: '5/70 + 1/24',
    description:
      'Mega Millions’ current matrix took effect on Apr 8, 2025: 5 mains from 1–70 and Mega Ball 1–24 (reduced from 25).',
  },
  ga_cash4life: {
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
  const name = game === 'powerball' ? 'Powerball'
              : game === 'megamillions' ? 'Mega Millions'
              : game === 'ga_cash4life' ? 'Cash4Life (GA)'
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
  return rows
    .map((r) => {
      const draw_date: string = r.draw_date ?? r.date ?? r.drawDate ?? '';
      const mains: number[] =
        Array.isArray(r.mains) && r.mains.length
          ? r.mains.map((n: any) => Number(n)).filter(Number.isFinite)
          : [r.n1, r.n2, r.n3, r.n4, r.n5]
              .map((n: any) => Number(n))
              .filter(Number.isFinite);

      const specialRaw = r.special ?? r.special_ball ?? r.pb ?? r.mb ?? undefined;
      const special = specialRaw !== undefined && specialRaw !== null ? Number(specialRaw) : undefined;

      return { ...(r as any), draw_date, mains, special } as LottoRow;
    })
    .filter((r) => r.draw_date && r.mains?.length >= 5);
}

/* ---------------- Data fetching/parsing ---------------- */

export function parseTokens(s: string): number[] {
  return s.replace(/,/g,' ').replace(/-/g,' ').split(/\s+/).filter(Boolean).map(t=>parseInt(t,10)).filter(n=>Number.isFinite(n));
}

export async function fetchNY(options: {
  game: GameKey; since?: string; until?: string; latestOnly?: boolean; token?: string;
}): Promise<LottoRow[]> {
  const { game, since, until, latestOnly, token } = options;
  if (game === 'ga_fantasy5') {
    return fetchGAFantasy5CSV({ since, until, latestOnly });
  }
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
    // For 5+special games, special is required; for Fantasy 5 we never route here.
    if (special == null) continue;
    const [n1,n2,n3,n4,n5] = nums;
    out.push({ game, date, n1,n2,n3,n4,n5, special });
  }
  return out;
}

// ---- Fantasy 5 CSV adapter (server-safe) ----
async function fetchGAFantasy5CSV(opts: { since?: string; until?: string; latestOnly?: boolean }): Promise<LottoRow[]> {
  const isServer = typeof window === 'undefined';
  let text: string;

  if (isServer) {
    // Prefer a true absolute URL in server runtime (R2 in prod)
    const remote =
      process.env.GA_FANTASY5_REMOTE_CSV_URL ||
      process.env.NEXT_PUBLIC_GA_FANTASY5_CSV_URL;

    if (remote && remote.trim().length > 0) {
      const res = await fetch(remote, { cache: 'no-store' });
      if (!res.ok) throw new Error(`GA Fantasy 5 CSV ${res.status}: ${await res.text()}`);
      text = await res.text();
    } else {
      // Fall back to reading the local seed file from /public in dev
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const file = path.join(process.cwd(), 'public', 'data', 'ga', 'fantasy5.csv');
      try {
        text = await fs.readFile(file, 'utf8');
      } catch {
        throw new Error('GA Fantasy 5 CSV not found locally and no remote URL configured');
      }
    }
  } else {
    // Browser bundle: relative asset works fine
    const publicUrl = process.env.NEXT_PUBLIC_GA_FANTASY5_CSV_URL;
    const url = (publicUrl && publicUrl.trim().length > 0) ? publicUrl : '/data/ga/fantasy5.csv';
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`GA Fantasy 5 CSV ${res.status}: ${await res.text()}`);
    text = await res.text();
  }

  // Expected headers: draw_date,m1,m2,m3,m4,m5
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  const header = lines.shift() || '';
  const cols = header.split(',').map(s=>s.trim().toLowerCase());
  const idx = (name:string)=> cols.indexOf(name);
  const iDate = idx('draw_date'); const i1 = idx('m1'), i2 = idx('m2'), i3 = idx('m3'), i4 = idx('m4'), i5 = idx('m5');
  if ([iDate,i1,i2,i3,i4,i5].some(i=>i<0)) throw new Error('GA Fantasy 5 CSV: missing headers');

  const all: LottoRow[] = [];
  for (const line of lines) {
    const t = line.split(',').map(s=>s.trim());
    if (t.length < 6) continue;
    const d = new Date(t[iDate]); if (isNaN(+d)) continue;
    const date = d.toISOString().slice(0,10);
    const nums = [t[i1],t[i2],t[i3],t[i4],t[i5]].map(v=>parseInt(v,10));
    if (nums.some(n => !Number.isFinite(n))) continue;
    if (nums.some(n => n < 1 || n > 42)) continue; // 1..42 domain
    const [n1,n2,n3,n4,n5] = nums;
    all.push({ game:'ga_fantasy5', date, n1,n2,n3,n4,n5, special: undefined });
  }

  if (opts.latestOnly) return all.slice(-1);
  const where = buildWhere('draw_date', opts.since, opts.until);
  if (!where) return all;

  const since = opts.since ? new Date(opts.since) : undefined;
  const until = opts.until ? new Date(opts.until) : undefined;
  return all.filter(r=>{
    const d = new Date(r.date);
    if (since && d < since) return false;
    if (until) { const end = new Date(until); end.setDate(end.getDate()+1); if (d >= end) return false; }
    return true;
  });
}

// ---- Canonical CSV (R2 via Next API proxies) ----

// Parse canonical CSV: game,draw_date,m1,m2,m3,m4,m5,special,special_name
function parseCanonicalCsv(csv: string, gameDefault: GameKey): LottoRow[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length === 0) return [];
  const header = lines.shift()!;
  const cols = header.split(',').map(s => s.trim().toLowerCase());
  const idx = (name: string) => cols.indexOf(name);

  const iGame = idx('game');
  const iDate = idx('draw_date');
  const i1 = idx('m1'), i2 = idx('m2'), i3 = idx('m3'), i4 = idx('m4'), i5 = idx('m5');
  const iSpec = idx('special');

  const out: LottoRow[] = [];
  for (const line of lines) {
    const t = line.split(',').map(s => s.trim());
    if (t.length < 6) continue;

    const game = (iGame >= 0 && t[iGame]) ? (t[iGame] as GameKey) : gameDefault;

    const d = iDate >= 0 ? new Date(t[iDate]) : new Date(NaN);
    if (Number.isNaN(d.getTime())) continue;
    const date = d.toISOString().slice(0, 10);

    const nums = [t[i1], t[i2], t[i3], t[i4], t[i5]]
      .map(v => parseInt(v, 10));
    if (nums.some(n => !Number.isFinite(n))) continue;

    const special =
      iSpec >= 0 && t[iSpec] !== '' && t[iSpec] != null
        ? parseInt(t[iSpec], 10)
        : undefined;

    const [n1, n2, n3, n4, n5] = nums;
    out.push({ game, date, n1, n2, n3, n4, n5, special });
  }
  return out;
}

function canonicalUrlFor(game: GameKey): string | null {
  if (game === 'powerball') return '/api/multi/powerball';
  if (game === 'megamillions') return '/api/multi/megamillions';
  if (game === 'ga_cash4life') return '/api/ga/cash4life';
  if (game === 'ga_fantasy5') return '/api/ga/fantasy5';
  return null;
}

async function fetchCanonical(game: GameKey): Promise<LottoRow[]> {
  const url =
    game === 'powerball' ? '/api/multi/powerball' :
    game === 'megamillions' ? '/api/multi/megamillions' :
    game === 'ga_cash4life' ? '/api/ga/cash4life' :
    game === 'ga_fantasy5' ? '/api/ga/fantasy5' :
    null;

  if (!url) throw new Error(`No canonical route for ${game}`);
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Canonical ${game} ${res.status}`);
  const text = await res.text();
  return parseCanonicalCsv(text, game); // <-- default game if CSV lacks it
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
  if (game === 'powerball') return 'Mon/Wed/Sat';
  if (game === 'megamillions') return 'Tue/Fri';
  if (game === 'ga_cash4life') return 'Daily · 9:00 PM ET';
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
      if (game==='ga_cash4life') return `${names[dow]} 9:00 PM ET`;
      if (game==='ga_fantasy5')  return `${names[dow]} 11:34 PM ET`;
      return `${names[dow]} ≈11:00 PM ET`;
    }
  }
  if (game === 'powerball') return 'Mon/Wed/Sat ≈11:00 PM ET';
  if (game === 'megamillions') return 'Tue/Fri ≈11:00 PM ET';
  if (game === 'ga_cash4life') return 'Daily 9:00 PM ET';
  return 'Daily 11:34 PM ET';
}

/* ---------------- Stats / weighting ---------------- */

export function computeStats(
  rows: LottoRow[],
  game: GameKey,
  overrideCfg?: { mainMax: number; specialMax: number; mainPick: number }
) {
  // Use override if provided (e.g., current era), else legacy default.
  const cfg = overrideCfg
    ? overrideCfg
    : (game === 'powerball' ? { mainMax:69, specialMax:26, mainPick:5 } : { mainMax:70, specialMax:25, mainPick:5 });

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
  const arr = Array.from({length:domainMax},(_,i)=>counts.get(i+1)||0);
  const total = arr.reduce((a,b)=>a+b,0);
  const freq = total>0 ? arr.map(c=>c/total) : arr.map(()=>1/domainMax);
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
  const mainMax = game==='powerball'?69:70; // current-era main domains
  const consecutive = mains.some((_,i)=> i>=2 && mains[i-2]+2===mains[i-1]+1 && mains[i-1]+1===mains[i]);
  const lowBias = mains.filter(n=>n<=31).length >= 4;
  const d1 = mains[1]-mains[0];
  const arithmetic = mains.every((n,i)=>(i===0?true:mains[i]-mains[i-1]===d1));
  const clustered = mains[mains.length-1]-mains[0] <= Math.floor(mainMax/6);
  return consecutive || lowBias || arithmetic || clustered;
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
  if (common) hints.push('Pattern looks common');
  const lowCount = mains.filter(n=>(stats.countsMain.get(n)||0) <= 1).length;
  if (lowCount >= 3) hints.push('Uncommon mix (many rare mains)');
  const hotCount = mains.filter(n=> (stats.zMain.get(n)||0) > 1).length;
  if (hotCount >= 3) hints.push('Hot-heavy mains');
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
  const recMain = recommendFromDispersion(cvMain, 'main');
  const recSpec = s.cfg.specialMax>0 ? recommendFromDispersion(cvSpec, 'special') : { mode:'hot' as const, alpha:0.60 }; // neutral default

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
