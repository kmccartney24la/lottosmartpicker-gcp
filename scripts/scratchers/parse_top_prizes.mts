// scripts/scratchers/parse_top_prizes.mts
// Replace the previous imports/launch with this:
import type { Page } from 'playwright';
import { newPage } from './parse_lists'; // re-use your hardened setup
import { toNum, priceFromString } from './_util';

export type TopPrizeRow = {
  gameId: string;
  name: string;
  price: number;
  topPrize: number;
  claimed: number;
  total: number;
  asOf: string;
};

async function acceptCookies(page: Page) {
  // Reuse the same selectors you use in parse_lists:
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
    } catch {}
  }
}

async function autoScroll(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
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

export async function fetchTopPrizes(): Promise<TopPrizeRow[]> {
  const { browser, page } = await newPage();  // ← consistent UA/flags/timeouts
  try {
    await page.goto('https://www.galottery.com/en-us/games/scratchers/scratchers-top-prizes-claimed.html', { waitUntil: 'domcontentloaded' });
    await acceptCookies(page);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await autoScroll(page);

    // Be robust: wait until a table exists with at least one data row (>=6 tds)
    await page.waitForFunction(() => {
      const tbl = document.querySelector('table');
      if (!tbl) return false;
      const rows = Array.from(tbl.querySelectorAll('tr'));
      return rows.some(r => r.querySelectorAll('td').length >= 6);
    }, { timeout: 60000 });

    const asOf = (await page.locator('text=Data as of').first().textContent().catch(()=>''))?.trim() || '';

    const rows = await page.$$eval('table tr', trs =>
      trs.map(tr => Array.from(tr.querySelectorAll('td')).map(td => (td.textContent || '').trim()))
    );

    // Filter to only real body rows with 6+ cells and numeric game id
    const body = rows.filter(c => c.length >= 6 && /^\d+$/.test(c[0]));

    if (body.length === 0) {
      console.warn('TopPrizes: zero rows parsed; continuing with empty dataset');
      return [];
    }

    return body.map(c => ({
      gameId:  c[0],
      name:    c[1],
      price:   priceFromString(c[2]),
      topPrize:toNum(c[3]),
      claimed: toNum(c[4]),
      total:   toNum(c[5]),
      asOf,
    }));
  } finally {
    await page.context().browser()?.close().catch(()=>{});
  }
}
