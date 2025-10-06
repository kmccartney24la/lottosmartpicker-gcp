# infra/modules/security_monitoring/scanning.tf
# Automated security scanning configuration

# Container Analysis scanning configuration
resource "google_container_analysis_note" "vulnerability_note" {
  count = var.enable_container_analysis ? 1 : 0
  
  name = "vulnerability-scanning-note-${var.environment}"
  
  vulnerability {
    details {
      severity_name = "HIGH"
      description   = "High severity vulnerability detected in container image"
      package_type  = "OS"
    }
    details {
      severity_name = "CRITICAL"
      description   = "Critical severity vulnerability detected in container image"
      package_type  = "OS"
    }
  }
  
  depends_on = [google_project_service.container_analysis]
}

# Binary Authorization policy (if enabled)
resource "google_binary_authorization_policy" "security_policy" {
  count = var.enable_binary_authorization ? 1 : 0
  
  # Default admission rule - require attestation
  default_admission_rule {
    evaluation_mode  = "REQUIRE_ATTESTATION"
    enforcement_mode = "ENFORCED_BLOCK_AND_AUDIT_LOG"
    
    require_attestations_by = [
      google_binary_authorization_attestor.security_attestor[0].name
    ]
  }
  
  # Cluster-specific admission rules
  dynamic "cluster_admission_rules" {
    for_each = var.enable_binary_authorization ? ["us-central1"] : []
    
    content {
      cluster                = "projects/${var.project_id}/locations/${cluster_admission_rules.value}/clusters/*"
      evaluation_mode        = "REQUIRE_ATTESTATION"
      enforcement_mode       = "ENFORCED_BLOCK_AND_AUDIT_LOG"
      
      require_attestations_by = [
        google_binary_authorization_attestor.security_attestor[0].name
      ]
    }
  }
  
  depends_on = [google_project_service.binary_authorization]
}

# Binary Authorization attestor
resource "google_binary_authorization_attestor" "security_attestor" {
  count = var.enable_binary_authorization ? 1 : 0
  
  name = "security-attestor-${var.environment}"
  description = "Security attestor for LottoSmartPicker ${var.environment} environment"
  
  attestation_authority_note {
    note_reference = google_container_analysis_note.vulnerability_note[0].name
    
    public_keys {
      ascii_armored_pgp_public_key = file("${path.module}/keys/attestor-public-key.pgp")
      comment = "Security attestor public key for ${var.environment}"
    }
  }
  
  depends_on = [google_project_service.binary_authorization]
}

# Log-based metric for container vulnerability scans
resource "google_logging_metric" "container_vulnerability_scans" {
  count = var.enable_container_analysis ? 1 : 0
  
  name   = "container_vulnerability_scans"
  filter = "protoPayload.serviceName=\"containeranalysis.googleapis.com\" AND protoPayload.methodName=\"grafeas.v1.Grafeas.CreateOccurrence\" AND protoPayload.request.occurrence.kind=\"VULNERABILITY\""
  
  label_extractors = {
    severity     = "EXTRACT(protoPayload.request.occurrence.vulnerability.severity)"
    package_name = "EXTRACT(protoPayload.request.occurrence.vulnerability.packageIssue.affectedPackage)"
    image_url    = "EXTRACT(protoPayload.request.occurrence.resourceUri)"
  }
  
  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "INT64"
    display_name = "Container Analysis: Vulnerability Scans"
    
    labels {
      key         = "severity"
      value_type  = "STRING"
      description = "Severity of the vulnerability"
    }
    labels {
      key         = "package_name"
      value_type  = "STRING"
      description = "Name of the affected package"
    }
    labels {
      key         = "image_url"
      value_type  = "STRING"
      description = "Container image URL"
    }
  }
}

