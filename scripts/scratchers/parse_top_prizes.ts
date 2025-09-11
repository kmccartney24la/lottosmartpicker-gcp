// scripts/scratchers/parse_top_prizes.ts
import { chromium, Page } from 'playwright';
import { toNum, priceFromString } from './_util';

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
  const selectors = [
    '#onetrust-accept-btn-handler',
    'button#onetrust-accept-btn-handler',
    'button:has-text("Accept")',
    'button:has-text("Accept All")',
  ];
  for (const sel of selectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.count()) {
        await btn.click({ timeout: 3000 });
        break;
      }
    } catch {}
  }
}

export async function fetchTopPrizes(): Promise<TopPrizeRow[]> {
  const browser = await chromium.launch({
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  await page.goto('https://www.galottery.com/en-us/games/scratchers/scratchers-top-prizes-claimed.html', { waitUntil: 'domcontentloaded' });
  await acceptCookies(page);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

  // Wait for "table has at least one data row"
  await page.waitForSelector('table tr:has(td)', { timeout: 30000 });

  const asOf = (await page.locator('text=Data as of').first().textContent().catch(()=>null) || '').trim();

  const rows = await page.$$eval('table tr', trs => trs.map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent?.trim() || '')));
  const body = rows.filter(cells => cells.length >= 6);

  const out = body.map(c => ({
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