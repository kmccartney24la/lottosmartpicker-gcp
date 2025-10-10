# infra/modules/gcs_buckets/variables.tf
variable "project_id" { type = string }
variable "data_bucket_name" { type = string }
variable "cors_allowed_origins" { type = list(string) }

variable "manage_gcs_buckets" {
  type        = bool
  description = "Whether to manage the GCS buckets resource."
}

variable "labels" {
  type    = map(string)
  default = {}
}

# NEW: optional, lets the root pass the jobs SA for bucket-scoped objectAdmin
variable "jobs_sa_email" {
  type    = string
  default = ""
}