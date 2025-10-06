# infra/modules/run_jobs/outputs.tf
output "scheduler_sa_email" { value = google_service_account.scheduler_invoker.email }
