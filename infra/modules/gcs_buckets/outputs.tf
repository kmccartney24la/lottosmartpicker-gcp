# infra/modules/gcs_buckets/outputs.tf
output "data_bucket_name" { value = google_storage_bucket.data.name }
