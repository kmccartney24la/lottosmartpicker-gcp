// packages/lib/src/lotto/paths.ts
import type { GameKey, UnderlyingKey } from './types.js';

/** Always go through the app proxy (environment fallbacks). */
export const FILE_BASE: string =
  process.env.NEXT_PUBLIC_DATA_BASE ||
  process.env.NEXT_PUBLIC_DATA_BASE_URL ||
  '/api/file';

/** Canonical Next API endpoints per game (remote-first to GCS, no-store). */
export const GAME_TO_API_PATH: Readonly<Record<GameKey, string>> = Object.freeze({
  // --- Multi-state ---
  multi_powerball:    `${FILE_BASE}/multi/powerball.csv`,
  multi_megamillions: `${FILE_BASE}/multi/megamillions.csv`,
  multi_cash4life:    `${FILE_BASE}/multi/cash4life.csv`,

  // --- Georgia ---
  ga_fantasy5:        `${FILE_BASE}/ga/fantasy5.csv`,

  // --- California ---
  ca_superlotto_plus: `${FILE_BASE}/ca/superlotto_plus.csv`,
  ca_fantasy5:        `${FILE_BASE}/ca/fantasy5.csv`,

  // --- Florida ---
  fl_lotto:               `${FILE_BASE}/fl/lotto.csv`,
  fl_jackpot_triple_play: `${FILE_BASE}/fl/jackpot_triple_play.csv`,
  fl_fantasy5:            `${FILE_BASE}/fl/fantasy5_evening.csv`,
  fl_pick5:               `${FILE_BASE}/fl/pick5_evening.csv`, 
  fl_pick4:               `${FILE_BASE}/fl/pick4_evening.csv`,
  fl_pick3:               `${FILE_BASE}/fl/pick3_evening.csv`,
  fl_pick2:               `${FILE_BASE}/fl/pick2_evening.csv`,

  // --- Texas ---
  tx_lotto_texas:     `${FILE_BASE}/tx/lotto_texas.csv`,
  tx_texas_two_step:  `${FILE_BASE}/tx/texas_two_step.csv`,
  tx_cash5:           `${FILE_BASE}/tx/cash5.csv`,

  // --- Texas representatives for 4x-daily families (Night = rep) ---
  tx_all_or_nothing: `${FILE_BASE}/tx/all_or_nothing_night.csv`,
  tx_pick3:          `${FILE_BASE}/tx/pick3_night.csv`,
  tx_daily4:         `${FILE_BASE}/tx/daily4_night.csv`,

  // --- New York (REPRESENTATIVE / logical single-source) ---
  // For twice-daily games, EVENING is the representative source.
  ny_take5:           `${FILE_BASE}/ny/take5_evening.csv`,
  ny_numbers:         `${FILE_BASE}/ny/numbers_evening.csv`,
  ny_win4:            `${FILE_BASE}/ny/win4_evening.csv`,
  ny_lotto:           `${FILE_BASE}/ny/nylotto.csv`,
  ny_quick_draw:      `${FILE_BASE}/ny/quick_draw.csv`,
  ny_pick10:          `${FILE_BASE}/ny/pick10.csv`,
});

/** Strict lookup (throws on unknown). */
export function apiPathForGame(game: GameKey): string {
  const p = GAME_TO_API_PATH[game];
  if (!p) throw new Error(`Unknown game key: ${game}`);
  return p;
}

