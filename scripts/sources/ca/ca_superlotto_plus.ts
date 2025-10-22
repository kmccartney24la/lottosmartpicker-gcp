// scripts/sources/ca/ca_superlotto_plus.ts
// Node 18+ ESM. Deps: cheerio
//
// Modes:
//   seed   → build public/data/ca/superlotto_plus.csv from LotteryUSA (full year; paginated).
//   update → append newest row from calottery.com to the existing CSV (no duplicates).
//
// Usage (Windows PowerShell):
//   $env:CA_HTTP_TIMEOUT_MS = "20000"
//   node --loader ts-node/esm .\scripts\sources\ca\ca_superlotto_plus.ts seed
//   node --loader ts-node/esm .\scripts\sources\ca\ca_superlotto_plus.ts update
//
// Output CSV (canonical):
//   draw_date,num1,num2,num3,num4,num5,special
//   2025-10-19,6,14,23,28,39,12
//
// Notes:
// - Reuses your Daily3/4 GameHistory pagination logic.
// - CA card parse is robust to DOM variants; falls back to LUSA latest when CA card shows "Next Draw".

import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { CheerioAPI, Cheerio } from "cheerio";
import type { Element, AnyNode } from "domhandler";
import type { Browser, BrowserContext, Page } from "playwright";

// CSV helpers (your shared module)
import { toCanonicalCsv, latestCsv } from "../../../lib/csv.mjs";

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
    if (LOG_VERBOSE) console.log("[ca_superlotto_plus] undici agent configured (short keepAlive)");
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

const LUSA_URL = "https://www.lotteryusa.com/california/super-lotto-plus/year";
const CALOTTERY_CARD_URL = "https://www.calottery.com/en/draw-games/superlotto-plus#section-content-2-3";

// default output; callers can override via public API
const DEFAULT_OUT = "public/data/ca/superlotto_plus.csv";

// ---------- tiny utils ----------
const ensureDir = async (p: string) => fs.mkdir(path.dirname(p), { recursive: true });
const normalizeSpaces = (s: string) => s.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();

function fetchText(url: string, extraHeaders: Record<string, string> = {}): Promise<string> {
  if (LOG_VERBOSE) console.log(`[ca_superlotto_plus] GET ${url}`);
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
  if (LOG_VERBOSE) console.log(`[ca_superlotto_plus] POST ${url} body=${form.toString()}`);
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

// YYYY-MM-DD
function toYMD(dateText: string): string | null {
  const s0 = normalizeSpaces(dateText);

  const pad = (n: number) => String(n).padStart(2, "0");
  const to = (y: number, m1: number, d: number) => `${y}-${pad(m1)}-${pad(d)}`;

  const parse = (s: string): string | null => {
    // "Oct 19, 2025" / "October 19, 2025"
    let m = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/);
    if (m) {
      const mon = m[1].slice(0, 3).toUpperCase();
      const dd = Number(m[2]);
      const yyyy = Number(m[3]);
      const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
      const idx = months.indexOf(mon);
      if (idx >= 0) {
        const js = new Date(Date.UTC(yyyy, idx, dd));
        if (!Number.isNaN(js.getTime())) return to(js.getUTCFullYear(), js.getUTCMonth()+1, js.getUTCDate());
      }
    }
    // "10/19/2025" or "10-19-2025"
    m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) {
      const mm = Number(m[1]), dd = Number(m[2]), yyyy = Number(m[3]);
      return to(yyyy, mm, dd);
    }
    return null;
  };

  let out = parse(s0);
  if (out) return out;
  out = parse(s0.replace(/^[A-Za-z]{3,9},\s+/, "")); // "Sunday, Oct 19, 2025"
  if (out) return out;
  out = parse(s0.replace(/^[A-Za-z]{3}\//, "")); // "SUN/OCT 19, 2025"
  return out;
}

type CanonicalRow = {
  draw_date: string; // YYYY-MM-DD
  num1: number; num2: number; num3: number; num4: number; num5: number;
  special: number;
};

// ---------- helpers: detect Next-Draw card ----------
function isNextDrawCard(html: string): boolean {
  const s = normalizeSpaces(html).toLowerCase();
  return (
    /\bnext\s*draw\b/.test(s) ||
    /\bresults\s+are\s+coming\s+soon\b/.test(s) ||
    /\bdraw\s+entry\s+is\s+closed\b/.test(s)
  );
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
    if (LOG_VERBOSE) console.log(`[ca_superlotto_plus] PW: initial groups=${lastGroups} height=${lastHeight}`);
    const btn = page.locator("button[data-action='live#action'][data-live-action-param='more'], button:has-text('Load More')");
    for (let i = 0; i < PW_MAX_CLICKS; i++) {
      const visible = await btn.isVisible().catch(() => false);
      if (!visible) break;
      if (LOG_VERBOSE) console.log(`[ca_superlotto_plus] PW: click ${i + 1}/${PW_MAX_CLICKS}`);
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
    if (bestEl === null || score > bestScore || (score === bestScore && dist < bestDist)) {
      bestEl = $el; bestScore = score; bestDist = dist;
    }
  });
  return bestEl ?? cands.first();
}

