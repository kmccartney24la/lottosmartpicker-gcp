// scripts/scratchers/parse_game_page.ts
import { chromium } from 'playwright';
import { openAndReady, acceptCookies, oddsFromText, closeAll } from './_util';

export type GameDetail = {
  gameId: string;          // numeric id
  url: string;
  name?: string;
  price?: number;          // ticket price ($)
  overallOdds?: number;    // “1 in X” => X
  launchDate?: string;
  endDate?: string;
};

function idFromUrl(url: string): string {
  const m = url.match(/(\d{2,6})(?:[/?#]|$)/);
  return m?.[1] ?? '';
}

export async function fetchGameDetails(urls: string[]): Promise<GameDetail[]> {
  const out: GameDetail[] = [];
  const { browser, context } = await chromium.launch().then(async (b) => {
    // We’ll reuse our own openAndReady per-url for hydration accuracy.
    return { browser: b, context: await b.newContext({ viewport: { width: 1280, height: 900 } }) };
  });

  try {
    for (const url of urls) {
      const { page } = await openAndReady(url);
      try {
        await acceptCookies(page).catch(() => {});
        const gameId = idFromUrl(url);

        // Name: first H1/H2 or aria-landmark
        const name =
          (await page.locator('h1, h2, [data-testid*="title"]').first().textContent().catch(() => null))?.trim() ||
          undefined;

        // Price: look anywhere in the card/body for $X
        const body = await page.content();
        const priceMatch = body.match(/\$\s?(\d{1,3})(?:\.\d{2})?\s*(?:ticket|per|price)?/i);
        const price = priceMatch ? Number(priceMatch[1]) : undefined;

        // Overall odds: “Overall odds of winning 1 in X” (tolerant)
        const oddsNode =
          (await page.locator('text=/Overall\\s+odds/i').first().textContent().catch(() => null)) || body;
        const overallOdds = oddsFromText(oddsNode || undefined);

        // Dates
        const launch = body.match(/Launch Date:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i)?.[1];
        const end =
          body.match(/(End(ed)? Date|Last Day to Redeem):\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i)?.[3];

        out.push({ gameId, url, name, price, overallOdds, launchDate: launch, endDate: end });
      } finally {
        await page.close().catch(() => {});
      }
    }
  } finally {
    await closeAll(browser, context);
  }
  return out;
}
