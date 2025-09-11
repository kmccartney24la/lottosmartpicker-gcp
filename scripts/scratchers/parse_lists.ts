// scripts/scratchers/parse_lists.ts
import { chromium, Page } from 'playwright';

type GameLink = { gameId: string; name: string; price: number; href: string; status: 'active'|'ended' };

async function launch() {
  return chromium.launch({
    // headless is default; these flags help on GitHub Actions
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
}

async function newPage() {
  const browser = await launch();
  const context = await browser.newContext({
    locale: 'en-US',
    viewport: { width: 1280, height: 1800 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  });
  const page = await context.newPage();
  // Be generous on CI
  page.setDefaultTimeout(60000);
  return { browser, context, page };
}

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

async function openAndReady(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await acceptCookies(page);
  // Let client JS run; if network never fully idles, don't fail
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  // Wait for at least one scratcher link rather than a heading string
  await page.waitForSelector('a[href*="/games/scratchers/"]', { timeout: 45000 });
  await autoScroll(page);
}

async function autoScroll(page: Page) {
  // Simple scroll loop until height stops growing
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let last = 0;
      const id = setInterval(() => {
        window.scrollBy(0, 1400);
        const h = document.body.scrollHeight;
        if (h === last) {
          clearInterval(id);
          resolve();
        }
        last = h;
      }, 300);
    });
  });
}

async function collectFrom(page: Page, status: 'active'|'ended'): Promise<GameLink[]> {
  // Grab all links that look like scratcher details
  const links = await page.$$eval('a[href*="/games/scratchers/"]', (as) =>
    as
      .map((a) => ({ href: (a as HTMLAnchorElement).href, text: a.textContent || '', html: (a as HTMLElement).innerHTML }))
      .filter((x) => /\/games\/scratchers\/\d+\.html/i.test(x.href))
  );

  // Dedupe by gameId; heuristically get name/price from nearby text
  const out: GameLink[] = [];
  const seen = new Set<string>();
  for (const l of links) {
    const m = l.href.match(/\/scratchers\/(\d+)\.html/i);
    if (!m) continue;
    const gameId = m[1];
    if (seen.has(gameId)) continue;
    seen.add(gameId);

    // Look upward a bit for the enclosing "card" text
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
