//scripts/scratchers/fetch_ga_scratchers.ts
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, BrowserContext } from "playwright";
import { ensureDir, maybeStartTracing, maybeStopTracing, openAndReady, withRetry } from "./_util";
import { fetchActiveEndedNumbers } from "./parse_lists";
import { fetchTopPrizes, type TopPrizeRow } from "./parse_top_prizes";
import mri from "mri";
import pLimit from "p-limit";
import {
  getStorage,
  ensureHashKey,
  loadManifest,
  saveManifest,
  setHostingOptions,
} from "./image_hosting";
 

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
  lifecycle?: 'new' | 'continuing'; // UI hint (derived from delta)
};

type ModalDetail = {
  gameNumber: number;
  name?: string;
  overallOdds?: number;
  startDate?: string;
  ticketImageUrl?: string;
  oddsImageUrl?: string;
};

function carryForward<T extends keyof ActiveGame>(
  current: ActiveGame[T] | undefined,
  prev: ActiveGame | undefined,
  key: T
): ActiveGame[T] | undefined {
  return current ?? prev?.[key];
}

function normalizeUrl(u?: string | null): string | undefined {
  if (!u) return undefined;
  try {
    // Keep querystring/versioning; just absolutize
    return new URL(u, "https://www.galottery.com").href;
  } catch {
    return undefined;
  }
}

function parseSrcset(ss?: string | null): Array<{ url: string; w: number }> {
  if (!ss) return [];
  return ss
    .split(",")
    .map(s => s.trim())
    .map(part => {
      const m = part.match(/(\S+)\s+(\d+)w/);
      return m ? { url: m[1], w: Number(m[2]) } : null;
    })
    .filter(Boolean) as Array<{ url: string; w: number }>;
}

function chooseBestImage(img: any): string | undefined {
  // Prefer currentSrc, then src, then largest srcset candidate
  const cs = (img as any).currentSrc as string | undefined;
  if (cs) return normalizeUrl(cs);
  if (img.getAttribute("src")) return normalizeUrl(img.getAttribute("src"));
  const ss = img.getAttribute("srcset");
  const cand = parseSrcset(ss).sort((a, b) => b.w - a.w)[0];
  return cand ? normalizeUrl(cand.url) : undefined;
}

function isOddsish(urlOrAlt: string, containerId?: string): boolean {
  const s = urlOrAlt.toLowerCase();
  if (containerId && /odds/.test(containerId)) return true;
  return /odds|overall[-_ ]?odds|prize[-_ ]?odds/.test(s) || /\/odds\.(jpg|jpeg|png)(\?|$)/.test(s);
}

function isTicketish(urlOrAlt: string): boolean {
  const s = urlOrAlt.toLowerCase();
  return /ticket|game[-_ ]?art|pack[-_ ]?shot|hero|key[-_ ]?art/.test(s) || /\/ticket\.(png|jpg|jpeg)(\?|$)/.test(s);
}

function urlWidthHeuristic(url?: string): number {
  if (!url) return 0;
  // crude width hint from filename: ...-600x900.jpg → 600
  const m = url.match(/[-_](\d{3,4})x(\d{3,4})\./);
  return m ? Number(m[1]) : 0;
}

async function writeJson(basename: string, data: unknown) {
  await ensureDir(OUT_DIR);
  const fp = path.join(OUT_DIR, basename);
  await fs.writeFile(fp, JSON.stringify(data, null, 2), "utf8");
  return fp;
}

