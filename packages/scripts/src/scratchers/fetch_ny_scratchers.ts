// scripts/scratchers/fetch_ny_scratchers.ts
/* ============================================================================
   NY Scratchers Scraper (LottoSmartPicker)
   ----------------------------------------------------------------------------
   Quickstart (one-time):
     npx playwright install chromium

   Run:
     tsx scripts/fetch_ny_scratchers.ts
     # or
     ts-node scripts/fetch_ny_scratchers.ts

   Outputs:
     /public/data/ny/scratchers/index.latest.json
     /public/data/ny/scratchers/index.YYYY-MM-DD.json

   Conventions:
     • Monetary values stored as DOLLARS (integer).
     • Odds stored as divisor (e.g., 4.10 means "1 in 4.10").
   ============================================================================ */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import mri from "mri";
import pLimit from "p-limit";
import { chromium, type Browser, type Page } from "playwright";
import {
  ensureDir,
  openAndReady,
  withRetry,
  oddsFromText,
  cleanText,
} from "./_util.js"; // adjust import path if your _util.ts lives elsewhere
import { ensureHashKeyNY, downloadAndHost, putJsonObject } from "./image_hosting.js"; // new tiny glue exported below

function parseArgv(argv: string[]) {
  const out: Record<string, any> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const [k, v] = a.replace(/^--/, '').split('=');
    out[k] = v === undefined ? true : (/^\d+$/.test(v) ? Number(v) : v);
  }
  return out;
}
const argv = parseArgv(process.argv.slice(2));

// -----------------------------
// Types
// -----------------------------
export type NyScratcherTier = {
  prizeAmount: number;         // dollars
  odds: number | null;         // divisor (1 in X => X)
  prizesRemaining: number | null;
  prizesPaidOut?: number | null;  // NEW
  totalPrizes?: number | null;    // (remaining + paidOut)
  // Helps us identify the true top tier robustly (e.g., "1st", "2nd", ...):
  prizeLevel?: number;            // 1 for top prize, then 2, 3, ...
  // (optional – useful for debugging/mismatch cases)
  prizeAmountLabel?: string;
};

export type NyScratcherRecord = {
  source: "ny";
  updatedAt: string;
  gameNumber: number;
  name: string;
  price: number;              // dollars
  sourceImageUrl: string;     // original NY image (for provenance)
  ticketImageUrl: string;     // **hosted** image used by the app
  topPrizeValue: number;           // dollars
  topPrizesRemaining: number | null;
  overallOdds: number | null;
  /**
   * Sum of the original count of TOP prizes (i.e., tiers whose prize value equals the max tier prize).
   * This mirrors what we scrape per-tier as `topPrizesOriginal` on NyScratcherTier.
   */
  topPrizesOriginal?: number;
  tiers: NyScratcherTier[];
  detailUrl: string;
  listingUrl: string;
  adjustedOdds?: number | null; // NEW
};


// Minimal listing “card” info pulled from the grid page
type ListingCard = {
  listingUrl: string;    // absolute (grid page)
  detailUrl: string;     // absolute (detail page)
  title?: string;
  gameNumber?: number;
  price?: number;        // dollars
  topPrizeValue?: number;     // dollars
  topPrizesRemaining?: number | null;
  sourceImageUrl?: string;
};

// Detail response
type DetailInfo = {
  overallOdds: number | null;
  tiers: NyScratcherTier[];
  title?: string;
  price?: number;             // dollars
  topPrizeValue?: number;     // dollars — parsed from page text (not the table)
  topPrizesRemaining?: number | null;
  ticketImageUrl?: string;    // preferred full-size image for hosting
};

// -----------------------------
// Constants
// -----------------------------
const OUT_DIR = "public/data/ny/scratchers";
const LISTING_URL = "https://nylottery.ny.gov/scratch-off-games";
const NY_ORIGIN = "https://nylottery.ny.gov";

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36";

