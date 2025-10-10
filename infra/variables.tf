# infra/variables.tf
variable "env" {
  type = string
}

variable "project_id" {
  type = string
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "billing_account_id" {
  type = string
}

variable "labels" {
  type    = map(string)
  default = {}
}

# Domains
variable "app_domain" {
  type = string
}

variable "data_domain" {
  type = string
}

# Buckets (data)
variable "data_bucket_name" {
  type = string
}

variable "cors_allowed_origins" {
  type    = list(string)
  default = []
}

# CI/WIF
variable "github_repo" {
  type = string # "ORG/REPO"
}

variable "ci_service_account_id" {
  type    = string
  default = "lsp-ci"
}

variable "run_service_account_id" {
  type    = string
  default = "lsp-run"
}

variable "jobs_service_account_id" {
  type    = string
  default = "lsp-jobs"
}

# Artifact Registry
variable "ar_repos" {
  type    = list(string)
  default = ["app", "jobs"]
}

# Schedules (cron in America/New_York)
variable "cron_csvs" {
  type    = string
  default = "0 5 * * *"
}

variable "cron_scratchers" {
  type    = list(string)
  default = ["30 9 * * 1"]
}

# Budget email(s)
variable "budget_notification_emails" {
  type    = list(string)
  default = ["YOUR_NOTIFICATION_EMAIL@example.com"]
}

# Optional trace labels
variable "enable_request_logging_labels" {
  type    = bool
  default = true
}

# Security monitoring variables
variable "security_notification_email" {
  description = "Email address for security alert notifications"
  type        = string
  default     = ""
}

variable "organization_id" {
  description = "Google Cloud Organization ID for Security Command Center"
  type        = string
  default     = ""
}

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

# Critical Priority Action: Add missing variables for security monitoring
variable "rate_limit_alert_threshold" {
  description = "Threshold for rate limit alerts"
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
  description = "Threshold for request size alerts"
  type        = number
  default     = 20
}

variable "ua_block_alert_threshold" {
  description = "Threshold for User-Agent block alerts"
  type        = number
  default     = 50
}

variable "project_number" {
  description = "Google Cloud Project Number"
  type        = string
  default     = "79993353094"
}

# Medium Priority Action: Add manage_* variables for conditional resource management
variable "manage_run_service_app" {
  description = "Enable management of the main Cloud Run service application"
  type        = bool
  default     = true
}

variable "manage_run_jobs" {
  description = "Enable management of Cloud Run jobs"
  type        = bool
  default     = true
}

variable "manage_gcs_buckets" {
  description = "Enable management of GCS buckets"
  type        = bool
  default     = true
}

variable "manage_budget" {
  description = "Enable management of the GCP budget"
  type        = bool
  default     = true
}

variable "manage_wif_github" {
  description = "Enable management of Workload Identity Federation for GitHub"
  type        = bool
  default     = true
}

variable "manage_monitoring" {
  description = "Enable management of general monitoring resources"
  type        = bool
  default     = true
}

variable "manage_security_monitoring" {
  description = "Enable management of security monitoring resources"
  type        = bool
  default     = true
}

# High Priority Action: Add missing variables for new features
variable "manage_scratchers_web" {
  description = "Enable management of scratchers web features"
  type        = bool
  default     = false
}

variable "manage_security_policy" {
  description = "Whether to manage the Cloud Armor security policy"
  type        = bool
  default     = true
}

variable "manage_dns" {
  description = "Whether to manage the DNS zone"
  type        = bool
  default     = false
}

variable "manage_seed_socrata" {
  description = "Enable management of Socrata seed data"
  type        = bool
  default     = false
}
