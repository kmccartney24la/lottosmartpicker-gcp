/* ============================================================================
   CA Scratchers Scraper (LottoSmartPicker)
   ----------------------------------------------------------------------------
   Quickstart (one-time):
     npx playwright install chromium

   Run:
     tsx scripts/scratchers/fetch_ca_scratchers.ts
     # or
     ts-node scripts/scratchers/fetch_ca_scratchers.ts

   Outputs:
     /public/data/ca/scratchers/index.json
     /public/data/ca/scratchers/index.latest.json

   Conventions:
     • Monetary values stored as DOLLARS (integer).
     • Odds stored as divisor (e.g., 2.93 means "1 in 2.93").
   ============================================================================ */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import mri from "mri";
import pLimit from "p-limit";
import { chromium, type Browser } from "playwright";
import {
  ensureDir,
  openAndReady,
  withRetry,
  oddsFromText,
  cleanText,
} from "./_util.js";
import { ensureHashKeyCA, downloadAndHost, putJsonObject } from "./image_hosting.js";

// -----------------------------
// CLI parse (kept consistent with FL script)
// -----------------------------
function parseArgv(argv: string[]) {
  const out: Record<string, any> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const [k, v] = a.replace(/^--/, "").split("=");
    out[k] = v === undefined ? true : (/^\d+$/.test(v) ? Number(v) : v);
  }
  return out;
}
const argvTop = parseArgv(process.argv.slice(2));

// -----------------------------
// Types (mirrors FL structure, but source: "ca")
// -----------------------------
export type CaScratcherTier = {
  prizeAmount: number;               // dollars
  odds: number | null;               // divisor (1 in X => X)
  prizesRemaining: number | null;
  prizesPaidOut?: number | null;
  totalPrizes?: number | null;       // remaining + paidOut
  prizeLevel?: number;               // 1 for top prize
  prizeAmountLabel?: string;
};

export type CaScratcherRecord = {
  source: "ca";
  updatedAt: string;
  gameNumber: number;
  name: string;
  price: number;                     // dollars
  sourceImageUrl: string;            // original source image (provenance)
  ticketImageUrl: string;            // hosted image used by the app
  topPrizeValue: number;             // dollars
  topPrizesRemaining: number | null;
  overallOdds: number | null;        // “Odds of winning any prize”
  topPrizesOriginal?: number;
  tiers: CaScratcherTier[];
  detailUrl: string;
  listingUrl: string;
  adjustedOdds?: number | null;
};

// Listing card scraped from /en/scratchers grid
type ListingCard = {
  listingUrl: string;    // absolute
  detailUrl: string;     // absolute (e.g., /scratchers/$25/celebrate-2026-1700)
  title?: string;        // e.g., "Celebrate 2026 (1700)"
  gameNumber?: number;
  price?: number;        // dollars (from .amount-circle)
  topPrizeValue?: number;
  overallOdds?: number | null; // “Odds of winning any prize: 1 in 2.93”
  sourceImageUrl?: string;     // thumbnail from the card-header img
};

// Detail response
type DetailInfo = {
  title?: string;
  price?: number;
  topPrizeValue?: number;
  topPrizesRemaining?: number | null; // rarely shown in header; table is canonical
  ticketImageUrl?: string;            // unscratched image
  overallOdds?: number | null;        // if we find it on detail page; fall back to listing
  tiers: CaScratcherTier[];
};

// -----------------------------
// Constants (California)
// -----------------------------
const OUT_DIR = "public/data/ca/scratchers";
const LISTING_URL = "https://www.calottery.com/en/scratchers";
const CA_ORIGIN = "https://www.calottery.com";

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36";

// polite pacing
const NAV_DELAY_MS = 250;

// -----------------------------
// Helpers
// -----------------------------
const z = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toAbs(href: string): string {
  try {
    return new URL(href, CA_ORIGIN).href;
  } catch {
    return href;
  }
}

