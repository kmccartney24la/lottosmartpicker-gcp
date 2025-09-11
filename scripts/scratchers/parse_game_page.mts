// scripts/scratchers/parse_game_page.mts
import { chromium, Page } from 'playwright';
// Local utilities are ESM modules with explicit extension
import { oddsFromText } from './_util.mts';

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
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const context = await browser.newContext({
    locale: 'en-US',
    timezoneId: 'America/New_York',
    geolocation: { latitude: 33.7490, longitude: -84.3880 }, // Atlanta
    permissions: ['geolocation'],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    viewport: { width: 1280, height: 1800 },
  });

  const page = await context.newPage();
  const out: GameDetail[] = [];

  async function acceptCookies(p: Page) {
    const sels = [
      '#onetrust-accept-btn-handler',
      'button#onetrust-accept-btn-handler',
      'button:has-text("Accept")',
      'button:has-text("Accept All")',
      'button:has-text("I ACCEPT")',
      'button:has-text("I Accept")',
    ];
    for (const s of sels) {
      try {
        const btn = p.locator(s).first();
        if (await btn.count()) { await btn.click({ timeout: 2000 }).catch(()=>{}); break; }
      } catch {}
    }
  }

  for (const id of gameIds) {
    const url = `https://www.galottery.com/en-us/games/scratchers/${id}.html`;
    await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(()=>{});
    await acceptCookies(page);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(()=>{});

    // Try multiple anchors for the “Game Number”
    await page.waitForSelector(`text=/Game Number\\s*:?\\s*${id}/i`, { timeout: 10000 }).catch(()=>{});
    const body = (await page.content()) || '';

    const name = (await page.locator('h1,h2').first().textContent().catch(()=>null) || undefined)?.trim();

    const oddsLine =
      await page.locator('text=/Overall\\s+odds\\s+of\\s+winning/i').first().textContent().catch(()=>null) || '';
    const overallOdds = oddsFromText(oddsLine || body);

    const launch = body.match(/Launch Date:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i)?.[1];
    const end    = body.match(/(End(ed)? Date|Last Day to Redeem):\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i)?.[3];

    out.push({ gameId: id, name, overallOdds, launchDate: launch, endDate: end });
  }

  await context.close();
  await browser.close();
  return out;
}