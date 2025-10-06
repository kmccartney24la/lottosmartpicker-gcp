# infra/modules/artifact_registry/outputs.tf
output "repositories" {
  value = { for k, v in google_artifact_registry_repository.repo : k => v.name }
}
