# infra/modules/budget/variables.tf
variable "project_id" { type = string }
variable "billing_account_id" { type = string }
variable "notification_emails" { type = list(string) }

variable "manage_budget" {
  type        = bool
  description = "Whether to manage the budget resource."
}

variable "labels" {
  type    = map(string)
  default = {}
}
