// lib/gcs.mjs
// ESM
import crypto from 'node:crypto';
import { Storage } from '@google-cloud/storage';
import { fetch as undiciFetch } from 'undici';

const storage = new Storage();

/** Derive bucket name from NEXT_PUBLIC_DATA_BASE_URL to avoid new envs. */
export function deriveBucketFromBaseUrl() {
  const base = process.env.NEXT_PUBLIC_DATA_BASE_URL || '';
  // e.g. https://storage.googleapis.com/lottosmartpicker-data
  const m = base.match(/https?:\/\/[^/]+\/([^/?#]+)/i);
  return m ? m[1] : 'lottosmartpicker-data';
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
