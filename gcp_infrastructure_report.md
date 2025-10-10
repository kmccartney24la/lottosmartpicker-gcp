# Google Cloud Infrastructure Discovery Report for Project: `lottosmartpicker-prod`

---

**1. Project Information**

*   **Project ID**: `lottosmartpicker-prod`
*   **Project Name**: `lottosmartpicker-prod`
*   **Project Number**: `79993353094`
*   **Creation Time**: `2025-09-16T03:23:50.573091Z`
*   **Lifecycle State**: `ACTIVE`

---

**2. Service Accounts and IAM Policies**

**Service Accounts:**

*   `Scheduler Invoker for Jobs` (`scheduler-invoker@lottosmartpicker-prod.iam.gserviceaccount.com`)
*   `LSP CI SA (lottosmartpicker-prod)` (`lsp-ci@lottosmartpicker-prod.iam.gserviceaccount.com`)
*   `LSP Jobs SA (lottosmartpicker-prod)` (`lsp-jobs@lottosmartpicker-prod.iam.gserviceaccount.com`)
*   `LSP App SA (lottosmartpicker-prod)` (`lsp-run@lottosmartpicker-prod.iam.gserviceaccount.com`)
*   `Default compute service account` (`79993353094-compute@developer.gserviceaccount.com`)
*   `Scheduler ? Cloud Run Jobs` (`scheduler-runner@lottosmartpicker-prod.iam.gserviceaccount.com`)

**IAM Policies (Service Account specific):**

*   `roles/artifactregistry.reader`:
    *   `serviceAccount:lsp-jobs@lottosmartpicker-prod.iam.gserviceaccount.com`
    *   `serviceAccount:lsp-run@lottosmartpicker-prod.iam.gserviceaccount.com`
    *   `serviceAccount:service-79993353094@serverless-robot-prod.iam.gserviceaccount.com`
*   `roles/artifactregistry.serviceAgent`:
    *   `serviceAccount:service-79993353094@gcp-sa-artifactregistry.iam.gserviceaccount.com`
*   `roles/artifactregistry.writer`:
    *   `serviceAccount:79993353094@cloudbuild.gserviceaccount.com`
    *   `serviceAccount:lsp-ci@lottosmartpicker-prod.iam.gserviceaccount.com`
*   `roles/cloudaicompanion.serviceAgent`:
    *   `serviceAccount:service-79993353094@gcp-sa-cloudaicompanion.iam.gserviceaccount.com`
*   `roles/cloudbuild.builds.builder`:
    *   `serviceAccount:79993353094@cloudbuild.gserviceaccount.com`
*   `roles/cloudbuild.builds.editor`:
    *   `serviceAccount:lsp-ci@lottosmartpicker-prod.iam.gserviceaccount.com`
*   `roles/cloudbuild.serviceAgent`:
    *   `serviceAccount:service-79993353094@gcp-sa-cloudbuild.iam.gserviceaccount.com`
*   `roles/cloudscheduler.serviceAgent`:
    *   `serviceAccount:service-79993353094@gcp-sa-cloudscheduler.iam.gserviceaccount.com`
*   `roles/compute.serviceAgent`:
    *   `serviceAccount:service-79993353094@compute-system.iam.gserviceaccount.com`
*   `roles/containerregistry.ServiceAgent`:
    *   `serviceAccount:service-79993353094@containerregistry.iam.gserviceaccount.com`
*   `roles/editor`:
    *   `serviceAccount:79993353094-compute@developer.gserviceaccount.com`
    *   `serviceAccount:79993353094@cloudservices.gserviceaccount.com`
*   `roles/pubsub.serviceAgent`:
    *   `serviceAccount:service-79993353094@gcp-sa-pubsub.iam.gserviceaccount.com`
*   `roles/run.admin`:
    *   `serviceAccount:79993353094@cloudbuild.gserviceaccount.com`
    *   `serviceAccount:lsp-ci@lottosmartpicker-prod.iam.gserviceaccount.com`
*   `roles/run.serviceAgent`:
    *   `serviceAccount:service-79993353094@serverless-robot-prod.iam.gserviceaccount.com`
*   `roles/secretmanager.admin`:
    *   `serviceAccount:service-79993353094@gcp-sa-cloudbuild.iam.gserviceaccount.com`
