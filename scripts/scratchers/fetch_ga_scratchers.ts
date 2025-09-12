// Run with: npx --yes tsx scripts/scratchers/fetch_ga_scratchers.ts
import path from 'node:path';
import fs from 'node:fs/promises';

import { fetchTopPrizes } from './parse_top_prizes';
import { fetchGameLinks } from './parse_lists';
import { fetchGameDetails } from './parse_game_page';
import { ensureDir, readJSON, writeJSON, today, md5, withRetry } from './_util';

const OUT_DIR = path.resolve('public/data/ga_scratchers');
const LATEST = path.join(OUT_DIR, 'index.latest.json');
const MERGED = path.join(OUT_DIR, 'index.json');

type Tier = { name: string; prizeValue: number; totalCount: number; remainingCount: number; };
type Game = {
  gameId: string; name: string; price: number;
  status: 'active'|'ended'|'ending';
  launchDate?: string; endDate?: string; overallOdds?: number;
  tiers: Tier[];
};
type Snapshot = { date: string; games: Game[] };

function mergeSnapshots(prev: Snapshot[] | null, latest: Snapshot): Snapshot[] {
  const arr = prev ? prev.slice() : [];
  const hasSameDate = arr.some(s => s.date === latest.date);
  if (!hasSameDate) arr.push(latest);
  return arr;
}

async function fetchActiveGames(): Promise<Game[]> {
  // 1) Cards + links
  const { active, ended } = await withRetry(() => fetchGameLinks(), { tries: 3, label: 'links' });

  // 2) Top-prize table
  const topPrizes = await withRetry(() => fetchTopPrizes(), { tries: 3, label: 'top-prizes' });

  // 3) Odds/dates per game
  const ids = Array.from(new Set([...active, ...ended].map(g => g.gameId)));
  const details = await withRetry(() => fetchGameDetails(ids), { tries: 3, label: 'details' });

  const linkById = new Map([...active, ...ended].map(g => [g.gameId, g]));
  const topById  = new Map(topPrizes.map(t => [t.gameId, t]));
  const detById  = new Map(details.map(d => [d.gameId, d]));

  const games: Game[] = ids.map(id => {
    const link = linkById.get(id)!;
    const det  = detById.get(id);
    const tpr  = topById.get(id);

    const tiers: Tier[] = [];
    if (tpr && tpr.topPrize > 0) {
      const remaining = Math.max(0, (tpr.total ?? 0) - (tpr.claimed ?? 0));
      tiers.push({
        name: 'Top Prize',
        prizeValue: tpr.topPrize,
        totalCount: tpr.total ?? 0,
        remainingCount: remaining,
      });
    }

    return {
      gameId: id,
      name: det?.name ?? link.name,
      price: link.price,
      status: link.status,
      launchDate: det?.launchDate,
      endDate: det?.endDate,
      overallOdds: det?.overallOdds,
      tiers,
    };
  });

  return games;
}

async function main() {
  await ensureDir(OUT_DIR);

  const games = await fetchActiveGames();
  const latest: Snapshot = { date: today(), games };

  const latestStr = await writeJSON(LATEST, latest);
  const prev = await readJSON<Snapshot[]>(MERGED);
  const merged = mergeSnapshots(prev, latest);
  const mergedStr = JSON.stringify(merged, null, 2);

  if (prev) {
    const oldBytes = Buffer.byteLength(JSON.stringify(prev));
    const newBytes = Buffer.byteLength(mergedStr);
    if (newBytes < oldBytes) {
      console.warn('Anti-truncation guard tripped; keeping previous merged file.');
      await writeJSON(MERGED, prev);
      console.log('latest.md5', md5(latestStr));
      console.log('merged.md5', md5(JSON.stringify(prev, null, 2)));
      return;
    }
  }
  await fs.writeFile(MERGED, mergedStr, 'utf8');

  console.log('latest.md5', md5(latestStr));
  console.log('merged.md5', md5(mergedStr));
}

main().catch(e => { console.error(e); process.exit(1); });
