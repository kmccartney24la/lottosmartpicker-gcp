# infra/modules/cdn_backend_bucket/outputs.tf
output "global_ip_address" { value = google_compute_global_address.ip.address }
