// scripts/scratchers/fetch_ga_scratchers.mts
// Node 20+ ESM. Deps: playwright (via helper modules), crypto (built-in)
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { ensureError } from './_util.mts';

// Explicit extensions keep ESM resolution happy when run via tsx
import { fetchTopPrizes } from './parse_top_prizes.mts';
import { fetchGameLinks } from './parse_lists.mts';
import { fetchGameDetails } from './parse_game_page.mts';

const OUT_DIR = path.resolve('public/data/ga_scratchers');
const LATEST = path.join(OUT_DIR, 'index.latest.json');
const MERGED = path.join(OUT_DIR, 'index.json');
const sleep = (ms:number)=>new Promise(r=>setTimeout(r,ms));

type Tier = { name: string; prizeValue: number; totalCount: number; remainingCount: number; };
type Game = {
  gameId: string; name: string; price: number;
  status: 'active'|'ended'|'ending';
  launchDate?: string; endDate?: string; overallOdds?: number;
  tiers: Tier[];
};
type Snapshot = { date: string; games: Game[] };

async function withRetry<T>(fn: ()=>Promise<T>, tries=2, label='step'): Promise<T> {
  let lastErr: unknown = undefined;
  for (let i=1; i<=tries; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      console.warn(`[${label}] attempt ${i} failed:`, e instanceof Error ? e.message : e);
      await new Promise(r=>setTimeout(r, 1500*i));
    }
  }
  throw ensureError(lastErr ?? 'Unknown failure');
}


// ...
const top = await withRetry(() => fetchTopPrizes(), 2);

async function fetchActiveGames(): Promise<Game[]> {
  // 1) Try to scrape list pages (non-blocking)
  const linkSets = await withRetry(fetchGameLinks, 'fetchGameLinks'); // { active, ended } | null

  // 2) Always get Top-Prizes table (server-rendered, reliable)
  const top = await fetchTopPrizes();

  // 3) Build a canonical link list
  let links: { gameId: string; name: string; price: number; href: string; status: 'active'|'ended' }[] = [];

  if (linkSets && linkSets.active?.length) {
    links = linkSets.active;
  } else {
    // Fallback: synthesize from Top-Prizes (treat as active)
    links = top.map(t => ({
      gameId: t.gameId,
      name: t.name,
      price: t.price,
      href: `https://www.galottery.com/en-us/games/scratchers/${t.gameId}.html`,
      status: 'active',
    }));
  }

  // Optionally add ended links if the ended page worked
  if (linkSets?.ended?.length) {
    links.push(...linkSets.ended);
  }

  // 4) Enrich with per-game details (best-effort)
  const ids = Array.from(new Set(links.map(g => g.gameId)));
  const details = await fetchGameDetails(ids);

  const linkById = new Map(links.map(g => [g.gameId, g]));
  const detById  = new Map(details.map(d => [d.gameId, d]));
  const topById  = new Map(top.map(t => [t.gameId, t]));

  // 5) Build Game[]
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

function today() {
  return new Date().toISOString().slice(0,10);
}
async function ensureDir(p: string) { await fs.mkdir(p, { recursive: true }); }
function md5(buf: Buffer | string) { return crypto.createHash('md5').update(buf).digest('hex'); }
async function readJSON<T>(file: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; }
}
function mergeSnapshots(prev: Snapshot[] | null, latest: Snapshot): Snapshot[] {
  const arr = prev ? prev.slice() : [];
  // If this date already exists, skip pushing (avoids same-day duplicates)
  const hasSameDate = arr.some(s => s.date === latest.date);
  if (!hasSameDate) arr.push(latest);
  return arr;
}

async function main() {
  await ensureDir(OUT_DIR);
  const games = await fetchActiveGames();

  const latest: Snapshot = { date: today(), games };
  const latestStr = JSON.stringify(latest, null, 2);
  await fs.writeFile(LATEST, latestStr, 'utf8');

  // Anti-truncation: ensure merged grows monotonically.
  const prev = await readJSON<Snapshot[]>(MERGED);
  const merged = mergeSnapshots(prev, latest);
  const mergedStr = JSON.stringify(merged, null, 2);

  if (prev) {
    const oldBytes = Buffer.byteLength(JSON.stringify(prev));
    const newBytes = Buffer.byteLength(mergedStr);
    if (newBytes < oldBytes) {
      console.warn('Anti-truncation guard tripped; keeping previous merged file.');
      await fs.writeFile(MERGED, JSON.stringify(prev, null, 2), 'utf8');
      return;
    }
  }
  await fs.writeFile(MERGED, mergedStr, 'utf8');

  console.log('latest.md5', md5(latestStr));
  console.log('merged.md5', md5(mergedStr));
}

// (optional but helpful)
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
