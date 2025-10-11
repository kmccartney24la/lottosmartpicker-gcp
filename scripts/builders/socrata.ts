// scripts/builders/socrata.ts
import { fetch as undiciFetch } from "undici";
import { toCanonicalCsv, toFlexibleCsv } from "../../lib/csv.mjs";

type DatasetCfg = {
  id: string;
  dateField: string;
  /** A single field with tokens OR an ordered list of fallbacks (midday/evening etc.) */
  winningField: string | string[];
  /** Optional explicit field for special ball/bonus (if provided). */
  specialField?: string;
  /** If the special ball is embedded inside the winningField tokens, where is it? (0-based) */
  specialIndexInWinning?: number;
  /** Minimum count of *main* numbers to accept (e.g., 3 for Numbers, 4 for Win4, 5 for Take 5, 6 for NY Lotto, 20 for Pick 10). */
  minMainCount?: number;
  /** If true and no special is found, we still emit the row without special. */
  specialOptional?: boolean;
};

// Make the key type extensible so you can add NY keys easily
const DATASETS: Record<string, DatasetCfg> = {
  // Existing multi-state sets
  multi_powerball:    { id: "d6yy-54nr", dateField: "draw_date", winningField: "winning_numbers", specialIndexInWinning: 5, minMainCount: 5 },
  multi_megamillions: { id: "5xaw-6ayf", dateField: "draw_date", winningField: "winning_numbers", specialField: "mega_ball", minMainCount: 5  },
  multi_cash4life:    { id: "kwxv-fwze", dateField: "draw_date", winningField: "winning_numbers", specialField: "cash_ball", minMainCount: 5  },

  ny_numbers_midday: { id: "hsys-3def", dateField: "draw_date", winningField: "midday_daily", minMainCount: 3, specialOptional: true },
  ny_numbers_evening:{ id: "hsys-3def", dateField: "draw_date", winningField: "evening_daily", minMainCount: 3, specialOptional: true },
  ny_win4_midday:    { id: "hsys-3def", dateField: "draw_date", winningField: "midday_win_4", minMainCount: 4, specialOptional: true },
  ny_win4_evening:   { id: "hsys-3def", dateField: "draw_date", winningField: "evening_win_4", minMainCount: 4, specialOptional: true },
  ny_take5_midday:    { id: "dg63-4siq", dateField: "draw_date", winningField: "midday_winning_numbers", minMainCount: 5, specialOptional: true },
  ny_take5_evening:   { id: "dg63-4siq", dateField: "draw_date", winningField: "evening_winning_numbers", minMainCount: 5, specialOptional: true },
  ny_nylotto: { id: "6nbc-h7bj", dateField: "draw_date", winningField: "winning_numbers", specialField: "bonus", minMainCount: 6 },
  ny_pick10:         { id: "bycu-cw7c", dateField: "draw_date", winningField: "winning_numbers", minMainCount: 20, specialOptional: true }, 
  ny_quick_draw:   { id: "7sqk-ycpk", dateField: "draw_date", winningField: "winning_numbers", minMainCount: 20, specialField: "money_dots_winning_number" },
};


const SOCRATA_BASE = "https://data.ny.gov/resource";

/** Robust tokenization:
 * - Accept "1 2 3", "01, 02, 03", "1-2-3"
 * - Accept concatenated digits like "1234" (Win4) or "123" (Numbers) → split into single digits
 */
function parseTokensFlexible(raw: unknown, expectedMin?: number): number[] {
  const s = String(raw || "").trim();
  if (!s) return [];
  // First, try normal tokenization
  let tokens = s
    .replace(/[,-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => parseInt(t, 10))
    .filter(Number.isFinite);
  if (tokens.length >= (expectedMin ?? 1)) return tokens;

  // If we only got one token and it's all digits, split per digit (handles "123" / "1234" cases)
  if (/^\d+$/.test(s)) {
    tokens = s.split("").map((ch) => parseInt(ch, 10));
  }
  return tokens;
}

// Single, canonical helper: returns the FIRST non-empty winning field value
function pickWinningValue(obj: Record<string, unknown>, f: string | string[]): unknown {
  if (Array.isArray(f)) {
    for (const key of f) {
      const v = obj[key];
      if (v != null && String(v).trim() !== "") return v;
    }
    return undefined;
  }
  return obj[f];
}

export async function buildSocrataCsvFlexible(
  gameKey: keyof typeof DATASETS,
  token?: string
): Promise<string> {
  const cfg = DATASETS[gameKey];
  if (!cfg) throw new Error(`Unknown Socrata dataset key '${String(gameKey)}'`);

  const select = new Set<string>([cfg.dateField]);
  (Array.isArray(cfg.winningField) ? cfg.winningField : [cfg.winningField]).forEach(f => select.add(f));
  if (cfg.specialField) select.add(cfg.specialField);

  const params = new URLSearchParams({
    $select: Array.from(select).join(","),
    $order: `${cfg.dateField} ASC`,
    $limit: "50000",
  });
  const url = `${SOCRATA_BASE}/${cfg.id}.json?${params}`;

  const res = await undiciFetch(url, { headers: token ? { "X-App-Token": token } : undefined });
  if (!res.ok) throw new Error(`Socrata ${res.status} for ${gameKey}`);

  const json = (await res.json()) as Array<Record<string, unknown>>;

  const rowsFlex: Array<{ draw_date: string; nums: number[]; special?: number }> = [];
  for (const r of json) {
    const rawDate = r[cfg.dateField] as string | undefined;
    const date = rawDate ? new Date(rawDate) : new Date(NaN);
    if (Number.isNaN(date.getTime())) continue;
    const iso = date.toISOString().slice(0, 10);

    const rawWin = pickWinningValue(r, cfg.winningField);
    if (rawWin == null) continue;
    const nums = parseTokensFlexible(rawWin, cfg.minMainCount);
    const mainMin = cfg.minMainCount ?? 5;
    if (nums.length < mainMin) continue;

    // Resolve special
    let special: number | undefined;
    if (cfg.specialField && r[cfg.specialField] != null) {
      const s = parseInt(String(r[cfg.specialField]), 10);
      if (Number.isFinite(s)) special = s;
    } else if (cfg.specialIndexInWinning != null) {
      const s = nums[cfg.specialIndexInWinning];
      if (Number.isFinite(s)) special = s;
    }

    // If a special is required (classic 5+special), skip rows missing it.
    const needsSpecial = mainMin === 5 && cfg.specialOptional !== true;
    if (needsSpecial && special == null) continue;

    rowsFlex.push({ draw_date: iso, nums: nums.slice(0, mainMin), special });
  }

  // Keep your canonical writer when it’s the classic 5+special shape
  const isClassic5PlusSpecial =
    (cfg.minMainCount ?? 0) === 5 &&
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
      special: r.special!,
    }));
    return toCanonicalCsv(rows);
  }

  // Otherwise, output flexible CSV with num1..numN (+ optional special)
  return toFlexibleCsv(rowsFlex);
}

// Back-compat export: use the flexible builder by default
export const buildSocrataCsv = buildSocrataCsvFlexible;