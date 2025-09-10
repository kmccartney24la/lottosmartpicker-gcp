// scripts/update_csvs.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { buildFantasy5Csv } from "./sources/fantasy5.mjs";

const BASE = "https://data.ny.gov/resource";
const APP_TOKEN = process.env.SOCRATA_APP_TOKEN ?? ""; // optional but recommended

const HEADERS = {
  ...(APP_TOKEN ? { "X-App-Token": APP_TOKEN } : {}),
  accept: "application/json",
};

async function fetchAll(datasetId, select = "*") {
  // Pull in chunks to be nice to the API
  const limit = 50000; // large enough for these datasets
  let offset = 0,
    out = [];
  while (true) {
    const url = `${BASE}/${datasetId}.json?$select=${encodeURIComponent(
      select
    )}&$order=draw_date&$limit=${limit}&$offset=${offset}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`Socrata ${datasetId} ${res.status}`);
    const chunk = await res.json();
    out = out.concat(chunk);
    if (chunk.length < limit) break;
    offset += limit;
  }
  return out;
}

function toYMD(ts) {
  // incoming draw_date may be "YYYY-MM-DDT00:00:00.000"
  return (ts || "").slice(0, 10);
}

function parseWinningNumbers(s) {
  // Split on spaces, tolerate double spaces
  return (s || "")
    .trim()
    .split(/\s+/)
    .map((n) => parseInt(n, 10))
    .filter((n) => Number.isFinite(n));
}

/** Normalized CSV: draw_date,num1..num5,special */
function rowsToCSV(rows) {
  const header = "draw_date,num1,num2,num3,num4,num5,special\n";
  const body = rows
    .map((r) =>
      [
        r.draw_date,
        r.num1,
        r.num2,
        r.num3,
        r.num4,
        r.num5,
        r.special ?? "",
      ].join(",")
    )
    .join("\n");
  return header + body + (body ? "\n" : "");
}

// --- Powerball (d6yy-54nr): winning_numbers contains 6 numbers; multiplier separate.
async function buildPowerball() {
  const raw = await fetchAll(
    "d6yy-54nr",
    "draw_date,winning_numbers,multiplier"
  );
  const rows = raw
    .map((r) => {
      const nums = parseWinningNumbers(r.winning_numbers);
      const whites = nums.slice(0, 5);
      const special = nums[5]; // powerball
      if (whites.length !== 5 || !Number.isFinite(special)) return null;
      return {
        draw_date: toYMD(r.draw_date),
        num1: whites[0],
        num2: whites[1],
        num3: whites[2],
        num4: whites[3],
        num5: whites[4],
        special,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.draw_date.localeCompare(b.draw_date));
  const outPath = path.join("public", "data", "multi", "powerball.csv");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, rowsToCSV(rows), "utf8");
  console.log(`Powerball rows: ${rows.length} → ${outPath}`);
}

// --- Mega Millions (5xaw-6ayf): winning_numbers + mega_ball column
async function buildMegaMillions() {
  const raw = await fetchAll(
    "5xaw-6ayf",
    "draw_date,winning_numbers,mega_ball"
  );
  const rows = raw
    .map((r) => {
      const whites = parseWinningNumbers(r.winning_numbers).slice(0, 5);
      const special = parseInt(r.mega_ball, 10);
      if (whites.length !== 5 || !Number.isFinite(special)) return null;
      return {
        draw_date: toYMD(r.draw_date),
        num1: whites[0],
        num2: whites[1],
        num3: whites[2],
        num4: whites[3],
        num5: whites[4],
        special,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.draw_date.localeCompare(b.draw_date));
  const outPath = path.join("public", "data", "multi", "megamillions.csv");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, rowsToCSV(rows), "utf8");
  console.log(`MegaMillions rows: ${rows.length} → ${outPath}`);
}

// --- Cash4Life (kwxv-fwze): winning_numbers + (cash_ball | cashball) varies by schema.
async function buildCash4Life() {
  // ✅ Only real fields on this dataset
  const raw = await fetchAll(
    "kwxv-fwze",
    "draw_date,winning_numbers,cash_ball"
  );

  const rows = raw
    .map((r) => {
      const nums = parseWinningNumbers(r.winning_numbers);
      const whites = nums.slice(0, 5);
      const special = Number.parseInt(r.cash_ball ?? "", 10);
      if (whites.length !== 5 || !Number.isFinite(special)) return null;

      return {
        draw_date: toYMD(r.draw_date),
        num1: whites[0],
        num2: whites[1],
        num3: whites[2],
        num4: whites[3],
        num5: whites[4],
        special,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.draw_date.localeCompare(b.draw_date));

  const outPath = path.join("public", "data", "ga", "cash4life.csv");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, rowsToCSV(rows), "utf8");
  console.log(`Cash4Life rows: ${rows.length} → ${outPath}`);
}

/* =========================
   Fantasy 5 (GA) — HTML archive (lottery.net)
   Pages like:
     https://www.lottery.net/georgia/fantasy-5/numbers/2025
     https://www.lottery.net/georgia/fantasy-5/numbers/2019
   Each page lists date + 5 numbers (no “special” ball).

   Implementation goals:
   - No external deps. Regex-based HTML extraction.
   - Exactly 5 integers right inside the balls list, otherwise skip line.
   - Normalize date to YYYY-MM-DD.
   - Walk from current year back until the first available year.
   - Non-fatal if a given year yields zero rows (log + continue).
========================= */

// Month map for “Monday September 1, 2025” style
const MONTHS = new Map(
  [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ].map((m, i) => [m, i + 1])
);

function toYMDfromMDYWords(label) {
  // Input like: "Monday September 1, 2025"
  const m = label
    .trim()
    .match(
      /^(?:Sun|Mon|Tues|Wednes|Thurs|Fri|Satur)day\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/i
    );
  if (!m) return null;
  const month = MONTHS.get(m[1].toLowerCase());
  const day = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (!month || !day || !year) return null;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

// Extract all draw blocks from a yearly HTML page.
// Strategy (more precise and resilient):
//  - Capture the visible date text AND the *nearest* following balls list in one regex.
//  - Require the balls list <ul> to have a "balls" class to avoid grabbing nav lists.
//  - Inside the UL, collect five <li> values that are 1–99 and ignore anything else.
function extractFantasy5FromYearHtml(html, expectYear) {
  const out = [];
  const RE = />\s*((?:Sun|Mon|Tues|Wednes|Thurs|Fri|Satur)day\s+[A-Za-z]+\s+\d{1,2},\s+\d{4})\s*<[^>]*?\/a>[^]*?<ul[^>]*class="[^"]*\bballs\b[^"]*"[^>]*>([^]*?)<\/ul>/gi;
  let m;
  while ((m = RE.exec(html)) !== null) {
    const ymd = toYMDfromMDYWords(m[1]);
    if (!ymd) continue;
    const y = parseInt(ymd.slice(0, 4), 10);
    // Be tolerant of year boundaries; we dedupe later
    if (expectYear && (y < expectYear - 1 || y > expectYear + 1)) continue;
    const ul = m[2] || "";
    const nums = Array.from(ul.matchAll(/<li[^>]*>\s*(\d{1,2})\s*<\/li>/gi))
      .map((mm) => parseInt(mm[1], 10))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 99);
    if (nums.length >= 5) {
      const [a, b, c, d, e] = nums.slice(0, 5);
      out.push({ draw_date: ymd, num1: a, num2: b, num3: c, num4: d, num5: e, special: "" });
    }
  }
  return out;
}

async function fetchFantasy5Year(year) {
  const url = `https://www.lottery.net/georgia/fantasy-5/numbers/${year}`;
  const res = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "accept-language": "en",
      // be a decent citizen
      "user-agent":
        "Lottery-Analysis-App/1.0 (+https://github.com/your-repo; contact: ops)",
    },
  });
  if (!res.ok) {
    // 404 or other: treat as “no data this year”
    return { year, rows: [], ok: false, status: res.status };
  }
  const html = await res.text();
  const rows = extractFantasy5FromYearHtml(html, year);
  return { year, rows, ok: true, status: 200 };
}

