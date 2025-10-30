// packages/scripts/src/builders/socrata.ts
import { fetch as undiciFetch } from "undici";
import { toCanonicalCsv, toFlexibleCsv } from "@lsp/lib/csv";
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
    /** NY Quick Draw — many draws per day. We want the most recent 50,000 rows. */
    ny_quick_draw: {
        id: "7sqk-ycpk",
        dateField: "draw_date",
        winningField: "winning_numbers",
        minMainCount: 20,
        // Do NOT include the Extra multiplier ("Extra"/"extra_multiplier") — we don't need it.
        // Pull these extra columns for the CSV:
        extraFields: ["draw_number", "draw_time"],
        // Newest first, then latest draw_number within a day:
        orderBy: "draw_date DESC, draw_number DESC",
        // Exactly 50k newest rows:
        limit: 50000,
        // No special ball for Quick Draw:
        specialOptional: true,
    },
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
export async function buildSocrataCsvFlexible(gameKey, token) {
    const cfg = DATASETS[gameKey];
    if (!cfg)
        throw new Error(`Unknown Socrata dataset key '${String(gameKey)}'`);
    const select = new Set([cfg.dateField]);
    (Array.isArray(cfg.winningField) ? cfg.winningField : [cfg.winningField]).forEach(f => select.add(f));
    if (cfg.specialField)
        select.add(cfg.specialField);
    // Include any extra passthrough fields (e.g., draw_number, draw_time)
    (cfg.extraFields ?? []).forEach(f => select.add(f));
    const params = new URLSearchParams({
        $select: Array.from(select).join(","),
        // Default to newest-first so *.latest.csv is truly "latest"
        $order: cfg.orderBy ?? `${cfg.dateField} DESC`,
        $limit: String(cfg.limit ?? 50000),
    });
    const url = `${SOCRATA_BASE}/${cfg.id}.json?${params}`;
    const res = await undiciFetch(url, { headers: token ? { "X-App-Token": token } : undefined });
    if (!res.ok)
        throw new Error(`Socrata ${res.status} for ${gameKey}`);
    const json = (await res.json());
    const rowsFlex = [];
    // Quick Draw passthrough holders (only populated for ny_quick_draw)
    const rowsQD = [];
    for (const r of json) {
        const rawDate = r[cfg.dateField];
        const date = rawDate ? new Date(rawDate) : new Date(NaN);
        if (Number.isNaN(date.getTime()))
            continue;
        const iso = date.toISOString().slice(0, 10);
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
        if (gameKey === "ny_quick_draw") {
            rowsQD.push({
                draw_date: iso,
                draw_number: r["draw_number"],
                draw_time: r["draw_time"],
                nums: nums.slice(0, mainMin),
            });
        }
        else {
            rowsFlex.push({ draw_date: iso, nums: nums.slice(0, mainMin), special });
        }
    }
    // ---- Quick Draw CSV writer (newest-first is fine) ----
    if (gameKey === "ny_quick_draw") {
        // Shape: draw_date,draw_number,draw_time,num1..num20
        const header = [
            "draw_date",
            "draw_number",
            "draw_time",
            ...Array.from({ length: 20 }, (_, i) => `num${i + 1}`),
        ].join(",");
        const lines = [header];
        for (const row of rowsQD) {
            const ns = row.nums.slice(0, 20);
            // Defensive: pad/truncate to exactly 20 cols.
            const padded = Array.from({ length: 20 }, (_, i) => ns[i] ?? "");
            lines.push([
                row.draw_date,
                row.draw_number ?? "",
                row.draw_time ?? "",
                ...padded,
            ].join(","));
        }
        return lines.join("\n") + "\n";
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
