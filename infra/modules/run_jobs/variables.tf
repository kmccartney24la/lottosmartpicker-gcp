# infra/modules/run_jobs/variables.tf
variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "env" {
  type = string
}

variable "jobs_service_account" {
  type = string
}

variable "data_bucket_name" {
  type = string
}

variable "public_base_url" {
  type = string
}

variable "secret_socrata_token" {
  type = string
}

variable "cron_csvs" {
  type = string
}

variable "cron_scratchers" {
  type = string
}

variable "labels" {
  type    = map(string)
  default = {}
}
