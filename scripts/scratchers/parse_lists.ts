import { type Page } from 'playwright';
import { newPage, openAndReady } from './_util';

type GameLink = { gameId: string; name: string; price: number; href: string; status: 'active'|'ended' };

async function collectFrom(page: Page, status: 'active'|'ended'): Promise<GameLink[]> {
  const links = await page.$$eval('a[href*="/games/scratchers/"]', (as) =>
    as
      .map((a) => ({ href: (a as HTMLAnchorElement).href, text: a.textContent || '' }))
      .filter((x) => /\/games\/scratchers\/\d+\.html/i.test(x.href))
  );

  const out: GameLink[] = [];
  const seen = new Set<string>();
  for (const l of links) {
    const m = l.href.match(/\/scratchers\/(\d+)\.html/i);
    if (!m) continue;
    const gameId = m[1];
    if (seen.has(gameId)) continue;
    seen.add(gameId);

    const handle = await page.$(`a[href$="/${gameId}.html"]`);
    let name = '';
    let price = 0;
    if (handle) {
      const cardText = await handle.evaluate((a: any) => {
        const root = a.closest('article,li,div') || a.parentElement;
        return root ? root.textContent || '' : a.textContent || '';
      });
      const nameMatch = cardText.match(/[A-Za-z0-9$][^\n$]{2,60}/);
      const priceMatch = cardText.match(/\$\s?(\d{1,2})(?:\.\d{2})?/);
      name = nameMatch ? nameMatch[0].trim() : '';
      price = priceMatch ? parseFloat(priceMatch[1]) : 0;
    }

    out.push({ gameId, name, price, href: l.href, status });
  }
  return out;
}

export async function fetchGameLinks() {
  const { browser, page } = await newPage();

  await openAndReady(page, 'https://www.galottery.com/en-us/games/scratchers/active-games.html');
  const active = await collectFrom(page, 'active');

  await openAndReady(page, 'https://www.galottery.com/en-us/games/scratchers/ended-games.html');
  const ended  = await collectFrom(page, 'ended');

  await browser.close();
  return { active, ended };
}