function parseOddsToFloat(s?: string | null): number | null {
  if (!s) return null;
  const via = oddsFromText(s);
  if (typeof via === "number" && isFinite(via)) return via;

  // last-resort: first number in text
  const m = String(s).replace(/\s+/g, " ").match(/([0-9][0-9,]*(?:\.[0-9]+)?)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseMoneyToInt(s?: string | null): number | undefined {
  if (!s) return undefined;
  const m = String(s).match(/\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/);
  if (!m) return undefined;
  const n = Math.round(Number(m[1].replace(/,/g, "")));
  return Number.isFinite(n) ? n : undefined;
}

function parsePrizeAmountLoose(label: string): number | undefined {
  const t = String(label).trim();
  const m = t.match(/\$?\s*([0-9][0-9,\.]*)\s*([KkMm])?\b/);
  if (!m) return undefined;
  const base = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(base)) return undefined;
  const suf = (m[2] || "").toUpperCase();
  if (suf === "K") return Math.round(base * 1_000);
  if (suf === "M") return Math.round(base * 1_000_000);
  return Math.round(base);
}

function firstDefined<T>(...vals: (T | null | undefined)[]): T | undefined {
  for (const v of vals) if (v != null) return v as T;
  return undefined;
}

function computeTotalTopPrizesOriginal(
  tiers: CaScratcherTier[] | undefined,
  topPrizeValue?: number
): number | undefined {
  if (!tiers?.length) return undefined;

  const topTier = tiers.find(t => t.prizeLevel === 1) ?? tiers[0];
  if (topTier) {
    const rem = topTier.prizesRemaining ?? 0;
    const paid = topTier.prizesPaidOut ?? 0;
    const tot = rem + paid;
    if (tot > 0) return tot;
  }

  let target =
    typeof topPrizeValue === "number" && isFinite(topPrizeValue)
      ? topPrizeValue
      : undefined;

  if (target == null) {
    target = Math.max(...tiers.map((t) => t.prizeAmount ?? -Infinity));
    if (!Number.isFinite(target)) return undefined;
  }
  const sum = tiers
    .filter((t) => t.prizeAmount === target)
    .reduce((acc, t) => acc + (t.totalPrizes ?? 0), 0);
  return Number.isFinite(sum) && sum > 0 ? sum : undefined;
}

function computeAdjustedOdds(tiers: CaScratcherTier[]): number | null {
  let sumProb = 0;
  for (const t of tiers) {
    if (!t.odds || t.odds <= 0) continue;
    if (t.prizesRemaining == null || t.prizesRemaining <= 0) continue;

    const total =
      t.totalPrizes != null
        ? t.totalPrizes
        : t.prizesPaidOut != null
          ? t.prizesRemaining + t.prizesPaidOut
          : null;
    if (!total || total <= 0) continue;

    const adjDiv = t.odds * (total / t.prizesRemaining);
    if (adjDiv > 0 && Number.isFinite(adjDiv)) {
      sumProb += 1 / adjDiv;
    }
  }
  if (sumProb <= 0) return null;
  const adjOverallDiv = 1 / sumProb;
  return Number.isFinite(adjOverallDiv) ? adjOverallDiv : null;
}

// -----------------------------
// Listing Scrape (California)
// -----------------------------
async function fetchListing(browser: Browser): Promise<ListingCard[]> {
  const page = await browser.newPage({
    userAgent: DEFAULT_UA,
    extraHTTPHeaders: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: CA_ORIGIN + "/",
    },
  });

  try {
    await openAndReady(page, LISTING_URL, { loadMore: false });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await z(300);

    // The grid lives inside .search-result-box and uses numbered pages with
    // <a ... onclick="paginationClick(n)">
    const BOX = ".search-result-box";
    await page.waitForSelector(BOX, { timeout: 15_000 }).catch(() => {});
    await z(200);

    // Helper to read current page’s cards
    const readCardsOnce = async (): Promise<ListingCard[]> => {
      const raw = await page.$$eval(
        `${BOX} a.scratchers-search-section__scratchers-link`,
        (links) => {
          const clean = (s?: string | null) => (s || "").replace(/\s+/g, " ").trim();
          const abs = (href: string) => {
            try { return new URL(href, location.origin).href; } catch { return href; }
          };

          return links.map((a) => {
            const link = a as HTMLAnchorElement;
            const card = link.querySelector(".card.scratcher-card-search-result") as HTMLElement | null;
            const titleEl = card?.querySelector(".price-text") as HTMLElement | null; // contains "Celebrate 2026 (1700)"
            const amountEl = card?.querySelector(".amount-circle") as HTMLElement | null; // "$25"
            const topPrizeEl = card?.querySelector(".top-prize-text") as HTMLElement | null; // "Top Prize $7,500,000 <span>Odds of winning any prize: 1 in 2.93</span>"
            const imgEl = card?.querySelector(".card-header img") as HTMLImageElement | null;

            const titleRaw = clean(titleEl?.textContent || "");
            const mNum = titleRaw.match(/\((\d{3,6})\)\s*$/);
            const gameNumber = mNum ? Number(mNum[1]) : undefined;

            const mPrice = clean(amountEl?.textContent || "").match(/\$([\d,]+)/);
            const price = mPrice ? Number(mPrice[1].replace(/,/g, "")) : undefined;

            const topPrizeText = clean(topPrizeEl?.textContent || "");
            const mTop = topPrizeText.match(/Top\s*Prize\s*\$([\d,]+)/i);
            const topPrizeValue = mTop ? Number(mTop[1].replace(/,/g, "")) : undefined;

            // Odds of winning any prize: 1 in 2.93
            let overallOdds: number | null = null;
            const mOdds = topPrizeText.match(/Odds\s+of\s+winning\s+any\s+prize:\s*1\s*in\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i);
            if (mOdds) {
              const n = Number(mOdds[1].replace(/,/g, ""));
              overallOdds = Number.isFinite(n) ? n : null;
            }

            return {
              listingUrl: location.href,
              detailUrl: abs(link.getAttribute("href") || ""),
              title: titleRaw || undefined,
              gameNumber,
              price,
              topPrizeValue,
              overallOdds,
              sourceImageUrl: imgEl?.src ? abs(imgEl.src) : undefined,
            };
          });
        }
      );

      // Dedup by gameNumber if available
      const seen = new Set<number>();
      const dedup = raw.filter((c) => {
        if (!c.gameNumber) return true;
        if (seen.has(c.gameNumber)) return false;
        seen.add(c.gameNumber);
        return true;
      });

      return dedup;
    };

    // Walk through pages by calling paginationClick(n) increasing n until NEXT is disabled or no growth.
    const all: ListingCard[] = [];
    let currentPage = 1;
    let safety = 20; // plenty for ~5 pages in your example
    while (safety-- > 0) {
      // Read cards on current page
      const cards = await readCardsOnce();
      // Merge (dedup by gameNumber when present + detailUrl otherwise)
      const key = (c: ListingCard) => c.gameNumber ? `gn:${c.gameNumber}` : `u:${c.detailUrl}`;
      const existing = new Map(all.map(c => [key(c), c]));
      for (const c of cards) {
        const k = key(c);
        if (!existing.has(k)) existing.set(k, c);
      }
      all.length = 0;
      all.push(...existing.values());

      // Check NEXT state
      const { hasNext, nextPageNum } = await page.evaluate((cur) => {
        const nav = document.querySelector("#navPaginationTop ul.pagination");
        if (!nav) return { hasNext: false, nextPageNum: cur };
        const items = Array.from(nav.querySelectorAll("li.page-item a.page-link"));
        let max = cur;
        let hasNext = false;
        for (const a of items) {
          const t = (a.textContent || "").trim().toUpperCase();
          if (t === "NEXT" && (a as HTMLElement).getAttribute("aria-disabled") !== "true") {
            hasNext = true;
          }
          const n = Number(t);
          if (Number.isFinite(n)) max = Math.max(max, n);
        }
        // Estimate next page number from active + 1
        const active = nav.querySelector("li.page-item.active a.page-link");
        const activeNum = active ? Number((active.textContent || "").trim()) : cur;
        const nextPageNum = (activeNum || cur) + 1;
        return { hasNext, nextPageNum };
      }, currentPage);

      if (!hasNext) break;

      // Trigger site’s own pagination function if present; else click the “NEXT” link.
      const changed = await page.evaluate((n) => {
        // Prefer direct function call (present per DOM snippet)
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        if (typeof window.paginationClick === "function") {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          window.paginationClick(n);
          return true;
        }
        const nextA = document.querySelector("#navPaginationTop ul.pagination a.page-link:nth-last-child(1)") as HTMLAnchorElement | null;
        if (nextA && /next/i.test(nextA.textContent || "")) {
          nextA.click();
          return true;
        }
        return false;
      }, nextPageNum);

      await z(500);
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
      await z(200);

      // Detect growth; if no change, bail
      const countAfter = await page.$$eval(
        `${BOX} a.scratchers-search-section__scratchers-link`,
        (els) => els.length
      ).catch(() => 0);

      if (!changed || countAfter === 0) break;
      currentPage = nextPageNum;
    }

    return all;
  } finally {
    await page.close().catch(() => {});
  }
}

