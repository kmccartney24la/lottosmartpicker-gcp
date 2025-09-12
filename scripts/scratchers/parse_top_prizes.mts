import { chromium, Page } from 'playwright';
import { toNum, priceFromString } from './_util.mts';

export type TopPrizeRow = {
  gameId: string;
  name: string;
  price: number;
  topPrize: number;
  claimed: number;
  total: number;
  asOf: string;
};

// --- add these helpers (mirrors parse_lists.mts) ---
async function launch() {
  return chromium.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
}
async function newPage() {
  const browser = await launch();
  const context = await browser.newContext({
    locale: 'en-US',
    viewport: { width: 1280, height: 1800 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  return { browser, context, page };
}
async function acceptCookies(page: Page) {
  const sels = [
    '#onetrust-accept-btn-handler',
    'button#onetrust-accept-btn-handler',
    'button:has-text("Accept")',
    'button:has-text("Accept All")',
  ];
  for (const s of sels) {
    try {
      const btn = page.locator(s).first();
      if (await btn.count()) { await btn.click({ timeout: 3000 }).catch(()=>{}); break; }
    } catch {}
  }
}
// ---------------------------------------------------

export async function fetchTopPrizes(): Promise<TopPrizeRow[]> {
  const { browser, page } = await newPage();

  await page.goto(
    'https://www.galottery.com/en-us/games/scratchers/scratchers-top-prizes-claimed.html',
    { waitUntil: 'domcontentloaded' }
  );
  await acceptCookies(page);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

  // More robust: wait until there is at least 1 data cell in the table.
  await page.waitForFunction(
    () => document.querySelectorAll('table tr td').length > 0,
    null,
    { timeout: 45000 }
  );

  const asOf =
    (await page.locator('text=Data as of').first().textContent().catch(() => ''))?.trim() ?? '';

  // Read all rows (header + body), then slice away the header.
  const rows = await page.$$eval('table tr', trs =>
    trs.map(tr => Array.from(tr.querySelectorAll('th,td')).map(td => td.textContent?.trim() || ''))
  );

  // Find the header row dynamically and take everything after it.
  const headerIdx = rows.findIndex(r => r.length >= 4 && /game/i.test(r.join(' ')) && /prize/i.test(r.join(' ')));
  const body = rows.slice(headerIdx + 1).filter(cells => cells.length >= 6);

  const out: TopPrizeRow[] = body.map(c => ({
    gameId: c[0],
    name: c[1],
    price: priceFromString(c[2]),
    topPrize: toNum(c[3]),
    claimed: toNum(c[4]),
    total: toNum(c[5]),
    asOf,
  }));

  await browser.close();
  return out;
}
