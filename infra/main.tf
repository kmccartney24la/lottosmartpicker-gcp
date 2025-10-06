terraform {
  required_version = ">= 1.6"
  required_providers {
    google = { source = "hashicorp/google", version = "~> 5.0" }
  }
}

provider "google" {
  project = var.project
  region  = var.region
}

resource "google_artifact_registry_repository" "app" {
  repository_id = var.repo
  format        = "DOCKER"
  location      = var.region
}

resource "google_cloud_run_service" "web" {
  name     = var.service
  location = var.region

  template {
    spec {
      containers {
        image = "${var.region}-docker.pkg.dev/${var.project}/${var.repo}/${var.image_name}:latest"
        ports { container_port = 3000 }
      }
    }
  }

  traffic { percent = 100, latest_revision = true }
}

resource "google_cloud_run_v2_job" "scratchers" {
  name     = var.job
  location = var.region

  template {
    template {
      containers {
        image = "${var.region}-docker.pkg.dev/${var.project}/${var.repo}/${var.image_name}:latest"
      }
      max_retries = 3
    }
  }
}

# Public URL (add Cloud Run IAM binding for allUsers if you need unauth access via Terraform)