*   `roles/serviceusage.serviceUsageConsumer`:
    *   `serviceAccount:lsp-ci@lottosmartpicker-prod.iam.gserviceaccount.com`
*   `roles/storage.objectViewer`:
    *   `serviceAccount:lsp-run@lottosmartpicker-prod.iam.gserviceaccount.com`

---

**3. Artifact Registry (us-central1)**

*   **Repository**: `app`
    *   **Format**: `DOCKER`
    *   **Mode**: `STANDARD_REPOSITORY`
    *   **Description**: `LSP app containers`
    *   **Location**: `us-central1`
    *   **Encryption**: `Google-managed key`
    *   **Size (MB)**: `83563.759`
*   **Repository**: `cloud-run-source-deploy`
    *   **Format**: `DOCKER`
    *   **Mode**: `STANDARD_REPOSITORY`
    *   **Description**: `Cloud Run Source Deployments`
    *   **Location**: `us-central1`
    *   **Encryption**: `Google-managed key`
    *   **Size (MB)**: `0`
*   **Repository**: `jobs`
    *   **Format**: `DOCKER`
    *   **Mode**: `STANDARD_REPOSITORY`
    *   **Description**: `LSP job containers`
    *   **Location**: `us-central1`
    *   **Encryption**: `Google-managed key`
    *   **Size (MB)**: `10850.604`

---

**4. Cloud Storage Buckets**

*   **Bucket**: `lottosmartpicker-data`
    *   **Location**: `US-CENTRAL1`
    *   **Location Type**: `region`
    *   **Default Storage Class**: `STANDARD`
    *   **Versioning Enabled**: `true`
    *   **Uniform Bucket Level Access**: `true`
    *   **CORS Config**:
        *   `maxAgeSeconds`: `3600`
        *   `method`: `GET`, `HEAD`, `OPTIONS`
        *   `origin`: `https://app.lottosmartpicker.com`, `https://lottosmartpicker-app-durjboufua-uc.a.run.app`
        *   `responseHeader`: `Content-Type`, `Cache-Control`, `ETag`
    *   **Lifecycle Config**:
        *   **Rule**: Delete objects older than 7 days with prefix `ga_scratchers/_debug_`
*   **Bucket**: `lottosmartpicker-prod_cloudbuild`
    *   **Location**: `US`
    *   **Location Type**: `multi-region`
    *   **Default Storage Class**: `STANDARD`
    *   **Uniform Bucket Level Access**: `false`
    *   **ACL**: Project owners, editors, and viewers have `OWNER`/`READER` roles.
    *   **Default ACL**: Project owners, editors, and viewers have `OWNER`/`READER` roles.
*   **Bucket**: `lsp-tfstate-prod`
    *   **Location**: `US`
    *   **Location Type**: `multi-region`
    *   **Default Storage Class**: `STANDARD`
    *   **Uniform Bucket Level Access**: `true`

---

**5. Cloud Run Services (us-central1)**

*   **Service**: `lottosmartpicker-app`
    *   **URL**: `https://lottosmartpicker-app-79993353094.us-central1.run.app`
    *   **Last Deployed By**: `79993353094-compute@developer.gserviceaccount.com`
    *   **Min/Max Scale**: `1`/`10`
    *   **Container Concurrency**: `80`
    *   **Service Account**: `lsp-run@lottosmartpicker-prod.iam.gserviceaccount.com`
    *   **Environment Variables**: `PUBLIC_BASE_URL`, `NEXT_PUBLIC_DATA_BASE`, `NEXT_PUBLIC_DATA_BASE_URL`, `NEXT_PUBLIC_APP_ORIGIN`
    *   **Image**: `us-central1-docker.pkg.dev/lottosmartpicker-prod/app/lottosmartpicker:latest`
*   **Service**: `lottosmartpicker-scratchers-web`
    *   **URL**: `https://lottosmartpicker-scratchers-web-79993353094.us-central1.run.app`
    *   **Last Deployed By**: `kmccartney24la@gmail.com`
    *   **Min/Max Scale**: `(not specified)`/`20`
    *   **Container Concurrency**: `80`
    *   **Service Account**: `79993353094-compute@developer.gserviceaccount.com`
    *   **Image**: `us-central1-docker.pkg.dev/lottosmartpicker-prod/app/lottosmartpicker-scratchers:latest`
    *   **Status**: `False` (Image not found)

