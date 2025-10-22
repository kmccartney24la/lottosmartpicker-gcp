// app/api/scratchers/route.ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Let Next/edge cache this route; tune freshness below.
export const revalidate = 300; // 5m framework-level revalidation
import { NextRequest, NextResponse } from 'next/server';
import { GoogleAuth } from 'google-auth-library';
import { filters, sorters, ActiveGame, ScratchersIndexPayload, SortKey } from 'packages/lib/scratchers';
import crypto from 'node:crypto';

const BUCKET = process.env.DATA_BUCKET ?? 'lottosmartpicker-data';
const FETCH_TIMEOUT_MS = 5000;

// ✅ include 'ca'
type Jurisdiction = 'ga' | 'ny' | 'fl' | 'ca';

function indexCandidatesFor(j: Jurisdiction) {
  return [
    `${j}/scratchers/index.latest.json`,
    `${j}/scratchers/index.json`,
  ];
}
function mediaUrl(bucket: string, key: string) {
  return `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(key)}?alt=media`;
}

// Simple module-scoped token cache (reduces per-request latency a bit)
let cachedToken: { value: string; exp: number } | null = null;
const now = () => Date.now();

// Map any GCS-based image URL to a same-origin /api/file path.
// ALSO rewrite localhost FS CDN URLs (e.g., http://localhost:3000/cdn/<key>) → /api/file/<key>
function toSameOriginImage(url?: string): string | undefined {
  if (!url) return url;
  try {
    // If it's already a same-origin (starts with /), keep it.
    if (url.startsWith('/')) return url;
    const u = new URL(url);
    const host = u.hostname.toLowerCase();

    // 1) Rewrite old FS URLs like http://localhost:3000/cdn/<key> → /api/file/<key>
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
      const m = u.pathname.match(/^\/cdn\/(.+)$/);
      if (m && m[1]) {
        return `/api/file/${m[1]}`;
      }
      return url; // localhost but not our CDN shape – leave unchanged
    }

    // 2) Rewrite GCS public links to our authenticated same-origin proxy
    //    Accept both:
    //      - https://storage.googleapis.com/<bucket>/<key>
    //      - https://storage.cloud.google.com/<bucket>/<key>
    const isGcsHost =
      /(^|\.)storage\.googleapis\.com$/.test(host) ||
      /(^|\.)storage\.cloud\.google\.com$/.test(host);
    if (!isGcsHost) return url; // leave non-GCS hosts unchanged

    const parts = u.pathname.replace(/^\/+/, '').split('/');
    const bucket = parts.shift() ?? '';
    const key = parts.join('/');
    if (!bucket || !key) return url;
    // Whether same or different bucket, proxy via our /api/file/<key>
    return `/api/file/${key}`;
  } catch {
    return url;
  }
}

async function token() {
  if (cachedToken && cachedToken.exp > now() + 10_000) {
    return cachedToken.value;
  }
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/devstorage.read_only'] });
  const c = await auth.getClient();
  const t = await c.getAccessToken();
  if (!t || !t.token) throw new Error('no access token');
  // Access tokens are ~3600s; set conservative expiry
  cachedToken = { value: t.token, exp: now() + 3300_000 };
  return t.token;
}

function withTimeout<T>(p: Promise<T>, ms = FETCH_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('upstream timeout')), ms);
    p.then(v => { clearTimeout(id); resolve(v); }, e => { clearTimeout(id); reject(e); });
  });
}

function queryHash(u: URL): string {
  // Stable hash of query params that affect filtering/sorting
  const q = Array.from(u.searchParams.entries()).sort((a,b)=>a[0].localeCompare(b[0]));
  return crypto.createHash('sha1').update(JSON.stringify(q)).digest('base64url');
}

export async function GET(request: NextRequest) {
  try {
    const jParam = (request.nextUrl.searchParams.get('j') || 'ga').toLowerCase() as string;

    // ✅ parse all supported jurisdictions; default to 'ga'
    const j: Jurisdiction =
      jParam === 'ny' ? 'ny' :
      jParam === 'fl' ? 'fl' :
      jParam === 'ca' ? 'ca' :
      'ga';

    const INDEX_CANDIDATES = indexCandidatesFor(j);
    // Fetch index candidates in parallel; use first 200 OK
    let data: ScratchersIndexPayload | undefined;
    let source = '';
    const t = await token();
    const reqHeaders = { Authorization: `Bearer ${t}` };

    const fetches = INDEX_CANDIDATES.map(async (key) => {
      const url = mediaUrl(BUCKET, key);
      const res = await withTimeout(fetch(url, {
        headers: reqHeaders,
        cache: 'force-cache',
        next: { revalidate }
      }));
      return { key, res };
    });

    const results = await Promise.allSettled(fetches);
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.res.ok) {
        const { key, res } = r.value;
        data = await res.json();
        source = `gs://${BUCKET}/${key}`;
        break;
      }
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

    // Build a composite ETag from upstream etag + query hash, so clients/CDN can 304 this filtered view
    const upstreamEtag = (data as any).etag || (data as any).ETag || ''; // if your index embeds one; otherwise leave blank
    const qhash = queryHash(request.nextUrl);
    const compositeEtag = `W/"${upstreamEtag}-${qhash}"`;

    const inm = request.headers.get('if-none-match');
    if (inm && inm === compositeEtag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          'Cache-Control': 'public, max-age=120, s-maxage=300, stale-while-revalidate=3600',
          'ETag': compositeEtag,
          'Vary': 'Accept-Encoding'
        }
      });
    }

    const body = { ...data, games, count: games.length, source, jurisdiction: j };
    const res = NextResponse.json(body);
    res.headers.set('Cache-Control', 'public, max-age=120, s-maxage=300, stale-while-revalidate=3600');
    res.headers.set('ETag', compositeEtag);
    res.headers.set('Vary', 'Accept-Encoding');
    return res;
  } catch (error: any) {
    console.error('Error fetching scratchers data:', error);
    return NextResponse.json({ error: 'Failed to fetch scratchers data', details: error.message }, { status: 500 });
  }
}
