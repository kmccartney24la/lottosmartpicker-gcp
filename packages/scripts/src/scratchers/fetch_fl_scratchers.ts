// scripts/scratchers/fetch_fl_scratchers.ts
/* ============================================================================
   FL Scratchers Scraper (LottoSmartPicker)
   ----------------------------------------------------------------------------
   Quickstart (one-time):
     npx playwright install chromium

   Run:
     tsx scripts/scratchers/fetch_fl_scratchers.ts
     # or
     ts-node scripts/scratchers/fetch_fl_scratchers.ts

   Outputs:
     /public/data/fl/scratchers/index.json
     /public/data/fl/scratchers/index.latest.json

   Conventions:
     • Monetary values stored as DOLLARS (integer).
     • Odds stored as divisor (e.g., 4.10 means "1 in 4.10").
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
import { ensureHashKeyFL, downloadAndHost, putJsonObject } from "./image_hosting.js"; // export ensureHashKeyFL analogous to ensureHashKeyNY

// -----------------------------
// CLI parse (kept for parity with NY file top helper)
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
// Types (identical fields as NY; only source differs)
// -----------------------------
export type FlScratcherTier = {
  prizeAmount: number;               // dollars
  odds: number | null;               // divisor (1 in X => X)
  prizesRemaining: number | null;
  prizesPaidOut?: number | null;
  totalPrizes?: number | null;       // remaining + paidOut
  prizeLevel?: number;               // 1 for top prize
  prizeAmountLabel?: string;
};

export type FlScratcherRecord = {
  source: "fl";
  updatedAt: string;
  gameNumber: number;
  name: string;
  price: number;                     // dollars
  sourceImageUrl: string;            // original source image (provenance)
  ticketImageUrl: string;            // hosted image used by the app
  topPrizeValue: number;             // dollars
  topPrizesRemaining: number | null;
  overallOdds: number | null;
  topPrizesOriginal?: number;
  tiers: FlScratcherTier[];
  detailUrl: string;
  listingUrl: string;
  adjustedOdds?: number | null;
};

// Minimal listing “card” info pulled from the grid page
type ListingCard = {
  listingUrl: string;    // absolute (grid page)
  detailUrl: string;     // absolute (detail page)
  title?: string;
  gameNumber?: number;
  price?: number;        // dollars
  topPrizeValue?: number;
  topPrizesRemaining?: number | null;
  sourceImageUrl?: string;
};

// Detail response
type DetailInfo = {
  overallOdds: number | null;
  tiers: FlScratcherTier[];
  title?: string;
  price?: number;
  topPrizeValue?: number;
  topPrizesRemaining?: number | null;
  ticketImageUrl?: string;
};

// -----------------------------
// Constants (Florida)
// -----------------------------
const OUT_DIR = "public/data/fl/scratchers";
const LISTING_URL = "https://www.floridalottery.com/games/scratch-offs";;
const FL_ORIGIN = "https://www.floridalottery.com/";

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
    return new URL(href, FL_ORIGIN).href;
  } catch {
    return href;
  }
}

// Florida CMS/image normalizer (best-effort, tolerant).
// - Return absolute URL
// - Strip trivial query tokens
// - If a styles/public pattern emerges later, we can map to originals
function normalizeFlCmsUrl(u?: string | null): string | undefined {
  if (!u) return undefined;
  try {
    const url = new URL(u, FL_ORIGIN);
    // Only strip obvious cache/search tokens; otherwise keep as-is
    url.search = url.search
      .replace(/(?:\?|&)itok=[^&]+/i, "")
      .replace(/(?:\?|&)cacheBuster=[^&]+/i, "");
    return url.href.replace(/\?&/, "?").replace(/[?&]$/, "");
  } catch {
    return u || undefined;
  }
}

// Robust odds parsing – accept "Overall Odds: 1 in 4.10", "1:4.10", etc.
function parseOddsToFloat(s?: string | null): number | null {
  if (!s) return null;
  const via = oddsFromText(s);
  if (typeof via === "number" && isFinite(via)) return via;

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

// Sum the *original* count of top prizes (match tiers to the top prize value)
function computeTotalTopPrizesOriginal(
  tiers: FlScratcherTier[] | undefined,
  topPrizeValue?: number
): number | undefined {
  if (!tiers?.length) return undefined;

  const topTier = tiers.find(t => t.prizeLevel === 1) ?? tiers[0];
  if (topTier) {
    const rem = topTier.prizesRemaining ?? 0;
    const paid = topTier.prizesPaidOut ?? 0;
    const total = rem + paid;
    if (total > 0) return total;
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

function computeAdjustedOdds(tiers: FlScratcherTier[]): number | null {
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
// Listing Scrape (Florida)
// -----------------------------
async function fetchListing(browser: Browser): Promise<ListingCard[]> {
  const page = await browser.newPage({
    userAgent: DEFAULT_UA,
    extraHTTPHeaders: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: FL_ORIGIN + "/",
    },
  });

  try {
    await openAndReady(page, LISTING_URL, { loadMore: false });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await z(300);

    // Load the whole grid: click "View More" until it vanishes.
    // Grid selector (stable in your snippet): <ul id="...-vc-results"> ... <li class="scratchoffteaser">
    const GRID_LI = 'ul[id^="scratchoffsearch-"][id$="-vc-results"] li.scratchoffteaser';
    await page.waitForSelector(GRID_LI, { timeout: 15_000 }).catch(() => {});

    let safety = 50; // hard cap to avoid infinite loop in case of unexpected DOM
    while (safety-- > 0) {
      const before = await page.$$eval(GRID_LI, els => els.length).catch(() => 0);
      const btn = await page.$('button:has-text("View More")');
      if (!btn) break;
      await btn.click().catch(() => {});
      // Wait for new items OR the button to disappear.
      await Promise.race([
        page
            .waitForFunction(
            (args: { sel: string; prev: number }) =>
                document.querySelectorAll(args.sel).length > args.prev,
            { sel: GRID_LI, prev: before },
            { timeout: 8_000 }
            )
            .catch(() => {}),
        page
            .waitForSelector('button:has-text("View More")', {
            state: "detached",
            timeout: 8_000,
            })
            .catch(() => {}),
        ]);
      await z(250);
      // If no growth and the button is gone, we're done.
      const after = await page.$$eval(GRID_LI, els => els.length).catch(() => before);
      const stillBtn = await page.$('button:has-text("View More")');
      if (after <= before && !stillBtn) break;
    }

    // Read from the actual grid cards shown on the page you provided.
    const raw = await page.$$eval(
        'ul[id^="scratchoffsearch-"][id$="-vc-results"] li.scratchoffteaser article.cmp-scratchoffteaser',
        (cards) => {
            const abs = (href: string) => {
            try { return new URL(href, location.origin).href; } catch { return href; }
            };
            const clean = (s?: string | null) => (s || "").replace(/\s+/g, " ").trim();

            const takeBgUrl = (el: HTMLElement | null) => {
            if (!el) return undefined;
            const dataBg = (el.getAttribute("data-bg") || "").trim();
            if (dataBg) return abs(dataBg);
            const style = (el.getAttribute("style") || "").match(/background-image:\s*url\(["']?([^"')]+)["']?\)/i);
            return style ? abs(style[1]) : undefined;
            };

            // Read values from <dl> by their DT labels (e.g., "Top Prize", "Price")
            const getLabeledValue = (root: Element, labelRegex: RegExp): string | undefined => {
            const dts = Array.from(root.querySelectorAll("dl dt"));
            for (const dt of dts) {
                const lab = clean(dt.textContent || "");
                if (labelRegex.test(lab)) {
                // Prefer a dd within the same container; fallback to the next sibling
                const dd = (dt.parentElement?.querySelector("dd") as HTMLElement | null)
                        || (dt.nextElementSibling as HTMLElement | null);
                const val = clean(dd?.textContent || "");
                if (val) return val;
                }
            }
            return undefined;
            };

            return Array.from(cards).map((card) => {
            const a = card.querySelector("a[href*='scratch-offs/view']") as HTMLAnchorElement | null;
            const detailHref = abs(a?.href || "");
            const title = clean(card.querySelector("h3 a, h3")?.textContent || "");

            // "Scratch-Off • #1604" (sometimes has .block)
            const subline =
                clean(card.querySelector("p.block.text-xs")?.textContent || "") ||
                clean(card.querySelector("p.text-xs")?.textContent || "");

            let gameNumber: number | undefined;
            const m1 = subline.match(/#\s*(\d{3,6})\b/);
            if (m1) gameNumber = Number(m1[1]);
            if (!gameNumber) {
                const m2 = detailHref.match(/[?&]id=(\d{3,6})\b/);
                if (m2) gameNumber = Number(m2[1]);
            }

            // Background image on the teaser
            const imgHolder = card.querySelector("a > span.ratio") as HTMLElement | null;
            const imgSrc = takeBgUrl(imgHolder);

            // Label-based pulls (robust to ordering/visibility)
            const topPrizeText =
                getLabeledValue(card, /^top\s*prize$/i) ||
                clean(card.querySelector("dl dd")?.textContent || ""); // fallback

            const priceText =
                getLabeledValue(card, /^price$/i) ||
                (() => {
                // fallback: any dd that looks like a $-amount
                const dd = Array
                    .from(card.querySelectorAll("dl dd"))
                    .map((el) => clean(el.textContent || ""))
                    .find((s) => /^\$\s*[\d,]+(?:\.\d{2})?$/.test(s));
                return dd || "";
                })();

            return {
                detailHref,
                innerText: clean(card.textContent || ""),
                imgSrc,
                listingUrl: location.href,
                title,
                subline,
                gameNumber,
                priceText,
                topPrizeText,
            };
            });
        }
        );


    const cards: ListingCard[] = raw.map((r) => {
      const t = cleanText(r.innerText);

      // Prefer the explicit card title we captured.
      const title = (r as any).title || (() => {
        const beforeGameHash = t.split(/Game\s*#\s*\d+/i)[0] || t;
        const cleaned = beforeGameHash.replace(/Top\s*Prize:.+$/i, "").trim();
        return cleaned || undefined;
      })();

      // Prefer grid-derived number (fast and reliable)
      const gameNumber = (r as any).gameNumber ?? (() => {
        const m1 = t.match(/Game\s*#\s*(\d{3,6})/i);
        if (m1) return Number(m1[1]);
        const m2 = r.detailHref.match(/(?:[?&]id=|[?&]game(?:Id|Number)?=|\/game\/)(\d{3,6})\b/i)
          || r.detailHref.match(/(\d{3,6})(?:\/|$)/);
        return m2 ? Number(m2[1]) : undefined;
      })();

      const price = (() => {
        const s = (r as any).priceText || r.priceText || "";
        const m = s.match(/\$\s*([\d,]+)(?:\.00)?/);
        return m ? Number(m[1].replace(/,/g, "")) : undefined; // dollars
      })();

      const topPrizeValue = (() => {
        const s = (r as any).topPrizeText || "";
        const m =
          s.match(/\$([\d,]+(?:\.\d{2})?)/) ||
          t.match(/Top\s*Prize[:\s]+\$([\d,]+(?:\.\d{2})?)/i);
        return m ? Number(m[1].replace(/,/g, "")) : undefined;
      })();

      const topPrizesRemaining = (() => {
        const m = t.match(/Top\s*Prizes?\s*Remaining[:\s]+([0-9][0-9,]*)/i);
        return m ? Number(m[1].replace(/,/g, "")) : null;
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

    // De-duplicate by gameNumber when available
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
// Detail Scrape (Florida)
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

    // Title (strip the <small> Game ID from the h1)
    const title = await page.$eval(
      ".cmp-header__title",
      (el) => {
        const clone = el.cloneNode(true) as HTMLElement;
        clone.querySelector("small")?.remove();
        return (clone.textContent || "").trim();
      }
    ).catch(() => undefined);

    // Header infolist items (Top Prize, Top Prizes Remaining, Overall Odds)
    const headerInfo = await page.evaluate(() => {
      const clean = (s?: string | null) => (s || "").replace(/\s+/g, " ").trim();
      const byLabel = (label: string) => {
        const items = Array.from(document.querySelectorAll(".cmp-header__content .cmp-infolist__item"));
        for (const it of items) {
          const k = clean(it.querySelector(".cmp-infolist__item-title")?.textContent);
          const v = clean(it.querySelector(".cmp-infolist__item-description")?.textContent);
          if (!k || v == null) continue;
          if (k.toLowerCase() === label.toLowerCase()) return v;
        }
        return undefined;
      };
      const ticketImg = document.querySelector(".cmp-header__media img") as HTMLImageElement | null;
      const bestImg = ticketImg?.currentSrc || ticketImg?.src || "";
      return {
        topPrizeText: byLabel("Top Prize"),
        topPrizesRemainingText: byLabel("Top Prizes Remaining"),
        overallOddsText: byLabel("Overall Odds"),
        ticketImgSrc: bestImg || undefined
      };
    });

    const topPrizeValue =
      headerInfo?.topPrizeText ? parsePrizeAmountLoose(headerInfo.topPrizeText) : undefined;

    const topPrizesRemaining = (() => {
      const s = headerInfo?.topPrizesRemainingText || "";
      const m = s.match(/([0-9][0-9,]*)/);
      return m ? Number(m[1].replace(/,/g, "")) : null;
    })();

    const overallOdds = (() => {
      // Handles "1:4.08", "1 in 4.08", etc.
      const s = headerInfo?.overallOddsText || "";
      const via = parseOddsToFloat(s);
      if (via != null) return via;
      return parseOddsToFloat(cleanedText) ?? null;
    })();

    // Prefer the header image if present; normalize to absolute
    let ticketImageUrl: string | undefined = headerInfo?.ticketImgSrc
      ? normalizeFlCmsUrl(headerInfo.ticketImgSrc)
      : undefined;

        // --- NEW: Odds & Prizes table parsing ("X of Y" -> remaining/total/paid) ---
    const tiers = await page.evaluate((topPrizeValueFromHeader?: number) => {
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

      // Find the "Odds & Prizes" table via its caption/header text
      const table = Array.from(document.querySelectorAll("table"))
        .find(tbl => /odds\s*&\s*prizes/i.test(clean(tbl.caption?.textContent || tbl.previousElementSibling?.textContent || "")))
        || document.querySelector('table.font-sans-tds');

      if (!table) return [] as RowOut[];

      const rows = Array.from(table.querySelectorAll("tbody tr"));
      const out: RowOut[] = [];

      for (const tr of rows) {
        const th = tr.querySelector("th");
        const tds = Array.from(tr.querySelectorAll("td"));
        if (!th || tds.length < 2) continue;

        const prizeLabel = clean(th.textContent);
        let prizeAmount = parsePrizeAmountLoose(prizeLabel);
        const oddsText = clean(tds[0]?.textContent || "");
        const remainText = clean(tds[1]?.textContent || "");

        // Odds: handle "1-in-264853", "1 – in – 264853", "1 in 264853", and "1:4.08"
        // Normalize any dashes to spaces so "1-in-..." becomes "1 in ..."
        const oddsNormalized = oddsText.replace(/[-–—]+/g, " ").replace(/\s+/g, " ").trim();
        const mOdds = oddsNormalized.match(/1\s*(?:in|:)\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i);
        const odds = mOdds ? Number(mOdds[1].replace(/,/g, "")) : null;



        // "Prizes Remaining" like "86 of 100" -> remaining=86, total=100, paid=14
        let prizesRemaining: number | null = null;
        let totalPrizes: number | null | undefined = undefined;
        let prizesPaidOut: number | null | undefined = undefined;

        const mRem = remainText.match(/([0-9][0-9,]*)\s+of\s+([0-9][0-9,]*)/i);
        if (mRem) {
          const rem = Number(mRem[1].replace(/,/g, ""));
          const tot = Number(mRem[2].replace(/,/g, ""));
          if (Number.isFinite(rem)) prizesRemaining = rem;
          if (Number.isFinite(tot)) {
            totalPrizes = tot;
            if (Number.isFinite(rem)) prizesPaidOut = Math.max(tot - rem, 0);
          }
        } else {
          // fallback: single integer
          const remOnly = remainText.match(/([0-9][0-9,]*)/);
          if (remOnly) prizesRemaining = Number(remOnly[1].replace(/,/g, ""));
        }

        // If the top row doesn't parse a dollar value, trust the page header's top prize
        if ((!prizeAmount || !Number.isFinite(prizeAmount)) && typeof topPrizeValueFromHeader === "number") {
          // On FL the first row is the top prize; align it.
          // If later they reorder, we could add a max() pass, but this matches current DOM.
          prizeAmount = topPrizeValueFromHeader;
        }
        if (!prizeAmount || !Number.isFinite(prizeAmount)) continue;

        out.push({
          prizeAmount,
          odds: Number.isFinite(odds as any) ? (odds as number) : null,
          prizesRemaining,
          ...(prizesPaidOut != null ? { prizesPaidOut } : {}),
          ...(totalPrizes != null ? { totalPrizes } : {}),
          prizeAmountLabel: prizeLabel,
        });
      }

      // Assign prizeLevel: level 1 to the highest prize amount
      if (out.length) {
        const maxAmt = Math.max(...out.map(r => r.prizeAmount));
        out.forEach(r => { if (r.prizeAmount === maxAmt) r.prizeLevel = 1; });
      }

      return out;
    }, topPrizeValue);


    return {
      overallOdds: overallOdds ?? null,
      tiers,
      title,
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
function buildRecord(listing: ListingCard, detail: DetailInfo, hostedImageUrl: string): FlScratcherRecord {
  const topPrizeValue = detail.topPrizeValue ?? listing.topPrizeValue ?? 0;
  const topPrizesRemaining = firstDefined(detail.topPrizesRemaining, listing.topPrizesRemaining) ?? null;
  const name = (detail.title || listing.title || "").trim();
  const price = firstDefined(detail.price, listing.price) ?? 0;

  const gameNumber = (() => {
    if (listing.gameNumber) return listing.gameNumber;
    const m =
      listing.detailUrl.match(/[?&]game(?:Id|Number)?=(\d+)/i) ||
      listing.detailUrl.match(/\/game\/(\d+)/i) ||
      listing.detailUrl.match(/(\d{3,6})(?:\/|$)/);
    return m ? Number(m[1]) : 0;
  })();

  const listingSrcNorm = normalizeFlCmsUrl(listing.sourceImageUrl);
  const sourceImageUrl = detail.ticketImageUrl || listingSrcNorm || "";

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
    source: "fl",
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

    // 2) Walk detail pages with concurrency
    const results: FlScratcherRecord[] = [];
    let hostedOk = 0;

    await Promise.all(
      listing.map((card) =>
        limit(async () => {
          const detail = await withRetry(() => fetchDetail(browser, card.detailUrl), {
            attempts: 2,
            label: `detail#${card.gameNumber ?? "?"}`,
            minDelayMs: 900,
          });

          // Host image (prefer detail lightbox if present)
          let hostedUrl = "";
          const src = detail.ticketImageUrl || card.sourceImageUrl || "";
          if (src) {
            try {
              if (card.gameNumber) {
                const h = await ensureHashKeyFL({
                  gameNumber: card.gameNumber,
                  kind: "ticket",
                  sourceUrl: src,
                  dryRun: !!argv["dry-run"],
                });
                hostedUrl = h.url;
              } else {
                const h = await downloadAndHost({
                  sourceUrl: src,
                  keyHint: `fl/scratchers/images/misc/ticket-<sha>.<ext>`,
                  dryRun: !!argv["dry-run"],
                });
                hostedUrl = h.url;
              }
              hostedOk++;
            } catch (e) {
              console.warn(
                `[image] hosting failed for ${src}: ${String(
                  e
                )} — falling back to source`
              );
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
        if (a.topPrizeValue !== b.topPrizeValue)
          return b.topPrizeValue - a.topPrizeValue;
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
    await fs.writeFile(
      path.join(OUT_DIR, `index.latest.json`),
      JSON.stringify(payload, null, 2),
      "utf8"
    );

    // 4b) Upload remote (GCS/R2 as configured)
    try {
      const dry = !!argv["dry-run"];
      await putJsonObject({
        key: "fl/scratchers/index.json",
        data: payload,
        cacheControl: "no-store",
        dryRun: dry,
      });
      await putJsonObject({
        key: "fl/scratchers/index.latest.json",
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
      `[fl] games=${sorted.length} withOdds=${withOdds} withTiers=${withTiers} hostedImages=${hostedOk}`
    );

    if (sorted.length === 0) {
      throw new Error("CI assertion: No active FL scratcher games were returned.");
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
