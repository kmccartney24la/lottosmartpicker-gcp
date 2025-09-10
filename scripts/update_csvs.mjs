// scripts/update_csvs.mjs
// Node 18+ ESM

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFantasy5Csv } from "./sources/fantasy5.mjs";

/* ---------------- Socrata helpers (Powerball / Mega / Cash4Life) ---------------- */

const BASE = "https://data.ny.gov/resource";
const APP_TOKEN = process.env.SOCRATA_APP_TOKEN ?? ""; // optional but recommended
const SOC_USER_AGENT = "Lottery-Analysis-Updater/1.0 (+github.com/kmccartney24la)";

const HEADERS = {
  ...(APP_TOKEN ? { "X-App-Token": APP_TOKEN } : {}),
  accept: "application/json",
  "user-agent": SOC_USER_AGENT,
};

async function socrataFetch(url, { maxAttempts = 5 } = {}) {
  let attempt = 0;
  let lastErr;
  while (attempt < maxAttempts) {
    attempt++;
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) return res.json();

    const status = res.status;
    // 429/403: backoff and retry
    if (status === 429 || status === 403 || status >= 500) {
      const delay = Math.min(15000, 500 * 2 ** (attempt - 1)); // 0.5s,1s,2s,4s,8s,15s
      await new Promise(r => setTimeout(r, delay));
      lastErr = new Error(`Socrata HTTP ${status}`);
      continue;
    }
    // Other errors: fail fast
    throw new Error(`Socrata HTTP ${status}`);
  }
  throw lastErr ?? new Error("Socrata fetch failed");
}

async function fetchAll(datasetId, select = "*", { limit = 25000 } = {}) {
  // Smallish page size is friendlier when unauthenticated
  let offset = 0;
  let out = [];
  while (true) {
    const qp = new URLSearchParams({
      $select: select,
      $order: "draw_date",
      $limit: String(limit),
      $offset: String(offset),
    });
    // Include token as query param too (some gateways prefer this)
    if (APP_TOKEN) qp.set("$$app_token", APP_TOKEN);

    const url = `${BASE}/${datasetId}.json?${qp.toString()}`;
    const chunk = await socrataFetch(url);
    out = out.concat(chunk);
    if (chunk.length < limit) break;
    offset += limit;
  }
  return out;

function toYMD(ts) {
  // incoming draw_date may be "YYYY-MM-DDT00:00:00.000"
  return (ts || "").slice(0, 10);
}
}

function parseWinningNumbers(s) {
  // Split on spaces, tolerate double spaces
  return (s || "")
    .trim()
    .split(/\s+/)
    .map((n) => parseInt(n, 10))
    .filter((n) => Number.isFinite(n));
}

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

/* ---------------- Builders: Powerball / Mega / Cash4Life ---------------- */

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

async function buildCash4Life() {
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

/* ---------------- Fantasy 5 incremental (last ~2 weeks), no duplicates ---------------- */

function isoDaysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  // zero time, ISO YYYY-MM-DD
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

function validateAndDedupeFantasy5Csv(csvText, { minDate = "2015-10-04" } = {}) {
  const lines = csvText.trim().split(/\r?\n/);
  if (!lines[0].startsWith("draw_date,num1,num2,num3,num4,num5,special")) {
    throw new Error("Fantasy 5 CSV header mismatch.");
  }
  const seen = new Set();
  const out = [lines[0]]; // header
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].trim();
    if (!row) continue;
    const cols = row.split(",");
    if (cols.length < 7) continue;

    const date = cols[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (date < minDate) continue;

    const nums = cols.slice(1, 6).map((x) => Number(x));
    if (nums.length !== 5 || nums.some((n) => !Number.isInteger(n) || n < 1 || n > 42)) continue;

    if (!seen.has(date)) {
      seen.add(date);
      out.push(`${date},${nums.join(",")},`);
    }
  }
  // ensure sorted ascending by date
  const body = out.slice(1).sort((a, b) => a.localeCompare(b));
  return [out[0], ...body].join("\n") + (body.length ? "\n" : "");
}

async function updateFantasy5Incremental(outPath = "public/data/ga/fantasy5.csv") {  const today = new Date();
  const since = isoDaysAgo(14); // tune: 7–14; 14 is safest for nightly
  const startYear = Number(since.slice(0, 4));
  const endYear = today.getUTCFullYear();

  // Build only the years touched by the window, filtered by --since
  const flags = [
    `--start-year=${startYear}`,
    `--end-year=${endYear}`,
    `--since=${since}`,
    `--ttl-hours=6`, // cache HTML for 6h to be kinder to the site
  ];
  process.argv.push(...flags);

  console.log(`Updater: Fantasy 5 incremental window since ${since} (years ${startYear}-${endYear})…`);
  await buildFantasy5Csv(outPath);

  // Hard dedupe + validate before publishing/committing
  const text = await fs.readFile(outPath, "utf8");
  const cleaned = validateAndDedupeFantasy5Csv(text, { minDate: "2015-10-04" });
  if (cleaned !== text) {
    await fs.writeFile(outPath, cleaned, "utf8");
    console.log("Updater: Fantasy 5 CSV normalized (validated & de-duplicated).");
  } else {
    console.log("Updater: Fantasy 5 CSV validated (no fixes needed).");
  }
}

/* ---------------- Main orchestrator ---------------- */

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
    await updateFantasy5Incremental("public/data/ga/fantasy5.csv");
  } catch (err) {
    // Don’t fail the whole job if Fantasy5 source hiccups.
    console.error("Fantasy 5 update failed:", err?.message ?? err);
  }
}

/* ---------------- Windows-safe CLI entry ---------------- */

if (typeof process !== "undefined" && process.argv && process.argv[1]) {
  const thisFile = path.resolve(fileURLToPath(import.meta.url));
  const invoked = path.resolve(process.argv[1]);
  const isDirect = thisFile === invoked;
  if (isDirect) {
    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  }
}
