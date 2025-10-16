// scripts/update_csvs.ts
// Compile with tsconfig.scripts.json (NodeNext). Run the emitted JS: dist/scripts/update_csvs.js
import * as fs from "node:fs/promises";

// ✅ lib stays .mjs (these files are shipped as ESM in the image)
import { upsertObject, deriveBucketFromBaseUrl } from "../lib/gcs.mjs";
import { latestCsv } from "../lib/csv.mjs";

// ✅ script-to-script imports must end with .js so the emitted JS has correct ESM extensions
import { buildFantasy5Csv } from "./sources/fantasy5.js";
import { buildFloridaLottoCsv } from "./sources/fl_lotto.js";
import { buildFloridaJtpCsv } from "./sources/fl_jtp.js";
import { buildFloridaPick5Csvs } from "./sources/fl_pick5.js";
import { buildFloridaPick4Csvs } from "./sources/fl_pick4.js";
import { buildFloridaPick3Csvs } from "./sources/fl_pick3.js";
import { buildFloridaPick2Csvs } from "./sources/fl_pick2.js";
import { buildFantasy5CsvFromLocalSeed } from "./builders/fantasy5.js";
import { buildSocrataCsv } from "./builders/socrata.js";
import { buildGaScratchersIndex } from "./builders/scratchers_ga.js";

// ---------- socrata job matrix ----------
// Keys must exist in scripts/builders/socrata.ts DATASETS.
// Each entry produces one CSV in GCS.
const SOCRATA_JOBS: Array<{ key: string; objectPath: string }> = [
  // Multi-state
  { key: "multi_powerball",     objectPath: "multi/powerball.csv" },
  { key: "multi_megamillions",  objectPath: "multi/megamillions.csv" },
  { key: "multi_cash4life",     objectPath: "multi/cash4life.csv" },

  // New York draw games
  { key: "ny_nylotto",          objectPath: "ny/nylotto.csv" },
  { key: "ny_numbers_midday",   objectPath: "ny/numbers_midday.csv" },
  { key: "ny_numbers_evening",  objectPath: "ny/numbers_evening.csv" },
  { key: "ny_win4_midday",      objectPath: "ny/win4_midday.csv" },
  { key: "ny_win4_evening",     objectPath: "ny/win4_evening.csv" },
  { key: "ny_pick10",           objectPath: "ny/pick10.csv" },
  { key: "ny_take5_midday",     objectPath: "ny/take5_midday.csv" },
  { key: "ny_take5_evening",    objectPath: "ny/take5_evening.csv" },
  { key: "ny_quick_draw",       objectPath: "ny/quick_draw.csv" },
];


// ---------- utils ----------
const BOOL = (v: unknown): boolean => {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
};

// sensible default, override via env if you like
const CSV_CACHE_CONTROL =
  process.env.CSV_CACHE_CONTROL ?? "public, max-age=300, must-revalidate";

