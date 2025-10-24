// scripts/sources/ca/ca_daily4.ts
// Node 18+ ESM. Deps: cheerio
//
// Modes:
//   seed   → build public/data/ca/daily4.csv from LotteryUSA (full year; paginated).
//   update → append newest row from calottery.com to the existing CSV (no duplicates).
//
// Usage (Windows PowerShell):
//   $env:CA_HTTP_TIMEOUT_MS = "20000"
//   node --loader ts-node/esm .\scripts\sources\ca\ca_daily4.ts seed
//   node --loader ts-node/esm .\scripts\sources\ca\ca_daily4.ts update
//
// CSV FORMAT:
//   draw_date,ball1,ball2,ball3,ball4
//   5/10/2008,1,7,8,4
//   5/11/2008,0,7,1,3
//
// Notes:
// - LotteryUSA pages paginate behind a LiveComponent endpoint (GameHistory). We reuse the same
//   server-first scrapers you built for Daily 3.
// - CA Lottery "Daily 4" card shows *one* latest draw. We parse date + 4 digits and append.

import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { CheerioAPI, Cheerio } from "cheerio";
import type { Element, AnyNode } from "domhandler";
import type { Browser, BrowserContext, Page } from "playwright";

// Lazy Cheerio (no top-level runtime import)
let _cheerio: typeof import("cheerio") | null = null;
async function getCheerio() {
  if (!_cheerio) _cheerio = await import("cheerio");
  return _cheerio;
}

// ---------- HTTP dispatcher (Undici) ----------
let _undiciAgent: any | null = null;
async function initHttpDispatcher() {
  try {
    const undici = await import("undici");
    _undiciAgent = new undici.Agent({
      keepAliveTimeout: 10,
      keepAliveMaxTimeout: 10,
      connections: 8,
      pipelining: 0,
    });
    undici.setGlobalDispatcher(_undiciAgent);
    if (LOG_VERBOSE) console.log("[ca_daily4] undici agent configured (short keepAlive)");
  } catch {}
}
async function closeHttpDispatcher() {
  try { await _undiciAgent?.close?.(); } catch {}
  _undiciAgent = null;
}

// ---------- config ----------
const HTTP_TIMEOUT_MS = Number(process.env.CA_HTTP_TIMEOUT_MS ?? 20000);
const PW_ENABLE = String(process.env.CA_ENABLE_PLAYWRIGHT ?? "1") !== "0";
const PW_TIMEOUT_MS = Number(process.env.CA_PLAYWRIGHT_TIMEOUT_MS ?? 45000);
const PW_WAIT_AFTER_CLICK_MS = Number(process.env.CA_PLAYWRIGHT_WAIT_AFTER_CLICK_MS ?? 600);
const PW_MAX_CLICKS = Number(process.env.CA_PLAYWRIGHT_MAX_CLICKS ?? 50);
const LIVE_MORE_MAX = Number(process.env.CA_LIVE_MORE_MAX ?? 200);
const LOG_VERBOSE = String(process.env.CA_LOG ?? "0") !== "0";
const TRY_SERVER_WHEN_PW = String(process.env.CA_TRY_SERVER_FIRST ?? (String(process.env.CA_ENABLE_PLAYWRIGHT ?? "1") !== "0" ? "0" : "1")) !== "0";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const LUSA_URL = "https://www.lotteryusa.com/california/daily-4/year";
const CALOTTERY_CARD_URL = "https://www.calottery.com/en/draw-games/daily-4#section-content-2-3";

const OUT = "public/data/ca/daily4.csv";
const HEADER = "draw_date,ball1,ball2,ball3,ball4\n";

// ---------- tiny utils ----------
const ensureDir = async (p: string) => fs.mkdir(path.dirname(p), { recursive: true });
const normalizeSpaces = (s: string) => s.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();

function fetchText(url: string, extraHeaders: Record<string, string> = {}): Promise<string> {
  if (LOG_VERBOSE) console.log(`[ca_daily4] GET ${url}`);
  return fetch(url, {
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    headers: {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      referer: url,
      ...extraHeaders,
    },
  }).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
    return await res.text();
  });
}

