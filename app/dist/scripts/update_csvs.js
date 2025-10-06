// scripts/update_csvs.ts
// Compile with tsconfig.scripts.json (NodeNext). Run the emitted JS: dist/scripts/update_csvs.js
// ✅ lib stays .mjs (these files are shipped as ESM in the image)
import { upsertObject, deriveBucketFromBaseUrl } from "../lib/gcs.mjs";
import { latestCsv } from "../lib/csv.mjs";
// ✅ script-to-script imports must end with .js so the emitted JS has correct ESM extensions
import { buildFantasy5Csv } from "./sources/fantasy5.js";
import { buildFantasy5CsvFromLocalSeed } from "./builders/fantasy5.js";
import { buildSocrataCsv } from "./builders/socrata.js";
import { buildGaScratchersIndex } from "./builders/scratchers_ga.js";
// ---------- utils ----------
const BOOL = (v) => {
    if (v == null)
        return false;
    const s = String(v).trim().toLowerCase();
    return s === "1" || s === "true" || s === "yes";
};
async function maybeUploadCsv(params) {
    const { bucketName, objectPath, fullCsv } = params;
    // Full CSV
    await upsertObject({
        bucketName,
        objectPath,
        contentType: "text/csv; charset=utf-8",
        bodyBuffer: Buffer.from(fullCsv, "utf8"),
    });
    // Latest CSV (optional but handy)
    const latest = latestCsv(fullCsv);
    await upsertObject({
        bucketName,
        objectPath: objectPath.replace(/\.csv$/i, ".latest.csv"),
        contentType: "text/csv; charset=utf-8",
        bodyBuffer: Buffer.from(latest, "utf8"),
    });
}
// ---------- main ----------
export async function main() {
    const bucket = deriveBucketFromBaseUrl();
    const skipSocrata = BOOL(process.env.SKIP_SOCRATA);
    const skipF5 = BOOL(process.env.SKIP_FANTASY5);
    const skipScratch = BOOL(process.env.SKIP_SCRATCHERS); // optional, recognized if present
    const socrataToken = process.env.NY_SOCRATA_APP_TOKEN || process.env.SOCRATA_APP_TOKEN;
    console.log(`[update-csvs] Bucket: ${bucket}`);
    console.log(`[update-csvs] Flags: skipSocrata=${skipSocrata} skipF5=${skipF5} skipScratchers=${skipScratch}`);
    // --- Draws: Socrata (PB/MM/C4L) ---
    if (!skipSocrata) {
        if (!socrataToken) {
            throw new Error("[update-csvs] Missing NY_SOCRATA_APP_TOKEN/SOCRATA_APP_TOKEN while SKIP_SOCRATA=0");
        }
        await Promise.all([
            (async () => {
                const csv = await buildSocrataCsv("multi_powerball", socrataToken);
                await maybeUploadCsv({
                    bucketName: bucket,
                    objectPath: "multi/powerball.csv",
                    fullCsv: csv,
                });
            })(),
            (async () => {
                const csv = await buildSocrataCsv("multi_megamillions", socrataToken);
                await maybeUploadCsv({
                    bucketName: bucket,
                    objectPath: "multi/megamillions.csv",
                    fullCsv: csv,
                });
            })(),
            (async () => {
                const csv = await buildSocrataCsv("multi_cash4life", socrataToken);
                await maybeUploadCsv({
                    bucketName: bucket,
                    objectPath: "multi/cash4life.csv",
                    fullCsv: csv,
                });
            })(),
        ]);
    }
    else {
        console.log("[update-csvs] SKIP_SOCRATA=1 — skipping PB/MM/C4L");
    }
    // --- Draws: GA Fantasy 5 ---
    if (!skipF5) {
        // Step 1: refresh local seed (writes to public/data/ga/fantasy5.csv by default)
        await buildFantasy5Csv();
        // Step 2: normalize to canonical CSV (dedupe, sort, etc.), using the freshly written local seed
        const csv = await buildFantasy5CsvFromLocalSeed();
        // Step 3: publish full + latest
        await maybeUploadCsv({
            bucketName: bucket,
            objectPath: "ga/fantasy5.csv",
            fullCsv: csv,
        });
    }
    else {
        console.log("[update-csvs] SKIP_FANTASY5=1 — skipping Fantasy 5");
    }
    // --- Scratchers: GA ---
    if (!skipScratch) {
        const json = await buildGaScratchersIndex();
        const body = Buffer.from(json, "utf8");
        const cc = "public, max-age=300, must-revalidate";
        await upsertObject({
            bucketName: bucket,
            objectPath: "ga/scratchers/index.json",
            contentType: "application/json; charset=utf-8",
            bodyBuffer: body,
            cacheControl: cc,
        });
        // Optional mirror: index.latest.json
        await upsertObject({
            bucketName: bucket,
            objectPath: "ga/scratchers/index.latest.json",
            contentType: "application/json; charset=utf-8",
            bodyBuffer: body,
            cacheControl: cc,
        });
    }
    else {
        console.log("[update-csvs] SKIP_SCRATCHERS=1 — skipping GA scratchers");
    }
    console.log("[update-csvs] Done.");
}
// ---------- CLI ----------
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((e) => {
        console.error(e);
        process.exit(1);
    });
}
