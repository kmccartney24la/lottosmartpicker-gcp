//scripts/scratchers/parse_game_page.ts
import { chromium, type Page } from "playwright";
import { oddsFromText } from "./_util.js";

export type GameDetail = {
  slug: string;                 // last path segment (e.g., "200x-the-money")
  url: string;                  // full URL
  name?: string;
  gameNumber?: number;          // parsed from "Game #1234"
  price?: number;               // ticket price in dollars
  overallOdds?: number;         // divisor from "1 in X"
  launchDate?: string;          // ISO-ish text if found
  endDate?: string;             // ISO-ish text if found
};

async function textContent(page: Page, sel: string): Promise<string | undefined> {
  const el = await page.locator(sel).first();
  try {
    if (await el.count()) {
      const t = (await el.innerText()).trim();
      return t || undefined;
    }
  } catch {}
  return undefined;
}

function pickFirst<T>(...vals: (T | undefined | null | "" | false)[]): T | undefined {
  for (const v of vals) {
    if (v !== undefined && v !== null && v !== "" && v !== false) return v as T;
  }
  return undefined;
}

function findDate(text?: string): string | undefined {
  if (!text) return undefined;
  const m = text.match(/\b(?:\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2},\s*\d{4})\b/);
  return m?.[0];
}

export async function fetchGameDetails(slugs: string[]): Promise<GameDetail[]> {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  const details: GameDetail[] = [];
  try {
    for (const slug of slugs) {
      const url = `https://www.galottery.com/en-us/games/scratchers/${slug}.html`;
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });

        // Nudge hydration
        await page.waitForTimeout(800);
        for (let i = 0; i < 8; i++) {
          await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.9));
          await page.waitForTimeout(150);
        }

        const name = pickFirst<string>(
          await textContent(page, "h1"),
          await textContent(page, '.game-title, [class*="game-title"]'),
          await textContent(page, ".title, .page-title"),
        );

        // Harvest visible text blob once; regex from here.
        const allText = await page.evaluate(() => document.body?.innerText || "");

        // Game Number
        const gameNo = (() => {
          const m = allText.match(/game\s*#\s*(\d{2,5})/i);
          return m ? Number(m[1]) : undefined;
        })();

        // Ticket Price
        const price = (() => {
          // Prefer "Ticket Price: $X" then "Price: $X" then any $X near ticket wording
          const m1 = allText.match(/ticket\s*price[^$]*\$\s*([0-9]+(?:\.[0-9]{1,2})?)/i);
          if (m1) return Number(m1[1]);
          const m2 = allText.match(/\bprice[^$]*\$\s*([0-9]+(?:\.[0-9]{1,2})?)/i);
          if (m2) return Number(m2[1]);
          const m3 = allText.match(/\$\s*([0-9]+(?:\.[0-9]{1,2})?)/);
          if (m3) return Number(m3[1]);
          return undefined;
        })();

        // Odds
        const overallOdds = oddsFromText(allText);

        // Dates
        const launchDate = (() => {
          const m = allText.match(/(start|launch)\s*date[:\s]+([^\n]+)/i);
          return findDate(m?.[2]);
        })();
        const endDate = (() => {
          const m = allText.match(/(end|closing)\s*date[:\s]+([^\n]+)/i);
          return findDate(m?.[2]);
        })();

        details.push({ slug, url, name, gameNumber: gameNo, price, overallOdds, launchDate, endDate });
      } catch {
        details.push({ slug, url, name: undefined });
      } finally {
        await page.close().catch(() => {});
        await ctx.close().catch(() => {});
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  return details;
}
