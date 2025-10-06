import { ensureHashKey, getStorage, setHostingOptions } from "./image_hosting.js";
const url = process.argv[2];
const gameNumber = Number(process.argv[3] || 9999);
const kind = process.argv[4] || "ticket";
const write = process.env.DRY_RUN === "0"; // default dry-run unless DRY_RUN=0
if (!url) {
    console.error("Usage: npx tsx scripts/scratchers/test_image_hosting.ts <imageUrl> [gameNumber] [ticket|odds]");
    process.exit(1);
}
(async () => {
    setHostingOptions({ dryRun: !write });
    const hosted = await ensureHashKey({ gameNumber, kind, sourceUrl: url, storage: getStorage() });
    console.log("Hosted:", hosted);
})();