async function parseYearPageAll(url: string): Promise<CanonicalRow[]> {
  if (LOG_VERBOSE) console.log(`[ca_superlotto_plus] parseYearPageAll: ${url}`);
  const html1 = await fetchText(url);
  const { load } = await getCheerio();
  const $1: CheerioAPI = load(html1);
  const table = $1("table#history-table-all-new");
  if (!table.length) throw new Error("Could not find results table on page 1.");

  const rowsAll: CanonicalRow[] = [];
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
  if (LOG_VERBOSE) console.log(`[ca_superlotto_plus] chosen live host: name="${liveName}" url="${liveUrl}"`);
  const propsRaw = liveHost.attr("data-live-props-value") || "{}";
  let gameParam = "";
  try { const props = JSON.parse(propsRaw); if (props?.game) gameParam = String(props.game); } catch {}

  if (PW_ENABLE && !TRY_SERVER_WHEN_PW) {
    if (LOG_VERBOSE) console.log("[ca_superlotto_plus] PW enabled → skipping server pagination and going straight to clicking");
  } else {
    for (let page = 2; page <= 50; page++) {
      if (LOG_VERBOSE) console.log(`[ca_superlotto_plus] trying page=${page}`);
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
      if (LOG_VERBOSE) console.log("[ca_superlotto_plus] detected Load More button; trying stateful server-side loop");
      await paginateStatefulLive(LUSA_URL, html1, rowsAll);
    }
  }

  const needBrowser =
    rowsAll.length <= page1Rows.length ||
    /Load More/i.test($1("button.c-button.c-button--primary-outline.c-button--full").text() || "");
  if (needBrowser && PW_ENABLE) {
    if (LOG_VERBOSE) console.log("[ca_superlotto_plus] fallback: launching browser to click Load More");
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
      console.warn("[ca_superlotto_plus] Playwright disabled; cannot click Load More — only first page fetched.");
    }
  }

  return rowsAll;
}

async function paginateStatefulLive(pageUrl: string, initialHtml: string, rowsAll: CanonicalRow[]): Promise<void> {
  const { load } = await getCheerio();
  const $init: CheerioAPI = load(initialHtml);
  let liveHost = findLiveHost($init);
  if (!liveHost.length) { if (LOG_VERBOSE) console.warn("[ca_superlotto_plus] live host not found; skipping stateful loop."); return; }
  let liveUrl = liveHost.attr("data-live-url-value") || "/_components/GameHistory";
  let liveName = liveHost.attr("data-live-name-value") || "GameHistory";
  const liveId = liveHost.attr("id") || "";
  if (/globalheader/i.test(liveName) || /globalheader/i.test(liveUrl)) {
    liveUrl = "/_components/GameHistory"; liveName = "GameHistory";
    if (LOG_VERBOSE) console.warn("[ca_superlotto_plus] overriding live host to GameHistory endpoint");
  }
  let propsBlob = liveHost.attr("data-live-props-value") || "{}";
  const endpoint = new URL(liveUrl, pageUrl).toString();
  const tryKeys = ["props","data","_props"] as const;
  type TryKey = (typeof tryKeys)[number];
  let chosenKey: TryKey | null = null;
  let prevCount = rowsAll.length;

  for (let i = 0; i < LIVE_MORE_MAX; i++) {
    const hasButton = $init("button[data-action='live#action'][data-live-action-param='more'], button:contains('Load More')").length > 0;
    if (!hasButton && i === 0) { if (LOG_VERBOSE) console.log("[ca_superlotto_plus] no Load More button; skipping."); return; }
    if (LOG_VERBOSE) console.log(`[ca_superlotto_plus] live stateful iteration ${i+1}/${LIVE_MORE_MAX}`);

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
      if (LOG_VERBOSE && i === 0) console.log(`[ca_superlotto_plus] stateful response snippet: ${redactLiveProps(html).slice(0,120)}…`);
      if (probeRows.length) {
        if (!chosenKey) { chosenKey = k; if (LOG_VERBOSE) console.log(`[ca_superlotto_plus] stateful accepted param key="${k}"`); }
        rowsAll.push(...probeRows);
        const nhost = $frag("[data-controller='live'][data-live-props-value]").first();
        if (nhost.length) propsBlob = nhost.attr("data-live-props-value") || propsBlob;
        if ($frag("button[data-action='live#action'][data-live-action-param='more'], button:contains('Load More')").length === 0) return;
        if (rowsAll.length === prevCount) return;
        prevCount = rowsAll.length;
        break;
      }
    }
    if (!html) { if (LOG_VERBOSE) console.warn("[ca_superlotto_plus] stateful POST yielded no usable fragment; stopping."); return; }
  }
  if (LOG_VERBOSE) console.warn("[ca_superlotto_plus] stateful loop reached CA_LIVE_MORE_MAX cap; stopping.");
}