/** Map any underlying key (canonical or flexible) to its CSV API path. */
export function apiPathForUnderlying(u: UnderlyingKey): string {
  // 1) Canonical keys reuse the existing map (fast path).
  const canonical = (GAME_TO_API_PATH as Record<string, string>)[u as string];
  if (canonical) return canonical;

  // 2) Flexible CSVs (served via same-origin proxy)
  switch (u) {
    // --- Florida Fantasy 5 flexible files (underlying) ---
    case 'fl_fantasy5_midday':   return `${FILE_BASE}/fl/fantasy5_midday.csv`;
    case 'fl_fantasy5_evening':  return `${FILE_BASE}/fl/fantasy5_evening.csv`;
    // --- Florida Pick (explicit fallbacks; protects against stale maps) ---
    case 'fl_pick2_midday':    return `${FILE_BASE}/fl/pick2_midday.csv`;
    case 'fl_pick2_evening':   return `${FILE_BASE}/fl/pick2_evening.csv`;
    case 'fl_pick3_midday':    return `${FILE_BASE}/fl/pick3_midday.csv`;
    case 'fl_pick3_evening':   return `${FILE_BASE}/fl/pick3_evening.csv`;
    case 'fl_pick4_midday':    return `${FILE_BASE}/fl/pick4_midday.csv`;
    case 'fl_pick4_evening':   return `${FILE_BASE}/fl/pick4_evening.csv`;
    case 'fl_pick5_midday':    return `${FILE_BASE}/fl/pick5_midday.csv`;
    case 'fl_pick5_evening':   return `${FILE_BASE}/fl/pick5_evening.csv`;

    // --- FL Cash Pop flexible files ---
    case 'fl_cashpop_morning':   return `${FILE_BASE}/fl/cashpop_morning.csv`;
    case 'fl_cashpop_matinee':   return `${FILE_BASE}/fl/cashpop_matinee.csv`;
    case 'fl_cashpop_afternoon': return `${FILE_BASE}/fl/cashpop_afternoon.csv`;
    case 'fl_cashpop_evening':   return `${FILE_BASE}/fl/cashpop_evening.csv`;
    case 'fl_cashpop_latenight': return `${FILE_BASE}/fl/cashpop_latenight.csv`;

    // --- New York flexible files ---
    case 'ny_take5_midday':      return `${FILE_BASE}/ny/take5_midday.csv`;
    case 'ny_take5_evening':     return `${FILE_BASE}/ny/take5_evening.csv`;
    case 'ny_numbers_midday':    return `${FILE_BASE}/ny/numbers_midday.csv`;
    case 'ny_numbers_evening':   return `${FILE_BASE}/ny/numbers_evening.csv`;
    case 'ny_win4_midday':       return `${FILE_BASE}/ny/win4_midday.csv`;
    case 'ny_win4_evening':      return `${FILE_BASE}/ny/win4_evening.csv`;
    case 'ny_nylotto':           return `${FILE_BASE}/ny/nylotto.csv`;
    case 'ny_pick10':            return `${FILE_BASE}/ny/pick10.csv`;
    case 'ny_quick_draw':        return `${FILE_BASE}/ny/quick_draw.csv`;

    // --- California flexible files ---
    case 'ca_daily3_midday':     return `${FILE_BASE}/ca/daily3_midday.csv`;
    case 'ca_daily3_evening':    return `${FILE_BASE}/ca/daily3_evening.csv`;
    case 'ca_daily4':            return `${FILE_BASE}/ca/daily4.csv`;

    // --- Texas flexible files ---
    case 'tx_all_or_nothing_morning': return `${FILE_BASE}/tx/all_or_nothing_morning.csv`;
    case 'tx_all_or_nothing_day':     return `${FILE_BASE}/tx/all_or_nothing_day.csv`;
    case 'tx_all_or_nothing_evening': return `${FILE_BASE}/tx/all_or_nothing_evening.csv`;
    case 'tx_all_or_nothing_night':   return `${FILE_BASE}/tx/all_or_nothing_night.csv`;
    case 'tx_pick3_morning':  return `${FILE_BASE}/tx/pick3_morning.csv`;
    case 'tx_pick3_day':      return `${FILE_BASE}/tx/pick3_day.csv`;
    case 'tx_pick3_evening':  return `${FILE_BASE}/tx/pick3_evening.csv`;
    case 'tx_pick3_night':    return `${FILE_BASE}/tx/pick3_night.csv`;
    case 'tx_daily4_morning': return `${FILE_BASE}/tx/daily4_morning.csv`;
    case 'tx_daily4_day':     return `${FILE_BASE}/tx/daily4_day.csv`;
    case 'tx_daily4_evening': return `${FILE_BASE}/tx/daily4_evening.csv`;
    case 'tx_daily4_night':   return `${FILE_BASE}/tx/daily4_night.csv`;
  }
  throw new Error(`No API path for underlying key: ${u}`);
}

/** Swap a canonical CSV path for its tiny “latest” probe endpoint. */
export function latestApiPathForGame(game: GameKey): string {
  const p = apiPathForGame(game);
  return p.replace(/\.csv(\?.*)?$/i, '.latest.csv');
}

export function latestApiPathForUnderlying(u: UnderlyingKey): string {
  return apiPathForUnderlying(u).replace(/\.csv(\?.*)?$/i, '.latest.csv');
}
