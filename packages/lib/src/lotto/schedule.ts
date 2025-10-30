// packages/lib/src/lotto/schedule.ts
import type { GameKey, LogicalGameKey, ScheduleGame } from './types.js';

/** Days-of-week sets for scheduling; 0=Sun..6=Sat. */
export const DRAW_DOWS: Record<ScheduleGame, Set<number>> = {
  multi_powerball: new Set([1, 3, 6]),
  multi_megamillions: new Set([2, 5]),
  multi_cash4life: new Set([0, 1, 2, 3, 4, 5, 6]), // daily 9:00 p.m. ET
  ca_superlotto_plus: new Set([3, 6]),             // Wed & Sat
  ca_fantasy5:  new Set([0, 1, 2, 3, 4, 5, 6]),
  ga_fantasy5:  new Set([0, 1, 2, 3, 4, 5, 6]),    // daily 11:34 p.m. ET
  fl_fantasy5:  new Set([0, 1, 2, 3, 4, 5, 6]),
  ny_take5:     new Set([0, 1, 2, 3, 4, 5, 6]),    // treat as "daily" (twice daily in UI)
  tx_texas_two_step: new Set([1, 4]),              // every Monday and Thursday at 10:12 p.m. CT.
};

// ---- Internal schedule selector (logical -> scheduling family) ----
function getScheduleGame(game: GameKey | LogicalGameKey): ScheduleGame {
  if (
    game === 'multi_powerball' ||
    game === 'multi_megamillions' ||
    game === 'multi_cash4life' ||
    game === 'ga_fantasy5' ||
    game === 'fl_fantasy5' ||
    game === 'ca_superlotto_plus' ||
    game === 'ca_fantasy5'
  ) {
    return game === 'fl_fantasy5' ? 'fl_fantasy5' : game;
  }
  // Jurisdictional fallback for “daily” schedule family:
  //  - FL keys → use fl_fantasy5 daily semantics (twice daily in UI)
  //  - CA keys → use ca_fantasy5 daily semantics
  //  - Otherwise → use ny_take5 daily semantics (twice daily in UI)
  const s = String(game);
  if (s.startsWith('fl_')) return 'fl_fantasy5';
  if (s.startsWith('ca_')) return 'ca_fantasy5';
  return 'ny_take5';
}

/** Local timezone identifiers used by draw-time formatting. */
type TZ = 'America/New_York' | 'America/Los_Angeles' | 'America/Chicago';

const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Per-game local draw time + timezone (local clock of the jurisdiction). */
const GAME_TIME_INFO: Record<ScheduleGame, { tz: TZ; hour: number; minute: number; approx?: boolean }> = {
  // Multi
  multi_powerball:    { tz: 'America/New_York', hour: 23, minute: 0, approx: true }, // ≈11:00 PM ET
  multi_megamillions: { tz: 'America/New_York', hour: 23, minute: 0, approx: true }, // ≈11:00 PM ET
  multi_cash4life:    { tz: 'America/New_York', hour: 21, minute: 0 },               // 9:00 PM ET

  // Georgia
  ga_fantasy5:        { tz: 'America/New_York', hour: 23, minute: 34 },              // 11:34 PM ET

  // California
  ca_superlotto_plus: { tz: 'America/Los_Angeles', hour: 19, minute: 45, approx: true }, // ≈7:45 PM PT
  ca_fantasy5:        { tz: 'America/Los_Angeles', hour: 18, minute: 30 },               // 6:30 PM PT

  // Logical daily reps
  fl_fantasy5:        { tz: 'America/New_York', hour: 23, minute: 0, approx: true },     // evening rep
  ny_take5:           { tz: 'America/New_York', hour: 23, minute: 0, approx: true },     // evening rep

  // Texas
  tx_texas_two_step:  { tz: 'America/Chicago', hour: 22, minute: 2, approx: true},
};

// ---------- Additional coverage for games not in ScheduleGame ----------
// Weekly (or daily single) games that aren’t represented by ScheduleGame.
// We include best-effort local-time approximations; times are used for labels and a ±90m window.
// DOWs use 0=Sun..6=Sat.
const WEEKLY_CUSTOM: Partial<Record<GameKey | LogicalGameKey, {
  dows: number[];
  tz: TZ;
  hour: number;
  minute: number;
  approx?: boolean;
}>> = {
  // ---- New York ----
  ny_lotto: { dows:[3,6], tz:'America/New_York', hour:20, minute:15, approx:true }, // Wed/Sat ≈8:15 PM ET
  ny_pick10:{ dows:[0,1,2,3,4,5,6], tz:'America/New_York', hour:20, minute:0, approx:true }, // Daily ≈8:00 PM ET

  // ---- Florida ----
  fl_lotto:                { dows:[3,6], tz:'America/New_York', hour:23, minute:15, approx:true }, // Wed/Sat ≈11:15 PM ET
  fl_jackpot_triple_play:  { dows:[2,5], tz:'America/New_York', hour:23, minute:15, approx:true }, // Tue/Fri ≈11:15 PM ET

  // ---- Texas (Central Time) ----
  // Local draws are ≈10:12 PM CT; store as local time in America/Chicago.
  tx_lotto_texas:    { dows:[3,6], tz:'America/Chicago', hour:22, minute:12, approx:true }, // Wed/Sat ≈10:12 PM CT
  tx_texas_two_step: { dows:[1,4], tz:'America/Chicago', hour:22, minute:12, approx:true }, // Mon/Thu ≈10:12 PM CT
  tx_cash5:          { dows:[1,2,3,4,5,6], tz:'America/Chicago', hour:22, minute:12, approx:true }, // Mon–Sat ≈10:12 PM CT
};

