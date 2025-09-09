import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

const REMOTE = process.env.MULTI_POWERBALL_REMOTE_CSV_URL; // e.g. https://<r2>.r2.dev/multi/powerball.csv

export async function GET() {
  if (REMOTE && REMOTE.trim().length > 0) {
    const res = await fetch(REMOTE, { cache: 'no-store' });
    if (!res.ok) return new NextResponse(`Upstream error: ${res.status}`, { status: 502 });
    const csv = await res.text();
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Cache-Control': 'public, s-maxage=43200, stale-while-revalidate=86400',
      },
    });
  }

  // Dev fallback if no env var:
  const file = path.join(process.cwd(), 'public', 'data', 'multi', 'powerball.csv');
  const csv = await fs.readFile(file, 'utf8').catch(() =>
    'game,draw_date,m1,m2,m3,m4,m5,special,special_name\n'
  );
  return new NextResponse(csv, {
    status: 200,
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
