// scripts/scratchers/fetch_ga_scratchers.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureError, withRetry } from './_util';
import { fetchTopPrizes } from './parse_top_prizes';
import { fetchGameLinks } from './parse_lists';
import { fetchGameDetails } from './parse_game_page';

type Game = {
  gameId: string;       // from parse_game_page
  url: string;
  name?: string;
  price?: number;
  overallOdds?: number;
  launchDate?: string;
  endDate?: string;
};

const OUT_DIR = 'public/data/ga_scratchers';

async function writeJson(p: string, data: unknown) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

async function fetchActiveGames(): Promise<Game[]> {
  const { active } = await withRetry(() => fetchGameLinks(), 'retry links', 3);

  const results: Game[] = [];
  const chunkSize = 6; // mild concurrency without hammering the site

  for (let i = 0; i < active.length; i += chunkSize) {
    const chunk = active.slice(i, i + chunkSize);
    // parse_game_page.ts takes an array of URLs and returns an array of GameDetail
    const details = await withRetry(
      () => fetchGameDetails(chunk),
      `game details ${i + 1}-${i + chunk.length}`,
      2,
      1000
    );
    results.push(...details);
  }

  return results;
}

async function main() {
  const games = await fetchActiveGames();
  const topPrizes = await withRetry(() => fetchTopPrizes(), 'top prizes', 2);

  const latest = {
    generatedAt: new Date().toISOString(),
    count: games.length,
    games,
    topPrizes,
  };

  await writeJson(path.join(OUT_DIR, 'index.latest.json'), latest);
  await writeJson(path.join(OUT_DIR, 'index.json'), latest);
}

// Hard-fail on any unhandled async errors so CI surfaces it
process.on('unhandledRejection', (e) => {
  const err = ensureError(e);
  console.error('UNHANDLED REJECTION:', err.stack || err.message);
  process.exit(1);
});

main().catch((e) => {
  const err = ensureError(e);
  console.error(err.stack || err.message || err);
  process.exit(1);
});
