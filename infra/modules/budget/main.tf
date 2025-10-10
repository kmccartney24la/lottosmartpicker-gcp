# infra/modules/budget/main.tf
resource "google_billing_budget" "project_budget" {
  count           = var.manage_budget ? 1 : 0
  billing_account = var.billing_account_id
  display_name    = "LSP ${var.project_id} Budget"

  budget_filter {
    projects = ["projects/${var.project_id}"]
  }

  amount {
    specified_amount {
      currency_code = "USD"
      units         = "60" # High Priority Action: Update budget amount from $200 to $60 USD
    }
  }

  # Email thresholds
  threshold_rules { threshold_percent = 0.5 }
  threshold_rules { threshold_percent = 0.9 }
  threshold_rules { threshold_percent = 1.0 }
  threshold_rules { threshold_percent = 1.5 } # High Priority Action: Add 150% threshold rule to match actual configuration

  # NOTE:
  # We omitted "all_updates_rule" so GCP sends default billing emails
  # to billing admins/owners. If later you want custom email/SMS,
  # we’ll add a google_monitoring_notification_channel and reference it.
}