function redactLiveProps(html: string): string {
  return html
    .replace(/(data-live-props-value=)"([^"]*)"/gi, '$1"[redacted]"')
    .replace(/("props" *: *\{)[\s\S]*?(\})/i, '$1[redacted]$2');
}

// ---------- row extraction (LUSA) -> CanonicalRow ----------
function extractRowsFromTable($: CheerioAPI, scope: Cheerio<Element>): CanonicalRow[] {
  const out: CanonicalRow[] = [];
  scope
    .find("tr.c-results-table__item.c-draw-card, tr.c-results-table__item--medium.c-draw-card, tr.c-results-table__item")
    .each((_: number, tr: Element) => {
      const $tr = $(tr);
      const firstCell = $tr.find("th,td").first();
      const dateText = normalizeSpaces(firstCell.find("time").text() || firstCell.text());
      const draw_date = toYMD(dateText);
      if (!draw_date) return;

      // Prefer the actual results cell; fallback to the second cell (never the last payout/jackpot cell)
      let resultCell = $tr.find("td.c-draw-card__result").first();
      if (!resultCell.length) {
        const tds = $tr.find("td");
        resultCell = tds.eq(Math.min(1, Math.max(0, tds.length - 1)));
      }

      const main: number[] = [];
      const extras: number[] = [];
      // Read only small number tokens from the results cell
      resultCell.find("*").each((__, el: Element) => {
        const $el = $(el);
        const t = normalizeSpaces($el.text());
        const m = t.match(/^\d{1,2}$/);
        if (!m) return;
        const v = Number(m[0]);
        const cls = ($el.attr("class") || "").toLowerCase();
        const aria = ($el.attr("aria-label") || "").toLowerCase();
        const isBonus =
          /\bbonus\b|\bmega\b|\bmega[- ]?ball\b|\bmegaball\b|\bextra\b/.test(cls) ||
          /\bbonus\b|\bmega\b/.test(aria) ||
          /\bMN\b|mega\b/i.test(t);
        if (isBonus) extras.push(v); else if (main.length < 5) main.push(v);
      });

      if (main.length + extras.length < 6) {
        const raw = normalizeSpaces(resultCell.text());
        // Limit to 1–2 digit tokens to avoid $ and big amounts
        const nums = (raw.match(/\b\d{1,2}\b/g) || []).map(Number);
        if (nums.length >= 6) {
          main.length = 0; main.push(...nums.slice(0, 5));
          extras.length = 0; extras.push(nums[5]);
        }
      }

      if (main.length >= 5 && extras.length >= 1) {
        out.push({
          draw_date,
          num1: main[0], num2: main[1], num3: main[2], num4: main[3], num5: main[4],
          special: extras[0],
        });
      }
    });
  return out;
}

function extractRowsLoose($: CheerioAPI): CanonicalRow[] {
  const rows: CanonicalRow[] = [];
  let pendingDate: string | null = null;
  const dateLike = (s: string) => /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/i.test(s);

  $("body,body *").contents().each((_: number, node: AnyNode) => {
    const asAny = node as unknown as { type?: string; data?: string };
    if (asAny?.type === "text") {
      const txt = normalizeSpaces(asAny.data || "");
      if (!txt) return;
      if (!pendingDate && dateLike(txt)) { pendingDate = txt; return; }
      if (pendingDate) {
        const m = txt.match(/\b\d{1,2}\b/g);
        if (m && m.length >= 6) {
          const draw_date = toYMD(pendingDate!);
          const nums = m.map(Number);
          if (draw_date) rows.push({
            draw_date,
            num1: nums[0], num2: nums[1], num3: nums[2], num4: nums[3], num5: nums[4],
            special: nums[5],
          });
          pendingDate = null;
        }
      }
    }
  });
  return rows;
}

