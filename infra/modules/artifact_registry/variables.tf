# infra/modules/artifact_registry/variables.tf
variable "project_id" { type = string }
variable "region"     { type = string }
variable "repos"      { type = list(string) }

variable "labels" {
  type    = map(string)
  default = {}
}
