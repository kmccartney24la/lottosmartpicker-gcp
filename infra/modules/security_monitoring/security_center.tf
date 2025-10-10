# infra/modules/security_monitoring/security_center.tf
# Security Command Center configuration

# Security Command Center notification config (only if organization_id is provided)
resource "google_scc_notification_config" "security_findings" {
  count = var.enable_security_command_center && var.organization_id != "" ? 1 : 0

  config_id    = "security-findings-${var.environment}"
  organization = var.organization_id
  description  = "Security findings notification for LottoSmartPicker ${var.environment} environment"

  pubsub_topic = google_pubsub_topic.security_findings[0].id

  streaming_config {
    filter = "state=\"ACTIVE\" AND (category=\"VULNERABILITY\" OR category=\"MALWARE\" OR category=\"SUSPICIOUS_ACTIVITY\")"
  }

  depends_on = [google_project_service.security_center]
}

# Pub/Sub topic for security findings (only if Security Command Center is enabled)
resource "google_pubsub_topic" "security_findings" {
  count = var.enable_security_command_center && var.organization_id != "" ? 1 : 0

  name = "security-findings-${var.environment}"

  labels = merge(local.common_labels, {
    purpose = "security-findings"
  })

  message_retention_duration = "604800s" # 7 days

  depends_on = [google_project_service.security_center]
}

# Subscription for processing security findings
resource "google_pubsub_subscription" "security_findings" {
  count = var.enable_security_command_center && var.organization_id != "" ? 1 : 0

  name  = "security-findings-subscription-${var.environment}"
  topic = google_pubsub_topic.security_findings[0].name

  labels = merge(local.common_labels, {
    purpose = "security-findings-processing"
  })

  # Configure message retention
  message_retention_duration = "604800s" # 7 days
  retain_acked_messages      = false

  # Configure acknowledgment deadline
  ack_deadline_seconds = 300 # 5 minutes

  # Configure dead letter policy
  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.security_findings_dlq[0].id
    max_delivery_attempts = 5
  }

  # Configure retry policy
  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }

  # Configure push delivery (optional - for webhook processing)
  # push_config {
  #   push_endpoint = "https://your-webhook-endpoint.com/security-findings"
  #   
  #   attributes = {
  #     x-goog-version = "v1"
  #   }
  # }
}

# Dead letter queue for failed security findings processing
resource "google_pubsub_topic" "security_findings_dlq" {
  count = var.enable_security_command_center && var.organization_id != "" ? 1 : 0

  name = "security-findings-dlq-${var.environment}"

  labels = merge(local.common_labels, {
    purpose = "dead-letter-queue"
    source  = "security-findings"
  })

  message_retention_duration = "604800s" # 7 days
}

# Log sink for Security Command Center findings (export to Cloud Logging)
resource "google_logging_project_sink" "security_findings_sink" {
  count = var.enable_security_command_center && var.organization_id != "" ? 1 : 0

  name        = "security-findings-sink-${var.environment}"
  destination = "pubsub.googleapis.com/${google_pubsub_topic.security_findings[0].id}"

  # Filter for Security Command Center findings
  filter = <<-EOT
    protoPayload.serviceName="securitycenter.googleapis.com"
    AND (
      protoPayload.methodName="google.cloud.securitycenter.v1.SecurityCenter.CreateFinding"
      OR protoPayload.methodName="google.cloud.securitycenter.v1.SecurityCenter.UpdateFinding"
    )
  EOT

  # Use a unique writer identity
  unique_writer_identity = true
}

# IAM binding for the log sink to publish to Pub/Sub
resource "google_pubsub_topic_iam_binding" "security_findings_publisher" {
  count = var.enable_security_command_center && var.organization_id != "" ? 1 : 0

  topic = google_pubsub_topic.security_findings[0].name
  role  = "roles/pubsub.publisher"

  members = [
    google_logging_project_sink.security_findings_sink[0].writer_identity,
  ]
}

