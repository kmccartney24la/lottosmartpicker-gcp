// packages/lib/scripts/update_csvs.ts
// Compile with tsconfig.scripts.json (NodeNext). Run the emitted JS: dist/scripts/update_csvs.js
import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import { execFile as _execFile } from "node:child_process";
import { promisify } from "node:util";
const execFile = promisify(_execFile);
// ✅ lib stays .mjs (these files are shipped as ESM in the image)
import { upsertObject, deriveBucketFromBaseUrl, getObjectText } from "@lsp/lib/gcs";
import { latestCsv } from "@lsp/lib/csv";
// ✅ script-to-script imports must end with .js so the emitted JS has correct ESM extensions
import { buildGeorgiaFantasy5Csv } from "./sources/ga/ga_fantasy5.js";
import { buildFloridaLottoCsv } from "./sources/fl/fl_lotto.js";
import { buildFloridaJtpCsv } from "./sources/fl/fl_jtp.js";
import { buildFloridaCashPopCsvs } from "./sources/fl/fl_cashpop.js";
import { buildFloridaPick5Csvs } from "./sources/fl/fl_pick5.js";
import { buildFloridaPick4Csvs } from "./sources/fl/fl_pick4.js";
import { buildFloridaPick3Csvs } from "./sources/fl/fl_pick3.js";
import { buildFloridaPick2Csvs } from "./sources/fl/fl_pick2.js";
import { buildFloridaFantasy5Csvs } from "./sources/fl/fl_fantasy5.js";
import { buildGeorgiaFantasy5CsvFromLocalSeed } from "./builders/ga_fantasy5.js";
import { buildCaliforniaDaily3Update } from "./sources/ca/ca_daily3.js";
import { buildCaliforniaDaily4Update } from "./sources/ca/ca_daily4.js";
import { buildCaliforniaSuperLottoPlusUpdate } from "./sources/ca/ca_superlotto_plus.js";
import { buildCaliforniaFantasy5Update } from "./sources/ca/ca_fantasy5.js";
import { buildSocrataCsv, 
// limit-aware helpers for NY Quick Draw
buildQuickDrawRecentCsv40k, } from "./builders/socrata.js";
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// now you can use: require('node:fs'), require.resolve('some-pkg'), etc.
// ---------- socrata job matrix ----------
// Keys must exist in scripts/builders/socrata.ts DATASETS.
// Each entry produces one CSV in GCS.
const SOCRATA_JOBS = [
    // Multi-state
    { key: "multi_powerball", objectPath: "multi/powerball.csv" },
    { key: "multi_megamillions", objectPath: "multi/megamillions.csv" },
    { key: "multi_cash4life", objectPath: "multi/cash4life.csv" },
    // New York draw games
    { key: "ny_nylotto", objectPath: "ny/nylotto.csv" },
    { key: "ny_numbers_midday", objectPath: "ny/numbers_midday.csv" },
    { key: "ny_numbers_evening", objectPath: "ny/numbers_evening.csv" },
    { key: "ny_win4_midday", objectPath: "ny/win4_midday.csv" },
    { key: "ny_win4_evening", objectPath: "ny/win4_evening.csv" },
    { key: "ny_pick10", objectPath: "ny/pick10.csv" },
    { key: "ny_take5_midday", objectPath: "ny/take5_midday.csv" },
    { key: "ny_take5_evening", objectPath: "ny/take5_evening.csv" },
    { key: "ny_quick_draw", objectPath: "ny/quick_draw.csv" },
];
// ---------- utils ----------
const BOOL = (v) => {
    if (v == null)
        return false;
    const s = String(v).trim().toLowerCase();
    return s === "1" || s === "true" || s === "yes";
};
// sensible default, override via env if you like
const CSV_CACHE_CONTROL = process.env.CSV_CACHE_CONTROL ?? "public, max-age=300, must-revalidate";
async function maybeUploadCsv(params) {
    const { bucketName, objectPath, fullCsv } = params;
    // Full CSV
    await upsertObject({
        bucketName,
        objectPath,
        contentType: "text/csv; charset=utf-8",
        bodyBuffer: Buffer.from(fullCsv, "utf8"),
        cacheControl: CSV_CACHE_CONTROL,
    });
    // Latest CSV (optional but handy)
    const latest = latestCsv(fullCsv);
    await upsertObject({
        bucketName,
        objectPath: objectPath.replace(/\.csv$/i, ".latest.csv"),
        contentType: "text/csv; charset=utf-8",
        bodyBuffer: Buffer.from(latest, "utf8"),
        cacheControl: CSV_CACHE_CONTROL,
    });
}
// ---------- main ----------
export async function main() {
    const bucket = deriveBucketFromBaseUrl();
    const skipSocrata = BOOL(process.env.SKIP_SOCRATA);
    const skipGAF5 = BOOL(process.env.SKIP_GA_FANTASY5);
    const skipFLLotto = BOOL(process.env.SKIP_FL_LOTTO);
    const skipFLJtp = BOOL(process.env.SKIP_FL_JTP);
    const skipFLF5 = BOOL(process.env.SKIP_FL_FANTASY5);
    const skipFLPick5 = BOOL(process.env.SKIP_FL_PICK5);
    const skipFLPick4 = BOOL(process.env.SKIP_FL_PICK4);
    const skipFLPick3 = BOOL(process.env.SKIP_FL_PICK3);
    const skipFLPick2 = BOOL(process.env.SKIP_FL_PICK2);
    const skipFLCashPop = BOOL(process.env.SKIP_FL_CASHPOP);
    const skipCADaily3 = BOOL(process.env.SKIP_CA_DAILY3);
    const skipCADaily4 = BOOL(process.env.SKIP_CA_DAILY4);
    const skipCASLP = BOOL(process.env.SKIP_CA_SUPERLOTTO_PLUS);
    const skipCAF5 = BOOL(process.env.SKIP_CA_FANTASY5);
    const socrataToken = process.env.NY_SOCRATA_APP_TOKEN || process.env.SOCRATA_APP_TOKEN;
    console.log(`[update-csvs] Bucket: ${bucket}`);
    console.log(`[update-csvs] Bucket: ${bucket}\n` +
        `[update-csvs] Flags: ` +
        `skipSocrata=${skipSocrata} ` +
        `skipGAF5=${skipGAF5} ` +
        `skipFLLotto=${skipFLLotto} ` +
        `skipFLJtp=${skipFLJtp} ` +
        `skipFLF5=${skipFLF5} ` +
        `skipFLPick5=${skipFLPick5} ` +
        `skipFLPick4=${skipFLPick4} ` +
        `skipFLPick3=${skipFLPick3} ` +
        `skipFLPick2=${skipFLPick2} ` +
        `skipFLCashPop=${skipFLCashPop} ` +
        `skipCADaily3=${skipCADaily3} ` +
        `skipCASLP=${skipCASLP} ` +
        `skipCAF5=${skipCAF5} `);
    // --- Draws: Socrata (Multi-state + New York) ---
    if (!skipSocrata) {
        if (!socrataToken) {
            throw new Error("[update-csvs] Missing NY_SOCRATA_APP_TOKEN/SOCRATA_APP_TOKEN while SKIP_SOCRATA=0");
        }
        await Promise.all(SOCRATA_JOBS.map(async ({ key, objectPath }) => {
            let csv;
            // SPECIAL CASE: limit NY Quick Draw to a manageable recent slice (last 40,000)
            if (key === "ny_quick_draw") {
                console.log(`[update-csvs] NY Quick Draw via lastN=40000`);
                csv = await buildQuickDrawRecentCsv40k(socrataToken);
            }
            else {
                // All other Socrata datasets fetch full history as before
                csv = await buildSocrataCsv(key, socrataToken);
            }
            await maybeUploadCsv({ bucketName: bucket, objectPath, fullCsv: csv });
        }));
    }
    else {
        console.log("[update-csvs] SKIP_SOCRATA=1 — skipping all Socrata-driven draws (multi + NY)");
    }
    // --- Draws: GA Fantasy 5 ---
    if (!skipGAF5) {
        // Step 1: refresh local seed (writes to public/data/ga/fantasy5.csv by default)
        await buildGeorgiaFantasy5Csv();
        // Step 2: normalize to canonical CSV (dedupe, sort, etc.), using the freshly written local seed
        const csv = await buildGeorgiaFantasy5CsvFromLocalSeed();
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
    // --- Draws: Florida LOTTO (from official PDF) ---
    if (!skipFLLotto) {
        await buildFloridaLottoCsv(); // writes public/data/fl/lotto.csv
        const csv = await fs.readFile("public/data/fl/lotto.csv", "utf8");
        await maybeUploadCsv({
            bucketName: bucket,
            objectPath: "fl/lotto.csv",
            fullCsv: csv,
        });
    }
    else {
        console.log("[update-csvs] SKIP_FL_LOTTO=1 — skipping Florida Lotto");
    }
    // --- Draws: Florida Jackpot Triple Play (from official PDF) ---
    if (!skipFLJtp) {
        await buildFloridaJtpCsv(); // writes public/data/fl/jackpot_triple_play.csv
        const csv = await fs.readFile("public/data/fl/jackpot_triple_play.csv", "utf8");
        await maybeUploadCsv({
            bucketName: bucket,
            objectPath: "fl/jackpot_triple_play.csv",
            fullCsv: csv,
        });
    }
    else {
        console.log("[update-csvs] SKIP_FL_JTP=1 — skipping Florida Jackpot Triple Play");
    }
    // --- Draws: Florida Fantasy 5 (from official PDF) ---
    if (!skipFLF5) {
        // Writes:
        //   public/data/fl/fantasy5_midday.csv
        //   public/data/fl/fantasy5_evening.csv
        // Optional local override: FL_FF_PDF_PATH=/path/to/ff.pdf
        await buildFloridaFantasy5Csvs();
        const mid = await fs.readFile("public/data/fl/fantasy5_midday.csv", "utf8");
        const eve = await fs.readFile("public/data/fl/fantasy5_evening.csv", "utf8");
        await maybeUploadCsv({ bucketName: bucket, objectPath: "fl/fantasy5_midday.csv", fullCsv: mid });
        await maybeUploadCsv({ bucketName: bucket, objectPath: "fl/fantasy5_evening.csv", fullCsv: eve });
    }
    else {
        console.log("[update-csvs] SKIP_FL_FANTASY5=1 — skipping Florida Fantasy 5");
    }
    // --- Draws: Florida Pick 5 (from official PDF) ---
    if (!skipFLPick5) {
        await buildFloridaPick5Csvs();
        const mid = await fs.readFile("public/data/fl/pick5_midday.csv", "utf8");
        const eve = await fs.readFile("public/data/fl/pick5_evening.csv", "utf8");
        await maybeUploadCsv({ bucketName: bucket, objectPath: "fl/pick5_midday.csv", fullCsv: mid });
        await maybeUploadCsv({ bucketName: bucket, objectPath: "fl/pick5_evening.csv", fullCsv: eve });
    }
    else {
        console.log("[update-csvs] SKIP_FL_PICK5=1 — skipping Florida Pick 5");
    }
    // --- Draws: Florida Pick 4 (from official PDF) ---
    if (!skipFLPick4) {
        await buildFloridaPick4Csvs();
        const mid = await fs.readFile("public/data/fl/pick4_midday.csv", "utf8");
        const eve = await fs.readFile("public/data/fl/pick4_evening.csv", "utf8");
        await maybeUploadCsv({ bucketName: bucket, objectPath: "fl/pick4_midday.csv", fullCsv: mid });
        await maybeUploadCsv({ bucketName: bucket, objectPath: "fl/pick4_evening.csv", fullCsv: eve });
    }
    else {
        console.log("[update-csvs] SKIP_FL_PICK4=1 — skipping Florida Pick 4");
    }
    // --- Draws: Florida Pick 3 (from official PDF) ---
    if (!skipFLPick3) {
        await buildFloridaPick3Csvs();
        const mid = await fs.readFile("public/data/fl/pick3_midday.csv", "utf8");
        const eve = await fs.readFile("public/data/fl/pick3_evening.csv", "utf8");
        await maybeUploadCsv({ bucketName: bucket, objectPath: "fl/pick3_midday.csv", fullCsv: mid });
        await maybeUploadCsv({ bucketName: bucket, objectPath: "fl/pick3_evening.csv", fullCsv: eve });
    }
    else {
        console.log("[update-csvs] SKIP_FL_PICK3=1 — skipping Florida Pick 3");
    }
    // --- Draws: Florida Pick 2 (from official PDF) ---
    if (!skipFLPick2) {
        await buildFloridaPick2Csvs();
        const mid = await fs.readFile("public/data/fl/pick2_midday.csv", "utf8");
        const eve = await fs.readFile("public/data/fl/pick2_evening.csv", "utf8");
        await maybeUploadCsv({ bucketName: bucket, objectPath: "fl/pick2_midday.csv", fullCsv: mid });
        await maybeUploadCsv({ bucketName: bucket, objectPath: "fl/pick2_evening.csv", fullCsv: eve });
    }
    else {
        console.log("[update-csvs] SKIP_FL_PICK2=1 — skipping Florida Pick 2");
    }
    // --- Draws: Florida Cash Pop (from official PDF) ---
    if (!skipFLCashPop) {
        // Writes:
        //   public/data/fl/cashpop_morning.csv
        //   public/data/fl/cashpop_matinee.csv
        //   public/data/fl/cashpop_afternoon.csv
        //   public/data/fl/cashpop_evening.csv
        //   public/data/fl/cashpop_latenight.csv
        await buildFloridaCashPopCsvs();
        const periods = ['morning', 'matinee', 'afternoon', 'evening', 'latenight'];
        for (const p of periods) {
            const localPath = `public/data/fl/cashpop_${p}.csv`;
            const csv = await fs.readFile(localPath, "utf8");
            await maybeUploadCsv({
                bucketName: bucket,
                objectPath: `fl/cashpop_${p}.csv`,
                fullCsv: csv,
            });
        }
    }
    else {
        console.log("[update-csvs] SKIP_FL_CASHPOP=1 — skipping Florida Cash Pop");
    }
    // --- Draws: CA Daily 3 (from official game card) ---
    // Objects:
    //   ca/daily3_midday.csv
    //   ca/daily3_evening.csv
    if (!skipCADaily3) {
        const MID_LOCAL = "public/data/ca/daily3_midday.csv";
        const EVE_LOCAL = "public/data/ca/daily3_evening.csv";
        const MID_OBJ = "ca/daily3_midday.csv";
        const EVE_OBJ = "ca/daily3_evening.csv";
        // Helper: hydrate local CSVs if missing so update can append (stateless runners)
        async function hydrateLocalIfMissing(localPath, objectPath) {
            try {
                await fs.access(localPath);
            }
            catch {
                const text = await getObjectText({ bucketName: bucket, objectPath });
                if (text) {
                    await fs.mkdir(require("node:path").dirname(localPath), { recursive: true });
                    await fs.writeFile(localPath, text, "utf8");
                    console.log(`[update-csvs] Hydrated ${localPath} from gs://${bucket}/${objectPath}`);
                }
                else {
                    console.log(`[update-csvs] No remote object for ${objectPath}; starting fresh locally`);
                }
            }
        }
        await hydrateLocalIfMissing(MID_LOCAL, MID_OBJ);
        await hydrateLocalIfMissing(EVE_LOCAL, EVE_OBJ);
        console.log("[update-csvs] CA Daily 3: running update…");
        await buildCaliforniaDaily3Update(MID_LOCAL, EVE_LOCAL);
        const mid = await fs.readFile(MID_LOCAL, "utf8");
        const eve = await fs.readFile(EVE_LOCAL, "utf8");
        await maybeUploadCsv({ bucketName: bucket, objectPath: MID_OBJ, fullCsv: mid });
        await maybeUploadCsv({ bucketName: bucket, objectPath: EVE_OBJ, fullCsv: eve });
    }
    else {
        console.log("[update-csvs] SKIP_CA_DAILY3=1 — skipping CA Daily 3");
    }
    // --- Draws: CA Daily 4 (from official game card) ---
    // Object: ca/daily4.csv
    if (!skipCADaily4) {
        const LOCAL = "public/data/ca/daily4.csv";
        const OBJ = "ca/daily4.csv";
        // Helper: hydrate local CSV if missing (so update can append)
        async function hydrateLocalIfMissing(localPath, objectPath) {
            try {
                await fs.access(localPath);
            }
            catch {
                const text = await getObjectText({ bucketName: bucket, objectPath });
                if (text) {
                    await fs.mkdir(require("node:path").dirname(localPath), { recursive: true });
                    await fs.writeFile(localPath, text, "utf8");
                    console.log(`[update-csvs] Hydrated ${localPath} from gs://${bucket}/${objectPath}`);
                }
                else {
                    console.log(`[update-csvs] No remote object for ${objectPath}; starting fresh locally`);
                }
            }
        }
        await hydrateLocalIfMissing(LOCAL, OBJ);
        console.log("[update-csvs] CA Daily 4: running update…");
        await buildCaliforniaDaily4Update(LOCAL);
        const csv = await fs.readFile(LOCAL, "utf8");
        await maybeUploadCsv({ bucketName: bucket, objectPath: OBJ, fullCsv: csv });
    }
    else {
        console.log("[update-csvs] SKIP_CA_DAILY4=1 — skipping CA Daily 4");
    }
    // --- Draws: CA SuperLotto Plus (from official game card) ---
    // Object: ca/superlotto_plus.csv
    if (!skipCASLP) {
        const LOCAL = "public/data/ca/superlotto_plus.csv";
        const OBJ = "ca/superlotto_plus.csv";
        // Helper: hydrate local CSV if missing (so update can append)
        async function hydrateLocalIfMissing(localPath, objectPath) {
            try {
                await fs.access(localPath);
            }
            catch {
                const text = await getObjectText({ bucketName: bucket, objectPath });
                if (text) {
                    await fs.mkdir(require("node:path").dirname(localPath), { recursive: true });
                    await fs.writeFile(localPath, text, "utf8");
                    console.log(`[update-csvs] Hydrated ${localPath} from gs://${bucket}/${objectPath}`);
                }
                else {
                    console.log(`[update-csvs] No remote object for ${objectPath}; starting fresh locally`);
                }
            }
        }
        await hydrateLocalIfMissing(LOCAL, OBJ);
        console.log("[update-csvs] CA SuperLotto Plus: running update…");
        await buildCaliforniaSuperLottoPlusUpdate(LOCAL);
        const csv = await fs.readFile(LOCAL, "utf8");
        await maybeUploadCsv({ bucketName: bucket, objectPath: OBJ, fullCsv: csv });
    }
    else {
        console.log("[update-csvs] SKIP_CA_SUPERLOTTO_PLUS=1 — skipping CA SuperLotto Plus");
    }
    // --- Draws: CA Fantasy 5 (from official game card) ---
    // Object: ca/fantasy5.csv
    if (!skipCAF5) {
        const LOCAL = "public/data/ca/fantasy5.csv";
        const OBJ = "ca/fantasy5.csv";
        // Helper: hydrate local CSV if missing (so update can append)
        async function hydrateLocalIfMissing(localPath, objectPath) {
            try {
                await fs.access(localPath);
            }
            catch {
                const text = await getObjectText({ bucketName: bucket, objectPath });
                if (text) {
                    await fs.mkdir(require("node:path").dirname(localPath), { recursive: true });
                    await fs.writeFile(localPath, text, "utf8");
                    console.log(`[update-csvs] Hydrated ${localPath} from gs://${bucket}/${objectPath}`);
                }
                else {
                    console.log(`[update-csvs] No remote object for ${objectPath}; starting fresh locally`);
                }
            }
        }
        await hydrateLocalIfMissing(LOCAL, OBJ);
        console.log("[update-csvs] CA Fantasy 5: running update…");
        await buildCaliforniaFantasy5Update(LOCAL);
        const csv = await fs.readFile(LOCAL, "utf8");
        await maybeUploadCsv({ bucketName: bucket, objectPath: OBJ, fullCsv: csv });
    }
    else {
        console.log("[update-csvs] SKIP_CA_FANTASY5=1 — skipping CA Fantasy 5");
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
