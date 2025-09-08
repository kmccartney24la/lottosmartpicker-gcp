import { NextResponse } from 'next/server';
import { fetchNY, rowsToCSV, DATASETS } from '@/lib/lotto';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const game = searchParams.get('game') as 'powerball'|'megamillions' | null;
  const since = searchParams.get('since') || undefined;
  const until = searchParams.get('until') || undefined;
  const latestOnly = searchParams.get('latestOnly') === '1' || searchParams.get('latestOnly') === 'true';
  const token = process.env.NY_SOCRATA_TOKEN || undefined;

  if (!game || !(game in DATASETS)) {
    return NextResponse.json({ error: 'Missing or invalid ?game=powerball|megamillions' }, { status: 400 });
  }

  try {
    const rows = await fetchNY({ game, since, until, latestOnly, token });
    const csv = rowsToCSV(rows);
    const filename = `${game}_${since ?? 'start'}_${until ?? 'today'}.csv`;

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
