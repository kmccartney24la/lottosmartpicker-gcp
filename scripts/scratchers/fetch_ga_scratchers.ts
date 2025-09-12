// scripts/scratchers/fetch_ga_scratchers.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { withRetry, newBrowser, newContext, closeAll, saveDebug } from './_util';
import { fetchGameLinks } from './parse_lists';
import { parseGamePage } from './parse_game_page';
import { parseTopPrizes } from './parse_top_prizes';

const OUT_DIR = 'public/data/ga_scratchers';
const LATEST_PATH = path.join(OUT_DIR, 'index.latest.json');
const MERGED_PATH = path.join(OUT_DIR, 'index.json');

type Game = {
  url: string;
  name?: string;
  number?: string | number;
  price?: number;
  overallOdds?: number;
  topPrize?: number;
  prizes?: any;
  [k: string]: any;
};

async function ensureOutDir() {
  await fs.mkdir(OUT_DIR, { recursive: true });
}

async function writeJson(file: string, data: any) {
  await ensureOutDir();
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    const s = await fs.readFile(file, 'utf8');
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

async function fetchDetails(urls: string[]): Promise<Game[]> {
  const { browser } = await newBrowser();
  const { context } = await newContext(browser);

  const results: Game[] = [];
  for (const url of urls) {
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      const game = await parseGamePage(page, url);
      // optional: top prizes live elsewhere or on-page; keep function tolerant
      const top = await parseTopPrizes(page, url).catch(() => null);
      if (top && typeof top === 'object') Object.assign(game, { prizes: top });
      results.push({ url, ...game });
    } catch (e) {
      await saveDebug(page, `game_fail_${Buffer.from(url).toString('base64').slice(0, 12)}`);
    } finally {
      await page.close().catch(() => {});
    }
  }

  await closeAll(browser, context);
  return results;
}

function mergeIndex(existing: { games: Game[] } | null, latest: { games: Game[] }) {
  if (!existing) return latest;
  const byUrl = new Map(existing.games.map(g => [g.url, g]));
  for (const g of latest.games) byUrl.set(g.url, { ...(byUrl.get(g.url) || {}), ...g });
  return { games: Array.from(byUrl.values()).sort((a, b) => String(a.url).localeCompare(String(b.url))) };
}

export async function main() {
  await ensureOutDir();

  const { active, ended } = await withRetry(fetchGameLinks, {
    attempts: 3,
    label: 'links',
  });

  const all = Array.from(new Set([...active, ...ended])).sort();
  if (all.length === 0) {
    throw new Error('No scratcher links discovered from SPA or sitemap.');
  }

  const games = await fetchDetails(all);

  const latest = { generatedAt: new Date().toISOString(), count: games.length, games };
  await writeJson(LATEST_PATH, latest);

  // merge with historical index.json if exists
  const prior = await readJson<{ games: Game[] }>(MERGED_PATH);
  const merged = mergeIndex(prior, { games });
  await writeJson(MERGED_PATH, merged);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
