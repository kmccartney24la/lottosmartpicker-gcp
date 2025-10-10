# infra/modules/service_accounts/variables.tf
variable "project_id" { type = string }
variable "run_service_account_id" { type = string }
variable "jobs_service_account_id" { type = string }
variable "ci_service_account_id" { type = string }

variable "labels" {
  type    = map(string)
  default = {}
}
