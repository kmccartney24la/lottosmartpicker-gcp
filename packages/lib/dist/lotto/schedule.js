/** Days-of-week sets for scheduling; 0=Sun..6=Sat. */
export const DRAW_DOWS = {
    multi_powerball: new Set([1, 3, 6]),
    multi_megamillions: new Set([2, 5]),
    multi_cash4life: new Set([0, 1, 2, 3, 4, 5, 6]), // daily 9:00 p.m. ET
    ca_superlotto_plus: new Set([3, 6]), // Wed & Sat
    ca_fantasy5: new Set([0, 1, 2, 3, 4, 5, 6]),
    ga_fantasy5: new Set([0, 1, 2, 3, 4, 5, 6]), // daily 11:34 p.m. ET
    fl_fantasy5: new Set([0, 1, 2, 3, 4, 5, 6]),
    ny_take5: new Set([0, 1, 2, 3, 4, 5, 6]), // treat as "daily" (twice daily in UI)
};
// ---- Internal schedule selector (logical -> scheduling family) ----
function getScheduleGame(game) {
    if (game === 'multi_powerball' ||
        game === 'multi_megamillions' ||
        game === 'multi_cash4life' ||
        game === 'ga_fantasy5' ||
        game === 'fl_fantasy5_midday' ||
        game === 'fl_fantasy5_evening' ||
        game === 'ca_superlotto_plus' ||
        game === 'ca_fantasy5') {
        return (game === 'fl_fantasy5_midday' || game === 'fl_fantasy5_evening') ? 'fl_fantasy5' : game;
    }
    // Use Take 5’s “daily/twice daily” semantics for NY logicals by default.
    return 'ny_take5';
}
const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
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
    // Logical daily reps
    fl_fantasy5: { tz: 'America/New_York', hour: 23, minute: 0, approx: true }, // evening rep
    ny_take5: { tz: 'America/New_York', hour: 23, minute: 0, approx: true }, // evening rep
};
// ---------- Internals: timezone helpers ----------
function tzAbbrev(tz, d = new Date()) {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short', hour: '2-digit' });
    const str = fmt.format(d);
    const abbr = str.split(' ').pop() || '';
    if (/ET/i.test(abbr))
        return 'ET';
    if (/PT/i.test(abbr))
        return 'PT';
    if (/GMT[+-]\d+/.test(abbr))
        return tz === 'America/New_York' ? 'ET' : 'PT';
    return abbr.toUpperCase();
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
    return { dow, hour: parseInt(m.hour ?? '0', 10), minute: parseInt(m.minute ?? '0', 10) };
}
function formatTimeLabel(tz, hour, minute, approx, base) {
    const d = new Date(base);
    d.setHours(hour, minute, 0, 0);
    const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
    const timeStr = timeFmt.format(d);
    const tzStr = tzAbbrev(tz, d);
    return (approx ? `≈${timeStr}` : timeStr) + ` ${tzStr}`;
}
function dayPatternFor(sched) {
    if (sched.size === 7)
        return 'Daily';
    // Show days in Mon..Sun order to match typical lotto phrasing
    const order = [1, 2, 3, 4, 5, 6, 0];
    const parts = order.filter(d => sched.has(d)).map(d => DOW_NAMES[d]);
    return parts.join('/');
}
// ---------- Public schedule helpers ----------
/** Human-friendly schedule label derived from DRAW_DOWS + GAME_TIME_INFO. */
export function drawNightsLabel(game, now = new Date()) {
    // Twice-daily games: keep explicit wording
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
        return dayPart;
    const t = formatTimeLabel(info.tz, info.hour, info.minute, info.approx, now);
    return `${dayPart} · ${t}`;
}
/** Returns true if we’re within a ±90 minute window around the local draw time on a valid draw day. */
export function isInDrawWindowFor(game, now = new Date()) {
    const sched = DRAW_DOWS[getScheduleGame(game)];
    const info = GAME_TIME_INFO[getScheduleGame(game)];
    if (!sched || !info)
        return false;
    const { tz, hour, minute } = info;
    const { dow, hour: h, minute: m } = getLocalParts(tz, now);
    const isDrawDay = sched.has(dow);
    const windowMinutes = 90;
    const minutesNow = h * 60 + m;
    const minutesDraw = hour * 60 + minute;
    const start = minutesDraw - windowMinutes;
    const end = minutesDraw + windowMinutes;
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
export function nextDrawLabelFor(game, now = new Date()) {
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
            const labelDay = DOW_NAMES[dow];
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
