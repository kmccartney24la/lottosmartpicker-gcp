# infra/modules/budget/outputs.tf
output "budget_name" {
  value = var.manage_budget ? google_billing_budget.project_budget[0].name : ""
}
