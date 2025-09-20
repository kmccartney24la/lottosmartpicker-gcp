// app/api/ga/scratchers/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Build absolute candidate URLs from runtime env only (no relative fallbacks in prod).
 * Supports both new and legacy env names.
 */
function buildCandidates(): string[] {
  const env = process.env;

  const absFileEnv = [
    env.GA_SCRATCHERS_INDEX_URL,          // legacy exact file
    env.NEXT_PUBLIC_GA_SCRATCHERS_INDEX_URL,
    env.GA_SCRATCHERS_URL,                // new-style exact file (if you used it)
  ].filter((v): v is string => !!v && /\.json(\?.*)?$/i.test(v));

  const baseEnv = [
    env.PUBLIC_BASE_URL,                  // preferred runtime base
    env.NEXT_PUBLIC_DATA_BASE,            // fallback base if present
    env.GA_SCRATCHERS_INDEX_BASE,         // legacy base folder
    env.NEXT_PUBLIC_GA_SCRATCHERS_INDEX_BASE,
    env.GA_SCRATCHERS_BASE,               // new-style base (if you used it)
  ].filter((v): v is string => !!v);

  const out: string[] = [];

  // 1) Exact file URLs first (try sibling swap if index.json)
  for (const uRaw of absFileEnv) {
    const u = uRaw.replace(/\/+$/, "");
    if (u.endsWith("/index.json")) {
      out.push(u.replace(/\/index\.json$/, "/index.latest.json"), u);
    } else if (u.endsWith("/index.latest.json")) {
      out.push(u, u.replace(/\/index\.latest\.json$/, "/index.json"));
    } else {
      out.push(u);
    }
  }

  // 2) Expand bases into both folder layouts and both filenames
  const suffixes = [
    "/ga_scratchers/index.latest.json",
    "/ga_scratchers/index.json",
    "/ga/scratchers/index.latest.json",
    "/ga/scratchers/index.json",
  ];

  for (const bRaw of baseEnv) {
    const b = bRaw.replace(/\/+$/, "");
    // If someone passed a folder already ending in ga_scratchers or ga/scratchers, just add filenames
    const isFolder = /(\/ga_scratchers|\/ga\/scratchers)(\/|$)/.test(b);
    if (isFolder) {
      out.push(`${b}/index.latest.json`, `${b}/index.json`);
    } else {
      for (const s of suffixes) out.push(`${b}${s}`);
    }
  }

  // 3) In development only, include local relative fallbacks for convenience
  if (process.env.NODE_ENV !== "production") {
    out.push("/data/ga_scratchers/index.latest.json", "/data/ga_scratchers/index.json");
  }

  // De-dupe while preserving order
  const seen = new Set<string>();
  return out.filter((u) => (seen.has(u) ? false : (seen.add(u), true)));
}

async function fetchFirstOk(urls: string) {
  const res = await fetch(urls, { cache: "no-store" });
  if (!res.ok) throw new Error(`Upstream ${res.status} for ${urls}`);
  return res;
}

export async function GET() {
  const candidates = buildCandidates();

  if (candidates.length === 0) {
    return NextResponse.json(
      { error: "ConfigError", message: "No upstream candidates built from env." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  let lastErr: unknown;
  for (const url of candidates) {
    try {
      // Absolute URLs only in prod—we constructed them above.
      if (!/^https?:\/\//i.test(url) && process.env.NODE_ENV === "production") {
        continue; // skip any relative accidentally slipped in
      }

      const res = await fetchFirstOk(url);
      const data = await res.json();

      return NextResponse.json(data, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
          "X-LSP-Data-URL": url,
        },
      });
    } catch (e) {
      lastErr = e;
    }
  }

  return NextResponse.json(
    {
      error: "UpstreamUnavailable",
      message: (lastErr as any)?.message ?? "All candidates failed",
      tried: candidates,
    },
    {
      status: 502,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    },
  );
}