async function maybeUploadCsv(params: { bucketName: string; objectPath: string; fullCsv: string }) {
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
export async function main(): Promise<void> {
  const bucket = deriveBucketFromBaseUrl();
  const skipSocrata = BOOL(process.env.SKIP_SOCRATA);
  const skipF5 = BOOL(process.env.SKIP_FANTASY5);
  const skipScratch = BOOL(process.env.SKIP_SCRATCHERS); // optional, recognized if present
  const skipFLLotto = BOOL(process.env.SKIP_FL_LOTTO);
  const skipFLJtp  = BOOL(process.env.SKIP_FL_JTP);
  const skipFLPick5  = BOOL(process.env.SKIP_FL_PICK5);
  const skipFLPick4  = BOOL(process.env.SKIP_FL_PICK4);
  const skipFLPick3  = BOOL(process.env.SKIP_FL_PICK3);
  const skipFLPick2  = BOOL(process.env.SKIP_FL_PICK2);
  const socrataToken = process.env.NY_SOCRATA_APP_TOKEN || process.env.SOCRATA_APP_TOKEN;

  console.log(`[update-csvs] Bucket: ${bucket}`);
   console.log(
    `[update-csvs] Bucket: ${bucket}\n` +
    `[update-csvs] Flags: ` +
    `skipSocrata=${skipSocrata} ` +
    `skipF5=${skipF5} ` +
    `skipFLLotto=${skipFLLotto} ` +
    `skipFLJtp=${skipFLJtp} ` +
    `skipFLPick5=${skipFLPick5} ` +
    `skipFLPick4=${skipFLPick4} ` +
    `skipFLPick3=${skipFLPick3} ` +
    `skipFLPick2=${skipFLPick2} ` +
    `skipScratchers=${skipScratch}`
  );

  // --- Draws: Socrata (Multi-state + New York) ---
  if (!skipSocrata) {
    if (!socrataToken) {
      throw new Error(
        "[update-csvs] Missing NY_SOCRATA_APP_TOKEN/SOCRATA_APP_TOKEN while SKIP_SOCRATA=0"
      );
    }
    await Promise.all(
      SOCRATA_JOBS.map(async ({ key, objectPath }) => {
        const csv = await buildSocrataCsv(key as any, socrataToken);
        await maybeUploadCsv({ bucketName: bucket, objectPath, fullCsv: csv });
      })
    );
  } else {
    console.log("[update-csvs] SKIP_SOCRATA=1 — skipping all Socrata-driven draws (multi + NY)");
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
  } else {
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
  } else {
    console.log("[update-csvs] SKIP_SCRATCHERS=1 — skipping GA scratchers");
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
  } else {
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
  } else {
    console.log("[update-csvs] SKIP_FL_JTP=1 — skipping Florida Jackpot Triple Play");
  }

  // --- Draws: Florida Pick 5 (from official PDF) ---
  if (!skipFLPick5) {
    await buildFloridaPick5Csvs();
    const mid = await fs.readFile("public/data/fl/pick5_midday.csv", "utf8");
    const eve = await fs.readFile("public/data/fl/pick5_evening.csv", "utf8");
    await maybeUploadCsv({ bucketName: bucket, objectPath: "fl/pick5_midday.csv",  fullCsv: mid });
    await maybeUploadCsv({ bucketName: bucket, objectPath: "fl/pick5_evening.csv", fullCsv: eve });
  } else {
    console.log("[update-csvs] SKIP_FL_PICK5=1 — skipping Florida Pick 5");
  }

  // --- Draws: Florida Pick 4 (from official PDF) ---
  if (!skipFLPick4) {
    await buildFloridaPick4Csvs();
    const mid = await fs.readFile("public/data/fl/pick4_midday.csv", "utf8");
    const eve = await fs.readFile("public/data/fl/pick4_evening.csv", "utf8");
    await maybeUploadCsv({ bucketName: bucket, objectPath: "fl/pick4_midday.csv",  fullCsv: mid });
    await maybeUploadCsv({ bucketName: bucket, objectPath: "fl/pick4_evening.csv", fullCsv: eve });
  } else {
    console.log("[update-csvs] SKIP_FL_PICK4=1 — skipping Florida Pick 4");
  }

  // --- Draws: Florida Pick 3 (from official PDF) ---
  if (!skipFLPick3) {
    await buildFloridaPick3Csvs();
    const mid = await fs.readFile("public/data/fl/pick3_midday.csv", "utf8");
    const eve = await fs.readFile("public/data/fl/pick3_evening.csv", "utf8");
    await maybeUploadCsv({ bucketName: bucket, objectPath: "fl/pick3_midday.csv",  fullCsv: mid });
    await maybeUploadCsv({ bucketName: bucket, objectPath: "fl/pick3_evening.csv", fullCsv: eve });
  } else {
    console.log("[update-csvs] SKIP_FL_PICK3=1 — skipping Florida Pick 3");
  }

  // --- Draws: Florida Pick 2 (from official PDF) ---
  if (!skipFLPick2) {
    await buildFloridaPick2Csvs();
    const mid = await fs.readFile("public/data/fl/pick2_midday.csv", "utf8");
    const eve = await fs.readFile("public/data/fl/pick2_evening.csv", "utf8");
    await maybeUploadCsv({ bucketName: bucket, objectPath: "fl/pick2_midday.csv",  fullCsv: mid });
    await maybeUploadCsv({ bucketName: bucket, objectPath: "fl/pick2_evening.csv", fullCsv: eve });
  } else {
    console.log("[update-csvs] SKIP_FL_PICK2=1 — skipping Florida Pick 2");
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
