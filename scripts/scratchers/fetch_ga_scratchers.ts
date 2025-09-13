//scripts/scratchers/fetch_ga_scratchers.ts
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, BrowserContext } from "playwright";
import { ensureDir, maybeStartTracing, maybeStopTracing, openAndReady, oddsFromText, withRetry } from "./_util";
import { fetchActiveEndedNumbers } from "./parse_lists";
import { fetchTopPrizes, type TopPrizeRow } from "./parse_top_prizes";

const OUT_DIR = "public/data/ga_scratchers";
const ACTIVE_URL = "https://www.galottery.com/en-us/games/scratchers/active-games.html";

export type ActiveGame = {
  gameNumber: number;       // primary key
  name: string;             // modal (fallback: Top Prizes)
  price: number | undefined;            // from Top Prizes
  topPrizeValue: number | undefined;    // from Top Prizes
  topPrizesOriginal: number | undefined;// from Top Prizes
  topPrizesRemaining: number | undefined;// from Top Prizes
  overallOdds: number | undefined;      // from modal
  adjustedOdds: number | undefined;     // heuristic: overallOdds / max(remaining/original, 0.01)
  startDate?: string;       // modal
  oddsImageUrl?: string;    // modal (optional)
  ticketImageUrl?: string;  // modal (optional)
  updatedAt: string;        // Top Prizes “last updated”
};

type ModalDetail = {
  gameNumber: number;
  name?: string;
  overallOdds?: number;
  startDate?: string;
  ticketImageUrl?: string;
  oddsImageUrl?: string;
};

async function writeJson(basename: string, data: unknown) {
  await ensureDir(OUT_DIR);
  const fp = path.join(OUT_DIR, basename);
  await fs.writeFile(fp, JSON.stringify(data, null, 2), "utf8");
  return fp;
}

