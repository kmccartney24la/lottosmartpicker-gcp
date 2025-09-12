// scripts/scratchers/parse_top_prizes.ts
import { openAndReady, acceptCookies, priceFromString, toNum, closeAll, saveDebug } from './_util';

export type TopPrizeRow = {
  gameId: string;
  name: string;
  price: number;
  topPrize: number;
  claimed: number;
  total: number;
  asOf: string;
};

const TOP_PRIZES_URL =
  'https://www.galottery.com/en-us/games/scratchers/active-games/scratchers-top-prizes-claimed.html';

export async function fetchTopPrizes(): Promise<TopPrizeRow[]> {
  const { browser, context, page } = await openAndReady(TOP_PRIZES_URL);
  try {
    await acceptCookies(page).catch(() => {});
    // Snapshot for debugging, but don’t fail if it errors
    await saveDebug(page, 'top_prizes').catch(() => {});

    // Try CSV/JSON embedded first
    const raw = await page.evaluate(() => {
      // Some GA pages expose a JSON blob or data-table; fall back to table scrape
      const pre = Array.from(document.querySelectorAll('script,pre')).map((n) => n.textContent || '');
      return pre.find((t) => /Top\s*Prizes/i.test(t)) || '';
    });

    let asOf =
      (await page.locator('text=/As\\s*of\\s*[:]?/i').first().textContent().catch(() => null))?.replace(/.*As\s*of[:\s]*/i, '').trim() ||
      new Date().toISOString().slice(0, 10);

    // Table scrape (tolerant)
    const rows = await page.$$eval('table tr', (trs) =>
      trs.map((tr) => Array.from(tr.querySelectorAll('th,td')).map((td) => (td.textContent || '').trim())),
    );

    // Find header row
    const headerIdx = rows.findIndex((r) =>
      r.join(' ').toLowerCase().includes('game') && r.join(' ').toLowerCase().includes('prize'),
    );
    const body = rows.slice(headerIdx + 1).filter((r) => r.length >= 5);

    // Expected columns (tolerant): [Game No., Game Name, Price, Top Prize, Claimed, Total]
    const out = body
      .map((c) => {
        const id = (c[0] || '').match(/(\d{2,6})/)?.[1] || '';
        return {
          gameId: id,
          name: c[1] || '',
          price: priceFromString(c[2]),
          topPrize: toNum(c[3]),
          claimed: toNum(c[4]),
          total: toNum(c[5]),
          asOf,
        };
      })
      .filter((r) => r.gameId);

    return out;
  } catch (e) {
    await saveDebug(page, 'top_prizes_fail');
    throw e;
  } finally {
    await closeAll(browser, context);
  }
}
