/** Always go through the app proxy (environment fallbacks). */
export const FILE_BASE = process.env.NEXT_PUBLIC_DATA_BASE ||
    process.env.NEXT_PUBLIC_DATA_BASE_URL ||
    '/api/file';
/** Canonical Next API endpoints per game (remote-first to GCS, no-store). */
export const GAME_TO_API_PATH = Object.freeze({
    // --- Multi-state ---
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
    // --- Texas ---
    tx_lotto_texas: `${FILE_BASE}/tx/lotto_texas.csv`,
    tx_texas_two_step: `${FILE_BASE}/tx/texas_two_step.csv`,
    tx_cash5: `${FILE_BASE}/tx/cash5.csv`,
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
    // --- New York (REPRESENTATIVE / logical single-source) ---
    // For twice-daily games, EVENING is the representative source.
    ny_take5: `${FILE_BASE}/ny/take5_evening.csv`,
    ny_numbers: `${FILE_BASE}/ny/numbers_evening.csv`,
    ny_win4: `${FILE_BASE}/ny/win4_evening.csv`,
    ny_lotto: `${FILE_BASE}/ny/nylotto.csv`,
    // Optional rep keys:
    ny_quick_draw_rep: `${FILE_BASE}/ny/quick_draw.csv`,
    ny_pick10_rep: `${FILE_BASE}/ny/pick10.csv`,
});
/** Strict lookup (throws on unknown). */
export function apiPathForGame(game) {
    const p = GAME_TO_API_PATH[game];
    if (!p)
        throw new Error(`Unknown game key: ${game}`);
    return p;
}
/** Map any underlying key (canonical or flexible) to its CSV API path. */
export function apiPathForUnderlying(u) {
    // 1) Canonical keys reuse the existing map (fast path).
    const canonical = GAME_TO_API_PATH[u];
    if (canonical)
        return canonical;
    // 2) Flexible CSVs (served via same-origin proxy)
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
        // --- Texas flexible files ---
        case 'tx_all_or_nothing_morning': return `${FILE_BASE}/tx/all_or_nothing_morning.csv`;
        case 'tx_all_or_nothing_day': return `${FILE_BASE}/tx/all_or_nothing_day.csv`;
        case 'tx_all_or_nothing_evening': return `${FILE_BASE}/tx/all_or_nothing_evening.csv`;
        case 'tx_all_or_nothing_night': return `${FILE_BASE}/tx/all_or_nothing_night.csv`;
        case 'tx_pick3_morning': return `${FILE_BASE}/tx/pick3_morning.csv`;
        case 'tx_pick3_day': return `${FILE_BASE}/tx/pick3_day.csv`;
        case 'tx_pick3_evening': return `${FILE_BASE}/tx/pick3_evening.csv`;
        case 'tx_pick3_night': return `${FILE_BASE}/tx/pick3_night.csv`;
        case 'tx_daily4_morning': return `${FILE_BASE}/tx/daily4_morning.csv`;
        case 'tx_daily4_day': return `${FILE_BASE}/tx/daily4_day.csv`;
        case 'tx_daily4_evening': return `${FILE_BASE}/tx/daily4_evening.csv`;
        case 'tx_daily4_night': return `${FILE_BASE}/tx/daily4_night.csv`;
    }
    throw new Error(`No API path for underlying key: ${u}`);
}
/** Swap a canonical CSV path for its tiny “latest” probe endpoint. */
export function latestApiPathForGame(game) {
    const p = apiPathForGame(game);
    return p.replace(/\.csv(\?.*)?$/i, '.latest.csv');
}
