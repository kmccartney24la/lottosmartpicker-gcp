// packages/lib/scripts/builders/socrata.ts
import { fetch as undiciFetch } from "undici";
import { toCanonicalCsv, toFlexibleCsv } from "@lsp/lib/csv";
const DEBUG = process.env.SOCRATA_DEBUG === "1";
// Make the key type extensible so you can add NY keys easily
const DATASETS = {
    // Existing multi-state sets
    multi_powerball: { id: "d6yy-54nr", dateField: "draw_date", winningField: "winning_numbers", specialIndexInWinning: 5, minMainCount: 5 },
    multi_megamillions: { id: "5xaw-6ayf", dateField: "draw_date", winningField: "winning_numbers", specialField: "mega_ball", minMainCount: 5 },
    multi_cash4life: { id: "kwxv-fwze", dateField: "draw_date", winningField: "winning_numbers", specialField: "cash_ball", minMainCount: 5 },
    ny_numbers_midday: { id: "hsys-3def", dateField: "draw_date", winningField: "midday_daily", minMainCount: 3, specialOptional: true },
    ny_numbers_evening: { id: "hsys-3def", dateField: "draw_date", winningField: "evening_daily", minMainCount: 3, specialOptional: true },
    ny_win4_midday: { id: "hsys-3def", dateField: "draw_date", winningField: "midday_win_4", minMainCount: 4, specialOptional: true },
    ny_win4_evening: { id: "hsys-3def", dateField: "draw_date", winningField: "evening_win_4", minMainCount: 4, specialOptional: true },
    ny_take5_midday: { id: "dg63-4siq", dateField: "draw_date", winningField: "midday_winning_numbers", minMainCount: 5, specialOptional: true },
    ny_take5_evening: { id: "dg63-4siq", dateField: "draw_date", winningField: "evening_winning_numbers", minMainCount: 5, specialOptional: true },
    ny_nylotto: { id: "6nbc-h7bj", dateField: "draw_date", winningField: "winning_numbers", specialField: "bonus", minMainCount: 6 },
    ny_pick10: { id: "bycu-cw7c", dateField: "draw_date", winningField: "winning_numbers", minMainCount: 20, specialOptional: true },
    // NOTE: Quick Draw dataset has fields: draw_date (timestamp), draw_number (number), draw_time, winning_numbers, extra_multiplier
    ny_quick_draw: { id: "7sqk-ycpk", dateField: "draw_date", winningField: "winning_numbers", minMainCount: 20 },
};
const SOCRATA_BASE = "https://data.ny.gov/resource";
/** Robust tokenization:
 * - Accept "1 2 3", "01, 02, 03", "1-2-3"
 * - Accept concatenated digits like "1234" (Win4) or "123" (Numbers) → split into single digits
 */
