// app/api/file/[...path]/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { GoogleAuth } from "google-auth-library";

export const runtime = "nodejs";          // needs metadata server
// Don’t force dynamic — allow framework/edge caching.
// If you need short freshness, tune revalidate instead of disabling cache entirely.
export const revalidate = 600; // seconds; cache at the framework layer for 10 minutes

const BUCKET = process.env.DATA_BUCKET ?? "lottosmartpicker-data";
const ALLOWLIST = (process.env.DATA_PREFIX_ALLOWLIST ?? "ga/,fl/,ny/,ca/,multi/,scratchers/")
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
  let t: string;
  try { t = await token(); } catch {
    return new NextResponse("Upstream auth error", { status: 502 });
  }
  // Forward conditional headers to enable 304s
  const condHeaders: Record<string, string> = {};
  const inm = req.headers.get("if-none-match");
  const ims = req.headers.get("if-modified-since");
  if (inm) condHeaders["If-None-Match"] = inm;
  if (ims) condHeaders["If-Modified-Since"] = ims;
  const upstream = await fetch(
    url,
    {
      headers: { Authorization: `Bearer ${t}`, ...condHeaders },
      // Hint Next/Vercel to memoize this origin fetch for revalidate seconds
      // (applies between route invocations; reduces origin trips).
      cache: "force-cache",
      next: { revalidate }
    }
  );
  if (upstream.status === 304) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        // Cacheable at CDNs; clients get 5m, CDNs can serve SWR up to 1y.
        // s-maxage specifically targets shared caches (CDN/edge).
        "Cache-Control": "public, max-age=300, s-maxage=600, stale-while-revalidate=31536000",
        "Vary": "Accept-Encoding",
        "ETag": upstream.headers.get("etag") ?? "",
        "Last-Modified": upstream.headers.get("last-modified") ?? ""
      }
    });
  }
  if (!upstream.ok) return new NextResponse("Upstream error", { status: upstream.status });
  const ct = upstream.headers.get("content-type") || guessContentType(key);
  const res = new NextResponse(upstream.body, { status: 200 });
  res.headers.set("Content-Type", ct);
  // Public + client max-age + shared-cache s-maxage + SWR for long tail.
  res.headers.set("Cache-Control", "public, max-age=300, s-maxage=600, stale-while-revalidate=31536000");
  res.headers.set("Vary", "Accept-Encoding");
  // Pass through validators when available
  const etag = upstream.headers.get("etag");
  const lm = upstream.headers.get("last-modified");
  if (etag) res.headers.set("ETag", etag);
  if (lm) res.headers.set("Last-Modified", lm);
  // Ensure nothing marks this as private/non-cacheable.
  res.headers.delete("Set-Cookie");
  return res;
}

export async function HEAD(_req: NextRequest, { params }: { params: { path?: string[] } }) {
  const key = (params.path ?? []).join("/").replace(/^\/+/, "");
  if (!key || key.includes("..") || key.startsWith("_") || !allowed(key)) {
    return new NextResponse(null, { status: 404 });
  }
  const url = mediaUrl(BUCKET, key);
  let t: string;
  try { t = await token(); } catch {
    return new NextResponse(null, { status: 502 });
  }
  // Forward conditionals for 304 on HEAD too
  const condHeaders: Record<string, string> = {};
  const inm = _req.headers.get("if-none-match");
  const ims = _req.headers.get("if-modified-since");
  if (inm) condHeaders["If-None-Match"] = inm;
  if (ims) condHeaders["If-Modified-Since"] = ims;
  const upstream = await fetch(
    url,
    {
      method: "HEAD",
      headers: { Authorization: `Bearer ${t}`, ...condHeaders },
      cache: "force-cache",
      next: { revalidate }
    }
  );
  const status = upstream.status; // may be 304
  const res = new NextResponse(null, { status });
  res.headers.set("Content-Type", upstream.headers.get("content-type") || guessContentType(key));
  res.headers.set("Cache-Control", "public, max-age=300, s-maxage=600, stale-while-revalidate=31536000");
  res.headers.set("Vary", "Accept-Encoding");
  const etag = upstream.headers.get("etag");
  const lm = upstream.headers.get("last-modified");
  if (etag) res.headers.set("ETag", etag);
  if (lm) res.headers.set("Last-Modified", lm);
  return res;
}