async function scrapeActiveModalDetails(context: BrowserContext): Promise<Map<number, ModalDetail>> {
  const page = await context.newPage();
  try {
    await openAndReady(page, ACTIVE_URL, { loadMore: true });

    const tileSelectors = [
      '[data-target="#scratchersModal"]',
      'a[href="#scratchersModal"]',
      '.scratchers-grid [data-game-id]',
      '.scratchers-grid .thumbnail',
      '.scratchers-grid [role="button"]',
      '.scratchers-grid .card, .scratchers-grid .tile, .scratchers-grid .game-tile',
      '[data-game-id], [data-ga-game], [data-scratchers-tile]',
    ];
    const selector = tileSelectors.join(", ");
    await page.waitForSelector(selector, { timeout: 10_000 }).catch(() => {});
    let tiles = await page.$$(selector);
    if (!tiles.length) {
      tiles = await page.$$('.scratchers-grid *:not(script):not(style)');
    }

    const byNum = new Map<number, ModalDetail>();

    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      try {
        await t.scrollIntoViewIfNeeded();
        await t.click({ timeout: 1500 });

        const modalSel = [
          '#scratchersModalBody .modal-scratchers-content',
          '#scratchersModal .modal-scratchers-content',
          '.modal-scratchers-content'
        ].join(', ');
        await page.waitForSelector(modalSel, { timeout: 6000 });

        const info = await page.evaluate((sel) => {
          // Strong image picking
          const abs = (u: string) => new URL(u, location.origin).href;

          const ticketImgEl =
            document.querySelector('.modal-scratchers-image img[src*="/ticket"]') ||
            Array.from(document.querySelectorAll('.modal-scratchers-image img, .modal-scratchers-content img'))
              .find(img =>
                /\/ticket\.png$/i.test((img as HTMLImageElement).src) ||
                /scratchers game title/i.test(((img as HTMLImageElement).alt || ""))
              );

          const oddsImgEl =
            document.querySelector('#oddsPanel img') ||
            Array.from(document.querySelectorAll('.modal-scratchers-content img'))
              .find(img =>
                /\/odds\.jpg$/i.test((img as HTMLImageElement).src) ||
                /scratchers game odds/i.test(((img as HTMLImageElement).alt || ""))
              );

          let ticketImageUrl = ticketImgEl
            ? abs(((ticketImgEl as HTMLImageElement).currentSrc || (ticketImgEl as HTMLImageElement).src))
            : undefined;

          const oddsImageUrl = oddsImgEl
            ? abs(((oddsImgEl as HTMLImageElement).currentSrc || (oddsImgEl as HTMLImageElement).src))
            : undefined;

          // If only one image and it's clearly the odds card, don't fake a ticket image
          const imgsAll = Array.from(document.querySelectorAll('.modal-scratchers-content img')) as HTMLImageElement[];
          if (!ticketImageUrl && imgsAll.length === 1 && /\/odds\.jpg$/i.test(imgsAll[0].src)) {
            // keep ticketImageUrl undefined
          }

          const root = document.querySelector(sel) as HTMLElement | null;
          if (!root) return null;

          const pickText = (el: Element | null) => (el?.textContent || "").trim();

          // Prefer explicit selectors under the modal content:
          const nameFromSelectors =
            pickText(root.querySelector("h2.game-name")) ||
            pickText(root.querySelector(".game-name")) ||
            pickText(root.querySelector(".modal-scratchers-header h2")) ||
            "";

          // Ultra-defensive: if above were empty, try any prominent heading inside the modal
          const name =
            nameFromSelectors ||
            pickText(root.querySelector("h1, h2, h3")) || "";

          // Keep the rest as-is
          const text = (root.textContent || "").replace(/\s+/g, " ");

          return {
            name,
            text,
            ticketImageUrl,
            oddsImageUrl,
          };
        }, modalSel);
        if (info) {
          const numMatch = info.text.match(/Game\s*(?:Number|#)\s*[:#]?\s*(\d{3,5})/i);
          const gameNumber = numMatch ? Number(numMatch[1]) : NaN;

          const overall = ((): number | undefined => {
            // oddsFromText expects e.g., "1 in 3.47"
            const n = oddsFromText(info.text);
            return n;
          })();

          const startDate = ((): string | undefined => {
            const m = info.text.match(/(?:Start|Launch)\s*Date\s*[:\-]?\s*([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Za-z]{3,9}\s+\d{4})/i);
            return m ? m[1] : undefined;
          })();

          if (Number.isFinite(gameNumber)) {
            byNum.set(gameNumber, {
              gameNumber,
              name: info.name || undefined,
              overallOdds: overall,
              startDate,
              ticketImageUrl: info.ticketImageUrl,
              oddsImageUrl: info.oddsImageUrl,
            });
          }
        }

        // Close modal
        await page.keyboard.press("Escape").catch(() => {});
        await page.click('body', { timeout: 300 }).catch(() => {});
        await page.waitForTimeout(60);
      } catch {
        await page.keyboard.press("Escape").catch(() => {});
      }
    }

    // Persist details snapshot
    const sample = Array.from(byNum.values()).slice(0, 10);
    await writeJson("_debug_active.details.json", { count: byNum.size, sample });

    return byNum;
  } finally {
    await page.close().catch(() => {});
  }
}

function pickUpdatedAt(map: Map<number, TopPrizeRow>): string {
  // Choose the first defined lastUpdated; else now
  for (const row of map.values()) {
    if (row.lastUpdated) return row.lastUpdated;
  }
  return new Date().toISOString();
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext();

  await maybeStartTracing(context);

  try {
    // 1) Get active/ended numbers (numbers only; robust to SPA)
    const { activeNums } = await fetchActiveEndedNumbers(context);
    if (!activeNums.length) throw new Error("No active game numbers discovered.");

    // 2) Parse Top Prizes table
    const topPrizesMap = await fetchTopPrizes(context); // Map<number, TopPrizeRow>

    // 3) Overlay modal details from Active page
    const detailsByNum = await withRetry(() => scrapeActiveModalDetails(context), {
      label: "modal details",
      attempts: 2,
    });
    if (detailsByNum.size / activeNums.length < 0.5) {
      console.warn(`[guard] modal details sparse: ${detailsByNum.size}/${activeNums.length} games enriched from modals`);
    }

    // 4) Compose ActiveGame list
    const updatedAt = pickUpdatedAt(topPrizesMap);

    const games: ActiveGame[] = activeNums.map((num) => {
      const row = topPrizesMap.get(num);
      const det = detailsByNum.get(num);

      const nameRaw =
        (det?.name && det.name.trim()) ||
        (row?.gameName && row.gameName.trim()) ||
        `Game #${num}`;

      const name = nameRaw.toUpperCase();

      const overall = det?.overallOdds;
      const orig = row?.originalTopPrizes;
      const rem = row?.topPrizesRemaining;

      let adjusted: number | undefined = undefined;
      if (overall && orig && orig > 0 && typeof rem === "number") {
        const ratio = rem / orig;
        adjusted = overall / Math.max(ratio, 0.01);
      } else if (overall) {
        adjusted = overall;
      }

      // @ts-expect-error topPrizeValue may or may not be present in TopPrizeRow; tolerate undefined
      const topPrizeValue: number | undefined = (row as any)?.topPrizeValue ?? undefined;

      return {
        gameNumber: num,
        name,
        price: row?.price,
        topPrizeValue,
        topPrizesOriginal: row?.originalTopPrizes,
        topPrizesRemaining: row?.topPrizesRemaining,
        overallOdds: overall,
        adjustedOdds: adjusted,
        startDate: det?.startDate,
        oddsImageUrl: det?.oddsImageUrl,
        ticketImageUrl: det?.ticketImageUrl,
        updatedAt,
      };
    });

    // ---- Guardrails & CI assertions
    const missingTopPrizeNums = games
      .filter(g => g.price == null || g.topPrizesOriginal == null || g.topPrizesRemaining == null)
      .map(g => g.gameNumber);

    // Basic sanity
    if (games.length === 0) {
      throw new Error("CI assertion: No active games were returned.");
    }
    if (topPrizesMap.size === 0) {
      throw new Error("CI assertion: Top Prizes table parsed 0 rows.");
    }

    // Too many missing enrichments → fail hard
    if (missingTopPrizeNums.length / games.length > 0.5) {
      throw new Error(
        `CI assertion: ${missingTopPrizeNums.length}/${games.length} active games missing Top-Prizes fields: ${missingTopPrizeNums.join(", ")}`
      );
    }

    // Soft warnings (non-fatal)
    if (missingTopPrizeNums.length) {
      console.warn(`[guard] ${missingTopPrizeNums.length}/${games.length} games missing Top-Prizes fields: ${missingTopPrizeNums.join(", ")}`);
    }
    const identicalImgNums = games
      .filter(g => g.ticketImageUrl && g.oddsImageUrl && g.ticketImageUrl === g.oddsImageUrl)
      .map(g => g.gameNumber);
    if (identicalImgNums.length) {
      console.warn(`[guard] ${identicalImgNums.length} games have identical ticket/odds images: ${identicalImgNums.join(", ")}`);
    }

    // ---- Stable sort (price desc, adjustedOdds asc, overallOdds asc, gameNumber asc)
    const gamesSorted = games.slice().sort((a, b) => {
      const pA = a.price ?? -Infinity, pB = b.price ?? -Infinity;            // desc; undefined last
      if (pA !== pB) return pB - pA;

      const aaA = a.adjustedOdds ?? Infinity, aaB = b.adjustedOdds ?? Infinity; // asc; undefined last
      if (aaA !== aaB) return aaA - aaB;

      const boA = a.overallOdds ?? Infinity, boB = b.overallOdds ?? Infinity;   // asc; undefined last
      if (boA !== boB) return boA - boB;

      return a.gameNumber - b.gameNumber; // final tiebreaker
    });

    // (Optional) tiny debug summary to help future diffs
    await writeJson("_debug_summary.json", {
      updatedAt,
      counts: {
        active: gamesSorted.length,
        topPrizesRows: topPrizesMap.size,
        missingTopPrizes: missingTopPrizeNums.length
      },
      orderPreview: gamesSorted.slice(0, 5).map(g => ({
        gameNumber: g.gameNumber, price: g.price, adjustedOdds: g.adjustedOdds
      }))
    });

    // 5) Save active-only payload
    const payload = {
      updatedAt,
      count: gamesSorted.length,
      games: gamesSorted,
    };

    const latest = await writeJson("index.latest.json", payload);
    await writeJson("index.json", payload); // mirror for convenience

    console.log(`Wrote ${gamesSorted.length} active games → ${latest}`);
  } finally {
    await maybeStopTracing(context, "_debug_trace.zip");
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
