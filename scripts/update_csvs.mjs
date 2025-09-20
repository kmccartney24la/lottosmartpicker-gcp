// scripts/update_csvs.mjs
// Node 18+ ESM

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFantasy5Csv } from "./sources/fantasy5.mjs";
import { performance } from "node:perf_hooks";
import { Storage } from "@google-cloud/storage";

/* ---------------- Socrata helpers (Powerball / Mega / Cash4Life) ---------------- */

const BASE = "https://data.ny.gov/resource";
const APP_TOKEN = process.env.SOCRATA_APP_TOKEN ?? ""; // optional but recommended
const SOC_USER_AGENT = "Lottery-Analysis-Updater/1.0 (+github.com/kmccartney24la)";
const HTTP_TIMEOUT_MS = Number(process.env.HTTP_TIMEOUT_MS ?? 30000); // 30s default
const SOC_MAX_ATTEMPTS = Number(process.env.SOC_MAX_ATTEMPTS ?? 5);  // tunable retries
const SKIP_FANTASY5 = String(process.env.SKIP_FANTASY5 ?? "0") === "1"; // parity with SKIP_SOCRATA

/* ---------------- GCS helpers (upload/merge) ---------------- */
const GCS_BUCKET = process.env.GCS_BUCKET;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || (GCS_BUCKET ? `https://storage.googleapis.com/${GCS_BUCKET}` : "");
const storage = new Storage();

async function downloadIfExists(key) {
  if (!GCS_BUCKET) return "";
  const file = storage.bucket(GCS_BUCKET).file(key);
  try {
    const [exists] = await file.exists();
    if (!exists) return "";
    const [buf] = await file.download();
    return buf.toString("utf8");
  } catch {
    return "";
  }
}

async function uploadCsv(localPath, key, { cacheControl = "public, max-age=3600, must-revalidate" } = {}) {
  if (!GCS_BUCKET) return;
  const file = storage.bucket(GCS_BUCKET).file(key);
  const data = await fs.readFile(localPath);
  await file.save(data, {
    contentType: "text/csv",
    resumable: false,
    metadata: { cacheControl },
  });
  console.log(`GCS upload → gs://${GCS_BUCKET}/${key}${PUBLIC_BASE_URL ? ` (${PUBLIC_BASE_URL}/${key})` : ""}`);
}

const HEADERS = {
  ...(APP_TOKEN ? { "X-App-Token": APP_TOKEN } : {}),
  accept: "application/json",
  "user-agent": SOC_USER_AGENT,
};

async function socrataFetch(url, { maxAttempts = SOC_MAX_ATTEMPTS } = {}) {
  let attempt = 0;
  let lastErr;
  while (attempt < maxAttempts) {
    attempt++;
    try {
      const res = await fetch(url, {
        headers: HEADERS,
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),  // <- key line
      });
      if (res.ok) return res.json();

      const status = res.status;
      if (status === 429 || status === 403 || status >= 500) {
        const delay = Math.min(15000, 500 * 2 ** (attempt - 1));
        await new Promise(r => setTimeout(r, delay));
        lastErr = new Error(`Socrata HTTP ${status}`);
        continue;
      }
      throw new Error(`Socrata HTTP ${status}`);
    } catch (err) {
      // Handle fetch AbortError (timeout) like a retryable condition
      if (err?.name === 'TimeoutError' || /AbortError/i.test(String(err?.name))) {
        const delay = Math.min(15000, 500 * 2 ** (attempt - 1));
        await new Promise(r => setTimeout(r, delay));
        lastErr = err;
        continue;
      }
      throw err;
    }
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
}

// Fetch only the single most-recent row by draw_date
async function fetchLatest(datasetId, select = "*") {
  const qp = new URLSearchParams({
    $select: select,
    $order: "draw_date DESC",
    $limit: "1",
  });
  if (APP_TOKEN) qp.set("$$app_token", APP_TOKEN);
  const url = `${BASE}/${datasetId}.json?${qp.toString()}`;
  const rows = await socrataFetch(url);
  return rows?.[0] ?? null;
}

