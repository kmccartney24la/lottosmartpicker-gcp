# infra/modules/run_service_app/outputs.tf
output "service_url" {
  value = var.manage_run_service_app ? google_cloud_run_v2_service.app[0].uri : ""
}
