# infra/outputs.tf
output "app_url" {
  value = var.manage_run_service_app ? module.run_service_app[0].service_url : ""
}
output "app_domain" { value = var.app_domain }
output "data_domain" { value = var.data_domain }
output "cdn_ip" { value = module.cdn_backend_bucket.global_ip_address }
output "bucket_name" {
  value = var.manage_gcs_buckets ? module.gcs_buckets[0].data_bucket_name : ""
}
output "ci_provider_audience" {
  value = var.manage_wif_github ? module.wif_github[0].provider_audience : ""
}