// --- Date helpers shared by Socrata builders ---
function toYMD(ts) {
  // Accepts strings like "YYYY-MM-DDT00:00:00.000" OR a Date/ISO string.
  if (!ts) return "";
  if (ts instanceof Date) {
    return ts.toISOString().slice(0, 10);
  }
  // If it's already "YYYY-MM-DD..." slice the first 10 chars
  const s = String(ts);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  // Last resort: Date parse; if invalid, return empty string
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
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

// Latest-only (nightly append)
async function buildPowerballLatest() {
  const r = await fetchLatest("d6yy-54nr", "draw_date,winning_numbers,multiplier");
  if (!r) throw new Error("No latest Powerball row returned");
  const nums = parseWinningNumbers(r.winning_numbers);
  const whites = nums.slice(0, 5);
  const special = nums[5];
  if (whites.length !== 5 || !Number.isFinite(special)) throw new Error("Malformed latest Powerball row");
  const outPath = path.join("public", "data", "multi", "powerball.latest.csv");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, rowsToCSV([{
    draw_date: toYMD(r.draw_date), num1: whites[0], num2: whites[1], num3: whites[2], num4: whites[3], num5: whites[4], special
  }]), "utf8");
  console.log(`Powerball latest-only written → ${outPath}`);
}

// One-time seed: full era since cutoff (e.g., 2015-10-07)
async function buildPowerballSince(since) {
  const raw = await fetchAll("d6yy-54nr", "draw_date,winning_numbers,multiplier");
  const rows = raw.map(r => {
    const nums = parseWinningNumbers(r.winning_numbers);
    const whites = nums.slice(0, 5);
    const special = nums[5];
    if (whites.length !== 5 || !Number.isFinite(special)) return null;
    return { draw_date: toYMD(r.draw_date), num1: whites[0], num2: whites[1], num3: whites[2], num4: whites[3], num5: whites[4], special };
  }).filter(Boolean).filter(r => r.draw_date >= since)
    .sort((a, b) => a.draw_date.localeCompare(b.draw_date));
  const outPath = path.join("public", "data", "multi", "powerball.csv");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, rowsToCSV(rows), "utf8");
  console.log(`Powerball seeded rows (since ${since}): ${rows.length} → ${outPath}`);
}

async function buildMegaMillionsLatest() {
  const r = await fetchLatest("5xaw-6ayf", "draw_date,winning_numbers,mega_ball");
  if (!r) throw new Error("No latest MegaMillions row returned");
  const whites = parseWinningNumbers(r.winning_numbers).slice(0, 5);
  const special = parseInt(r.mega_ball, 10);
  if (whites.length !== 5 || !Number.isFinite(special)) throw new Error("Malformed latest MegaMillions row");
  const outPath = path.join("public", "data", "multi", "megamillions.latest.csv");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, rowsToCSV([{
    draw_date: toYMD(r.draw_date), num1: whites[0], num2: whites[1], num3: whites[2], num4: whites[3], num5: whites[4], special
  }]), "utf8");
  console.log(`MegaMillions latest-only written → ${outPath}`);
}

async function buildMegaMillionsSince(since) {
  const raw = await fetchAll("5xaw-6ayf", "draw_date,winning_numbers,mega_ball");
  const rows = raw.map(r => {
    const whites = parseWinningNumbers(r.winning_numbers).slice(0, 5);
    const special = parseInt(r.mega_ball, 10);
    if (whites.length !== 5 || !Number.isFinite(special)) return null;
    return { draw_date: toYMD(r.draw_date), num1: whites[0], num2: whites[1], num3: whites[2], num4: whites[3], num5: whites[4], special };
  }).filter(Boolean).filter(r => r.draw_date >= since)
    .sort((a, b) => a.draw_date.localeCompare(b.draw_date));
  const outPath = path.join("public", "data", "multi", "megamillions.csv");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, rowsToCSV(rows), "utf8");
  console.log(`MegaMillions seeded rows (since ${since}): ${rows.length} → ${outPath}`);
}