# Alert policy for Security Command Center findings
resource "google_monitoring_alert_policy" "security_command_center_findings" {
  count = var.enable_security_command_center && var.organization_id != "" ? 1 : 0

  display_name = "Security: Command Center Findings - ${title(var.environment)}"
  combiner     = "OR"
  enabled      = true

  conditions {
    display_name = "New security findings detected"

    condition_monitoring_query_language {
      query = <<-EOT
        fetch pubsub_topic
        | filter (resource.topic_id == "${google_pubsub_topic.security_findings[0].name}")
        | metric 'pubsub.googleapis.com/topic/send_message_operation_count'
        | align rate(5m)
        | group_by [resource.project_id], sum(value.send_message_operation_count)
        | condition gt(0)
      EOT

      duration = "300s" # 5 minutes

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [local.notification_channels.warning]

  alert_strategy {
    auto_close = "3600s" # 1 hour

    notification_rate_limit {
      period = "1800s" # 30 minutes
    }
  }

  documentation {
    content   = <<-EOT
# Security Command Center Findings Detected

**Severity**: Warning
**Environment**: ${var.environment}

## Description
New security findings have been detected by Security Command Center.

## Actions Required
1. Review findings in Security Command Center console
2. Assess severity and impact of findings
3. Plan remediation for HIGH and CRITICAL findings
4. Update security policies if needed

## Security Command Center Console
[View Findings](https://console.cloud.google.com/security/command-center/findings?project=${var.project_id})

## Pub/Sub Topic
Topic: ${google_pubsub_topic.security_findings[0].name}
Subscription: ${google_pubsub_subscription.security_findings[0].name}
    EOT
    mime_type = "text/markdown"
  }

  user_labels = merge(local.common_labels, {
    severity = "warning"
    category = "security-command-center"
  })
}

# Log-based metric for Security Command Center findings
resource "google_logging_metric" "security_command_center_findings" {
  count = var.enable_security_command_center && var.organization_id != "" ? 1 : 0

  name   = "security_command_center_findings"
  filter = "protoPayload.serviceName=\"securitycenter.googleapis.com\" AND protoPayload.methodName=\"google.cloud.securitycenter.v1.SecurityCenter.CreateFinding\""

  label_extractors = {
    finding_category = "EXTRACT(protoPayload.request.finding.category)"
    severity         = "EXTRACT(protoPayload.request.finding.severity)"
    source_id        = "EXTRACT(protoPayload.request.finding.sourceProperties.source_id)"
  }

  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "INT64"
    display_name = "Security Command Center: New Findings"

    labels {
      key         = "finding_category"
      value_type  = "STRING"
      description = "Category of the security finding"
    }
    labels {
      key         = "severity"
      value_type  = "STRING"
      description = "Severity of the security finding"
    }
    labels {
      key         = "source_id"
      value_type  = "STRING"
      description = "Source ID of the security finding"
    }
  }
}

# Custom Security Command Center source (for application-specific findings)
resource "google_scc_source" "application_security" {
  count = var.enable_security_command_center && var.organization_id != "" ? 1 : 0

  organization = var.organization_id
  display_name = "LottoSmartPicker Application Security - ${title(var.environment)}"
  description  = "Custom security findings from LottoSmartPicker application monitoring"

  depends_on = [google_project_service.security_center]
}

# IAM binding for Security Command Center findings editor (for custom findings)
resource "google_organization_iam_member" "security_findings_editor" {
  count = var.enable_security_command_center && var.organization_id != "" ? 1 : 0

  org_id = var.organization_id
  role   = "roles/securitycenter.findingsEditor"
  member = "serviceAccount:${var.project_id}@appspot.gserviceaccount.com"
}

# Output Security Command Center information
locals {
  security_command_center_info = var.enable_security_command_center && var.organization_id != "" ? {
    notification_config_id = google_scc_notification_config.security_findings[0].name
    pubsub_topic           = google_pubsub_topic.security_findings[0].name
    pubsub_subscription    = google_pubsub_subscription.security_findings[0].name
    custom_source_name     = google_scc_source.application_security[0].name
    findings_metric        = google_logging_metric.security_command_center_findings[0].name
  } : {}
}