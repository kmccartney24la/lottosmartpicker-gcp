/** Preferred public base URL for files. */
export declare function getPublicBaseUrl(): string;
/** Derive a GCS bucket name. */
export declare function deriveBucketFromBaseUrl(): string;
/** Build a public URL for an object path. */
export declare function publicUrlFor(objectPath: string): string;
/** Download an object if it exists. Returns null on 404. */
export declare function downloadIfExists(bucketName: string, objectPath: string): Promise<Buffer | null>;
/** Read an object as UTF-8 text. Returns null if not found (404). */
export declare function getObjectText(args: {
    bucketName: string;
    objectPath: string;
}): Promise<string | null>;
export declare function sha256(buf: Buffer | Uint8Array | string): string;
/** Upload only if content differs; sets sensible metadata. */
export declare function upsertObject(args: {
    bucketName: string;
    objectPath: string;
    contentType: string;
    bodyBuffer: Buffer | Uint8Array;
    cacheControl?: string;
}): Promise<{
    uploaded: boolean;
}>;
