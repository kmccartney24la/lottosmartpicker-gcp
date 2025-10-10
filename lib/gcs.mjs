// lib/gcs.mjs
// ESM
import crypto from 'node:crypto';
import { Storage } from '@google-cloud/storage';

const storage = new Storage();

/** Preferred public base URL for files.
 * Order:
 *   1) PUBLIC_BASE_URL (runtime, Cloud Run/Jobs)
 *   2) NEXT_PUBLIC_DATA_BASE or NEXT_PUBLIC_DATA_BASE_URL (build/dev)
 *   3) '/api/file' (local/dev fallback)
 */
export function getPublicBaseUrl() {
  const fromRuntime = (process.env.PUBLIC_BASE_URL || '').trim();
  const fromNext = (process.env.NEXT_PUBLIC_DATA_BASE || process.env.NEXT_PUBLIC_DATA_BASE_URL || '').trim();
  const base = (fromRuntime || fromNext || '/api/file').replace(/\/+$/, '');
  return base;
}

/** Derive a GCS bucket name.
 * If GCS_BUCKET is set, use it.
 * Else, try to extract from PUBLIC_BASE_URL when it points at storage.googleapis.com/<bucket>.
 * As a last resort, default to 'lottosmartpicker-data'.
 */
export function deriveBucketFromBaseUrl() {
  // Accept either GCS_BUCKET (preferred) or DATA_BUCKET (legacy/local)
  const explicit = (process.env.GCS_BUCKET || process.env.DATA_BUCKET || '').trim();
  if (explicit) return explicit;
  const base = (process.env.PUBLIC_BASE_URL
    || process.env.NEXT_PUBLIC_DATA_BASE_URL
    || process.env.NEXT_PUBLIC_DATA_BASE
    || '').trim();
  const m = base.match(/^https?:\/\/(?:storage\.googleapis\.com)\/([^/?#]+)/i);
  return m ? m[1] : 'lottosmartpicker-data';
}

/** Build a public URL for an object path (uses getPublicBaseUrl). */
export function publicUrlFor(objectPath) {
  const base = getPublicBaseUrl();
  return `${base}/${encodeURI(objectPath)}`;
}

export async function downloadIfExists(bucketName, objectPath) {
  try {
    const [buf] = await storage.bucket(bucketName).file(objectPath).download();
    return buf;
  } catch (e) {
    if (e && e.code === 404) return null;
    throw e;
  }
}

export function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** Upload only if content differs; sets sensible metadata. Returns {uploaded:boolean}. */
export async function upsertObject({ bucketName, objectPath, contentType, bodyBuffer, cacheControl }) {
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectPath);

  // Compare with existing (idempotency)
  const before = await downloadIfExists(bucketName, objectPath);
  if (before && sha256(before) === sha256(bodyBuffer)) {
    console.log(`[GCS] Unchanged: gs://${bucketName}/${objectPath}`);
    return { uploaded: false };
  }

  await file.save(bodyBuffer, {
    contentType,
    resumable: false,
    metadata: {
      cacheControl: cacheControl ?? 'public, max-age=300, must-revalidate'
    },
    // If overwriting, save() is fine. (No need to delete first.)
  });

  console.log(`[GCS] Uploaded: gs://${bucketName}/${objectPath} (${bodyBuffer.length} bytes)`);
  return { uploaded: true };
}