# Alert policy for HIGH/CRITICAL container vulnerabilities
resource "google_monitoring_alert_policy" "container_vulnerabilities_critical" {
  count = var.enable_container_analysis ? 1 : 0
  
  display_name = "Security: Critical Container Vulnerabilities - ${title(var.environment)}"
  combiner     = "OR"
  enabled      = true
  
  conditions {
    display_name = "HIGH/CRITICAL vulnerabilities detected"
    
    condition_monitoring_query_language {
      query = <<-EOT
        fetch logging.googleapis.com/user/${google_logging_metric.container_vulnerability_scans[0].name}
        | filter (value.container_vulnerability_scans.severity == "HIGH" || value.container_vulnerability_scans.severity == "CRITICAL")
        | align rate(1m)
        | group_by [resource.project_id], sum(value.${google_logging_metric.container_vulnerability_scans[0].name})
        | condition gt(0)
      EOT
      
      duration = "60s"
      
      trigger {
        count = 1
      }
    }
  }
  
  notification_channels = [local.notification_channels.warning]
  
  alert_strategy {
    auto_close = "86400s"  # 24 hours (manual resolution required)
    
    notification_rate_limit {
      period = "3600s"  # 1 hour
    }
  }
  
  documentation {
    content = <<-EOT
# Critical Container Vulnerabilities Detected

**Severity**: Warning (requires action within 4 hours)
**Environment**: ${var.environment}

## Description
HIGH or CRITICAL severity vulnerabilities detected in container images.

## Actions Required
1. Review vulnerability details in Container Analysis console
2. Identify affected container images and packages
3. Update affected dependencies or base images
4. Rebuild and redeploy container images
5. Verify fixes with new vulnerability scan

## Container Analysis Console
[View Vulnerabilities](https://console.cloud.google.com/gcr/images/${var.project_id}?project=${var.project_id})

## Security Command Center
[View Security Findings](https://console.cloud.google.com/security/command-center/findings?project=${var.project_id})

## Remediation Steps
1. `gcloud container images scan IMAGE_URL --project=${var.project_id}`
2. Update Dockerfile with patched base image or dependencies
3. Rebuild: `docker build -t IMAGE_URL .`
4. Push: `docker push IMAGE_URL`
5. Redeploy application with new image
6. Verify: `gcloud container images scan IMAGE_URL --project=${var.project_id}`
    EOT
    mime_type = "text/markdown"
  }
  
  user_labels = merge(local.common_labels, {
    severity = "warning"
    category = "container-security"
  })
}

# Log-based metric for Binary Authorization denials
resource "google_logging_metric" "binary_authorization_denials" {
  count = var.enable_binary_authorization ? 1 : 0
  
  name   = "binary_authorization_denials"
  filter = "protoPayload.serviceName=\"binaryauthorization.googleapis.com\" AND protoPayload.authenticationInfo.principalEmail!=\"\" AND protoPayload.response.error.code!=0"
  
  label_extractors = {
    image_url    = "EXTRACT(protoPayload.request.image)"
    error_code   = "EXTRACT(protoPayload.response.error.code)"
    error_message = "EXTRACT(protoPayload.response.error.message)"
  }
  
  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "INT64"
    display_name = "Binary Authorization: Deployment Denials"
    
    labels {
      key         = "image_url"
      value_type  = "STRING"
      description = "Container image URL that was denied"
    }
    labels {
      key         = "error_code"
      value_type  = "STRING"
      description = "Error code for the denial"
    }
    labels {
      key         = "error_message"
      value_type  = "STRING"
      description = "Error message for the denial"
    }
  }
}

# Alert policy for Binary Authorization denials
resource "google_monitoring_alert_policy" "binary_authorization_denials" {
  count = var.enable_binary_authorization ? 1 : 0
  
  display_name = "Security: Binary Authorization Denials - ${title(var.environment)}"
  combiner     = "OR"
  enabled      = true
  
  conditions {
    display_name = "Container deployment denied by Binary Authorization"
    
    condition_monitoring_query_language {
      query = <<-EOT
        fetch logging.googleapis.com/user/${google_logging_metric.binary_authorization_denials[0].name}
        | align rate(1m)
        | group_by [resource.project_id], sum(value.${google_logging_metric.binary_authorization_denials[0].name})
        | condition gt(0)
      EOT
      
      duration = "60s"
      
      trigger {
        count = 1
      }
    }
  }
  
  notification_channels = [local.notification_channels.warning]
  
  alert_strategy {
    auto_close = "3600s"  # 1 hour
    
    notification_rate_limit {
      period = "1800s"  # 30 minutes
    }
  }
  
  documentation {
    content = <<-EOT
# Binary Authorization Deployment Denial

**Severity**: Warning
**Environment**: ${var.environment}

## Description
Container deployment was denied by Binary Authorization policy.

## Possible Causes
1. Container image lacks required attestation
2. Image contains HIGH/CRITICAL vulnerabilities
3. Image violates security policy requirements
4. Attestor configuration issues

## Actions Required
1. Review denied image details in logs
2. Check vulnerability scan results for the image
3. Ensure image has proper attestation
4. Update image if vulnerabilities found
5. Re-attest image after fixes

## Binary Authorization Console
[View Policies](https://console.cloud.google.com/security/binary-authorization/policy?project=${var.project_id})

## Container Analysis
[View Scans](https://console.cloud.google.com/gcr/images/${var.project_id}?project=${var.project_id})
    EOT
    mime_type = "text/markdown"
  }
  
  user_labels = merge(local.common_labels, {
    severity = "warning"
    category = "binary-authorization"
  })
}

# Scheduled vulnerability scanning (using Cloud Build)
resource "google_cloudbuild_trigger" "vulnerability_scan" {
  count = var.enable_container_analysis ? 1 : 0
  
  name        = "vulnerability-scan-${var.environment}"
  description = "Scheduled vulnerability scanning for container images"
  
  # Trigger on schedule (daily at 2 AM)
  trigger_template {
    branch_name = "main"
    repo_name   = "lottosmartpicker-gcp"  # Adjust to your repo name
  }
  
  # Alternative: Use Pub/Sub trigger for more flexible scheduling
  # pubsub_config {
  #   topic = google_pubsub_topic.vulnerability_scan_trigger[0].id
  # }
  
  build {
    step {
      name = "gcr.io/cloud-builders/gcloud"
      args = [
        "container", "images", "scan",
        "us-central1-docker.pkg.dev/${var.project_id}/app/lottosmartpicker:latest",
        "--project=${var.project_id}",
        "--format=json"
      ]
    }
    
    step {
      name = "gcr.io/cloud-builders/gcloud"
      args = [
        "logging", "write", "vulnerability-scan-results",
        "Vulnerability scan completed for lottosmartpicker:latest",
        "--severity=INFO",
        "--project=${var.project_id}"
      ]
    }
    
    options {
      logging = "CLOUD_LOGGING_ONLY"
    }
  }
  
  depends_on = [google_project_service.container_analysis]
}

# Cloud Scheduler job for regular vulnerability scanning
resource "google_cloud_scheduler_job" "vulnerability_scan_schedule" {
  count = var.enable_container_analysis ? 1 : 0
  
  name        = "vulnerability-scan-schedule-${var.environment}"
  description = "Daily vulnerability scanning schedule"
  schedule    = "0 2 * * *"  # Daily at 2 AM
  time_zone   = "America/New_York"
  
  http_target {
    http_method = "POST"
    uri         = "https://cloudbuild.googleapis.com/v1/projects/${var.project_id}/triggers/${google_cloudbuild_trigger.vulnerability_scan[0].trigger_id}:run"
    
    headers = {
      "Content-Type" = "application/json"
    }
    
    body = base64encode(jsonencode({
      branchName = "main"
    }))
    
    oauth_token {
      service_account_email = "${var.project_id}@appspot.gserviceaccount.com"
    }
  }
  
  depends_on = [google_project_service.container_analysis]
}

# Local values for scanning configuration
locals {
  scanning_config = {
    container_analysis_enabled    = var.enable_container_analysis
    binary_authorization_enabled = var.enable_binary_authorization
    vulnerability_note_name      = var.enable_container_analysis ? google_container_analysis_note.vulnerability_note[0].name : ""
    vulnerability_metric_name    = var.enable_container_analysis ? google_logging_metric.container_vulnerability_scans[0].name : ""
    scan_schedule_job_name       = var.enable_container_analysis ? google_cloud_scheduler_job.vulnerability_scan_schedule[0].name : ""
  }
}