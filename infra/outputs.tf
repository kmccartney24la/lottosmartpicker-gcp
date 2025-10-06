# infra/outputs.tf
output "app_url"       { value = module.run_service_app.service_url }
output "app_domain"    { value = var.app_domain }
output "data_domain"   { value = var.data_domain }
output "cdn_ip"        { value = module.cdn_backend_bucket.global_ip_address }
output "bucket_name"   { value = module.gcs_buckets.data_bucket_name }
output "ci_provider_audience" { value = module.wif_github.provider_audience }
