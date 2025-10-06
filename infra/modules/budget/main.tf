# infra/modules/budget/main.tf
resource "google_billing_budget" "project_budget" {
  billing_account = var.billing_account_id
  display_name    = "LSP ${var.project_id} Budget"

  budget_filter {
    projects = ["projects/${var.project_id}"]
  }

  amount {
    specified_amount {
      currency_code = "USD"
      units         = "200"  # Example monthly cap
    }
  }

  # Email thresholds
  threshold_rules { threshold_percent = 0.5 }
  threshold_rules { threshold_percent = 0.9 }
  threshold_rules { threshold_percent = 1.0 }

  # NOTE:
  # We omitted "all_updates_rule" so GCP sends default billing emails
  # to billing admins/owners. If later you want custom email/SMS,
  # we’ll add a google_monitoring_notification_channel and reference it.
}
