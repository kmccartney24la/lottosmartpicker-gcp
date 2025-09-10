// scripts/update_csvs.mjs
import fs from "node:fs/promises";
import path from "node:path";

const BASE = "https://data.ny.gov/resource";
const APP_TOKEN = process.env.SOCRATA_APP_TOKEN ?? ""; // optional but recommended

const HEADERS = {
  ...(APP_TOKEN ? { "X-App-Token": APP_TOKEN } : {}),
  "accept": "application/json",
};

// ----- shared helpers --------------------------------------------------------

async function fetchAll(datasetId, select = "*") {
  // Pull in chunks to be nice to the API
  const limit = 50000; // large enough for these datasets
  let offset = 0, out = [];
  while (true) {
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
  // incoming draw_date may be "YYYY-MM-DDT00:00:00.000"
  return (ts || "").slice(0, 10);
}

function parseWinningNumbers(s) {
  // Split on spaces, tolerate double spaces
  return (s || "")
    .trim()
    .split(/\s+/)
    .map(n => parseInt(n, 10))
    .filter(n => Number.isFinite(n));
}

/** Normalized CSV: draw_date,num1..num5,special */
function rowsToCSV(rows) {
  const header = "draw_date,num1,num2,num3,num4,num5,special\n";
  const body = rows
    .map(r =>
      [
        r.draw_date,
        r.num1, r.num2, r.num3, r.num4, r.num5,
        r.special ?? "",
      ].join(",")
    )
    .join("\n");
  return header + body + (body ? "\n" : "");
}

// ----- PB / MM / C4L (Socrata) ----------------------------------------------

async function buildPowerball() {
  const raw = await fetchAll("d6yy-54nr", "draw_date,winning_numbers,multiplier");
  const rows = raw.map(r => {
    const nums = parseWinningNumbers(r.winning_numbers);
    const whites = nums.slice(0, 5);
    const special = nums[5]; // powerball
    if (whites.length !== 5 || !Number.isFinite(special)) return null;
    return {
      draw_date: toYMD(r.draw_date),
      num1: whites[0], num2: whites[1], num3: whites[2], num4: whites[3], num5: whites[4],
      special,
    };
  }).filter(Boolean).sort((a, b) => a.draw_date.localeCompare(b.draw_date));
  const outPath = path.join("public", "data", "multi", "powerball.csv");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, rowsToCSV(rows), "utf8");
  console.log(`Powerball rows: ${rows.length} → ${outPath}`);
}

async function buildMegaMillions() {
  const raw = await fetchAll("5xaw-6ayf", "draw_date,winning_numbers,mega_ball");
  const rows = raw.map(r => {
    const whites = parseWinningNumbers(r.winning_numbers).slice(0, 5);
    const special = parseInt(r.mega_ball, 10);
    if (whites.length !== 5 || !Number.isFinite(special)) return null;
    return {
      draw_date: toYMD(r.draw_date),
      num1: whites[0], num2: whites[1], num3: whites[2], num4: whites[3], num5: whites[4],
      special,
    };
  }).filter(Boolean).sort((a, b) => a.draw_date.localeCompare(b.draw_date));
  const outPath = path.join("public", "data", "multi", "megamillions.csv");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, rowsToCSV(rows), "utf8");
  console.log(`MegaMillions rows: ${rows.length} → ${outPath}`);
}

async function buildCash4Life() {
  const raw = await fetchAll("kwxv-fwze", "draw_date,winning_numbers,cash_ball");
  const rows = raw.map(r => {
    const nums = parseWinningNumbers(r.winning_numbers);
    const whites = nums.slice(0, 5);
    const special = Number.parseInt(r.cash_ball ?? "", 10);
    if (whites.length !== 5 || !Number.isFinite(special)) return null;

    return {
      draw_date: toYMD(r.draw_date),
      num1: whites[0], num2: whites[1], num3: whites[2], num4: whites[3], num5: whites[4],
      special,
    };
  }).filter(Boolean).sort((a, b) => a.draw_date.localeCompare(b.draw_date));

  const outPath = path.join("public", "data", "ga", "cash4life.csv");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, rowsToCSV(rows), "utf8");
  console.log(`Cash4Life rows: ${rows.length} → ${outPath}`);
}