async function buildCash4LifeLatest() {
  const r = await fetchLatest("kwxv-fwze", "draw_date,winning_numbers,cash_ball");
  if (!r) throw new Error("No latest Cash4Life row returned");
  const nums = parseWinningNumbers(r.winning_numbers);
  const whites = nums.slice(0, 5);
  const special = Number.parseInt(r.cash_ball ?? "", 10);
  if (whites.length !== 5 || !Number.isFinite(special)) throw new Error("Malformed latest Cash4Life row");
  const outPath = path.join("public", "data", "ga", "cash4life.latest.csv");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, rowsToCSV([{
    draw_date: toYMD(r.draw_date), num1: whites[0], num2: whites[1], num3: whites[2], num4: whites[3], num5: whites[4], special
  }]), "utf8");
  console.log(`Cash4Life latest-only written → ${outPath}`);
}

async function buildCash4LifeSince(since) {
  const raw = await fetchAll("kwxv-fwze", "draw_date,winning_numbers,cash_ball");
  const rows = raw.map(r => {
    const nums = parseWinningNumbers(r.winning_numbers);
    const whites = nums.slice(0, 5);
    const special = Number.parseInt(r.cash_ball ?? "", 10);
    if (whites.length !== 5 || !Number.isFinite(special)) return null;
    return { draw_date: toYMD(r.draw_date), num1: whites[0], num2: whites[1], num3: whites[2], num4: whites[3], num5: whites[4], special };
  }).filter(Boolean).filter(r => r.draw_date >= since)
    .sort((a, b) => a.draw_date.localeCompare(b.draw_date));
  const outPath = path.join("public", "data", "ga", "cash4life.csv");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, rowsToCSV(rows), "utf8");
  console.log(`Cash4Life seeded rows (since ${since}): ${rows.length} → ${outPath}`);
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

async function updateFantasy5Incremental(outPath = "public/data/ga/fantasy5.csv") {
  const today = new Date();
  const sinceDays = Number(process.env.F5_SINCE_DAYS ?? 14);
  const since = isoDaysAgo(Math.max(1, sinceDays)); // tune: 7–14; 14 is safest for nightly
  const startYear = Number(since.slice(0, 4));
  const endYear = today.getUTCFullYear();

  // Build only the years touched by the window, filtered by --since, into a TEMP file.
  const ttlEnv = process.env.F5_TTL_HOURS;
  const ttlHours = Number.isFinite(Number(ttlEnv)) ? Number(ttlEnv) : 6;
  const flags = [
    `--start-year=${startYear}`,
    `--end-year=${endYear}`,
    `--since=${since}`,
    `--ttl-hours=${ttlHours}`,
  ];
  const tmpOut = outPath + ".partial";
  process.argv.push(...flags);

  console.log(`Updater: Fantasy 5 incremental window since ${since} (years ${startYear}-${endYear})…`);
  await buildFantasy5Csv(tmpOut);

  // Merge baseline (existing full history, if any) + partial window; then validate/dedupe.
  let baseline = "";
  try {
    baseline = await fs.readFile(outPath, "utf8");
  } catch { /* first run or file missing */ }

  const partial = await fs.readFile(tmpOut, "utf8");
  const header = "draw_date,num1,num2,num3,num4,num5,special";

  const bodies = [];
  for (const text of [baseline, partial]) {
    if (!text) continue;
    const lines = text.trim().split(/\r?\n/);
    if (!lines[0].startsWith(header)) {
      throw new Error("Fantasy 5 CSV header mismatch during merge.");
    }
    bodies.push(...lines.slice(1).filter(Boolean));
  }

  const merged = [header, ...bodies].join("\n") + (bodies.length ? "\n" : "");
  const cleaned = validateAndDedupeFantasy5Csv(merged, { minDate: "2015-10-04" });

  // Also merge with remote object in GCS to prevent truncation across runs/containers.
  const remote = await downloadIfExists("ga/fantasy5.csv");
  let finalCsv = cleaned;
  if (remote) {
    const bodies2 = [];
    for (const text of [remote, cleaned]) {
      if (!text) continue;
      const lines = text.trim().split(/\r?\n/);
      if (!lines[0].startsWith(header)) {
        throw new Error("Fantasy 5 CSV header mismatch during remote merge.");
      }
      bodies2.push(...lines.slice(1).filter(Boolean));
    }
    const mergedRemote = [header, ...bodies2].join("\n") + (bodies2.length ? "\n" : "");
    finalCsv = validateAndDedupeFantasy5Csv(mergedRemote, { minDate: "2015-10-04" });
  }

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, finalCsv, "utf8");
  await fs.rm(tmpOut, { force: true });

  const lineCount = finalCsv.split(/\r?\n/).filter(Boolean).length - 1;
  console.log(`Updater: Fantasy 5 merged & validated. Rows=${lineCount} → ${outPath}`);

  // Push to GCS key used by the app.
  await uploadCsv(outPath, "ga/fantasy5.csv");
}

