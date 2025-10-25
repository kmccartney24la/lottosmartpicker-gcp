// packages/lib/src/gcs.ts
// ESM
import crypto from "node:crypto";
import { Storage } from "@google-cloud/storage";

const storage = new Storage();

/** Preferred public base URL for files. */
export function getPublicBaseUrl(): string {
  const fromRuntime = (process.env.PUBLIC_BASE_URL || "").trim();
  const fromNext = (
    process.env.NEXT_PUBLIC_DATA_BASE ||
    process.env.NEXT_PUBLIC_DATA_BASE_URL ||
    ""
  ).trim();
  const base = (fromRuntime || fromNext || "/api/file").replace(/\/+$/, "");
  return base;
}

/** Derive a GCS bucket name. */
export function deriveBucketFromBaseUrl(): string {
  const explicit = (process.env.GCS_BUCKET || process.env.DATA_BUCKET || "").trim();
  if (explicit) return explicit;

  const base = (
    process.env.PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_DATA_BASE_URL ||
    process.env.NEXT_PUBLIC_DATA_BASE ||
    ""
  ).trim();

  const m = base.match(/^https?:\/\/(?:storage\.googleapis\.com)\/([^/?#]+)/i);
  return m?.[1] ?? 'lottosmartpicker-data';
}

/** Build a public URL for an object path. */
export function publicUrlFor(objectPath: string): string {
  const base = getPublicBaseUrl();
  return `${base}/${encodeURI(objectPath)}`;
}

/** Download an object if it exists. Returns null on 404. */
export async function downloadIfExists(
  bucketName: string,
  objectPath: string
): Promise<Buffer | null> {
  try {
    const [buf] = await storage.bucket(bucketName).file(objectPath).download();
    // google-cloud returns a Node.js Buffer
    return buf as Buffer;
  } catch (e: unknown) {
    const code = (e as { code?: number | string })?.code;
    if (code === 404 || code === "404") return null;
    throw e;
  }
}

/** Read an object as UTF-8 text. Returns null if not found (404). */
export async function getObjectText(args: {
  bucketName: string;
  objectPath: string;
}): Promise<string | null> {
  const { bucketName, objectPath } = args;
  const buf = await downloadIfExists(bucketName, objectPath);
  return buf ? buf.toString("utf8") : null;
}

export function sha256(buf: Buffer | Uint8Array | string): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/** Upload only if content differs; sets sensible metadata. */
export async function upsertObject(args: {
  bucketName: string;
  objectPath: string;
  contentType: string;
  bodyBuffer: Buffer | Uint8Array;
  cacheControl?: string;
}): Promise<{ uploaded: boolean }> {
  const { bucketName, objectPath, contentType, bodyBuffer, cacheControl } = args;

  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectPath);

  // Idempotency: compare with existing
  const before = await downloadIfExists(bucketName, objectPath);
  if (before && sha256(before) === sha256(bodyBuffer)) {
    console.log(`[GCS] Unchanged: gs://${bucketName}/${objectPath}`);
    return { uploaded: false };
  }

  await file.save(bodyBuffer, {
    contentType,
    resumable: false,
    metadata: {
      cacheControl: cacheControl ?? "public, max-age=300, must-revalidate",
    },
  });

  console.log(`[GCS] Uploaded: gs://${bucketName}/${objectPath} (${bodyBuffer.length} bytes)`);
  return { uploaded: true };
}
