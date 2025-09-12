// scripts/scratchers/parse_lists.ts
import {
  openAndReady,
  waitForNumericGameLinks,
  saveDebug,
  closeAll,
  acceptCookies,
  scrapeScratchersFromSitemap,
} from './_util';

const ACTIVE_URL = 'https://www.galottery.com/en-us/games/scratchers/active-games.html';
const ENDED_URL  = 'https://www.galottery.com/en-us/games/scratchers/ended-games.html';

function normalizeUrl(u: string): string {
  return u.split('#')[0].replace(/\/$/, '');
}

async function collectFromSpa(url: string, debugTag: string): Promise<string[]> {
  const { browser, context, page } = await openAndReady(url);
  try {
    await acceptCookies(page).catch(() => {});
    // Ask for *at least one* — we just need a signal that the page yields anchors.
    // If zero, we will fall back to the sitemap path.
    const hrefs = await waitForNumericGameLinks(page, 1, 60_000);
    return hrefs.map(normalizeUrl);
  } catch (e) {
    await saveDebug(page, `links_from_${debugTag}_fail`);
    return [];
  } finally {
    await closeAll(browser, context);
  }
}

export async function fetchGameLinks(): Promise<{ active: string[]; ended: string[] }> {
  // 1) Try SPA pages first. NEVER throw here.
  const [activeSpa, endedSpa] = await Promise.all([
    collectFromSpa(ACTIVE_URL, 'active'),
    collectFromSpa(ENDED_URL, 'ended'),
  ]);

  const activeSpaSet = new Set(activeSpa.map(normalizeUrl));
  const endedSpaSet  = new Set(endedSpa.map(normalizeUrl));

  // 2) If either list is empty, crawl the sitemap and build both lists from it.
  //    (On CI we often get 0 from both pages.)
  if (activeSpaSet.size === 0 || endedSpaSet.size === 0) {
    const all = await scrapeScratchersFromSitemap();
    // Heuristic split
    const active = all.filter(u =>
      /\/en-us\/games\/scratchers\//.test(u) && !/\/ended-games\//.test(u) && !/\/scratchers\/ended-/.test(u),
    );
    const ended  = all.filter(u => /\/ended-games\//.test(u) || /\/scratchers\/ended-/.test(u));

    // If sitemap somehow returns nothing, still return the SPA results (maybe one side had data).
    const finalActive = active.length ? active : Array.from(activeSpaSet);
    const finalEnded  = ended.length  ? ended  : Array.from(endedSpaSet);

    return {
      active: Array.from(new Set(finalActive.map(normalizeUrl))).sort(),
      ended:  Array.from(new Set(finalEnded.map(normalizeUrl))).sort(),
    };
  }

  // 3) Both SPA lists had content; use them.
  return {
    active: Array.from(activeSpaSet).sort(),
    ended:  Array.from(endedSpaSet).sort(),
  };
}
