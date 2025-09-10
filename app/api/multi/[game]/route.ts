// app/api/multi/[game]/route.ts
import { NextResponse } from "next/server";
import { remoteFor } from "@lib/server/remotes"; // ← your alias (no leading slash)

export const runtime = "nodejs";

const MAP = {
  powerball: "powerball",
  megamillions: "megamillions",
  ga_cash4life: "ga_cash4life",
  ga_fantasy5: "ga_fantasy5",
} as const;
type RouteGame = keyof typeof MAP;

export async function GET(
  _req: Request,
  ctx: { params: { game: string } }
) {
  const raw = (ctx.params.game || "").toLowerCase().trim();
  if (!(raw in MAP)) {
    return NextResponse.json(
      { error: `Unknown game '${raw}'. Supported: ${Object.keys(MAP).join(", ")}` },
      { status: 400 }
    );
  }

  const game = MAP[raw as RouteGame];
  let url: string;
  try {
    url = remoteFor(game);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "No remote URL configured" },
      { status: 500 }
    );
  }

  // Stream the CSV from R2 to the client.
  const upstream = await fetch(url, { method: "GET", cache: "no-store" });
  if (!upstream.ok) {
    return NextResponse.json(
      { error: `Upstream ${upstream.status} fetching ${url}` },
      { status: 502 }
    );
  }

  // Pass through content type/length if present.
  const headers = new Headers();
  const ct = upstream.headers.get("content-type") || "text/csv";
  headers.set("content-type", ct);
  const cl = upstream.headers.get("content-length");
  if (cl) headers.set("content-length", cl);

  return new NextResponse(upstream.body, { status: 200, headers });
}
