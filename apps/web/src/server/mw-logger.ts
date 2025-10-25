// apps/web/src/server/mw-logger.ts
// Edge-safe logger shim for middleware. No Node APIs here.
export function logSecurityEvent(
  req: Request,
  event: string,
  outcome: 'success' | 'failure',
  extra?: Record<string, unknown>
) {
  try {
    // keep it simple; Edge has console.* and URL
    const url = new URL(req.url);
    console.info('[SEC]', outcome, event, {
      path: url.pathname,
      ...extra,
    });
  } catch {
    // best-effort
    console.info('[SEC]', outcome, event, extra ?? {});
  }
}

export function detectSuspiciousActivity(
  req: Request,
  code: string,
  extra?: Record<string, unknown>
) {
  try {
    const url = new URL(req.url);
    console.warn('[SUS]', code, { path: url.pathname, ...extra });
  } catch {
    console.warn('[SUS]', code, extra ?? {});
  }
}
