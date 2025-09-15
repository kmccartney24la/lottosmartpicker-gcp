// scripts/scratchers/fetch_ga_scratchers.ts
import fs from "node:fs/promises";
import path from "node:path";
import mri from "mri";
import os from "node:os";
import pLimit from "p-limit";
import { chromium, BrowserContext } from "playwright";

import { ensureDir, maybeStartTracing, maybeStopTracing, openAndReady, withRetry } from "./_util";
import { fetchActiveEndedNumbers } from "./parse_lists";
import { fetchTopPrizes, type TopPrizeRow } from "./parse_top_prizes";

import {
  getStorage,
  ensureHashKey,
  loadManifest,
  saveManifest,
  setHostingOptions,
} from "./image_hosting";

const OUT_DIR = "public/data/ga_scratchers";
const ACTIVE_URL = "https://www.galottery.com/en-us/games/scratchers/active-games.html";
// Capture only GA-hosted DAM assets for scratchers ticket/odds.
const DAM_CAPTURE_RE = /\/content\/dam\/.*scratchers?-games\/.*(?:ticket|odds)\.(?:png|jpe?g)(?:\?.*)?$/i;
const GAMEPAGE_NET_DUMP = "_debug_network_images_gamepages.json";

// -----------------------------
// Types
// -----------------------------
export type ActiveGame = {
  gameNumber: number;       // primary key
  name: string;
  price: number | undefined;
  topPrizeValue: number | undefined;
  topPrizesOriginal: number | undefined;
  topPrizesRemaining: number | undefined;
  overallOdds: number | undefined;
  adjustedOdds: number | undefined;
  startDate?: string;
  oddsImageUrl?: string;
  ticketImageUrl?: string;
  updatedAt: string;
  lifecycle?: 'new' | 'continuing';
};

type ModalDetail = {
  gameNumber: number;
  name?: string;
  overallOdds?: number;
  startDate?: string;
  ticketImageUrl?: string;
  oddsImageUrl?: string;
};

type NetHit = { url: string; status: number; ct?: string };
type NetHitMap = Record<number, {
  ticketCandidates: NetHit[];
  oddsCandidates: NetHit[];
}>;

// keep last modal network counts so we can fold into summary
let __lastModalNetHits: NetHitMap | null = null;
const DEBUG_MODAL_LIMIT = 10; // dump HTML/screens for first N modals

// -----------------------------
// Small helpers
// -----------------------------
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

function normalizeUrl(u?: string | null): string | undefined {
  if (!u) return undefined;
  try {
    return new URL(u, "https://www.galottery.com").href;
  } catch {
    return undefined;
  }
}

function isGAHost(u?: string): boolean {
  if (!u) return false;
  try {
    const h = new URL(u).hostname.toLowerCase();
    return h === "www.galottery.com" || h.endsWith(".galottery.com");
  } catch { return false; }
}

function preferGA(primary?: string, fallback?: string): string | undefined {
  if (isGAHost(primary)) return primary!;
  if (isGAHost(fallback)) return fallback!;
  return undefined; // refuse localhost/CDN sources as upstream
}

function filenameWeight(u: string, kind: "ticket"|"odds", num?: number): number {
  let w = 0;
  const p = u.toLowerCase();
  if (/\/scratchers?-games\//.test(p)) w += 10;
  if (typeof num === "number" && new RegExp(`/scratchers?-games/[^/]*${num}`).test(p)) w += 6;
  if (new RegExp(`/${kind}\\.(?:png|jpe?g)$`).test(p)) w += 8;
  if (/-\d{3,4}x\d{3,4}\./.test(p)) w += 2; // width hint
  if (/\/content\/dam\//.test(p)) w += 4;
  return w;
}

function pickUpdatedAt(map: Map<number, TopPrizeRow>): string {
  for (const row of map.values()) if (row.lastUpdated) return row.lastUpdated;
  return new Date().toISOString();
}

// -----------------------------
// Scrapers (as you had them; minor tidy only)
// -----------------------------
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

async function waitForBootstrapShown(page, modalSel: string) {
  // Bridge a "shown.bs.modal" to a Promise (if Bootstrap present)
  await page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return;
    (window as any).__lot_bs_modal_shown__ = false;
    try {
      // @ts-ignore
      root.addEventListener('shown.bs.modal', () => { (window as any).__lot_bs_modal_shown__ = true; }, { once: true });
    } catch {}
  }, modalSel).catch(() => {});
  await page.waitForFunction(() => (window as any).__lot_bs_modal_shown__ === true, null, { timeout: 2000 }).catch(() => {});
}

async function waitForCollapseShown(page, collapseSel: string) {
  await page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return;
    (window as any).__lot_bs_collapse_shown__ = false;
    try {
      // @ts-ignore
      root.addEventListener('shown.bs.collapse', () => { (window as any).__lot_bs_collapse_shown__ = true; }, { once: true });
    } catch {}
  }, collapseSel).catch(() => {});
  await page.waitForFunction(() => (window as any).__lot_bs_collapse_shown__ === true, null, { timeout: 1200 }).catch(() => {});
}

