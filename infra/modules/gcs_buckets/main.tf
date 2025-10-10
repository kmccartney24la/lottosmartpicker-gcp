# infra/modules/gcs_buckets/main.tf
resource "google_storage_bucket" "data" {
  count = var.manage_gcs_buckets ? 1 : 0
  name  = var.data_bucket_name
  # High Priority Action: Update lottosmartpicker-data bucket location from "US" to "US-CENTRAL1"
  location                    = "US-CENTRAL1"
  uniform_bucket_level_access = true
  force_destroy               = false
  labels                      = var.labels

  versioning { enabled = true }

  # Same-origin proxy => no public CORS config needed.
  public_access_prevention = "enforced"

  lifecycle_rule {
    action { type = "Delete" }
    condition {
      age        = 3650
      with_state = "ARCHIVED"
    }
  }
}

# Give lsp-jobs objectAdmin on THIS bucket only (least privilege)
resource "google_storage_bucket_iam_member" "jobs_admin_scoped" {
  count  = var.manage_gcs_buckets ? 1 : 0
  bucket = google_storage_bucket.data[0].name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${var.jobs_sa_email}"
}

# NEW: Allow the Cloud Run service to read objects (proxy uses OAuth to GCS)
resource "google_storage_bucket_iam_member" "run_reader_scoped" {
  count  = var.manage_gcs_buckets ? 1 : 0
  bucket = google_storage_bucket.data[0].name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${var.run_sa_email}"  # pass this var from your run module
}