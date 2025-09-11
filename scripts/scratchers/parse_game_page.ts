// scripts/scratchers/parse_game_page.ts
import { chromium } from 'playwright';
import { oddsFromText } from './_util';

export type GameDetail = {
  gameId: string;
  name?: string;
  overallOdds?: number;     // “1 in X”
  launchDate?: string;      // parse if present in page copy
  endDate?: string;         // for ended games (if copy shows it)
};

export async function fetchGameDetails(gameIds: string[]): Promise<GameDetail[]> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const out: GameDetail[] = [];

  for (const id of gameIds) {
    const url = `https://www.galottery.com/en-us/games/scratchers/${id}.html`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    async function acceptCookies(page: Page) { /* same as above */ }
    // After page.goto(...):
    await acceptCookies(page);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    // Wait for “Game Number: <id>” or the headline to appear:
    await page.waitForSelector(`text=Game Number: ${id}`, { timeout: 15000 }).catch(() => {});

    const body = (await page.content()) || '';
    const name = await page.locator('h1,h2').first().textContent().catch(()=>null) || undefined;

    // Pull the odds line (works across the pages we tested)
    const oddsLine = await page.locator('text=/Overall\\s+odds\\s+of\\s+winning/i').first().textContent().catch(()=>null) || '';
    const overallOdds = oddsFromText(oddsLine || body);

    // Optional: capture dates if present in copy (“Launch Date: …” / “End Date: …”)
    const launch = body.match(/Launch Date:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i)?.[1];
    const end    = body.match(/(End(ed)? Date|Last Day to Redeem):\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i)?.[3];

    out.push({ gameId: id, name, overallOdds, launchDate: launch, endDate: end });
  }
  await browser.close();
  return out;
}
