// app/api/file/[...path]/route.ts
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// app/api/file/[...path]/route.ts (only the base resolver changed)
function dataBase(): string {
  const env = process.env as Record<string, string | undefined>;
  const b =
    env.PUBLIC_BASE_URL ||
    env.NEXT_PUBLIC_DATA_BASE ||
    env.NEXT_PUBLIC_DATA_BASE_URL ||
    "";
  return b.replace(/\/+$/, "");
}


function guessContentType(path: string): string {
  if (/\.(csv)(\?|$)/i.test(path)) return "text/csv; charset=utf-8";
  if (/\.(json)(\?|$)/i.test(path)) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

export const GET = handle;
export const HEAD = handle;

async function handle(
  req: NextRequest,
  { params }: { params: { path?: string[] } }
) {
  const rel = (params.path ?? []).join("/").replace(/^\/+/, "");
  const base = dataBase();
  if (!base) {
    return NextResponse.json(
      { error: "PUBLIC_BASE_URL not configured on service" },
      { status: 500 }
    );
  }
  const remote = `${base}/${rel}`;

  // 1) Try remote (GCS/public)
  try {
    const r = await fetch(remote, { cache: "no-store" as any });
    if (r.ok) {
      const ct = r.headers.get("content-type") || guessContentType(rel);
      const etag = r.headers.get("etag") || undefined;
      const headers: Record<string, string> = {
        "Content-Type": ct,
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      };
      if (etag) headers["ETag"] = etag;
      if (req.method === "HEAD") return new NextResponse(null, { status: 200, headers });
      const body = Buffer.from(await r.arrayBuffer());
      return new NextResponse(body, { status: 200, headers });
    }
  } catch (e) {
    console.error("[/api/file] upstream fetch failed:", e);
  }

  // 2) Fallback to local /public (best-effort)
  try {
    const local = new URL(req.url);
    local.pathname = "/" + rel;
    const r = await fetch(local.toString(), { cache: "no-store" as any });
    if (r.ok) {
      const ct = r.headers.get("content-type") || guessContentType(rel);
      const headers: Record<string, string> = {
        "Content-Type": ct,
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      };
      if (req.method === "HEAD") return new NextResponse(null, { status: 200, headers });
      const body = Buffer.from(await r.arrayBuffer());
      return new NextResponse(body, { status: 200, headers });
    }
  } catch (e) {
    // ignore; we’ll return 404 below
  }

  return NextResponse.json(
    { error: "Not found", path: rel },
    { status: 404, headers: { "Cache-Control": "no-store" } }
  );
}
