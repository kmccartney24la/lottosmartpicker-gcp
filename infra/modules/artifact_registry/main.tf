# infra/modules/artifact_registry/main.tf
resource "google_artifact_registry_repository" "repo" {
  for_each = toset(var.repos)
  project  = var.project_id
  location = var.region
  repository_id = each.value
  format   = "DOCKER"
  labels   = var.labels
}
