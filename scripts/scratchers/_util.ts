import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Page, type Browser, type BrowserContext } from 'playwright';

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export function ensureError(e: unknown): Error {
  return e instanceof Error ? e : new Error(typeof e === 'string' ? e : 'Unknown failure');
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

export async function readJSON<T>(file: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch { return null; }
}

export async function writeJSON(file: string, data: unknown) {
  const s = JSON.stringify(data, null, 2);
  await fs.writeFile(file, s, 'utf8');
  return s;
}

export function md5(buf: Buffer | string) {
  return crypto.createHash('md5').update(buf).digest('hex');
}

export const toNum = (s: string) => {
  const t = s.replace(/[,\$]/g,'').trim();
  if (!t || t === '—' || t.toLowerCase()==='na') return 0;
  if (/^1\s*in\s*/i.test(t)) return parseFloat(t.replace(/^1\s*in\s*/i,'').trim()) || 0;
  return parseFloat(t) || 0;
};
export const priceFromString = (s: string) => toNum(s.replace(/[^0-9.]/g,''));
export const oddsFromText = (s: string) => {
  const m = s.match(/1\s*in\s*([0-9.]+)/i);
  return m ? parseFloat(m[1]) : undefined;
};

// ---------- Playwright helpers ----------

export async function launch(): Promise<Browser> {
  return chromium.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
}

export async function newPage(): Promise<{ browser: Browser, context: BrowserContext, page: Page }> {
  const browser = await launch();
  const context = await browser.newContext({
    locale: 'en-US',
    viewport: { width: 1280, height: 1800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  return { browser, context, page };
}

export async function acceptCookies(page: Page) {
  const selectors = [
    '#onetrust-accept-btn-handler',
    'button#onetrust-accept-btn-handler',
    'button:has-text("Accept")',
    'button:has-text("Accept All")',
  ];
  for (const sel of selectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.count()) { await btn.click({ timeout: 3000 }); break; }
    } catch { /* ignore */ }
  }
}

export async function waitForNumericGameLinks(page: Page, timeout = 60_000) {
  await page.waitForFunction(() => {
    const as = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/games/scratchers/"]'));
    return as.some(a => /\/scratchers\/\d+\.html/i.test(a.href));
  }, { timeout });
}

export async function openAndReady(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await acceptCookies(page);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await waitForNumericGameLinks(page, 60_000);
  await autoScroll(page);
}

export async function autoScroll(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>(resolve => {
      let last = 0;
      const id = setInterval(() => {
        window.scrollBy(0, 1400);
        const h = document.body.scrollHeight;
        if (h === last) { clearInterval(id); resolve(); }
        last = h;
      }, 300);
    });
  });
}

// ---------- Retry ----------

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { tries?: number; delayMs?: number; label?: string } = {}
): Promise<T> {
  const tries = opts.tries ?? 3;
  const base = opts.delayMs ?? 1500;
  let lastErr: Error | null = null;
  for (let i = 1; i <= tries; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = ensureError(e);
      const wait = base * i;
      console.warn(`[retry ${opts.label ?? ''}] attempt ${i}/${tries} failed: ${lastErr.message}; sleeping ${wait}ms`);
      if (i < tries) await sleep(wait);
    }
  }
  throw lastErr ?? new Error('Unknown failure');
}
