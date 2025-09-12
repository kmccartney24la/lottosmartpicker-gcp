// scripts/scratchers/parse_lists.ts
import { openAndReady, waitForNumericGameLinks, saveDebug, closeAll, acceptCookies } from './_util';

const ACTIVE_URL = 'https://www.galottery.com/en-us/games/scratchers/active-games.html';
const ENDED_URL  = 'https://www.galottery.com/en-us/games/scratchers/ended-games.html';

function normalizeUrl(u: string): string {
  return u.split('#')[0].replace(/\/$/, '');
}

async function collectFrom(url: string, min = 5): Promise<string[]> {
  const { browser, context, page } = await openAndReady(url);
  try {
    await acceptCookies(page).catch(() => {});
    const hrefs = await waitForNumericGameLinks(page, min, 60_000);
    return hrefs.map(normalizeUrl).sort();
  } catch (e) {
    await saveDebug(page, `links_from_${url.includes('ended') ? 'ended' : 'active'}_fail`);
    throw e;
  } finally {
    await closeAll(browser, context);
  }
}

export async function fetchGameLinks(): Promise<{ active: string[]; ended: string[] }> {
  const [active, ended] = await Promise.all([
    collectFrom(ACTIVE_URL, 5),
    collectFrom(ENDED_URL, 5).catch(() => []), // ended may be empty during transitions; tolerate
  ]);

  // Dedupe and stabilize
  const uniq = (arr: string[]) => Array.from(new Set(arr)).sort();
  return { active: uniq(active), ended: uniq(ended) };
}
