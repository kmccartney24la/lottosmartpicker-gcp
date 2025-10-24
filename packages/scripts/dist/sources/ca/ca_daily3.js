// scripts/sources/ca/ca_daily3.ts
// Node 18+ ESM. Deps: cheerio
//
// Modes:
//   seed   → build public/data/ca/daily3_midday.csv and ..._evening.csv from LotteryUSA (full year; paginated).
//   update → append newest rows from calottery.com to the existing CSVs (no duplicates).
//
// Usage (Windows PowerShell):
//   $env:CA_HTTP_TIMEOUT_MS = "20000"
//   node --loader ts-node/esm .\scripts\sources\ca\ca_daily3.ts seed
//   node --loader ts-node/esm .\scripts\sources\ca\ca_daily3.ts update
//
// CSV FORMAT (as requested):
//   draw_date,ball1,ball2,ball3
//   5/10/1988,1,7,8
//   5/11/1988,0,7,1
//
// Notes:
// - The LotteryUSA pages are server-rendered but paginate behind a LiveComponent endpoint.
//   We fetch page 1, discover the component url + game id from data-live-* attributes,
//   then fetch page=2,3,... until a page returns no draw rows.
// - We keep the CA Lottery update parser simple/robust for the two most recent draws on the game card.
import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
let _cheerio = null;
async function getCheerio() {
    if (!_cheerio)
        _cheerio = await import("cheerio");
    return _cheerio;
}
// ---------- HTTP dispatcher (Undici) ----------
// Node 18's global fetch is backed by undici with keep-alive. We install our own dispatcher
// with very short keepAlive time and close it on exit to ensure the event loop drains.
let _undiciAgent = null;
async function initHttpDispatcher() {
    try {
        const undici = await import("undici");
        _undiciAgent = new undici.Agent({
            keepAliveTimeout: 10, // ms
            keepAliveMaxTimeout: 10, // ms
            connections: 8,
            pipelining: 0,
        });
        undici.setGlobalDispatcher(_undiciAgent);
        if (LOG_VERBOSE)
            console.log("[ca_daily3] undici agent configured (short keepAlive)");
    }
    catch {
        // undici import failed (very unlikely on Node 18+); proceed without customization
    }
}
async function closeHttpDispatcher() {
    try {
        await _undiciAgent?.close?.();
    }
    catch { }
    _undiciAgent = null;
}
// ---------- config ----------
const HTTP_TIMEOUT_MS = Number(process.env.CA_HTTP_TIMEOUT_MS ?? 20000);
const PW_ENABLE = String(process.env.CA_ENABLE_PLAYWRIGHT ?? "1") !== "0";
const PW_TIMEOUT_MS = Number(process.env.CA_PLAYWRIGHT_TIMEOUT_MS ?? 45000);
const PW_WAIT_AFTER_CLICK_MS = Number(process.env.CA_PLAYWRIGHT_WAIT_AFTER_CLICK_MS ?? 600);
const PW_MAX_CLICKS = Number(process.env.CA_PLAYWRIGHT_MAX_CLICKS ?? 50);
const LIVE_MORE_MAX = Number(process.env.CA_LIVE_MORE_MAX ?? 200); // cap server "load more" iterations
const LOG_VERBOSE = String(process.env.CA_LOG ?? "0") !== "0";
// When Playwright is enabled, default to skipping server pagination attempts (saves ~2–5s and log noise).
// Set CA_TRY_SERVER_FIRST=1 to revert to "try server, then Playwright".
const TRY_SERVER_WHEN_PW = String(process.env.CA_TRY_SERVER_FIRST ?? (String(process.env.CA_ENABLE_PLAYWRIGHT ?? "1") !== "0" ? "0" : "1")) !== "0";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const LUSA_EVENING_URL = "https://www.lotteryusa.com/california/daily-3/year";
const LUSA_MIDDAY_URL = "https://www.lotteryusa.com/california/midday-3/year";
const CALOTTERY_CARD_URL = "https://www.calottery.com/en/draw-games/daily-3#section-content-2-3";
const OUT_MIDDAY = "public/data/ca/daily3_midday.csv";
const OUT_EVENING = "public/data/ca/daily3_evening.csv";
const HEADER = "draw_date,ball1,ball2,ball3\n";
// ---------- tiny utils ----------
const ensureDir = async (p) => fs.mkdir(path.dirname(p), { recursive: true });
function normalizeSpaces(s) {
    return s.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
}
function fetchText(url, extraHeaders = {}) {
    if (LOG_VERBOSE)
        console.log(`[ca_daily3] GET ${url}`);
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
        if (!res.ok)
            throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
        return await res.text();
    });
}
async function postForm(url, form, refererOverride) {
    if (LOG_VERBOSE)
        console.log(`[ca_daily3] POST ${url} body=${form.toString()}`);
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
    if (!res.ok)
        throw new Error(`HTTP ${res.status} ${res.statusText} POST ${url}`);
    let txt = await res.text();
    // Some live endpoints return JSON like {"html":"<div>...</div>"}; unwrap if so.
    const t0 = txt.trim();
    if (t0.startsWith("{") && /"html"\s*:/.test(t0)) {
        try {
            const j = JSON.parse(t0);
            if (typeof j.html === "string")
                txt = j.html;
        }
        catch { }
    }
    return txt;
}
function redactLiveProps(html) {
    // redact data-live-props-value="...big json..."
    return html
        .replace(/(data-live-props-value=)"([^"]*)"/gi, '$1"[redacted]"')
        .replace(/("props" *: *\{)[\s\S]*?(\})/i, '$1[redacted]$2');
}
// M/D/YYYY (no zero-padding on month/day)
function toMDY(dateText) {
    const t = normalizeSpaces(dateText
        .replace(/^[A-Za-z]+,?\s+/, "") // drop weekday if present
    );
    // Oct 19, 2025 | OCT 19, 2025 | Oct 19 2025
    let m = t.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/);
    if (m) {
        const mon = m[1].slice(0, 3).toUpperCase();
        const dd = Number(m[2]);
        const yyyy = Number(m[3]);
        const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
        const idx = months.indexOf(mon);
        if (idx >= 0) {
            const js = new Date(Date.UTC(yyyy, idx, dd));
            if (!Number.isNaN(js.getTime())) {
                return `${js.getUTCMonth() + 1}/${js.getUTCDate()}/${js.getUTCFullYear()}`;
            }
        }
    }
    // Fallbacks if they ever change:
    // 10/19/2025 or 10-19-2025
    m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) {
        const mm = Number(m[1]), dd = Number(m[2]), yyyy = Number(m[3]);
        return `${mm}/${dd}/${yyyy}`;
    }
    return null;
}
// ---------- optional Playwright helpers ----------
let _pwBrowser = null;
let _pwContext = null;
// ---------- helpers: detect Next-Draw state; fallback to LotteryUSA latest ----------
function isNextDrawCard(html) {
    const s = normalizeSpaces(html).toLowerCase();
    // Examples seen: "Next Draw:", "Draw entry is closed.", "Results are coming soon!"
    return (/\bnext\s*draw\b/.test(s) ||
        /\bresults\s+are\s+coming\s+soon\b/.test(s) ||
        /\bdraw\s+entry\s+is\s+closed\b/.test(s));
}
async function parseLusaLatestFromUrl(url) {
    try {
        const html = await fetchText(url);
        const { load } = await getCheerio();
        const $ = load(html);
        const table = $("table#history-table-all-new").first();
        if (!table.length)
            return null;
        const rows = extractRowsFromTable($, table);
        return rows.length ? rows[0] : null; // first row is the latest
    }
    catch {
        return null;
    }
}
async function fetchLatestFromLUSA3() {
    const [eve, mid] = await Promise.all([
        parseLusaLatestFromUrl(LUSA_EVENING_URL),
        parseLusaLatestFromUrl(LUSA_MIDDAY_URL),
    ]);
    const out = [];
    if (mid)
        out.push({ when: "MIDDAY", dateMDY: mid.dateMDY, balls: mid.balls });
    if (eve)
        out.push({ when: "EVENING", dateMDY: eve.dateMDY, balls: eve.balls });
    return out;
}
async function ensureBrowser() {
    if (_pwBrowser && _pwContext)
        return;
    const { chromium } = await import("playwright");
    _pwBrowser = await chromium.launch({
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
        ],
    });
    _pwContext = await _pwBrowser.newContext({
        userAgent: UA,
        locale: "en-US",
        viewport: { width: 1280, height: 1800 },
    });
}
async function closeBrowser() {
    try {
        // Ensure any routing hooks are removed before closing the context.
        await _pwContext?.unroute?.("**/*");
    }
    catch { }
    try {
        await _pwContext?.close();
    }
    catch { }
    try {
        await _pwBrowser?.close();
    }
    catch { }
    _pwBrowser = null;
    _pwContext = null;
}
async function fetchFullHtmlByClickingMore(url) {
    if (!PW_ENABLE)
        throw new Error("Playwright fallback disabled (CA_ENABLE_PLAYWRIGHT=0).");
    await ensureBrowser();
    if (!_pwContext)
        throw new Error("Playwright context unavailable");
    const page = await _pwContext.newPage();
    try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: PW_TIMEOUT_MS });
        // Best-effort cookie/consent clicks
        await page.getByRole("button", { name: /accept|agree|consent/i }).first().click({ timeout: 1500 }).catch(() => { });
        // Wait for the results table
        const table = page.locator("table#history-table-all-new");
        await table.waitFor({ state: "visible", timeout: PW_TIMEOUT_MS });
        // Helper: count loaded page groups (<tbody id="page--N">)
        async function getGroupCount() {
            return await table.locator("tbody[id^='page--']").count();
        }
        async function getTableHeight() {
            const bb = await table.boundingBox();
            return bb ? Math.round(bb.height) : 0;
        }
        let lastGroups = await getGroupCount();
        let lastHeight = await getTableHeight();
        if (LOG_VERBOSE)
            console.log(`[ca_daily3] PW: initial groups=${lastGroups} height=${lastHeight}`);
        const btn = page.locator("button[data-action='live#action'][data-live-action-param='more'], button:has-text('Load More')");
        for (let i = 0; i < PW_MAX_CLICKS; i++) {
            const visible = await btn.isVisible().catch(() => false);
            if (!visible) {
                if (LOG_VERBOSE)
                    console.log("[ca_daily3] PW: Load More not visible; stop.");
                break;
            }
            if (LOG_VERBOSE)
                console.log(`[ca_daily3] PW: click ${i + 1}/${PW_MAX_CLICKS}`);
            await btn.scrollIntoViewIfNeeded().catch(() => { });
            const waitForNext = Promise.all([
                page.waitForResponse((r) => /\/_components\/GameHistory/i.test(r.url()) &&
                    (r.status() === 200 || r.status() === 204), { timeout: Math.max(2500, PW_WAIT_AFTER_CLICK_MS + 500) }).catch(() => null),
                page.waitForTimeout(PW_WAIT_AFTER_CLICK_MS),
            ]);
            await btn.click({ timeout: PW_TIMEOUT_MS }).catch(async () => {
                // retry once after a tiny scroll/pause
                await page.mouse.wheel(0, 600);
                await page.waitForTimeout(250);
                await btn.click({ timeout: PW_TIMEOUT_MS });
            });
            await waitForNext;
            // Wait for a new tbody group OR table height change
            let changed = false;
            for (let poll = 0; poll < 15; poll++) {
                const groups = await getGroupCount();
                const height = await getTableHeight();
                if (groups > lastGroups || height > lastHeight) {
                    changed = true;
                    lastGroups = groups;
                    lastHeight = height;
                    break;
                }
                await page.waitForTimeout(120);
            }
            if (!changed) {
                if (LOG_VERBOSE)
                    console.log("[ca_daily3] PW: no new rows detected; stop.");
                break;
            }
        }
        const html = await page.content();
        await page.close().catch(() => { });
        return html;
    }
    catch (e) {
        try {
            await page.close();
        }
        catch { }
        throw e;
    }
    finally {
        // keep the browser alive for reuse within this process; caller may close in finally{}
    }
}
// Try server-side "load more" (no browser): POST action=more repeatedly until empty.
function findLiveHost($, scope) {
    const root = scope && scope.length ? scope : $("body");
    const cands = root.find("[data-controller='live']");
    if (!cands.length)
        return cands; // empty Cheerio<Element>
    // Score each candidate:
    //  +2 if name/url contains GameHistory
    //  +2 if it contains the history table
    //  +1 if it contains a Load More button
    //  +1 if it has data-live-props-value (stateful)
    // Pick the highest score; break ties by closest ancestor of the table.
    const table = $("table#history-table-all-new").first();
    let bestEl = null;
    let bestScore = -1;
    let bestDist = 9999;
    cands.each((_, node) => {
        const $el = $(node);
        const name = ($el.attr("data-live-name-value") || "").toLowerCase();
        const url = ($el.attr("data-live-url-value") || "").toLowerCase();
        let score = 0;
        if (/gamehistory/.test(name) || /gamehistory/.test(url))
            score += 2;
        if ($el.find("table#history-table-all-new").length)
            score += 2;
        if ($el.find("button[data-action='live#action'][data-live-action-param='more'], button:contains('Load More')").length)
            score += 1;
        if ($el.is("[data-live-props-value]"))
            score += 1;
        // distance = number of ancestors between table and this el (prefer smaller)
        let dist = 9999;
        if (table.length) {
            const parents = table.parents().toArray();
            const idx = parents.indexOf(node);
            if (idx >= 0)
                dist = idx;
        }
        if (bestEl === null ||
            score > bestScore ||
            (score === bestScore && dist < bestDist)) {
            bestEl = $el;
            bestScore = score;
            bestDist = dist;
        }
    });
    return bestEl ?? cands.first();
}
async function paginateStatefulLive(pageUrl, initialHtml, rowsAll) {
    const { load } = await getCheerio();
    const $init = load(initialHtml);
    let liveHost = findLiveHost($init);
    if (!liveHost.length) {
        if (LOG_VERBOSE)
            console.warn("[ca_daily3] live host not found on initial page; skipping stateful loop.");
        return;
    }
    let liveUrl = liveHost.attr("data-live-url-value") || "/_components/GameHistory";
    let liveName = liveHost.attr("data-live-name-value") || "GameHistory";
    const liveId = liveHost.attr("id") || "";
    if (LOG_VERBOSE) {
        console.log(`[ca_daily3] stateful chosen host: name="${liveName}" url="${liveUrl}"`);
    }
    // Guard against picking GlobalHeader by mistake
    if (/globalheader/i.test(liveName) || /globalheader/i.test(liveUrl)) {
        liveUrl = "/_components/GameHistory";
        liveName = "GameHistory";
        if (LOG_VERBOSE)
            console.warn("[ca_daily3] overriding live host to GameHistory endpoint");
    }
    let propsBlob = liveHost.attr("data-live-props-value") || "{}";
    const endpoint = new URL(liveUrl, pageUrl).toString();
    const tryKeys = ["props", "data", "_props"];
    let chosenKey = null;
    let loggedSnippet = false;
    let prevCount = rowsAll.length;
    for (let i = 0; i < LIVE_MORE_MAX; i++) {
        // Stop if button gone on the current DOM (best-effort pre-check)
        const hasButton = $init("button[data-action='live#action'][data-live-action-param='more'], button:contains('Load More')").length > 0;
        if (!hasButton && i === 0 && LOG_VERBOSE) {
            console.log("[ca_daily3] no Load More button detected; skipping stateful loop.");
            return;
        }
        if (LOG_VERBOSE) {
            console.log(`[ca_daily3] live stateful iteration ${i + 1}/${LIVE_MORE_MAX}`);
        }
        let html = null;
        let usedKey = null;
        // Try each props key until something yields a plausible fragment
        const candidates = chosenKey ? [chosenKey] : tryKeys;
        for (const k of candidates) {
            const form = new URLSearchParams();
            form.set("name", liveName);
            form.set("action", "more");
            if (liveId)
                form.set("id", liveId);
            form.set(k, propsBlob);
            try {
                html = await postForm(endpoint, form, pageUrl /* referer override */);
                usedKey = k;
            }
            catch {
                html = null;
                usedKey = null;
            }
            if (!html)
                continue;
            // Check the fragment for a live host and/or rows; if neither are present, consider this key a miss
            const { load } = await getCheerio();
            const $frag = load(html);
            const hostFrag = findLiveHost($frag);
            const partTable = $frag("table#history-table-all-new, tbody[id^='page--'], table .c-results-table__group").first();
            const probeRows = partTable.length ? extractRowsFromTable($frag, partTable) : extractRowsLoose($frag);
            // Always log the first response snippet once for debugging (even if unusable)
            if (LOG_VERBOSE && !loggedSnippet) {
                const snippet = redactLiveProps(html).slice(0, 120);
                console.log(`[ca_daily3] stateful response snippet: ${snippet}…`);
                loggedSnippet = true;
            }
            // Accept if we found a live host OR any rows. If no host, try to grab any new props present globally.
            if (hostFrag.length || probeRows.length) {
                // Good enough: accept this key
                if (!chosenKey) {
                    chosenKey = k;
                    if (LOG_VERBOSE)
                        console.log(`[ca_daily3] stateful accepted param key="${k}"`);
                }
                // Use the fragment
                liveHost = hostFrag.length ? hostFrag : liveHost;
                // Update props for next round if available
                let nextProps = liveHost.attr("data-live-props-value");
                if (!nextProps) {
                    // Search any element with a fresh props blob (some fragments render a sibling host)
                    const anyHost = $frag("[data-controller='live'][data-live-props-value']").first();
                    if (anyHost.length)
                        nextProps = anyHost.attr("data-live-props-value") || "";
                }
                if (nextProps)
                    propsBlob = nextProps;
                // Extract rows from this fragment
                const got = probeRows;
                rowsAll.push(...got);
                if (LOG_VERBOSE)
                    console.log(`[ca_daily3] stateful added ${got.length} rows (total ${rowsAll.length}) via key="${usedKey}"`);
                // Stopping conditions
                const btn = $frag("button[data-action='live#action'][data-live-action-param='more'], button:contains('Load More')");
                const buttonVisible = btn.length > 0;
                if (!buttonVisible) {
                    if (LOG_VERBOSE)
                        console.log("[ca_daily3] stateful stopping: Load More button not found in fragment.");
                    return;
                }
                if (rowsAll.length === prevCount) {
                    if (LOG_VERBOSE)
                        console.log("[ca_daily3] stateful stopping: no new rows appended.");
                    return;
                }
                prevCount = rowsAll.length;
                // Continue outer for-loop
                break;
            }
            else {
                // Try the next key
                html = null;
                usedKey = null;
            }
        }
        if (!html) {
            if (LOG_VERBOSE)
                console.warn("[ca_daily3] stateful POST did not yield usable fragment; stopping.");
            return;
        }
    }
    if (LOG_VERBOSE)
        console.warn("[ca_daily3] stateful loop reached CA_LIVE_MORE_MAX cap; stopping.");
}
// ---------- LotteryUSA (seed) ----------
async function parseYearPageAll(url) {
    if (LOG_VERBOSE)
        console.log(`[ca_daily3] parseYearPageAll: ${url}`);
    // 1) fetch the first page (page=1) which contains the table and the live component props
    const html1 = await fetchText(url);
    const { load } = await getCheerio();
    const $1 = load(html1);
    const table = $1("table#history-table-all-new");
    if (!table.length)
        throw new Error("Could not find results table on page 1.");
    // get page 1 rows
    const rowsAll = [];
    const page1Rows = extractRowsFromTable($1, table);
    rowsAll.push(...page1Rows);
    // discover the live component endpoint & props (page/game)
    const liveHost = findLiveHost($1);
    let liveUrl = liveHost.attr("data-live-url-value") || "/_components/GameHistory";
    let liveName = liveHost.attr("data-live-name-value") || "";
    const liveId = liveHost.attr("id") || "";
    // If we accidentally grabbed GlobalHeader, search again for any host referencing GameHistory
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
        }
        else {
            // Force to GameHistory path; it accepts ?page=N on LotteryUSA
            liveUrl = "/_components/GameHistory";
            liveName = "GameHistory";
        }
    }
    if (LOG_VERBOSE)
        console.log(`[ca_daily3] chosen live host: name="${liveName}" url="${liveUrl}"`);
    // props look like: {"page":1,"game":"US_CA_DAILY_3", ...}
    const propsRaw = liveHost.attr("data-live-props-value") || "{}";
    let gameParam = "";
    try {
        const props = JSON.parse(propsRaw);
        if (props?.game)
            gameParam = String(props.game);
    }
    catch { }
    // 2) Pagination strategy:
    //    If Playwright is on and TRY_SERVER_WHEN_PW=false, skip server attempts and jump straight to clicking.
    //    Otherwise, try server pagination first (GET page=2... and/or stateful 'more'), then fall back to Playwright.
    if (PW_ENABLE && !TRY_SERVER_WHEN_PW) {
        if (LOG_VERBOSE)
            console.log("[ca_daily3] PW enabled → skipping server pagination and going straight to clicking");
    }
    else {
        // 2a) paginate (fast path): page=2,3,... until a page returns no draw rows
        for (let page = 2; page <= 50; page++) {
            if (LOG_VERBOSE)
                console.log(`[ca_daily3] trying page=${page}`);
            let html = null;
            const livePagingUrl = /gamehistory/i.test(liveUrl) ? liveUrl : "/_components/GameHistory";
            const tryGetUrl = `${livePagingUrl}?page=${page}${gameParam ? `&game=${encodeURIComponent(gameParam)}` : ""}${liveId ? `&id=${encodeURIComponent(liveId)}` : ""}`;
            try {
                html = await fetchText(new URL(tryGetUrl, url).toString(), { "x-requested-with": "XMLHttpRequest" });
            }
            catch {
                html = null;
            }
            if (!html) {
                try {
                    const endpoint = new URL(livePagingUrl, url).toString();
                    const form = new URLSearchParams();
                    form.set("page", String(page));
                    if (gameParam)
                        form.set("game", gameParam);
                    if (liveId)
                        form.set("id", liveId);
                    form.set("action", "more");
                    html = await postForm(endpoint, form, url /* referer override */);
                }
                catch {
                    html = null;
                }
            }
            if (!html)
                break;
            const { load } = await getCheerio();
            const $p = load(html);
            const partTable = $p("table#history-table-all-new, tbody[id^='page--'], table .c-results-table__group").first();
            const got = partTable.length ? extractRowsFromTable($p, partTable) : extractRowsLoose($p);
            if (!got.length)
                break;
            rowsAll.push(...got);
        }
        // 2b) If the site uses action=more instead of page=N, try that Server-Only path (no browser).
        if ($1("button[data-action='live#action'][data-live-action-param='more'], button:contains('Load More')").length) {
            if (LOG_VERBOSE)
                console.log("[ca_daily3] detected Load More button; trying stateful server-side loop");
            await paginateStatefulLive(url, html1, rowsAll);
        }
    }
    // 3) If we still only have page 1 (or the Load More button exists), use Playwright to click it out.
    //    This handles UIs that *require* the live#action=more pathway instead of page=N.
    const needBrowser = rowsAll.length <= page1Rows.length ||
        /Load More/i.test($1("button.c-button.c-button--primary-outline.c-button--full").text() || "");
    if (needBrowser && PW_ENABLE) {
        if (LOG_VERBOSE)
            console.log("[ca_daily3] fallback: launching browser to click Load More");
        const fullHtml = await fetchFullHtmlByClickingMore(url);
        const { load } = await getCheerio();
        const $full = load(fullHtml);
        const tableFull = $full("table#history-table-all-new");
        if (tableFull.length) {
            const allRows = extractRowsFromTable($full, tableFull);
            if (allRows.length > rowsAll.length) {
                rowsAll.length = 0;
                rowsAll.push(...allRows);
            }
        }
    }
    else if (needBrowser && !PW_ENABLE) {
        if (LOG_VERBOSE) {
            console.warn("[ca_daily3] Playwright disabled; cannot click Load More — you will only get the first page (~50 rows).");
            console.warn("          Set CA_ENABLE_PLAYWRIGHT=1 to load the full year.");
        }
    }
    // de-dupe by date (last-in wins; they should match anyway), then sort ASC by date
    const byKey = new Map();
    for (const r of rowsAll)
        byKey.set(r.dateMDY, r);
    const out = [...byKey.values()].sort((a, b) => {
        const [am, ad, ay] = a.dateMDY.split("/").map(Number);
        const [bm, bd, by] = b.dateMDY.split("/").map(Number);
        const da = Date.UTC(ay, am - 1, ad);
        const db = Date.UTC(by, bm - 1, bd);
        return da - db;
    });
    return out;
}
function extractRowsFromTable($, scope) {
    const rows = [];
    // Each draw card row generally has classes like "c-results-table__item c-draw-card"
    scope
        .find("tr.c-results-table__item.c-draw-card, tr.c-results-table__item--medium.c-draw-card, tr.c-results-table__item")
        .each((_, tr) => {
        const $tr = $(tr);
        // Date is often in a <th> with a <time>, else plain text
        const firstCell = $tr.find("th,td").first();
        let dateText = normalizeSpaces(firstCell.find("time").text()) ||
            normalizeSpaces(firstCell.text());
        if (!dateText)
            return;
        const dateMDY = toMDY(dateText);
        if (!dateMDY)
            return;
        // Prefer explicit result cell; else fall back to the second/last td
        let resultCell = $tr.find("td.c-draw-card__result").first();
        if (!resultCell.length) {
            const tds = $tr.find("td");
            resultCell = tds.eq(Math.min(1, Math.max(0, tds.length - 1)));
        }
        const digits = [];
        resultCell.find("*").each((__, el) => {
            const t = normalizeSpaces($(el).text());
            const m = t.match(/^\d$/);
            if (m)
                digits.push(Number(m[0]));
        });
        if (digits.length < 3) {
            const raw = normalizeSpaces(resultCell.text());
            const m = raw.match(/\b\d\b/g);
            if (m)
                for (const d of m)
                    if (digits.length < 3)
                        digits.push(Number(d));
        }
        if (digits.length >= 3) {
            rows.push({
                dateMDY,
                balls: [digits[0], digits[1], digits[2]],
            });
        }
    });
    return rows;
}
// If the fragment didn't include table markup, walk text nodes in order.
function extractRowsLoose($) {
    const rows = [];
    let pendingDate = null;
    const dateLike = (s) => /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/i.test(s);
    $("body,body *").contents().each((_, node) => {
        const asAny = node;
        if (asAny?.type === "text") {
            const txt = normalizeSpaces(asAny.data || "");
            if (!txt)
                return;
            if (!pendingDate && dateLike(txt)) {
                pendingDate = txt;
                return;
            }
            if (pendingDate) {
                const m = txt.match(/\b\d\b/g);
                if (m && m.length >= 3) {
                    const dateMDY = toMDY(pendingDate);
                    if (dateMDY) {
                        rows.push({
                            dateMDY,
                            balls: [Number(m[0]), Number(m[1]), Number(m[2])],
                        });
                    }
                    pendingDate = null;
                }
            }
        }
    });
    return rows;
}
function toCsv(rows) {
    const lines = rows.map((r) => `${r.dateMDY},${r.balls[0]},${r.balls[1]},${r.balls[2]}`);
    return HEADER + lines.join("\n") + "\n";
}
async function seedFromLotteryUSA(outMiddayRel = OUT_MIDDAY, outEveningRel = OUT_EVENING) {
    if (LOG_VERBOSE)
        console.log("[ca_daily3] seedFromLotteryUSA: start");
    console.time?.("[ca_daily3] seed duration");
    let evening = [];
    let midday = [];
    if (PW_ENABLE) {
        if (LOG_VERBOSE)
            console.log("[ca_daily3] PW enabled → serializing seed fetches");
        evening = await parseYearPageAll(LUSA_EVENING_URL);
        midday = await parseYearPageAll(LUSA_MIDDAY_URL);
    }
    else {
        if (LOG_VERBOSE)
            console.log("[ca_daily3] PW disabled → parallelizing seed fetches");
        [evening, midday] = await Promise.all([
            parseYearPageAll(LUSA_EVENING_URL),
            parseYearPageAll(LUSA_MIDDAY_URL),
        ]);
    }
    const outE = path.isAbsolute(outEveningRel) ? outEveningRel : path.resolve(process.cwd(), outEveningRel);
    const outM = path.isAbsolute(outMiddayRel) ? outMiddayRel : path.resolve(process.cwd(), outMiddayRel);
    await ensureDir(outE);
    await ensureDir(outM);
    await fs.writeFile(outE, toCsv(evening), "utf8");
    await fs.writeFile(outM, toCsv(midday), "utf8");
    console.log(`[CA DAILY3] Seeded ${midday.length} midday rows  → ${outMiddayRel}`);
    console.log(`[CA DAILY3] Seeded ${evening.length} evening rows → ${outEveningRel}`);
    if (LOG_VERBOSE) {
        console.log(`[CA DAILY3] Final row counts: midday=${midday.length}, evening=${evening.length}`);
    }
    console.timeEnd?.("[ca_daily3] seed duration");
}
// ---------- CA Lottery (update) ----------
async function parseCalotteryCard(html) {
    const { load } = await getCheerio();
    const $ = load(html);
    if (isNextDrawCard(html)) {
        if (LOG_VERBOSE)
            console.log("[ca_daily3] calottery card indicates Next Draw / results pending.");
        return [];
    }
    const results = [];
    // 1) Prefer the explicit card area you pasted:
    //    #draw-game-winning-numbers-spotlight → #drawGame9
    let card = $("#draw-game-winning-numbers-spotlight #drawGame9 .card-body").first();
    // 2) Fallbacks if the structure varies:
    if (!card.length)
        card = $("#drawGame9 .card-body").first();
    if (!card.length)
        card = $("#draw-game-9 .card-body").first();
    if (!card.length)
        card = $(".card.daily3 .card-body").first();
    // If we still can't find the card body, try scanning the full doc (very fallback)
    const scopes = card.length ? [card] : [$(".card.daily3 .card-body"), $("#drawGame9 .card-body"), $("#draw-game-9 .card-body"), $(".card-body")];
    for (const scope of scopes) {
        // Pair each "ul.draw-cards--winning-numbers" with the NEAREST PRECEDING
        // "p.draw-cards--draw-date > strong" in the same card body.
        scope.find("ul.draw-cards--winning-numbers").each((_, ul) => {
            const $ul = $(ul);
            // nearest preceding label (allow strong OR plain)
            const $dateP = $ul.prevAll("p.draw-cards--draw-date").first();
            const rawLabel = normalizeSpaces($dateP.find("strong").text() || $dateP.text());
            if (!rawLabel)
                return;
            // e.g. "MON/OCT 20, 2025 - MIDDAY" or "SUN/OCT 19, 2025 – EVENING"
            const when = /MIDDAY/i.test(rawLabel) ? "MIDDAY" : "EVENING";
            const labelSansWhen = normalizeSpaces(rawLabel.replace(/[–-]\s*(MIDDAY|EVENING)\s*$/i, ""));
            // Remove optional weekday "MON/" prefix
            const dateOnly = labelSansWhen.replace(/^[A-Z]{3}\//, "");
            const dateMDY = toMDY(dateOnly) || "";
            if (!dateMDY)
                return;
            const balls = [];
            $ul.find("li .draw-cards--winning-numbers-inner-wrapper, li").each((__, li) => {
                const t = normalizeSpaces($(li).text());
                const m = t.match(/^\d$/);
                if (m)
                    balls.push(Number(m[0]));
            });
            if (balls.length >= 3) {
                results.push({
                    when,
                    dateMDY,
                    balls: [balls[0], balls[1], balls[2]],
                });
            }
        });
        if (results.length)
            break; // stop after the first successful scope
        // --- Text-mode fallback inside the same scope ---------------------------------
        if (!results.length) {
            const txt = normalizeSpaces(scope.text());
            // Pattern: optional "MON/", then "OCT 20, 2025 - MIDDAY" (dash can be hyphen or en dash),
            // then three single-digit numbers somewhere after.
            const re = /(?:[A-Z]{3}\/)?([A-Z]{3})\s+(\d{1,2}),\s+(\d{4})\s*[–-]\s*(MIDDAY|EVENING)[\s\S]*?\b(\d)\b[\s\S]*?\b(\d)\b[\s\S]*?\b(\d)\b/gi;
            const monthIx = (m) => ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"].indexOf(m.toUpperCase());
            const seen = new Set();
            let match;
            while ((match = re.exec(txt)) && results.length < 2) {
                const mon3 = match[1].toUpperCase();
                const dd = Number(match[2]);
                const yyyy = Number(match[3]);
                const when = /MIDDAY/i.test(match[4]) ? "MIDDAY" : "EVENING";
                const mIdx = monthIx(mon3);
                if (mIdx < 0 || !dd || !yyyy)
                    continue;
                const dateMDY = `${mIdx + 1}/${dd}/${yyyy}`;
                const balls = [Number(match[5]), Number(match[6]), Number(match[7])];
                const k = `${when}|${dateMDY}`;
                if (!seen.has(k)) {
                    seen.add(k);
                    results.push({ when, dateMDY, balls });
                }
            }
            if (results.length)
                break;
        }
    }
    // Dedup (keep last instance)
    const key = (r) => `${r.when}|${r.dateMDY}`;
    const map = new Map();
    for (const r of results)
        map.set(key(r), r);
    const out = [...map.values()];
    if (LOG_VERBOSE) {
        console.log(`[ca_daily3] calottery parse: found ${out.length} entries`);
        if (!out.length) {
            // Log first 500 chars of the most relevant container, else the start of the body
            const container = $("#draw-game-winning-numbers-spotlight").first().html() ||
                $("#drawGame9").parent().html() ||
                $(".card.daily3").first().html() ||
                $("body").html() ||
                "";
            const snippet = normalizeSpaces(container).slice(0, 500);
            console.warn("[ca_daily3] WARNING: calottery parser found 0 entries. First 500 chars of card container:", snippet);
        }
    }
    return out;
}
async function readCsv(pathRel) {
    const p = path.resolve(process.cwd(), pathRel);
    if (!fsSync.existsSync(p))
        return [];
    const txt = await fs.readFile(p, "utf8");
    const lines = txt.trim().split(/\r?\n/).slice(1); // drop header
    const rows = [];
    for (const ln of lines) {
        const [d, b1, b2, b3] = ln.split(",").map((s) => s.trim());
        if (!d)
            continue;
        rows.push({
            dateMDY: d,
            balls: [Number(b1), Number(b2), Number(b3)],
        });
    }
    return rows;
}
async function writeCsv(pathRel, rows) {
    const p = path.resolve(process.cwd(), pathRel);
    await ensureDir(p);
    await fs.writeFile(p, toCsv(rows), "utf8");
}
async function updateFromCalottery(outMiddayRel = OUT_MIDDAY, outEveningRel = OUT_EVENING) {
    let html = await fetchText(CALOTTERY_CARD_URL, { referer: "https://www.calottery.com/" });
    let fresh = await parseCalotteryCard(html);
    // Fallback 1: stricter no-cache headers if zero results
    if (fresh.length === 0) {
        if (LOG_VERBOSE)
            console.warn("[ca_daily3] retrying calottery card with no-cache headers...");
        try {
            html = await fetchText(CALOTTERY_CARD_URL, {
                referer: "https://www.calottery.com/",
                accept: "text/html",
                pragma: "no-cache",
                "cache-control": "no-cache",
            });
            fresh = await parseCalotteryCard(html);
        }
        catch { }
    }
    // Fallback 2: optional lightweight Playwright fetch of the page if still zero
    if (fresh.length === 0 && String(process.env.CA_UPDATE_USE_PW ?? "0") === "1" && !isNextDrawCard(html)) {
        if (!PW_ENABLE) {
            if (LOG_VERBOSE)
                console.warn("[ca_daily3] CA_UPDATE_USE_PW=1 but Playwright disabled (CA_ENABLE_PLAYWRIGHT=0)");
        }
        else {
            if (LOG_VERBOSE)
                console.warn("[ca_daily3] using Playwright to fetch card HTML for update...");
            try {
                await ensureBrowser();
                const page = await _pwContext.newPage();
                await page.goto(CALOTTERY_CARD_URL, { waitUntil: "domcontentloaded", timeout: PW_TIMEOUT_MS });
                await page.getByRole("button", { name: /accept|agree|consent/i }).first().click({ timeout: 1500 }).catch(() => { });
                // Wait for the actual winning numbers lists (not just the container)
                const lists = page.locator("#drawGame9 .draw-cards--winning-numbers, #draw-game-9 .draw-cards--winning-numbers, .card.daily3 .draw-cards--winning-numbers");
                await page.waitForLoadState("networkidle", { timeout: PW_TIMEOUT_MS }).catch(() => { });
                await lists.first().waitFor({ state: "visible", timeout: PW_TIMEOUT_MS }).catch(() => { });
                // If still not found, try without hash (some CDNs treat the fragment oddly)
                const count1 = await lists.count().catch(() => 0);
                if (count1 < 1) {
                    await page.goto("https://www.calottery.com/en/draw-games/daily-3", { waitUntil: "domcontentloaded", timeout: PW_TIMEOUT_MS }).catch(() => { });
                    await page.waitForLoadState("networkidle", { timeout: PW_TIMEOUT_MS }).catch(() => { });
                    await lists.first().waitFor({ state: "visible", timeout: PW_TIMEOUT_MS }).catch(() => { });
                }
                const count2 = await lists.count().catch(() => 0);
                if (LOG_VERBOSE)
                    console.log(`[ca_daily3] PW: detected ${count2} winning-number list(s) on the card`);
                // Prefer to parse just the card subtree to avoid noise
                const cardHtml = await page.evaluate(() => {
                    const card = document.querySelector("#drawGame9 .card-body, #draw-game-9 .card-body, .card.daily3 .card-body");
                    return card ? card.outerHTML : document.body.outerHTML;
                });
                html = cardHtml || (await page.content());
                await page.close().catch(() => { });
                fresh = await parseCalotteryCard(html);
            }
            catch (e) {
                if (LOG_VERBOSE)
                    console.warn("[ca_daily3] Playwright card fetch failed:", String(e));
            }
        }
    }
    if (LOG_VERBOSE) {
        const midN = fresh.filter(f => f.when === "MIDDAY").length;
        const eveN = fresh.filter(f => f.when === "EVENING").length;
        console.log(`[ca_daily3] calottery fresh totals: MIDDAY=${midN}, EVENING=${eveN}`);
        if (fresh.length === 0) {
            const snippet = (html || "").replace(/\s+/g, " ").slice(0, 200);
            console.warn(`[ca_daily3] WARNING: calottery parser found 0 entries. First 200 chars: ${snippet}…`);
        }
    }
    // Fallback 3: If the CA card is "Next Draw" or still yielded zero, pull latest from LotteryUSA.
    if (fresh.length === 0 || isNextDrawCard(html)) {
        const lusa = await fetchLatestFromLUSA3();
        if (lusa.length) {
            if (LOG_VERBOSE) {
                for (const f of lusa) {
                    console.log(`[ca_daily3] Using LotteryUSA fallback (${f.when}): ${f.dateMDY} -> ${f.balls.join(",")}`);
                }
            }
            fresh = lusa;
        }
        else if (LOG_VERBOSE) {
            console.warn("[ca_daily3] LotteryUSA fallback failed to return any latest rows.");
        }
    }
    // split by session
    const fMid = fresh.filter((f) => f.when === "MIDDAY");
    const fEve = fresh.filter((f) => f.when === "EVENING");
    // load existing (respect overrides)
    const curMid = await readCsv(outMiddayRel);
    const curEve = await readCsv(outEveningRel);
    const byDateMid = new Map(curMid.map((r) => [r.dateMDY, r]));
    const byDateEve = new Map(curEve.map((r) => [r.dateMDY, r]));
    let addedMid = 0, addedEve = 0;
    for (const f of fMid) {
        if (!byDateMid.has(f.dateMDY)) {
            curMid.push({ dateMDY: f.dateMDY, balls: f.balls });
            byDateMid.set(f.dateMDY, curMid[curMid.length - 1]);
            addedMid++;
        }
    }
    for (const f of fEve) {
        if (!byDateEve.has(f.dateMDY)) {
            curEve.push({ dateMDY: f.dateMDY, balls: f.balls });
            byDateEve.set(f.dateMDY, curEve[curEve.length - 1]);
            addedEve++;
        }
    }
    // sort ASC by date before writing
    const sortAsc = (a, b) => {
        const [am, ad, ay] = a.dateMDY.split("/").map(Number);
        const [bm, bd, by] = b.dateMDY.split("/").map(Number);
        return Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd);
    };
    curMid.sort(sortAsc);
    curEve.sort(sortAsc);
    await writeCsv(outMiddayRel, curMid);
    await writeCsv(outEveningRel, curEve);
    console.log(`[CA DAILY3] Update complete. Added ${addedMid} midday, ${addedEve} evening.`);
    if (LOG_VERBOSE) {
        console.log(`[CA DAILY3] Final row counts after update: midday=${curMid.length}, evening=${curEve.length}`);
    }
}
// ---------- Public API ----------
export async function buildCaliforniaDaily3(mode, outMiddayRel = OUT_MIDDAY, outEveningRel = OUT_EVENING) {
    try {
        await initHttpDispatcher();
        if (mode === "seed") {
            await seedFromLotteryUSA(outMiddayRel, outEveningRel);
        }
        else {
            await updateFromCalottery(outMiddayRel, outEveningRel);
        }
    }
    finally {
        await closeBrowser().catch(() => { });
        await closeHttpDispatcher().catch(() => { });
    }
}
export async function buildCaliforniaDaily3Seed(outMiddayRel = OUT_MIDDAY, outEveningRel = OUT_EVENING) {
    return buildCaliforniaDaily3("seed", outMiddayRel, outEveningRel);
}
export async function buildCaliforniaDaily3Update(outMiddayRel = OUT_MIDDAY, outEveningRel = OUT_EVENING) {
    return buildCaliforniaDaily3("update", outMiddayRel, outEveningRel);
}
// ---------- CLI ----------
async function main() {
    const mode = (process.argv[2] || "").toLowerCase();
    if (LOG_VERBOSE)
        console.log(`[ca_daily3] main() mode="${mode}"`);
    try {
        if (mode === "seed") {
            await buildCaliforniaDaily3("seed");
            return;
        }
        if (mode === "update") {
            await buildCaliforniaDaily3("update");
            return;
        }
        console.error(`Usage: node --loader ts-node/esm ${path.relative(process.cwd(), process.argv[1] || "ca_daily3.ts")} <seed|update>`);
        process.exit(2);
    }
    catch (e) {
        console.error("[ca_daily3] Fatal:", e?.stack || String(e));
        process.exit(1);
    }
}
// Run only when invoked directly (works with .ts via ts-node/esm and compiled .js)
try {
    // Normalize both sides to absolute filesystem paths before comparison
    const thisFile = path.resolve(fileURLToPath(import.meta.url));
    const invoked = process.argv?.[1] ? path.resolve(process.argv[1]) : "";
    if (thisFile === invoked) {
        void main();
    }
}
catch {
    // best-effort; if anything weird happens, just try running
    void main();
}
