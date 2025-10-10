output "scheduler_invoker_email" {
  description = "The email of the Cloud Scheduler invoker service account"
  value       = google_service_account.scheduler_invoker.email
}