---

**6. Cloud Run Jobs (us-central1)**

*   **Job**: `scratchers`
    *   **Last Run At**: `2025-10-07 21:19:44 UTC`
    *   **Created By**: `kmccartney24la@gmail.com`
    *   **Service Account**: `lsp-jobs@lottosmartpicker-prod.iam.gserviceaccount.com`
    *   **Image**: `us-central1-docker.pkg.dev/lottosmartpicker-prod/app/lottosmartpicker:latest`
    *   **Command**: `/usr/local/bin/node`
    *   **Args**: `dist/scripts/scratchers/fetch_ga_scratchers.js`, `--seed`, `--concurrency=4`
    *   **Resources**: `2 CPU`, `8Gi Memory`
    *   **Timeout**: `7200s`
*   **Job**: `seed-socrata` (Managed by Terraform)
    *   **Last Run At**: `2025-09-25 02:32:14 UTC`
    *   **Created By**: `kmccartney24la@gmail.com`
    *   **Service Account**: `lsp-jobs@lottosmartpicker-prod.iam.gserviceaccount.com`
    *   **Image**: `us-central1-docker.pkg.dev/lottosmartpicker-prod/app/lottosmartpicker:latest`
    *   **Command**: `/usr/local/bin/node`
    *   **Args**: `dist/scripts/update_csvs.js`
    *   **Environment Variables**: `SKIP_FANTASY5=1`, `SKIP_SCRATCHERS=1`, `SKIP_SOCRATA=0`, `NY_SOCRATA_APP_TOKEN` (from Secret Manager)
    *   **Resources**: `1 CPU`, `2Gi Memory`
    *   **Timeout**: `1200s`
    *   **Status**: `EXECUTION_FAILED` (last execution)
*   **Job**: `update-csvs`
    *   **Last Run At**: `2025-10-07 21:21:32 UTC`
    *   **Created By**: `kmccartney24la@gmail.com`
    *   **Service Account**: `lsp-jobs@lottosmartpicker-prod.iam.gserviceaccount.com`
    *   **Image**: `us-central1-docker.pkg.dev/lottosmartpicker-prod/app/lottosmartpicker:latest`
    *   **Command**: `/usr/local/bin/node`
    *   **Args**: `dist/scripts/update_csvs.js`
    *   **Environment Variables**: `SKIP_SOCRATA=0`, `SKIP_FANTASY5=0`, `SKIP_SCRATCHERS=1`, `NY_SOCRATA_APP_TOKEN` (from Secret Manager)
    *   **Resources**: `1 CPU`, `4Gi Memory`
    *   **Timeout**: `1200s`

---

**7. Cloud Scheduler Jobs (us-central1)**

*   **Job**: `scratchers-weekly`
    *   **Schedule**: `5 12 * * 1` (America/New_York)
    *   **Target Type**: `HTTP`
    *   **State**: `ENABLED`
    *   **URI**: `https://run.googleapis.com/v2/projects/lottosmartpicker-prod/locations/us-central1/jobs/scratchers:run`
    *   **Service Account**: `scheduler-runner@lottosmartpicker-prod.iam.gserviceaccount.com`
*   **Job**: `update-csvs-nightly`
    *   **Schedule**: `30 2 * * *` (America/New_York)
    *   **Target Type**: `HTTP`
    *   **State**: `ENABLED`
    *   **URI**: `https://run.googleapis.com/v2/projects/lottosmartpicker-prod/locations/us-central1/jobs/update-csvs:run`
    *   **Service Account**: `scheduler-runner@lottosmartpicker-prod.iam.gserviceaccount.com`

---

**8. Load Balancers/CDN**

*   **URL Maps**:
    *   `data-url-map` (Default Service: `backendBuckets/data-backend-bucket`)
    *   `lsp-data-urlmap` (Default Service: `backendBuckets/bb-data-prod`)
*   **SSL Certificates**:
    *   `data-prod-cert` (Type: `MANAGED`, Domains: `data.lottosmartpicker.com`)
    *   `data-staging-cert` (Type: `MANAGED`, Domains: `data-staging.lottosmartpicker.com`)
    *   `lsp-data-managed` (Type: `MANAGED`, Domains: `data.lottosmartpicker.com`)
