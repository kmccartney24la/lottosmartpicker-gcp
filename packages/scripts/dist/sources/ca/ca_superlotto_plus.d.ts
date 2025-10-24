/** Update-only builder used by the orchestrator. Never seeds; appends latest draw if missing. */
export declare function buildCaliforniaSuperLottoPlusUpdate(outRel?: string): Promise<void>;
/** Optional: manual seeding helper for local use only (not called by orchestrator). */
export declare function buildCaliforniaSuperLottoPlusSeed(outRel?: string): Promise<void>;