// polite pacing
const NAV_DELAY_MS = 250;

// -----------------------------
// Helpers
// -----------------------------
function toAbs(href: string): string {
  try {
    return new URL(href, NY_ORIGIN).href;
  } catch {
    return href;
  }
}

// Normalize NY Drupal CMS URLs:
 // - Convert "/styles/.../public/YYYY-MM/foo.jpg.webp" → "/sites/default/files/YYYY-MM/foo.jpg"
 // - Strip cache query (?itok=...)
 // - Prefer jpg/png over webp
 function normalizeNyCmsUrl(u?: string | null): string | undefined {
   if (!u) return undefined;
   try {
     const url = new URL(u, NY_ORIGIN);
     if (!/nylottery\.ny\.gov$/i.test(url.hostname)) return url.href;
     const p = url.pathname;
     // styles → original mapping
     const m =
       p.match(/^\/styles\/[^/]+\/public\/(.+?)\.jpg\.webp$/i) ||
       p.match(/^\/styles\/[^/]+\/public\/(.+?)\.png\.webp$/i) ||
       p.match(/^\/styles\/[^/]+\/public\/(.+?)\.(jpe?g|png)$/i);
     if (m) {
       const tail = m[1] + (m[2] ? `.${m[2]}` : ".jpg");
       url.pathname = `/sites/default/files/${tail}`;
       url.search = ""; // drop itok
       return url.href;
     }
     // Already an original file — drop tokens; avoid .webp if present
     if (/^\/sites\/default\/files\//i.test(p)) {
       url.search = "";
       url.pathname = url.pathname.replace(/\.webp$/i, "");
       return url.href;
     }
     return url.href;
   } catch {
     return u || undefined;
   }
 }

