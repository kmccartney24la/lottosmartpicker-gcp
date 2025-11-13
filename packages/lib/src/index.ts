// packages/lib/src/index.ts
// Re-export ONLY client-safe code from the root.
// Anything that touches Node APIs (fs, net, http, process env-heavy SDKs, etc.)
// MUST NOT be exported here to keep the client bundle clean.
export * from "./state.js";
export * from "./gameRegistry.js";
// NOTE: Do NOT re-export "./gcs.js" or "./gcs-public.js" here.
// Import those via subpaths (e.g., `@lsp/lib/gcs`) **from server-only files**.
// If `csv.js` is 100% platform-neutral, you can re-export it here; otherwise keep it as a subpath.
export * from './lotto/digits.js';
export * from './lotto/era.js';
export * from './lotto/fetch.js';
export * from './lotto/ny.js';
export * from './lotto/parse.js';
export * from './lotto/paths.js';
export * from './lotto/patternUtils.js'
export * from './lotto/pick10.js';
export * from './lotto/prizes.js';
export * from './lotto/quickdraw.js';
export * from './lotto/routing.js';
export * from './lotto/schedule.js';
export * from './lotto/stats.js';
export { LOGICAL_TO_UNDERLYING } from "./lotto/types.js";
export type * from './lotto/types.js';
