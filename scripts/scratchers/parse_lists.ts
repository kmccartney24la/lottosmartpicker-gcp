//scripts/scratchers/parse_lists.ts
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { BrowserContext, Page } from "playwright";
import { openAndReady, withRetry } from "./_util";

const ACTIVE_URL = "https://www.galottery.com/en-us/games/scratchers/active-games.html";
const ENDED_URL  = "https://www.galottery.com/en-us/games/scratchers/ended-games.html";

const OUT_DIR = "public/data/ga_scratchers";

export type ScratcherListsNums = {
  activeNums: number[];
  endedNums: number[];
};

/** Utility: write small JSON debug blobs next to data for CI forensics */
async function writeJsonDebug(name: string, data: unknown) {
  try {
    await fs.mkdir(OUT_DIR, { recursive: true });
    await fs.writeFile(path.join(OUT_DIR, name), JSON.stringify(data, null, 2), "utf8");
  } catch {}
}

/** Heuristic: does this integer look like a GA game number? */
function isLikelyGameNumber(n: number): boolean {
  return Number.isInteger(n) && n >= 100 && n <= 99999;
}

/** Extract plausible game numbers from arbitrary JSON by key + value heuristics. */
function extractNumbersFromModel(json: any): number[] {
  const out = new Set<number>();

  const push = (v: any) => {
    if (typeof v === "number") {
      if (isLikelyGameNumber(v)) out.add(v|0);
    } else if (typeof v === "string") {
      // 1) Explicit patterns in text
      const re = /\b(?:(?:Game\s*(?:Number|#)\s*[:#]?\s*)|#game-)(\d{3,5})\b/ig;
      for (const m of v.matchAll(re)) {
        const n = Number(m[1]);
        if (isLikelyGameNumber(n)) out.add(n);
      }
      // 2) Bare numbers in fragment/hrefs
      const re2 = /(?:^|[^\d])(\d{3,5})(?:$|[^\d])/g;
      for (const m of v.matchAll(re2)) {
        const n = Number(m[1]);
        if (isLikelyGameNumber(n)) out.add(n);
      }
    }
  };

  const walk = (node: any) => {
    if (node == null) return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node !== "object") { push(node); return; }
    for (const [k, v] of Object.entries(node)) {
      const kl = k.toLowerCase();
      // Key-name hints
      if (/(?:^|_)(?:game(?:number|no|id)|gamenumber|gameid|number|id)(?:$|_)/.test(kl)) {
        if (typeof v === "string" || typeof v === "number") push(v);
      }
      walk(v);
    }
  };
  walk(json);

  return Array.from(out).sort((a, b) => a - b);
}

/** Primary: read AEM model.json for a page and mine game numbers from the content tree. */
async function numbersFromAemModel(page: Page, label: string): Promise<{numbers: number[], tried: string[], used?: string}> {
  // Discover requestPath (e.g., "/content/portal/en/games/scratchers/active-games")
  const reqPath = await page.evaluate(() => {
    const w = window as any;
    if (w.CQURLInfo?.requestPath) return w.CQURLInfo.requestPath as string;
    // fallback: scan inline scripts
    const scripts = Array.from(document.querySelectorAll("script:not([src])") as any)
      .map((s: any) => s.textContent || "");
    for (const txt of scripts) {
      const m = txt.match(/CQURLInfo\s*=\s*{[^}]*"requestPath"\s*:\s*"([^"]+)"/);
      if (m) return m[1];
    }
    return "";
  });
  const origin = new URL(page.url()).origin;
  const urlPath = new URL(page.url()).pathname.replace(/\.html$/, "");

  const candidates: string[] = [];
  const pushAbs = (p: string) => candidates.push(p.startsWith("http") ? `${p}.model.json` : `${origin}${p}.model.json`);

  if (reqPath) pushAbs(reqPath);
  if (reqPath && reqPath.startsWith("/en-us/")) {
    pushAbs("/content/portal/en" + reqPath.slice("/en-us".length));
  }
  // always include a fallback for the visible URL
  pushAbs(urlPath);
  if (urlPath.startsWith("/en-us/")) pushAbs("/content/portal/en" + urlPath.slice("/en-us".length));

  let json: any | null = null;
  let used: string | undefined;
  for (const u of candidates) {
    const resp = await page.request.get(u, { timeout: 15_000 }).catch(() => null);
    if (resp && resp.ok()) {
      try { json = await resp.json(); used = u; break; } catch {}
    }
  }

  if (!json) {
    await writeJsonDebug(`_debug_${label}.model.json`, { tried: candidates, count: 0 });
    return { numbers: [], tried: candidates };
  }

  const numbers = extractNumbersFromModel(json);
  await writeJsonDebug(`_debug_${label}.model.json`, { tried: candidates, used, count: numbers.length, sample: numbers.slice(0, 20) });
  return { numbers, tried: candidates, used };
}

/** Secondary: drive UI, open each tile's modal, parse "Game Number: ####". */
async function numbersFromModals(page: Page, label: string): Promise<number[]> {
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
    // Some variants nest tiles oddly – be generous.
    tiles = await page.$$('.scratchers-grid *:not(script):not(style)');
  }

  const seen = new Set<number>();
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

      const text = await page.evaluate((sel) => {
    const root = document.querySelector(sel) as any;
    return root ? ((root.textContent as string) || "").replace(/\s+/g, " ") : "";
  }, modalSel);

      const m = text.match(/Game\s*(?:Number|#)\s*[:#]?\s*(\d{3,5})/i);
      if (m) seen.add(Number(m[1]));

      // Close modal
      await page.keyboard.press("Escape").catch(() => {});
      await page.click('body', { timeout: 300 }).catch(() => {});
      await page.waitForTimeout(60);
    } catch {
      await page.keyboard.press("Escape").catch(() => {});
    }
  }

  const numbers = Array.from(seen).sort((a, b) => a - b);
  await writeJsonDebug(`_debug_${label}.modals.json`, { count: numbers.length, sample: numbers.slice(0, 20) });
  return numbers;
}

export async function fetchActiveEndedNumbers(context: BrowserContext): Promise<ScratcherListsNums> {
  const grab = async (url: string, label: "from_active" | "from_ended") =>
    withRetry(async () => {
      const page = await context.newPage();
      try {
        await openAndReady(page, url, { loadMore: true });

        // Primary: model.json
        const model = await numbersFromAemModel(page, label);
        let nums = model.numbers;

        // Secondary: click-to-modal
        if (nums.length === 0) nums = await numbersFromModals(page, label);

        await writeJsonDebug(`_debug_${label}.nums.json`, { count: nums.length, nums });
        return nums;
      } finally {
        await page.close().catch(() => {});
      }
    }, { label: `retry nums (${label})`, attempts: 3 });

  const [activeNums, endedNums] = await Promise.all([
    grab(ACTIVE_URL, "from_active"),
    grab(ENDED_URL,  "from_ended"),
  ]);

  // De-duplicate and sort
  const uniq = (arr: number[]) => Array.from(new Set(arr)).sort((a, b) => a - b);
  // Keep 'ended' strictly those not on active list
  const activeSet = new Set(activeNums);
  const endedOnly = uniq(endedNums.filter(n => !activeSet.has(n)));

  return { activeNums: uniq(activeNums), endedNums: endedOnly };
}
