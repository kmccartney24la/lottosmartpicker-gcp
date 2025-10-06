# infra/modules/security_monitoring/outputs.tf
# Outputs for security monitoring module

# Notification Channels
output "notification_channels" {
  description = "Security notification channels"
  value = {
    critical = google_monitoring_notification_channel.security_critical_email.name
    warning  = google_monitoring_notification_channel.security_warning_email.name
    general  = google_monitoring_notification_channel.security_email.name
    pubsub   = google_monitoring_notification_channel.security_pubsub.name
  }
}

# Log-based Metrics
output "security_metrics" {
  description = "Security log-based metrics"
  value = {
    rate_limit_violations = google_logging_metric.security_rate_limit_violations.name
    csrf_failures         = google_logging_metric.security_csrf_failures.name
    csrf_rotations        = google_logging_metric.security_csrf_rotations.name
    session_anomalies     = google_logging_metric.security_session_anomalies.name
    access_violations     = google_logging_metric.security_access_violations.name
    request_violations    = google_logging_metric.security_request_violations.name
    successful_events     = google_logging_metric.security_successful_events.name
    all_events           = google_logging_metric.security_all_events.name
  }
}

# Alert Policies
output "alert_policies" {
  description = "Security alert policies"
  value = {
    rate_limit_violations = google_monitoring_alert_policy.security_high_rate_limit_violations.name
    csrf_attack_pattern   = google_monitoring_alert_policy.security_csrf_attack_pattern.name
    session_hijacking     = google_monitoring_alert_policy.security_session_hijacking.name
    elevated_events       = google_monitoring_alert_policy.security_elevated_events.name
    request_violations    = google_monitoring_alert_policy.security_request_size_violations.name
    ua_block_pattern      = google_monitoring_alert_policy.security_ua_block_pattern.name
    container_vulnerabilities = var.enable_container_analysis ? google_monitoring_alert_policy.security_container_vulnerabilities[0].name : ""
  }
}

# Dashboards
output "dashboards" {
  description = "Security monitoring dashboards"
  value = {
    main_dashboard   = google_monitoring_dashboard.security_overview.id
    mobile_dashboard = google_monitoring_dashboard.security_mobile.id
    main_url        = "https://console.cloud.google.com/monitoring/dashboards/custom/${google_monitoring_dashboard.security_overview.id}?project=${var.project_id}"
    mobile_url      = "https://console.cloud.google.com/monitoring/dashboards/custom/${google_monitoring_dashboard.security_mobile.id}?project=${var.project_id}"
  }
}

# Security Command Center
output "security_command_center" {
  description = "Security Command Center configuration"
  value = var.enable_security_command_center && var.organization_id != "" ? {
    notification_config_id = google_scc_notification_config.security_findings[0].name
    pubsub_topic          = google_pubsub_topic.security_findings[0].name
    pubsub_subscription   = google_pubsub_subscription.security_findings[0].name
    custom_source_name    = google_scc_source.application_security[0].name
    findings_metric       = google_logging_metric.security_command_center_findings[0].name
  } : {}
}

# Pub/Sub Topics
output "pubsub_topics" {
  description = "Pub/Sub topics for security monitoring"
  value = {
    security_alerts = google_pubsub_topic.security_alerts.name
    security_alerts_dlq = google_pubsub_topic.security_alerts_dlq.name
    security_findings = var.enable_security_command_center && var.organization_id != "" ? google_pubsub_topic.security_findings[0].name : ""
    security_findings_dlq = var.enable_security_command_center && var.organization_id != "" ? google_pubsub_topic.security_findings_dlq[0].name : ""
  }
}

# Container Analysis
output "container_analysis" {
  description = "Container analysis configuration"
  value = var.enable_container_analysis ? {
    vulnerability_note_name = google_container_analysis_note.vulnerability_note[0].name
    vulnerability_metric    = google_logging_metric.container_vulnerability_scans[0].name
    scan_schedule_job      = google_cloud_scheduler_job.vulnerability_scan_schedule[0].name
    critical_alert_policy  = google_monitoring_alert_policy.container_vulnerabilities_critical[0].name
  } : {}
}

