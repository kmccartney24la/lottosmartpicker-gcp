# infra/modules/security_monitoring/notification_channels.tf
# Notification channels for security alerts

# Primary email notification channel for all security alerts
resource "google_monitoring_notification_channel" "security_email" {
  display_name = "Security Alerts Email - ${title(var.environment)}"
  type         = "email"

  labels = {
    email_address = var.security_notification_email
  }

  enabled = true

  user_labels = local.common_labels

  description = "Primary email notification channel for security alerts in ${var.environment} environment"
}

# Critical security alerts notification channel (same email, different channel for routing)
resource "google_monitoring_notification_channel" "security_critical_email" {
  display_name = "Critical Security Alerts - ${title(var.environment)}"
  type         = "email"

  labels = {
    email_address = var.security_notification_email
  }

  enabled = true

  user_labels = merge(local.common_labels, {
    severity = "critical"
  })

  description = "Critical security alerts requiring immediate attention in ${var.environment} environment"
}

# Warning security alerts notification channel
resource "google_monitoring_notification_channel" "security_warning_email" {
  display_name = "Warning Security Alerts - ${title(var.environment)}"
  type         = "email"

  labels = {
    email_address = var.security_notification_email
  }

  enabled = true

  user_labels = merge(local.common_labels, {
    severity = "warning"
  })

  description = "Warning security alerts for monitoring in ${var.environment} environment"
}

# Pub/Sub topic for programmatic alert processing (optional future use)
resource "google_pubsub_topic" "security_alerts" {
  name = "security-alerts-${var.environment}"

  labels = local.common_labels

  message_retention_duration = "604800s" # 7 days
}

resource "google_pubsub_subscription" "security_alerts" {
  name  = "security-alerts-subscription-${var.environment}"
  topic = google_pubsub_topic.security_alerts.name

  labels = local.common_labels

  # Configure message retention
  message_retention_duration = "604800s" # 7 days
  retain_acked_messages      = false

  # Configure acknowledgment deadline
  ack_deadline_seconds = 300 # 5 minutes

  # Configure dead letter policy
  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.security_alerts_dlq.id
    max_delivery_attempts = 5
  }

  # Configure retry policy
  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }
}

# Dead letter queue for failed alert processing
resource "google_pubsub_topic" "security_alerts_dlq" {
  name = "security-alerts-dlq-${var.environment}"

  labels = merge(local.common_labels, {
    purpose = "dead-letter-queue"
  })

  message_retention_duration = "604800s" # 7 days
}

# Pub/Sub notification channel (for future programmatic processing)
resource "google_monitoring_notification_channel" "security_pubsub" {
  display_name = "Security Alerts Pub/Sub - ${title(var.environment)}"
  type         = "pubsub"

  labels = {
    topic = google_pubsub_topic.security_alerts.id
  }

  enabled = true

  user_labels = merge(local.common_labels, {
    type = "programmatic"
  })

  description = "Pub/Sub channel for programmatic security alert processing in ${var.environment} environment"
}

# Output notification channel IDs for use in alert policies
locals {
  notification_channels = {
    critical = google_monitoring_notification_channel.security_critical_email.name
    warning  = google_monitoring_notification_channel.security_warning_email.name
    general  = google_monitoring_notification_channel.security_email.name
    pubsub   = google_monitoring_notification_channel.security_pubsub.name
  }
}