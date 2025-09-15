// scripts/scratchers/image_hosting.ts
import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fetch as undiciFetch, RequestInit, HeadersInit } from "undici";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

// -----------------------------
// Types
// -----------------------------
export type Hosted = { url: string; key: string; etag?: string; bytes: number; contentType: string };

export interface StorageProvider {
  put(key: string, bytes: Uint8Array, contentType: string, cacheControl?: string): Promise<Hosted>;
  head?(key: string): Promise<{ exists: boolean; etag?: string; bytes?: number }>;
  ensureBucket?(): Promise<void>;
  publicUrlFor(key: string): string;
}

// -----------------------------
// Options & Manifest
// -----------------------------
type HostingOptions = {
  rehostAll: boolean;
  onlyMissing: boolean; // default true
  dryRun: boolean;
};

let gOptions: HostingOptions = {
  rehostAll: false,
  onlyMissing: true,
  dryRun: false,
};

export function setHostingOptions(opts: Partial<HostingOptions>) {
  gOptions = { ...gOptions, ...opts };
}

const OUT_DIR = "public/data/ga_scratchers";
const MANIFEST_BASENAME = "_image_manifest.json";
const MANIFEST_PATH = path.join(OUT_DIR, MANIFEST_BASENAME);

// sourceUrl → manifest entry
type ManifestEntry = {
  key: string;
  url: string;
  etag?: string;
  bytes: number;
  contentType: string;
  sha256: string;
};
type Manifest = Record<string, ManifestEntry>;

let manifestCache: Manifest | null = null;

export async function loadManifest(): Promise<Manifest> {
  if (manifestCache) return manifestCache;
  try {
    await fs.mkdir(OUT_DIR, { recursive: true });
    const txt = await fs.readFile(MANIFEST_PATH, "utf8");
    manifestCache = JSON.parse(txt) as Manifest;
    return manifestCache;
  } catch {
    manifestCache = {};
    return manifestCache;
  }
}

export async function saveManifest(): Promise<void> {
  if (!manifestCache) return;
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifestCache, null, 2), "utf8");
}

// -----------------------------
// Utilities
// -----------------------------
const ALLOWED_CT = new Set(["image/png", "image/jpeg"]);
function extFromContentType(ct: string): "png" | "jpg" {
  return /png/i.test(ct) ? "png" : "jpg";
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const h = crypto.createHash("sha256");
  h.update(bytes);
  return h.digest("hex");
}

const DEFAULT_HEADERS: HeadersInit = {
  // Pretend to be a normal Chromium; GA site sometimes blocks generic clients.
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
  "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  // GA DAM often expects a same-site referer
  "Referer": "https://www.galottery.com/",
};

async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
  const attempts = 3;
  const base = 250; // ms for backoff
  let lastErr: any;

  for (let i = 0; i < attempts; i++) {
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 10000); // 10s
    try {
      const res = await undiciFetch(url, {
        ...init,
        // Merge headers but let caller override if supplied
        headers: { ...DEFAULT_HEADERS, ...(init?.headers as any) },
        signal: ac.signal,
        redirect: "follow",
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      clearTimeout(timeout);
      lastErr = err;
      if (i < attempts - 1) {
        const delay = base * Math.pow(2, i) + Math.floor(Math.random() * 100);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

// -----------------------------
// Storage Providers
// -----------------------------
class R2Provider implements StorageProvider {
  private client: S3Client;
  private bucket: string;
  private publicBase: string;

  constructor() {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID!;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;
    const bucket = process.env.R2_BUCKET!;
    const publicBase = (process.env.R2_PUBLIC_BASE_URL || "").replace(/\/+$/, "");

    if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBase) {
      throw new Error("R2Provider missing env: CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL");
    }

    this.bucket = bucket;
    this.publicBase = publicBase;
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });
  }

  publicUrlFor(key: string): string {
    return `${this.publicBase}/${key}`;
  }

  async head(key: string) {
    try {
      const out = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { exists: true, etag: out.ETag?.replace(/^"|"$/g, ""), bytes: Number(out.ContentLength || 0) };
    } catch (err: any) {
      if (err?.$metadata?.httpStatusCode === 404) return { exists: false };
      return { exists: false };
    }
  }

  async put(key: string, bytes: Uint8Array, contentType: string, cacheControl?: string): Promise<Hosted> {
    if (gOptions.dryRun) {
      return { key, url: this.publicUrlFor(key), bytes: bytes.byteLength, contentType };
    }
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: bytes,
      ContentType: contentType,
      CacheControl: cacheControl || "public, max-age=31536000, immutable",
    }));
    const head = await this.head?.(key);
    return { key, url: this.publicUrlFor(key), bytes: bytes.byteLength, contentType, etag: head?.etag };
  }
}

class FSProvider implements StorageProvider {
  private baseDir: string;
  private publicBase: string;

  constructor() {
    this.baseDir = path.join("public", "cdn", "ga_scratchers");
    // For Next.js dev: files under /public are served from /
    // If you host locally via a reverse proxy, override with LOCAL_PUBLIC_BASE_URL
    const localBase = process.env.LOCAL_PUBLIC_BASE_URL || "http://localhost:3000";
    this.publicBase = `${localBase.replace(/\/+$/, "")}/cdn/ga_scratchers`;
  }

  publicUrlFor(key: string): string {
    return `${this.publicBase}/${key}`;
  }

  async head(key: string) {
    const full = path.join(this.baseDir, key);
    try {
      const st = await fs.stat(full);
      return { exists: st.isFile(), bytes: st.size };
    } catch {
      return { exists: false };
    }
  }

