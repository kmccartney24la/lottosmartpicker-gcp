// scripts/scratchers/parse_top_prizes.mts
import { chromium, Page } from 'playwright';
import fs from 'node:fs/promises';
import { toNum, priceFromString } from './_util.mts';

export type TopPrizeRow = {
  gameId: string;
  name: string;
  price: number;
  topPrize: number;
  claimed: number;
  total: number;
  asOf: string; // “Data as of …”
};

async function acceptCookies(page: Page) {
  const sels = [
    '#onetrust-accept-btn-handler',
    'button#onetrust-accept-btn-handler',
    'button:has-text("Accept")',
    'button:has-text("Accept All")',
  ];
  for (const sel of sels) {
    try {
      const loc = page.locator(sel).first();
      if (await loc.count()) { await loc.click({ timeout: 3000 }); break; }
    } catch {}
  }
}

export async function fetchTopPrizes(): Promise<TopPrizeRow[]> {
  const browser = await chromium.launch({
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    locale: 'en-US',
    viewport: { width: 1280, height: 1800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  await page.goto('https://www.galottery.com/en-us/games/scratchers/scratchers-top-prizes-claimed.html', { waitUntil: 'domcontentloaded' });
  await acceptCookies(page);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

  // Wait until either “Data as of” appears OR we see any table with >1 row
  await page.waitForFunction(() => {
    const hasAsOf = document.body && document.body.innerText && document.body.innerText.includes('Data as of');
    const hasTable = Array.from(document.querySelectorAll('table'))
      .some(t => t.querySelectorAll('tr').length > 1);
    return hasAsOf || hasTable;
  }, { timeout: 60000 });

  // Extract “Data as of …” if present
  const asOf = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null, text = '';
    while ((node = walker.nextNode())) {
      const t = (node.textContent || '').trim();
      if (t.toLowerCase().includes('data as of')) { text = t; break; }
    }
    return text;
  });

  // Pull the largest table’s cells
  const cells = await page.$$eval('table', (tables) => {
    let bestIndex = -1, bestRows = 0;
    tables.forEach((t, i) => {
      const n = t.querySelectorAll('tr').length;
      if (n > bestRows) { bestRows = n; bestIndex = i; }
    });
    if (bestIndex === -1) return [] as string[][];
    const trs = Array.from(tables[bestIndex].querySelectorAll('tr'));
    return trs.map(tr => Array.from(tr.querySelectorAll('td,th')).map(td => (td.textContent || '').trim()));
  });

  // Heuristic: rows whose first cell is a number are data rows
  const body = cells.filter(row => row.length >= 6 && /^\d+$/.test(row[0]));

  if (!body.length) {
    // Dump debug artifacts so you can inspect what rendered on CI
    const dbgDir = 'public/data/ga_scratchers';
    try {
      await fs.mkdir(dbgDir, { recursive: true });
      await page.screenshot({ path: `${dbgDir}/_debug_top_prizes.png`, fullPage: true });
      await fs.writeFile(`${dbgDir}/_debug_top_prizes.html`, await page.content(), 'utf8');
    } catch {}
    throw new Error('Top prizes table not found or empty after wait.');
  }

  const out: TopPrizeRow[] = body.map(c => ({
    gameId: c[0],
    name: c[1],
    price: priceFromString(c[2]),
    topPrize: toNum(c[3]),
    claimed: toNum(c[4]),
    total: toNum(c[5]),
    asOf,
  }));

  await context.close();
  await browser.close();
  return out;
}
