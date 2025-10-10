# This file contains Terraform resources for existing GCP infrastructure that is not yet managed by Terraform.
# These resources are created to bring the existing infrastructure under Terraform management without
# causing disruption.

resource "google_cloud_run_v2_job" "seed_socrata" {
  name     = "seed-socrata"
  location = "us-central1" # Critical Priority Action: Fix region from us-east4 to us-central1

  template {
    template {
      containers {
        image = "us-central1-docker.pkg.dev/lottosmartpicker-prod/app/lottosmartpicker:latest" # Critical Priority Action: Fix image reference
        env {
          name  = "GCP_PROJECT_ID"
          value = var.project_id
        }
        env {
          name  = "GCP_REGION"
          value = "us-central1" # Critical Priority Action: Fix region from us-east4 to us-central1
        }
        env {
          name = "SOCRATA_APP_TOKEN"
          value_source {
            secret_key_ref {
              secret  = "socrata-app-token"
              version = "latest"
            }
          }
        }
        env {
          name = "SOCRATA_PASSWORD"
          value_source {
            secret_key_ref {
              secret  = "socrata-password"
              version = "latest"
            }
          }
        }
        env {
          name = "SOCRATA_USERNAME"
          value_source {
            secret_key_ref {
              secret  = "socrata-username"
              version = "latest"
            }
          }
        }
        env {
          name  = "GCS_BUCKET"
          value = "lottosmartpicker-data"
        }
        env {
          name  = "PUBLIC_BASE_URL"
          value = "https://data.lottosmartpicker.com"
        }
        env {
          name  = "TRACE"
          value = "false"
        }
        env {
          name  = "SKIP_SOCRATA"
          value = "false"
        }
        resources {
          limits = {
            cpu    = "1000m"
            memory = "2Gi" # Critical Priority Action: Fix memory from 512Mi to 2Gi
          }
        }
      }
      service_account = module.run_jobs[0].scheduler_invoker_email # Critical Priority Action: Fix service account reference
    }
  }

  lifecycle {
    ignore_changes = all # Ignore all changes to prevent Terraform from trying to manage this existing resource
  }
}