function parseTokensFlexible(raw, expectedMin) {
    const s = String(raw || "").trim();
    if (!s)
        return [];
    // First, try normal tokenization
    let tokens = s
        .replace(/[,-]/g, " ")
        .split(/\s+/)
        .filter(Boolean)
        .map((t) => parseInt(t, 10))
        .filter(Number.isFinite);
    if (tokens.length >= (expectedMin ?? 1))
        return tokens;
    // If we only got one token and it's all digits, split per digit (handles "123" / "1234" cases)
    if (/^\d+$/.test(s)) {
        tokens = s.split("").map((ch) => parseInt(ch, 10));
    }
    return tokens;
}
// Single, canonical helper: returns the FIRST non-empty winning field value
function pickWinningValue(obj, f) {
    if (Array.isArray(f)) {
        for (const key of f) {
            const v = obj[key];
            if (v != null && String(v).trim() !== "")
                return v;
        }
        return undefined;
    }
    return obj[f];
}
export async function buildSocrataCsvFlexible(gameKey, token, limitOpts) {
    const cfg = DATASETS[gameKey];
    if (!cfg)
        throw new Error(`Unknown Socrata dataset key '${String(gameKey)}'`);
    const select = new Set([cfg.dateField]);
    (Array.isArray(cfg.winningField) ? cfg.winningField : [cfg.winningField]).forEach(f => select.add(f));
    if (cfg.specialField)
        select.add(cfg.specialField);
    // NEW: build query params with optional limit strategy
    // Default: chronological (ASC) with 50k cap to avoid pagination.
    let order = `${cfg.dateField} ASC`;
    let where;
    let limit = "50000";
    if (limitOpts?.mode === "lastN") {
        // Ask Socrata for the newest rows first, then reverse locally.
        limit = String(Math.min(limitOpts.n, 50000));
        // For Quick Draw, date-only ordering collapses to a single day; add draw_number DESC.
        if (gameKey === "ny_quick_draw") {
            // Ensure the column is selected so SoQL can sort on it
            select.add("draw_number");
            order = `${cfg.dateField} DESC, draw_number DESC`;
            // (Optional but harmless) filter out any odd rows missing winning numbers
            where = where
                ? `${where} AND winning_numbers IS NOT NULL`
                : `winning_numbers IS NOT NULL`;
        }
        else {
            order = `${cfg.dateField} DESC`;
        }
    }
    else if (limitOpts?.mode === "since") {
        // Since-date filter; keep ASC to get a natural chronological stream.
        where = `${cfg.dateField} >= '${limitOpts.sinceISO}'`;
        // Keep a single-page cap; caller should ensure date range is <= 50k rows.
        limit = "50000";
    }
    const params = new URLSearchParams();
    params.set("$select", Array.from(select).join(","));
    params.set("$order", order);
    params.set("$limit", limit);
    if (where)
        params.set("$where", where);
    const url = `${SOCRATA_BASE}/${cfg.id}.json?${params}`;
    if (DEBUG) {
        console.log(`[socrata] ${String(gameKey)} URL: ${url}`);
    }
    const res = await undiciFetch(url, { headers: token ? { "X-App-Token": token } : undefined });
    if (DEBUG) {
        console.log(`[socrata] ${String(gameKey)} HTTP status: ${res.status}`);
    }
    if (!res.ok)
        throw new Error(`Socrata ${res.status} for ${gameKey} (${await res.text()})`);
    let json = (await res.json());
    if (DEBUG) {
        console.log(`[socrata] ${String(gameKey)} fetched rows: ${json.length}`);
    }
    // If we pulled DESC for "lastN", restore chronological order for downstream logic/CSV.
    if (limitOpts?.mode === "lastN") {
        json = json.reverse();
    }
    const rowsFlex = [];
    for (const r of json) {
        const rawDate = r[cfg.dateField];
        const date = rawDate ? new Date(rawDate) : new Date(NaN);
        if (Number.isNaN(date.getTime()))
            continue;
        // Keep full timestamp; for Quick Draw, append draw_number to guarantee uniqueness
        const isoFull = date.toISOString();
        const drawNum = gameKey === "ny_quick_draw"
            ? Number.parseInt(String(r["draw_number"] ?? ""), 10)
            : undefined;
        const uniqueKey = gameKey === "ny_quick_draw" && Number.isFinite(drawNum)
            ? `${isoFull}#${drawNum}`
            : isoFull;
        const rawWin = pickWinningValue(r, cfg.winningField);
        if (rawWin == null)
            continue;
        const nums = parseTokensFlexible(rawWin, cfg.minMainCount);
        const mainMin = cfg.minMainCount ?? 5;
        if (nums.length < mainMin)
            continue;
        // Resolve special
        let special;
        if (cfg.specialField && r[cfg.specialField] != null) {
            const s = parseInt(String(r[cfg.specialField]), 10);
            if (Number.isFinite(s))
                special = s;
        }
        else if (cfg.specialIndexInWinning != null) {
            const s = nums[cfg.specialIndexInWinning];
            if (Number.isFinite(s))
                special = s;
        }
        // If a special is required (classic 5+special), skip rows missing it.
        const needsSpecial = mainMin === 5 && cfg.specialOptional !== true;
        if (needsSpecial && special == null)
            continue;
        rowsFlex.push({ draw_date: uniqueKey, nums: nums.slice(0, mainMin), special });
    }
    if (DEBUG) {
        console.log(`[socrata] ${String(gameKey)} kept rows: ${rowsFlex.length}`);
    }
    // Keep your canonical writer when it’s the classic 5+special shape
    const isClassic5PlusSpecial = (cfg.minMainCount ?? 0) === 5 &&
        rowsFlex.length > 0 &&
        rowsFlex.every(r => r.nums.length === 5) &&
        rowsFlex.some(r => r.special != null);
    if (isClassic5PlusSpecial) {
        const rows = rowsFlex.map(r => ({
            draw_date: r.draw_date,
            num1: r.nums[0],
            num2: r.nums[1],
            num3: r.nums[2],
            num4: r.nums[3],
            num5: r.nums[4],
            special: r.special,
        }));
        return toCanonicalCsv(rows);
    }
    // Otherwise, output flexible CSV with num1..numN (+ optional special)
    return toFlexibleCsv(rowsFlex);
}
// Back-compat export: use the flexible builder by default
export const buildSocrataCsv = buildSocrataCsvFlexible;
// convenience helper specifically for Quick Draw — last 40,000 rows
// Usage:
//   const csv = await buildQuickDrawRecentCsv40k(process.env.NY_SOCRATA_APP_TOKEN);
export async function buildQuickDrawRecentCsv40k(token) {
    return buildSocrataCsvFlexible("ny_quick_draw", token, { mode: "lastN", n: 40000 });
}
