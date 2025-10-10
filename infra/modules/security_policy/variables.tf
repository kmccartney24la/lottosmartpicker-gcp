variable "manage_security_policy" {
  description = "Whether to manage the Cloud Armor security policy"
  type        = bool
  default     = true
}

variable "labels" {
  description = "A map of labels to apply to the security policy"
  type        = map(string)
  default     = {}
}