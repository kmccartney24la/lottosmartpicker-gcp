import { NextRequest, NextResponse } from 'next/server';
import { getSession } from './session';

// --- Request Size Limits ---
const MAX_REQUEST_BODY_SIZE = 1024 * 10; // 10KB

export async function enforceRequestSizeLimit(request: NextRequest): Promise<NextResponse | null> {
  if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_REQUEST_BODY_SIZE) {
      return new NextResponse('Request Entity Too Large', { status: 413 });
    }
  }
  return null;
}

// --- Timeout Configurations (Conceptual for Next.js Middleware) ---
// Next.js middleware itself doesn't have a direct timeout mechanism for the request processing.
// Timeouts are typically handled at the serverless function level (e.g., Cloud Run instance timeout)
// or by the upstream client. This function serves as a placeholder or for future integration
// with a custom server or edge runtime that supports explicit timeouts.
export function enforceTimeout(request: NextRequest): Promise<NextResponse | null> {
  // In a real scenario, you might use a Promise.race with a timeout.
  // For Next.js middleware, this is more about conceptual understanding.
  return Promise.resolve(null);
}

// --- Basic Rate Limiting per Session ---
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 100; // 100 requests per minute

interface RateLimitData {
  count: number;
  lastReset: number;
}

const rateLimits = new Map<string, RateLimitData>(); // Map session ID to rate limit data

export function enforceRateLimit(request: NextRequest): NextResponse | null {
  const sessionId = request.cookies.get('lsp.sid')?.value;

  if (!sessionId) {
    // If no session, apply a global or stricter rate limit, or deny.
    // For now, we'll allow it to pass, but a real app would handle this.
    return null;
  }

  const now = Date.now();
  const limitData = rateLimits.get(sessionId) || { count: 0, lastReset: now };

  if (now - limitData.lastReset > RATE_LIMIT_WINDOW_MS) {
    // Reset window
    limitData.count = 1;
    limitData.lastReset = now;
  } else {
    limitData.count++;
  }

  rateLimits.set(sessionId, limitData);

  if (limitData.count > MAX_REQUESTS_PER_WINDOW) {
    return new NextResponse('Too Many Requests', { status: 429 });
  }

  return null;
}