// ---------- CA Lottery (update) ----------
async function parseCalotteryCard(html: string): Promise<CanonicalRow[]> {
  const { load } = await getCheerio();
  const $: CheerioAPI = load(html);
  if (isNextDrawCard(html)) {
    if (LOG_VERBOSE) console.log("[ca_superlotto_plus] calottery card indicates Next Draw / results pending.");
    return [];
  }

  let card =
    $("#draw-game-winning-numbers-spotlight .card.superlotto-plus .card-body").first();
  if (!card.length) card = $("#winningNumbers11 .card-body").first();
  if (!card.length) card = $("#draw-game-11 .card-body").first();
  if (!card.length) card = $("#drawGame11 .card-body").first();
  if (!card.length) card = $(".card.superlotto-plus .card-body").first();

  const scopes: Cheerio<Element>[] = card.length
    ? [card]
    : [
        $("#winningNumbers11 .card-body"),
        $("#draw-game-11 .card-body"),
        $("#drawGame11 .card-body"),
        $(".card.superlotto-plus .card-body"),
        $("#draw-game-winning-numbers-spotlight .card .card-body"),
        $(".card-body"),
      ];

  const out: CanonicalRow[] = [];
  for (const scope of scopes) {
    const dateP = scope.find("p.draw-cards--draw-date").first();
    const rawDate = normalizeSpaces(dateP.find("strong").text() || dateP.text()).replace(/^[A-Z]{3}\//, "");
    const draw_date = toYMD(rawDate);

    const list = scope.find("ul.draw-cards--winning-numbers").first();
    const main: number[] = [];
    let special: number | undefined;

    list.find("li").each((_, li: Element) => {
      const $li = $(li);
      const inner = normalizeSpaces($li.text());
      const numMatch = inner.match(/\b\d{1,2}\b/g);
      if (!numMatch || !numMatch.length) return;
      const v = Number(numMatch[0]);
      const cls = ($li.attr("class") || "").toLowerCase();
      const hasMegaFlag = /\bmega\b/.test(inner.toLowerCase()) || /\bmega\b/.test(cls);
      if (hasMegaFlag) special = v;
      else if (main.length < 5) main.push(v);
      else if (special === undefined) special = v; // overflow fallback
    });

    if (draw_date && main.length >= 5 && typeof special === "number") {
      out.push({
        draw_date,
        num1: main[0], num2: main[1], num3: main[2], num4: main[3], num5: main[4],
        special,
      });
      break;
    }
  }

  if (LOG_VERBOSE) {
    console.log(`[ca_superlotto_plus] calottery parse: found ${out.length} entries`);
    if (!out.length) {
      const container =
        $("#winningNumbers11").first().html() ||
        $("#draw-game-11").first().html() ||
        $("#draw-game-winning-numbers-spotlight").first().html() ||
        $(".card.superlotto-plus").first().html() ||
        $("body").html() ||
        "";
      const snippet = normalizeSpaces(container).slice(0, 500);
      console.warn("[ca_superlotto_plus] WARNING: calottery parser found 0 entries. First 500 chars:", snippet);
    }
  }
  return out;
}

// ---------- CSV IO (canonical) ----------
async function readCanonicalCsv(pathRel: string): Promise<CanonicalRow[]> {
  const p = path.resolve(process.cwd(), pathRel);
  if (!fsSync.existsSync(p)) return [];
  const txt = await fs.readFile(p, "utf8");
  const lines = txt.trim().split(/\r?\n/);
  const header = (lines.shift() || "").split(",");
  const col = (name: string) => header.indexOf(name);
  const iDate = col("draw_date");
  const i1 = col("num1"), i2 = col("num2"), i3 = col("num3"), i4 = col("num4"), i5 = col("num5"), iS = col("special");
  const out: CanonicalRow[] = [];
  for (const ln of lines) {
    const parts = ln.split(",").map((x) => x.trim());
    if (!parts.length) continue;
    const draw_date = parts[iDate] || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draw_date)) continue;
    out.push({
      draw_date,
      num1: Number(parts[i1]), num2: Number(parts[i2]), num3: Number(parts[i3]),
      num4: Number(parts[i4]), num5: Number(parts[i5]),
      special: Number(parts[iS] || "0"),
    });
  }
  return out;
}