async function readPrevIndex(): Promise<null | { updatedAt: string; count: number; games: ActiveGame[] }> {
  try {
    const fp = path.join(OUT_DIR, "index.latest.json");
    const txt = await fs.readFile(fp, "utf8");
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

// Lightweight collector: just return the game IDs visible in the Active grid
async function collectActiveIds(context: BrowserContext): Promise<number[]> {
  const page = await context.newPage();
  const z = (ms: number) => new Promise(r => setTimeout(r, ms));
  try {
    await openAndReady(page, ACTIVE_URL, { loadMore: true });

    const MAX_PASSES = 40;
    let last = -1, stable = 0;

    await page.waitForSelector("#instantsGrid", { timeout: 15000 }).catch(() => {});
    await page.waitForSelector('.catalog-item[data-game-id]', { timeout: 15000 }).catch(() => {});

    for (let p = 0; p < MAX_PASSES; p++) {
      await page.evaluate(() => {
        const el = document.scrollingElement || document.documentElement;
        el.scrollTop = el.scrollHeight;
        window.dispatchEvent(new Event("scroll"));
        window.dispatchEvent(new Event("resize"));
      }).catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 2000 }).catch(() => {});
      await z(900);

      const loading = await page.$("#instantsGrid.loading").catch(() => null);
      if (loading) await z(600);

      const count = await page.$$eval('.catalog-item[data-game-id]', els => els.length).catch(() => 0);
      if (count > 0 && count === last) {
        if (++stable >= 2) break;
      } else {
        stable = 0;
      }
      last = count;
    }

    const ids = await page.$$eval('.catalog-item[data-game-id]', els =>
      Array.from(new Set(
        els.map(el => Number((el as HTMLElement).getAttribute("data-game-id")))
           .filter(n => Number.isFinite(n))
      ))
    ).catch(() => []);
    return ids;
  } finally {
    await page.close().catch(() => {});
  }
}

async function scrapeActiveModalDetails(
  context: BrowserContext,
  onlyIds?: number[]
): Promise<Map<number, ModalDetail>> {
  const page = await context.newPage();

  // Small helper: sleep
  const z = (ms: number) => new Promise(r => setTimeout(r, ms));

  // Ensure the grid fully loads (infinite Masonry-ish) — WINDOW scroll, not grid scroll
  async function ensureGridFullyLoaded(): Promise<number[]> {
    const MAX_PASSES = 40;           // generous; GA can be slow
    const SETTLE_DELAY = 900;
    const NET_IDLE_MS = 2000;

    // Wait for first tiles
    await page.waitForSelector('#instantsGrid', { timeout: 15000 }).catch(() => {});
    await page.waitForSelector('.catalog-item[data-game-id]', { timeout: 15000 }).catch(() => {});

    let lastCount = -1;
    let stable = 0;

    for (let pass = 0; pass < MAX_PASSES; pass++) {
      // Drive lazy-loaders: scroll near bottom a few times; also fire resize to tick Masonry
      await page.evaluate(async () => {
        const el = document.scrollingElement || document.documentElement;
        el.scrollTop = el.scrollHeight;              // to bottom
        window.dispatchEvent(new Event('scroll'));
        window.dispatchEvent(new Event('resize'));
      }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: NET_IDLE_MS }).catch(() => {});
      await page.waitForTimeout(SETTLE_DELAY);

      // If grid advertises a "loading" class, give it a beat
      const loading = await page.$('#instantsGrid.loading').catch(() => null);
      if (loading) await page.waitForTimeout(600);

      // Recount tiles
      const countNow = await page.$$eval('.catalog-item[data-game-id]', els => els.length).catch(() => 0);

      if (countNow > 0 && countNow === lastCount) {
        stable++;
        if (stable >= 2) break; // two consecutive stable counts = done
      } else {
        stable = 0;
      }
      lastCount = countNow;
    }

    // Return unique numeric ids in DOM order
    const ids = await page.$$eval('.catalog-item[data-game-id]', els =>
      Array.from(new Set(
        els.map(el => Number((el as HTMLElement).getAttribute('data-game-id')))
          .filter(n => Number.isFinite(n))
      ))
    ).catch(() => []);
    return ids;
  }

  // Open a tile’s modal by game id; be resilient to different clickable elements
  async function openModalFor(gameId: number): Promise<boolean> {
  const tileSel = `.catalog-item[data-game-id="${gameId}"]`;
  const tile = await page.$(tileSel).catch(() => null);
  if (!tile) return false;

  try { await tile.scrollIntoViewIfNeeded(); } catch {}

  const infoBtn = await tile.$('.sprite-info.more-info, a.more-info').catch(() => null);
  const mainLink = await tile.$('a[title], a[href="#"]').catch(() => null);

  const tryOpen = async (el: any) => {
    try { await el.click({ timeout: 1200 }); } catch { try { await el.press?.('Enter'); } catch {} }
  };

  await (infoBtn ? tryOpen(infoBtn) : mainLink ? tryOpen(mainLink) : tryOpen(tile));

  const modalRootSel = [
    '#scratchersModalBody .modal-scratchers-content',
    '#scratchersModal .modal-scratchers-content',
    '.modal-scratchers-content'
  ].join(', ');

  try {
    await page.waitForSelector(modalRootSel, { timeout: 10000 });
    return true;
  } catch {
    // one fallback attempt: click the other candidate
    if (infoBtn && mainLink) {
      await tryOpen(mainLink);
      try { await page.waitForSelector(modalRootSel, { timeout: 5000 }); return true; } catch {}
    }
    return false;
  }
}

