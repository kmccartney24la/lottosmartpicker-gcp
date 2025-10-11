// app/api/file/[...path]/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { GoogleAuth } from "google-auth-library";

export const runtime = "nodejs";          // needs metadata server
export const dynamic = "force-dynamic";   // stream bytes, not statically optimized

const BUCKET = process.env.DATA_BUCKET ?? "lottosmartpicker-data";
const ALLOWLIST = (process.env.DATA_PREFIX_ALLOWLIST ?? "ga/,ny/,multi/,scratchers/")
  .split(",").map(s => s.trim()).filter(Boolean);

function allowed(key: string) {
  return ALLOWLIST.some(p => key.startsWith(p));
}
function mediaUrl(bucket: string, key: string) {
  // JSON API alt=media (works with OAuth2)
  return `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(key)}?alt=media`;
}
function guessContentType(path: string) {
  if (/\.(csv)(\?|$)/i.test(path)) return "text/csv; charset=utf-8";
  if (/\.(json)(\?|$)/i.test(path)) return "application/json; charset=utf-8";
  if (/\.(png)(\?|$)/i.test(path)) return "image/png";
  if (/\.(jpe?g)(\?|$)/i.test(path)) return "image/jpeg";
  if (/\.(webp)(\?|$)/i.test(path)) return "image/webp";
  if (/\.(gif)(\?|$)/i.test(path)) return "image/gif";
  if (/\.(svg)(\?|$)/i.test(path)) return "image/svg+xml";
  return "application/octet-stream";
}
async function token() {
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/devstorage.read_only"] });
  const c = await auth.getClient();
  const t = await c.getAccessToken();
  if (!t || !t.token) throw new Error("no access token");
  return t.token;
}

export async function GET(req: NextRequest, { params }: { params: { path?: string[] } }) {
  const key = (params.path ?? []).join("/").replace(/^\/+/, "");
  // Basic hardening: no traversal or hidden/system paths
  if (!key || key.includes("..") || key.startsWith("_")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!allowed(key)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = mediaUrl(BUCKET, key);
  const t = await token();
  // Forward conditional headers to enable 304s
  const condHeaders: Record<string, string> = {};
  const inm = req.headers.get("if-none-match");
  const ims = req.headers.get("if-modified-since");
  if (inm) condHeaders["If-None-Match"] = inm;
  if (ims) condHeaders["If-Modified-Since"] = ims;
  const upstream = await fetch(url, {
    headers: { Authorization: `Bearer ${t}`, ...condHeaders }
  });
  if (upstream.status === 304) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=31536000",
        "ETag": upstream.headers.get("etag") ?? "",
        "Last-Modified": upstream.headers.get("last-modified") ?? ""
      }
    });
  }
  if (!upstream.ok) return new NextResponse("Upstream error", { status: upstream.status });
  const ct = upstream.headers.get("content-type") || guessContentType(key);
  const res = new NextResponse(upstream.body, { status: 200 });
  res.headers.set("Content-Type", ct);
  res.headers.set("Cache-Control", "public, max-age=300, stale-while-revalidate=31536000");
  // Pass through validators when available
  const etag = upstream.headers.get("etag");
  const lm = upstream.headers.get("last-modified");
  if (etag) res.headers.set("ETag", etag);
  if (lm) res.headers.set("Last-Modified", lm);
  res.headers.delete("Vary");
  res.headers.delete("Set-Cookie");
  return res;
}

export async function HEAD(_req: NextRequest, { params }: { params: { path?: string[] } }) {
  const key = (params.path ?? []).join("/").replace(/^\/+/, "");
  if (!key || key.includes("..") || key.startsWith("_") || !allowed(key)) {
    return new NextResponse(null, { status: 404 });
  }
  const url = mediaUrl(BUCKET, key);
  const t = await token();
  const upstream = await fetch(url, { method: "HEAD", headers: { Authorization: `Bearer ${t}` } });
  return new NextResponse(null, {
    status: upstream.ok ? 200 : upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || guessContentType(key),
      "Cache-Control": "public, max-age=300, stale-while-revalidate=31536000",
      "ETag": upstream.headers.get("etag") ?? "",
      "Last-Modified": upstream.headers.get("last-modified") ?? ""
    },
  });
}
