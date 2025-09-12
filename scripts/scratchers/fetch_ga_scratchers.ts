// scripts/scratchers/fetch_ga_scratchers.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureError, withRetry } from './_util';
import { fetchTopPrizes, type TopPrizeRow } from './parse_top_prizes';
import { fetchGameLinks } from './parse_lists';
import { fetchGameDetails, type GameDetail } from './parse_game_page';

const OUT_DIR = 'public/data/ga_scratchers';
const LATEST = path.join(OUT_DIR, 'index.latest.json');
const MERGED = path.join(OUT_DIR, 'index.json');

type IndexRecord = GameDetail & {
  topPrize?: number;
  topPrizeClaimed?: number;
  topPrizeTotal?: number;
  topPrizeAsOf?: string;
};

async function ensureOutDir() {
  await fs.mkdir(OUT_DIR, { recursive: true });
}

function byIdOrUrlKey(x: { gameId?: string; url?: string }) {
  return (x.gameId && x.gameId.trim()) || (x.url ?? '').replace(/\/$/, '');
}

function merge(existing: IndexRecord[], latest: IndexRecord[]): IndexRecord[] {
  const map = new Map<string, IndexRecord>();
  for (const r of existing) map.set(byIdOrUrlKey(r), r);
  for (const r of latest) map.set(byIdOrUrlKey(r), { ...(map.get(byIdOrUrlKey(r)) || {}), ...r });
  // Stable-ish sort: numeric id asc, then name
  return Array.from(map.values()).sort((a, b) => {
    const ai = Number(a.gameId || 0);
    const bi = Number(b.gameId || 0);
    if (ai !== bi) return ai - bi;
    return (a.name || '').localeCompare(b.name || '');
  });
}

async function writeJson(file: string, data: unknown) {
  await ensureOutDir();
  await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${file}`);
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

async function main() {
  await ensureOutDir();

  const { active } = await withRetry(fetchGameLinks, { label: 'links', attempts: 3 });

  const [details, top] = await Promise.all([
    withRetry(() => fetchGameDetails(active), { label: 'game_details', attempts: 2 }),
    withRetry(fetchTopPrizes, { label: 'top_prizes', attempts: 2 }),
  ]);

  // Join by gameId
  const topById = new Map<string, TopPrizeRow>();
  for (const t of top) topById.set(t.gameId, t);

  const latest: IndexRecord[] = details.map((g) => {
    const t = topById.get(g.gameId);
    return {
      ...g,
      topPrize: t?.topPrize,
      topPrizeClaimed: t?.claimed,
      topPrizeTotal: t?.total,
      topPrizeAsOf: t?.asOf,
    };
  });

  await writeJson(LATEST, latest);

  const existing = (await readJson<IndexRecord[]>(MERGED)) || [];
  const merged = merge(existing, latest);
  await writeJson(MERGED, merged);
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
