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

async function acceptCookies(p: Page) {
  const btn = p.locator('#onetrust-accept-btn-handler, button:has-text("Accept"), button:has-text("Accept All")').first();
  if (await btn.count()) await btn.click({ timeout: 2000 }).catch(()=>{});
}

export async function fetchTopPrizes(): Promise<TopPrizeRow[]> {
  const browser = await chromium.launch({ args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'] });
  const context = await browser.newContext({ locale: 'en-US', timezoneId: 'America/New_York' });
  const page = await context.newPage();

  await page.goto('https://www.galottery.com/en-us/games/scratchers/scratchers-top-prizes-claimed.html', { waitUntil: 'domcontentloaded' });
  await acceptCookies(page);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

  await page.waitForSelector('table tr >> nth=1', { timeout: 30000 });
  const asOf = (await page.locator('text=Data as of').first().textContent().catch(()=>''))?.trim() || '';

  const rows = await page.$$eval('table tr', trs =>
    trs.map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent?.trim() || ''))
  );
  const body = rows.filter(c => c.length >= 6);

  const out = body.map(c => ({
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