  async put(key: string, bytes: Uint8Array, contentType: string, cacheControl?: string): Promise<Hosted> {
    const full = path.join(this.baseDir, key);
    if (!gOptions.dryRun) {
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, bytes);
      // Best-effort: write a sidecar headers hint for static servers (optional)
      try {
        const headersPath = `${full}.headers.json`;
        const hdr = { "Content-Type": contentType, "Cache-Control": cacheControl || "public, max-age=31536000, immutable" };
        await fs.writeFile(headersPath, JSON.stringify(hdr), "utf8");
      } catch {}
    }
    return { key, url: this.publicUrlFor(key), bytes: bytes.byteLength, contentType };
  }
}

// -----------------------------
// Storage selection
// -----------------------------
export function getStorage(): StorageProvider {
  const haveR2 =
    !!process.env.CLOUDFLARE_ACCOUNT_ID &&
    !!process.env.R2_ACCESS_KEY_ID &&
    !!process.env.R2_SECRET_ACCESS_KEY &&
    !!process.env.R2_BUCKET &&
    !!process.env.R2_PUBLIC_BASE_URL;

  if (haveR2) {
    try {
      return new R2Provider();
    } catch {
      // fall through to FS
    }
  }
  return new FSProvider();
}

// -----------------------------
// Core API
// -----------------------------
export async function downloadAndHost(params: {
  sourceUrl: string;
  keyHint: string; // e.g. "ga/scratchers/images/123/ticket-<sha>.<ext>" without sha/ext yet
  storage?: StorageProvider;
  dryRun?: boolean;
}): Promise<Hosted> {
  if (!manifestCache) await loadManifest();

  const { sourceUrl } = params;
  const storage = params.storage || getStorage();
  const dry = params.dryRun ?? gOptions.dryRun;

  // 1) Manifest reuse (unless --rehost-all)
  const existing = !gOptions.rehostAll && manifestCache![sourceUrl];
  if (existing) {
    // HEAD check to be safe (best-effort)
    const h = await storage.head?.(existing.key).catch(() => undefined);
    const url = storage.publicUrlFor(existing.key);
    if (h?.exists || dry) {
      return { key: existing.key, url, etag: existing.etag, bytes: existing.bytes, contentType: existing.contentType };
    }
    // if missing remotely, we’ll re-upload below
  } else if (gOptions.onlyMissing === false && !gOptions.rehostAll) {
    // no-op — (explicitly allow re-upload of everything via flags)
  }

  // 2) Download
  const resp = await fetchWithRetry(sourceUrl);
  let ct = (resp.headers.get("content-type") || "").toLowerCase().split(";")[0].trim();
  const arrBuf = await resp.arrayBuffer();
  const u8 = new Uint8Array(arrBuf);

  // --- Magic-byte sniffers ---
  const isJpeg = (b: Uint8Array) => b.length >= 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF;
  const isPng  = (b: Uint8Array) =>
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 &&
    b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A;

  // Coerce content-type if server lied or omitted
  if (!ALLOWED_CT.has(ct)) {
    if (isPng(u8)) ct = "image/png";
    else if (isJpeg(u8)) ct = "image/jpeg";
    else {
      // As last resort, allow extension-based coercion only if magic is unknown but path suggests image
      const extPath = new URL(resp.url).pathname;
      if (/\.(png)(\?|#|$)/i.test(extPath)) ct = "image/png";
      else if (/\.(jpe?g)(\?|#|$)/i.test(extPath)) ct = "image/jpeg";
    }
  }
  if (!ALLOWED_CT.has(ct)) {
    throw new Error(`Unsupported content-type "${ct}" for ${sourceUrl}`);
  }


  // 3) Hash & form key
  const hash = await sha256(u8);
  // Replace "<sha>" and "<ext>" in keyHint if user provided a template; else append
  const ext = extFromContentType(ct);
  let key = params.keyHint;
  if (key.includes("<sha>")) key = key.replace("<sha>", hash);
  if (key.includes("<ext>")) key = key.replace("<ext>", ext);
  if (!key.includes(hash)) {
    // keyHint might be like: ga/scratchers/images/123/ticket
    key = `${key}-${hash}.${ext}`;
  }

  // 4) Possibly skip if already exists remotely (idempotent)
  const head = await storage.head?.(key).catch(() => undefined);
  if (head?.exists) {
    const hosted: Hosted = { key, url: storage.publicUrlFor(key), etag: head.etag, bytes: head.bytes || u8.byteLength, contentType: ct };
    // Update manifest to point this source to the settled key
    manifestCache![sourceUrl] = { key, url: hosted.url, etag: hosted.etag, bytes: hosted.bytes, contentType: ct, sha256: hash };
    return hosted;
  }

  // 5) Upload
  const hosted = await storage.put(key, u8, ct, "public, max-age=31536000, immutable");

  // 6) Manifest update
  manifestCache![sourceUrl] = {
    key: hosted.key,
    url: hosted.url,
    etag: hosted.etag,
    bytes: hosted.bytes,
    contentType: hosted.contentType,
    sha256: hash,
  };
  return hosted;
}

export async function ensureHashKey(params: {
  gameNumber: number;
  kind: "ticket" | "odds";
  sourceUrl: string;
  storage?: StorageProvider;
  dryRun?: boolean;
}): Promise<Hosted> {
  const base = `ga/scratchers/images/${params.gameNumber}/${params.kind}-<sha>.<ext>`;
  return downloadAndHost({ sourceUrl: params.sourceUrl, keyHint: base, storage: params.storage, dryRun: params.dryRun });
}
