// scripts/scratchers/image_hosting.ts
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { Buffer } from "node:buffer";
import { fetch as undiciFetch } from "undici";
import type { RequestInit, HeadersInit, Response as UndiciResponse } from "undici";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { Storage } from "@google-cloud/storage";
import { chromium } from "playwright";

// ---- one-time capability probes (top-level; used for logging & defaults)
// ---- one-time capability probes (top-level; used for logging & defaults)
function deriveBucketFromPublicBaseUrl(pub?: string): string | undefined {
  const u = (pub || "").trim();
  if (!u) return undefined;
  try {
    const url = new URL(u);
    // Accept canonical Google Cloud Storage domain formats
    //  - https://storage.googleapis.com/<bucket>
    //  - https://<bucket>.storage.googleapis.com
    if (url.hostname === "storage.googleapis.com") {
      const seg = url.pathname.replace(/^\/+/, "").split("/")[0] || "";
      return seg || undefined;
    }
    const m = url.hostname.match(/^([^.]+)\.storage\.googleapis\.com$/i);
    if (m) return m[1];
  } catch {}
  return undefined;
}

// -------- GCS / R2 discovery (portable across local + jobs) --------
function resolveBucketAndPublicBase() {
  // Accept either GCS_BUCKET or DATA_BUCKET as the bucket name.
  const envBucket =
    process.env.GCS_BUCKET ||
    process.env.DATA_BUCKET ||
    "";

  // Prefer PUBLIC_BASE_URL if present. Else try the Next public fallbacks.
  const envPublicBase =
    (process.env.PUBLIC_BASE_URL ||
     process.env.NEXT_PUBLIC_DATA_BASE_URL ||
     process.env.NEXT_PUBLIC_DATA_BASE ||
     "").replace(/\/+$/, "");

  // If PUBLIC_BASE_URL is set, try to derive bucket from it if no bucket env.
  const derivedFromPublic = deriveBucketFromPublicBaseUrl(envPublicBase) || "";

  // Final bucket: explicit > derived-from-public > empty
  const bucket = envBucket || derivedFromPublic || "";

  // Final public base:
  //   - If PUBLIC_BASE_URL present, use it (custom CDN supported)
  //   - Else, if we have a bucket, fall back to the canonical GCS endpoint
  //   - Else, empty ⇒ FS mode
  const publicBase =
    envPublicBase ||
    (bucket ? `https://storage.googleapis.com/${bucket}` : "");

  return { bucket, publicBase };
}

const _RESOLVED = resolveBucketAndPublicBase();
const _BUCKET = _RESOLVED.bucket;
const _PUB_BASE = _RESOLVED.publicBase;
const _DERIVED_BUCKET = deriveBucketFromPublicBaseUrl(_PUB_BASE);

const HAVE_GCS: boolean = !!_BUCKET && !!_PUB_BASE;
const HAVE_R2: boolean =
  !!process.env.CLOUDFLARE_ACCOUNT_ID &&
  !!process.env.R2_ACCESS_KEY_ID &&
  !!process.env.R2_SECRET_ACCESS_KEY &&
  !!process.env.R2_BUCKET &&
  !!process.env.R2_PUBLIC_BASE_URL;

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

const OUT_DIR = "public/data/ga/scratchers";
const MANIFEST_BASENAME = "_image_manifest.json";
const MANIFEST_PATH = path.join(OUT_DIR, MANIFEST_BASENAME);
const MANIFEST_GCS_OBJECT = "ga/scratchers/_image_manifest.json"; // optional remote mirror

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

export async function loadManifestFromGCSIfAvailable() {
  const bucketName = process.env.GCS_BUCKET || process.env.DATA_BUCKET || _DERIVED_BUCKET;
  if (!bucketName) return;
  try {
    const storage = new Storage();
    const f = storage.bucket(bucketName!).file(MANIFEST_GCS_OBJECT);
    const [exists] = await f.exists();
    if (!exists) return;
    const [buf] = await f.download();
    manifestCache = JSON.parse(buf.toString("utf8")) as Manifest;
    const count = Object.keys(manifestCache as Manifest).length;
    console.log(`[manifest] loaded ${count} entries from GCS`);
  } catch (e) {
    console.warn(`[manifest] GCS load skipped: ${String(e)}`);
  }
}

