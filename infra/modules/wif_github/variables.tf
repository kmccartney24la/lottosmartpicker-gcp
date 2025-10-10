# infra/modules/wif_github/variables.tf
variable "project_id" { type = string }
variable "github_repo" { type = string }
variable "ci_service_account" { type = string }
variable "run_service_account" { type = string }
variable "jobs_service_account" { type = string }

variable "labels" {
  type    = map(string)
  default = {}
}
