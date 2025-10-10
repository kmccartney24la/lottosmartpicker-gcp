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
  count    = var.manage_run_jobs ? 1 : 0
  name     = "update-csvs"
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
            # Critical Priority Action: Update memory from 1Gi to 4Gi for 'update-csvs' job
            memory = "4Gi"
            cpu    = "1"
          }
        }
      }
      timeout = "1200s"
    }
  }

  labels = var.labels
}

# scratchers (Playwright heavy)
resource "google_cloud_run_v2_job" "scratchers" {
  count    = var.manage_run_jobs ? 1 : 0
  name     = "scratchers"
  location = var.region

  template {
    template {
      service_account = var.jobs_service_account

      containers {
        image = "${var.region}-docker.pkg.dev/${var.project_id}/app/lottosmartpicker:latest" # Critical Priority Action: Fix image path for scratchers job

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
            # Critical Priority Action: Update memory from 4Gi to 8Gi for 'scratchers' job
            memory = "8Gi"
            cpu    = "2"
          }
        }
      }
      timeout = "7200s"
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
  count = var.manage_run_jobs ? 1 : 0
  # High Priority Action: Update scheduler job name to match actual GCP
  name = "update-csvs-nightly"
  # High Priority Action: Update schedule to match actual GCP (2:30 AM daily)
  schedule  = "30 2 * * *"
  time_zone = "America/New_York"
  region    = var.region

  http_target {
    http_method = "POST"
    uri         = "https://${var.region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${var.project_id}/jobs/${google_cloud_run_v2_job.lotto_updater[0].name}:run"

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
  count = var.manage_run_jobs ? 1 : 0
  # High Priority Action: Update scheduler job name to match actual GCP
  name = "scratchers-weekly"
  # High Priority Action: Update schedule to match actual GCP (12:05 PM Mondays)
  schedule  = "5 12 * * 1"
  time_zone = "America/New_York"
  region    = var.region

  http_target {
    http_method = "POST"
    uri         = "https://${var.region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${var.project_id}/jobs/${google_cloud_run_v2_job.scratchers[0].name}:run"

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
