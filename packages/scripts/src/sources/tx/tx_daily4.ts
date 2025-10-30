// Node 18+ ESM.
// Scrapes Texas Daily 4 (with FIREBALL) Past Winning Numbers into four canonical CSVs
//   • public/data/tx/daily4_morning.csv
//   • public/data/tx/daily4_day.csv
//   • public/data/tx/daily4_evening.csv
//   • public/data/tx/daily4_night.csv
//
// Schema for each CSV: draw_date,ball1,ball2,ball3,ball4,fb
//  - draw_date is YYYY-MM-DD (ISO)
//  - fb is optional; left blank when absent
//
// Page structure mirrors Pick 3: each <tr> contains:
//   <td><a class="detailsLink">MM/DD/YYYY</a></td>
//   <td>MORNING numbers</td><td>MORNING FB</td>
//   <td>DAY numbers</td><td>DAY FB</td>
//   <td>EVENING numbers</td><td>EVENING FB</td>
//   <td>NIGHT numbers</td><td>NIGHT FB</td>

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const HISTORY_URL =
  process.env.TX_D4_HISTORY_URL?.trim() ||
  "https://www.texaslottery.com/export/sites/lottery/Games/Daily_4/Winning_Numbers/index.html_553953088.html";

const FALLBACK_URL =
  "https://www.texaslottery.com/export/sites/lottery/Games/Daily_4/Winning_Numbers/index.html";

const HTTP_TIMEOUT_MS = Number(process.env.TX_HTTP_TIMEOUT_MS ?? 20000);
const HEADER = "draw_date,ball1,ball2,ball3,ball4,fb\n";

const OUT_MORNING = process.env.TX_D4_OUT_MORNING || "public/data/tx/daily4_morning.csv";
const OUT_DAY      = process.env.TX_D4_OUT_DAY      || "public/data/tx/daily4_day.csv";
const OUT_EVENING  = process.env.TX_D4_OUT_EVENING  || "public/data/tx/daily4_evening.csv";
const OUT_NIGHT    = process.env.TX_D4_OUT_NIGHT    || "public/data/tx/daily4_night.csv";

const BASE_HEADERS: Record<string, string> = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};

// ---------- helpers ----------
function toISOfromMDY(dateLike: string): string | null {
  const m = dateLike.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const [, mm, dd, yy] = m;
  const yyyy = yy.length === 2 ? (Number(yy) >= 80 ? 1900 + Number(yy) : 2000 + Number(yy)) : Number(yy);
  const d = new Date(Date.UTC(yyyy, Number(mm) - 1, Number(dd)));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}

function parseDigitsCell(cellText: string): number[] | null {
  // e.g. "9 - 7 - 8 - 2" with various dashes/spaces &nbsp;
  const clean = cellText
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-")
    .replace(/&nbsp;/gi, " ");
  const parts = clean.split(/-/).map(s => s.trim()).filter(Boolean);
  if (parts.length !== 4) return null;
  const nums = parts.map(p => Number(p.replace(/[^0-9]/g, "")));
  if (!nums.every(n => Number.isInteger(n) && n >= 0 && n <= 9)) return null;
  return nums as number[];
}

function parseFB(cellText: string): number | null {
  const n = Number(String(cellText).replace(/[^0-9]/g, ""));
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 9) return null;
  return n;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS), headers: BASE_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  return await res.text();
}

// ---------- extraction ----------
const SESSIONS = ["morning", "day", "evening", "night"] as const;
export type Session = typeof SESSIONS[number];

export type Row = { dateISO: string; session: Session; digits: [number, number, number, number]; fb?: number };

function extractRowsFromHtml(html: string): Row[] {
  const out: Row[] = [];

  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;

  while ((m = trRe.exec(html))) {
    const trHtml = m[1];

    // Date
    const dm = /<a[^>]*class=["'][^"']*detailsLink[^"']*["'][^>]*>([^<]+)<\/a>/i.exec(trHtml);
    if (!dm) continue;
    const dateISO = toISOfromMDY(dm[1]);
    if (!dateISO) continue;

    // Capture all <td> contents for the row, in order
    const tds = [...trHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1]);
    if (tds.length < 9) continue; // date + 4*(nums,fb) = 9

    // Remove the first (date) cell
    const cells = tds.slice(1).map(html => stripTags(html));

    // Walk as pairs
    for (let i = 0; i < 8; i += 2) {
      const sess = SESSIONS[i / 2];
      const numsCell = cells[i] ?? "";
      const fbCell = cells[i + 1] ?? "";

      const digits = parseDigitsCell(numsCell);
      if (!digits) continue; // skip if blank or malformed

      const fb = parseFB(fbCell) ?? undefined; // tolerate missing FB
      out.push({ dateISO, session: sess, digits: [digits[0], digits[1], digits[2], digits[3]], fb });
    }
  }

  // De‑dupe by (date, session) keeping the one that has FB if duplicates occur
  const byKey = new Map<string, Row>();
  for (const r of out) {
    const k = `${r.dateISO}|${r.session}`;
    const prev = byKey.get(k);
    if (!prev || (r.fb != null && prev.fb == null)) byKey.set(k, r);
  }

  return [...byKey.values()].sort((a, b) =>
    a.dateISO === b.dateISO ? SESSIONS.indexOf(a.session) - SESSIONS.indexOf(b.session) : a.dateISO.localeCompare(b.dateISO)
  );
}

function linesForSession(rows: Row[], want: Session): string[] {
  return rows
    .filter(r => r.session === want)
    .map(r => {
      const [a, b, c, d] = r.digits;
      const fb = r.fb == null ? "" : String(r.fb);
      return `${r.dateISO},${a},${b},${c},${d},${fb}`;
    });
}

async function writeCsv(outRel: string, lines: string[]): Promise<void> {
  const outPath = path.isAbsolute(outRel) ? outRel : path.resolve(process.cwd(), outRel);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, HEADER + lines.join("\n") + "\n", "utf8");
}

// ---------- Public API ----------
export async function buildTexasDaily4Csvs(
  outMorningRel = OUT_MORNING,
  outDayRel = OUT_DAY,
  outEveningRel = OUT_EVENING,
  outNightRel = OUT_NIGHT
) {
  let html: string;
  try {
    html = await fetchText(HISTORY_URL);
  } catch {
    html = await fetchText(FALLBACK_URL);
  }

  const rows = extractRowsFromHtml(html);
  if (!rows.length) throw new Error("No Texas Daily 4 rows were extracted — page structure may have changed.");

  await writeCsv(outMorningRel, linesForSession(rows, "morning"));
  await writeCsv(outDayRel,      linesForSession(rows, "day"));
  await writeCsv(outEveningRel,  linesForSession(rows, "evening"));
  await writeCsv(outNightRel,    linesForSession(rows, "night"));

  const c = {
    morning: rows.filter(r => r.session === "morning").length,
    day: rows.filter(r => r.session === "day").length,
    evening: rows.filter(r => r.session === "evening").length,
    night: rows.filter(r => r.session === "night").length,
  };
  console.log(`[TX Daily 4] Wrote ${c.morning} morning, ${c.day} day, ${c.evening} evening, ${c.night} night rows.`);
}

// ---------- CLI ----------
if (typeof process !== "undefined" && process.argv && process.argv[1]) {
  const thisFile = path.resolve(fileURLToPath(import.meta.url));
  const invoked = path.resolve(process.argv[1]);
  if (thisFile === invoked) {
    buildTexasDaily4Csvs().catch((e) => {
      console.error(e);
      process.exitCode = 1;
    });
  }
}
