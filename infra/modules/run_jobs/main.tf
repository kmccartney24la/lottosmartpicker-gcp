# infra/modules/run_jobs/main.tf
locals {
  project_num = data.google_project.this.number
}

data "google_project" "this" {}

# -----------------------
# Cloud Run Jobs
# -----------------------

# lotto-updater (CSVs)
resource "google_cloud_run_v2_job" "lotto_updater" {
  name     = "lotto-updater"
  location = var.region

  template {
    template {
      service_account = var.jobs_service_account

      containers {
        image = "${var.region}-docker.pkg.dev/${var.project_id}/jobs/lotto-updater:latest"

        env {
          name  = "GCS_BUCKET"
          value = var.data_bucket_name
        }
        env {
          name  = "PUBLIC_BASE_URL"
          value = var.public_base_url
        }
        env {
          name  = "TRACE"
          value = "0"
        }
        env {
          name  = "SKIP_SOCRATA"
          value = "0"
        }

        resources {
          limits = {
            memory = "1Gi"
            cpu    = "1"
          }
        }
      }
    }
  }

  labels = var.labels
}

# scratchers (Playwright heavy)
resource "google_cloud_run_v2_job" "scratchers" {
  name     = "scratchers"
  location = var.region

  template {
    template {
      service_account = var.jobs_service_account

      containers {
        image = "${var.region}-docker.pkg.dev/${var.project_id}/jobs/scratchers:latest"

        env {
          name  = "GCS_BUCKET"
          value = var.data_bucket_name
        }
        env {
          name  = "PUBLIC_BASE_URL"
          value = var.public_base_url
        }
        env {
          name  = "TRACE"
          value = "1"
        }
        env {
          name = "SOCRATA_APP_TOKEN"
          value_source {
            secret_key_ref {
              secret  = var.secret_socrata_token
              version = "latest"
            }
          }
        }

        resources {
          limits = {
            memory = "4Gi"
            cpu    = "2"
          }
        }
      }
    }
  }

  labels = var.labels
}

# -----------------------
# Scheduler + IAM
# -----------------------

# Service Account used by Scheduler to call Run Jobs API with OIDC
resource "google_service_account" "scheduler_invoker" {
  account_id   = "scheduler-invoker"
  display_name = "Cloud Scheduler invoker"
}

# Allow the scheduler SA to run jobs
resource "google_project_iam_member" "scheduler_can_run_jobs" {
  project = var.project_id
  role    = "roles/run.jobsRunner"
  member  = "serviceAccount:${google_service_account.scheduler_invoker.email}"
}

# Nightly CSVs
resource "google_cloud_scheduler_job" "lotto_updater" {
  name      = "cron-lotto-updater"
  schedule  = var.cron_csvs
  time_zone = "America/New_York"
  region    = var.region

  http_target {
    http_method = "POST"
    uri         = "https://${var.region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${var.project_id}/jobs/${google_cloud_run_v2_job.lotto_updater.name}:run"

    oidc_token {
      audience              = "https://${var.region}-run.googleapis.com/"
      service_account_email = google_service_account.scheduler_invoker.email
    }

    headers = {
      "Content-Type" = "application/json"
    }
    body = base64encode("{}")
  }
}

# Weekly scratchers
resource "google_cloud_scheduler_job" "scratchers" {
  name      = "cron-scratchers"
  schedule  = var.cron_scratchers
  time_zone = "America/New_York"
  region    = var.region

  http_target {
    http_method = "POST"
    uri         = "https://${var.region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${var.project_id}/jobs/${google_cloud_run_v2_job.scratchers.name}:run"

    oidc_token {
      audience              = "https://${var.region}-run.googleapis.com/"
      service_account_email = google_service_account.scheduler_invoker.email
    }

    headers = {
      "Content-Type" = "application/json"
    }
    body = base64encode("{}")
  }
}
