// Node 18+ ESM.
// Scrapes Texas All or Nothing Past Winning Numbers and writes FOUR CSVs split by draw time.
// Schema per file: draw_date,num1,num2,...,num12

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const HISTORY_URL =
  process.env.TX_AON_HISTORY_URL?.trim() ||
  "https://www.texaslottery.com/export/sites/lottery/Games/All_or_Nothing/Winning_Numbers/index.html_2013354932.html";

const FALLBACK_URL =
  "https://www.texaslottery.com/export/sites/lottery/Games/All_or_Nothing/Winning_Numbers/index.html";

const HTTP_TIMEOUT_MS = Number(process.env.TX_HTTP_TIMEOUT_MS ?? 20000);
const HEADER = "draw_date,num1,num2,num3,num4,num5,num6,num7,num8,num9,num10,num11,num12\n";

// number bounds
const MIN = 1, MAX = 24, COUNT = 12;

const BASE_HEADERS: Record<string, string> = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};

type DrawSlot = "morning" | "day" | "evening" | "night";

const TIME_ALIASES: Record<string, DrawSlot> = {
  morning: "morning",
  day: "day",
  midday: "day",       // just in case
  evening: "evening",
  night: "night",
};

function normTime(s: string): DrawSlot | null {
  const key = s.trim().toLowerCase();
  return TIME_ALIASES[key] ?? null;
}

function toISO(dateLike: string): string | null {
  const m = dateLike.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function parseNums(cellText: string): number[] | null {
  // "4 - 5 - 7 - ... - 24"
  const nums = cellText
    .split(/[-–—]/)
    .map(s => s.trim())
    .map(s => Number(s.replace(/[^\d]/g, "")))
    .filter(n => Number.isFinite(n)) as number[];

  if (nums.length !== COUNT) return null;
  const distinct = new Set(nums);
  if (distinct.size !== COUNT) return null;
  if (!nums.every(n => n >= MIN && n <= MAX)) return null;
  return nums;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    headers: BASE_HEADERS,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  return await res.text();
}

type Row = { dateISO: string; slot: DrawSlot; nums: number[] };

/**
 * Rows look like:
 *   <td><a class="detailsLink">DATE</a></td>
 *   <td>DRAW TIME</td>
 *   <td>WINNING NUMBERS</td>
 *   <td>Top Prize Winners</td> (ignore)
 */
function extractRowsFromHtml(html: string): Row[] {
  const rows: Row[] = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr: RegExpExecArray | null;

  while ((tr = trRe.exec(html))) {
    const inner = tr[1];

    const dm = /<a[^>]*class=["'][^"']*detailsLink[^"']*["'][^>]*>([^<]+)<\/a>/i.exec(inner);
    if (!dm) continue;
    const dateISO = toISO(dm[1]);
    if (!dateISO) continue;

    const tdContents = [...inner.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m =>
      m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    );
    // Expect at least 3 tds: [date, time, numbers, ...]
    if (tdContents.length < 3) continue;

    const slot = normTime(tdContents[1]);
    if (!slot) continue;

    const nums = parseNums(tdContents[2]);
    if (!nums) continue;

    rows.push({ dateISO, slot, nums });
  }

  // De-dupe by (date, slot)
  const key = (r: Row) => `${r.dateISO}|${r.slot}`;
  const map = new Map<string, Row>();
  for (const r of rows) map.set(key(r), r);
  return [...map.values()];
}

function csvLine(dateISO: string, vals: number[]): string {
  const parts = [dateISO, ...vals.map(n => String(n))];
  return parts.join(",") + "\n";
}

async function writePerSlotCSVs(
  grouped: Map<DrawSlot, Row[]>,
  baseOutDir: string,
) {
  await fs.mkdir(baseOutDir, { recursive: true });

  for (const slot of ["morning", "day", "evening", "night"] as DrawSlot[]) {
    const outFile =
      process.env[`TX_AON_OUT_${slot.toUpperCase()}`] ??
      path.join(baseOutDir, `all_or_nothing_${slot}.csv`);

    const rows = (grouped.get(slot) ?? []).slice().sort((a, b) =>
      a.dateISO.localeCompare(b.dateISO)
    );

    const lines = rows.map(r => csvLine(r.dateISO, r.nums));
    await fs.writeFile(outFile, HEADER + lines.join(""), "utf8");
    console.log(`[TX AON] Wrote ${rows.length} draws to: ${outFile}`);
  }
}

/** Public API: writes
 *   public/data/tx/all_or_nothing_morning.csv
 *   public/data/tx/all_or_nothing_day.csv
 *   public/data/tx/all_or_nothing_evening.csv
 *   public/data/tx/all_or_nothing_night.csv
 * (paths can be overridden via env TX_AON_OUT_* or baseOutDir arg)
 */
export async function buildTexasAllOrNothingCSVs(baseOutDir = "public/data/tx") {
  let html: string;
  try { html = await fetchText(HISTORY_URL); }
  catch { html = await fetchText(FALLBACK_URL); }

  const rows = extractRowsFromHtml(html);
  if (!rows.length) throw new Error("No All or Nothing rows extracted — page structure may have changed.");

  const grouped = new Map<DrawSlot, Row[]>();
  for (const r of rows) {
    (grouped.get(r.slot) ?? grouped.set(r.slot, []).get(r.slot)!).push(r);
  }
  await writePerSlotCSVs(grouped, path.isAbsolute(baseOutDir) ? baseOutDir : path.resolve(process.cwd(), baseOutDir));
}

// ---------- CLI ----------
if (typeof process !== "undefined" && process.argv && process.argv[1]) {
  const thisFile = path.resolve(fileURLToPath(import.meta.url));
  const invoked = path.resolve(process.argv[1]);
  if (thisFile === invoked) {
    buildTexasAllOrNothingCSVs().catch((e) => {
      console.error(e);
      process.exitCode = 1;
    });
  }
}
