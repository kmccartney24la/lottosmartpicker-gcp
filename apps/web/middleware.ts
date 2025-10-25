// apps/web/middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
// Local, Edge-safe helpers
import { createSession, getSession, rotateCsrfToken, validateCsrfToken, isSessionExpired } from "./src/server/session";
import { enforceRequestSizeLimit, enforceRateLimit } from "./src/server/security";
import { logSecurityEvent, detectSuspiciousActivity } from "./src/server/mw-logger";

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN || "https://app.lottosmartpicker.com";
const APP_HOST = new URL(APP_ORIGIN).host;
const UA_BLOCK = /(curl|wget|python-requests|scrapy|httpclient|postman|insomnia|go-http-client)/i;

// Public, unauthenticated API endpoints (read-only) - with basic security controls
const PUBLIC_API = [
  /^\/api\/ping$/,            // health
  /^\/api\/file(?:\/|$)/,   // ← existing route, now the true proxy
  /^\/api\/multi(?:\/|$)/,    // CSV→JSON converter
  /^\/api\/scratchers$/,      // scratchers data (enhanced but public)
];

// Semi-public endpoints - require basic security but no session/CSRF
const SEMI_PUBLIC_API = [
  /^\/api\/diag\/remotes$/,   // diagnostics (basic security controls)
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ua = (req.headers.get("user-agent") || "").toLowerCase();
  const sfs = req.headers.get("sec-fetch-site") || "";
  const accept = req.headers.get("accept") || "";
  // Treat normal browser navigations as "HTML-like" even if Accept is */* (some proxies/clients)
  const isHTMLLike = (req.method.toUpperCase() === "GET") && !pathname.startsWith("/api/");
  const isHTML = accept.includes("text/html");
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").toLowerCase();
  const method = req.method.toUpperCase();

  // Compute these once; we need them in multiple places
  const p = pathname;
  const isApi = p.startsWith("/api/");
  const isStatic =
    p.startsWith("/_next/") ||
    p.startsWith("/brand/") ||
    p.startsWith("/favicon") ||
    p === "/robots.txt" ||
    p === "/sitemap.xml" ||
    p === "/ads.txt";
  const isBareDraws = p === "/" || p === "/index.html";
  const isBareScratchers = p === "/scratchers";
  const isStatePrefixed =
    p.startsWith("/ga") || p.startsWith("/ny") || p.startsWith("/fl") || p.startsWith("/ca");

  // Canonical host: redirect HTML from app. → apex
  if (host === APP_HOST && APP_HOST === "app.lottosmartpicker.com" && (isHTML || isHTMLLike)) {
    const url = req.nextUrl.clone();
    url.host = "lottosmartpicker.com";
    url.protocol = "https";
    // Avoid redirect loops for API/static paths
    const p2 = url.pathname;
    const isApi2 = p2.startsWith("/api/");
    const isStatic2 =
      p2.startsWith("/_next/") ||
      p2.startsWith("/brand/") ||
      p2.startsWith("/favicon") ||
      p2 === "/robots.txt" ||
      p2 === "/sitemap.xml" ||
      p2 === "/ads.txt";
    if (!isApi2 && !isStatic2) {
      return NextResponse.redirect(url, 301);
    }
  }

  // ---- Geo redirects for unprefixed entry points (before heavy security/session) ----
  if ( (isHTML || isHTMLLike) && !isApi && !isStatic ) {
    if (!isStatePrefixed && (isBareDraws || isBareScratchers)) {
      const st = inferStateFromHeaders(req);
      const target = isBareScratchers ? `/${st}/scratchers` : `/${st}`;
      const url = req.nextUrl.clone();
      url.pathname = target;
      return NextResponse.redirect(url, 302);
    }
  }
  // TS-safe geo inference using headers only.
  function inferStateFromHeaders(req: NextRequest): 'ga' | 'ny' | 'fl' | 'ca' {
    const up = (v: string | null) => (v || '').toUpperCase();
    // Vercel-style
    const vcCountry = up(req.headers.get('x-vercel-ip-country'));
    const vcRegion  = up(req.headers.get('x-vercel-ip-country-region'));
    // Cloudflare-style fallbacks
    const cfCountry = up(req.headers.get('cf-ipcountry'));
    const cfRegion  = up(req.headers.get('x-region-code')) || up(req.headers.get('x-vercel-ip-region'));
    const country = vcCountry || cfCountry;
    const region  = vcRegion  || cfRegion;
    if (country === 'US') {
      if (region === 'NY') return 'ny';
      if (region === 'FL') return 'fl';
      if (region === 'GA') return 'ga';
      if (region === 'CA') return 'ca'; // California
    }
    return 'ga'; // default
  }

  // --- Security Controls (early exit for critical issues) ---
  // 1. Request Size Limit
  const sizeLimitResponse = await enforceRequestSizeLimit(req);
  if (sizeLimitResponse) {
    logSecurityEvent(req, 'REQUEST_SIZE_EXCEEDED', 'failure', { size: req.headers.get('content-length') });
    return sizeLimitResponse;
  }

  // Note: Rate limiting moved to specific endpoint handling to ensure proper session context

  // Always pass OPTIONS
  if (method === "OPTIONS") {
    const res = new NextResponse(null, { status: 204 });
    // Same-origin proxy doesn’t require CORS, but keeping this is harmless.
    res.headers.set("Access-Control-Allow-Origin", new URL(APP_ORIGIN).origin);
    res.headers.set("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "Content-Type,Authorization,X-CSRF-Token");
    res.headers.set("Vary", "Origin");
    return res;
  }

  const res = NextResponse.next();
  let sessionId = req.cookies.get("lsp.sid")?.value;
  let session = sessionId ? getSession(sessionId) : undefined;

  // Session management
  if (!session || (sessionId ? isSessionExpired(sessionId) : true)) {
    const newId = createSession(req);
    sessionId = newId;
    session = getSession(newId); // Re-fetch the newly created session
    // Use the (name, value, options) overload to satisfy types
    res.cookies.set(
      "lsp.sid",
      newId,
      {
        path: "/",
        maxAge: 60 * 60 * 24, // 1 day
        sameSite: "lax",
        secure: true,
        httpOnly: true,
      }
    );
    logSecurityEvent(req, 'SESSION_CREATED', 'success', { newSessionId: sessionId });
  } else {
    // Session rotation: Rotate CSRF token on every request to a protected API route
    if (pathname.startsWith("/api/") && !PUBLIC_API.some((re) => re.test(pathname))) {
      const oldCsrfToken = session.csrfToken;
      // sessionId should exist here, but assert defensively for type + runtime safety
      if (!sessionId) {
        logSecurityEvent(req, 'MISSING_SESSION_ID', 'failure');
        return new NextResponse("Missing session", { status: 403 });
      }
      rotateCsrfToken(sessionId);
      session = getSession(sessionId); // Update session after rotation
      logSecurityEvent(req, 'CSRF_TOKEN_ROTATED', 'success', {
        oldCsrfToken,
        newCsrfToken: session?.csrfToken
      });
    }
  }

  // Set CSRF token in a client-accessible cookie for non-HTML requests to protected APIs
  if (!isHTML && pathname.startsWith("/api/") && !PUBLIC_API.some((re) => re.test(pathname)) && session?.csrfToken) {
    res.cookies.set(
      "csrf-token",
      session.csrfToken,
      {
        path: "/",
        maxAge: 60 * 60, // 1 hour
        sameSite: "lax",
        secure: true,
        httpOnly: false, // Client-side accessible
      }
    );
  }

  // ✅ Allow public data endpoints (GET/HEAD) with no UA/cookie checks
  if (pathname.startsWith("/api/") && PUBLIC_API.some((re) => re.test(pathname))) {
    if (method === "GET" || method === "HEAD") {
      // Same-origin: no special CORS needed; leaving these headers is OK.
      res.headers.set("Access-Control-Allow-Origin", new URL(APP_ORIGIN).origin);
      res.headers.set("Vary", "Origin");
      return res;
    }
    logSecurityEvent(req, 'METHOD_NOT_ALLOWED', 'failure', { method });
    return new NextResponse("Method Not Allowed", { status: 405 });
  }

  // 🔒 Semi-public endpoints with basic security controls
  if (pathname.startsWith("/api/") && SEMI_PUBLIC_API.some((re) => re.test(pathname))) {
    if (method !== "GET" && method !== "HEAD") {
      logSecurityEvent(req, 'METHOD_NOT_ALLOWED', 'failure', { method });
      return new NextResponse("Method Not Allowed", { status: 405 });
    }

    // Apply basic security controls for semi-public endpoints
    if (UA_BLOCK.test(ua)) {
      logSecurityEvent(req, 'UA_BLOCK', 'failure', { userAgent: ua });
      return new NextResponse("Forbidden", { status: 403 });
    }

    if (host !== APP_HOST) {
      logSecurityEvent(req, 'INVALID_HOST', 'failure', { host, appHost: APP_HOST });
      return new NextResponse("Forbidden", { status: 403 });
    }

    // Apply rate limiting for semi-public endpoints (with session if available)
    const rateLimitResponse = enforceRateLimit(req);
    if (rateLimitResponse) {
      logSecurityEvent(req, 'RATE_LIMIT_EXCEEDED', 'failure');
      return rateLimitResponse;
    }

    res.headers.set("Access-Control-Allow-Origin", new URL(APP_ORIGIN).origin);
    res.headers.set("Vary", "Origin");
    logSecurityEvent(req, 'SEMI_PUBLIC_ACCESS', 'success', { endpoint: pathname });
    return res;
  }

  // 🔒 Protected API routes (everything not listed above)
  if (pathname.startsWith("/api/")) {
    if (UA_BLOCK.test(ua)) {
      logSecurityEvent(req, 'UA_BLOCK', 'failure', { userAgent: ua });
      return new NextResponse("Forbidden", { status: 403 });
    }
    if (sfs === "cross-site" || sfs === "none") {
      logSecurityEvent(req, 'CROSS_SITE_REQUEST', 'failure', { secFetchSite: sfs });
      return new NextResponse("Forbidden", { status: 403 });
    }
    if (host !== APP_HOST) {
      logSecurityEvent(req, 'INVALID_HOST', 'failure', { host });
      return new NextResponse("Forbidden", { status: 403 });
    }
    if (!sessionId || !session) {
      logSecurityEvent(req, 'MISSING_SESSION', 'failure');
      return new NextResponse("Missing session", { status: 403 });
    }

    // Apply rate limiting for protected endpoints
    const rateLimitResponse = enforceRateLimit(req);
    if (rateLimitResponse) {
      logSecurityEvent(req, 'RATE_LIMIT_EXCEEDED', 'failure');
      return rateLimitResponse;
    }

    // CSRF Protection for non-GET/HEAD requests
    if (method !== "GET" && method !== "HEAD") {
      const csrfTokenHeader = req.headers.get("x-csrf-token");
      if (!csrfTokenHeader || !validateCsrfToken(sessionId, csrfTokenHeader)) {
        detectSuspiciousActivity(req, 'CSRF_TOKEN_MISMATCH', { csrfTokenHeader });
        logSecurityEvent(req, 'CSRF_TOKEN_MISMATCH', 'failure', { csrfTokenHeader });
        return new NextResponse("CSRF token mismatch", { status: 403 });
      }
      logSecurityEvent(req, 'CSRF_TOKEN_VALIDATED', 'success');
    }

    res.headers.set("Access-Control-Allow-Origin", new URL(APP_ORIGIN).origin);
    res.headers.set("Vary", "Origin");
  }

  return res;
}

export const config = {
  matcher: [
    "/api/:path*",
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|ads.txt|sitemap.xml).*)",
  ],
};