function absUrl(u?: string | null): string | undefined {
  if (!u) return undefined;
  try { return new URL(u, "https://www.galottery.com").href; } catch { return undefined; }
}

async function scrapeActiveModalDetails(
  context: BrowserContext,
  onlyIds?: number[]
): Promise<Map<number, ModalDetail>> {
  const page = await context.newPage();
  const z = (ms: number) => new Promise(r => setTimeout(r, ms));

  // per-run network capture (modal scope)
  const netHits: NetHitMap = {};

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
      // Wait for Bootstrap "shown" if available
      await waitForBootstrapShown(page, '#scratchersModal');
      return true;
    } catch {
      if (infoBtn && mainLink) {
        await tryOpen(mainLink);
        try {
          await page.waitForSelector(modalRootSel, { timeout: 5000 });
          await waitForBootstrapShown(page, '#scratchersModal');
          return true;
        } catch {}
      }
      return false;
    }
  }

  async function closeModal(): Promise<void> {
    try {
      const closeBtn = await page.$('#scratchersModal [data-dismiss="modal"]').catch(() => null);
      if (closeBtn) { try { await closeBtn.click({ timeout: 600 }); } catch {} }
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForSelector('#scratchersModal', { state: 'hidden', timeout: 3000 }).catch(() => {});
      await page.waitForFunction(() => !document.body.classList.contains('modal-open'), null, { timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(80);
    } catch {}
  }

  async function expandOddsPanel(): Promise<void> {
    // click odds toggles
    for (const s of [
      'a[href="#oddsPanel"]','[aria-controls="oddsPanel"]',
      'button:has-text("Odds")','a:has-text("Odds")','button[role="tab"]:has-text("Odds")'
    ]) {
      const el = await page.$(s).catch(() => null);
      if (el) { try { await el.click({ timeout: 800 }); } catch {} }
    }
    const collapseLink = await page.$('a[data-toggle="collapse"][href="#oddsPanel"]').catch(() => null);
    if (collapseLink) { try { await collapseLink.click({ timeout: 800 }); } catch {} }

    await waitForCollapseShown(page, '#oddsPanel').catch(() => {});

    // Scroll inside modal so any lazy images load
    await page.evaluate(() => {
      const body = document.querySelector('#scratchersModalBody') as HTMLElement | null;
      if (body) body.scrollTop = body.scrollHeight;
      window.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('resize'));
    }).catch(() => {});
    await page.waitForSelector('#oddsPanel', { timeout: 3000 }).catch(() => {});
    // poll for odds image pixels to be present (handles data-src/srcset)
    await page.waitForFunction(() => {
      const imgs = Array.from(document.querySelectorAll('#oddsPanel img')) as HTMLImageElement[];
      return imgs.some(img => img.complete && img.naturalWidth > 20);
    }, null, { timeout: 5000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 1500 }).catch(() => {});
    await page.waitForTimeout(120);
  }

  try {
    await openAndReady(page, ACTIVE_URL, { loadMore: true });

    // Ensure the infinite grid is fully loaded (avoid under-counting)
    await page.waitForSelector("#instantsGrid", { timeout: 15000 }).catch(() => {});
    await page.waitForSelector('.catalog-item[data-game-id]', { timeout: 15000 }).catch(() => {});
    {
      const MAX_PASSES = 40;
      let last = -1, stable = 0;
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
        if (count > 0 && count === last) { if (++stable >= 2) break; } else { stable = 0; }
        last = count;
      }
    }
    const ids = await page.$$eval('.catalog-item[data-game-id]', els =>
      Array.from(new Set(
        els.map(el => Number((el as HTMLElement).getAttribute('data-game-id')))
          .filter(n => Number.isFinite(n))
      ))
    ).catch(() => []);

    const gate = new Set<number>(onlyIds ?? []);
    const walkIds = onlyIds && onlyIds.length ? ids.filter(id => gate.has(id)) : ids;

    const byNum = new Map<number, ModalDetail>();

    // one listener for modal response capture (authoritative if DOM misses)
    page.on('response', async (resp) => {
      try {
        const url = resp.url();
        if (!DAM_CAPTURE_RE.test(url)) return;
        const status = resp.status();
        const ct = resp.headers()['content-type'];
        // infer current game number from heading or aria
        const num = await page.evaluate(() => {
          const tryText = (sel: string) => document.querySelector(sel)?.textContent || "";
          const t = (tryText('#scratchersModal .game-number') || tryText('.modal-scratchers-header') || "").replace(/\s+/g,' ');
          const m = t.match(/(\d{3,5})/);
          return m ? Number(m[1]) : undefined;
        }).catch(() => undefined);
        if (!num) return;
        if (!netHits[num]) netHits[num] = { ticketCandidates: [], oddsCandidates: [] };
        const bucket = /\/odds\.(?:png|jpe?g)/i.test(url) ? 'oddsCandidates' : 'ticketCandidates';
        netHits[num][bucket].push({ url, status, ct });
      } catch {}
    });

    for (let i = 0; i < walkIds.length; i++) {
      const id = walkIds[i];
      try {
        const opened = await openModalFor(id);
        if (!opened) continue;

        await expandOddsPanel();
        // Ensure images are actually loaded (not placeholders)
        await page.evaluate(() => {
          // try to trigger lazy loaders in-view
          const body = document.querySelector('#scratchersModalBody') as HTMLElement | null;
          if (body) {
            body.scrollTop = 0;
            body.scrollTop = body.scrollHeight;
          }
          window.dispatchEvent(new Event('scroll'));
        }).catch(() => {});
        await page.waitForFunction(() => {
          const img = document.querySelector('#scratchersModalBody .modal-scratchers-image img') as HTMLImageElement | null;
          return !!img && img.complete && img.naturalWidth > 20;
        }, null, { timeout: 5000 }).catch(() => {});
        await page.waitForFunction(() => {
          const img = document.querySelector('#oddsPanel img') as HTMLImageElement | null;
          return !!img && img.complete && img.naturalWidth > 20;
        }, null, { timeout: 3000 }).catch(() => {});
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

          // resolve <picture><source type=…> with srcset variants (largest)
          const pickFromPicture = (pic: HTMLPictureElement): string | undefined => {
            const sources = Array.from(pic.querySelectorAll('source'));
            const candidates: Array<{u:string; w:number}> = [];
            for (const s of sources) {
              const typeOk = !s.type || /(png|jpeg)/i.test(s.type);
              if (!typeOk) continue;
              const ss = s.srcset || s.getAttribute('data-srcset') || "";
              for (const part of ss.split(',').map(s => s.trim()).filter(Boolean)) {
                const m = part.match(/(\S+)\s+(\d+)w/);
                if (m) candidates.push({ u: m[1], w: Number(m[2]) });
              }
            }
            candidates.sort((a,b)=>b.w-a.w);
            return candidates[0]?.u ? abs(candidates[0].u) : undefined;
          };

          const name =
            (root.querySelector("h2.game-name")?.textContent ||
            root.querySelector(".game-name")?.textContent ||
            root.querySelector(".modal-scratchers-header h2")?.textContent ||
            root.querySelector("h1, h2, h3")?.textContent ||
            "").trim();

          const pickUrlFromImg = (img: HTMLImageElement): string | undefined => {
            if (!img) return undefined;
            const cur = (img as any).currentSrc
              || img.getAttribute('src')
              || img.getAttribute('data-src')
              || "";
            if (cur) return abs(cur);
            const ss = img.getAttribute('srcset') || img.getAttribute('data-srcset') || "";
            if (ss) {
              const parts = ss.split(',').map(s => s.trim());
              const best = parts.map(p => {
                const m = p.match(/(\S+)\s+(\d+)w/);
                return m ? { url: m[1], w: Number(m[2]) } : null;
              }).filter(Boolean).sort((a,b) => (b!.w - a!.w))[0] as any;
              if (best) return abs(best.url);
            }
            return undefined;
          };

          let ticketImageUrl: string | undefined;
          let oddsImageUrl:   string | undefined;

          // Walk all images inside the modal to be robust against markup shifts
          const imgs = Array.from((body || root).querySelectorAll('img, picture img')) as HTMLImageElement[];
          // also check <picture> directly
          body.querySelectorAll('picture').forEach(pic=>{
            const u = pickFromPicture(pic as HTMLPictureElement);
            if (u) {
              const p = u.toLowerCase();
              const inDam = p.includes('/content/dam/');
              const isScratchers = /\/scratchers?-games\//.test(p);
              if (inDam && isScratchers) {
                if (/\/ticket\.(png|jpe?g|webp)$/.test(p) && !ticketImageUrl) ticketImageUrl = u;
                if (/\/odds\.(png|jpe?g|webp)$/.test(p)   && !oddsImageUrl)   oddsImageUrl   = u;
              }
            }
          });
          for (const img of imgs) {
            const url = pickUrlFromImg(img);
            if (!url) continue;
            const p = url.toLowerCase();

            const inDam = p.includes('/content/dam/');
            const isScratchers = /\/scratchers?-games\//.test(p);
            const looksTicket = /\/ticket\.(png|jpe?g|webp)$/.test(p) || /ticket/i.test(img.alt || "");
            const looksOdds   = /\/odds\.(png|jpe?g|webp)$/.test(p)   || /odds/i.test(img.alt || "") ||
                                (img.closest('#oddsPanel') != null);

            if (inDam && isScratchers && looksTicket && !ticketImageUrl) ticketImageUrl = url;
            if (inDam && isScratchers && looksOdds   && !oddsImageUrl)   oddsImageUrl   = url;
          }

          // Specific fallbacks inside the modal only
          if (!ticketImageUrl) {
            const t = body.querySelector('img[src*="/scratchers-games/"][src*="/ticket."]') as HTMLImageElement | null;
            if (t) ticketImageUrl = abs((t as any).currentSrc || t.getAttribute('src'));
          }
          if (!oddsImageUrl) {
            const o = root.querySelector('#oddsPanel img[src*="/scratchers-games/"][src*="/odds."]') as HTMLImageElement | null;
            if (o) oddsImageUrl = abs((o as any).currentSrc || o.getAttribute('src'));
          }

          // CSS background-image inside modal (rare fallback)
          if (!ticketImageUrl || !oddsImageUrl) {
            (body || root).querySelectorAll<HTMLElement>('[style*="background-image"]').forEach(el => {
              const s = (el.getAttribute("style") || "");
              const m = s.match(/background-image:\s*url\(["']?([^"')]+)["']?\)/i);
              if (m) {
                const u = abs(m[1])!;
                const p = u.toLowerCase();
                const inDam = p.includes('/content/dam/');
                const isScratchers = /\/scratchers?-games\//.test(p);
                if (inDam && isScratchers) {
                  if (/\/ticket\./.test(p) && !ticketImageUrl) ticketImageUrl = u;
                  if (/\/odds\./.test(p)   && !oddsImageUrl)   oddsImageUrl   = u;
                }
              }
            });
          }

          let gameNumber: number | undefined;
          {
            const m = text.match(/Game\s*(?:Number|#)\s*[:#]?\s*(\d{3,5})/i);
            if (m) gameNumber = Number(m[1]);
          }

          const overallMatch = text.match(/overall\s*odds\s*(?:of)?\s*1\s*in\s*([\d.]+)/i) || text.match(/1\s*in\s*([\d.]+)/i);
          const overallOdds = overallMatch ? Number(overallMatch[1]) : undefined;

          const startDateMatch = text.match(/(?:Start|Launch)\s*Date\s*[:\-]?\s*([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Za-z]{3,9}\s+\d{4})/i);
          const startDate = startDateMatch ? startDateMatch[1] : undefined;

          return { gameNumber, name, overallOdds, startDate, ticketImageUrl, oddsImageUrl };
        }, modalRootSel);

        // If DOM missed, consult network hits for this game
        if (info && Number.isFinite(info.gameNumber)) {
          const gnum = info.gameNumber!;
          const hits = netHits[gnum];
          if (hits) {
            if (!info.ticketImageUrl && hits.ticketCandidates.length) {
              const pick = hits.ticketCandidates
                .sort((a,b)=> filenameWeight(b.url,'ticket', gnum) - filenameWeight(a.url,'ticket', gnum))[0];
              info.ticketImageUrl = pick?.url || info.ticketImageUrl;
            }
            if (!info.oddsImageUrl && hits.oddsCandidates.length) {
              const pick = hits.oddsCandidates
                .sort((a,b)=> filenameWeight(b.url,'odds', gnum) - filenameWeight(a.url,'odds', gnum))[0];
              info.oddsImageUrl = pick?.url || info.oddsImageUrl;
            }
          }
          byNum.set(info.gameNumber!, {
            gameNumber: info.gameNumber!,
            name: info.name || undefined,
            overallOdds: info.overallOdds,
            startDate: info.startDate,
            ticketImageUrl: normalizeUrl(info.ticketImageUrl),
            oddsImageUrl: normalizeUrl(info.oddsImageUrl),
          });
          // Instrumentation for the first few
          if (byNum.size <= DEBUG_MODAL_LIMIT) {
            try {
              const body = await page.$('#scratchersModalBody');
              const html = await body?.evaluate(el => (el as HTMLElement).outerHTML);
              await ensureDir(OUT_DIR);
              await fs.writeFile(path.join(OUT_DIR, `_debug_modal_${gnum}.html`), html || "", "utf8");
              await page.screenshot({ path: path.join(OUT_DIR, `_debug_modal_${gnum}.png`) });
              await page.locator('#oddsPanel').screenshot({ path: path.join(OUT_DIR, `_debug_odds_${gnum}.png`) }).catch(()=>{});
            } catch {}
          }
        }
      } catch {
        // ignore one tile
      } finally {
        await closeModal();
      }

      if ((i + 1) % 10 === 0) {
        await page.waitForLoadState('networkidle', { timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(150);
      }
    }

    const sample = Array.from(byNum.values()).slice(0, 10);
    await writeJson("_debug_active.details.json", { count: byNum.size, sample });
    // dump network capture
    try { await writeJson("_debug_network_images.json", netHits); __lastModalNetHits = netHits; } catch { __lastModalNetHits = netHits; }

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

  const page = await context.newPage();
  try {
    await openAndReady(page, ACTIVE_URL, { loadMore: true });
    // Ensure the infinite grid is actually fully loaded; openAndReady is best-effort,
    // but the site sometimes needs multiple bottom scrolls before anchors are hydrated.
    {
      const z = (ms: number) => new Promise(r => setTimeout(r, ms));
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
        const count = await page.$$eval('.catalog-item[data-game-id]', els => els.length).catch(() => 0);
        if (count > 0 && count === last) { if (++stable >= 2) break; } else { stable = 0; }
        last = count;
      }
    }

    // page-level network collector for per-game pages
    const pageNetHits: NetHitMap = {};
    const pushHit = (num: number, url: string, status: number, ct?: string) => {
      if (!pageNetHits[num]) pageNetHits[num] = { ticketCandidates: [], oddsCandidates: [] };
      (/\/odds\.(?:png|jpe?g)/i.test(url) ? pageNetHits[num].oddsCandidates : pageNetHits[num].ticketCandidates).push({ url, status, ct });
    };
// Build num -> url map from the catalog grid itself (no globals)
    const pairs = await page.evaluate(() => {
      const makeAbs = (href: string) => new URL(href, location.origin).href;
      const out: Array<{ num: number; url: string }> = [];
      document.querySelectorAll('.catalog-item[data-game-id]').forEach((tile) => {
        const numStr = (tile as HTMLElement).getAttribute('data-game-id') || '';
        const num = Number(numStr);
        if (!Number.isFinite(num)) return;
        // Try to find the primary link within the tile. Some variants use data-* attrs.
        const pickHref = (el: Element | null): string | null => {
          if (!el) return null;
          const h = (el as HTMLAnchorElement).getAttribute('href');
          if (h && h !== '#') return h;
          const da = (el as HTMLElement).getAttribute('data-analytics-link');
          if (da) return da;
          const dh = (el as HTMLElement).getAttribute('data-href');
          if (dh) return dh;
          return null;
        };
        const a = tile.querySelector<HTMLAnchorElement>('a[href*="/games/scratchers/"]')
              ||  tile.querySelector<HTMLAnchorElement>('a.more-info, a[title], a[href]')
              ||  tile.querySelector<HTMLAnchorElement>('[data-analytics-link],[data-href]');
        const hrefRaw = pickHref(a) || pickHref(tile);
        if (!hrefRaw || hrefRaw === '#') return;
        // Sometimes they give only a fragment; make it absolute
        let href = hrefRaw;
        if (/^#/.test(href)) return; // fragment-only: skip (modal-only)
        out.push({ num, url: makeAbs(href) });
      });
      return out;
    });

    const urlByNum = new Map<number, string>(pairs.map(p => [p.num, p.url]));
    if (urlByNum.size === 0) {
      console.warn(`[fallback] could not derive any game links from grid`);
    } else {
      console.log(`[fallback] derived ${urlByNum.size} game links from grid (of ${await page.$$eval('.catalog-item[data-game-id]', els => els.length).catch(()=>0)})`);
    }

    // Helper: attach a temporary response listener that records DAM hits
    const attachSniffer = (pg, num: number) => {
      const onResp = async (resp) => {
        try {
          const u = resp.url();
          if (!DAM_CAPTURE_RE.test(u)) return;
          pushHit(num, u, resp.status(), resp.headers()["content-type"]);
        } catch {}
      };
      pg.on("response", onResp);
      return () => { try { pg.off("response", onResp); } catch {} };
    };

    for (const num of neededNums) {
      const url = urlByNum.get(num);
      if (!url) continue;

      const gp = await context.newPage();
      try {
        const detach = attachSniffer(gp, num);
        await openAndReady(gp, url, { loadMore: false });

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
            const cur = (img as any).currentSrc
              || img.getAttribute('src')
              || img.getAttribute('data-src')
              || "";
            if (cur) return new URL(cur, location.origin).href;
            const ss = img.getAttribute('srcset') || img.getAttribute('data-srcset') || "";
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
            const p = (url || '').toLowerCase();
            const inDam = p.includes('/content/dam/');
            const isScratchers = /\/scratchers?-games\//.test(p);

            // Only consider scratchers assets under /content/dam/
            const oddsish = inDam && isScratchers && (/\/odds\./i.test(p) || /odds/i.test(alt) ||
                            /odds/i.test((img.closest('#oddsPanel, [id*="odds"]') as HTMLElement | null)?.id || ''));
            const ticketish = inDam && isScratchers && (/\/ticket\./i.test(p) || /ticket|hero|art/i.test(alt));

            const wHint = (() => {
              if (!url) return 0;
              const m = p.match(/[-_](\d{3,4})x(\d{3,4})\./);
              return m ? Number(m[1]) : 0;
            })();

            if (oddsish || ticketish) cands.push({ url, alt, oddsish, ticketish, wHint });
          });

          root.querySelectorAll<HTMLElement>('[style*="background-image"]').forEach(el => {
            const s = (el.getAttribute("style") || "");
            const m = s.match(/background-image:\s*url\(["']?([^"')]+)["']?\)/i);
            if (m) {
              const url = new URL(m[1], location.origin).href;
              const p = url.toLowerCase();
              const inDam = p.includes('/content/dam/');
              const isScratchers = /\/scratchers?-games\//.test(p);
              if (inDam && isScratchers) {
                const isOdds = /odds/i.test(el.id) || /odds/i.test(p);
                cands.push({ url, alt: "", oddsish: isOdds, ticketish: !isOdds, wHint: 0 });
              }
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

        // If DOM missed anything, use network hits (authoritative)
        if (res && (!res.ticketImageUrl || !res.oddsImageUrl)) {
          const hits = pageNetHits[num];
          if (hits) {
            if (!res.ticketImageUrl && hits.ticketCandidates.length) {
              const pick = hits.ticketCandidates.sort(
                (a,b)=> filenameWeight(b.url,'ticket', num) - filenameWeight(a.url,'ticket', num)
              )[0];
              if (pick) res.ticketImageUrl = pick.url;
            }
            if (!res.oddsImageUrl && hits.oddsCandidates.length) {
              const pick = hits.oddsCandidates.sort(
                (a,b)=> filenameWeight(b.url,'odds', num) - filenameWeight(a.url,'odds', num)
              )[0];
              if (pick) res.oddsImageUrl = pick.url;
            }
          }
        }

        if (res && (res.ticketImageUrl || res.oddsImageUrl)) {
          map.set(num, {
            ticketImageUrl: normalizeUrl(res.ticketImageUrl),
            oddsImageUrl: normalizeUrl(res.oddsImageUrl),
          });
        }
      } finally {
        try { await gp.close(); } catch {}
      }
    }

    // Persist per-game sniffed hits for debugging
    try { await writeJson(GAMEPAGE_NET_DUMP, pageNetHits); } catch {}

    return map;
  } finally {
    await page.close().catch(() => {});
  }
}

// -----------------------------
// Main
// -----------------------------
async function main() {
  // ----- CLI flags -----
  const argv = mri(process.argv.slice(2), {
    boolean: ["rehost-all", "only-missing", "dry-run", "seed", "delete-ended"],
    string: ["concurrency"],
    default: {
      "only-missing": true,
      "dry-run": false,
      "seed": false,
      "delete-ended": false,
      "concurrency": "4",
    },
    alias: { c: "concurrency" },
  });

  const concurrency = Math.max(1, Number(argv.concurrency ?? 4));
  const SEED = !!argv["seed"];
  const DELETE_ENDED = !!argv["delete-ended"];

  // Hosting behavior (picked up by image_hosting.ts → ensureHashKey)
  setHostingOptions({
    rehostAll: !!argv["rehost-all"],
    onlyMissing: !!argv["only-missing"],
    dryRun: !!argv["dry-run"],
  });

  const storage = getStorage();
  const limit = pLimit(concurrency);

  // Manifest (single load/save for whole run)
  const manifest = await loadManifest();
  console.log(`[manifest] loaded ${Object.keys(manifest).length} entries`);

  // Browser
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
    extraHTTPHeaders: {
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://www.galottery.com/",
    },
  });
  await maybeStartTracing(context);

  try {
    // Previous index (for carry-forward)
    const prev = await readPrevIndex();
    const prevMap = new Map<number, ActiveGame>(prev ? prev.games.map(g => [g.gameNumber, g]) : []);

    // 1) Grid = ground truth
    const activeIdsFromGrid = await collectActiveIds(context);

    // 2) Secondary sources
    const { activeNums: activeFromList } = await fetchActiveEndedNumbers(context);
    const topPrizesMap = await fetchTopPrizes(context);
    const activeFromTopPrizes = Array.from(topPrizesMap.keys());

    // Union (but we’ll publish only ids present in grid)
    const activeNumsUnion = Array.from(new Set([...activeFromList, ...activeFromTopPrizes])).sort((a,b)=>a-b);

    // 3) Delta vs previous (restricted to grid)
    const activeNow = new Set<number>(activeIdsFromGrid);
    const prevSet = new Set<number>(prev ? prev.games.map(g => g.gameNumber) : []);
    const newNums = activeIdsFromGrid.filter(n => !prevSet.has(n));
    const continuingNums = activeIdsFromGrid.filter(n => prevSet.has(n));
    const endedNums = prev ? prev.games.map(g => g.gameNumber).filter(n => !activeNow.has(n)) : [];

    await writeJson("_debug_delta.json", {
      new: newNums,
      continuing: continuingNums,
      ended: endedNums,
      counts: { grid: activeIdsFromGrid.length, union: activeNumsUnion.length }
    });
    console.log(`[delta] new=${newNums.length}, continuing=${continuingNums.length}, ended=${endedNums.length}`);

    // 4) Sources snapshot
    await writeJson("_debug_active.sources.json", {
      fromGrid:       { count: activeIdsFromGrid.length },
      fromActiveList: { count: activeFromList.length },
      fromTopPrizes:  { count: activeFromTopPrizes.length },
      union:          { count: activeNumsUnion.length }
    });

    // 5) Modals: all if --seed, else just new
    const modalTargetIds = SEED ? activeIdsFromGrid : newNums;
    const detailsByNum = await withRetry(
      () => scrapeActiveModalDetails(context, modalTargetIds.length ? modalTargetIds : undefined),
      { label: "modal details", attempts: 2 }
    );

    // Sparse guard (only warn)
    const denom = Math.max((modalTargetIds.length || activeIdsFromGrid.length), 1);
    if (detailsByNum.size / denom < 0.5) {
      console.warn(`[guard] modal details sparse: ${detailsByNum.size}/${denom} (modals/target)`);
    }

    const updatedAt = pickUpdatedAt(topPrizesMap);

    // Publish set = grid ∩ union
    const indexNowSet = new Set<number>(activeNumsUnion.filter(n => activeNow.has(n)));
    const newOnIndex = newNums.filter(n => indexNowSet.has(n));
    const continuingOnIndex = continuingNums.filter(n => indexNowSet.has(n));

    const games: ActiveGame[] = activeNumsUnion
      .filter(n => activeNow.has(n))
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

         const ticketUpstream = preferGA(det?.ticketImageUrl, prevG?.ticketImageUrl);
        const oddsUpstream   = preferGA(det?.oddsImageUrl,   prevG?.oddsImageUrl);

        const g: ActiveGame = {
          gameNumber: num,
          name,
          price: row?.price ?? prevG?.price,
          topPrizeValue,
          topPrizesOriginal: row?.originalTopPrizes ?? prevG?.topPrizesOriginal,
          topPrizesRemaining: row?.topPrizesRemaining ?? prevG?.topPrizesRemaining,
          overallOdds: overall,
          adjustedOdds: adjusted,
          startDate: det?.startDate ?? prevG?.startDate,
          ticketImageUrl: ticketUpstream ?? det?.ticketImageUrl ?? prevG?.ticketImageUrl,
          oddsImageUrl:   oddsUpstream   ?? det?.oddsImageUrl   ?? prevG?.oddsImageUrl,
          updatedAt,
          lifecycle: newOnIndex.includes(num) ? 'new'
                    : continuingOnIndex.includes(num) ? 'continuing'
                    : undefined,
        };
        return g;
      });

    // Fallback pass for missing images (game pages)
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

    // Coverage debug (make this block non-fatal)
    let withTicket = 0;
    let withOdds = 0;
    let needAny: number[] = [];

    try {
      withTicket = games.filter(g => !!g.ticketImageUrl).length;
      withOdds   = games.filter(g => !!g.oddsImageUrl).length;
      needAny    = games
        .filter(g => !g.ticketImageUrl || !g.oddsImageUrl)
        .slice(0, 20)
        .map(g => g.gameNumber);

      await writeJson("_debug_images.summary.json", {
        counts: {
          totalActive: games.length,
          withTicket,
          withOdds,
        },
        coveragePct: {
          ticket: Math.round((withTicket / Math.max(games.length, 1)) * 100),
          odds:   Math.round((withOdds   / Math.max(games.length, 1)) * 100),
        },
        previewMissingAny: needAny,
      });
    } catch (e) {
      console.warn(`[debug] failed to write _debug_images.summary.json: ${(e as Error).message}`);
    }

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
console.log(
  `[images] ticket=${withTicket}/${games.length} (${pct(withTicket, games.length)}%), ` +
  `odds=${withOdds}/${games.length} (${pct(withOdds, games.length)}%)`
);

    // Rehost (R2 or local FS) — uses manifest + flags
    const limitJobs: Array<Promise<void>> = [];
    for (const g of games) {
      const pairs: Array<["ticketImageUrl"|"oddsImageUrl", "ticket"|"odds"]> = [
        ["ticketImageUrl", "ticket"],
        ["oddsImageUrl", "odds"],
      ];

      const originals: Record<string, string | undefined> = {
        ticket: g.ticketImageUrl,
        odds: g.oddsImageUrl,
      };

      const already: Record<string, { key: string; url: string } | undefined> = {};

      for (const [field, kind] of pairs) {
        const src = g[field];
        if (!src) continue;
        // Safety: never try to rehost non-GA sources (e.g., localhost/CDN)
        if (!isGAHost(src)) {
          console.warn(`[rehost] skip ${g.gameNumber}/${kind}: non-GA sourceUrl=${src}`);
          continue;
        }

        // If both fields use the exact same source URL, dedupe upload
        if (originals.ticket && originals.odds && originals.ticket === originals.odds) {
          if (already["ticket"]) {
            g[field] = already["ticket"]!.url;
            continue;
          }
        }

        limitJobs.push(limit(async () => {
          try {
            console.log(`[rehost] ${g.gameNumber}/${kind} ← ${src}`);
            const hosted = await ensureHashKey({
              gameNumber: g.gameNumber,
              kind,
              sourceUrl: src,
              storage,
              dryRun: !!argv["dry-run"],
            });
            g[field] = hosted.url;
            already[kind] = { key: hosted.key, url: hosted.url };

            if (originals.ticket && originals.odds && originals.ticket === originals.odds) {
              g["ticketImageUrl"] = hosted.url;
              g["oddsImageUrl"] = hosted.url;
            }
          } catch (err) {
            console.warn(`[rehost] game ${g.gameNumber} (${kind}) failed: ${(err as Error).message}`);
          }
        }));
      }
    }
    await Promise.all(limitJobs);
    await saveManifest();

    // Optional: stage delete candidates (no delete call yet)
    if (DELETE_ENDED && endedNums.length) {
      const deleteCandidates: string[] = [];
      for (const [sourceUrl, m] of Object.entries(await loadManifest())) {
        // our keys are "ga/scratchers/images/<num>/<kind>-<sha>.<ext>"
        const mNum = (() => {
          const mref = m.key.match(/ga\/scratchers\/images\/(\d+)\//);
          return mref ? Number(mref[1]) : NaN;
        })();
        if (Number.isFinite(mNum) && endedNums.includes(mNum)) {
          deleteCandidates.push(m.key);
        }
      }
      await writeJson("_debug_delete_candidates.json", {
        endedNums,
        keys: deleteCandidates.sort(),
      });
      console.warn(`[cleanup] wrote ${deleteCandidates.length} candidate keys for ended games to _debug_delete_candidates.json`);
    }

    // Guards
    const missingTopPrizeNums = games
      .filter(g => g.price == null || g.topPrizesOriginal == null || g.topPrizesRemaining == null)
      .map(g => g.gameNumber);

    if (games.length === 0) throw new Error("CI assertion: No active games were returned.");
    if (topPrizesMap.size === 0) throw new Error("CI assertion: Top Prizes table parsed 0 rows.");

    if (missingTopPrizeNums.length / games.length > 0.5) {
      throw new Error(`CI assertion: ${missingTopPrizeNums.length}/${games.length} active games missing Top-Prizes fields: ${missingTopPrizeNums.join(", ")}`);
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

    // --- Acceptance / CI guards for image coverage ---
    // Build first-5 missing lists per kind
    const missingTicket = games.filter(g => !g.ticketImageUrl).slice(0, 5).map(g => g.gameNumber);
    const missingOdds   = games.filter(g => !g.oddsImageUrl).slice(0, 5).map(g => g.gameNumber);
    if (missingTicket.length) console.warn(`[images] first missing tickets: ${missingTicket.join(", ")}${games.length>5?" …":""}`);
    if (missingOdds.length)   console.warn(`[images] first missing odds: ${missingOdds.join(", ")}${games.length>5?" …":""}`);

    // Merge network-sniffer counts into the summary (best-effort)
    let netCounts = { modal: { games: 0, tickets: 0, odds: 0 }, gamepages: { games: 0, tickets: 0, odds: 0 } };
    try {
      const modalMap = __lastModalNetHits || JSON.parse(await fs.readFile(path.join(OUT_DIR, "_debug_network_images.json"), "utf8"));
      const gpMap    = JSON.parse(await fs.readFile(path.join(OUT_DIR, GAMEPAGE_NET_DUMP), "utf8"));
      const sum = (m: NetHitMap) => ({
        games: Object.keys(m).length,
        tickets: Object.values(m).reduce((s,v)=>s+(v.ticketCandidates?.length||0),0),
        odds:    Object.values(m).reduce((s,v)=>s+(v.oddsCandidates?.length||0),0),
      });
      if (modalMap) netCounts.modal = sum(modalMap);
      if (gpMap)    netCounts.gamepages = sum(gpMap);
    } catch {}

    // Re-write summary with network counts included
    try {
      const p = path.join(OUT_DIR, "_debug_images.summary.json");
      const prev = JSON.parse(await fs.readFile(p, "utf8"));
      prev.network = netCounts;
      await fs.writeFile(p, JSON.stringify(prev, null, 2), "utf8");
    } catch {}

    // Fail CI if coverage too low (tunable)
    const TICKET_MIN = Number(process.env.MIN_TICKET_COVERAGE || 50);
    const ODDS_MIN   = Number(process.env.MIN_ODDS_COVERAGE   || 50);
    const ticketPct  = Math.round((withTicket / Math.max(games.length, 1)) * 100);
    const oddsPct    = Math.round((withOdds   / Math.max(games.length, 1)) * 100);
    if (ticketPct < TICKET_MIN || oddsPct < ODDS_MIN) {
      throw new Error(
        `CI assertion: Image coverage below threshold ` +
        `(tickets ${ticketPct}% < ${TICKET_MIN}% or odds ${oddsPct}% < ${ODDS_MIN}%).`
      );
    }

    // Sort (stable)
    const gamesSorted = games.slice().sort((a, b) => {
      const pA = a.price ?? -Infinity, pB = b.price ?? -Infinity;
      if (pA !== pB) return pB - pA;
      const aaA = a.adjustedOdds ?? Infinity, aaB = b.adjustedOdds ?? Infinity;
      if (aaA !== aaB) return aaA - aaB;
      const boA = a.overallOdds ?? Infinity, boB = b.overallOdds ?? Infinity;
      if (boA !== boB) return boA - boB;
      return a.gameNumber - b.gameNumber;
    });

    // Persist payload
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
    try { await saveManifest(); } catch {}
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
