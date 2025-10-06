# infra/modules/budget/outputs.tf
output "budget_name" {
  value = google_billing_budget.project_budget.name
}