async function postForm(url: string, form: URLSearchParams, refererOverride?: string): Promise<string> {
  if (LOG_VERBOSE) console.log(`[ca_daily4] POST ${url} body=${form.toString()}`);
  const res = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    headers: {
      "user-agent": UA,
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      accept: "text/html,*/*;q=0.8",
      "x-requested-with": "XMLHttpRequest",
      referer: refererOverride || url,
    },
    body: form.toString(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} POST ${url}`);
  let txt = await res.text();
  const t0 = txt.trim();
  if (t0.startsWith("{") && /"html"\s*:/.test(t0)) {
    try {
      const j = JSON.parse(t0) as { html?: string };
      if (typeof j.html === "string") txt = j.html;
    } catch {}
  }
  return txt;
}

function redactLiveProps(html: string): string {
  return html
    .replace(/(data-live-props-value=)"([^"]*)"/gi, '$1"[redacted]"')
    .replace(/("props" *: *\{)[\s\S]*?(\})/i, '$1[redacted]$2');
}

// M/D/YYYY (no zero-padding on month/day)
function toMDY(dateText: string): string | null {
  const s0 = normalizeSpaces(dateText);

  const tryParse = (s: string): string | null => {
    // e.g., "Oct 19, 2025" or "October 19, 2025"
    let m = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/);
    if (m) {
      const mon = m[1].slice(0, 3).toUpperCase();
      const dd = Number(m[2]);
      const yyyy = Number(m[3]);
      const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
      const idx = months.indexOf(mon);
      if (idx >= 0) {
        const js = new Date(Date.UTC(yyyy, idx, dd));
        if (!Number.isNaN(js.getTime())) {
          return `${js.getUTCMonth()+1}/${js.getUTCDate()}/${js.getUTCFullYear()}`;
        }
      }
    }
    // e.g., "10/19/2025" or "10-19-2025"
    m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) {
      const mm = Number(m[1]), dd = Number(m[2]), yyyy = Number(m[3]);
      return `${mm}/${dd}/${yyyy}`;
    }
    return null;
  };

  // 1) try as-is
  let out = tryParse(s0);
  if (out) return out;

  // 2) try removing "Weekday, " (e.g., "Sunday, Oct 19, 2025")
  out = tryParse(s0.replace(/^[A-Za-z]{3,9},\s+/, ""));
  if (out) return out;

  // 3) try removing "EEE/" (e.g., "SUN/OCT 19, 2025")
  out = tryParse(s0.replace(/^[A-Za-z]{3}\//, ""));
  return out;
}

type DrawRow = { dateMDY: string; balls: [number, number, number, number] };

// ---------- helpers: detect Next-Draw state; fallback to LotteryUSA latest ----------
function isNextDrawCard(html: string): boolean {
  const s = normalizeSpaces(html).toLowerCase();
  // Examples seen: "Next Draw:", "Draw entry is closed.", "Results are coming soon!"
  return (
    /\bnext\s*draw\b/.test(s) ||
    /\bresults\s+are\s+coming\s+soon\b/.test(s) ||
    /\bdraw\s+entry\s+is\s+closed\b/.test(s)
  );
}

async function parseLusaLatestAsync(html: string): Promise<DrawRow | null> {
  const { load } = await getCheerio();
  const $: CheerioAPI = load(html);
  const table = $("table#history-table-all-new").first();
  if (!table.length) return null;
  // First row in the table is the most recent draw
  const rows = extractRowsFromTable($, table);
  return rows.length ? rows[0] : null;
}

async function fetchLatestFromLUSA(): Promise<DrawRow | null> {
  try {
    const html = await fetchText(LUSA_URL);
    return await parseLusaLatestAsync(html);
  } catch {
    return null;
  }
}

// ---------- Playwright helpers (optional) ----------
let _pwBrowser: Browser | null = null;
let _pwContext: BrowserContext | null = null;

async function ensureBrowser(): Promise<void> {
  if (_pwBrowser && _pwContext) return;
  const { chromium } = await import("playwright");
  _pwBrowser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox","--disable-dev-shm-usage","--disable-gpu"],
  });
  _pwContext = await _pwBrowser.newContext({
    userAgent: UA,
    locale: "en-US",
    viewport: { width: 1280, height: 1800 },
  });
}

async function closeBrowser(): Promise<void> {
  try { await _pwContext?.unroute?.("**/*"); } catch {}
  try { await _pwContext?.close(); } catch {}
  try { await _pwBrowser?.close(); } catch {}
  _pwBrowser = null;
  _pwContext = null;
}

async function fetchFullHtmlByClickingMore(url: string): Promise<string> {
  if (!PW_ENABLE) throw new Error("Playwright fallback disabled (CA_ENABLE_PLAYWRIGHT=0).");
  await ensureBrowser();
  if (!_pwContext) throw new Error("Playwright context unavailable");
  const page: Page = await _pwContext.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: PW_TIMEOUT_MS });
    await page.getByRole("button", { name: /accept|agree|consent/i }).first().click({ timeout: 1500 }).catch(() => {});
    const table = page.locator("table#history-table-all-new");
    await table.waitFor({ state: "visible", timeout: PW_TIMEOUT_MS });
    async function getGroupCount(): Promise<number> { return await table.locator("tbody[id^='page--']").count(); }
    async function getTableHeight(): Promise<number> { const bb = await table.boundingBox(); return bb ? Math.round(bb.height) : 0; }
    let lastGroups = await getGroupCount(); let lastHeight = await getTableHeight();
    if (LOG_VERBOSE) console.log(`[ca_daily4] PW: initial groups=${lastGroups} height=${lastHeight}`);
    const btn = page.locator("button[data-action='live#action'][data-live-action-param='more'], button:has-text('Load More')");
    for (let i = 0; i < PW_MAX_CLICKS; i++) {
      const visible = await btn.isVisible().catch(() => false);
      if (!visible) break;
      if (LOG_VERBOSE) console.log(`[ca_daily4] PW: click ${i + 1}/${PW_MAX_CLICKS}`);
      await btn.scrollIntoViewIfNeeded().catch(() => {});
      const waitForNext = Promise.all([
        page.waitForResponse((r) => /\/_components\/GameHistory/i.test(r.url()) && (r.status() === 200 || r.status() === 204),
                             { timeout: Math.max(2500, PW_WAIT_AFTER_CLICK_MS + 500) }).catch(() => null),
        page.waitForTimeout(PW_WAIT_AFTER_CLICK_MS),
      ]);
      await btn.click({ timeout: PW_TIMEOUT_MS }).catch(async () => {
        await page.mouse.wheel(0, 600); await page.waitForTimeout(250); await btn.click({ timeout: PW_TIMEOUT_MS });
      });
      await waitForNext;
      let changed = false;
      for (let poll = 0; poll < 15; poll++) {
        const groups = await getGroupCount(); const height = await getTableHeight();
        if (groups > lastGroups || height > lastHeight) { changed = true; lastGroups = groups; lastHeight = height; break; }
        await page.waitForTimeout(120);
      }
      if (!changed) break;
    }
    const html = await page.content(); await page.close().catch(() => {});
    return html;
  } catch (e) {
    try { await page.close(); } catch {}
    throw e;
  }
}

// ---------- LUSA (seed) ----------
function findLiveHost($: CheerioAPI, scope?: Cheerio<Element>): Cheerio<Element> {
  const root = scope && scope.length ? scope : $("body");
  const cands = root.find("[data-controller='live']");
  if (!cands.length) return cands;
  const table = $("table#history-table-all-new").first();
  let bestEl: Cheerio<Element> | null = null;
  let bestScore = -1;
  let bestDist = 9999;
  cands.each((_, node) => {
    const $el = $(node);
    const name = ($el.attr("data-live-name-value") || "").toLowerCase();
    const url = ($el.attr("data-live-url-value") || "").toLowerCase();
    let score = 0;
    if (/gamehistory/.test(name) || /gamehistory/.test(url)) score += 2;
    if ($el.find("table#history-table-all-new").length) score += 2;
    if ($el.find("button[data-action='live#action'][data-live-action-param='more'], button:contains('Load More')").length) score += 1;
    if ($el.is("[data-live-props-value]")) score += 1;
    let dist = 9999;
    if (table.length) {
      const parents = table.parents().toArray();
      const idx = parents.indexOf(node as unknown as Element);
      if (idx >= 0) dist = idx;
    }
    if (
      bestEl === null ||
      score > bestScore ||
      (score === bestScore && dist < bestDist)
    ) {
      bestEl = $el;
      bestScore = score;
      bestDist = dist;
    }
  });
  return bestEl ?? cands.first();
}

async function parseYearPageAll(url: string): Promise<DrawRow[]> {
  if (LOG_VERBOSE) console.log(`[ca_daily4] parseYearPageAll: ${url}`);
  const html1 = await fetchText(url);
  const { load } = await getCheerio();
  const $1: CheerioAPI = load(html1);
  const table = $1("table#history-table-all-new");
  if (!table.length) throw new Error("Could not find results table on page 1.");

  const rowsAll: DrawRow[] = [];
  const page1Rows = extractRowsFromTable($1, table);
  rowsAll.push(...page1Rows);

  const liveHost = findLiveHost($1);
  let liveUrl = liveHost.attr("data-live-url-value") || "/_components/GameHistory";
  let liveName = liveHost.attr("data-live-name-value") || "";
  const liveId = liveHost.attr("id") || "";

  if (/globalheader/i.test(liveName) || /globalheader/i.test(liveUrl)) {
    const gh = $1("[data-controller='live']").filter((_, el) => {
      const $el = $1(el);
      const n = ($el.attr("data-live-name-value") || "").toLowerCase();
      const u = ($el.attr("data-live-url-value") || "").toLowerCase();
      return /gamehistory/.test(n) || /gamehistory/.test(u);
    }).first();
    if (gh.length) {
      liveUrl = gh.attr("data-live-url-value") || "/_components/GameHistory";
      liveName = gh.attr("data-live-name-value") || "GameHistory";
    } else {
      liveUrl = "/_components/GameHistory";
      liveName = "GameHistory";
    }
  }
  if (LOG_VERBOSE) console.log(`[ca_daily4] chosen live host: name="${liveName}" url="${liveUrl}"`);
  const propsRaw = liveHost.attr("data-live-props-value") || "{}";
  let gameParam = "";
  try { const props = JSON.parse(propsRaw); if (props?.game) gameParam = String(props.game); } catch {}

  if (PW_ENABLE && !TRY_SERVER_WHEN_PW) {
    if (LOG_VERBOSE) console.log("[ca_daily4] PW enabled → skipping server pagination and going straight to clicking");
  } else {
    for (let page = 2; page <= 50; page++) {
      if (LOG_VERBOSE) console.log(`[ca_daily4] trying page=${page}`);
      let html: string | null = null;
      const livePagingUrl = /gamehistory/i.test(liveUrl) ? liveUrl : "/_components/GameHistory";
      const tryGetUrl = `${livePagingUrl}?page=${page}${gameParam ? `&game=${encodeURIComponent(gameParam)}` : ""}${liveId ? `&id=${encodeURIComponent(liveId)}` : ""}`;
      try {
        html = await fetchText(new URL(tryGetUrl, url).toString(), { "x-requested-with": "XMLHttpRequest" });
      } catch { html = null; }
      if (!html) {
        try {
          const endpoint = new URL(livePagingUrl, url).toString();
          const form = new URLSearchParams();
          form.set("page", String(page));
          if (gameParam) form.set("game", gameParam);
          if (liveId) form.set("id", liveId);
          form.set("action", "more");
          html = await postForm(endpoint, form, url);
        } catch { html = null; }
      }
      if (!html) break;
      const { load } = await getCheerio();
      const $p: CheerioAPI = load(html);
      const partTable = $p("table#history-table-all-new, tbody[id^='page--'], table .c-results-table__group").first();
      const got = partTable.length ? extractRowsFromTable($p, partTable) : extractRowsLoose($p);
      if (!got.length) break;
      rowsAll.push(...got);
    }
    if ($1("button[data-action='live#action'][data-live-action-param='more'], button:contains('Load More')").length) {
      if (LOG_VERBOSE) console.log("[ca_daily4] detected Load More button; trying stateful server-side loop");
      await paginateStatefulLive(LUSA_URL, html1, rowsAll);
    }
  }

  const needBrowser =
    rowsAll.length <= page1Rows.length ||
    /Load More/i.test($1("button.c-button.c-button--primary-outline.c-button--full").text() || "");
  if (needBrowser && PW_ENABLE) {
    if (LOG_VERBOSE) console.log("[ca_daily4] fallback: launching browser to click Load More");
    const fullHtml = await fetchFullHtmlByClickingMore(url);
    const { load } = await getCheerio();
    const $full: CheerioAPI = load(fullHtml);
    const tableFull = $full("table#history-table-all-new");
    if (tableFull.length) {
      const allRows = extractRowsFromTable($full, tableFull);
      if (allRows.length > rowsAll.length) {
        rowsAll.length = 0;
        rowsAll.push(...allRows);
      }
    }
  } else if (needBrowser && !PW_ENABLE) {
    if (LOG_VERBOSE) {
      console.warn("[ca_daily4] Playwright disabled; cannot click Load More — you will only get the first page (~50 rows).");
      console.warn("          Set CA_ENABLE_PLAYWRIGHT=1 to load the full year.");
    }
  }

  // de-dupe by date; sort ASC
  const byKey = new Map<string, DrawRow>();
  for (const r of rowsAll) byKey.set(r.dateMDY, r);

  const out = [...byKey.values()].sort((a, b) => {
    const [am,ad,ay] = a.dateMDY.split("/").map(Number);
    const [bm,bd,by] = b.dateMDY.split("/").map(Number);
    return Date.UTC(ay, am-1, ad) - Date.UTC(by, bm-1, bd);
  });
  return out;
}

async function paginateStatefulLive(pageUrl: string, initialHtml: string, rowsAll: DrawRow[]): Promise<void> {
  const { load } = await getCheerio();
  const $init: CheerioAPI = load(initialHtml);
  let liveHost = findLiveHost($init);
  if (!liveHost.length) { if (LOG_VERBOSE) console.warn("[ca_daily4] live host not found; skipping stateful loop."); return; }
  let liveUrl = liveHost.attr("data-live-url-value") || "/_components/GameHistory";
  let liveName = liveHost.attr("data-live-name-value") || "GameHistory";
  const liveId = liveHost.attr("id") || "";
  if (/globalheader/i.test(liveName) || /globalheader/i.test(liveUrl)) {
    liveUrl = "/_components/GameHistory"; liveName = "GameHistory";
    if (LOG_VERBOSE) console.warn("[ca_daily4] overriding live host to GameHistory endpoint");
  }
  let propsBlob = liveHost.attr("data-live-props-value") || "{}";
  const endpoint = new URL(liveUrl, pageUrl).toString();
  const tryKeys = ["props","data","_props"] as const;
  type TryKey = (typeof tryKeys)[number];
  let chosenKey: TryKey | null = null;
  let prevCount = rowsAll.length;

  for (let i = 0; i < LIVE_MORE_MAX; i++) {
    const hasButton = $init("button[data-action='live#action'][data-live-action-param='more'], button:contains('Load More')").length > 0;
    if (!hasButton && i === 0) { if (LOG_VERBOSE) console.log("[ca_daily4] no Load More button; skipping."); return; }
    if (LOG_VERBOSE) console.log(`[ca_daily4] live stateful iteration ${i+1}/${LIVE_MORE_MAX}`);

    let html: string | null = null;
    const candidates: ReadonlyArray<TryKey> = chosenKey ? [chosenKey] : tryKeys;
    for (const k of candidates) {
      const form = new URLSearchParams();
      form.set("name", liveName); form.set("action", "more"); if (liveId) form.set("id", liveId); form.set(k, propsBlob);
      try { html = await postForm(endpoint, form, pageUrl); } catch { html = null; }
      if (!html) continue;
      const { load } = await getCheerio();
      const $frag: CheerioAPI = load(html);
      const partTable = $frag("table#history-table-all-new, tbody[id^='page--'], table .c-results-table__group").first();
      const probeRows = partTable.length ? extractRowsFromTable($frag, partTable) : extractRowsLoose($frag);
      if (LOG_VERBOSE && i === 0) console.log(`[ca_daily4] stateful response snippet: ${redactLiveProps(html).slice(0,120)}…`);
      if (probeRows.length) {
        if (!chosenKey) { chosenKey = k; if (LOG_VERBOSE) console.log(`[ca_daily4] stateful accepted param key="${k}"`); }
        rowsAll.push(...probeRows);
        const nhost = $frag("[data-controller='live'][data-live-props-value]").first();
        if (nhost.length) propsBlob = nhost.attr("data-live-props-value") || propsBlob;
        if ($frag("button[data-action='live#action'][data-live-action-param='more'], button:contains('Load More')").length === 0) return;
        if (rowsAll.length === prevCount) return;
        prevCount = rowsAll.length;
        break;
      }
    }
    if (!html) { if (LOG_VERBOSE) console.warn("[ca_daily4] stateful POST yielded no usable fragment; stopping."); return; }
  }
  if (LOG_VERBOSE) console.warn("[ca_daily4] stateful loop reached CA_LIVE_MORE_MAX cap; stopping.");
}

function extractRowsFromTable($: CheerioAPI, scope: Cheerio<Element>): DrawRow[] {
  const rows: DrawRow[] = [];
  scope
    .find("tr.c-results-table__item.c-draw-card, tr.c-results-table__item--medium.c-draw-card, tr.c-results-table__item")
    .each((_: number, tr: Element) => {
      const $tr = $(tr);
      const firstCell = $tr.find("th,td").first();
      const dateText = normalizeSpaces(firstCell.find("time").text() || firstCell.text());
      if (!dateText) return;
      const dateMDY = toMDY(dateText);
      if (!dateMDY) return;

      let resultCell = $tr.find("td.c-draw-card__result").first();
      if (!resultCell.length) {
        const tds = $tr.find("td");
        resultCell = tds.eq(Math.min(1, Math.max(0, tds.length - 1)));
      }

      const digits: number[] = [];
      resultCell.find("*").each((__, el: Element) => {
        const t = normalizeSpaces($(el).text());
        const m = t.match(/^\d$/); if (m) digits.push(Number(m[0]));
      });
      if (digits.length < 4) {
        const raw = normalizeSpaces(resultCell.text());
        const m = raw.match(/\b\d\b/g);
        if (m) for (const d of m) if (digits.length < 4) digits.push(Number(d));
      }
      if (digits.length >= 4) {
        rows.push({ dateMDY, balls: [digits[0], digits[1], digits[2], digits[3]] as [number, number, number, number] });
      }
    });
  return rows;
}

function extractRowsLoose($: CheerioAPI): DrawRow[] {
  const rows: DrawRow[] = [];
  let pendingDate: string | null = null;
  const dateLike = (s: string) => /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/i.test(s);

  $("body,body *").contents().each((_: number, node: AnyNode) => {
    const asAny = node as unknown as { type?: string; data?: string };
    if (asAny?.type === "text") {
      const txt = normalizeSpaces(asAny.data || "");
      if (!txt) return;
      if (!pendingDate && dateLike(txt)) { pendingDate = txt; return; }
      if (pendingDate) {
        const m = txt.match(/\b\d\b/g);
        if (m && m.length >= 4) {
          const dateMDY = toMDY(pendingDate!);
          if (dateMDY) rows.push({ dateMDY, balls: [Number(m[0]), Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number, number] });
          pendingDate = null;
        }
      }
    }
  });
  return rows;
}

function toCsv(rows: DrawRow[]): string {
  const lines = rows.map((r) => `${r.dateMDY},${r.balls[0]},${r.balls[1]},${r.balls[2]},${r.balls[3]}`);
  return HEADER + lines.join("\n") + "\n";
}

async function seedFromLotteryUSA(outRel = OUT) {
  if (LOG_VERBOSE) console.log("[ca_daily4] seedFromLotteryUSA: start");
  console.time?.("[ca_daily4] seed duration");
  const rows = await parseYearPageAll(LUSA_URL);
  const out = path.resolve(process.cwd(), outRel);
  await ensureDir(out);
  await fs.writeFile(out, toCsv(rows), "utf8");
  console.log(`[CA DAILY4] Seeded ${rows.length} rows → ${outRel}`);
}

// ---------- CA Lottery (update) ----------
async function parseCalotteryCard(html: string): Promise<DrawRow[]> {
  const { load } = await getCheerio();
  const $: CheerioAPI = load(html);
  if (isNextDrawCard(html)) {
    if (LOG_VERBOSE) console.log("[ca_daily4] calottery card indicates Next Draw / results pending.");
    return [];
  }
  // Try the tightest winning-numbers card body, then fallback to any Daily 4 card/candidates.
  // Be generous with candidates: Daily 4 tends to use draw-game-14 + winningNumbers14
  let card =
    $("#draw-game-winning-numbers-spotlight .card.daily4 .card-body").first();
  if (!card.length) card = $("#winningNumbers14 .card-body").first();
  if (!card.length) card = $("#draw-game-14 .card-body").first();
  if (!card.length) card = $("#drawGame10 .card-body").first();
  if (!card.length) card = $("#draw-game-10 .card-body").first();
  if (!card.length) card = $(".card.daily4 .card-body").first();

  const scopes: Cheerio<Element>[] = card.length
    ? [card]
    : [
        $("#winningNumbers14 .card-body"),
        $("#draw-game-14 .card-body"),
        $(".card.daily4 .card-body"),
        $("#drawGame10 .card-body"),
        $("#draw-game-10 .card-body"),
        $(".card-body"),
      ];
  const results: DrawRow[] = [];
  for (const scope of scopes) {
    // Get the nearest date label (no "MIDDAY/EVENING" here).
    const dateP = scope.find("p.draw-cards--draw-date").first();
    const rawDate = normalizeSpaces(dateP.find("strong").text() || dateP.text()).replace(/^[A-Z]{3}\//, ""); // drop MON/
    const dateMDY = toMDY(rawDate);
    // Then the first winning-numbers list below it.
    const list = scope.find("ul.draw-cards--winning-numbers").first();
    const balls: number[] = [];
    list.find("li .draw-cards--winning-numbers-inner-wrapper, li").each((_, li: Element) => {
      const t = normalizeSpaces($(li).text());
      if (/^\d$/.test(t)) balls.push(Number(t));
    });

    if (dateMDY && balls.length >= 4) {
      results.push({ dateMDY, balls: [balls[0], balls[1], balls[2], balls[3]] as [number, number, number, number] });
      break;
    }
  }

  if (LOG_VERBOSE) {
    console.log(`[ca_daily4] calottery parse: found ${results.length} entries`);
    if (!results.length) {
      const container =
        $("#winningNumbers14").first().html() ||
        $("#draw-game-14").first().html() ||
        $("#draw-game-winning-numbers-spotlight").first().html() ||
        $(".card.daily4").first().html() ||
        $("body").html() ||
        "";
      const snippet = normalizeSpaces(container).slice(0, 500);
      console.warn(
        "[ca_daily4] WARNING: calottery parser found 0 entries. First 500 chars of card container:",
        snippet
      );
    }
  }
  return results;
}

async function readCsv(pathRel: string): Promise<DrawRow[]> {
  const p = path.resolve(process.cwd(), pathRel);
  if (!fsSync.existsSync(p)) return [];
  const txt = await fs.readFile(p, "utf8");
  const lines = txt.trim().split(/\r?\n/).slice(1);
  const rows: DrawRow[] = [];
  for (const ln of lines) {
    const [d, b1, b2, b3, b4] = ln.split(",").map((s) => s.trim());
    if (!d) continue;
    rows.push({ dateMDY: d, balls: [Number(b1), Number(b2), Number(b3), Number(b4)] as [number, number, number, number] });
  }
  return rows;
}

async function writeCsv(pathRel: string, rows: DrawRow[]) {
  const p = path.resolve(process.cwd(), pathRel);
  await ensureDir(p);
  await fs.writeFile(p, toCsv(rows), "utf8");
}

async function updateFromCalottery(outRel = OUT) {
  let html = await fetchText(CALOTTERY_CARD_URL, { referer: "https://www.calottery.com/" });
  let fresh = await parseCalotteryCard(html);
  if (fresh.length === 0) {
    if (LOG_VERBOSE) console.warn("[ca_daily4] retrying calottery card with no-cache headers...");
    try {
      html = await fetchText(CALOTTERY_CARD_URL, {
        referer: "https://www.calottery.com/",
        accept: "text/html",
        pragma: "no-cache",
        "cache-control": "no-cache",
      });
      fresh = await parseCalotteryCard(html);
    } catch {}
  }
  if (fresh.length === 0 && String(process.env.CA_UPDATE_USE_PW ?? "0") === "1" && !isNextDrawCard(html)) {
    if (!PW_ENABLE) {
      if (LOG_VERBOSE) console.warn("[ca_daily4] CA_UPDATE_USE_PW=1 but Playwright disabled (CA_ENABLE_PLAYWRIGHT=0)");
    } else {
      if (LOG_VERBOSE) console.warn("[ca_daily4] using Playwright to fetch card HTML for update...");
      try {
        await ensureBrowser();
        const page = await _pwContext!.newPage();
        await page.goto(CALOTTERY_CARD_URL, { waitUntil: "domcontentloaded", timeout: PW_TIMEOUT_MS });
        await page.getByRole("button", { name: /accept|agree|consent/i }).first().click({ timeout: 1500 }).catch(() => {});
        const list = page.locator(
          "#winningNumbers14 .draw-cards--winning-numbers, " +
          "#draw-game-14 .draw-cards--winning-numbers, " +
          "#drawGame10 .draw-cards--winning-numbers, " +
          "#draw-game-10 .draw-cards--winning-numbers, " +
          ".card.daily4 .draw-cards--winning-numbers"
        );
        await page.waitForLoadState("networkidle", { timeout: PW_TIMEOUT_MS }).catch(() => {});
        await list.first().waitFor({ state: "visible", timeout: PW_TIMEOUT_MS }).catch(() => {});
        const cardHtml = await page.evaluate(() => {
          const card = document.querySelector(
            "#winningNumbers14 .card-body, " +
            "#draw-game-14 .card-body, " +
            "#drawGame10 .card-body, " +
            "#draw-game-10 .card-body, " +
            ".card.daily4 .card-body"
          );
          return card ? (card as HTMLElement).outerHTML : document.body.outerHTML;
        });
        html = cardHtml || (await page.content());
        await page.close().catch(() => {});
        fresh = await parseCalotteryCard(html);
      } catch (e) {
        if (LOG_VERBOSE) console.warn("[ca_daily4] Playwright card fetch failed:", String(e));
      }
    }
  }
  if (LOG_VERBOSE) {
    console.log(`[ca_daily4] calottery fresh totals: ${fresh.length}`);
    if (fresh.length === 0) {
      const snippet = (html || "").replace(/\s+/g, " ").slice(0, 200);
      console.warn(`[ca_daily4] WARNING: calottery parser found 0 entries. First 200 chars: ${snippet}…`);
    }
  }

  // Fallback: if CA card is "Next Draw" or we still have no numbers, use the latest posted from LotteryUSA.
  if (fresh.length === 0 || isNextDrawCard(html)) {
    const lusaLatest = await fetchLatestFromLUSA();
    if (lusaLatest) {
      if (LOG_VERBOSE) console.log(`[ca_daily4] Using LotteryUSA fallback: ${lusaLatest.dateMDY} -> ${lusaLatest.balls.join(",")}`);
      fresh = [lusaLatest];
    } else if (LOG_VERBOSE) {
      console.warn("[ca_daily4] LotteryUSA fallback failed to return a latest row.");
    }
  }

  const cur = await readCsv(outRel);
  const byDate = new Map(cur.map((r) => [r.dateMDY, r]));
  let added = 0;
  for (const f of fresh) {
    if (!byDate.has(f.dateMDY)) {
      cur.push(f);
      byDate.set(f.dateMDY, f);
      added++;
    }
  }
  cur.sort((a, b) => {
    const [am, ad, ay] = a.dateMDY.split("/").map(Number);
    const [bm, bd, by] = b.dateMDY.split("/").map(Number);
    return Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd);
  });

  await writeCsv(outRel, cur);
  console.log(`[CA DAILY4] Update complete. Added ${added}.`);
}

// ---------- Public API ----------
export async function buildCaliforniaDaily4(
  mode: "seed" | "update",
  outRel = OUT
) {
  try {
    await initHttpDispatcher();
    if (mode === "seed") {
      await seedFromLotteryUSA(outRel);
    } else {
      await updateFromCalottery(outRel);
    }
  } finally {
    await closeBrowser().catch(() => {});
    try {
      const undici = await import("undici");
      await _undiciAgent?.close?.();
      undici.setGlobalDispatcher(new undici.Agent());
    } catch {}
  }
}

export async function buildCaliforniaDaily4Update(outRel = OUT) {
  return buildCaliforniaDaily4("update", outRel);
}

export async function buildCaliforniaDaily4Seed(outRel = OUT) {
  return buildCaliforniaDaily4("seed", outRel);
}

// ---------- CLI ----------
async function main() {
  const mode = (process.argv[2] || "").toLowerCase();
  if (LOG_VERBOSE) console.log(`[ca_daily4] main() mode="${mode}"`);
  try {
    if (mode === "seed") { await buildCaliforniaDaily4("seed"); return; }
    if (mode === "update") { await buildCaliforniaDaily4("update"); return; }
    console.error(`Usage: node --loader ts-node/esm ${path.relative(process.cwd(), process.argv[1] || "ca_daily4.ts")} <seed|update>`);
    process.exit(2);
  } catch (e: any) {
    console.error("[ca_daily4] Fatal:", e?.stack || String(e))
    process.exit(1);
  }
}

// Run only when invoked directly (works with .ts via ts-node/esm and compiled .js)
try {
  // Normalize both sides to absolute filesystem paths before comparison
  const thisFile = path.resolve(fileURLToPath(import.meta.url));
  const invoked  = process.argv?.[1] ? path.resolve(process.argv[1]) : "";
  if (thisFile === invoked) { void main(); }
} catch {
  // best-effort; if anything weird happens, just try running
  void main();
}

