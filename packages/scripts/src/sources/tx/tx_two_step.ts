// Node 18+ ESM.
// Scrapes Texas Two Step Past Winning Numbers into canonical CSV
// Schema: draw_date,num1,num2,num3,num4,special  (special = Bonus Ball)

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const HISTORY_URL =
  process.env.TX_TWO_STEP_HISTORY_URL?.trim() ||
  "https://www.texaslottery.com/export/sites/lottery/Games/Texas_Two_Step/Winning_Numbers/index.html_2013354932.html";

const FALLBACK_URL =
  "https://www.texaslottery.com/export/sites/lottery/Games/Texas_Two_Step/Winning_Numbers/index.html";

const HTTP_TIMEOUT_MS = Number(process.env.TX_HTTP_TIMEOUT_MS ?? 20000);
const HEADER = "draw_date,num1,num2,num3,num4,special\n";

// Official rules: balls are 1..35 (mains and bonus). Keep this flexible via env if needed.
const MAIN_MIN = Number(process.env.TX_TWO_STEP_MIN ?? 1);
const MAIN_MAX = Number(process.env.TX_TWO_STEP_MAX ?? 35);
const BONUS_MIN = Number(process.env.TX_TWO_STEP_BONUS_MIN ?? MAIN_MIN);
const BONUS_MAX = Number(process.env.TX_TWO_STEP_BONUS_MAX ?? MAIN_MAX);

const BASE_HEADERS: Record<string, string> = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};

function toISO(dateLike: string): string | null {
  const m = dateLike.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function parseMainNums(cellText: string): number[] | null {
  // Example: "5 - 8 - 11 - 24"
  const nums = cellText
    .split(/[-–—]/)
    .map(s => s.trim())
    .map(s => Number(s.replace(/[^\d]/g, "")))
    .filter(n => Number.isFinite(n)) as number[];

  if (nums.length !== 4) return null;
  const distinct = new Set(nums);
  if (distinct.size !== 4) return null;
  if (!nums.every(n => n >= MAIN_MIN && n <= MAIN_MAX)) return null;
  return nums;
}

function parseBonus(cellText: string): number | null {
  const n = Number(String(cellText).replace(/[^\d]/g, ""));
  if (!Number.isFinite(n)) return null;
  if (n < BONUS_MIN || n > BONUS_MAX) return null;
  return n;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    headers: BASE_HEADERS,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  return await res.text();
}

type Row = { dateISO: string; mains: number[]; bonus: number };

/**
 * Dependency-free extraction keyed on:
 *  <td><a class="detailsLink">DATE</a></td>
 *  <td>MAIN NUMBERS</td>
 *  <td>BONUS</td>
 * (then jackpot, winners ... which we ignore)
 */
function extractRowsFromHtml(html: string): Row[] {
  const rows: Row[] = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch: RegExpExecArray | null;

  while ((trMatch = trRe.exec(html))) {
    const tr = trMatch[1];

    const dateAnchorRe = /<a[^>]*class=["'][^"']*detailsLink[^"']*["'][^>]*>([^<]+)<\/a>/i;
    const dm = dateAnchorRe.exec(tr);
    if (!dm) continue;

    const dateISO = toISO(dm[1]);
    if (!dateISO) continue;

    // Capture all <td> contents for the row
    const tdContents = [...tr.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m =>
      m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    );

    // Expect at least 3 <td>s: [date, numbers, bonus, ...]
    if (tdContents.length < 3) continue;

    const mains = parseMainNums(tdContents[1]);
    const bonus = parseBonus(tdContents[2]);
    if (!mains || bonus == null) continue;

    rows.push({ dateISO, mains, bonus });
  }

  // De-dupe by date
  const byDate = new Map<string, Row>();
  for (const r of rows) byDate.set(r.dateISO, r);
  return [...byDate.values()];
}

function makeCsvLine(dateISO: string, mains: number[], bonus: number): string {
  const [n1, n2, n3, n4] = mains;
  return `${dateISO},${n1},${n2},${n3},${n4},${bonus}\n`;
}

/** Public API: writes canonical CSV to public/data/tx/texas_two_step.csv (unless overridden). */
export async function buildTexasTwoStepCsv(outRelPath = "public/data/tx/texas_two_step.csv") {
  const outPath = path.isAbsolute(outRelPath)
    ? outRelPath
    : path.resolve(process.cwd(), outRelPath);
  await fs.mkdir(path.dirname(outPath), { recursive: true });

  let html: string;
  try {
    html = await fetchText(HISTORY_URL);
  } catch {
    html = await fetchText(FALLBACK_URL);
  }

  const rows = extractRowsFromHtml(html);
  if (!rows.length) throw new Error("No Texas Two Step rows were extracted — page structure may have changed.");

  const lines = rows
    .map(r => makeCsvLine(r.dateISO, r.mains, r.bonus))
    .sort((a, b) => a.slice(0, 10).localeCompare(b.slice(0, 10)));

  await fs.writeFile(outPath, HEADER + lines.join(""), "utf8");
  console.log(`[TX Two Step] Wrote ${rows.length} draws to: ${outPath}`);
}

// ---------- CLI ----------
if (typeof process !== "undefined" && process.argv && process.argv[1]) {
  const thisFile = path.resolve(fileURLToPath(import.meta.url));
  const invoked = path.resolve(process.argv[1]);
  if (thisFile === invoked) {
    buildTexasTwoStepCsv().catch((e) => {
      console.error(e);
      process.exitCode = 1;
    });
  }
}