async function writeCanonicalCsv(pathRel: string, rows: CanonicalRow[]) {
  const p = path.resolve(process.cwd(), pathRel);
  await ensureDir(p);
  const csv = toCanonicalCsv(rows);
  await fs.writeFile(p, csv, "utf8");
}

// ---------- seed / update (parametrized) ----------
async function seedFromLotteryUSA(outRel: string = DEFAULT_OUT) {
  if (LOG_VERBOSE) console.log("[ca_superlotto_plus] seedFromLotteryUSA: start");
  console.time?.("[ca_superlotto_plus] seed duration");
  const rows = await parseYearPageAll(LUSA_URL);
  // de-dupe by draw_date; sort ASC
  const byDate = new Map<string, CanonicalRow>();
  for (const r of rows) if (!byDate.has(r.draw_date)) byDate.set(r.draw_date, r);
  const clean = [...byDate.values()].sort((a, b) => a.draw_date.localeCompare(b.draw_date));
  await writeCanonicalCsv(outRel, clean);
  console.log(`[CA SUPERLOTTO+] Seeded ${rows.length} rows → ${outRel}`);
  console.timeEnd?.("[ca_superlotto_plus] seed duration");
}

async function fetchLatestFromLUSA(): Promise<CanonicalRow | null> {
  try {
    const html = await fetchText(LUSA_URL);
    const { load } = await getCheerio();
    const $: CheerioAPI = load(html);
    const table = $("table#history-table-all-new").first();
    if (!table.length) return null;
    const rows = extractRowsFromTable($, table);
    return rows.length ? rows[0] : null;
  } catch {
    return null;
  }
}