// Robust odds parsing – accept "Overall Odds: 1 in 4.10", "1:4.10", "1 – 4.10"
function parseOddsToFloat(s?: string | null): number | null {
  if (!s) return null;
  const via = oddsFromText(s);
  if (typeof via === "number" && isFinite(via)) return via;

  // allow commas in the number
  const m = String(s).replace(/\s+/g, " ").match(/([0-9][0-9,]*(?:\.[0-9]+)?)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

// Parse "$250K", "$5M", "$250,000", etc. Returns dollars.
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

function parseOrdinal(label: string): number | undefined {
  const s = label.replace(/\s+/g, "");
  const m = s.match(/(\d+)(st|nd|rd|th)\b/i) || s.match(/\b(\d{1,2})\b/);
  return m ? Number(m[1]) : undefined;
}

function firstDefined<T>(...vals: (T | null | undefined)[]): T | undefined {
  for (const v of vals) {
    if (v != null) return v as T;
  }
  return undefined;
}

// Sum the *original* count of top prizes across the tier rows that correspond to the true top prize.
// We match tiers by prizeAmount === topPrizeValue. If no row matches (e.g., bad table),
// we fall back to the maximum prizeAmount present.
function computeTotalTopPrizesOriginal(
  tiers: NyScratcherTier[] | undefined,
  topPrizeValue?: number
): number | undefined {
  if (!tiers?.length) return undefined;
  // If we know the explicit top tier (prizeLevel === 1), prefer computing from that row directly.
  const topTier = tiers.find(t => t.prizeLevel === 1) ?? tiers[0];
  if (topTier) {
    const rem = topTier.prizesRemaining ?? 0;
    const paid = topTier.prizesPaidOut ?? 0;
    const total = rem + paid;
    if (total > 0) return total;
  }
  // Otherwise, fall back to matching rows by prizeAmount (equal to the page's top prize).
  let target = (typeof topPrizeValue === "number" && isFinite(topPrizeValue)) ? topPrizeValue : undefined;
  if (target == null) {
    target = Math.max(...tiers.map(t => t.prizeAmount ?? -Infinity));
    if (!Number.isFinite(target)) return undefined;
  }
  const sum = tiers
    .filter(t => t.prizeAmount === target)
    .reduce((acc, t) => acc + (t.totalPrizes ?? 0), 0);
  return Number.isFinite(sum) && sum > 0 ? sum : undefined;
}


// scrape helper: tiny sleep
const z = (ms: number) => new Promise((r) => setTimeout(r, ms));

function computeAdjustedOdds(tiers: NyScratcherTier[]): number | null {
  // Per-tier adjusted odds divisor:
  // base odds divisor_i * (totalPrizes_i / remaining_i).
  // Skip rows missing odds or remaining, or with remaining = 0.
  let sumProb = 0; // sum of probabilities per ticket = Σ 1/adjDiv_i
  for (const t of tiers) {
    if (!t.odds || t.odds <= 0) continue;
    if (t.prizesRemaining == null || t.prizesRemaining <= 0) continue;

    const total = (t.totalPrizes != null)
      ? t.totalPrizes
      : (t.prizesPaidOut != null ? t.prizesRemaining + t.prizesPaidOut : null);
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
// Listing Scrape
// -----------------------------
async function fetchListing(browser: Browser): Promise<ListingCard[]> {
  const page = await browser.newPage({
    userAgent: DEFAULT_UA,
    extraHTTPHeaders: {
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": NY_ORIGIN + "/",
    },
  });

  try {
    await openAndReady(page, LISTING_URL, { loadMore: false });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await z(300);

    // Evaluate on-page to collect anchors and card data using text-oriented parsing
    const raw = await page.$$eval('a[href^="/scratch-off-game?game="]', (as) => {
    const out: Array<{
        detailHref: string;
        innerText: string;
        imgSrc?: string;
        listingUrl: string;
        priceText?: string;
    }> = [];

    const abs = (href: string) => {
        try { return new URL(href, location.origin).href; } catch { return href; }
    };

    as.forEach((a) => {
        const href = (a as HTMLAnchorElement).getAttribute("href") || "";
        if (!/^\/scratch-off-game\?game=/i.test(href)) return;

        // Prefer the dedicated price element on the card
        const priceEl =
        (a.querySelector('[class*="__Price"]') as HTMLElement | null) ||
        (a.querySelector('.price, .value') as HTMLElement | null);
        let priceText = priceEl?.textContent?.trim() || "";

        // super safe fallback: look for a lone $XX (<= $50) in short nodes
        if (!priceText) {
        const shortDollar = Array.from(a.querySelectorAll("div,span"))
            .map((n) => (n.textContent || "").trim())
            .find((t) => /^\$\s*\d{1,2}(\.00)?$/.test(t));
        if (shortDollar) priceText = shortDollar;
        }

        const img = a.querySelector("img");
        const imgSrc =
        (img?.getAttribute("src") || img?.getAttribute("data-src") || img?.getAttribute("data-srcset") || "")
            .split(/\s+/)[0] || undefined;

        out.push({
        detailHref: abs(href),
        innerText: (a.textContent || "").replace(/\s+/g, " ").trim(),
        imgSrc: imgSrc ? abs(imgSrc) : undefined,
        listingUrl: location.href,
        priceText,
        });
    });
    return out;
    });


    const cards: ListingCard[] = raw.map((r) => {
    const t = cleanText(r.innerText);

    const title = (() => {
        const m = t.split(/Game\s*#\s*\d+/i)[0] || "";
        const cleaned = m.replace(/Top\s*Prize:.+$/i, "").trim();
        return cleaned || undefined;
    })();

    const gameNumber = (() => {
        const m = t.match(/Game\s*#\s*(\d{3,6})/i);
        return m ? Number(m[1]) : undefined;
    })();

    // PRICE — from dedicated priceText
    const price = (() => {
        const s = r.priceText || "";
        const m = s.match(/\$\s*([\d,]+(?:\.00)?)/);
        return m ? Number(m[1].replace(/,/g, "")) : undefined; // dollars
    })();

    // TOP PRIZE — from “Top Prize: $…”
    const topPrizeValue = (() => {
        const m = t.match(/Top\s*Prize:\s*\$([\d,]+(?:\.\d{2})?)/i);
        return m ? Number(m[1].replace(/,/g, "")) : undefined; // dollars
    })();

    const topPrizesRemaining = (() => {
        const m = t.match(/Top\s*Prizes\s*Remaining:\s*([0-9]+)/i);
        return m ? Number(m[1]) : null;
    })();

    const detailUrl = toAbs(r.detailHref);
    return {
        listingUrl: r.listingUrl,
        detailUrl,
        title,
        gameNumber,
        price,
        topPrizeValue,
        topPrizesRemaining,
        sourceImageUrl: r.imgSrc ? toAbs(r.imgSrc) : undefined,
    };
    });


    // De-duplicate by gameNumber (if any dup links exist)
    const seen = new Set<number>();
    const dedup = cards.filter((c) => {
      if (!c.gameNumber) return true;
      if (seen.has(c.gameNumber)) return false;
      seen.add(c.gameNumber);
      return true;
    });

    return dedup;
  } finally {
    await page.close().catch(() => {});
  }
}

// -----------------------------
// Detail Scrape
// -----------------------------
async function fetchDetail(browser: Browser, detailUrl: string): Promise<DetailInfo> {
  const page = await browser.newPage({
    userAgent: DEFAULT_UA,
    extraHTTPHeaders: {
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": LISTING_URL,
    },
  });

  try {
    await openAndReady(page, detailUrl, { loadMore: false });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await z(NAV_DELAY_MS);

    // Pull the whole text for odds/title/price/top prize fallbacks
    const wholeText = await page.evaluate(() => document.body?.innerText || "");
    const cleanedText = cleanText(wholeText);

    // Title from page heading (best-effort)
    const title = await page.$eval("h1, h2", el => (el.textContent || "").trim()).catch(() => undefined);

    // Overall odds
    const overallOdds = (() => {
      const m =
        cleanedText.match(/Overall\s*Odds?[:\s]+1\s*(?:in|:)\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i) ||
        cleanedText.match(/1\s*(?:in|:)\s*([0-9][0-9,]*(?:\.[0-9]+)?)[^\n]*Overall/i);
      if (m) {
        const n = Number(m[1].replace(/,/g, ""));
        return Number.isFinite(n) ? n : parseOddsToFloat(m[0]);
      }
      return parseOddsToFloat(cleanedText);
    })();

    // PRICE on detail banner: find a .label "Price" and its sibling .value
    const price = await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll(".label"));
      const node = labels.find((l) => (l.textContent || "").trim().toLowerCase() === "price");
      const val = node?.parentElement?.querySelector(".value")?.textContent || "";
      const m = val.match(/\$\s*([\d,]+)(?:\.00)?/);
      return m ? Number(m[1].replace(/,/g, "")) : undefined;
    });

    // Top Prize on detail (optional) — from page copy only (not the table).
    const topPrizeValue = (() => {
      const m = cleanedText.match(/Top\s*Prize[:\s]+\$([\d,]+(?:\.\d{2})?)/i);
      return m ? Number(m[1].replace(/,/g, "")) : undefined; // dollars
    })();

    // Top prizes remaining
    const topPrizesRemaining = (() => {
      const m = cleanedText.match(/Top\s*Prizes?\s*Remaining[:\s]+([0-9][0-9,]*)/i);
      return m ? Number(m[1].replace(/,/g, "")) : null;
    })();

    // Extract PRIZE GRID (div-based)
    const tiers = await page.evaluate((topPrizeValueFromHeader?: number) => {
      const clean = (s: string) => s.replace(/\s+/g, " ").trim();

      const candidateRoots = Array.from(document.querySelectorAll("div"));
      const root = candidateRoots.find((el) => {
        const header = el.querySelector(".row.header");
        if (!header) return false;
        const txt = clean(header.textContent || "").toLowerCase();
        return txt.includes("prize amount") && (txt.includes("odds") || txt.includes("odds of winning"));
      });

      if (!root) {
        return [] as Array<{
          prizeAmount: number;
          odds: number | null;
          prizesRemaining: number | null;
          prizesPaidOut?: number | null;
          totalPrizes?: number | null;
          prizeLevel?: number;
          prizeAmountLabel?: string;
        }>;
      }

      const rows = Array.from(root.querySelectorAll(".row")).filter((r) => !r.classList.contains("header"));
      const out: Array<{
        prizeAmount: number;
        odds: number | null;
        prizesRemaining: number | null;
        prizesPaidOut?: number | null;
        totalPrizes?: number | null;
        prizeLevel?: number;
        prizeAmountLabel?: string;
      }> = [];

      // helpers inside page
      const toInt = (s?: string | null): number | null => {
        if (!s) return null;
        const n = Number(String(s).replace(/[^0-9.-]/g, ""));
        return Number.isFinite(n) ? n : null;
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
      const parseOrdinal = (label: string): number | undefined => {
        const s = label.replace(/\s+/g, "");
        const m = s.match(/(\d+)(st|nd|rd|th)\b/i) || s.match(/\b(\d{1,2})\b/);
        return m ? Number(m[1]) : undefined;
      };

      rows.forEach((row) => {
        const cols = Array.from(row.querySelectorAll(".column .inner-column")).map((c) => clean(c.textContent || ""));
        // Expected: [Prize Level, Prize Amount, Prizes Remaining, Prizes Paid Out, Odds]
        if (cols.length < 5) return;

        const levelLabel = cols[0] || "";
        const prizeText  = cols[1] || "";
        const remainsText = cols[2] || "";
        const paidOutText = cols[3] || "";
        const oddsText = cols[4] || "";

        const prizeLevel = parseOrdinal(levelLabel);
        const isTop = prizeLevel === 1;

        // Robust prize parsing:
        // - try $ + K/M suffixes
        // - if top tier still not numeric (e.g., "Annual Installments"), fall back to heading topPrizeValue
        let prizeAmount = parsePrizeAmountLoose(prizeText);
        if ((!prizeAmount || !Number.isFinite(prizeAmount)) && isTop && typeof topPrizeValueFromHeader === 'number') {
          prizeAmount = topPrizeValueFromHeader;
        }
        if (!prizeAmount || !Number.isFinite(prizeAmount)) return;

        const prizesRemaining = toInt(remainsText);
        const prizesPaidOut = toInt(paidOutText);

        const totalPrizes =
          prizesRemaining != null && prizesPaidOut != null ? (prizesRemaining + prizesPaidOut) : undefined;

        const oddsMatch = oddsText.match(/1\s*(?:in|:)\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i);
        const odds = oddsMatch ? Number(oddsMatch[1].replace(/,/g, "")) : null;

        out.push({
          prizeAmount,
          odds: Number.isFinite(odds as any) ? (odds as number) : null,
          prizesRemaining,
          prizesPaidOut,
          ...(totalPrizes != null ? { totalPrizes } : {}),
          ...(prizeLevel != null ? { prizeLevel } : {}),
          prizeAmountLabel: prizeText,
        });
      });

      // Ensure the top row's prizeAmount equals the page-level top prize if both exist but differ
      if (typeof topPrizeValueFromHeader === 'number') {
        const ti = out.findIndex(r => r.prizeLevel === 1);
        const i = ti >= 0 ? ti : 0;
        if (out[i] && out[i].prizeAmount !== topPrizeValueFromHeader) {
          out[i].prizeAmount = topPrizeValueFromHeader;
        }
      }
      return out;
    }, topPrizeValue /* pass page-level top prize into the DOM parsing */);

    // Open lightbox from the banner image, scrape the full ticket image, then close.
    let ticketImageUrl: string | undefined;
    try {
      // Click the clickable banner area that opens the lightbox
      const openSel = 'div[class*="ScratchOffGameDetail__GameImage"]';
      if (await page.$(openSel)) {
        await page.click(openSel, { timeout: 1500 }).catch(() => {});
      } else {
        // fallback: click the main image if present
        await page.click('img.main-img', { timeout: 1500 }).catch(() => {});
      }

      // Wait for a large image inside the lightbox/slide
      await page.waitForSelector(
        'div[class*="ScratchOffGameDetail__Slide"] img[src*="/sites/default/files/"]',
        { timeout: 5000 }
      ).catch(() => {});

      // Extract the largest/best src from currentSrc/src/srcset
      const bigSrc = await page.evaluate(() => {
        const pickBest = (img: HTMLImageElement) => {
          if (img.currentSrc) return img.currentSrc;
          if (img.srcset) {
            const parts = img.srcset.split(",").map(s => s.trim());
            const parsed = parts.map(p => {
              const m = p.match(/(\S+)\s+(\d+)w/);
              return m ? { u: m[1], w: Number(m[2]) } : null;
            }).filter(Boolean) as Array<{u:string;w:number}>;
            if (parsed.length) return parsed.sort((a,b)=>b.w-a.w)[0]!.u;
          }
          return img.getAttribute("src") || "";
        };
        const imgs = Array.from(
          document.querySelectorAll('div[class*="ScratchOffGameDetail__Slide"] img[src*="/sites/default/files/"]')
        ) as HTMLImageElement[];
        if (!imgs.length) return "";
        return pickBest(imgs[0]);
      });
      if (bigSrc) ticketImageUrl = normalizeNyCmsUrl(bigSrc);

      // Close the lightbox (best-effort)
      const closeSel = 'div[class*="ScratchOffGameDetail__CloseIcon"], button[aria-label="Close"]';
      const closeBtn = await page.$(closeSel);
      await closeBtn?.click({ timeout: 1000 }).catch(() => {});
      await z(150);
    } catch {
      // ignore — we'll proceed without ticketImageUrl if not found
    }

    return {
      overallOdds: overallOdds ?? null,
      tiers,
      title,
      price,
      topPrizeValue,
      topPrizesRemaining,
      ...(ticketImageUrl ? { ticketImageUrl } : {}),
    };
  } finally {
    await page.close().catch(() => {});
  }
}


// -----------------------------
// Build final record
// -----------------------------
function buildRecord(listing: ListingCard, detail: DetailInfo, hostedImageUrl: string): NyScratcherRecord {
  const topPrizeValue = detail.topPrizeValue ?? listing.topPrizeValue ?? 0;
  const topPrizesRemaining = detail.topPrizesRemaining ?? listing.topPrizesRemaining ?? null;
  const name = (detail.title || listing.title || "").trim();
  const price = detail.price ?? listing.price ?? 0;

  const gameNumber = (() => {
    if (listing.gameNumber) return listing.gameNumber;
    const m = listing.detailUrl.match(/[?&]game=(\d+)/i);
    return m ? Number(m[1]) : 0;
  })();

  // Prefer full/lightbox image from detail; normalize listing as fallback
  const listingSrcNorm = normalizeNyCmsUrl(listing.sourceImageUrl);
  const sourceImageUrl = detail.ticketImageUrl || listingSrcNorm || "";

  // Force top-tier (level 1) prize amount == topPrizeValue (safety net)
  if (detail.tiers?.length && typeof topPrizeValue === 'number') {
    const ti = detail.tiers.findIndex(t => t.prizeLevel === 1);
    const i = ti >= 0 ? ti : 0;
    if (detail.tiers[i] && detail.tiers[i].prizeAmount !== topPrizeValue) {
      detail.tiers[i].prizeAmount = topPrizeValue;
    }
    // Also recompute total for that row if missing
    const t = detail.tiers[i];
    if (t && t.totalPrizes == null && (t.prizesRemaining != null || t.prizesPaidOut != null)) {
      t.totalPrizes = (t.prizesRemaining ?? 0) + (t.prizesPaidOut ?? 0);
    }
  }

  return {
    source: "ny",
    updatedAt: new Date().toISOString(),
    gameNumber,
    name,
    price,
    sourceImageUrl,
    ticketImageUrl: hostedImageUrl || sourceImageUrl,
    topPrizeValue,
    topPrizesRemaining,
    overallOdds: detail.overallOdds ?? null,
    tiers: detail.tiers,
    detailUrl: listing.detailUrl,
    listingUrl: listing.listingUrl,
    // Use explicit top-tier row (level 1) if available; otherwise fall back helper:
    topPrizesOriginal:
      (detail.tiers?.length ? ((detail.tiers.find(t => t.prizeLevel === 1) ?? detail.tiers[0])?.totalPrizes ?? undefined) : undefined)
      ?? computeTotalTopPrizesOriginal(detail.tiers, topPrizeValue),
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

    // 2) Walk detail pages with concurrency
    const results: NyScratcherRecord[] = [];
    let hostedOk = 0;

    await Promise.all(
      listing.map((card) =>
        limit(async () => {
          const detail = await withRetry(() => fetchDetail(browser, card.detailUrl), {
            attempts: 2,
            label: `detail#${card.gameNumber ?? "?"}`,
            minDelayMs: 900,
          });

          // Host image (prefer the detail lightbox if present)
          let hostedUrl = "";
          const src = (detail.ticketImageUrl || card.sourceImageUrl || "");
          if (src) {
            try {
                if (card.gameNumber) {
                const h = await ensureHashKeyNY({
                    gameNumber: card.gameNumber,
                    kind: "ticket",
                    sourceUrl: src,
                    dryRun: !!argv["dry-run"],
                });
                hostedUrl = h.url;
                } else {
                const h = await downloadAndHost({
                    sourceUrl: src,
                    keyHint: `ny/scratchers/images/misc/ticket-<sha>.<ext>`,
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
          // compute adjusted overall odds using rec.tiers
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
const latestLocal = path.join(OUT_DIR, `index.json`);
const payload = {
  updatedAt: new Date().toISOString(),
  count: sorted.length,
  games: sorted,
};
await fs.writeFile(latestLocal, JSON.stringify(payload, null, 2), "utf8");

// Optional: also write index.latest.json locally for compatibility
await fs.writeFile(path.join(OUT_DIR, `index.latest.json`), JSON.stringify(payload, null, 2), "utf8");

// 4b) Upload to GCS/R2 if configured (GCS: GCS_BUCKET + PUBLIC_BASE_URL)
try {
  const dry = !!argv["dry-run"];
  await putJsonObject({
    key: "ny/scratchers/index.json",
    data: payload,
    cacheControl: "no-store",
    dryRun: dry,
  });
  // (Optional) “latest” alias if you still want it in remote storage:
  await putJsonObject({
    key: "ny/scratchers/index.latest.json",
    data: payload,
    cacheControl: "no-store",
    dryRun: dry,
  });
} catch (e) {
  console.warn(`[upload] skipped/failed: ${String(e)}`);
}

    // 5) Log summary
    const withOdds = sorted.filter((g) => g.overallOdds != null).length;
    const withTiers = sorted.filter((g) => g.tiers && g.tiers.length > 0).length;

    console.log(
      `[ny] games=${sorted.length} withOdds=${withOdds} withTiers=${withTiers} hostedImages=${hostedOk}`
    );

    if (sorted.length === 0) {
      throw new Error("CI assertion: No active NY scratcher games were returned.");
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
