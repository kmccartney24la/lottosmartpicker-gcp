// scripts/builders/scratchers_ga.ts
/** Return stringified GA scratchers index JSON ({ games, updatedAt }). */
export async function buildGaScratchersIndex() {
    // TODO: Replace with real builder. This preserves your current contract.
    const data = {
        games: [],
        updatedAt: new Date().toISOString(),
    };
    return JSON.stringify(data, null, 2) + "\n";
}