// -----------------------------
// Detail Scrape (California)
// -----------------------------
async function fetchDetail(browser: Browser, detailUrl: string): Promise<DetailInfo> {
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
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await z(NAV_DELAY_MS);

    const wholeText = await page.evaluate(() => document.body?.innerText || "");
    const cleanedText = cleanText(wholeText);

    // Title is often in a header; if not, we’ll rely on listing
    const title = await page.$eval("h1, .cmp-header__title", (el) => {
      const clone = el.cloneNode(true) as HTMLElement;
      clone.querySelector("small")?.remove();
      return (clone.textContent || "").trim();
    }).catch(() => undefined);

    // Overall odds on CA detail pages aren’t always clearly labeled; try generic search
    const overallOdds =
      parseOddsToFloat(
        (await page.$eval(
          ".odds-available-prizes__header__copy--sub, .odds-available-prizes, body",
          (el) => el.textContent || ""
        ).catch(() => "")) || cleanedText
      ) ?? null;

    // Unscratched image
    const ticketImageUrl = await page.$eval(
      "img.scratchers-game-detail__card-img--unscratched",
      (img: HTMLImageElement) => img.currentSrc || img.src
    ).catch(() => undefined);

    // Odds & Available Prizes table
    const tiers = await page.evaluate(() => {
      const clean = (s?: string | null) => (s || "").replace(/\s+/g, " ").trim();
      type RowOut = {
        prizeAmount: number;
        odds: number | null;
        prizesRemaining: number | null;
        prizesPaidOut?: number | null;
        totalPrizes?: number | null;
        prizeLevel?: number;
        prizeAmountLabel?: string;
      };

      const parsePrizeAmountLoose = (label: string): number | undefined => {
        const t = String(label).trim();
        const m = t.match(/\$?\s*([0-9][0-9,\.]*)\s*([KkMm])?\b/);
        if (!m) return undefined;
        const base = Number(m[1].replace(/,/g, ""));
        if (!Number.isFinite(base)) return undefined;
        const suf = (m[2] || "").toUpperCase();
        if (suf === "K") return Math.round(base * 1_000);
        if (suf === "M") return Math.round(base * 1_000_000);
        return Math.round(base);
      };

      const toNum = (s?: string | null): number | null => {
        if (!s) return null;
        const n = Number(String(s).replace(/[^0-9.-]/g, ""));
        return Number.isFinite(n) ? n : null;
      };

      const root = document.querySelector(".odds-available-prizes");
      if (!root) return [] as RowOut[];
      const table = root.querySelector("table");
      if (!table) return [] as RowOut[];

      const rows = Array.from(table.querySelectorAll("tbody tr.odds-available-prizes__table__body"));
      const out: RowOut[] = [];

      for (const tr of rows) {
        const cells = Array.from(tr.querySelectorAll("td"));
        const prizeCell = cells[0] || tr.querySelector("td, th");
        const oddsCell = cells[1];
        const remainCell = cells[2];

        if (!prizeCell || !oddsCell) continue;

        const prizeLabel = clean(prizeCell.textContent || "");
        const prizeAmount = parsePrizeAmountLoose(prizeLabel);
        const oddsText = clean(oddsCell.textContent || "");

        // Normalize "1 in X"
        const oddsMatch = oddsText
          .replace(/[-–—]+/g, " ")
          .match(/1\s*(?:in|:)\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i);
        const odds = oddsMatch ? Number(oddsMatch[1].replace(/,/g, "")) : toNum(oddsText);

        let prizesRemaining: number | null = null;
        let totalPrizes: number | null | undefined = undefined;
        let prizesPaidOut: number | null | undefined = undefined;

        if (remainCell) {
          const remainText = clean(remainCell.textContent || "");
          const m = remainText.match(/([0-9][0-9,]*)\s+of\s+([0-9][0-9,]*)/i);
          if (m) {
            const rem = Number(m[1].replace(/,/g, ""));
            const tot = Number(m[2].replace(/,/g, ""));
            if (Number.isFinite(rem)) prizesRemaining = rem;
            if (Number.isFinite(tot)) {
              totalPrizes = tot;
              if (Number.isFinite(rem)) prizesPaidOut = Math.max(tot - rem, 0);
            }
          } else {
            const only = remainText.match(/([0-9][0-9,]*)/);
            if (only) prizesRemaining = Number(only[1].replace(/,/g, ""));
          }
        }

        if (typeof prizeAmount === "number" && Number.isFinite(prizeAmount)) {
          out.push({
            prizeAmount,
            odds: Number.isFinite(odds as any) ? (odds as number) : null,
            prizesRemaining,
            ...(prizesPaidOut != null ? { prizesPaidOut } : {}),
            ...(totalPrizes != null ? { totalPrizes } : {}),
            prizeAmountLabel: prizeLabel,
          });
        }
      }

      // Top prize = highest dollar amount
      if (out.length) {
        const maxAmt = Math.max(...out.map(r => r.prizeAmount));
        out.forEach(r => { if (r.prizeAmount === maxAmt) r.prizeLevel = 1; });
      }

      return out;
    });

    // Try to infer top prize from table if present
    const topPrizeValue =
      tiers.length ? Math.max(...tiers.map(t => t.prizeAmount)) : undefined;

    return {
      title,
      ticketImageUrl,
      tiers,
      overallOdds,
      topPrizeValue,
      topPrizesRemaining: tiers.find(t => t.prizeLevel === 1)?.prizesRemaining ?? null,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

// -----------------------------
// Build final record
// -----------------------------
function buildRecord(listing: ListingCard, detail: DetailInfo, hostedImageUrl: string): CaScratcherRecord {
  const topPrizeValue = firstDefined(detail.topPrizeValue, listing.topPrizeValue) ?? 0;
  const topPrizesRemaining =
    firstDefined(detail.topPrizesRemaining, listing.topPrizeValue != null ? null : undefined) ?? null;

  // CA doesn’t always expose overall odds on detail; keep listing fallback.
  const overallOdds = firstDefined(detail.overallOdds, listing.overallOdds) ?? null;

  const name = (detail.title || listing.title || "").replace(/\s*\(\d{3,6}\)\s*$/, "").trim();
  const price = firstDefined(detail.price, listing.price) ?? 0;

  const gameNumber = (() => {
    if (listing.gameNumber) return listing.gameNumber;
    const m =
      listing.detailUrl.match(/(\d{3,6})(?:\/|$)/) ||
      listing.detailUrl.match(/-([0-9]{3,6})(?:\/|$)/);
    return m ? Number(m[1]) : 0;
  })();

  const sourceImageUrl = detail.ticketImageUrl || listing.sourceImageUrl || "";

  // Force top-tier alignment and recompute total if needed
  if (detail.tiers?.length && typeof topPrizeValue === "number") {
    const ti = detail.tiers.findIndex((t) => t.prizeLevel === 1);
    const i = ti >= 0 ? ti : 0;
    if (detail.tiers[i] && detail.tiers[i].prizeAmount !== topPrizeValue) {
      detail.tiers[i].prizeAmount = topPrizeValue;
    }
    const t = detail.tiers[i];
    if (t && t.totalPrizes == null && (t.prizesRemaining != null || t.prizesPaidOut != null)) {
      t.totalPrizes = (t.prizesRemaining ?? 0) + (t.prizesPaidOut ?? 0);
    }
  }

  return {
    source: "ca",
    updatedAt: new Date().toISOString(),
    gameNumber,
    name,
    price,
    sourceImageUrl,
    ticketImageUrl: hostedImageUrl || sourceImageUrl,
    topPrizeValue,
    topPrizesRemaining,
    overallOdds,
    tiers: detail.tiers,
    detailUrl: listing.detailUrl,
    listingUrl: listing.listingUrl,
    topPrizesOriginal:
      (detail.tiers?.length
        ? (detail.tiers.find((t) => t.prizeLevel === 1) ?? detail.tiers[0])?.totalPrizes ?? undefined
        : undefined) ?? computeTotalTopPrizesOriginal(detail.tiers, topPrizeValue),
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
    // 1) Fetch listing
    const listing = await withRetry(() => fetchListing(browser), {
      attempts: 3,
      label: "listing",
      minDelayMs: 1000,
    });

    // 2) Walk detail pages
    const results: CaScratcherRecord[] = [];
    let hostedOk = 0;

    await Promise.all(
      listing.map((card) =>
        limit(async () => {
          const detail = await withRetry(() => fetchDetail(browser, card.detailUrl), {
            attempts: 2,
            label: `detail#${card.gameNumber ?? "?"}`,
            minDelayMs: 900,
          });

          // Host image (prefer detail unscratched image)
          let hostedUrl = "";
          const src = detail.ticketImageUrl || card.sourceImageUrl || "";
          if (src) {
            try {
              if (card.gameNumber) {
                const h = await ensureHashKeyCA({
                  gameNumber: card.gameNumber,
                  kind: "ticket",
                  sourceUrl: src,
                  dryRun: !!argv["dry-run"],
                });
                hostedUrl = h.url;
              } else {
                const h = await downloadAndHost({
                  sourceUrl: src,
                  keyHint: `ca/scratchers/images/misc/ticket-<sha>.<ext>`,
                  dryRun: !!argv["dry-run"],
                });
                hostedUrl = h.url;
              }
              hostedOk++;
            } catch (e) {
              console.warn(`[image] hosting failed for ${src}: ${String(e)} — falling back to source`);
              hostedUrl = src;
            }
          }

          const rec = buildRecord(card, detail, hostedUrl);
          (rec as any).adjustedOdds = computeAdjustedOdds(rec.tiers);
          results.push(rec);

          await z(NAV_DELAY_MS);
        })
      )
    );

    // 3) Sort: price desc, topPrizeValue desc, name asc
    const sorted = results
      .slice()
      .sort((a, b) => {
        if (a.price !== b.price) return b.price - a.price;
        if (a.topPrizeValue !== b.topPrizeValue) return b.topPrizeValue - a.topPrizeValue;
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

    // 4b) Upload remote (GCS/R2 as configured)
    try {
      const dry = !!argv["dry-run"];
      await putJsonObject({
        key: "ca/scratchers/index.json",
        data: payload,
        cacheControl: "no-store",
        dryRun: dry,
      });
      await putJsonObject({
        key: "ca/scratchers/index.latest.json",
        data: payload,
        cacheControl: "no-store",
        dryRun: dry,
      });
    } catch (e) {
      console.warn(`[upload] skipped/failed: ${String(e)}`);
    }

    // 5) Log summary & guards
    const withOdds = sorted.filter((g) => g.overallOdds != null).length;
    const withTiers = sorted.filter((g) => g.tiers && g.tiers.length > 0).length;

    console.log(
      `[ca] games=${sorted.length} withOdds=${withOdds} withTiers=${withTiers} hostedImages=${hostedOk}`
    );

    if (sorted.length === 0) {
      throw new Error("CI assertion: No active CA scratcher games were returned.");
    }
    if (withTiers / Math.max(sorted.length, 1) < 0.5) {
      console.warn(
        `[guard] less than 50% of games produced tier tables (${withTiers}/${sorted.length})`
      );
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
