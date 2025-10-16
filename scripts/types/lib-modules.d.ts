// Types for the runtime-only ESM modules in /lib

// Used by files in scripts/** (e.g., scripts/update_csvs.ts)
declare module ".../lib/csv.mjs" {
  export function toCanonicalCsv(rows: Array<{
    draw_date: string;
    num1: number; num2: number; num3: number; num4: number; num5: number;
    special?: number | "";
  }>): string;
  export function latestCsv(fullCsv: string): string;
}
declare module ".../lib/gcs.mjs" {
  export function deriveBucketFromBaseUrl(): string;
  export function downloadIfExists(bucketName: string, objectPath: string): Promise<Buffer | null>;
  export function sha256(buf: Buffer): string;
  export function upsertObject(args: {
    bucketName: string;
    objectPath: string;
    contentType: string;
    bodyBuffer: Buffer;
    cacheControl?: string;
  }): Promise<{ uploaded: boolean }>;
}

// Used by files in scripts/builders/** (two levels deep)
declare module ".../lib/csv.mjs" {
  export function toCanonicalCsv(rows: Array<{
    draw_date: string;
    num1: number; num2: number; num3: number; num4: number; num5: number;
    special?: number | "";
  }>): string;
  export function latestCsv(fullCsv: string): string;
}
declare module ".../lib/gcs.mjs" {
  export function deriveBucketFromBaseUrl(): string;
  export function downloadIfExists(bucketName: string, objectPath: string): Promise<Buffer | null>;
  export function sha256(buf: Buffer): string;
  export function upsertObject(args: {
    bucketName: string;
    objectPath: string;
    contentType: string;
    bodyBuffer: Buffer;
    cacheControl?: string;
  }): Promise<{ uploaded: boolean }>;
}
