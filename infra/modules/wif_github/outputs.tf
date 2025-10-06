# infra/modules/wif_github/outputs.tf
output "provider_audience" {
  value = "projects/${data.google_project.proj.number}/locations/global/workloadIdentityPools/${google_iam_workload_identity_pool.pool.workload_identity_pool_id}/providers/${google_iam_workload_identity_pool_provider.provider.workload_identity_pool_provider_id}"

  # helper
}
data "google_project" "proj" {}
