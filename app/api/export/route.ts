import { NextResponse } from 'next/server';
import { fetchNY, rowsToCSV, DATASETS, getCurrentEraConfig } from '@lib/lotto';
import type { GameKey } from '@lib/lotto';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const game = searchParams.get('game') as GameKey | null;
  const sinceParam = searchParams.get('since') || undefined;
  const until = searchParams.get('until') || undefined;
  const latestOnly =
    searchParams.get('latestOnly') === '1' || searchParams.get('latestOnly') === 'true';
  const token = process.env.NY_SOCRATA_TOKEN || undefined;

  if (!game) return NextResponse.json({ error: 'Missing ?game=' }, { status: 400 });

  // Socrata-backed: powerball, megamillions, ga_cash4life
  const isSocrataBacked = game in DATASETS;
  // CSV-adapter-backed: ga_fantasy5 (via /api/ga/fantasy5)
  const isFantasy5 = game === 'ga_fantasy5';
  if (!isSocrataBacked && !isFantasy5) {
    return NextResponse.json({ error: 'Unsupported game' }, { status: 400 });
  }

  const since = sinceParam ?? getCurrentEraConfig(game).start;

  try {
    const rows = await fetchNY({ game, since, until, latestOnly, token });
    const csv = rowsToCSV(rows);
    const filename = `${game}_${since ?? 'start'}_${until ?? 'today'}${
      latestOnly ? '_latest' : ''
    }.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Export failed' }, { status: 500 });
  }
}
