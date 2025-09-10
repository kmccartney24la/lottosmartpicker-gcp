// scripts/update_csvs.mjs
import fs from "node:fs/promises";
import path from "node:path";

// ---------- Shared helpers ----------
const BASE = "https://data.ny.gov/resource";
const APP_TOKEN = process.env.SOCRATA_APP_TOKEN ?? ""; // optional but recommended
const HEADERS = {
  ...(APP_TOKEN ? { "X-App-Token": APP_TOKEN } : {}),
  accept: "application/json",
};

// Small helper to add a conservative UA for HTML sources
const UA_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

function toYMD(ts) {
  // incoming draw_date may be "YYYY-MM-DDT00:00:00.000"
  return (ts || "").slice(0, 10);
}

function parseWinningNumbers(s) {
  // Split on spaces, tolerate double spaces and hyphens
  return (s || "")
    .replace(/-/g, " ")
    .trim()
    .split(/\s+/)
    .map((n) => parseInt(n, 10))
    .filter((n) => Number.isFinite(n));
}

/** Normalized CSVs */
function rowsToCSVWithSpecial(rows) {
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
      ].join(","),
    )
    .join("\n");
  return header + body + (body ? "\n" : "");
}

function rowsToCSVNoSpecial(rows) {
  const header = "draw_date,num1,num2,num3,num4,num5\n";
  const body = rows
    .map((r) => [r.draw_date, r.num1, r.num2, r.num3, r.num4, r.num5].join(","))
    .join("\n");
  return header + body + (body ? "\n" : "");
}

// Pull Socrata datasets in chunks
async function fetchAll(datasetId, select = "*") {
  const limit = 50000;
  let offset = 0,
    out = [];
  while (true) {
    const url = `${BASE}/${datasetId}.json?$select=${encodeURIComponent(
      select,
    )}&$order=draw_date&$limit=${limit}&$offset=${offset}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok)
      throw new Error(`Socrata ${datasetId} ${res.status} ${await res.text()}`);
    const chunk = await res.json();
    out = out.concat(chunk);
    if (chunk.length < limit) break;
    offset += limit;
  }
  return out;
}

// ---------- Builders using Socrata ----------
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
  await fs.writeFile(outPath, rowsToCSVWithSpecial(rows), "utf8");
  console.log(`Powerball rows: ${rows.length} → ${outPath}`);
}

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
  await fs.writeFile(outPath, rowsToCSVWithSpecial(rows), "utf8");
  console.log(`MegaMillions rows: ${rows.length} → ${outPath}`);
}

async function buildCash4Life() {
  const raw = await fetchAll(
    "kwxv-fwze",
    "draw_date,winning_numbers,cash_ball",
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
  await fs.writeFile(outPath, rowsToCSVWithSpecial(rows), "utf8");
  console.log(`Cash4Life rows: ${rows.length} → ${outPath}`);
}

// ---------- Fantasy 5 (no Socrata) ----------
// We scrape year archives from LotteryUSA. Two URL patterns are tried.
// Example patterns (historically):
//   https://www.lotteryusa.com/georgia/fantasy-5/year?year=2025
//   https://www.lotteryusa.com/georgia/fantasy-5/2025/
//
// The HTML varies over time, so we use tolerant regexes:
// - Date in the row, then a group of exactly five ints separated by spaces or hyphens.
// - We normalize month/day names via Date() and serialize to YYYY-MM-DD.
function tryParseFantasy5HTML(html) {
  const rows = [];

  // Normalize spaces
  const text = html.replace(/\r/g, "").replace(/\t/g, " ");

  // 1) Common pattern: a date near 5 numbers like "12-19-26-30-39"
  //    We'll look for yyyy-mm-dd or "Mon, Aug 30, 2025" or "Aug 30, 2025" nearby.
  const numberRe =
    /(?:^|[^\d])(?!\d{6,})(\d{1,2})[-\s]+(\d{1,2})[-\s]+(\d{1,2})[-\s]+(\d{1,2})[-\s]+(\d{1,2})(?!\d)/g;

  // To find a date for each match, search backward a bit for a date-ish string.
  const around = 300; // chars to look back for a date
  const dateSnippets = [
    // 2025-08-30 or 2025/08/30
    /(\d{4})[/-](\d{1,2})[/-](\d{1,2})/,
    // Aug 30, 2025 or August 30, 2025 (optional weekday prefix)
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),\s*(\d{4})/i,
    // Sat, Aug 30, 2025 (weekday, comma)
    /(Sun|Mon|Tue|Wed|Thu|Fri|Sat)[a-z]*,\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),\s*(\d{4})/i,
  ];

  let m;
  while ((m = numberRe.exec(text)) !== null) {
    const nums = [m[1], m[2], m[3], m[4], m[5]].map((v) => parseInt(v, 10));
    if (nums.some((n) => !Number.isFinite(n))) continue;

    // ignore obvious non-lottery sequences (e.g., "404 2025 5 0 1")
    if (nums.find((n) => n < 1 || n > 42)) continue;

    const idx = m.index;
    const start = Math.max(0, idx - around);
    const ctx = text.slice(start, idx + 1);

    let foundDate = null;
    for (const re of dateSnippets) {
      const d = re.exec(ctx);
      if (!d) continue;

      // normalize to Date()
      let iso = null;
      if (re === dateSnippets[0]) {
        // yyyy-mm-dd
        const y = parseInt(d[1], 10);
        const mo = parseInt(d[2], 10);
        const da = parseInt(d[3], 10);
        iso = new Date(Date.UTC(y, mo - 1, da)).toISOString().slice(0, 10);
      } else if (re === dateSnippets[1]) {
        const y = parseInt(d[3], 10);
        const mo = d[1];
        const da = parseInt(d[2], 10);
        iso = new Date(`${mo} ${da}, ${y} UTC`).toISOString().slice(0, 10);
      } else {
        // weekday, Month day, year
        const y = parseInt(d[4], 10);
        const mo = d[2];
        const da = parseInt(d[3], 10);
        iso = new Date(`${mo} ${da}, ${y} UTC`).toISOString().slice(0, 10);
      }

      if (iso) {
        foundDate = iso;
        break;
      }
    }

    if (!foundDate) continue;

    const [n1, n2, n3, n4, n5] = nums;
    rows.push({
      draw_date: foundDate,
      num1: n1,
      num2: n2,
      num3: n3,
      num4: n4,
      num5: n5,
    });
  }

  return rows;
}

async function fetchFantasy5Year(year) {
  const urls = [
    `https://www.lotteryusa.com/georgia/fantasy-5/year?year=${year}`,
    `https://www.lotteryusa.com/georgia/fantasy-5/${year}/`,
  ];

  for (const url of urls) {
    const res = await fetch(url, { headers: UA_HEADERS });
    if (!res.ok) continue;
    const html = await res.text();
    const rows = tryParseFantasy5HTML(html);
    if (rows.length > 0) return rows;
  }

  return [];
}

