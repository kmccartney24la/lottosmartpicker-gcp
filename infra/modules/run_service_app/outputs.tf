# infra/modules/run_service_app/outputs.tf
output "service_url" { value = google_cloud_run_v2_service.app.uri }