// ----- Fantasy 5 (GA): scrape LotteryUSA "last year" archive -----------------
// Source: https://www.lotteryusa.com/georgia/fantasy-5/year
// We parse dates like "Monday,  Sep 8, 2025" followed by 5 numbers.
// No external deps; tolerant to minor markup changes.

function monthStrToNum(m) {
  const map = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", sept: "09", oct: "10", nov: "11", dec: "12",
  };
  return map[m.toLowerCase()] ?? null;
}

function textifyHTML(html) {
  // Remove scripts/styles; turn tags into newlines; collapse whitespace.
  html = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  html = html.replace(/<style[\s\S]*?<\/style>/gi, " ");
  html = html.replace(/<br\s*\/?>/gi, "\n");
  html = html.replace(/<\/(p|li|h\d|tr|div|section|article)>/gi, "\n");
  html = html.replace(/<[^>]+>/g, " ");
  html = html.replace(/&nbsp;/g, " ");
  html = html.replace(/&amp;/g, "&");
  html = html.replace(/&middot;/g, "·");
  // normalize spaces + unix newlines
  return html.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n");
}

function* scanFantasy5FromLines(lines) {
  // Date line examples (allow single/double spaces):
  // "Monday,  Sep 8, 2025"
  const dayNames = "(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day";
  const monthNames = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*";
  const dateRe = new RegExp(`^${dayNames},\\s+(${monthNames})\\s+(\\d{1,2}),\\s+(\\d{4})$`, "i");

  // walk the lines; when we hit a date, collect the next five integers
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const m = line.match(dateRe);
    if (!m) continue;

    const month = monthStrToNum(m[1]);
    const day = String(parseInt(m[2], 10)).padStart(2, "0");
    const year = m[3];
    if (!month) continue;
    const draw_date = `${year}-${month}-${day}`;

    const nums = [];
    let j = i + 1;
    while (j < lines.length && nums.length < 5) {
      const n = parseInt(lines[j].trim(), 10);
      if (Number.isFinite(n)) nums.push(n);
      j++;
    }
    if (nums.length === 5) {
      yield { draw_date, num1: nums[0], num2: nums[1], num3: nums[2], num4: nums[3], num5: nums[4] };
    }
  }
}

async function buildFantasy5() {
  const url = "https://www.lotteryusa.com/georgia/fantasy-5/year";
  const res = await fetch(url, {
    headers: {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) NodeFetch/1 Safari/537.36",
    },
  });
  if (!res.ok) throw new Error(`Fantasy5 fetch ${res.status}`);
  const html = await res.text();
  const text = textifyHTML(html);

  const lines = text.split("\n").map(s => s.trim()).filter(Boolean);

  // pass 1: extract rows from the "last year" page
  const rows = Array.from(scanFantasy5FromLines(lines));

  if (rows.length === 0) {
    console.log("Fantasy 5: parsed 0 rows from LotteryUSA last-year page");
  }

  // Normalize, sort by date asc, and assign special="" to match app schema
  const outRows = rows
    .map(r => ({
      draw_date: r.draw_date,
      num1: r.num1, num2: r.num2, num3: r.num3, num4: r.num4, num5: r.num5,
      special: "", // Fantasy 5 has no special ball
    }))
    .sort((a, b) => a.draw_date.localeCompare(b.draw_date));

  const outPath = path.join("public", "data", "ga", "fantasy5.csv");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, rowsToCSV(outRows), "utf8");
  console.log(`Fantasy 5 rows: ${outRows.length} → ${outPath}`);
}

// ----- main ------------------------------------------------------------------

async function main() {
  await buildPowerball();
  await buildMegaMillions();

  try {
    await buildCash4Life();
  } catch (err) {
    console.error("Cash4Life update failed:", err?.message ?? err);
  }

  try {
    await buildFantasy5();
  } catch (err) {
    // Non-fatal; your merge step keeps existing R2 version on empty
    console.error("Fantasy 5 update failed:", err?.message ?? err);
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
