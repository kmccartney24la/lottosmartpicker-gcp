// app/api/multi/[game]/route.ts
import { NextResponse } from 'next/server';
import type { GameKey } from '@lib/lotto';

// Accept both GA_* and MULTI_* naming schemes so you don't need to rename envs today.
const env = (k: string) => process.env[k] ?? null;
function remoteUrlFor(game: GameKey): string | null {
  switch (game) {
    case 'powerball':
      return env('GA_POWERBALL_REMOTE_CSV_URL')    ?? env('MULTI_POWERBALL_REMOTE_CSV_URL');
    case 'megamillions':
      return env('GA_MEGAMILLIONS_REMOTE_CSV_URL') ?? env('MULTI_MEGAMILLIONS_REMOTE_CSV_URL');
    case 'ga_cash4life':
      return env('GA_CASH4LIFE_REMOTE_CSV_URL')    ?? env('MULTI_CASH4LIFE_REMOTE_CSV_URL');
    case 'ga_fantasy5':
      return env('GA_FANTASY5_REMOTE_CSV_URL')     ?? env('MULTI_FANTASY5_REMOTE_CSV_URL');
    default:
      return null;
  }
}

function isValidGame(x: string): x is GameKey {
  return ['powerball','megamillions','ga_cash4life','ga_fantasy5'].includes(x);
}

export const runtime = 'nodejs'; // ensure Node runtime for server-only env access

export async function GET(_req: Request, ctx: { params: { game: string } }) {
  const gameParam = ctx.params?.game ?? '';
  if (!isValidGame(gameParam)) {
    return NextResponse.json({ error: `Unknown game: ${gameParam}` }, { status: 400 });
  }

  const remote = remoteUrlFor(gameParam);
  if (!remote) {
    return NextResponse.json(
      { error: `No remote URL configured for ${gameParam}` },
      { status: 500 }
    );
  }

  const upstream = await fetch(remote, { cache: 'no-store' });
  if (!upstream.ok) {
    return new NextResponse(`Upstream error ${upstream.status}`, { status: 502 });
  }

  const csv = await upstream.text();
  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      // Cache at the edge briefly; your GitHub Action updates R2 after draws
      'cache-control': 'public, s-maxage=300, stale-while-revalidate=3600',
    },
  });
}
