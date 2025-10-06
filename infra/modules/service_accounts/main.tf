# infra/modules/service_accounts/main.tf
resource "google_service_account" "run" {
  account_id   = var.run_service_account_id
  display_name = "LottoSmartPicker App Runtime"
}

resource "google_service_account" "jobs" {
  account_id   = var.jobs_service_account_id
  display_name = "LottoSmartPicker Jobs Runtime"
}

resource "google_service_account" "ci" {
  account_id   = var.ci_service_account_id
  display_name = "LottoSmartPicker CI (GitHub OIDC)"
}

# IAM: runtime (app)
resource "google_project_iam_member" "run_sm_access" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.run.email}"
}

resource "google_project_iam_member" "run_obj_view" {
  project = var.project_id
  role    = "roles/storage.objectViewer"
  member  = "serviceAccount:${google_service_account.run.email}"
}

# IAM: jobs (scoped bucket admin set in gcs module output)
# roles/secretmanager.secretAccessor
resource "google_project_iam_member" "jobs_sm_access" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.jobs.email}"
}

# IAM: CI deploy
resource "google_project_iam_member" "ci_ar_writer" {
  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.ci.email}"
}

resource "google_project_iam_member" "ci_run_admin" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.ci.email}"
}

resource "google_project_iam_member" "ci_sa_user_run" {
  project = var.project_id
  role    = "roles/iam.serviceAccountUser"
  member  = "serviceAccount:${google_service_account.ci.email}"
}

resource "google_project_iam_member" "ci_build_editor" {
  project = var.project_id
  role    = "roles/cloudbuild.builds.editor"
  member  = "serviceAccount:${google_service_account.ci.email}"
}
