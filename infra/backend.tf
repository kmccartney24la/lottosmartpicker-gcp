# infra/backend.tf  (create this file)
terraform {
  backend "gcs" {
    bucket = "lsp-tfstate-prod"   # for prod runs
    prefix = "terraform/state"
  }
}
