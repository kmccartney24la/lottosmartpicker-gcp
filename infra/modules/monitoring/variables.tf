# infra/modules/monitoring/variables.tf
variable "project_id" { type = string }
variable "region" { type = string }
variable "app_domain" { type = string }
variable "data_domain" { type = string }
variable "bucket_name" { type = string }

variable "labels" {
  type    = map(string)
  default = {}
}
