import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

const REMOTE = process.env.GA_FANTASY5_REMOTE_CSV_URL; // optional for now

export async function GET() {
  // If REMOTE is configured, proxy-fetch from R2
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

  // Fallback: serve the seed file from /public so dev works without env.
  const file = path.join(process.cwd(), 'public', 'data', 'ga', 'fantasy5.csv');
  const csv = await fs.readFile(file, 'utf8').catch(() => 'draw_date,m1,m2,m3,m4,m5\n');
  return new NextResponse(csv, {
    status: 200,
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
