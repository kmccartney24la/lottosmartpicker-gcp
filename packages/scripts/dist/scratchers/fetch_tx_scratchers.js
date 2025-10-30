/* ============================================================================
   TX Scratchers Scraper (LottoSmartPicker)
   ----------------------------------------------------------------------------
   Quickstart (one-time):
     npx playwright install chromium

   Run:
     tsx scripts/scratchers/fetch_tx_scratchers.ts
     # or
     ts-node scripts/scratchers/fetch_tx_scratchers.ts

   Outputs:
     /public/data/tx/scratchers/index.json
     /public/data/tx/scratchers/index.latest.json

   Conventions:
     • Monetary values stored as DOLLARS (integer).
     • Odds stored as divisor (e.g., 3.20 means "1 in 3.20").
     • Adds startDate (ISO: YYYY-MM-DD) for sorting.
   ============================================================================ */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import mri from "mri";
import pLimit from "p-limit";
import { chromium } from "playwright";
import { ensureDir, openAndReady, withRetry, oddsFromText, cleanText, } from "./_util.js";
import { ensureHashKeyTX, putJsonObject } from "./image_hosting.js";
// -----------------------------
// CLI parse (consistent with CA/FL)
// -----------------------------
function parseArgv(argv) {
    const out = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (!a.startsWith("--"))
            continue;
        const [k, v] = a.replace(/^--/, "").split("=");
        out[k] = v === undefined ? true : (/^\d+$/.test(v) ? Number(v) : v);
    }
    return out;
}
const argvTop = parseArgv(process.argv.slice(2));
// -----------------------------
// Constants (Texas)
// -----------------------------
const OUT_DIR = "public/data/tx/scratchers";
const TX_ORIGIN = "https://www.texaslottery.com";
const LISTING_URL = `${TX_ORIGIN}/export/sites/lottery/Games/Scratch_Offs/all.html`;
const DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36";
const NAV_DELAY_MS = 250;
const z = (ms) => new Promise((r) => setTimeout(r, ms));
const toAbs = (href) => {
    try {
        return new URL(href, TX_ORIGIN).href;
    }
    catch {
        return href;
    }
};
const parseMoneyToInt = (s) => {
    if (!s)
        return undefined;
    const m = String(s).match(/\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/);
    if (!m)
        return undefined;
    const n = Math.round(Number(m[1].replace(/,/g, "")));
    return Number.isFinite(n) ? n : undefined;
};
const parsePrizeAmountLoose = (label) => {
    const t = String(label).trim();
    const m = t.match(/\$?\s*([0-9][0-9,\.]*)\s*([KkMm])?\b/);
    if (!m)
        return undefined;
    const base = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(base))
        return undefined;
    const suf = (m[2] || "").toUpperCase();
    if (suf === "K")
        return Math.round(base * 1_000);
    if (suf === "M")
        return Math.round(base * 1_000_000);
    return Math.round(base);
};
const parseOddsToFloat = (s) => {
    if (!s)
        return null;
    const via = oddsFromText(s);
    if (typeof via === "number" && isFinite(via))
        return via;
    const m = String(s).replace(/\s+/g, " ").match(/([0-9][0-9,]*(?:\.[0-9]+)?)/);
    if (!m)
        return null;
    const n = Number(m[1].replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
};
/**
 * Extracts the overall odds specifically from the TX “Game Features” sidebar
 * (a `.large-4.cell` block). This is more stable than scraping the whole page.
 */
async function extractOverallOddsFromSidebar(page) {
    const found = await page.evaluate(() => {
        const blocks = Array.from(document.querySelectorAll("div.large-4.cell"));
        const patterns = [
            // Most common on TX pages:
            /overall\s*odds[^0-9]*1\s*(?:in|:)\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i,
            // Some variants:
            /overall\s*odds[^0-9]*are[^0-9]*1\s*(?:in|:)\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i,
            /overall\s*odds[^0-9]*is[^0-9]*1\s*(?:in|:)\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i,
            /overall\s*odds[^0-9]*[:]\s*1\s*(?:in|:)\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i,
        ];
        for (const el of blocks) {
            const txt = (el.innerText || "").replace(/\s+/g, " ").trim();
            for (const re of patterns) {
                const m = txt.match(re);
                if (m)
                    return m[1];
            }
        }
        return null;
    });
    if (!found)
        return null;
    const n = Number(String(found).replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
}
/**
 * Extract "There are approximately X* tickets ..." from the sidebar.
 */
async function extractApproxTicketsFromSidebar(page) {
    const found = await page.evaluate(() => {
        const blocks = Array.from(document.querySelectorAll("div.large-4.cell"));
        const re = /there\s+are\s+approximately\s+([0-9][0-9,]*)\*?\s+tickets/i;
        for (const el of blocks) {
            const txt = (el.innerText || "").replace(/\s+/g, " ").trim();
            const m = txt.match(re);
            if (m)
                return m[1];
        }
        return null;
    });
    if (!found)
        return null;
    const n = Number(String(found).replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
}
const parseTxDateToISO = (mdy) => {
    if (!mdy)
        return undefined;
    // Format: MM/DD/YY (YY is 2-digit)
    const m = mdy.match(/(\d{1,2})\/(\d{1,2})\/(\d{2})/);
    if (!m)
        return undefined;
    const mm = Number(m[1]);
    const dd = Number(m[2]);
    let yy = Number(m[3]);
    // Assume 20xx for 00..79, 19xx otherwise (covers historical)
    const fullYear = yy <= 79 ? 2000 + yy : 1900 + yy;
    const iso = new Date(Date.UTC(fullYear, mm - 1, dd)).toISOString().slice(0, 10);
    return iso;
};
function computeAdjustedOdds(params) {
    const { overallOdds, tiers, approxTickets } = params;
    if (!tiers || !tiers.length)
        return null;
    let T_total = 0; // total prizes originally (sum "No. in Game")
    let R_total = 0; // total prizes remaining now
    for (const t of tiers) {
        // Infer totals if missing
        const total = (t.totalPrizes != null)
            ? t.totalPrizes
            : (t.prizesRemaining != null || t.prizesPaidOut != null)
                ? (t.prizesRemaining ?? 0) + (t.prizesPaidOut ?? 0)
                : null;
        if (total != null && total > 0)
            T_total += total;
        const remaining = (t.prizesRemaining != null)
            ? t.prizesRemaining
            : (total != null && t.prizesPaidOut != null)
                ? Math.max(total - t.prizesPaidOut, 0)
                : null;
        if (remaining != null && remaining > 0)
            R_total += remaining;
    }
    if (!(R_total > 0))
        return null;
    // Preferred: use explicit ticket count if present
    if (approxTickets && approxTickets > 0) {
        const adj = approxTickets / R_total;
        return Number.isFinite(adj) ? adj : null;
    }
    // Fallback: use overallOdds + total prizes originally
    if ((overallOdds && overallOdds > 0) && (T_total > 0)) {
        const adj = overallOdds * (T_total / R_total);
        return Number.isFinite(adj) ? adj : null;
    }
    return null;
}
// -----------------------------
// Listing scrape (Texas)
// -----------------------------
async function fetchListing(browser) {
    const page = await browser.newPage({
        userAgent: DEFAULT_UA,
        extraHTTPHeaders: {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            Referer: TX_ORIGIN + "/",
        },
    });
    try {
        await openAndReady(page, LISTING_URL, { loadMore: false });
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => { });
        await z(300);
        const rows = await page.$$eval("table tbody tr", (trs) => {
            const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
            const out = [];
            for (const tr of trs) {
                const tds = Array.from(tr.querySelectorAll("td"));
                if (tds.length < 5)
                    continue;
                // First row of a game block has link in first cell.
                const firstCell = tds[0];
                const a = firstCell?.querySelector('a[title^="View details for Game Number"]');
                if (!a)
                    continue; // skip continuation rows that only list prize tiers
                const gn = Number((a.textContent || "").replace(/[^0-9]/g, ""));
                if (!Number.isFinite(gn))
                    continue;
                const start = clean(tds[1]?.textContent || "");
                const price = Number((tds[2]?.textContent || "").replace(/[^0-9]/g, "")) || 0;
                // Game name lives in 5th column (index 4)
                const name = clean(tds[4]?.textContent || "");
                out.push({
                    listingUrl: location.href,
                    detailUrl: a ? new URL(a.getAttribute("href") || "", location.origin).href : location.href,
                    gameNumber: gn,
                    name,
                    price,
                    startDate: start || undefined,
                });
            }
            return out;
        });
        // Normalize startDate to ISO
        for (const r of rows) {
            r.startDate = parseTxDateToISO(r.startDate || "");
        }
        // Dedup by game number (page contains only current games, but be safe)
        const seen = new Set();
        const dedup = rows.filter((r) => {
            if (seen.has(r.gameNumber))
                return false;
            seen.add(r.gameNumber);
            return true;
        });
        return dedup;
    }
    finally {
        await page.close().catch(() => { });
    }
}
// -----------------------------
// Detail scrape (Texas)
// -----------------------------
async function fetchDetail(browser, detailUrl) {
    const page = await browser.newPage({
        userAgent: DEFAULT_UA,
        extraHTTPHeaders: {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            Referer: LISTING_URL,
        },
    });
    try {
        await openAndReady(page, detailUrl, { loadMore: false });
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => { });
        await z(NAV_DELAY_MS);
        const wholeText = await page.evaluate(() => document.body?.innerText || "");
        const cleanedText = cleanText(wholeText);
        // Title: TX puts the true label in .text-center h2 → "Game No. 2621 - $1,000,000 Blitz"
        const h2Raw = await page.$eval(".text-center h2", (el) => (el.textContent || "").trim()).catch(() => "");
        let title = undefined;
        let gameNumberFromHeader = undefined;
        if (h2Raw) {
            const m = h2Raw.match(/^Game\s*No\.?\s*(\d+)\s*-\s*(.+)$/i);
            if (m) {
                gameNumberFromHeader = Number(m[1]);
                title = m[2].trim();
            }
            else {
                // fallback: sometimes it's just the name without the "Game No." prefix
                title = h2Raw.replace(/^\s*Game\s*No\.?.*?-/, "").trim() || h2Raw;
            }
        }
        // Overall odds: prefer the sidebar cell you pasted; then fall back to page-wide search.
        let overallOdds = await extractOverallOddsFromSidebar(page);
        if (overallOdds == null) {
            // Secondary: scan whole page text (covers edge cases / different wording).
            const m = cleanedText.match(/overall\s*odds[^0-9]*1\s*(?:in|:)\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i) ||
                cleanedText.match(/1\s*(?:in|:)\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*\(.*overall/i);
            if (m) {
                const n = Number(m[1].replace(/,/g, ""));
                overallOdds = Number.isFinite(n) ? n : null;
            }
            else {
                overallOdds = parseOddsToFloat(cleanedText);
            }
        }
        // Approximate number of tickets printed
        let approxTickets = await extractApproxTicketsFromSidebar(page);
        if (approxTickets == null) {
            const m = cleanedText.match(/there\s+are\s+approximately\s+([0-9][0-9,]*)\*?\s+tickets/i);
            if (m) {
                const n = Number(m[1].replace(/,/g, ""));
                approxTickets = Number.isFinite(n) ? n : null;
            }
        }
        // Front ticket image lives under #Front img
        const ticketImageUrl = await page.$eval("#Front img", (img) => (img.getAttribute("src") ? new URL(img.getAttribute("src"), location.origin).href : "")).catch(() => undefined);
        // Prize table (.large-only) with columns: Amount | No. in Game* | No. Prizes Claimed
        const tiers = await page.evaluate(() => {
            const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
            const toInt = (s) => {
                if (!s)
                    return null;
                const n = Number(String(s).replace(/[^0-9.-]/g, ""));
                return Number.isFinite(n) ? n : null;
            };
            const table = document.querySelector("table.large-only");
            if (!table)
                return [];
            const rows = Array.from(table.querySelectorAll("tbody tr"));
            const out = [];
            for (const tr of rows) {
                const tds = Array.from(tr.querySelectorAll("td"));
                if (tds.length < 3)
                    continue;
                const label = clean(tds[0]?.textContent || "");
                const amtMatch = label.match(/\$?\s*([0-9][0-9,\.]*)([KkMm])?/);
                if (!amtMatch)
                    continue;
                const base = Number(amtMatch[1].replace(/,/g, ""));
                const suf = (amtMatch[2] || "").toUpperCase();
                let prizeAmount = base;
                if (suf === "K")
                    prizeAmount = Math.round(base * 1_000);
                if (suf === "M")
                    prizeAmount = Math.round(base * 1_000_000);
                const total = toInt(tds[1]?.textContent || ""); // “No. in Game”
                const claimed = toInt(tds[2]?.textContent || ""); // “No. Prizes Claimed”
                const remaining = total != null && claimed != null && total >= 0 && claimed >= 0
                    ? Math.max(total - claimed, 0)
                    : null;
                out.push({
                    prizeAmount,
                    prizeAmountLabel: label,
                    odds: null, // TX detail table doesn’t provide tier-specific odds
                    totalPrizes: total,
                    prizesPaidOut: claimed,
                    prizesRemaining: remaining,
                });
            }
            if (out.length) {
                const maxAmt = Math.max(...out.map((r) => r.prizeAmount));
                out.forEach((r) => { if (r.prizeAmount === maxAmt)
                    r.prizeLevel = 1; });
            }
            return out;
        });
        const topPrizeValue = tiers.length ? Math.max(...tiers.map((t) => t.prizeAmount)) : undefined;
        const topPrizesRemaining = tiers.find((t) => t.prizeLevel === 1)?.prizesRemaining ?? null;
        return {
            title,
            ticketImageUrl,
            overallOdds,
            tiers,
            topPrizeValue,
            topPrizesRemaining,
            gameNumberFromHeader,
            approxTickets,
        };
    }
    finally {
        await page.close().catch(() => { });
    }
}
// -----------------------------
// Build final record (Texas) — mirrors CA, adds startDate
// -----------------------------
function buildRecord(listing, detail, hostedImageUrl) {
    const name = (detail.title?.trim() || listing.name);
    const topPrizeValue = (detail.topPrizeValue ?? 0);
    const sourceImageUrl = detail.ticketImageUrl || "";
    // Populate top-tier totals if missing
    if (detail.tiers?.length) {
        const ti = detail.tiers.findIndex((t) => t.prizeLevel === 1);
        const i = ti >= 0 ? ti : 0;
        const t = detail.tiers[i];
        if (t && t.totalPrizes == null && (t.prizesRemaining != null || t.prizesPaidOut != null)) {
            t.totalPrizes = (t.prizesRemaining ?? 0) + (t.prizesPaidOut ?? 0);
        }
    }
    // Compute original top-prize total from tiers if available
    const topPrizesOriginal = detail.tiers?.length
        ? (detail.tiers.find((t) => t.prizeLevel === 1) ?? detail.tiers[0])?.totalPrizes ?? undefined
        : undefined;
    return {
        source: "tx",
        updatedAt: new Date().toISOString(),
        gameNumber: listing.gameNumber,
        name,
        price: listing.price,
        sourceImageUrl: sourceImageUrl,
        ticketImageUrl: hostedImageUrl || sourceImageUrl,
        topPrizeValue,
        topPrizesRemaining: detail.topPrizesRemaining ?? null,
        overallOdds: detail.overallOdds ?? null,
        tiers: detail.tiers ?? [],
        detailUrl: listing.detailUrl,
        listingUrl: listing.listingUrl,
        topPrizesOriginal,
        startDate: listing.startDate, // ISO
    };
}
// -----------------------------
// Main
// -----------------------------
async function main() {
    const argv = mri(process.argv.slice(2), {
        string: ["concurrency"],
        boolean: ["dry-run"],
        default: { concurrency: "6", "dry-run": false },
        alias: { c: "concurrency" },
    });
    const concurrency = Math.max(1, Number(argv.concurrency ?? 6));
    const limit = pLimit(concurrency);
    await ensureDir(OUT_DIR);
    const browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    try {
        // 1) Listing
        const listing = await withRetry(() => fetchListing(browser), {
            attempts: 3,
            label: "tx-listing",
            minDelayMs: 1000,
        });
        // 2) Details
        const results = [];
        let hostedOk = 0;
        await Promise.all(listing.map((row) => limit(async () => {
            const detail = await withRetry(() => fetchDetail(browser, row.detailUrl), {
                attempts: 2,
                label: `tx-detail#${row.gameNumber}`,
                minDelayMs: 900,
            });
            // Host the front ticket image if present
            let hostedUrl = "";
            const src = detail.ticketImageUrl || "";
            if (src) {
                try {
                    const h = await ensureHashKeyTX({
                        gameNumber: row.gameNumber,
                        kind: "ticket",
                        sourceUrl: src,
                        dryRun: !!argv["dry-run"],
                    });
                    hostedUrl = h.url;
                    hostedOk++;
                }
                catch (e) {
                    console.warn(`[image] hosting failed for ${src}: ${String(e)} — falling back to source`);
                    hostedUrl = src;
                }
            }
            const rec = buildRecord(row, detail, hostedUrl);
            rec.adjustedOdds = computeAdjustedOdds({
                overallOdds: detail.overallOdds ?? null,
                tiers: rec.tiers,
                approxTickets: detail.approxTickets ?? null,
            });
            results.push(rec);
            await z(NAV_DELAY_MS);
        })));
        // 3) Sort (keep your CA convention; startDate is for UI sorting elsewhere)
        const sorted = results
            .slice()
            .sort((a, b) => {
            if (a.price !== b.price)
                return b.price - a.price;
            if (a.topPrizeValue !== b.topPrizeValue)
                return b.topPrizeValue - a.topPrizeValue;
            return a.name.localeCompare(b.name);
        });
        // 4) Write outputs
        const payload = {
            updatedAt: new Date().toISOString(),
            count: sorted.length,
            games: sorted,
        };
        await fs.writeFile(path.join(OUT_DIR, `index.json`), JSON.stringify(payload, null, 2), "utf8");
        await fs.writeFile(path.join(OUT_DIR, `index.latest.json`), JSON.stringify(payload, null, 2), "utf8");
        // 4b) Upload to remote (keys mirror CA naming, but under tx/)
        try {
            const dry = !!argv["dry-run"];
            await putJsonObject({
                key: "tx/scratchers/index.json",
                data: payload,
                cacheControl: "no-store",
                dryRun: dry,
            });
            await putJsonObject({
                key: "tx/scratchers/index.latest.json",
                data: payload,
                cacheControl: "no-store",
                dryRun: dry,
            });
        }
        catch (e) {
            console.warn(`[upload] skipped/failed: ${String(e)}`);
        }
        // 5) Log summary & guards
        const withOdds = sorted.filter((g) => g.overallOdds != null).length;
        const withTiers = sorted.filter((g) => g.tiers && g.tiers.length > 0).length;
        console.log(`[tx] games=${sorted.length} withOdds=${withOdds} withTiers=${withTiers} hostedImages=${hostedOk}`);
        if (sorted.length === 0) {
            throw new Error("CI assertion: No active TX scratcher games were returned.");
        }
        if (withTiers / Math.max(sorted.length, 1) < 0.5) {
            console.warn(`[guard] less than 50% of games produced tier tables (${withTiers}/${sorted.length})`);
        }
    }
    finally {
        await browser.close().catch(() => { });
    }
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
