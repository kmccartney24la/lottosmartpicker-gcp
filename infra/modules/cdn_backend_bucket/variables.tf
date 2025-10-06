# infra/modules/cdn_backend_bucket/variables.tf
variable "project_id"       { type = string }
variable "data_bucket_name" { type = string }
variable "data_domain"      { type = string }

variable "labels" {
  type    = map(string)
  default = {}
}
