export type Hosted = {
    url: string;
    key: string;
    etag?: string;
    bytes: number;
    contentType: string;
};
export interface StorageProvider {
    put(key: string, bytes: Uint8Array, contentType: string, cacheControl?: string): Promise<Hosted>;
    head?(key: string): Promise<{
        exists: boolean;
        etag?: string;
        bytes?: number;
    }>;
    ensureBucket?(): Promise<void>;
    publicUrlFor(key: string): string;
}
type HostingOptions = {
    rehostAll: boolean;
    onlyMissing: boolean;
    dryRun: boolean;
};
export declare function setHostingOptions(opts: Partial<HostingOptions>): void;
type ManifestEntry = {
    key: string;
    url: string;
    etag?: string;
    bytes: number;
    contentType: string;
    sha256: string;
};
type Manifest = Record<string, ManifestEntry>;
export declare function loadManifest(): Promise<Manifest>;
export declare function saveManifest(): Promise<void>;
export declare function loadManifestFromGCSIfAvailable(): Promise<void>;
export declare function saveManifestToGCSIfAvailable(): Promise<void>;
export declare function sha256(bytes: Uint8Array): Promise<string>;
export declare function getStorage(): StorageProvider;
export declare function putJsonObject(params: {
    key: string;
    data: unknown;
    cacheControl?: string;
    storage?: StorageProvider;
    dryRun?: boolean;
}): Promise<Hosted>;
export declare function downloadAndHost(params: {
    sourceUrl: string;
    keyHint: string;
    storage?: StorageProvider;
    dryRun?: boolean;
}): Promise<Hosted>;
export declare function ensureHashKey(params: {
    gameNumber: number;
    kind: "ticket" | "odds";
    sourceUrl: string;
    storage?: StorageProvider;
    dryRun?: boolean;
}): Promise<Hosted>;
export declare function ensureHashKeyNY(params: {
    gameNumber: number;
    kind: "ticket" | "odds";
    sourceUrl: string;
    storage?: StorageProvider;
    dryRun?: boolean;
}): Promise<Hosted>;
export declare function ensureHashKeyFL(params: {
    gameNumber: number;
    kind: "ticket" | "odds";
    sourceUrl: string;
    storage?: StorageProvider;
    dryRun?: boolean;
}): Promise<Hosted>;
export declare function ensureHashKeyCA(params: {
    gameNumber: number;
    kind: "ticket" | "odds";
    sourceUrl: string;
    storage?: StorageProvider;
    dryRun?: boolean;
}): Promise<Hosted>;
export {};
