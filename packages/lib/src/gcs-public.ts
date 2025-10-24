// lib/gcs-public.ts
// Safe for the browser: no node built-ins, no @google-cloud/* imports.

/** Returns the public base URL where CSV/JSON files are served. */
export function getPublicBaseUrl(): string {
  const env: Record<string, string | undefined> =
    typeof process !== 'undefined' ? (process.env as any) : {};
  // Prefer NEXT_PUBLIC_* (available in the browser). Fallback to the CDN.
  const base =
    (env.NEXT_PUBLIC_DATA_BASE_URL ?? env.NEXT_PUBLIC_DATA_BASE)?.trim() ||
    'https://data.lottosmartpicker.com';
  return base.replace(/\/+$/, '');
}

/** Example: "https://data.lottosmartpicker.com" */
export const FILE_BASE = getPublicBaseUrl();

/** Join the base with a relative path like "ga/scratchers/index.json". */
export function publicUrlFor(relPath: string): string {
  const p = relPath.replace(/^\/+/, '');
  return `${FILE_BASE}/${p}`;
}

/** Best-effort bucket inference, safe on both server and client. */
export function deriveBucketFromBaseUrl(): string {
  const base = getPublicBaseUrl();
  // Matches https://storage.googleapis.com/<bucket>/...
  const m = base.match(/^https?:\/\/[^/]+\/([^/?#]+)/i);
  return m?.[1] ?? 'lottosmartpicker-data';
}

