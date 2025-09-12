// scripts/scratchers/_util.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Page, type Browser, type BrowserContext } from 'playwright';

// ---------- small utils ----------
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export function ensureError(e: unknown): Error {
  if (e instanceof Error) return e;
  return new Error(typeof e === 'string' ? e : 'Unknown failure');
}

type RetryOpts = {
  attempts?: number;
  label?: string;
  onError?: (err: Error, attempt: number) => Promise<void> | void;
  baseMs?: number;
  maxMs?: number;
  jitter?: boolean;
};

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
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
      const backoff = Math.min(maxMs, baseMs * Math.pow(1.5, i - 1));
      const sleepMs = jitter ? Math.round(backoff * (0.7 + Math.random() * 0.6)) : backoff;
      console.warn(`[retry ${label}] attempt ${i}/${attempts} failed: ${err.message}; sleeping ${sleepMs}ms`);
      await opts.onError?.(err, i);
      if (i < attempts) await sleep(sleepMs);
    }
  }
  throw lastErr ?? new Error(`withRetry(${label}) failed`);
}

// ---------- paths & debug ----------
const OUT_DIR = 'public/data/ga_scratchers';

async function ensureOutDir() {
  await fs.mkdir(OUT_DIR, { recursive: true });
}

export async function saveDebug(page: Page, nameBase: string): Promise<void> {
  try {
    await ensureOutDir();
    const htmlPath = path.join(OUT_DIR, `_debug_${nameBase}.html`);
    const pngPath = path.join(OUT_DIR, `_debug_${nameBase}.png`);
    await fs.writeFile(htmlPath, await page.content(), 'utf8').catch(() => {});
    await page.screenshot({ path: pngPath, fullPage: true }).catch(() => {});
    console.log(`Saved debug artifacts: ${htmlPath}, ${pngPath}`);
  } catch {
    // ignore
  }
}

// ---------- browser setup ----------
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
    geolocation: { longitude: -84.3880, latitude: 33.7490 },
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

// ---------- hydration & cookies ----------
async function hydrateList(page: Page, { maxScrolls = 14, stepPx = 1400 } = {}) {
  let lastHeight = 0;
  for (let i = 0; i < maxScrolls; i++) {
    await page.evaluate(async (y) => {
      window.scrollBy(0, y);
      await new Promise((r) => setTimeout(r, 250));
    }, stepPx);

    const loadMore = page.locator(
      'button:has-text("Load more"), button:has-text("Show more"), a:has-text("Load more"), a:has-text("Show more")',
    );
    if (await loadMore.first().isVisible().catch(() => false)) {
      await loadMore.first().click().catch(() => {});
      await page.waitForTimeout(600);
    }

    const newHeight = await page.evaluate(
      () => document.scrollingElement?.scrollHeight ?? document.body.scrollHeight ?? 0,
    );
    if (newHeight <= lastHeight) break;
    lastHeight = newHeight;
  }
  await page.evaluate(() => window.scrollTo({ top: 0 }));
}

/** Bring a SPA page to a steady state (usable DOM) */
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

export async function acceptCookies(page: Page) {
  const selectors = [
    '#onetrust-accept-btn-handler',
    'button#onetrust-accept-btn-handler',
    'button:has-text("Accept")',
    'button:has-text("I Accept")',
    'button:has-text("Agree")',
    'button:has-text("Got it")',
  ];
  for (const sel of selectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
        await btn.click({ timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(250);
        break;
      }
    } catch {}
  }
}

// ---------- link discovery ----------
function looksLikeGameLinkText(txt: string): boolean {
  const t = (txt || '').trim();
  if (!t) return false;
  if (/#\s*\d{2,4}\b/i.test(t)) return true;        // "#1234"
  if (/\bNo\.?\s*\d{2,4}\b/i.test(t)) return true;  // "No. 1234"
  if (/\bGame\s*\d{2,4}\b/i.test(t)) return true;   // "Game 1234"
  if (/\$\s*\d+/.test(t)) return true;              // "$1" (often price badge near the link)
  return false;
}

function numericFromUrl(href: string): string | null {
  const m = href.match(/(\d{2,5})(?:\/?$|[?#])/);
  return m?.[1] ?? null;
}

/** Returns candidate scratcher detail URLs (deduped). Throws only after saving debug artifacts. */
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

// ---------- number helpers ----------
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

// ---------- trace close ----------
export async function closeAll(browser: Browser, context: BrowserContext) {
  try {
    if (process.env.TRACE) {
      await ensureOutDir();
      await context.tracing.stop({ path: path.join(OUT_DIR, `_debug_trace.zip`) });
    }
  } catch {}
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}

// ---------- HTTP + sitemap fallback ----------
export async function httpGet(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; GA-ScratchersBot/1.0)',
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      ...(init?.headers as any),
    },
  });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return await res.text();
}

/** Crawl sitemap(s) and return all scratcher detail page URLs. */
export async function scrapeScratchersFromSitemap(): Promise<string[]> {
  const root = 'https://www.galottery.com/sitemap.xml';
  const xml = await httpGet(root);
  const locs = Array.from(xml.matchAll(/<loc>([^<]+?)<\/loc>/g)).map(m => m[1]);

  // collect nested sitemaps and any direct URLs in the root
  const sitemapXmls = new Set<string>(locs.filter(u => u.endsWith('.xml')));
  const directUrls  = locs.filter(u => u.includes('/en-us/games/scratchers/') && u.endsWith('.html'));

  const urls: string[] = [];
  if (directUrls.length) urls.push(...directUrls);

  for (const sm of sitemapXmls) {
    const body = await httpGet(sm);
    const nestedLocs = Array.from(body.matchAll(/<loc>([^<]+?)<\/loc>/g)).map(m => m[1]);
    for (const u of nestedLocs) {
      if (u.includes('/en-us/games/scratchers/') && u.endsWith('.html')) {
        urls.push(u.replace(/\/$/, ''));
      }
    }
  }
  return Array.from(new Set(urls)).sort();
}
