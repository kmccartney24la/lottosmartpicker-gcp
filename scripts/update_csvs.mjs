// scripts/update_csvs.mjs
import fs from "node:fs/promises";
import path from "node:path";

const BASE = "https://data.ny.gov/resource";
const APP_TOKEN = process.env.SOCRATA_APP_TOKEN ?? ""; // optional but recommended

const HEADERS = {
  ...(APP_TOKEN ? { "X-App-Token": APP_TOKEN } : {}),
  "accept": "application/json",
};

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

// --- Powerball (d6yy-54nr): winning_numbers contains 6 numbers; multiplier separate.
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

// --- Mega Millions (5xaw-6ayf): winning_numbers + mega_ball column
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

// --- Cash4Life (kwxv-fwze): winning_numbers + (cash_ball | cashball) varies by schema.
async function buildCash4Life() {
  const raw = await fetchAll("kwxv-fwze", "draw_date,winning_numbers,cash_ball,cashball");
  const rows = raw.map(r => {
    const whites = parseWinningNumbers(r.winning_numbers).slice(0, 5);
    const special = Number.parseInt(r.cash_ball ?? r.cashball ?? "", 10);
    // Some schemas omit cash_ball; if so, try last number as special (defensive)
    const sp = Number.isFinite(special) ? special : parseWinningNumbers(r.winning_numbers)[5];
    if (whites.length !== 5 || !Number.isFinite(sp)) return null;
    return {
      draw_date: toYMD(r.draw_date),
      num1: whites[0], num2: whites[1], num3: whites[2], num4: whites[3], num5: whites[4],
      special: sp,
    };
  }).filter(Boolean).sort((a, b) => a.draw_date.localeCompare(b.draw_date));
  const outPath = path.join("public", "data", "ga", "cash4life.csv");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, rowsToCSV(rows), "utf8");
  console.log(`Cash4Life rows: ${rows.length} → ${outPath}`);
}

async function main() {
  await buildPowerball();
  await buildMegaMillions();
  await buildCash4Life();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
