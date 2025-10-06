# infra/modules/security_monitoring/main.tf
# Comprehensive Security Monitoring Module for LottoSmartPicker

terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

# Enable required APIs
resource "google_project_service" "security_center" {
  service            = "securitycenter.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "container_analysis" {
  service            = "containeranalysis.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "binary_authorization" {
  service            = "binaryauthorization.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "monitoring" {
  service            = "monitoring.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "logging" {
  service            = "logging.googleapis.com"
  disable_on_destroy = false
}

# Local values for common configurations
locals {
  common_labels = merge(var.labels, {
    component = "security-monitoring"
    managed_by = "terraform"
  })
  
  # Environment-specific alert thresholds
  alert_thresholds = {
    rate_limit_violations = var.environment == "prod" ? var.rate_limit_alert_threshold : var.rate_limit_alert_threshold * 2
    csrf_failures = var.environment == "prod" ? var.csrf_failure_alert_threshold : var.csrf_failure_alert_threshold * 2
    security_events = var.environment == "prod" ? var.security_events_alert_threshold : var.security_events_alert_threshold * 2
  }
}