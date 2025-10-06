# infra/modules/wif_github/main.tf
resource "google_iam_workload_identity_pool" "pool" {
  workload_identity_pool_id = "github-pool"
  display_name              = "GitHub Actions"
  description               = "OIDC from GitHub Actions"
}

resource "google_iam_workload_identity_pool_provider" "provider" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.pool.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub"
  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.workflow"   = "assertion.workflow"
    "attribute.ref"        = "assertion.ref"
  }
  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# Allow the GitHub repo to impersonate CI SA
resource "google_service_account_iam_member" "ci_wi_user" {
  service_account_id = "projects/${var.project_id}/serviceAccounts/${var.ci_service_account}"
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.pool.name}/attribute.repository/${var.github_repo}"
}

# CI needs to actAs runtime/job SAs
resource "google_service_account_iam_member" "ci_can_actas_run" {
  service_account_id = "projects/${var.project_id}/serviceAccounts/${var.run_service_account}"
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${var.ci_service_account}"
}
resource "google_service_account_iam_member" "ci_can_actas_jobs" {
  service_account_id = "projects/${var.project_id}/serviceAccounts/${var.jobs_service_account}"
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${var.ci_service_account}"
}
