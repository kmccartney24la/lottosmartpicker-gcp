# infra/modules/run_service_app/main.tf
resource "google_cloud_run_v2_service" "app" {
  name     = var.service_name
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"
  template {
    service_account = var.service_account_email
    scaling {
      min_instance_count = 0
      max_instance_count = 50
    }
    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/app/lottosmartpicker:latest"
      ports { container_port = 8080 }
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
      # env vars
      dynamic "env" {
        for_each = var.env_vars
        content {
          name  = env.key
          value = env.value
        }
      }
    }
    labels = var.labels
  }
  labels = var.labels
}

# Public access (optional toggle)
resource "google_cloud_run_v2_service_iam_member" "invoker" {
  count    = var.allow_unauthenticated ? 1 : 0
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Optional: add logging/trace labels at request time (metadata)
# (Cloud Run v2 automatically exports logs; request labels are usually set by app)

# Optional: Domain mapping for app (uses CR v1 API)
resource "google_cloud_run_domain_mapping" "mapping" {
  count    = length(var.domain) > 0 ? 1 : 0
  location = var.region
  name     = var.domain
  metadata { namespace = var.project_id }
  spec {
    route_name = google_cloud_run_v2_service.app.name
  }
}