# Binary Authorization
output "binary_authorization" {
  description = "Binary Authorization configuration"
  value = var.enable_binary_authorization ? {
    policy_name           = google_binary_authorization_policy.security_policy[0].name
    attestor_name         = google_binary_authorization_attestor.security_attestor[0].name
    denials_metric        = google_logging_metric.binary_authorization_denials[0].name
    denials_alert_policy  = google_monitoring_alert_policy.binary_authorization_denials[0].name
  } : {}
}

# Alert Thresholds (for reference)
output "alert_thresholds" {
  description = "Configured alert thresholds"
  value = {
    rate_limit_violations = local.alert_thresholds.rate_limit_violations
    csrf_failures         = local.alert_thresholds.csrf_failures
    security_events       = local.alert_thresholds.security_events
    request_size_violations = var.request_size_alert_threshold
    ua_block_violations   = var.ua_block_alert_threshold
  }
}

# Configuration Summary
output "configuration_summary" {
  description = "Security monitoring configuration summary"
  value = {
    environment                   = var.environment
    project_id                   = var.project_id
    security_notification_email = var.security_notification_email
    security_command_center_enabled = var.enable_security_command_center && var.organization_id != ""
    container_analysis_enabled  = var.enable_container_analysis
    binary_authorization_enabled = var.enable_binary_authorization
    dashboard_refresh_interval   = var.dashboard_refresh_interval
    alert_auto_close_duration   = var.alert_auto_close_duration
    security_log_retention_days = var.security_log_retention_days
    audit_log_retention_days    = var.audit_log_retention_days
  }
}

# URLs for quick access
output "quick_access_urls" {
  description = "Quick access URLs for security monitoring"
  value = {
    security_dashboard = "https://console.cloud.google.com/monitoring/dashboards/custom/${google_monitoring_dashboard.security_overview.id}?project=${var.project_id}"
    mobile_dashboard   = "https://console.cloud.google.com/monitoring/dashboards/custom/${google_monitoring_dashboard.security_mobile.id}?project=${var.project_id}"
    alert_policies     = "https://console.cloud.google.com/monitoring/alerting/policies?project=${var.project_id}"
    security_logs      = "https://console.cloud.google.com/logs/query;query=jsonPayload.level%3D%22SECURITY%22?project=${var.project_id}"
    security_command_center = var.enable_security_command_center && var.organization_id != "" ? "https://console.cloud.google.com/security/command-center/findings?project=${var.project_id}" : ""
    container_analysis = var.enable_container_analysis ? "https://console.cloud.google.com/gcr/images/${var.project_id}?project=${var.project_id}" : ""
    binary_authorization = var.enable_binary_authorization ? "https://console.cloud.google.com/security/binary-authorization/policy?project=${var.project_id}" : ""
  }
}

# Monitoring Health Check
output "monitoring_health" {
  description = "Monitoring system health indicators"
  value = {
    total_alert_policies = length([
      google_monitoring_alert_policy.security_high_rate_limit_violations.name,
      google_monitoring_alert_policy.security_csrf_attack_pattern.name,
      google_monitoring_alert_policy.security_session_hijacking.name,
      google_monitoring_alert_policy.security_elevated_events.name,
      google_monitoring_alert_policy.security_request_size_violations.name,
      google_monitoring_alert_policy.security_ua_block_pattern.name
    ]) + (var.enable_container_analysis ? 1 : 0) + (var.enable_binary_authorization ? 1 : 0) + (var.enable_security_command_center && var.organization_id != "" ? 1 : 0)
    
    total_log_metrics = length([
      google_logging_metric.security_rate_limit_violations.name,
      google_logging_metric.security_csrf_failures.name,
      google_logging_metric.security_csrf_rotations.name,
      google_logging_metric.security_session_anomalies.name,
      google_logging_metric.security_access_violations.name,
      google_logging_metric.security_request_violations.name,
      google_logging_metric.security_successful_events.name,
      google_logging_metric.security_all_events.name
    ]) + (var.enable_container_analysis ? 1 : 0) + (var.enable_binary_authorization ? 1 : 0) + (var.enable_security_command_center && var.organization_id != "" ? 1 : 0)
    
    total_notification_channels = 4  # critical, warning, general, pubsub
    total_dashboards = 2  # main, mobile
    
    apis_enabled = [
      "securitycenter.googleapis.com",
      "containeranalysis.googleapis.com", 
      "binaryauthorization.googleapis.com",
      "monitoring.googleapis.com",
      "logging.googleapis.com"
    ]
  }
}