async function updateFromCalottery(outRel: string = DEFAULT_OUT) {
  let html = await fetchText(CALOTTERY_CARD_URL, { referer: "https://www.calottery.com/" });
  let fresh = await parseCalotteryCard(html);

  if (fresh.length === 0) {
    if (LOG_VERBOSE) console.warn("[ca_superlotto_plus] retrying calottery card with no-cache headers...");
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

  // Read current CSV early so we know the latest known draw date.
  const cur = await readCanonicalCsv(outRel);
  const byDate = new Map(cur.map(r => [r.draw_date, r]));
  const latestExisting = cur.length
    ? cur.reduce((max, r) => (r.draw_date > max ? r.draw_date : max), cur[0].draw_date)
    : "";

  if (fresh.length === 0 && String(process.env.CA_UPDATE_USE_PW ?? "0") === "1" && !isNextDrawCard(html)) {
    if (!PW_ENABLE) {
      if (LOG_VERBOSE) console.warn("[ca_superlotto_plus] CA_UPDATE_USE_PW=1 but Playwright disabled");
    } else {
      if (LOG_VERBOSE) console.warn("[ca_superlotto_plus] using Playwright to fetch card HTML for update...");
      try {
        await ensureBrowser();
        const page = await _pwContext!.newPage();
        await page.goto(CALOTTERY_CARD_URL, { waitUntil: "domcontentloaded", timeout: PW_TIMEOUT_MS });
        await page.getByRole("button", { name: /accept|agree|consent/i }).first().click({ timeout: 1500 }).catch(() => {});
        const list = page.locator(
          "#winningNumbers11 .draw-cards--winning-numbers, " +
          "#draw-game-11 .draw-cards--winning-numbers, " +
          "#drawGame11 .draw-cards--winning-numbers, " +
          ".card.superlotto-plus .draw-cards--winning-numbers"
        );
        await page.waitForLoadState("networkidle", { timeout: PW_TIMEOUT_MS }).catch(() => {});
        await list.first().waitFor({ state: "visible", timeout: PW_TIMEOUT_MS }).catch(() => {});
        const cardHtml = await page.evaluate(() => {
          const card = document.querySelector(
            "#winningNumbers11 .card-body, #draw-game-11 .card-body, #drawGame11 .card-body, .card.superlotto-plus .card-body"
          );
          return card ? (card as HTMLElement).outerHTML : document.body.outerHTML;
        });
        html = cardHtml || (await page.content());
        await page.close().catch(() => {});
        fresh = await parseCalotteryCard(html);
      } catch (e) {
        if (LOG_VERBOSE) console.warn("[ca_superlotto_plus] Playwright card fetch failed:", String(e));
      }
    }
  }

  // Fallback to LUSA latest if CA card is pending/empty
  if (fresh.length === 0 || isNextDrawCard(html)) {
    const lusaLatest = await fetchLatestFromLUSA();
    if (lusaLatest) {
      if (!latestExisting || lusaLatest.draw_date > latestExisting) {
        if (LOG_VERBOSE) console.log(`[ca_superlotto_plus] Using LotteryUSA fallback: ${lusaLatest.draw_date} (${lusaLatest.num1},${lusaLatest.num2},${lusaLatest.num3},${lusaLatest.num4},${lusaLatest.num5} | ${lusaLatest.special})`);
        fresh = [lusaLatest];
      } else {
        if (LOG_VERBOSE) console.log(`[ca_superlotto_plus] LotteryUSA fallback is not newer than CSV (latest CSV=${latestExisting}, LUSA=${lusaLatest.draw_date}); skipping fallback append.`);
        fresh = [];
      }
    }
  }

  // Merge only genuinely new rows, then write
  let added = 0;
  for (const f of fresh) {
    if (!byDate.has(f.draw_date)) {
      cur.push(f);
      byDate.set(f.draw_date, f);
      added++;
    }
  }
  // Keep canonical sort (ASC by date)
  cur.sort((a, b) => a.draw_date.localeCompare(b.draw_date));
  await writeCanonicalCsv(outRel, cur);

  // Log summary + echo latest line for easy CI logs scanning
  const finalCsv = await fs.readFile(path.resolve(process.cwd(), outRel), "utf8");
  const latest = latestCsv(finalCsv).trim();
  console.log(`[CA SUPERLOTTO+] Update complete. Added ${added}. Latest row:\n${latest}`);
}

// ---------- Public API (import-safe) ----------
/** Update-only builder used by the orchestrator. Never seeds; appends latest draw if missing. */
export async function buildCaliforniaSuperLottoPlusUpdate(outRel: string = DEFAULT_OUT) {
  try {
    await initHttpDispatcher();
    await updateFromCalottery(outRel);
  } finally {
    await closeBrowser().catch(() => {});
    try {
      const undici = await import("undici");
      await _undiciAgent?.close?.();
      undici.setGlobalDispatcher(new undici.Agent());
    } catch {}
    if (LOG_VERBOSE) console.log("[ca_superlotto_plus] done.");
  }
}

/** Optional: manual seeding helper for local use only (not called by orchestrator). */
export async function buildCaliforniaSuperLottoPlusSeed(outRel: string = DEFAULT_OUT) {
  try {
    await initHttpDispatcher();
    await seedFromLotteryUSA(outRel);
  } finally {
    await closeBrowser().catch(() => {});
    try {
      const undici = await import("undici");
      await _undiciAgent?.close?.();
      undici.setGlobalDispatcher(new undici.Agent());
    } catch {}
    if (LOG_VERBOSE) console.log("[ca_superlotto_plus] done.");
  }
}

// ---------- CLI (guarded; no work on import) ----------
async function main() {
  const mode = (process.argv[2] || "").toLowerCase();
  if (LOG_VERBOSE) console.log(`[ca_superlotto_plus] main() mode="${mode}"`);
  try {
    if (mode === "seed") { await buildCaliforniaSuperLottoPlusSeed(); return; }
    if (mode === "update") { await buildCaliforniaSuperLottoPlusUpdate(); return; }
    console.error(`Usage: node --loader ts-node/esm ${path.relative(process.cwd(), process.argv[1] || "ca_superlotto_plus.ts")} <seed|update>`);
    process.exit(2);
  } finally {
    await closeBrowser().catch(() => {});
    try { const undici = await import("undici"); await _undiciAgent?.close?.(); undici.setGlobalDispatcher(new undici.Agent()); } catch {}
    if (LOG_VERBOSE) console.log("[ca_superlotto_plus] done.");
  }
}

// Run only when invoked directly (works with ts-node/esm and compiled .js on Windows/macOS/Linux)
try {
  const thisFile = path.resolve(fileURLToPath(import.meta.url));
  const invoked  = process.argv?.[1] ? path.resolve(process.argv[1]) : "";
  if (thisFile === invoked) {
    main().catch((e) => {
      console.error(e);
      process.exit(1);
    });
  }
} catch {
  // If anything is odd with argv or URLs, just try to run.
  main().catch((e) => { console.error(e); process.exit(1); });
}