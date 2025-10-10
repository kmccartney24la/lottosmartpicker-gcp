# infra/modules/service_accounts/outputs.tf
output "run_sa_email" { value = google_service_account.run.email }
output "jobs_sa_email" { value = google_service_account.jobs.email }
output "ci_sa_email" { value = google_service_account.ci.email }
