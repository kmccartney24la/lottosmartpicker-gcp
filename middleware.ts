// middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  createSession,
  getSession,
  rotateCsrfToken,
  validateCsrfToken,
  isSessionExpired,
} from "./lib/session";
import { enforceRequestSizeLimit, enforceRateLimit } from "./lib/security";
import { logSecurityEvent, detectSuspiciousActivity } from "./lib/logger";

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN || "https://app.lottosmartpicker.com";
const APP_HOST = new URL(APP_ORIGIN).host;
const UA_BLOCK = /(curl|wget|python-requests|scrapy|httpclient|postman|insomnia|go-http-client)/i;

// Public, unauthenticated API endpoints (read-only) - with basic security controls
const PUBLIC_API = [
  /^\/api\/ping$/,            // health
  /^\/api\/file(?:\/|$)/,     // GCS proxy (CSV/JSON)
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
  const isHTML = accept.includes("text/html");
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").toLowerCase();
  const method = req.method.toUpperCase();

  // Canonical host: redirect HTML from app. → apex
if (host === APP_HOST && APP_HOST === "app.lottosmartpicker.com" && isHTML) {
  const url = req.nextUrl.clone();
  url.host = "lottosmartpicker.com";
  url.protocol = "https";
  // Avoid redirect loops for API/static paths
  const p = url.pathname;
  const isApi = p.startsWith("/api/");
  const isStatic = p.startsWith("/_next/") || p.startsWith("/brand/") || p.startsWith("/favicon") || p === "/robots.txt" || p === "/sitemap.xml" || p === "/ads.txt";
  if (!isApi && !isStatic) {
    return NextResponse.redirect(url, 301);
  }
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
  if (!session || isSessionExpired(sessionId!)) {
    sessionId = createSession(req);
    session = getSession(sessionId); // Re-fetch the newly created session
    res.cookies.set({
      name: "lsp.sid",
      value: sessionId,
      path: "/",
      maxAge: 60 * 60 * 24, // 1 day
      sameSite: "lax",
      secure: true,
      httpOnly: true, // Make session cookie httpOnly for security
    });
    logSecurityEvent(req, 'SESSION_CREATED', 'success', { newSessionId: sessionId });
  } else {
    // Session rotation: Rotate CSRF token on every request to a protected API route
    if (pathname.startsWith("/api/") && !PUBLIC_API.some((re) => re.test(pathname))) {
      const oldCsrfToken = session.csrfToken;
      rotateCsrfToken(sessionId);
      session = getSession(sessionId); // Update session after rotation
      logSecurityEvent(req, 'CSRF_TOKEN_ROTATED', 'success', { oldCsrfToken, newCsrfToken: session?.csrfToken });
    }
  }

  // Set CSRF token in a client-accessible cookie for non-HTML requests to protected APIs
  if (!isHTML && pathname.startsWith("/api/") && !PUBLIC_API.some((re) => re.test(pathname)) && session?.csrfToken) {
    res.cookies.set({
      name: "csrf-token",
      value: session.csrfToken,
      path: "/",
      maxAge: 60 * 60, // 1 hour
      sameSite: "lax",
      secure: true,
      httpOnly: false, // Client-side accessible
    });
  }

  // ✅ Allow public data endpoints (GET/HEAD) with no UA/cookie checks
  if (pathname.startsWith("/api/") && PUBLIC_API.some((re) => re.test(pathname))) {
    if (method === "GET" || method === "HEAD") {
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