export async function saveManifestToGCSIfAvailable() {
  const bucketName = process.env.GCS_BUCKET || process.env.DATA_BUCKET || _DERIVED_BUCKET;
  if (!manifestCache || !bucketName) return;
  try {
    const storage = new Storage();
    const f = storage.bucket(bucketName!).file(MANIFEST_GCS_OBJECT);
    await f.save(Buffer.from(JSON.stringify(manifestCache, null, 2)), {
      resumable: false,
      contentType: "application/json",
      metadata: { cacheControl: "no-store" },
    });
    console.log(`[manifest] saved ${Object.keys(manifestCache).length} entries to GCS`);
  } catch (e) {
    console.warn(`[manifest] GCS save skipped: ${String(e)}`);
  }
}

// -----------------------------
// Utilities
// -----------------------------
const ALLOWED_CT = new Set(["image/png", "image/jpeg"]);
function extFromContentType(ct: string): "png" | "jpg" {
  return /png/i.test(ct) ? "png" : "jpg";
}

const ALLOW_LOCALHOST = process.env.ALLOW_LOCALHOST === "1";
const REWRITE_LOCALHOST_TO_CDN = process.env.REWRITE_LOCALHOST_TO_CDN === "1";
const LOCALHOST_SET = new Set(["localhost","127.0.0.1","::1"]);

function isLocalhostUrl(u: string): boolean {
  try { return LOCALHOST_SET.has(new URL(u).hostname.toLowerCase()); } catch { return false; }
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const h = crypto.createHash("sha256");
  h.update(bytes);
  return h.digest("hex");
}

const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
  // Prefer PNG/JPEG to avoid implicit WEBP conversions
  "Accept": "image/png,image/jpeg;q=0.9,*/*;q=0.7",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://www.galottery.com/",
};

