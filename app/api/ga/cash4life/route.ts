import { NextResponse } from 'next/server';
import { fetchRowsWithCache } from 'lib/lotto';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const since = url.searchParams.get('since') || undefined;
    const until = url.searchParams.get('until') || undefined;
    const latestOnly = ['1','true','yes'].includes((url.searchParams.get('latestOnly')||'').toLowerCase());
    const token = process.env.SOCRATA_APP_TOKEN || process.env.NY_SOCRATA_TOKEN || undefined;

    const rows = await fetchRowsWithCache({ game: 'multi_cash4life', since, until, latestOnly, token });
    return NextResponse.json({ ok: true, game: 'multi_cash4life', rows }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? 'internal error' }, { status: 500 });
  }
}