/* ---------------- Main orchestrator ---------------- */

async function main() {
  const t0 = performance.now();
  const logPhase = (label, start) => {
    const ms = Math.round(performance.now() - start);
    console.log(`${label} completed in ${ms} ms`);
  };
  // One-time SEED mode (manual run or dedicated workflow)
  const SEED_GAME = process.env.LSP_SEED_GAME;       // 'powerball' | 'megamillions' | 'cash4life'
  const SEED_SINCE = process.env.LSP_SEED_SINCE;     // 'YYYY-MM-DD'

  if (SEED_GAME) {
    if (!SEED_SINCE) throw new Error("LSP_SEED_SINCE (YYYY-MM-DD) required for seeding.");
    console.log(`Seeding ${SEED_GAME} since ${SEED_SINCE}…`);

    if (SEED_GAME === 'powerball') {
      await buildPowerballSince(SEED_SINCE);
    } else if (SEED_GAME === 'megamillions') {
      await buildMegaMillionsSince(SEED_SINCE);
    } else if (SEED_GAME === 'cash4life') {
      await buildCash4LifeSince(SEED_SINCE);
    } else {
      throw new Error(`Unknown LSP_SEED_GAME: ${SEED_GAME}`);
    }

    // IMPORTANT: stop after seed; let the workflow merge/upload steps handle R2.
    return;
  }

  // Nightly append-only mode (latest-only Socrata)
  if (process.env.SKIP_SOCRATA !== '1') {
    const tSoc = performance.now();
    await buildPowerballLatest();
    await buildMegaMillionsLatest();
    try {
      await buildCash4LifeLatest();
    } catch (err) {
      console.error("Cash4Life update failed:", err?.message ?? err);
    }
    logPhase("Socrata latest-only (PB/MM/C4L)", tSoc);
  } else {
    console.log("SKIP_SOCRATA=1 → skipping PB/MM/C4L");
  }

  // Fantasy 5 incremental always runs (independent of Socrata)
  if (!SKIP_FANTASY5) {
    const tF5 = performance.now();
    try {
      await updateFantasy5Incremental("public/data/ga/fantasy5.csv");
    } catch (err) {
      // Don’t fail the whole job if Fantasy5 source hiccups.
      console.error("Fantasy 5 update failed:", err?.message ?? err);
    }
    logPhase("Fantasy 5 incremental", tF5);
  } else {
    console.log("SKIP_FANTASY5=1 → skipping Fantasy 5 incremental");
  }
  logPhase("TOTAL job runtime", t0);
}

/* ---------------- Windows-safe CLI entry ---------------- */

if (typeof process !== "undefined" && process.argv && process.argv[1]) {
  const thisFile = path.resolve(fileURLToPath(import.meta.url));
  const invoked = path.resolve(process.argv[1]);
  const isDirect = thisFile === invoked;
  if (isDirect) {
    (async () => {
      try {
        await main();
      } catch (err) {
        console.error(err);
        process.exit(1);
      }
    })();
  }
}
