import { NextResponse } from 'next/server';
import { fetchRowsWithCache } from 'lib/lotto';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const since = url.searchParams.get('since') || undefined;
    const until = url.searchParams.get('until') || undefined;
    const latestOnly = ['1','true','yes'].includes((url.searchParams.get('latestOnly')||'').toLowerCase());

    const rows = await fetchRowsWithCache({ game: 'ga_fantasy5', since, until, latestOnly });
    return NextResponse.json({ ok: true, game: 'ga_fantasy5', rows }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? 'internal error' }, { status: 500 });
  }
}
