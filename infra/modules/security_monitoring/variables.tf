# infra/modules/security_monitoring/variables.tf
# Variables for Security Monitoring Module

variable "project_id" {
  description = "Google Cloud Project ID"
  type        = string
}

variable "region" {
  description = "Google Cloud Region"
  type        = string
  default     = "us-central1"
}

variable "security_notification_email" {
  description = "Email address for security alert notifications"
  type        = string
}

variable "organization_id" {
  description = "Google Cloud Organization ID for Security Command Center"
  type        = string
  default     = ""
}

variable "environment" {
  description = "Environment name (prod, staging, dev)"
  type        = string
}

variable "labels" {
  description = "Labels to apply to all resources"
  type        = map(string)
  default     = {}
}

# Alert thresholds (configurable per environment)
variable "rate_limit_alert_threshold" {
  description = "Threshold for rate limit violation alerts"
  type        = number
  default     = 50
}

variable "csrf_failure_alert_threshold" {
  description = "Threshold for CSRF failure alerts"
  type        = number
  default     = 10
}

variable "security_events_alert_threshold" {
  description = "Threshold for general security events alerts"
  type        = number
  default     = 100
}

variable "request_size_alert_threshold" {
  description = "Threshold for request size violation alerts"
  type        = number
  default     = 20
}

variable "ua_block_alert_threshold" {
  description = "Threshold for blocked user agent alerts"
  type        = number
  default     = 50
}

# Log retention settings
variable "security_log_retention_days" {
  description = "Number of days to retain security logs"
  type        = number
  default     = 90
}

variable "audit_log_retention_days" {
  description = "Number of days to retain audit logs"
  type        = number
  default     = 365
}

# Dashboard settings
variable "dashboard_refresh_interval" {
  description = "Dashboard refresh interval in seconds"
  type        = number
  default     = 60
}

# Security Command Center settings
variable "enable_security_command_center" {
  description = "Enable Security Command Center integration"
  type        = bool
  default     = true
}

variable "enable_container_analysis" {
  description = "Enable Container Analysis for vulnerability scanning"
  type        = bool
  default     = true
}

variable "enable_binary_authorization" {
  description = "Enable Binary Authorization for container security"
  type        = bool
  default     = false
}

# Alert auto-close settings
variable "alert_auto_close_duration" {
  description = "Duration after which alerts auto-close (in seconds)"
  type        = string
  default     = "1800s" # 30 minutes
}

# Notification settings
variable "critical_alert_delay" {
  description = "Delay for critical alerts (in seconds)"
  type        = string
  default     = "0s"
}

variable "warning_alert_delay" {
  description = "Delay for warning alerts (in seconds)"
  type        = string
  default     = "900s" # 15 minutes
}

variable "manage_security_monitoring" {
  description = "Whether to manage the security monitoring resources."
  type        = bool
  default     = true
}