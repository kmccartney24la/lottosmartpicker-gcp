/** Update-only builder used by the orchestrator. Appends latest draw if missing; never seeds. */
export declare function buildCaliforniaFantasy5Update(outRelMid?: string): Promise<void>;
/** Optional: manual seed helper for local use (not called by orchestrator). */
export declare function buildCaliforniaFantasy5Seed(outRelMid?: string): Promise<void>;
