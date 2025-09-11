// scripts/scratchers/parse_top_prizes.ts
import { chromium } from 'playwright';
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

export async function fetchTopPrizes(): Promise<TopPrizeRow[]> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://www.galottery.com/en-us/games/scratchers/scratchers-top-prizes-claimed.html', { waitUntil: 'domcontentloaded' });
  // Wait for client-rendered table — use a generic “table row after header” selector:
  await page.waitForSelector('table tr >> nth=1', { timeout: 30000 });

  // Get the “Data as of …” text:
  const asOf = (await page.locator('text=Data as of').first().textContent() || '').trim();

  // Read every row (skip header)
  const rows = await page.$$eval('table tr', trs => trs.map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent?.trim() || '')));
  const body = rows.filter(cells => cells.length >= 6); // [Game#, Name, Price, Top Prize, Claimed, Total]

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