// Export a Set of keys to avoid duplicating this list elsewhere.
export const WEEKLY_CUSTOM_KEYS: ReadonlySet<GameKey | LogicalGameKey> =
  new Set(Object.keys(WEEKLY_CUSTOM) as (GameKey | LogicalGameKey)[]);

// ---------- Internals: timezone helpers ----------
// Deterministic abbreviation (no Intl-dependent surprises)
function tzAbbrev(tz: TZ): 'ET' | 'PT' | 'CT' {
  switch (tz) {
    case 'America/New_York':    return 'ET';
    case 'America/Los_Angeles': return 'PT';
    case 'America/Chicago':     return 'CT';
  }
}

function getLocalParts(tz: TZ, d = new Date()): { dow: number; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  const parts = fmt.formatToParts(d);
  const m: Record<string, string> = {};
  for (const p of parts) if (p.type !== 'literal') m[p.type] = p.value;
  const weekMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = weekMap[m.weekday as keyof typeof weekMap] ?? 0;
  return { dow, hour: parseInt(m.hour ?? '0', 10), minute: parseInt(m.minute ?? '0', 10) };
}

function formatTimeLabel(
  tz: TZ,
  hour: number,
  minute: number,
  approx: boolean | undefined,
  base: Date
): string {
  const d = new Date(base);
  d.setHours(hour, minute, 0, 0);
  const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
  const timeStr = timeFmt.format(d);
  const tzStr = tzAbbrev(tz);
  return (approx ? `≈${timeStr}` : timeStr) + ` ${tzStr}`;
}

function dayPatternFor(sched: Set<number>): string {
  if (sched.size === 7) return 'Daily';
  // Show days in Mon..Sun order to match typical lotto phrasing
  const order = [1, 2, 3, 4, 5, 6, 0];
  const parts = order.filter(d => sched.has(d)).map(d => DOW_NAMES[d]);
  return parts.join('/');
}

// ---------- Public schedule helpers ----------

/** Human-friendly schedule label derived from DRAW_DOWS + GAME_TIME_INFO. */
export function drawNightsLabel(game: GameKey | LogicalGameKey, now = new Date()): string {
  // ---- Multi-draw families shown as frequencies rather than a single time ----
  // 2x daily (midday + evening)
  if (
    game === 'ny_take5'  || game === 'ny_numbers' || game === 'ny_win4' ||
    game === 'fl_fantasy5' || game === 'fl_pick5' || game === 'fl_pick4' || game === 'fl_pick3' || game === 'fl_pick2' ||
    game === 'ca_daily3'
  ) {
    return 'Daily · Midday & Evening';
  }
  // 4x daily (TX)
  if (game === 'tx_all_or_nothing' || game === 'tx_pick3' || game === 'tx_daily4') {
    return '4x Daily · Morning/Day/Evening/Night';
  }
  // 5x daily (FL Cash Pop)
  if (game === 'fl_cashpop') {
    return '5x Daily · Morning/Matinee/Afternoon/Evening/Late Night';
  }

  // ---- Weekly / single-daily customs not covered by ScheduleGame ----
  const custom = WEEKLY_CUSTOM[game];
  if (custom) {
    const dayPart = dayPatternFor(new Set(custom.dows));
    const t = formatTimeLabel(custom.tz, custom.hour, custom.minute, custom.approx, now);
    return `${dayPart} · ${t}`;
  }

  const schedKey = getScheduleGame(game);
  const sched = DRAW_DOWS[schedKey];
  const info  = GAME_TIME_INFO[schedKey];

  // Fallbacks (shouldn’t happen if sched/info are maintained together)
  if (!sched && !info) return 'Daily';
  if (!sched) {
    const t = formatTimeLabel(info!.tz, info!.hour, info!.minute, info!.approx, now);
    return `Daily · ${t}`;
  }

  const dayPart = dayPatternFor(sched);
  if (!info) return dayPart;

  const t = formatTimeLabel(info.tz, info.hour, info.minute, info.approx, now);
  return `${dayPart} · ${t}`;
}

