import { NextResponse } from 'next/server';
import { fetchNY, getCurrentEraConfig } from '@lib/lotto';
import type { GameKey } from '@lib/lotto';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const game = searchParams.get('game') as GameKey | null;
  if (!game) return NextResponse.json({ error: 'Missing ?game=' }, { status: 400 });

  try {
    const since = getCurrentEraConfig(game).start;
    const rows = await fetchNY({ game, since });
    return NextResponse.json({ game, since, count: rows.length, sample: rows.slice(0, 3) }, { status: 200 });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
