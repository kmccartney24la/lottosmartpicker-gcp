// app/api/diag/remotes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { resolveIndexUrls } from "@lib/scratchers";
import { logSecurityEvent } from '@lib/logger';

export const runtime = "nodejs";

const GAMES = ["multi_powerball", "multi_megamillions", "multi_cash4life", "ga_fantasy5"] as const;
type Game = (typeof GAMES)[number];

function base(): string {
  const env = process.env as Record<string, string | undefined>;
  const b =
    env.NEXT_PUBLIC_DATA_BASE ||
    env.NEXT_PUBLIC_DATA_BASE_URL ||
    env.PUBLIC_BASE_URL ||
    "";
  return b.replace(/\/+$/, "");
}

function remoteFor(game: Game): string {
  const MAP: Record<Game, string> = {
    multi_powerball: "multi/powerball.csv",
    multi_megamillions: "multi/megamillions.csv",
    multi_cash4life: "multi/cash4life.csv",
    ga_fantasy5: "ga/fantasy5.csv",
  };
  const b = base();
  return b ? `${b}/${MAP[game]}` : "";
}

async function probe(url: string) {
  if (!url) return { ok: false, error: "empty url" as const };
  try {
    // Try HEAD first (GCS supports it), then a tiny ranged GET fallback.
    const head = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (head.ok) {
      return {
        ok: true,
        method: "HEAD" as const,
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
      method: "GET" as const,
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

export async function GET(request: NextRequest) {
  // Log access to this diagnostic endpoint
  logSecurityEvent(request, 'DIAG_REMOTES_ACCESS', 'success', {
    note: 'Diagnostic endpoint accessed - should be restricted in production'
  });

  // Draw-game CSVs
  const remotes = [];
  for (const game of GAMES) {
    try {
      const url = remoteFor(game);
      remotes.push({ game, url, probe: await probe(url) });
    } catch (err: any) {
      remotes.push({ game, url: "", probe: { ok: false, error: String(err?.message ?? err) } });
    }
  }

  // Scratchers JSON — show the exact resolution order and which one succeeds
  const scratchersTried: Array<{ url: string; probe: any }> = [];
  let scratchersWinner: string | undefined;
  let scratchersCount: number | undefined;

  for (const url of resolveIndexUrls()) {
    const p = await probe(url);
    scratchersTried.push({ url, probe: p });
    if (p.ok) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        const json = await res.json();
        scratchersCount = Array.isArray(json?.games) ? json.games.length : undefined;
        scratchersWinner = url;
        break;
      } catch (e: any) {
        // keep looping
      }
    }
  }

  return NextResponse.json({
    now: new Date().toISOString(),
    base: base(),
    remotes,
    scratchers: {
      winner: scratchersWinner,
      count: scratchersCount,
      tried: scratchersTried,
    },
  });
}