async function buildGAFantasy5() {
  const thisYear = new Date().getUTCFullYear();
  // Conservative start year for current ruleset
  const startYear = 2019;

  const all = [];
  const missed = [];
  for (let y = thisYear; y >= startYear; y--) {
    try {
      const rows = await fetchFantasy5Year(y);
      if (rows.length === 0) {
        console.log(`Fantasy 5: no rows parsed for year ${y}`);
        missed.push(y);
        continue;
      }
      all.push(...rows);
    } catch (err) {
      console.log(`Fantasy 5: fetch/parse failed for ${y}:`, err?.message ?? err);
      missed.push(y);
    }
  }

  // de-dupe by (date + numbers)
  const key = (r) =>
    `${r.draw_date}|${r.num1},${r.num2},${r.num3},${r.num4},${r.num5}`;
  const seen = new Set();
  const deduped = [];
  for (const r of all) {
    const k = key(r);
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(r);
  }

  deduped.sort((a, b) => a.draw_date.localeCompare(b.draw_date));

  const outPath = path.join("public", "data", "ga", "fantasy5.csv");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(rowsToCSVNoSpecial(deduped), rowsToCSVNoSpecial.name ? "utf8" : "utf8"); // keeps Node happy

  console.log(`Fantasy 5 rows: ${deduped.length} → ${outPath}`);
  if (missed.length) {
    console.log(
      `Fantasy 5 missed years (non-fatal): ${missed.sort().join(", ")}`,
    );
  }
}

// ---------- Main ----------
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
    // Non-fatal: we’ll keep previous R2 copy via the merge guard in the workflow
    console.error("Fantasy 5 update failed:", err?.message ?? err);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
