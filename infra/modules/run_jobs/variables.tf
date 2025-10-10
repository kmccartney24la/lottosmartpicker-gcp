# infra/modules/run_jobs/variables.tf
variable "project_id" { type = string }
variable "region" { type = string }
variable "env" { type = string }
variable "jobs_service_account" { type = string }
variable "data_bucket_name" { type = string }
variable "public_base_url" { type = string }
variable "secret_socrata_token" { type = string }

variable "cron_csvs" {
  type    = list(string)
  default = []
}

variable "cron_scratchers" {
  type    = list(string)
  default = []
}

variable "labels" {
  type    = map(string)
  default = {}
}

variable "manage_run_jobs" {
  description = "Whether to create Cloud Run Jobs in this module"
  type        = bool
  default     = false
}
