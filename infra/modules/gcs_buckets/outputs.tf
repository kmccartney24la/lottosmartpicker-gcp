# infra/modules/gcs_buckets/outputs.tf
output "data_bucket_name" {
  value = var.manage_gcs_buckets ? google_storage_bucket.data[0].name : ""
}
