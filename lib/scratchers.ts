// lib/scratchers.ts
export type PrizeTier = {
  name: string;               // e.g., "Top Prize", "$1,000", etc.
  prizeValue: number;         // dollars
  totalCount: number;         // total printed at launch
  remainingCount: number;     // remaining now
};

export type ScratcherGame = {
  gameId: string;             // canonical GA id (string to avoid leading zero issues)
  name: string;
  price: number;              // 1..50
  status: 'active' | 'ended' | 'ending';
  launchDate?: string;        // YYYY-MM-DD
  endDate?: string;           // YYYY-MM-DD
  overallOdds?: number;       // e.g., 1 in 3.96 -> 3.96
  tiers: PrizeTier[];
  // Derived:
  jackpotRemainingCount: number;   // from max tier(s)
  totalPrizesStart: number;
  totalPrizesRemaining: number;
  totalValueStart: number;         // sum(prizeValue * totalCount)
  totalValueRemaining: number;     // sum(prizeValue * remainingCount)
};

export type ScratcherSnapshot = {
  date: string;               // ISO date of snapshot
  games: ScratcherGame[];
};

export type Weights = {
  w_jackpot: number;
  w_value: number;
  w_prizes: number;
  w_odds: number;
  w_price: number;
};

export const DEFAULT_WEIGHTS: Weights = {
  w_jackpot: 0.35,
  w_value:   0.25,
  w_prizes:  0.20,
  w_odds:    0.15,
  w_price:   0.05,
};

const LATEST_URL = '/data/ga_scratchers/index.latest.json';
const ARCHIVE_URL = '/data/ga_scratchers/index.json'; // merged snapshots (R2-backed mirror)

/** Light, browser-friendly cache similar to your draw cache pattern. */
export async function fetchScratchersWithCache({ activeOnly = true }: { activeOnly?: boolean } = {}) {
  // Try latest snapshot first, then fall back to archive.
  const urls = [LATEST_URL, ARCHIVE_URL];
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;
      const snap: ScratcherSnapshot | ScratcherSnapshot[] = await res.json();
      const latest = Array.isArray(snap) ? snap[snap.length - 1] : snap;
      let games = latest.games;
      if (activeOnly) games = games.filter(g => g.status !== 'ended');
      return games.map(deriveTotals);
    } catch { /* keep trying */ }
  }
  return [];
}

function deriveTotals(g: ScratcherGame): ScratcherGame {
  let totalStart = 0, totalRemain = 0, valStart = 0, valRemain = 0;
  for (const t of g.tiers) {
    totalStart  += t.totalCount;
    totalRemain += t.remainingCount;
    valStart    += t.prizeValue * t.totalCount;
    valRemain   += t.prizeValue * t.remainingCount;
  }
  const jackpotValue = Math.max(...g.tiers.map(t => t.prizeValue), 0);
  const jackpotRemain = g.tiers.filter(t => t.prizeValue === jackpotValue)
                               .reduce((s,t)=>s+t.remainingCount,0);

  return {
    ...g,
    totalPrizesStart: totalStart,
    totalPrizesRemaining: totalRemain,
    totalValueStart: valStart,
    totalValueRemaining: valRemain,
    jackpotRemainingCount: jackpotRemain,
  };
}

/** Small helper used by scoring */
function minMaxNorm(values: number[]) {
  const lo = Math.min(...values), hi = Math.max(...values);
  return (x: number) => hi === lo ? 0.5 : (x - lo) / (hi - lo);
}

/** Rank + explain scores for tooltips */
export function rankScratchers(games: ScratcherGame[], w: Weights = DEFAULT_WEIGHTS) {
  const j = minMaxNorm(games.map(g => g.jackpotRemainingCount));
  const v = minMaxNorm(games.map(g => g.totalValueRemaining / Math.max(1, g.totalValueStart)));
  const p = minMaxNorm(games.map(g => g.totalPrizesRemaining / Math.max(1, g.totalPrizesStart)));
  const o = minMaxNorm(games.map(g => g.overallOdds ? 1 / g.overallOdds : 0));
  const pr= minMaxNorm(games.map(g => g.price));

  const scored = games.map(g => {
    const parts = {
      jackpot: j(g.jackpotRemainingCount),
      value:   v(g.totalValueRemaining / Math.max(1, g.totalValueStart)),
      prizes:  p(g.totalPrizesRemaining / Math.max(1, g.totalPrizesStart)),
      odds:    o(g.overallOdds ? 1 / g.overallOdds : 0),
      price:   pr(g.price),
    };
    const score = w.w_jackpot*parts.jackpot + w.w_value*parts.value + w.w_prizes*parts.prizes + w.w_odds*parts.odds - w.w_price*parts.price;
    return { game: g, score, parts };
  });

  scored.sort((a,b)=> b.score - a.score);
  return scored;
}

/** Filter helpers (compose with Array.prototype.filter). */
export const filters = {
  byPrice(min?: number, max?: number) {
    return (g: ScratcherGame) => (min ?? 0) <= g.price && g.price <= (max ?? 1e9);
  },
  activeOnly(active: boolean) {
    return (g: ScratcherGame) => active ? g.status !== 'ended' : true;
  },
  minJackpotRemaining(n: number) {
    return (g: ScratcherGame) => g.jackpotRemainingCount >= n;
  },
  minPercentRemaining(pct: number) {
    return (g: ScratcherGame) => (g.totalPrizesRemaining / Math.max(1, g.totalPrizesStart)) >= pct;
  },
  search(q: string) {
    const s = q.trim().toLowerCase();
    return (g: ScratcherGame) => !s || g.name.toLowerCase().includes(s) || g.gameId.toLowerCase().includes(s);
  }
};

export type SortKey = 'best' | '%remaining' | 'jackpot' | 'odds' | 'price' | 'launch';

export function sorters(key: SortKey, latestScores?: ReturnType<typeof rankScratchers>) {
  switch (key) {
    case 'best':       return (a: ScratcherGame, b: ScratcherGame) =>
      (latestScores?.find(s => s.game.gameId === b.gameId)?.score ?? 0) -
      (latestScores?.find(s => s.game.gameId === a.gameId)?.score ?? 0);
    case '%remaining': return (a,b) => (b.totalPrizesRemaining / Math.max(1,b.totalPrizesStart)) - (a.totalPrizesRemaining / Math.max(1,a.totalPrizesStart));
    case 'jackpot':    return (a,b) => b.jackpotRemainingCount - a.jackpotRemainingCount;
    case 'odds':       return (a,b) => (a.overallOdds ?? 9e9) - (b.overallOdds ?? 9e9);
    case 'price':      return (a,b) => a.price - b.price;
    case 'launch':     return (a,b) => (b.launchDate ?? '').localeCompare(a.launchDate ?? '');
  }
}
