// app/api/ga/fantasy5/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const base = process.env.NEXT_PUBLIC_DATA_BASE_URL;
  const explicit = process.env.LOTTO_REMOTE_CSV_URL_GA_FANTASY5;
  const remote = explicit ?? (base ? `${base.replace(/\/+$/,'')}/ga/fantasy5.csv` : undefined);

  if (!remote) {
    return NextResponse.json({ error: "No remote configured for Fantasy 5" }, { status: 500 });
  }

  try {
    const r = await fetch(remote, { cache: "no-store" as any, next: { revalidate: 0 } as any });
    if (!r.ok) {
      return NextResponse.json({ error: `Upstream ${r.status} for ${remote}` }, { status: 502 });
    }

    const headers = new Headers(r.headers);
    headers.set("Content-Type", "text/csv; charset=utf-8");
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    headers.delete("ETag"); // avoid intermediary caching quirks

    return new NextResponse(r.body, { status: 200, headers });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Remote fetch failed" }, { status: 502 });
  }
}
