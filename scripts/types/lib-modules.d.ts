// scripts/types/lib-modules.d.ts
// Ambient types for runtime-only ESM modules emitted to /dist/lib/*.mjs

// ---- CSV helpers -----------------------------------------------------------
declare module "*lib/csv.mjs" {
  export type CanonicalRow = {
    draw_date: string;           // YYYY-MM-DD
    num1: number; num2: number; num3: number; num4: number; num5: number;
    special?: number | "";
  };
  export type FlexibleRow = { draw_date: string; nums: number[]; special?: number };

  export function toCanonicalCsv(rows: CanonicalRow[]): string;
  export function latestCsv(fullCsv: string): string;
  export function toFlexibleCsv(rows: FlexibleRow[]): string;
}

// ---- GCS helpers -----------------------------------------------------------
declare module "*lib/gcs.mjs" {
  export function getPublicBaseUrl(): string;
  export function deriveBucketFromBaseUrl(): string;
  export function publicUrlFor(objectPath: string): string;

  export function downloadIfExists(bucketName: string, objectPath: string): Promise<Buffer | null>;
  export function getObjectText(args: { bucketName: string; objectPath: string }): Promise<string | null>;
  export function sha256(buf: Buffer): string;

  export function upsertObject(args: {
    bucketName: string;
    objectPath: string;
    contentType: string;
    bodyBuffer: Buffer;
    cacheControl?: string;
  }): Promise<{ uploaded: boolean }>;
}
