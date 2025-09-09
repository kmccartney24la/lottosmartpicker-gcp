import { NextResponse } from 'next/server';
import { fetchNY, DATASETS, getCurrentEraConfig } from '@lib/lotto';
import type { GameKey, LottoRow } from '@lib/lotto';

// Local CSV builder (same behavior as in lib)
function rowsToCSVLocal(rows: LottoRow[], eol: '\n' | '\r\n' = '\n'): string {
  const includeSpecial = rows.some(r => typeof r.special === 'number');
  const header = includeSpecial
    ? 'game,date,n1,n2,n3,n4,n5,special'
    : 'game,date,n1,n2,n3,n4,n5';
  const body = rows
    .map(r =>
      includeSpecial
        ? `${r.game},${r.date},${r.n1},${r.n2},${r.n3},${r.n4},${r.n5},${r.special ?? ''}`
        : `${r.game},${r.date},${r.n1},${r.n2},${r.n3},${r.n4},${r.n5}`
    )
    .join(eol);
  return `${header}${eol}${body}${eol}`;
}

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
  // CSV-adapter-backed: ga_fantasy5
  const isFantasy5 = game === 'ga_fantasy5';
  if (!isSocrataBacked && !isFantasy5) {
    return NextResponse.json({ error: 'Unsupported game' }, { status: 400 });
  }

  const since = sinceParam ?? getCurrentEraConfig(game).start;

  try {
    const rows = await fetchNY({ game, since, until, latestOnly, token });
    const csv = rowsToCSVLocal(rows);
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