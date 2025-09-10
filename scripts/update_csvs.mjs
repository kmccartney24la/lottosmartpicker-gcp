// scripts/update_csvs.mjs
import fs from "node:fs/promises";
import path from "node:path";

// ===== Socrata config (PB/MM/C4L) =====
const BASE = "https://data.ny.gov/resource";
const APP_TOKEN = process.env.SOCRATA_APP_TOKEN ?? ""; // optional but recommended
const HEADERS = {
  ...(APP_TOKEN ? { "X-App-Token": APP_TOKEN } : {}),
  accept: "application/json",
};

async function fetchAll(datasetId, select = "*") {
  const limit = 50000;
  let offset = 0, out = [];
  for (;;) {
    const url = `${BASE}/${datasetId}.json?$select=${encodeURIComponent(select)}&$order=draw_date&$limit=${limit}&$offset=${offset}`;
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
  return (ts || "").slice(0, 10);
}

function parseWinningNumbers(s) {
  return (s || "")
    .trim()
    .split(/\s+/)
    .map((n) => parseInt(n, 10))
    .filter((n) => Number.isFinite(n));
}

/** Normalized CSV: draw_date,num1..num5,special (special blank for Fantasy 5) */
function rowsToCSV(rows, { includeSpecial = true } = {}) {
  const header = includeSpecial
    ? "draw_date,num1,num2,num3,num4,num5,special\n"
    : "draw_date,num1,num2,num3,num4,num5\n";
  const body = rows
    .map((r) =>
      includeSpecial
        ? [r.draw_date, r.num1, r.num2, r.num3, r.num4, r.num5, r.special ?? ""].join(",")
        : [r.draw_date, r.num1, r.num2, r.num3, r.num4, r.num5].join(",")
    )
    .join("\n");
  return header + body + (body ? "\n" : "");
}

// ---------- Powerball ----------
async function buildPowerball() {
  const raw = await fetchAll("d6yy-54nr", "draw_date,winning_numbers,multiplier");
  const rows = raw
    .map((r) => {
      const nums = parseWinningNumbers(r.winning_numbers);
      const whites = nums.slice(0, 5);
      const special = nums[5];
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
  await fs.writeFile(outPath, rowsToCSV(rows, { includeSpecial: true }), "utf8");
  console.log(`Powerball rows: ${rows.length} → ${outPath}`);
}

// ---------- Mega Millions ----------
async function buildMegaMillions() {
  const raw = await fetchAll("5xaw-6ayf", "draw_date,winning_numbers,mega_ball");
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
  await fs.writeFile(outPath, rowsToCSV(rows, { includeSpecial: true }), "utf8");
  console.log(`MegaMillions rows: ${rows.length} → ${outPath}`);
}

// ---------- Cash4Life ----------
async function buildCash4Life() {
  const raw = await fetchAll("kwxv-fwze", "draw_date,winning_numbers,cash_ball");
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
  await fs.writeFile(outPath, rowsToCSV(rows, { includeSpecial: true }), "utf8");
  console.log(`Cash4Life rows: ${rows.length} → ${outPath}`);
}

// ================= Fantasy 5 (GA) =================
// Not on Socrata; scrape a public year archive with zero dependencies.
// Defaults to LotteryUSA year pages; configurable via env if you have a better source.
const F5_SOURCE_BASES = [
  process.env.F5_SOURCE_BASE?.replace(/\/+$/, "") || "",                         // optional override
  "https://www.lotteryusa.com/georgia/fantasy-5",                                // common
];
const F5_YEARS_BACK = Number.parseInt(process.env.F5_YEARS_BACK || "6", 10);     // how many past years to pull
const F5_THIS_YEAR = new Date().getFullYear();

function uniqueSortedRows(rows) {
  const map = new Map(); // key by draw_date + numbers
  for (const r of rows) {
    const key = `${r.draw_date}|${r.num1},${r.num2},${r.num3},${r.num4},${r.num5}`;
    map.set(key, r);
  }
  return Array.from(map.values()).sort((a, b) => a.draw_date.localeCompare(b.draw_date));
}

function isoDate(s) {
  // try to coerce "YYYY-MM-DD" quickly
  const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * Very forgiving HTML parser:
 * - Finds blocks that contain a date in ISO (in datetime= or inner text).
 * - In the following ~200 chars, extracts 5 integers (1–42 typical for F5).
 */
function parseFantasy5YearHtml(html) {
  const rows = [];
  const cleaned = html.replace(/\r/g, "");
  // Find many candidate date anchors like datetime="2025-08-30" OR text "2025-08-30"
  const dateRe = /(datetime\s*=\s*["'](\d{4}-\d{2}-\d{2})["'])|(\b\d{4}-\d{2}-\d{2}\b)/g;
  let m;
  while ((m = dateRe.exec(cleaned)) !== null) {
    const date = m[2] || m[3];
    const draw_date = isoDate(date);
    if (!draw_date) continue;

    // Look ahead around this match for 5 numbers
    const start = m.index;
    const window = cleaned.slice(start, start + 1000); // plenty of room
    const nums = [];
    const numRe = />(\d{1,2})<|(?:^|\D)(\d{1,2})(?=\D)/g;
    let n;
    while ((n = numRe.exec(window)) !== null) {
      const val = Number(n[1] ?? n[2]);
      if (Number.isFinite(val)) nums.push(val);
      if (nums.length >= 8) break; // don't overcollect
    }
    // Heuristic: pick the first 5 numbers between 1 and 42
    const mains = nums.filter((v) => v >= 1 && v <= 70).slice(0, 5); // tolerant; later we filter by era in app
    if (mains.length === 5) {
      rows.push({
        draw_date,
        num1: mains[0],
        num2: mains[1],
        num3: mains[2],
        num4: mains[3],
        num5: mains[4],
      });
    }
  }
  return uniqueSortedRows(rows);
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; LSP/1.0)" } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return await res.text();
}

async function tryFantasy5YearFromBases(year) {
  // Try common permutations:
  //   /<year>/
  //   /year (some sites redirect)
  //   /results/<year>/  (fallback form)
  const suffixes = [`/${year}/`, `/results/${year}/`, `/year/${year}/`, `/${year}`];
  const bases = F5_SOURCE_BASES.filter(Boolean);
  const tried = [];
  for (const base of bases) {
    for (const suf of suffixes) {
      const url = `${base}${suf}`.replace(/\/+$/, "/");
      tried.push(url);
      try {
        const html = await fetchText(url);
        const rows = parseFantasy5YearHtml(html);
        if (rows.length > 0) return { rows, url };
      } catch {}
    }
  }
  return { rows: [], url: tried[tried.length - 1] || "" };
}

async function buildGAFantasy5() {
  const all = [];
  const failures = [];
  for (let y = F5_THIS_YEAR; y >= F5_THIS_YEAR - F5_YEARS_BACK; y--) {
    const { rows, url } = await tryFantasy5YearFromBases(y);
    if (rows.length) {
      console.log(`Fantasy 5: parsed ${rows.length} rows from ${url}`);
      all.push(...rows);
    } else {
      failures.push(y);
      console.warn(`Fantasy 5: no rows parsed for year ${y}`);
    }
    // Be gentle
    await new Promise((r) => setTimeout(r, 300));
  }

  const rows = uniqueSortedRows(all);
  const outPath = path.join("public", "data", "ga", "fantasy5.csv");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(rowsToCSV(rows, { includeSpecial: false }), "utf8");

  console.log(`Fantasy 5 rows: ${rows.length} → ${outPath}`);
  if (failures.length) {
    console.log(`Fantasy 5 missed years (non-fatal): ${failures.join(", ")}`);
  }
}

// ---------------- main ----------------
async function main() {
  await buildPowerball();
  await buildMegaMillions();

  try {
    await buildCash4Life();
  } catch (err) {
    console.error("Cash4Life update failed:", err?.message ?? err);
  }

  try {
    await buildGAFantasy5();
  } catch (err) {
    // If the scrape fails entirely, we still write a header-only CSV.
    // The merge guard will keep the previous R2 file intact.
    console.error("Fantasy 5 update failed (non-fatal):", err?.message ?? err);
    const outPath = path.join("public", "data", "ga", "fantasy5.csv");
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile("public/data/ga/fantasy5.csv", "draw_date,num1,num2,num3,num4,num5\n", "utf8");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
