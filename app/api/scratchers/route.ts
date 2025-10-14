// app/api/scratchers/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { GoogleAuth } from 'google-auth-library';
import { filters, sorters, ActiveGame, ScratchersIndexPayload, SortKey } from '@lib/scratchers';

const BUCKET = process.env.DATA_BUCKET ?? 'lottosmartpicker-data';
function indexCandidatesFor(j: 'ga'|'ny') {
  return [
    `${j}/scratchers/index.latest.json`,
    `${j}/scratchers/index.json`,
  ];
}
function mediaUrl(bucket: string, key: string) {
  return `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(key)}?alt=media`;
}

// Map any GCS-based image URL to a same-origin /api/file path.
function toSameOriginImage(url?: string): string | undefined {
  if (!url) return url;
  try {
    // If it's already a same-origin (starts with /), keep it.
    if (url.startsWith('/')) return url;
    const u = new URL(url);
    // Match both forms:
    //  - https://storage.googleapis.com/<bucket>/<key>
    //  - https://storage.cloud.google.com/<bucket>/<key> (rare)
    const hostOk = /(^|\.)storage\.googleapis\.com$/.test(u.hostname) || /(^|\.)storage\.cloud\.google\.com$/.test(u.hostname);
    if (!hostOk) return url; // leave other hosts unchanged
    // First path segment is bucket, the rest is object key.
    const parts = u.pathname.replace(/^\/+/, '').split('/');
    const bucket = parts.shift() ?? '';
    const key = parts.join('/');
    if (!bucket || !key) return url;
    // If it’s our bucket, serve through our authenticated proxy.
    if (bucket === BUCKET) return `/api/file/${key}`;
    // Different bucket? still proxy safely via our API (optional):
    return `/api/file/${key}`;
  } catch {
    return url;
  }
}

async function token() {
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/devstorage.read_only'] });
  const c = await auth.getClient();
  const t = await c.getAccessToken();
  if (!t || !t.token) throw new Error('no access token');
  return t.token;
}

export async function GET(request: NextRequest) {
  try {
    const jParam = (request.nextUrl.searchParams.get('j') || 'ga').toLowerCase();
    const j: 'ga'|'ny' = jParam === 'ny' ? 'ny' : 'ga';
    const INDEX_CANDIDATES = indexCandidatesFor(j);
    // Same-origin: fetch index directly from private GCS
    let data: ScratchersIndexPayload | undefined;
    let source = '';
    const t = await token();
    for (const key of INDEX_CANDIDATES) {
      const res = await fetch(mediaUrl(BUCKET, key), { headers: { Authorization: `Bearer ${t}` }, cache: 'no-store' });
      if (!res.ok) continue;
      data = await res.json();
      source = `gs://${BUCKET}/${key}`;
      break;
    }
    if (!data) {
      return NextResponse.json({ error: 'No scratchers index available' }, { status: 502 });
    }
    let games: ActiveGame[] = (data.games || []).map(g => ({
      ...g,
      // rewrite image URLs to same-origin so browsers & CSP are happy
      oddsImageUrl: toSameOriginImage(g.oddsImageUrl),
      ticketImageUrl: toSameOriginImage(g.ticketImageUrl),
    }));

    // Apply filters and sorters based on query parameters (with basic validation)
    const queryParams = Object.fromEntries(request.nextUrl.searchParams.entries());

    // Safe parsing of numeric parameters
    const asNum = (v?: string) => {
      const n = v !== undefined ? Number(v) : NaN;
      return Number.isFinite(n) ? n : undefined;
    };
    const minPrice = asNum(queryParams.minPrice);
    const maxPrice = asNum(queryParams.maxPrice);
    const minTopPrizeAvailability = asNum(queryParams.minTopPrizeAvailability);
    const minTopPrizesRemaining = asNum(queryParams.minTopPrizesRemaining);
    const search = queryParams.search || undefined;
    const lifecycle = queryParams.lifecycle as 'new' | 'continuing' | undefined;
    const sortBy = (queryParams.sortBy || '') as SortKey;

    if (minPrice !== undefined || maxPrice !== undefined) {
      games = games.filter(filters.byPrice(minPrice, maxPrice));
    }
    if (minTopPrizeAvailability !== undefined && minTopPrizeAvailability >= 0 && minTopPrizeAvailability <= 1) {
      games = games.filter(filters.minTopPrizeAvailability(minTopPrizeAvailability));
    }
    if (minTopPrizesRemaining !== undefined && minTopPrizesRemaining >= 0) {
      games = games.filter(filters.minTopPrizesRemaining(minTopPrizesRemaining));
    }
    if (search) {
      games = games.filter(filters.search(search));
    }
    if (lifecycle && (lifecycle === 'new' || lifecycle === 'continuing')) {
      games = games.filter(filters.lifecycle(lifecycle));
    }

    if (sortBy && sortBy !== 'best') {
      const cmp = sorters(sortBy);
      if (typeof cmp === 'function') {
        games = [...games].sort(cmp);
      }
    }

    return NextResponse.json(
      { ...data, games, count: games.length, source, jurisdiction: j },
      {
        headers: {
          // upstream fetch is no-store; allow brief caching of this response
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=3600',
        },
      },
    );
  } catch (error: any) {
    console.error('Error fetching scratchers data:', error);
    return NextResponse.json({ error: 'Failed to fetch scratchers data', details: error.message }, { status: 500 });
  }
}