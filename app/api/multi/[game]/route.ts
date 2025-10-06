// app/api/multi/[game]/route.ts
import { NextResponse } from 'next/server';
import { fetchRowsWithCache, type GameKey } from 'lib/lotto';

const GAME_MAP: Record<string, GameKey> = {
  powerball: 'multi_powerball',
  megamillions: 'multi_megamillions',
  cash4life: 'multi_cash4life',
};

function boolParam(u: URL, name: string): boolean | undefined {
  const v = u.searchParams.get(name);
  if (v == null) return undefined;
  const s = v.trim().toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes') return true;
  if (s === '0' || s === 'false' || s === 'no') return false;
  return undefined;
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request, ctx: any) {
  try {
    const gameParam = ctx?.params?.game as string | undefined;
    if (!gameParam) {
      return NextResponse.json({ ok: false, error: 'missing game' }, { status: 400 });
    }

    const key = GAME_MAP[gameParam.toLowerCase()];
    if (!key) {
      return NextResponse.json({ ok: false, error: `unknown multi game "${gameParam}"` }, { status: 400 });
    }

    const url = new URL(req.url);
    const since = url.searchParams.get('since') || undefined;
    const until = url.searchParams.get('until') || undefined;
    const latestOnly = boolParam(url, 'latestOnly');

    const token =
      process.env.SOCRATA_APP_TOKEN ||
      process.env.NY_SOCRATA_TOKEN ||
      undefined;

    const rows = await fetchRowsWithCache({ game: key, since, until, latestOnly, token });
    return NextResponse.json(
      { ok: true, game: key, rows },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'internal error' },
      { status: 500 }
    );
  }
}
