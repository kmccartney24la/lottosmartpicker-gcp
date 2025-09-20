// ESM
import { upsertObject, deriveBucketFromBaseUrl } from './lib/gcs.mjs';
import { latestCsv } from './lib/csv.mjs';
import { buildSocrataCsv } from './builders/socrata.mjs';
import { buildFantasy5CsvFromLocalSeed } from './builders/fantasy5.mjs';
import { buildGaScratchersIndex } from './builders/scratchers_ga.mjs';

const BOOL = (v) => String(v || '').toLowerCase() === '1' || String(v || '').toLowerCase() === 'true';

async function maybeUploadCsv({ bucketName, objectPath, fullCsv }) {
  const body = Buffer.from(fullCsv, 'utf8');
  await upsertObject({
    bucketName,
    objectPath,
    contentType: 'text/csv; charset=utf-8',
    bodyBuffer: body,
  });
  // latest (optional but handy)
  const latest = Buffer.from(latestCsv(fullCsv), 'utf8');
  await upsertObject({
    bucketName,
    objectPath: objectPath.replace(/\.csv$/i, '.latest.csv'),
    contentType: 'text/csv; charset=utf-8',
    bodyBuffer: latest,
  });
}

export async function main() {
  const bucket = deriveBucketFromBaseUrl();
  const skipSocrata   = BOOL(process.env.SKIP_SOCRATA);
  const skipF5        = BOOL(process.env.SKIP_FANTASY5);
  const skipScratch   = BOOL(process.env.SKIP_SCRATCHERS); // optional, recognized if present
  const socrataToken  = process.env.NY_SOCRATA_APP_TOKEN || process.env.SOCRATA_APP_TOKEN;

  console.log(`[update-csvs] Bucket: ${bucket}`);
  console.log(`[update-csvs] Flags: skipSocrata=${skipSocrata} skipF5=${skipF5} skipScratchers=${skipScratch}`);

  // --- Draws: Socrata (PB/MM/C4L) ---
  if (!skipSocrata) {
    await Promise.all([
      (async () => {
        const csv = await buildSocrataCsv('powerball', socrataToken);
        await maybeUploadCsv({ bucketName: bucket, objectPath: 'multi/powerball.csv', fullCsv: csv });
      })(),
      (async () => {
        const csv = await buildSocrataCsv('megamillions', socrataToken);
        await maybeUploadCsv({ bucketName: bucket, objectPath: 'multi/megamillions.csv', fullCsv: csv });
      })(),
      (async () => {
        const csv = await buildSocrataCsv('ga_cash4life', socrataToken);
        await maybeUploadCsv({ bucketName: bucket, objectPath: 'ga/cash4life.csv', fullCsv: csv });
      })(),
    ]);
  } else {
    console.log('[update-csvs] SKIP_SOCRATA=1 — skipping PB/MM/C4L');
  }

  // --- Draws: GA Fantasy 5 (scraper-normalized) ---
  if (!skipF5) {
    const csv = await buildFantasy5CsvFromLocalSeed();
    await maybeUploadCsv({ bucketName: bucket, objectPath: 'ga/fantasy5.csv', fullCsv: csv });
  } else {
    console.log('[update-csvs] SKIP_FANTASY5=1 — skipping Fantasy 5');
  }

  // --- Scratchers: GA ---
  if (!skipScratch) {
    const json = await buildGaScratchersIndex();
    await upsertObject({
      bucketName: bucket,
      objectPath: 'scratchers/ga/index.json',
      contentType: 'application/json; charset=utf-8',
      bodyBuffer: Buffer.from(json, 'utf8'),
      cacheControl: 'public, max-age=300, must-revalidate',
    });
    // Optional: index.latest.json
    await upsertObject({
      bucketName: bucket,
      objectPath: 'scratchers/ga/index.latest.json',
      contentType: 'application/json; charset=utf-8',
      bodyBuffer: Buffer.from(json, 'utf8'),
      cacheControl: 'public, max-age=300, must-revalidate',
    });
  } else {
    console.log('[update-csvs] SKIP_SCRATCHERS=1 — skipping GA scratchers');
  }

  console.log('[update-csvs] Done.');
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