/** Returns true if we’re within a ±90 minute window around the local draw time on a valid draw day. */
export function isInDrawWindowFor(game: GameKey | LogicalGameKey, now = new Date()): boolean {
// Custom weekly/single-daily overrides
  const cust = WEEKLY_CUSTOM[game];
  if (cust) {
    const sched = new Set(cust.dows);
    const { tz, hour, minute } = cust;
    const { dow, hour: h, minute: m } = getLocalParts(tz, now);
    const isDrawDay = sched.has(dow);
    const windowMinutes = 90;
    const minutesNow = h * 60 + m;
    const minutesDraw = hour * 60 + minute;
    const start = minutesDraw - windowMinutes;
    const end   = minutesDraw + windowMinutes;
    const inTodayWindow = minutesNow >= start && minutesNow <= end && isDrawDay;
    const prevDow = (dow + 6) % 7;
    const isPrevDrawDay = sched.has(prevDow);
    const afterMidnight = minutesNow < Math.max(end - 24 * 60, 0);
    const inPrevWindow = isPrevDrawDay &&
      afterMidnight &&
      (minutesNow + 24 * 60) <= end &&
      (minutesNow + 24 * 60) >= start;
    return inTodayWindow || inPrevWindow;
  }

  const sched = DRAW_DOWS[getScheduleGame(game)];
  const info = GAME_TIME_INFO[getScheduleGame(game)];
  if (!sched || !info) return false;

  const { tz, hour, minute } = info;
  const { dow, hour: h, minute: m } = getLocalParts(tz, now);

  const isDrawDay = sched.has(dow);
  const windowMinutes = 90;
  const minutesNow = h * 60 + m;
  const minutesDraw = hour * 60 + minute;
  const start = minutesDraw - windowMinutes;
  const end   = minutesDraw + windowMinutes;

  const inTodayWindow = minutesNow >= start && minutesNow <= end && isDrawDay;

  // Cross-midnight spillover: shortly after midnight, check previous day’s window.
  const prevDow = (dow + 6) % 7;
  const isPrevDrawDay = sched.has(prevDow);
  const afterMidnight = minutesNow < Math.max(end - 24 * 60, 0);
  const inPrevWindow = isPrevDrawDay &&
    afterMidnight &&
    (minutesNow + 24 * 60) <= end &&
    (minutesNow + 24 * 60) >= start;

  return inTodayWindow || inPrevWindow;
}

/** Build a label like "Wed 6:30 PM PT" for the next draw in the game’s local timezone. */
export function nextDrawLabelFor(game: GameKey | LogicalGameKey, now = new Date()): string {
  // Custom weekly/single-daily overrides
  const cust = WEEKLY_CUSTOM[game];
  if (cust) {
    const sched = new Set(cust.dows);
    const { tz, hour, minute, approx } = cust;
    for (let i = 0; i < 8; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      const { dow } = getLocalParts(tz, d);
      if (sched.has(dow)) {
        const labelDay = DOW_NAMES[dow];
        const t = new Date(d);
        t.setHours(hour, minute, 0, 0);
        const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
        const timeStr = timeFmt.format(t);
        const tzStr = tzAbbrev(tz);
        return approx ? `${labelDay} ≈${timeStr} ${tzStr}` : `${labelDay} ${timeStr} ${tzStr}`;
      }
    }
    // Fallback if something goes wrong
    return 'See local draw time';
  }

  const sched = DRAW_DOWS[getScheduleGame(game)];
  const info = GAME_TIME_INFO[getScheduleGame(game)];
  if (!sched || !info) return 'See local draw time';

  const { tz, hour, minute, approx } = info;

  // Find the next calendar day (including today) that’s a draw day, using the game’s local weekday.
  for (let i = 0; i < 8; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const { dow } = getLocalParts(tz, d);
    if (sched.has(dow)) {
      const labelDay = DOW_NAMES[dow];
      const t = new Date(d);
      t.setHours(hour, minute, 0, 0);
      const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
      const timeStr = timeFmt.format(t);
      const tzStr = tzAbbrev(tz);
      return approx ? `${labelDay} ≈${timeStr} ${tzStr}` : `${labelDay} ${timeStr} ${tzStr}`;
    }
  }

  // Fallbacks (shouldn’t hit if sched isn’t empty)
  if (game === 'multi_powerball')    return 'Mon/Wed/Sat ≈11:00 PM ET';
  if (game === 'multi_megamillions') return 'Tue/Fri ≈11:00 PM ET';
  if (game === 'multi_cash4life')    return 'Daily 9:00 PM ET';
  return 'Daily';
}
