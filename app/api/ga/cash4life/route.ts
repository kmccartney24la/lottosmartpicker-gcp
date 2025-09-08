import { NextResponse } from 'next/server';
import { fetchNY, rowsToCSV, getCurrentEraConfig } from '@lib/lotto';

export async function GET() {
  try {
    const since = getCurrentEraConfig('ga_cash4life').start;
    const rows = await fetchNY({ game: 'ga_cash4life', since });
    const csv = rowsToCSV(rows);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="ga_cash4life_${since}_today.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Proxy failed' }, { status: 500 });
  }
}

