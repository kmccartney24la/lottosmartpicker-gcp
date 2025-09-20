// app/api/multi/[game]/route.ts
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = "nodejs";

// Only multi-state games belong here.
const MAP = {
  powerball: "multi/powerball.csv",
  megamillions: "multi/megamillions.csv",
} as const;
type RouteGame = keyof typeof MAP;

export async function GET(
  _req: Request,
  ctx: { params: { game: string } }
) {
  const raw = (ctx.params.game || "").toLowerCase().trim();
  if (!(raw in MAP)) {
    return NextResponse.json(
      { error: `Unknown multi-state game '${raw}'. Supported: ${Object.keys(MAP).join(", ")}` },
      { status: 400 }
    );
  }

  const base = process.env.NEXT_PUBLIC_DATA_BASE_URL;
  if (!base) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_DATA_BASE_URL is not set" },
      { status: 500 }
    );
  }

  const path = MAP[raw as RouteGame];
  const url = `${base.replace(/\/+$/,'')}/${path}`;
  const upstream = await fetch(url, { method: "GET", cache: "no-store" as any, next: { revalidate: 0 } as any });
  if (!upstream.ok) {
    return NextResponse.json(
      { error: `Upstream ${upstream.status} fetching ${url}` },
      { status: 502 }
    );
  }

  const headers = new Headers(upstream.headers);
  headers.set("Content-Type", "text/csv; charset=utf-8");
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  headers.delete("ETag"); // avoid intermediate caching weirdness
  return new NextResponse(upstream.body, { status: 200, headers });
}
