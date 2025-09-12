import { newPage, acceptCookies, priceFromString, toNum } from './_util';

export type TopPrizeRow = {
  gameId: string;
  name: string;
  price: number;
  topPrize: number;
  claimed: number;
  total: number;
  asOf: string;
};

export async function fetchTopPrizes(): Promise<TopPrizeRow[]> {
  const { browser, page } = await newPage();

  await page.goto('https://www.galottery.com/en-us/games/scratchers/scratchers-top-prizes-claimed.html', { waitUntil: 'domcontentloaded' });
  await acceptCookies(page);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.waitForFunction(() => document.querySelectorAll('table tr').length > 3, { timeout: 45_000 });

  const asOf = (await page.locator('text=Data as of').first().textContent().catch(()=>''))?.trim() || '';

  const rows = await page.$$eval('table tr', trs =>
    trs.map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent?.trim() || ''))
  );
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
