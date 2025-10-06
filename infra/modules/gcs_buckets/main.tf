# infra/modules/gcs_buckets/main.tf
resource "google_storage_bucket" "data" {
  name                        = var.data_bucket_name
  location                    = "US"
  uniform_bucket_level_access = true
  force_destroy               = false
  labels                      = var.labels

  versioning { enabled = true }

  cors {
    origin          = var.cors_allowed_origins
    method          = ["GET"]
    response_header = ["Content-Type"]
    max_age_seconds = 3600
  }

  lifecycle_rule {
    action { type = "Delete" }
    condition {
      age       = 3650
      with_state = "ARCHIVED"
    }
  }
}

# Give lsp-jobs objectAdmin on THIS bucket only (least privilege)
resource "google_storage_bucket_iam_member" "jobs_admin_scoped" {
  count  = var.jobs_sa_email != "" ? 1 : 0
  bucket = google_storage_bucket.data.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${var.jobs_sa_email}"
}