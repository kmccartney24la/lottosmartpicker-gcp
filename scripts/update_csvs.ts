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

async function maybeUploadCsv(params: { bucketName: string; objectPath: string; fullCsv: string }) {
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
export async function main(): Promise<void> {
  const bucket = deriveBucketFromBaseUrl();
  const skipSocrata = BOOL(process.env.SKIP_SOCRATA);
  const skipF5 = BOOL(process.env.SKIP_FANTASY5);
  const skipScratch = BOOL(process.env.SKIP_SCRATCHERS); // optional, recognized if present
  const socrataToken = process.env.NY_SOCRATA_APP_TOKEN || process.env.SOCRATA_APP_TOKEN;

  console.log(`[update-csvs] Bucket: ${bucket}`);
  console.log(
    `[update-csvs] Flags: skipSocrata=${skipSocrata} skipF5=${skipF5} skipScratchers=${skipScratch}`
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

  console.log("[update-csvs] Done.");
}

// ---------- CLI ----------
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
