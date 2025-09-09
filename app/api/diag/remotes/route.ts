// app/api/diag/remotes/route.ts
import { NextResponse } from "next/server";
// If you renamed to remotes.ts:
import { remoteFor } from "@lib/server/remotes";
// If you kept remote.ts (singular), then:
// import { remoteFor } from "@/lib/server/remote";

export const runtime = "nodejs";

const GAMES = ["powerball", "megamillions", "ga_cash4life", "ga_fantasy5"] as const;
type Game = (typeof GAMES)[number];

async function probe(url: string) {
  try {
    const head = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (head.ok) {
      return {
        ok: true,
        method: "HEAD",
        status: head.status,
        contentLength: head.headers.get("content-length"),
        etag: head.headers.get("etag"),
        lastModified: head.headers.get("last-modified"),
        contentType: head.headers.get("content-type"),
      };
    }
    const get = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      cache: "no-store",
    });
    return {
      ok: get.ok,
      method: "GET",
      status: get.status,
      contentRange: get.headers.get("content-range"),
      etag: get.headers.get("etag"),
      lastModified: get.headers.get("last-modified"),
      contentType: get.headers.get("content-type"),
    };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

export async function GET() {
  const results = [];
  for (const game of GAMES) {
    try {
      const url = remoteFor(game);
      results.push({ game, url, probe: await probe(url) });
    } catch (err: any) {
      results.push({ game, url: "", probe: { ok: false, error: String(err?.message ?? err) } });
    }
  }
  return NextResponse.json({ now: new Date().toISOString(), count: results.length, results });
}
