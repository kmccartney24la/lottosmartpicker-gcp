variable "enabled" {
  description = "Create the data.* CDN/LB? Leave false (deprecated)."
  type        = bool
  default     = false
}

variable "data_bucket_name" {
  description = "(Deprecated) GCS bucket used by the backend bucket."
  type        = string
}

variable "data_domain" {
  description = "(Deprecated) Domain for managed cert (e.g. data.lottosmartpicker.com)."
  type        = string
}