*   **Backend Buckets**:
    *   `bb-data-prod` (GCS Bucket: `lottosmartpicker-data`, Enable CDN: `True`)
    *   `data-backend-bucket` (GCS Bucket: `lottosmartpicker-data`, Enable CDN: `True`)

---

**9. Workload Identity Federation**

*   **Identity Pool**: `github-pool`
    *   **Display Name**: `GitHub OIDC pool`
    *   **State**: `ACTIVE`
    *   **Provider**: `github-provider`
        *   **Display Name**: `GitHub Actions OIDC`
        *   **Issuer URI**: `https://token.actions.githubusercontent.com`
        *   **Attribute Condition**: `attribute.repository=='kmccartney24la/lottosmartpicker-gcp' && (attribute.ref=='refs/heads/main' || attribute.ref=='refs/heads/staging')`

---

**10. Monitoring**

*   **Uptime Checks**: None found.
*   **Alert Policies**:
    *   **Display Name**: `Scratchers job errors > 0 (5m)`
    *   **Enabled**: `true`
    *   **Conditions**: Log-based metric spike (MQL) on `logging.googleapis.com/user/scratchers_error_count`
    *   **Notification Channels**: `projects/lottosmartpicker-prod/notificationChannels/14114787868875300975`
*   **Dashboards**:
    *   **Display Name**: `LSP Exec Overview`
    *   **Widgets**:
        *   `App Requests / Errors` (Cloud Run request and error counts)
        *   `App p95 Latency` (Cloud Run request latencies)
        *   `Scratchers Success Count` (Log-based metric)

---

**11. Budget**

*   **Budget Name**: `$10 Monthly Budget Alert`
*   **Amount**: `60 USD`
*   **Calendar Period**: `MONTH`
*   **Threshold Rules**:
    *   `50%` of current spend
    *   `90%` of current spend
    *   `100%` of current spend
    *   `150%` of current spend

---

**12. DNS**

*   **Managed Zone**: `lsp-zone` (Managed by Terraform)
    *   **DNS Name**: `lottosmartpicker9000.com.`
    *   **Description**: `Managed by Terraform`
    *   **Visibility**: `public`

---

**13. Security**

*   **Security Policy**: `lsp-waf` (Managed by Terraform)
    *   **Description**: `LSP WAF`
    *   **Type**: `CLOUD_ARMOR`
    *   **Rules**: Default allow rule for all IP ranges (`*`)

---

**Discrepancies and Notes:**

*   **Cloud Run Service `lottosmartpicker-scratchers-web` Image Not Found**: The `lottosmartpicker-scratchers-web` Cloud Run service is deployed but its latest revision is not ready due to an "Image not found" error. This indicates a potential issue with the container image in Artifact Registry or the deployment process.
*   **Cloud Run Job `seed-socrata` Execution Failed**: The `seed-socrata` Cloud Run job has a `EXECUTION_FAILED` status for its latest created execution. This suggests a problem with the job's execution, which might require further investigation into its logs.
*   **Uptime Checks**: No uptime checks were found in the project. If these are expected to be present based on Terraform, they are either not deployed or configured differently.
*   **Terraform Variables vs. Discovered Resources**:
    *   The `infra/variables.tf` file defines variables for `security_notification_email`, `organization_id`, `enable_security_command_center`, `enable_container_analysis`, `enable_binary_authorization`, `security_log_retention_days`, and `audit_log_retention_days`. While a security policy (`lsp-waf`) was discovered, the specific configurations related to Security Command Center, Container Analysis, Binary Authorization, and detailed log retention settings were not directly discoverable via the `gcloud` commands used. Further investigation using specific `gcloud` commands for these services would be needed to confirm their existence and configuration.
    *   The `ar_repos` variable in Terraform defines `app` and `jobs` as artifact registry repositories. The discovery confirms these exist, along with `cloud-run-source-deploy` which is likely a Google-managed repository.
    *   The `cors_allowed_origins` variable in Terraform is reflected in the `lottosmartpicker-data` bucket's CORS configuration.
    *   The `cron_csvs` and `cron_scratchers` variables in Terraform correspond to the schedules of `update-csvs-nightly` and `scratchers-weekly` Cloud Scheduler jobs, respectively.

This report provides a detailed snapshot of the existing Google Cloud infrastructure.