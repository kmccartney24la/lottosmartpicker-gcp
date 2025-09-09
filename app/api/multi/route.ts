// app/api/multi/[game]/route.ts
import { NextResponse } from 'next/server';
import type { GameKey } from '@lib/lotto';
import { remoteUrlFor } from '@/lib/server/remotes';

export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: { game: GameKey } }) {
  const game = ctx.params.game;
  const remote = remoteUrlFor(game);
  if (!remote) return NextResponse.json({ error: `No remote URL configured for ${game}` }, { status: 500 });

  const res = await fetch(remote, { cache: 'no-store' });
  if (!res.ok) return new NextResponse(`Upstream ${res.status}`, { status: 502 });

  const csv = await res.text();
  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      // cache at the edge for a bit; your writer updates the object after a draw
      'cache-control': 'public, s-maxage=300, stale-while-revalidate=3600',
    },
  });
}
