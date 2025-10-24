// Re-export ONLY client-safe code from the root.
// Anything that touches Node APIs (fs, net, http, process env-heavy SDKs, etc.)
// MUST NOT be exported here to keep the client bundle clean.
export * from "./state.js";
export * from "./gameRegistry.js";
export * from "./lotto.js";
// NOTE: Do NOT re-export "./gcs.js" or "./gcs-public.js" here.
// Import those via subpaths (e.g., `@lsp/lib/gcs`) **from server-only files**.
// If `csv.js` is 100% platform-neutral, you can re-export it here; otherwise keep it as a subpath.