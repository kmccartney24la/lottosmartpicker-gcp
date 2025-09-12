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
  baseMs?: number;
  maxMs?: number;
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
      '--disable-blink-features=AutomationControlled',
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
    locale: 'en-US',
    geolocation: { longitude: -84.3880, latitude: 33.7490 }, // Atlanta-ish
    permissions: ['geolocation'],
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

async function hydrateList(page: Page, { maxScrolls = 14, stepPx = 1400 } = {}) {
  let lastHeight = 0;
  for (let i = 0; i < maxScrolls; i++) {
    await page.evaluate(async (y) => {
      window.scrollBy(0, y);
      await new Promise((r) => setTimeout(r, 250));
    }, stepPx);

    const loadMore = page.locator('button:has-text("Load more"), button:has-text("Show more"), a:has-text("Load more")');
    if (await loadMore.first().isVisible().catch(() => false)) {
      await loadMore.first().click().catch(() => {});
      await page.waitForTimeout(600);
    }

    const newHeight = await page.evaluate(() => document.scrollingElement?.scrollHeight ?? document.body.scrollHeight ?? 0);
    if (newHeight <= lastHeight) break;
    lastHeight = newHeight;
  }
  await page.evaluate(() => window.scrollTo({ top: 0 }));
}

/** Open URL and bring SPA to a steady state */
export async function openAndReady(url: string): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  const { browser, context, page } = await newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(800);
  await acceptCookies(page).catch(() => {});
  await hydrateList(page);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(800);
  return { browser, context, page };
}

function looksLikeGameLinkText(txt: string): boolean {
  const t = (txt || '').trim();
  if (!t) return false;
  if (/#\s*\d{2,4}\b/i.test(t)) return true;
  if (/\bNo\.?\s*\d{2,4}\b/i.test(t)) return true;
  if (/\bGame\s*\d{2,4}\b/i.test(t)) return true;
  if (/\$\d+\b/.test(t)) return true;
  return false;
}

function numericFromUrl(href: string): string | null {
  const m = href.match(/(\d{2,5})(?:\/?$|[?#])/);
  return m?.[1] ?? null;
}

/** Wait for a reasonable set of candidate scratcher anchors to exist */
export async function waitForNumericGameLinks(page: Page, minCount = 3, timeoutMs = 60_000): Promise<string[]> {
  const started = Date.now();
  let last: string[] = [];

  while (Date.now() - started < timeoutMs) {
    const hrefs = await page.evaluate(() => {
      const els = new Set<HTMLAnchorElement>();
      document.querySelectorAll('a[href*="/games/scratchers/"]').forEach(a => els.add(a as HTMLAnchorElement));
      document.querySelectorAll('[data-reactroot] a[href*="/games/scratchers/"]').forEach(a => els.add(a as HTMLAnchorElement));
      document.querySelectorAll('[class*="list"], [class*="grid"], [class*="card"]').forEach(c =>
        c.querySelectorAll('a[href*="/games/scratchers/"]').forEach(a => els.add(a as HTMLAnchorElement))
      );
      const arr = Array.from(els);
      return arr.map(a => ({
        href: a.href,
        text: (a.textContent || '').trim(),
        nearby: (a.closest('article,li,div,section')?.textContent || '').trim().slice(0, 240),
      }));
    });

    const candidates = hrefs
      .filter(h => h && h.href)
      .filter(h => looksLikeGameLinkText(h.text) || looksLikeGameLinkText(h.nearby) || numericFromUrl(h.href))
      .map(h => h.href.split('#')[0])
      .map(h => h.replace(/\/$/, ''));

    const uniq = Array.from(new Set(candidates));
    last = uniq;

    if (uniq.length >= minCount) return uniq;

    await sleep(650);
    await page.evaluate(() => window.scrollBy(0, 900)).catch(() => {});
  }

  await saveDebug(page, 'links_fail');
  throw new Error(`waitForNumericGameLinks: timed out without reaching minCount=${minCount}; gathered=${last.length}`);
}

// Number helpers
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

/** Best-effort cookie banner handler */
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

/** Close and flush tracing if enabled */
export async function closeAll(browser: Browser, context: BrowserContext) {
  try {
    if (process.env.TRACE) {
      await context.tracing.stop({ path: path.join(OUT_DIR, `_debug_trace.zip`) });
    }
  } catch {}
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}

/* ----------------------- HTTP helpers (sitemap fallback) ------------------- */

export async function httpGet(url: string, init?: RequestInit): Promise<string> {
  // Node 20 global fetch
  const res = await fetch(url, {
    ...init,
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; GA-ScratchersBot/1.0; +https://example.invalid)',
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      ...init?.headers,
    } as any,
  });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return await res.text();
}

/** Extract absolute URLs from the galottery sitemap that are scratcher detail pages */
export async function scrapeScratchersFromSitemap(): Promise<string[]> {
  // robots.txt points to https://www.galottery.com/sitemap.xml
  const xml = await httpGet('https://www.galottery.com/sitemap.xml');
  // Some sites index nested sitemaps; follow any that look like "sitemap-*.xml"
  const nested = Array.from(xml.matchAll(/<loc>([^<]+?)<\/loc>/g)).map(m => m[1]);
  const allXmls = new Set<string>([...nested.filter(u => u.endsWith('.xml'))]);

  const urls: string[] = [];
  for (const sm of allXmls) {
    const body = sm === 'https://www.galottery.com/sitemap.xml' ? xml : await httpGet(sm);
    const locs = Array.from(body.matchAll(/<loc>([^<]+?)<\/loc>/g)).map(m => m[1]);
    for (const loc of locs) {
      if (/\/en-us\/games\/scratchers\/.+\.html$/.test(loc)) {
        urls.push(loc.replace(/\/$/, ''));
      }
    }
  }

  // Fallback: if the first-level sitemap directly contained URLs
  if (urls.length === 0) {
    for (const loc of nested) {
      if (/\/en-us\/games\/scratchers\/.+\.html$/.test(loc)) {
        urls.push(loc.replace(/\/$/, ''));
      }
    }
  }

  // Dedup + sort
  return Array.from(new Set(urls)).sort();
}