async function buildFantasy5() {
  const outPath = path.join("public", "data", "ga", "fantasy5.csv");
  await fs.mkdir(path.dirname(outPath), { recursive: true });

  const thisYear = new Date().getFullYear();
  const firstYear = 1994; // archive goes back to 1994 on the source used
  const missed = [];
  let all = [];

  for (let y = thisYear; y >= firstYear; y--) {
    try {
      const { rows, ok, status } = await fetchFantasy5Year(y);
      if (!ok || rows.length === 0) {
        console.log(
          `Fantasy 5: no rows parsed for year ${y}${ok ? "" : ` (HTTP ${status})`}`
        );
        missed.push(y);
        continue;
      }
      console.log(`Fantasy 5: parsed ${rows.length} rows for ${y}`);
      all = all.concat(rows);
    } catch (err) {
      console.log(`Fantasy 5: error parsing year ${y}: ${err?.message ?? err}`);
      missed.push(y);
    }
  }

  // De-dupe by date (if any overlap across pages) and sort
  const byDate = new Map();
  for (const r of all) {
    // sanity: exactly five distinct ints, strictly increasing after sort
    const whitelist = [r.num1, r.num2, r.num3, r.num4, r.num5].map(Number);
    if (whitelist.length !== 5 || whitelist.some((n) => !Number.isFinite(n))) continue;
    byDate.set(r.draw_date, r);
  }
  const rows = Array.from(byDate.values()).sort((a, b) =>
    a.draw_date.localeCompare(b.draw_date)
  );

  await fs.writeFile(outPath, rowsToCSV(rows), "utf8");
  console.log(`Fantasy 5 rows: ${rows.length} → ${outPath}`);
  if (missed.length) {
    // Non-fatal
    console.log(
      `Fantasy 5 missed years (non-fatal): ${missed.sort((a, b) => a - b).join(", ")}`
    );
  }
}

async function main() {
  await buildPowerball();
  await buildMegaMillions();

  try {
    await buildCash4Life();
  } catch (err) {
    // Don’t fail the whole job if C4L has a transient issue.
    console.error("Cash4Life update failed:", err?.message ?? err);
  }

  try {
    await buildFantasy5();
  } catch (err) {
    // Don’t fail the whole job if Fantasy5 source hiccups.
    console.error("Fantasy 5 update failed:", err?.message ?? err);
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
