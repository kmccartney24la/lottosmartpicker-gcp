// scripts/scratchers/_util.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Page, type Browser, type BrowserContext } from 'playwright';

export function ensureError(e: unknown): Error {
  if (e instanceof Error) return e;
  return new Error(typeof e === 'string' ? e : 'Unknown failure');
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type RetryOpts = {
  attempts?: number;
  label?: string;
  onError?: (err: Error, attempt: number) => Promise<void> | void;
  baseMs?: number;  // initial backoff
  maxMs?: number;   // cap backoff
  jitter?: boolean;
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOpts = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const baseMs = opts.baseMs ?? 1500;
  const maxMs = opts.maxMs ?? 6000;
  const jitter = opts.jitter ?? true;
  const label = opts.label ?? 'task';

  let lastErr: Error | undefined;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      const err = ensureError(e);
      lastErr = err;
      const sleepMs = Math.min(maxMs, baseMs * i) * (jitter ? (0.7 + Math.random() * 0.6) : 1);
      console.warn(`[retry ${label}] attempt ${i}/${attempts} failed: ${err.message}; sleeping ${Math.round(sleepMs)}ms`);
      await opts.onError?.(err, i);
      if (i < attempts) await sleep(sleepMs);
    }
  }
  throw lastErr ?? new Error(`withRetry(${label}) failed`);
}

const OUT_DIR = 'public/data/ga_scratchers';
async function ensureOutDir() {
  await fs.mkdir(OUT_DIR, { recursive: true });
}

export async function saveDebug(page: Page, nameBase: string): Promise<void> {
  await ensureOutDir();
  const html = await page.content();
  const pngPath = path.join(OUT_DIR, `_debug_${nameBase}.png`);
  const htmlPath = path.join(OUT_DIR, `_debug_${nameBase}.html`);
  await fs.writeFile(htmlPath, html, 'utf8');
  await page.screenshot({ path: pngPath, fullPage: true }).catch(() => {});
  console.log(`Saved debug artifacts: ${htmlPath}, ${pngPath}`);
}

export async function newBrowser(): Promise<{ browser: Browser }> {
  const headless = process.env.HEADFUL ? false : true;
  const browser = await chromium.launch({
    headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });
  return { browser };
}

export async function newContext(browser?: Browser): Promise<{ browser: Browser; context: BrowserContext }> {
  const b = browser ?? (await newBrowser()).browser;
  const context = await b.newContext({
    viewport: { width: 1366, height: 900 },
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
  });
  return { browser: b, context };
}

export async function newPage(): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  const { browser, context } = await newContext();
  const page = await context.newPage();
  if (process.env.TRACE) {
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  }
  return { browser, context, page };
}

/**
 * Soft-scrolls the page to trigger lazy rendering. Also clicks a “Load more” if found.
 */
async function hydrateList(page: Page, { maxScrolls = 12, stepPx = 1200 } = {}) {
  let lastHeight = 0;
  for (let i = 0; i < maxScrolls; i++) {
    await page.evaluate(async (y) => {
      window.scrollBy(0, y);
      await new Promise((r) => setTimeout(r, 250));
    }, stepPx);

    // Optional “Load more” button
    const loadMore = page.locator('button:has-text("Load more"), button:has-text("Show more"), a:has-text("Load more")');
    if (await loadMore.first().isVisible().catch(() => false)) {
      await loadMore.first().click().catch(() => {});
      await page.waitForTimeout(500);
    }

    const newHeight = await page.evaluate(() => document.scrollingElement?.scrollHeight ?? document.body.scrollHeight ?? 0);
    if (newHeight <= lastHeight) break;
    lastHeight = newHeight;
  }

  // Scroll back to top for consistent querying
  await page.evaluate(() => window.scrollTo({ top: 0 }));
}

/**
 * Open URL and bring SPA to a steady state: domcontentloaded -> hydrate -> short idle wait.
 */
export async function openAndReady(url: string): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  const { browser, context, page } = await newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
  // Allow React hydration to begin
  await page.waitForTimeout(800);
  await hydrateList(page);
  // Short idle wait; don't rely solely on networkidle (analytics websockets can keep it alive)
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(800);
  return { browser, context, page };
}