async function fetchWithRetry(url: string, init?: RequestInit): Promise<UndiciResponse> {
  const attempts = 3;
  const base = 250; // ms
  let lastErr: any;

  for (let i = 0; i < attempts; i++) {
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 10000); // 10s
    try {
      const res = await undiciFetch(url, {
        ...init,
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

/**
 * Try to fetch the image with Undici; if we get HTML or bad content, fall back to Playwright.
 * Returns a Node Buffer + contentType string.
 */
async function fetchBinaryWithHeaders(url: string, init?: RequestInit): Promise<{ buf: Buffer; contentType: string }> {
  // Choose a sane referer per host (NY blocks foreign referers)
  let perHostHeaders: Record<string, string> = {};
  try {
    const { origin, hostname } = new URL(url);
    const isNY = /(^|\.)nylottery\.ny\.gov$/i.test(hostname);
    const isGA = /(^|\.)galottery\.com$/i.test(hostname);
    const isFL = /(^|\.)flalottery\.com$/i.test(hostname);
    perHostHeaders = {
      Referer: isNY
        ? "https://nylottery.ny.gov/"
        : isGA
        ? "https://www.galottery.com/"
        : isFL
        ? "https://www.flalottery.com/"
        : DEFAULT_HEADERS["Referer"],
      // Some CDNs look at Sec-Fetch-Site; Playwright will set sensible values later too
    };
  } catch {}
  // 1) Undici fast path
  try {
    const res = await fetchWithRetry(url, {
      ...(init || {}),
      headers: { ...(DEFAULT_HEADERS as HeadersInit), ...(perHostHeaders as HeadersInit), ...(init?.headers as any) },
    });
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct || ct.startsWith("text/html")) throw new Error(`unexpected content-type from undici: ${ct}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return { buf, contentType: ct };
  } catch (err) {
    // fall through to Playwright
  }

  // 2) Playwright fallback
  const BROWSER_TIMEOUT_MS = 30_000;
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const context = await browser.newContext({
        userAgent: String(DEFAULT_HEADERS["User-Agent"]),
      extraHTTPHeaders: {
        "Accept": "image/png,image/jpeg;q=0.9,*/*;q=0.7",
        "Accept-Language": "en-US,en;q=0.9",
        ...(perHostHeaders || {}),
      },
    });
    const page = await context.newPage();
    const resp = await page.goto(url, { timeout: BROWSER_TIMEOUT_MS, waitUntil: "domcontentloaded" });
    if (!resp) throw new Error("playwright: no response");

    // If image navigations are blocked, fetch via page.evaluate to get ArrayBuffer
    let contentType = (resp.headers()["content-type"] || "").toLowerCase();
    let buf: Buffer | null = null;

    try {
      // For direct image responses, we can get body as buffer
      const ab = await resp.body();
      buf = Buffer.from(ab);
    } catch {
      // Fallback: fetch via in-page fetch to honor UA/Referer
      const { b64, ct } = await page.evaluate(async (u) => {
        const r = await fetch(u, { credentials: "omit", cache: "no-cache" as any });
        const ct = r.headers.get("content-type") || "";
        const ab = await r.arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(ab)));
        return { b64, ct };
      }, url);
      contentType = (ct || contentType || "").toLowerCase();
      buf = Buffer.from(b64, "base64");
    }

    if (!buf) throw new Error("playwright: empty body");
    if (!contentType || contentType.startsWith("text/html")) {
      // sniff
      const u8 = new Uint8Array(buf);
      const isPng = u8.length>=8 && u8[0]===0x89 && u8[1]===0x50 && u8[2]===0x4e && u8[3]===0x47 && u8[4]===0x0d && u8[5]===0x0a && u8[6]===0x1a && u8[7]===0x0a;
      const isJpg = u8.length>=3 && u8[0]===0xff && u8[1]===0xd8 && u8[2]===0xff;
      if (isPng) contentType = "image/png";
      else if (isJpg) contentType = "image/jpeg";
      else throw new Error(`playwright: unexpected content-type ${contentType || "(empty)"} and bytes not PNG/JPEG`);
    }
    if (/image\/webp/i.test(contentType)) {
      throw new Error(`Unsupported content-type "image/webp" for ${url} (prevented by Accept header).`);
    }
    return { buf, contentType };
  } finally {
    await browser.close().catch(() => {});
  }
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
    console.log(`[r2] put ${key} (${bytes.byteLength} bytes, ${contentType}) → ${this.publicUrlFor(key)}`);
    const head = await this.head?.(key);
    return { key, url: this.publicUrlFor(key), bytes: bytes.byteLength, contentType, etag: head?.etag };
  }
}

// -----------------------------
// Google Cloud Storage Provider
// -----------------------------
class GCSProvider implements StorageProvider {
  private storage: Storage;
  private bucketName: string;
  private publicBase: string;

  constructor() {
    const publicBase = _PUB_BASE;
    const bucket = _BUCKET || deriveBucketFromPublicBaseUrl(publicBase);
    if (!bucket || !publicBase) {
      throw new Error(
        "GCSProvider cannot resolve bucket/publicBase. " +
        "Set PUBLIC_BASE_URL and GCS_BUCKET (or DATA_BUCKET), or ensure PUBLIC_BASE_URL " +
        "is a storage.googleapis.com URL I can parse."
      );
    }
    this.bucketName = bucket;
    this.publicBase = publicBase;
    this.storage = new Storage(); // uses Cloud Run default creds
  }

  publicUrlFor(key: string): string {
    return `${this.publicBase}/${key}`;
  }

  async head(key: string) {
    try {
      const f = this.storage.bucket(this.bucketName).file(key);
      const [exists] = await f.exists();
      if (!exists) return { exists: false };
      const [md] = await f.getMetadata();
      const etag = (md.etag || "").replace(/^"|"$/g, "");
      const bytes = Number(md.size || 0);
      return { exists: true, etag, bytes };
    } catch {
      return { exists: false };
    }
  }

  async put(key: string, bytes: Uint8Array, contentType: string, cacheControl?: string): Promise<Hosted> {
    if (gOptions.dryRun) {
      return { key, url: this.publicUrlFor(key), bytes: bytes.byteLength, contentType };
    }
    const f = this.storage.bucket(this.bucketName).file(key);
    await f.save(Buffer.from(bytes), {
      contentType,
      resumable: false,
      public: false, // object is publicly readable via PUBLIC_BASE_URL if that’s a GCS domain
      metadata: { cacheControl: cacheControl || "public, max-age=31536000, immutable" },
    });
    const [md] = await f.getMetadata();
    const etag = (md.etag || "").replace(/^"|"$/g, "");
    const hosted: Hosted = {
      key,
      url: this.publicUrlFor(key),
      etag,
      bytes: Number(md.size || bytes.byteLength),
      contentType,
    };
    console.log(`[gcs] put ${key} (${hosted.bytes} bytes, ${contentType}) → ${hosted.url}`);
    return hosted;
  }
}

class FSProvider implements StorageProvider {
  private baseDir: string;
  private publicBase: string;

  constructor() {
    // Put files under /public/cdn/<your key> (key controls subfolders: ga/scratchers, ny/scratchers, etc.)
    this.baseDir = path.join("public", "cdn");
    const localBase = (process.env.LOCAL_PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
    this.publicBase = `${localBase}/cdn`;
  }

  private normalizeKey(key: string) {
    return key.replace(/^\/+/, "").replace(/\\/g, "/");
  }

  publicUrlFor(key: string): string {
    const k = this.normalizeKey(key);
    return `${this.publicBase}/${k}`;
  }

  async head(key: string) {
    const k = this.normalizeKey(key);
    const full = path.join(this.baseDir, k);
    try {
      const st = await fs.stat(full);
      return { exists: st.isFile(), bytes: st.size };
    } catch {
      return { exists: false };
    }
  }

  async put(
    key: string,
    bytes: Uint8Array,
    contentType: string,
    cacheControl?: string
  ): Promise<Hosted> {
    const k = this.normalizeKey(key);
    const full = path.join(this.baseDir, k);
    if (!gOptions.dryRun) {
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, bytes);
      try {
        const headersPath = `${full}.headers.json`;
        const hdr = {
          "Content-Type": contentType,
          "Cache-Control": cacheControl || "public, max-age=31536000, immutable",
        };
        await fs.writeFile(headersPath, JSON.stringify(hdr, null, 2), "utf8");
      } catch {}
    }
    return { key: k, url: this.publicUrlFor(k), bytes: bytes.byteLength, contentType };
  }
}

// -----------------------------
// Storage selection
// -----------------------------
export function getStorage(): StorageProvider {
  // recompute (cheap) or reuse HAVE_*; either is fine. We'll reuse:
  const haveGCS = HAVE_GCS;
  const haveR2  = HAVE_R2;

  // Prefer GCS when running in Cloud Run with GCS_* envs
  if (haveGCS) {
    try { return new GCSProvider(); } catch { /* fall through */ }
  }
  if (haveR2) {
    try {
      return new R2Provider();
    } catch {
      // fall through to FS
    }
  }
  return new FSProvider();
}

// one-time informative log without instantiating providers
console.log(`[storage] using ${HAVE_GCS ? 'GCS' : HAVE_R2 ? 'R2' : 'FS'} provider`);

// Publish a JSON object to the configured storage (GCS/R2/FS), honoring the same PUBLIC_BASE_URL pathing.
export async function putJsonObject(params: {
  key: string;               // e.g. "ny/scratchers/index.json"
  data: unknown;
  cacheControl?: string;     // default: "no-store"
  storage?: StorageProvider;
  dryRun?: boolean;
}) {
  const storage = params.storage || getStorage();
  const cache = params.cacheControl || "no-store"; // indexes change; don't cache hard
  const json = JSON.stringify(params.data, null, 2);
  const bytes = new TextEncoder().encode(json);

  if (params.dryRun) {
    const url = storage.publicUrlFor(params.key);
    console.log(`[json:dry] put ${params.key} (${bytes.byteLength} bytes) → ${url}`);
    return { key: params.key, url, bytes: bytes.byteLength, contentType: "application/json" };
  }

  const hosted = await storage.put(params.key, bytes, "application/json", cache);
  console.log(`[json] put ${params.key} (${hosted.bytes} bytes) → ${hosted.url}`);
  return hosted;
}


// -----------------------------
// Core API
// -----------------------------
export async function downloadAndHost(params: {
  sourceUrl: string;
  keyHint: string; // e.g. ga/scratchers/images/<num>/<kind>-<sha>.<ext>
  storage?: StorageProvider;
  dryRun?: boolean;
}): Promise<Hosted> {
  if (!manifestCache) await loadManifest();

  const { sourceUrl } = params;
  const storage = params.storage || getStorage();
  const dry = params.dryRun ?? gOptions.dryRun;

  // derive desired directory prefix from keyHint
  const desiredDir = (() => {
    const m = params.keyHint.match(/^(.+\/)[^/]+(?:-<sha>\.<ext>|)$/);
    return m ? m[1] : "";
  })();

  // 1) Manifest reuse (only if same per-game dir and not --rehost-all)
  const existing = !gOptions.rehostAll && manifestCache![sourceUrl];
  if (existing && (!desiredDir || existing.key.startsWith(desiredDir))) {
    const h = await storage.head?.(existing.key).catch(() => undefined);
    const url = storage.publicUrlFor(existing.key);
    if (h?.exists || dry) {
      return { key: existing.key, url, etag: existing.etag, bytes: existing.bytes, contentType: existing.contentType };
    }
    // else: will re-upload below
  }

  // 2) Download (undici → Playwright fallback)
  const { buf, contentType } = await fetchBinaryWithHeaders(sourceUrl);
  let ct = (contentType || "").toLowerCase().split(";")[0].trim();
  const u8 = new Uint8Array(buf);

  // Magic-byte sniffers
  const isJpeg = (b: Uint8Array) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const isPng  = (b: Uint8Array) =>
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a;

  // Coerce content-type if server lied or omitted
  const isWebp = (b: Uint8Array) =>
    b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
    
  if (!ALLOWED_CT.has(ct)) {
    if (isPng(u8)) ct = "image/png";
    else if (isJpeg(u8)) ct = "image/jpeg";
    else if (isWebp(u8)) {
        throw new Error(`Unsupported content-type "image/webp" for ${sourceUrl} (prevented by Accept header).`);
    } else {
        throw new Error(`Unsupported image bytes for ${sourceUrl}`);
    }
}

  // 3) Hash & form key
  const hash = await sha256(u8);
  const ext = extFromContentType(ct);
  let key = params.keyHint;
  if (key.includes("<sha>")) key = key.replace("<sha>", hash);
  if (key.includes("<ext>")) key = key.replace("<ext>", ext);
  if (!key.includes(hash)) {
    key = `${key}-${hash}.${ext}`; // if keyHint was bare like ".../ticket"
  }

  // 4) Idempotency: skip upload if it already exists
  const head = await storage.head?.(key).catch(() => undefined);
  if (head?.exists) {
    const hosted: Hosted = {
      key,
      url: storage.publicUrlFor(key),
      etag: head.etag,
      bytes: head.bytes ?? u8.byteLength,
      contentType: ct
    };
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
  return downloadAndHost({
    sourceUrl: params.sourceUrl,
    keyHint: base,
    storage: params.storage,
    dryRun: params.dryRun,
  });
}

export async function ensureHashKeyNY(params: {
  gameNumber: number;
  kind: "ticket" | "odds";
  sourceUrl: string;
  storage?: StorageProvider;
  dryRun?: boolean;
}): Promise<Hosted> {
  const base = `ny/scratchers/images/${params.gameNumber}/${params.kind}-<sha>.<ext>`;
  return downloadAndHost({
    sourceUrl: params.sourceUrl,
    keyHint: base,
    storage: params.storage,
    dryRun: params.dryRun,
  });
}

export async function ensureHashKeyFL(params: {
  gameNumber: number;
  kind: "ticket" | "odds";
  sourceUrl: string;
  storage?: StorageProvider;
  dryRun?: boolean;
}): Promise<Hosted> {
  const base = `fl/scratchers/images/${params.gameNumber}/${params.kind}-<sha>.<ext>`;
  return downloadAndHost({
    sourceUrl: params.sourceUrl,
    keyHint: base,
    storage: params.storage,
    dryRun: params.dryRun,
  });
}
