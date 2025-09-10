// Node 18+ ESM. Deps: got, cheerio, tough-cookie, playwright (fallback-only)
import fs from "node:fs/promises";
import path from "node:path";
import got from "got";
import * as cheerio from "cheerio";
import { CookieJar } from "tough-cookie";
import { fileURLToPath } from "node:url";

// -------------------- Config --------------------
const HEADER = "draw_date,num1,num2,num3,num4,num5,special\n";
const FIRST_YEAR = 1994;
const THIS_YEAR = new Date().getUTCFullYear();

// GA Fantasy 5 changed to 5/42 on 2015-10-04 (keep this era by default)
const DEFAULT_SINCE = "2015-10-04";

// LottoNumbers per-year archive (full-year pages)
const LNN_YEAR = (y) => `https://www.lottonumbers.com/georgia-fantasy-5/numbers/${y}`;

const CACHE_DIR = ".cache";
const COOKIE_FILE = path.join(CACHE_DIR, "lotto.cookies.json");
const STORAGE_FILE = path.join(CACHE_DIR, "pw.storage.json");
const HTML_CACHE_DIR = path.join(CACHE_DIR, "html");

const BASE_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "cache-control": "no-cache",
  pragma: "no-cache",
};

// Dates like "Fri, Oct 09 2015" or "Friday October 9, 2015"
const DATE_RE =
  /\b(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),?\s+[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}\b/;

// -------------------- Utilities --------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (base) => base + Math.floor(Math.random() * base);

function resolveOutPath(outRelPath) {
  return path.isAbsolute(outRelPath) ? outRelPath : path.resolve(process.cwd(), outRelPath);
}
function toISODate(d) {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    .toISOString()
    .slice(0, 10);
}
function toISOFromDateLike(s) {
  const d = new Date(s);
  if (isNaN(d)) return null;
  return toISODate(d);
}
function makeCsvLine(dateISO, nums) {
  if (!dateISO || !Array.isArray(nums) || nums.length !== 5) return null;
  if (nums.some((n) => !Number.isInteger(n) || n < 1 || n > 99)) return null;
  return `${dateISO},${nums.join(",")},`; // special blank
}
function cmpISO(a, b) {
  return a.localeCompare(b);
}
function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (const a of argv) {
    const [k, v] = a.split("=");
    if (k === "--start-year") args.startYear = Number(v);
    else if (k === "--end-year") args.endYear = Number(v);
    else if (k === "--since") args.since = v;
    else if (k === "--ttl-hours") args.ttlHours = Number(v);
  }
  return args;
}

// -------------------- Cookie jar (persisted) --------------------
async function loadJar() {
  try {
    const raw = await fs.readFile(COOKIE_FILE, "utf8");
    return CookieJar.fromJSON(raw);
  } catch {
    return new CookieJar();
  }
}
async function saveJar(jar) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(COOKIE_FILE, JSON.stringify(jar.toJSON()), "utf8");
}

// -------------------- HTTP client (got) --------------------
async function makeHttpClient() {
  const jar = await loadJar();
  const client = got.extend({
    http2: false,
    cookieJar: jar,
    headers: BASE_HEADERS,
    timeout: { request: 15000 },
    retry: { limit: 0 },
  });
  return { client, jar };
}

// -------------------- Disk HTML cache --------------------
function cacheKey(url) {
  return path.join(HTML_CACHE_DIR, Buffer.from(url).toString("base64") + ".html");
}
async function fetchCached(url, fetchFn, ttlMs) {
  const key = cacheKey(url);
  try {
    const stat = await fs.stat(key);
    if (ttlMs && Date.now() - stat.mtimeMs < ttlMs) {
      return await fs.readFile(key, "utf8");
    }
  } catch {}
  const html = await fetchFn(url);
  await fs.mkdir(path.dirname(key), { recursive: true });
  await fs.writeFile(key, html, "utf8");
  return html;
}

// -------------------- Playwright fallback --------------------
async function fetchHtmlWithPlaywright(url) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const hasState = await fs.stat(STORAGE_FILE).then(() => true).catch(() => false);
    const context = await browser.newContext({
      storageState: hasState ? STORAGE_FILE : undefined,
      userAgent: BASE_HEADERS["user-agent"],
      locale: "en-US",
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "load", timeout: 45000 });
    // Try cookie banners (best-effort)
    await page.locator('button:has-text("Accept")').click({ timeout: 2000 }).catch(() => {});
    await page.locator('button:has-text("Agree")').click({ timeout: 2000 }).catch(() => {});
    // Wait for any table to appear; older pages are static
    await page.waitForSelector("table", { timeout: 15000 }).catch(() => {});
    const html = await page.content();
    await context.storageState({ path: STORAGE_FILE });
    await context.close();
    return html;
  } finally {
    await browser.close();
  }
}

