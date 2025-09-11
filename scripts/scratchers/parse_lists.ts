// scripts/scratchers/parse_lists.ts
import { chromium, Page } from 'playwright';

type GameLink = { gameId: string; name: string; price: number; href: string; status: 'active'|'ended' };

async function collectFrom(page: Page, status: 'active'|'ended'): Promise<GameLink[]> {
  // Cards are client-injected. Wait for “Sort by ticket price” (active) or page header (ended).
  await page.waitForSelector('text=Active Games, text=Ended Games', { timeout: 30000 });

  // Heuristic: any link under the grid that points to “…/scratchers/<id>.html”
  const links = await page.$$eval('a[href*="/games/scratchers/"]', as => as
    .map(a => ({ href: (a as HTMLAnchorElement).href, text: a.textContent||'' }))
    .filter(x => /\/games\/scratchers\/\d+\.html/i.test(x.href)));

  // Deduplicate by gameId; extract id/name/price from nearby card text
  const seen = new Set<string>();
  const out: GameLink[] = [];
  for (const l of links) {
    const m = l.href.match(/\/scratchers\/(\d+)\.html/i);
    if (!m) continue;
    const gameId = m[1];
    if (seen.has(gameId)) continue;
    seen.add(gameId);

    // Try to find the enclosing card’s text for name/price:
    const handle = await page.$(`a[href$="/${gameId}.html"]`);
    const card = handle ? await handle.evaluate((a:any) => {
      const root = a.closest('article,li,div'); // flexible
      const text = root ? root.textContent : a.textContent;
      return text || '';
    }) : l.text;

    const nameMatch = card.match(/[A-Z0-9$].+?(?=\s*\$?\d+\s*(ticket|game)?|\s*$)/i);
    const priceMatch = card.match(/\$\s?\d{1,2}(\.\d{2})?/);
    const name = nameMatch ? nameMatch[0].trim() : l.text.trim();
    const price = priceMatch ? parseFloat(priceMatch[0].replace(/[$\s]/g,'')) : NaN;

    out.push({ gameId, name, price: isNaN(price) ? 0 : price, href: l.href, status });
  }
  return out;
}

export async function fetchGameLinks() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('https://www.galottery.com/en-us/games/scratchers/active-games.html', { waitUntil: 'domcontentloaded' });
  const active = await collectFrom(page, 'active'); // grid of active games :contentReference[oaicite:5]{index=5}

  await page.goto('https://www.galottery.com/en-us/games/scratchers/ended-games.html', { waitUntil: 'domcontentloaded' });
  const ended  = await collectFrom(page, 'ended');  // grid of ended games  :contentReference[oaicite:6]{index=6}

  await browser.close();
  return { active, ended };
}