async function closeModal(): Promise<void> {
  try {
    const closeBtn = await page.$('#scratchersModal [data-dismiss="modal"]').catch(() => null);
    if (closeBtn) { try { await closeBtn.click({ timeout: 600 }); } catch {} }
    await page.keyboard.press('Escape').catch(() => {});
    // Wait until modal is hidden and the body class is cleared
    await page.waitForSelector('#scratchersModal', { state: 'hidden', timeout: 3000 }).catch(() => {});
    await page.waitForFunction(() => !document.body.classList.contains('modal-open'), null, { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(80);
  } catch {}
}

  // Make sure odds image is rendered (expand the collapse)
  async function expandOddsPanel(): Promise<void> {
    // Some themes require an "Odds" tab first
    for (const s of [
      'a[href="#oddsPanel"]',
      '[aria-controls="oddsPanel"]',
      'button:has-text("Odds")',
      'a:has-text("Odds")',
      'button[role="tab"]:has-text("Odds")'
    ]) {
      const el = await page.$(s).catch(() => null);
      if (el) { try { await el.click({ timeout: 800 }); } catch {} }
    }
    // Explicitly toggle the Bootstrap collapse
    const collapseLink = await page.$('a[data-toggle="collapse"][href="#oddsPanel"]').catch(() => null);
    if (collapseLink) { try { await collapseLink.click({ timeout: 800 }); } catch {} }
    // Wait for the image inside the panel to appear/resolve
    await page.waitForSelector('#oddsPanel', { timeout: 3000 }).catch(() => {});
    await page.waitForSelector('#oddsPanel img', { timeout: 3500 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 1500 }).catch(() => {});
    await z(120);
  }

  // Harvest modal details
  async function readModal(): Promise<ModalDetail | null> {
    const modalRootSel = [
      '#scratchersModalBody .modal-scratchers-content',
      '#scratchersModal .modal-scratchers-content',
      '.modal-scratchers-content'
    ].join(', ');

     const info = await page.evaluate((rootSel) => {
      const abs = (u?: string | null) => (u ? new URL(u, location.origin).href : undefined);
      const root = document.querySelector(rootSel) as HTMLElement | null;
      const body = document.querySelector('#scratchersModalBody') as HTMLElement | null;
      if (!root || !body) return null;

      const text = ((body.textContent || "") + " " + (root.textContent || "")).replace(/\s+/g, " ");

      const name =
        (root.querySelector("h2.game-name")?.textContent ||
         root.querySelector(".game-name")?.textContent ||
         root.querySelector(".modal-scratchers-header h2")?.textContent ||
         root.querySelector("h1, h2, h3")?.textContent ||
         "").trim();

      // Ticket image is a sibling container under #scratchersModalBody (NOT inside .modal-scratchers-content)
      let ticketImageUrl: string | undefined;
      const ticketImg = body.querySelector<HTMLImageElement>(".modal-scratchers-image img");
      if (ticketImg) ticketImageUrl = abs(((ticketImg as any).currentSrc) || ticketImg.getAttribute("src"));

      // Odds image exists only after collapse is opened
      let oddsImageUrl: string | undefined;
      const oddsImg = root.querySelector<HTMLImageElement>("#oddsPanel img");
      if (oddsImg) oddsImageUrl = abs((oddsImg as any).currentSrc || oddsImg.getAttribute("src"));

      // Game number
      let gameNumber: number | undefined;
      {
        const m = text.match(/Game\s*(?:Number|#)\s*[:#]?\s*(\d{3,5})/i);
        if (m) gameNumber = Number(m[1]);
      }

      // Overall odds & start date
      const overallMatch = text.match(/overall\s*odds\s*(?:of)?\s*1\s*in\s*([\d.]+)/i) || text.match(/1\s*in\s*([\d.]+)/i);
      const overallOdds = overallMatch ? Number(overallMatch[1]) : undefined;

      const startDateMatch = text.match(/(?:Start|Launch)\s*Date\s*[:\-]?\s*([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Za-z]{3,9}\s+\d{4})/i);
      const startDate = startDateMatch ? startDateMatch[1] : undefined;

      return { gameNumber, name, overallOdds, startDate, ticketImageUrl, oddsImageUrl };
    }, modalRootSel);

    if (!info || !Number.isFinite(info.gameNumber)) return null;

    return {
      gameNumber: info.gameNumber!,
      name: info.name || undefined,
      overallOdds: info.overallOdds,
      startDate: info.startDate,
      ticketImageUrl: normalizeUrl(info.ticketImageUrl),
      oddsImageUrl: normalizeUrl(info.oddsImageUrl),
    };
  }

  try {
    await openAndReady(page, ACTIVE_URL, { loadMore: true });

    // 1) Pull *all* game ids present in the grid
    const ids = await ensureGridFullyLoaded();
    const gate = new Set<number>(onlyIds ?? []);
    const walkIds = onlyIds && onlyIds.length ? ids.filter(id => gate.has(id)) : ids;

    const byNum = new Map<number, ModalDetail>();

    // 2) Walk ids (scoped to onlyIds if provided): open modal, expand odds, read, close
    for (let i = 0; i < walkIds.length; i++) {
      const id = walkIds[i];
      try {
        const opened = await openModalFor(id);
        if (!opened) continue;

        await expandOddsPanel();
        let det = await readModal();
        // If we failed to see odds img or overall odds on the first try, poke the panel again once
        if (!det || (!det.oddsImageUrl && !det.overallOdds)) {
          await expandOddsPanel();
          det = await readModal();
        }
        if (det) byNum.set(det.gameNumber, det);
      } catch {
        // ignore this tile, best-effort
      } finally {
        await closeModal();
      }

      // Gentle pacing to avoid throttling
      if ((i + 1) % 10 === 0) {
        await page.waitForLoadState('networkidle', { timeout: 1500 }).catch(() => {});
        await z(150);
      }
    }

    // Debug preview
    const sample = Array.from(byNum.values()).slice(0, 10);
    await writeJson("_debug_active.details.json", { count: byNum.size, sample });

    return byNum;
  } finally {
    await page.close().catch(() => {});
  }
}

async function scrapeGamePagesForImages(
  context: BrowserContext,
  neededNums: number[]
): Promise<Map<number, Pick<ModalDetail, "ticketImageUrl" | "oddsImageUrl">>> {
  const map = new Map<number, Pick<ModalDetail, "ticketImageUrl" | "oddsImageUrl">>();
  if (!neededNums.length) return map;

  // Reuse list page to collect per-game links
  const page = await context.newPage();
  try {
    await openAndReady(page, ACTIVE_URL, { loadMore: true });

    // We already have waitForNumericGameLinks in _util.ts
    // It should return an array like [{num, url}, ...]
    const links = await withRetry(() => (global as any).waitForNumericGameLinks?.(page, "active", { minCount: 12 }) ?? [], {
      label: "links (active)",
      attempts: 2,
    }).catch(() => []);

    // Build a lookup
    const urlByNum = new Map<number, string>();
    for (const l of links as Array<{ num: number; url: string }>) {
      urlByNum.set(Number(l.num), l.url);
    }

    // Visit only those we still need
    for (const num of neededNums) {
      const url = urlByNum.get(num);
      if (!url) continue;

      const gp = await context.newPage();
      try {
        await openAndReady(gp, url, { loadMore: false });

        // Click ODDS tab on the full game page as well
        for (const s of ['a[href="#oddsPanel"]', '[aria-controls="oddsPanel"]', 'button:has-text("Odds")', 'a:has-text("Odds")']) {
          const el = await gp.$(s).catch(() => null);
          if (el) { try { await el.click({ timeout: 1000 }); } catch {} }
        }
        await gp.waitForTimeout(300);
        await gp.waitForLoadState('networkidle', { timeout: 1500 }).catch(() => {});

        const res = await gp.evaluate(() => {
          const root = document.querySelector('.game-detail, .scratchers-content, main, body') as HTMLElement | null;
          if (!root) return null;

          const cands: Array<{ url?: string; alt: string; oddsish: boolean; ticketish: boolean; wHint: number }> = [];

          const pickUrlFromImg = (img: HTMLImageElement): string | undefined => {
            const cur = (img as any).currentSrc || img.getAttribute('src') || "";
            if (cur) return new URL(cur, location.origin).href;
            const ss = img.getAttribute('srcset');
            if (ss) {
              const parts = ss.split(',').map(s => s.trim());
              const best = parts.map(p => {
                const m = p.match(/(\S+)\s+(\d+)w/);
                return m ? { url: m[1], w: Number(m[2]) } : null;
              }).filter(Boolean).sort((a,b) => (b!.w - a!.w))[0] as any;
              if (best) return new URL(best.url, location.origin).href;
            }
            return undefined;
          };

          root.querySelectorAll('img, picture img').forEach((img) => {
            const url = pickUrlFromImg(img as HTMLImageElement);
            const alt = ((img.getAttribute('alt') || '').trim());
            const oddsish = !!url && (/\/odds\./i.test(url) || /odds/i.test(alt) || /odds/i.test((img.closest('#oddsPanel, [id*="odds"]') as HTMLElement | null)?.id || ''));
            const ticketish = !!url && (/\/ticket\./i.test(url) || /ticket|hero|art/i.test(alt));
            const wHint = (() => {
              if (!url) return 0;
              const m = url.match(/[-_](\d{3,4})x(\d{3,4})\./);
              return m ? Number(m[1]) : 0;
            })();
            cands.push({ url, alt, oddsish, ticketish, wHint });
          });

          root.querySelectorAll<HTMLElement>('[style*="background-image"]').forEach(el => {
            const s = (el.getAttribute("style") || "");
            const m = s.match(/background-image:\s*url\(["']?([^"')]+)["']?\)/i);
            if (m) {
              const url = new URL(m[1], location.origin).href;
              const isOdds = /odds/i.test(el.id) || /odds/i.test(url);
              cands.push({ url, alt: "", oddsish: isOdds, ticketish: !isOdds, wHint: 0 });
            }
          });

          const odds = cands.filter(c => c.url && c.oddsish).sort((a,b) => b.wHint - a.wHint)[0];
          let ticket = cands.filter(c => c.url && !c.oddsish).sort((a,b) => b.wHint - a.wHint)[0];
          if (ticket && odds && ticket.url === odds.url) {
            const next = cands.filter(c => c.url && !c.oddsish && c.url !== odds.url).sort((a,b) => b.wHint - a.wHint)[0];
            if (next) ticket = next;
          }

          return {
            ticketImageUrl: ticket?.url,
            oddsImageUrl: odds?.url
          };
        });

        if (res && (res.ticketImageUrl || res.oddsImageUrl)) {
          map.set(num, {
            ticketImageUrl: normalizeUrl(res.ticketImageUrl),
            oddsImageUrl: normalizeUrl(res.oddsImageUrl),
          });
        }
      } finally {
        await gp.close().catch(() => {});
      }
    }

    return map;
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
  // ---------------- CLI flags ----------------
  const argv = mri(process.argv.slice(2), {
    boolean: ["rehost-all", "only-missing", "dry-run"],
    default: { "only-missing": true, "dry-run": false },
    alias: { c: "concurrency" },
  });
  const concurrency = Math.max(1, Number(argv.concurrency ?? 4));
  setHostingOptions({
    rehostAll: !!argv["rehost-all"],
    onlyMissing: !!argv["only-missing"],
    dryRun: !!argv["dry-run"],
  });
  const storage = getStorage();
  const limit = pLimit(concurrency);
  await loadManifest().then(m => console.log(`[manifest] loaded ${Object.keys(m).length} entries`));

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext();

  await maybeStartTracing(context);

  try {

    const prev = await readPrevIndex();
    const prevMap = new Map<number, ActiveGame>(prev ? prev.games.map(g => [g.gameNumber, g]) : []);

    // 1) Authoritative "active today" set from grid
    const activeIdsFromGrid = await collectActiveIds(context);

    // 2) Secondary sources
    const { activeNums: activeFromList } = await fetchActiveEndedNumbers(context);
    const topPrizesMap = await fetchTopPrizes(context);
    const activeFromTopPrizes = Array.from(topPrizesMap.keys());

    // Union for resilience when a source under-loads
    const activeNumsUnion = Array.from(new Set([...activeFromList, ...activeFromTopPrizes])).sort((a,b)=>a-b);

    // 3) Delta vs previous file (restricted to grid = truth)
    const activeNow = new Set<number>(activeIdsFromGrid);
    const prevSet = new Set<number>(prev ? prev.games.map(g => g.gameNumber) : []);
    const newNums = activeIdsFromGrid.filter(n => !prevSet.has(n));
    const continuingNums = activeIdsFromGrid.filter(n => prevSet.has(n));
    const endedNums = prev ? prev.games.map(g => g.gameNumber).filter(n => !activeNow.has(n)) : [];
    const newSet = new Set<number>(newNums);
    const contSet = new Set<number>(continuingNums);

    await writeJson("_debug_delta.json", {
      new: newNums,
      continuing: continuingNums,
      ended: endedNums,
      counts: {
        grid: activeIdsFromGrid.length,
        union: activeNumsUnion.length
      }
    });
    console.log(`[delta] new=${newNums.length}, continuing=${continuingNums.length}, ended=${endedNums.length}`);

    // 4) Source coverage snapshot (include grid count)
    await writeJson("_debug_active.sources.json", {
      fromGrid:       { count: activeIdsFromGrid.length },
      fromActiveList: { count: activeFromList.length },
      fromTopPrizes:  { count: activeFromTopPrizes.length },
      union:          { count: activeNumsUnion.length }
    });

    // 5) Scrape only NEW games' modals (faster weekly run). Carry-forward will fill the rest.
    const detailsByNum = await withRetry(
      () => scrapeActiveModalDetails(context, newNums /* omit to scrape ALL */),
      { label: "modal details", attempts: 2 }
    );

    // Sparse-modals guard: for incremental runs compare against newNums; fall back to grid on cold start
    const denom = Math.max((newNums.length || activeIdsFromGrid.length), 1);
    if (detailsByNum.size / denom < 0.5) {
      console.warn(`[guard] modal details sparse: ${detailsByNum.size}/${denom} (modals/target)`);
    }

    // 4) Compose
    const updatedAt = pickUpdatedAt(topPrizesMap);

      // Index (published) set = grid ∩ union
    const indexNowSet = new Set<number>(activeNumsUnion.filter(n => activeNow.has(n)));
    const newOnIndex = newNums.filter(n => indexNowSet.has(n));
    const continuingOnIndex = continuingNums.filter(n => indexNowSet.has(n));

    const games: ActiveGame[] = activeNumsUnion
      .filter(n => activeNow.has(n)) // only keep currently active ones
      .map((num) => {
        const row = topPrizesMap.get(num);
        const det = detailsByNum.get(num);
        const prevG = prevMap.get(num);

        const nameRaw =
          (det?.name && det.name.trim()) ||
          (row?.gameName && row.gameName.trim()) ||
          prevG?.name ||
          `Game #${num}`;
        const name = nameRaw.toUpperCase();

        const overall = det?.overallOdds ?? prevG?.overallOdds;
        const orig = row?.originalTopPrizes;
        const rem  = row?.topPrizesRemaining;

        let adjusted: number | undefined = undefined;
        if (overall && orig && orig > 0 && typeof rem === "number") {
          const ratio = rem / orig;
          adjusted = overall / Math.max(ratio, 0.01);
        } else if (overall) {
          adjusted = overall;
        }

        const topPrizeValue: number | undefined = (row as any)?.topPrizeValue ?? undefined;

        return {
          gameNumber: num,
          name,
          price: row?.price ?? prevG?.price,
          topPrizeValue,
          topPrizesOriginal: row?.originalTopPrizes ?? prevG?.topPrizesOriginal,
          topPrizesRemaining: row?.topPrizesRemaining ?? prevG?.topPrizesRemaining,
          overallOdds: overall,
          adjustedOdds: adjusted,
          startDate: det?.startDate ?? prevG?.startDate,
          oddsImageUrl: det?.oddsImageUrl ?? prevG?.oddsImageUrl,
          ticketImageUrl: det?.ticketImageUrl ?? prevG?.ticketImageUrl,
          updatedAt,
          lifecycle: newOnIndex.includes(num) ? 'new'
                    : continuingOnIndex.includes(num) ? 'continuing'
                    : undefined,
        };
      });

    // --- Fallback image pass: visit full game pages for missing images ---
    const missingForFallback = games
      .filter(g => !g.ticketImageUrl || !g.oddsImageUrl)
      .map(g => g.gameNumber);

    if (missingForFallback.length) {
      const fallbackImgs = await withRetry(
        () => scrapeGamePagesForImages(context, missingForFallback),
        { label: "fallback game pages (images)", attempts: 2 }
      );

      if (fallbackImgs.size) {
        for (const g of games) {
          const fb = fallbackImgs.get(g.gameNumber);
          if (!fb) continue;
          if (!g.ticketImageUrl && fb.ticketImageUrl) g.ticketImageUrl = fb.ticketImageUrl;
          if (!g.oddsImageUrl && fb.oddsImageUrl) g.oddsImageUrl = fb.oddsImageUrl;
        }
      }
    }

    // --- Coverage debug ---
    const withTicket = games.filter(g => !!g.ticketImageUrl).length;
    const withOdds   = games.filter(g => !!g.oddsImageUrl).length;
    const needAny    = games.filter(g => !g.ticketImageUrl || !g.oddsImageUrl).slice(0, 20).map(g => g.gameNumber);

    await writeJson("_debug_images.summary.json", {
      counts: {
        totalActive: games.length,
        withTicket,
        withOdds,
      },
      coveragePct: {
        ticket: Math.round((withTicket / games.length) * 100),
        odds:   Math.round((withOdds   / games.length) * 100),
      },
      previewMissingAny: needAny,
    });

    console.log(
      `[images] ticket=${withTicket}/${games.length} (${Math.round((withTicket/games.length)*100)}%), `
      + `odds=${withOdds}/${games.length} (${Math.round((withOdds/games.length)*100)}%)`
    );

    // --- Rehost images to R2 / FS dev ---
    const hostJobs: Array<Promise<void>> = [];
    for (const g of games) {
      // dedupe: if both URLs are identical, run once and reuse
      const pairs: Array<["ticketImageUrl"|"oddsImageUrl", "ticket"|"odds"]> = [
        ["ticketImageUrl", "ticket"],
        ["oddsImageUrl", "odds"],
      ];

      // capture original values
      const originals: Record<string, string | undefined> = {
        ticket: g.ticketImageUrl,
        odds: g.oddsImageUrl,
      };

      const already: Record<string, { key: string; url: string } | undefined> = {};

      for (const [field, kind] of pairs) {
        const src = g[field];
        if (!src) continue;
        if (originals.ticket && originals.odds && originals.ticket === originals.odds) {
          // same source URL: ensure we submit only one hosting job and reuse
          if (already["ticket"]) {
            g[field] = already["ticket"]!.url;
            continue;
          }
        }
        hostJobs.push(limit(async () => {
          try {
            const hosted = await ensureHashKey({
              gameNumber: g.gameNumber,
              kind,
              sourceUrl: src!,
              storage,
              dryRun: !!argv["dry-run"],
            });
            // Replace on object
            g[field] = hosted.url; // NOTE: final URL is storage.publicUrlFor(key)
            already[kind] = { key: hosted.key, url: hosted.url };
            // If same source url, mirror to the other field
            if (originals.ticket && originals.odds && originals.ticket === originals.odds) {
              g["ticketImageUrl"] = hosted.url;
              g["oddsImageUrl"] = hosted.url;
            }
          } catch (err) {
            console.warn(`[rehost] game ${g.gameNumber} (${kind}) failed: ${(err as Error).message}`);
            // leave original URL in place
          }
        }));
      }
    }
    await Promise.all(hostJobs);
    await saveManifest();

    // 5) Guardrails
    const missingTopPrizeNums = games
      .filter(g => g.price == null || g.topPrizesOriginal == null || g.topPrizesRemaining == null)
      .map(g => g.gameNumber);

    if (games.length === 0) throw new Error("CI assertion: No active games were returned.");
    if (topPrizesMap.size === 0) throw new Error("CI assertion: Top Prizes table parsed 0 rows.");

    if (missingTopPrizeNums.length / games.length > 0.5) {
      throw new Error(
        `CI assertion: ${missingTopPrizeNums.length}/${games.length} active games missing Top-Prizes fields: ${missingTopPrizeNums.join(", ")}`
      );
    }

    if (missingTopPrizeNums.length) {
      console.warn(`[guard] ${missingTopPrizeNums.length}/${games.length} games missing Top-Prizes fields: ${missingTopPrizeNums.join(", ")}`);
    }
    const identicalImgNums = games
      .filter(g => g.ticketImageUrl && g.oddsImageUrl && g.ticketImageUrl === g.oddsImageUrl)
      .map(g => g.gameNumber);
    if (identicalImgNums.length) {
      console.warn(`[guard] ${identicalImgNums.length} games have identical ticket/odds images: ${identicalImgNums.join(", ")}`);
    }

    // 6) Stable sort
    const gamesSorted = games.slice().sort((a, b) => {
      const pA = a.price ?? -Infinity, pB = b.price ?? -Infinity;              // desc
      if (pA !== pB) return pB - pA;
      const aaA = a.adjustedOdds ?? Infinity, aaB = b.adjustedOdds ?? Infinity; // asc
      if (aaA !== aaB) return aaA - aaB;
      const boA = a.overallOdds ?? Infinity, boB = b.overallOdds ?? Infinity;   // asc
      if (boA !== boB) return boA - boB;
      return a.gameNumber - b.gameNumber;                                       // asc
    });

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

    // 7) Persist
    const payload = {
      updatedAt,
      count: gamesSorted.length,
      deltaGrid: {
        new: newNums,
        continuing: continuingNums,
        ended: endedNums,
        counts: { grid: activeIdsFromGrid.length, union: activeNumsUnion.length }
      },
      deltaIndex: {
        new: newOnIndex,
        continuing: continuingOnIndex,
        ended: [], // ended items never appear in the published index
        counts: { index: gamesSorted.length }
      },
      games: gamesSorted
    };
    const latest = await writeJson("index.latest.json", payload);
    await writeJson("index.json", payload);

    console.log(`Wrote ${gamesSorted.length} active games → ${latest}`);
  } finally {
    await maybeStopTracing(context, "_debug_trace.zip");
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    // Persist manifest even on failures already handled above
    try { await saveManifest(); } catch {}
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
