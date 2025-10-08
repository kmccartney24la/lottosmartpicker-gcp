# LottoSmartPicker – Google Cloud Migration (Keyless, Best Practices)

This repo deploys a Next.js app to Cloud Run, serves data via GCS + Cloud CDN on
`data.lottosmartpicker.com`, and runs two Cloud Run Jobs (CSV updater + GA scratchers scraper).
Prod and staging are separate GCP projects (mirror setup).

## Environments

- **Prod Project:** `lottosmartpicker-prod`
- **Staging Project:** `lottosmartpicker-staging`
- **Region:** `us-central1`
- **App domains:**  
  - Prod: `app.lottosmartpicker.com`  
  - Staging: `app-staging.lottosmartpicker.com`
- **Data domains (Cloud CDN over GCS):**  
  - Prod: `data.lottosmartpicker.com`  
  - Staging: `data-staging.lottosmartpicker.com`

## Keyless Auth

- **GitHub Actions → GCP**: Workload Identity Federation (WIF). No JSON keys.
- **Cloud Run / Jobs → GCP**: Application Default Credentials (ADC). No keys.

## Artifacts

- **App image:** Artifact Registry `.../app[/-stg]/lottosmartpicker`
- **Jobs images:** `.../jobs[/-stg]/{lotto-updater,ga-scratchers}`
- **GCS bucket:**  
  - Prod: `gs://lottosmartpicker-data/`  
  - Staging: `gs://lottosmartpicker-data-stg/`  
  - Versioning **ON** (allows rollback).

### Public, Stable Paths (contract)

gs://<bucket>/
ga/
scratchers/
index.json
images/{gameNumber}/... (webp/png)
cash4life.csv
fantasy5.csv
multi/
powerball.csv
megamillions.csv


Equivalent HTTPS via CDN:

https(s)://data[-staging].lottosmartpicker.com/<same-path>


## App Container (Next.js standalone)

- `next.config.mjs`:
  ```js
  export default { output: 'standalone' };

