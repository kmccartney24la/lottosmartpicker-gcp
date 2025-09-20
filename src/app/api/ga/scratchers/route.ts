// app/api/ga/scratchers/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const base = process.env.NEXT_PUBLIC_DATA_BASE_URL;
  if (!base) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_DATA_BASE_URL not set" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Canonical path (adjust if your job uses a different filename)
  const remoteUrl = `${base.replace(/\/+$/,'')}/scratchers/ga/index.json`;

  const res = await fetch(remoteUrl, { cache: "no-store" as any, next: { revalidate: 0 } as any });
  if (!res.ok) {
    return NextResponse.json(
      { error: `Upstream ${res.status} for ${remoteUrl}` },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }

  const data = await res.json();
  return NextResponse.json(data, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "X-LSP-Data-URL": remoteUrl,
    },
  });
}
