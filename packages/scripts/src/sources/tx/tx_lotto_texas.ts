// Node 18+ ESM.
// Scrapes Lotto Texas Past Winning Numbers HTML table into canonical CSV
// (6th main goes into `special` to align with your existing CSV schema).

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const HISTORY_URL =
  process.env.TX_LOTTO_HISTORY_URL?.trim() ||
  // Your provided CMS’d URL:
  "https://www.texaslottery.com/export/sites/lottery/Games/Lotto_Texas/Winning_Numbers/index.html_2013354932.html";

const FALLBACK_URL =
  "https://www.texaslottery.com/export/sites/lottery/Games/Lotto_Texas/Winning_Numbers/index.html";

const HTTP_TIMEOUT_MS = Number(process.env.TX_HTTP_TIMEOUT_MS ?? 20000);
const HEADER = "draw_date,num1,num2,num3,num4,num5,special\n";

const BASE_HEADERS: Record<string, string> = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};

function toISO(dateLike: string): string | null {
  // mm/dd/yyyy
  const m = dateLike.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function parseNums(cellText: string): number[] | null {
  // Example: "4 - 10 - 12 - 15 - 28 - 54"
  const parts = cellText.split(/[-–—]/).map(s => s.trim());
  const nums = parts
    .map(p => Number(p.replace(/[^\d]/g, "")))
    .filter(n => Number.isFinite(n)) as number[];

  if (nums.length !== 6) return null;
  // Lotto Texas uses 1..54, distinct
  const distinct = new Set(nums);
  if (distinct.size !== 6) return null;
  if (!nums.every(n => n >= 1 && n <= 54)) return null;

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

function absolutize(base: string, href: string) {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

type Row = { dateISO: string; nums: number[] };

/**
 * Minimal, dependency-free extractor:
 *  - Find rows that contain `<a class="detailsLink">DATE</a>`
 *  - Capture the next <td> as the numbers cell.
 */
function extractRowsFromHtml(html: string, baseUrl: string): Row[] {
  const rows: Row[] = [];
  // Very tolerant <tr> capture (won’t break on extra attributes/whitespace)
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch: RegExpExecArray | null;

  while ((trMatch = trRe.exec(html))) {
    const tr = trMatch[1];

    // Date cell (anchor with class=detailsLink)
    const dateAnchorRe = /<a[^>]*class=["'][^"']*detailsLink[^"']*["'][^>]*>([^<]+)<\/a>/i;
    const dm = dateAnchorRe.exec(tr);
    if (!dm) continue;

    const dateText = dm[1].trim();
    const dateISO = toISO(dateText);
    if (!dateISO) continue;

    // Next TD after the anchor is the numbers cell, but rows are simple:
    // <td><a class="detailsLink">DATE</a></td>\s*<td>NUMS</td>
    // So we’ll just capture all <td>’s and use the second one.
    const tds = [...tr.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1]);
    if (tds.length < 2) continue;

    const numsCell = tds[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const nums = parseNums(numsCell);
    if (!nums) continue;

    rows.push({ dateISO, nums });
  }

  // De-dupe by date
  const byDate = new Map<string, Row>();
  for (const r of rows) byDate.set(r.dateISO, r);
  return [...byDate.values()];
}

function makeCsvLine(dateISO: string, vals: number[]): string {
  const [n1, n2, n3, n4, n5, n6] = vals;
  // Put 6th main in `special` to match your schema.
  return `${dateISO},${n1},${n2},${n3},${n4},${n5},${n6}\n`;
}

/** Public API: writes canonical CSV to public/data/tx/lotto_texas.csv (unless overridden). */
export async function buildTexasLottoCsv(outRelPath = "public/data/tx/lotto_texas.csv") {
  const outPath = path.isAbsolute(outRelPath)
    ? outRelPath
    : path.resolve(process.cwd(), outRelPath);

  await fs.mkdir(path.dirname(outPath), { recursive: true });

  let html: string;
  try {
    html = await fetchText(HISTORY_URL);
  } catch {
    // fallback to the “clean” index URL if the CMS’d one fails
    html = await fetchText(FALLBACK_URL);
  }

  const rows = extractRowsFromHtml(html, HISTORY_URL);
  if (!rows.length) {
    throw new Error("No Lotto Texas rows were extracted — page structure may have changed.");
  }

  const lines = rows
    .map(r => makeCsvLine(r.dateISO, r.nums))
    .sort((a, b) => a.slice(0, 10).localeCompare(b.slice(0, 10)));

  await fs.writeFile(outPath, HEADER + lines.join(""), "utf8");
  console.log(`[TX Lotto Texas] Wrote ${rows.length} draws to: ${outPath}`);
}

// ---------- CLI ----------
if (typeof process !== "undefined" && process.argv && process.argv[1]) {
  const thisFile = path.resolve(fileURLToPath(import.meta.url));
  const invoked = path.resolve(process.argv[1]);
  if (thisFile === invoked) {
    buildTexasLottoCsv().catch((e) => {
      console.error(e);
      process.exitCode = 1;
    });
  }
}
