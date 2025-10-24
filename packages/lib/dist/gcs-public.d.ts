/** Returns the public base URL where CSV/JSON files are served. */
export declare function getPublicBaseUrl(): string;
/** Example: "https://data.lottosmartpicker.com" */
export declare const FILE_BASE: string;
/** Join the base with a relative path like "ga/scratchers/index.json". */
export declare function publicUrlFor(relPath: string): string;
/** Best-effort bucket inference, safe on both server and client. */
export declare function deriveBucketFromBaseUrl(): string;
