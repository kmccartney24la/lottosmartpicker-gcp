# infra/modules/run_service_app/variables.tf
variable "project_id" { type = string }
variable "region" { type = string }
variable "env" { type = string }
variable "service_name" { type = string }
variable "service_account_email" { type = string }

variable "manage_run_service_app" {
  type        = bool
  description = "Whether to manage the Cloud Run service app resource."
}

variable "env_vars" {
  type    = map(string)
  default = {}
}

variable "labels" {
  type    = map(string)
  default = {}
}

variable "allow_unauthenticated" {
  type    = bool
  default = true
}

variable "enable_request_logging" {
  type    = bool
  default = true
}

variable "domain" {
  type    = string
  default = ""
}