// -------------------- Fetch with 403/429 handling --------------------
async function fetchHtmlOrBrowser(url, client) {
  try {
    return await client.get(url, { headers: { referer: "https://www.lottonumbers.com/" } }).text();
  } catch (err) {
    const status = err?.response?.statusCode;
    if (status === 403 || status === 429) {
      console.log(`[Fantasy5] ${status} from server, retrying via headless browser…`);
      return await fetchHtmlWithPlaywright(url);
    }
    throw err;
  }
}

// -------------------- LottoNumbers year parser (TABLE-DRIVEN) --------------------
// Strategy: iterate table rows. First cell has date text; same row contains 5 numbers
// as <li>/<span>/text. We extract exactly 5 ints scoped to that row.
function lnParseYearCheerio($) {
  const lines = [];

  $("table tr").each((_, tr) => {
    const $tr = $(tr);
    const cells = $tr.children("td,th");
    if (cells.length < 2) return;

    // Date text (prefer first cell), else any date-like text in the row
    let dateText = $(cells.get(0)).text().trim();
    if (!DATE_RE.test(dateText)) {
      const m = $tr.text().match(DATE_RE);
      if (!m) return;
      dateText = m[0];
    }
    const dateISO = toISOFromDateLike(dateText);
    if (!dateISO) return;

    // Extract integers from this row only
    let nums = $tr
      .find("li, .ball, .balls__ball, .c-result__balls li, .c-result__numbers li, span, strong")
      .toArray()
      .map((el) => Number($(el).text().trim()))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 99);

    if (nums.length < 5) {
      const ints = ($tr.text().match(/\b\d+\b/g) || [])
        .map(Number)
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 99);
      if (ints.length >= 5) nums = ints.slice(0, 5);
    } else if (nums.length > 5) {
      nums = nums.slice(0, 5);
    }

    if (nums.length === 5) {
      const line = makeCsvLine(dateISO, nums);
      if (line) lines.push(line);
    }
  });

  // De-dupe by date
  const byDate = new Map();
  for (const l of lines) byDate.set(l.slice(0, 10), l);
  return [...byDate.values()];
}

// -------------------- Year fetch (with caching, throttling) --------------------
async function fetchYearLinesLNN(year, client, ttlMs) {
  const url = LNN_YEAR(year);
  const html = await fetchCached(url, (u) => fetchHtmlOrBrowser(u, client), ttlMs);
  const $ = cheerio.load(html);
  return lnParseYearCheerio($);
}

// -------------------- Public API --------------------
export async function buildFantasy5Csv(outRelPath = "public/data/ga/fantasy5.csv") {
  const outPath = resolveOutPath(outRelPath);
  const { client } = await makeHttpClient();

  // CLI config
  const args = parseArgs();
  const startYear = Number.isInteger(args.startYear) ? args.startYear : FIRST_YEAR;
  const endYear = Number.isInteger(args.endYear) ? args.endYear : THIS_YEAR;
  const since = args.since || DEFAULT_SINCE;
  const ttlHours = Number.isFinite(args.ttlHours) ? args.ttlHours : 12;
  const ttlMs = ttlHours > 0 ? ttlHours * 3600 * 1000 : 0;

  console.log(`[Fantasy5] Writing to: ${outPath}`);
  console.log(`[Fantasy5] Years ${startYear}–${endYear} (filtered since ${since}); cache TTL ${ttlHours}h`);

  const all = [];
  for (let y = startYear; y <= endYear; y++) {
    try {
      console.log(`[Fantasy5] Year ${y}…`);
      const rows = await fetchYearLinesLNN(y, client, ttlMs);
      console.log(`[Fantasy5] ${y}: ${rows.length} rows (pre-filter)`);
      all.push(...rows);
    } catch (e) {
      console.warn(`[Fantasy5] ${y} failed: ${e?.message ?? e}`);
    }
    await sleep(jitter(400)); // polite pacing
  }

  // De-dupe, filter to 5/42 era, sort
  const byDate = new Map();
  for (const line of all) {
    const date = line.slice(0, 10);
    if (date >= since) byDate.set(date, line);
  }
  const sorted = [...byDate.values()].sort(cmpISO);

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, HEADER + sorted.join("\n") + (sorted.length ? "\n" : ""), "utf8");
  console.log(`[Fantasy5] DONE. Unique draws (since ${since}): ${sorted.length}. File: ${outPath}`);
}

// ---------- CLI entry (Windows-safe) ----------
if (typeof process !== "undefined" && process.argv && process.argv[1]) {
  const thisFile = path.resolve(fileURLToPath(import.meta.url));
  const invoked = path.resolve(process.argv[1]);
  const isDirect = thisFile === invoked;
  if (isDirect) {
    buildFantasy5Csv().catch((e) => {
      console.error(e);
      process.exitCode = 1;
    });
  }
}
