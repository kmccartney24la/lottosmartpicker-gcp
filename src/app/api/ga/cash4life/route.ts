// app/api/ga/cash4life/route.ts

import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const base = process.env.NEXT_PUBLIC_DATA_BASE_URL;
  if (!base) {
    return NextResponse.json({ error: 'NEXT_PUBLIC_DATA_BASE_URL not set' }, { status: 500 });
  }
  const url = `${base.replace(/\/+$/,'')}/ga/cash4life.csv`;
  const r = await fetch(url, { cache: 'no-store' as any, next: { revalidate: 0 } as any });
  if (!r.ok) {
    return NextResponse.json({ error: `Upstream ${r.status} for ${url}` }, { status: 502 });
  }
  const h = new Headers(r.headers);
  h.set('Content-Type', 'text/csv; charset=utf-8');
  h.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  h.delete('ETag');
  return new NextResponse(r.body, { status: 200, headers: h });
}

