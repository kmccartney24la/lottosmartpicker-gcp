// scripts/scratchers/parse_game_page.ts
import { chromium, Page } from 'playwright';
import { oddsFromText } from './_util';

export type GameDetail = {
  gameId: string;
  name?: string;
  overallOdds?: number;     // “1 in X”
  launchDate?: string;      // parse if present in page copy
  endDate?: string;         // for ended games (if copy shows it)
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
    } catch { /* ignore */ }
  }
}

export async function fetchGameDetails(gameIds: string[]): Promise<GameDetail[]> {
  const browser = await chromium.launch({
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  const out: GameDetail[] = [];

  for (const id of gameIds) {
    const url = `https://www.galottery.com/en-us/games/scratchers/${id}.html`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    await acceptCookies(page);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForSelector('h1, h2', { timeout: 15000 }).catch(() => {});

    const body = (await page.content()) || '';
    const name = await page.locator('h1,h2').first().textContent().catch(()=>null) || undefined;

    const oddsLine = await page.locator('text=/Overall\\s+odds\\s+of\\s+winning/i').first().textContent().catch(()=>null) || '';
    const overallOdds = oddsFromText(oddsLine || body);

    const launch = body.match(/Launch Date:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i)?.[1];
    const end    = body.match(/(End(ed)? Date|Last Day to Redeem):\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i)?.[3];

    out.push({ gameId: id, name, overallOdds, launchDate: launch, endDate: end });
  }
  await browser.close();
  return out;
}