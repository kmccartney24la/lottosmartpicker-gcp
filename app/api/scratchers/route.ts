// app/api/scratchers/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { fetchFirstAvailableJson, resolveIndexUrls, filters, sorters, ActiveGame, ScratchersIndexPayload } from '@lib/scratchers';

export async function GET(request: NextRequest) {
  try {
    const urls = resolveIndexUrls();
    const { data } = await fetchFirstAvailableJson<ScratchersIndexPayload>(urls);
    let games: ActiveGame[] = data.games || [];

    // Apply filters and sorters based on query parameters (with basic validation)
    const queryParams = Object.fromEntries(request.nextUrl.searchParams.entries());

    // Safe parsing of numeric parameters
    const minPrice = queryParams.minPrice ? parseFloat(queryParams.minPrice) : undefined;
    const maxPrice = queryParams.maxPrice ? parseFloat(queryParams.maxPrice) : undefined;
    const minTopPrizeAvailability = queryParams.minTopPrizeAvailability ? parseFloat(queryParams.minTopPrizeAvailability) : undefined;
    const minTopPrizesRemaining = queryParams.minTopPrizesRemaining ? parseInt(queryParams.minTopPrizesRemaining, 10) : undefined;
    const search = queryParams.search || undefined;
    const lifecycle = queryParams.lifecycle as 'new' | 'continuing' | undefined;
    const sortBy = queryParams.sortBy as any;

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
      try {
        games.sort(sorters(sortBy));
      } catch (error) {
        // Invalid sort key, ignore
      }
    }

    return NextResponse.json({ ...data, games });
  } catch (error: any) {
    console.error('Error fetching scratchers data:', error);
    return NextResponse.json({ error: 'Failed to fetch scratchers data', details: error.message }, { status: 500 });
  }
}