function looksLikeGameLinkText(txt: string): boolean {
  // Accept “#123”, “No. 123”, “Game 123”, or names with a dollar price etc.
  const t = txt.trim();
  if (!t) return false;
  if (/#\s*\d{2,4}\b/i.test(t)) return true;
  if (/\bNo\.?\s*\d{2,4}\b/i.test(t)) return true;
  if (/\bGame\s*\d{2,4}\b/i.test(t)) return true;
  if (/\$\d+/.test(t)) return true; // many scratchers show price in the title
  return false;
}

function numericFromUrl(href: string): string | null {
  const m = href.match(/(\d{2,5})(?:\/?$|[?#])/);
  return m?.[1] ?? null;
}

export type LinkDiscoveryOptions = {
  minCount?: number;
  timeoutMs?: number;
}

/**
 * Waits for a reasonable set of candidate scratcher anchors to exist.
 * Permissive selection and heuristics; deduped by normalized href.
 */
export async function waitForNumericGameLinks(page: Page, minCount = 5, timeoutMs = 60_000): Promise<string[]> {
  const started = Date.now();
  let last: string[] = [];

  while (Date.now() - started < timeoutMs) {
    // Grab multiple permutations of anchors; include react roots & deep descendants
    const hrefs = await page.evaluate(() => {
      const els = new Set<HTMLAnchorElement>();
      document.querySelectorAll('a[href*="/games/scratchers/"]').forEach(a => els.add(a as HTMLAnchorElement));
      document.querySelectorAll('[data-reactroot] a[href*="/games/scratchers/"]').forEach(a => els.add(a as HTMLAnchorElement));
      // fallback: any anchor within likely list regions
      document.querySelectorAll('[class*="list"], [class*="grid"], [class*="card"]').forEach(c =>
        c.querySelectorAll('a[href*="/games/scratchers/"]').forEach(a => els.add(a as HTMLAnchorElement))
      );
      const arr = Array.from(els);
      return arr.map(a => ({
        href: a.href,
        text: (a.textContent || '').trim(),
        nearby: (a.closest('article,li,div')?.textContent || '').trim().slice(0, 240),
      }));
    });

    // Heuristic filter: visible-ish text OR nearby text includes clues; OR URL carries numeric code
    const candidates = hrefs
      .filter(h => h && h.href)
      .filter(h => looksLikeGameLinkText(h.text) || looksLikeGameLinkText(h.nearby) || numericFromUrl(h.href))
      .map(h => h.href.split('#')[0]) // strip anchors
      .map(h => h.replace(/\/$/, '')); // normalize trailing slash

    // Dedupe
    const uniq = Array.from(new Set(candidates));
    last = uniq;

    if (uniq.length >= minCount) return uniq;

    // Let the SPA breathe a bit, maybe scroll more
    await sleep(600);
    await page.evaluate(() => window.scrollBy(0, 800)).catch(() => {});
  }

  // Final artifacts
  await saveDebug(page, 'links_fail');
  throw new Error(`waitForNumericGameLinks: timed out without reaching minCount=${minCount}; gathered=${last.length}`);
}

// Helpers for parsing numbers from text
export function toNum(s: string | null | undefined): number {
  if (!s) return 0;
  const m = (s.match(/[\d,]+/) || [])[0];
  return m ? Number(m.replace(/,/g, '')) : 0;
}

export function priceFromString(s: string | null | undefined): number {
  if (!s) return 0;
  const m = s.match(/\$?\s*([0-9]+)(?:\.\d{2})?/);
  return m ? Number(m[1]) : 0;
}

export function oddsFromText(s: string | null | undefined): number | undefined {
  if (!s) return;
  const m = s.match(/\b1\s*in\s*([0-9,.]+)/i);
  if (m) return Number(m[1].replace(/,/g, ''));
  return;
}

/** Accept cookies banners where present (best-effort). Exported for reuse. */
export async function acceptCookies(page: Page) {
  const selectors = [
    '#onetrust-accept-btn-handler',
    'button#onetrust-accept-btn-handler',
    'button:has-text("Accept")',
    'button:has-text("I Accept")',
    'button:has-text("Agree")',
  ];
  for (const sel of selectors) {
    const btn = page.locator(sel);
    if (await btn.first().isVisible().catch(() => false)) {
      await btn.first().click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(200);
      break;
    }
  }
}

/** Close and flush tracing if enabled. */
export async function closeAll(browser: Browser, context: BrowserContext) {
  try {
    if (process.env.TRACE) {
      await context.tracing.stop({ path: path.join(OUT_DIR, `_debug_trace.zip`) });
    }
  } catch {}
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
