// app/api/ga/scratchers/route.ts
import { NextResponse } from 'next/server';
import { resolveIndexUrls, type ScratchersIndexPayload } from '@lib/scratchers';

export const dynamic = 'force-dynamic'; // always hit server (we control caching manually)

export async function GET() {
  const urls = resolveIndexUrls();
  let lastErr: unknown;

  for (const url of urls) {
    try {
      // Revalidate at most once per hour at the edge; clients can cache per the headers below.
      const res = await fetch(url, { cache: 'no-store', next: { revalidate: 3600 } as any });
      if (!res.ok) {
        lastErr = new Error(`Fetch failed ${res.status} for ${url}`);
        continue;
      }
      const json = (await res.json()) as ScratchersIndexPayload;

      return new NextResponse(JSON.stringify(json), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          // Cache at the CDN (Vercel) for 1h, serve stale for 60s while revalidating.
          // Browsers get no long-term cache to keep the UI timely.
          'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=60',
        },
      });
    } catch (err) {
      lastErr = err;
    }
  }

  return NextResponse.json(
    { error: 'Unable to fetch scratchers index', detail: String(lastErr ?? 'unknown') },
    { status: 502 }
  );
}
