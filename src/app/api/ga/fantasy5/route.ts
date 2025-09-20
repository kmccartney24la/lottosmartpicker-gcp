import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function envRemoteUrl(): string | undefined {
  return process.env.LOTTO_REMOTE_CSV_URL_GA_FANTASY5
    ?? (process.env.NEXT_PUBLIC_DATA_BASE_URL
      ? `${process.env.NEXT_PUBLIC_DATA_BASE_URL}/ga/fantasy5.csv`
      : undefined);
}

export async function GET() {
  const remote = envRemoteUrl();
  if (remote) {
    try {
      const r = await fetch(remote, { cache: 'no-store' });
      if (r.ok) {
        const csv = await r.text();
        console.log(`[fantasy5] using remote: ${remote}`);
        return new NextResponse(csv, {
          headers: {
            'content-type': 'text/csv; charset=utf-8',
            'cache-control': 'no-store',
          },
        });
      }
      console.warn(`[fantasy5] remote fetch failed ${r.status} ${r.statusText}`);
    } catch (err) {
      console.warn(`[fantasy5] remote fetch error: ${String(err)}`);
    }
  } else {
    console.log('[fantasy5] remote URL not set; using local file');
  }

  // Fallback to the local seed/file in the container image
  const file = path.join(process.cwd(), 'public', 'data', 'ga', 'fantasy5.csv');
  const csv = await fs.readFile(file, 'utf8');
  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}