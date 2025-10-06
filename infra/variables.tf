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
  type    = string
  default = "30 9 * * 1"
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
