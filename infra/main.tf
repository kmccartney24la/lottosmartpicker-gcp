# infra/main.tf
locals {
  common_labels = merge({
    env    = var.env
    system = "lottosmartpicker"
    region = var.region
  }, var.labels)

  # Whether this is prod affects cache policy hints & domains
  is_prod = var.env == "prod"
}

module "service_accounts" {
  source                  = "./modules/service_accounts"
  project_id              = var.project_id
  run_service_account_id  = var.run_service_account_id
  jobs_service_account_id = var.jobs_service_account_id
  ci_service_account_id   = var.ci_service_account_id
  labels                  = local.common_labels
}

module "artifact_registry" {
  source     = "./modules/artifact_registry"
  project_id = var.project_id
  region     = var.region
  repos      = var.ar_repos
  labels     = local.common_labels
}

# Conditional GCS Buckets module
module "gcs_buckets" {
  count                = var.manage_gcs_buckets ? 1 : 0
  source               = "./modules/gcs_buckets"
  manage_gcs_buckets   = var.manage_gcs_buckets
  project_id           = var.project_id
  data_bucket_name     = var.data_bucket_name
  cors_allowed_origins = var.cors_allowed_origins
  labels               = local.common_labels
  jobs_sa_email        = module.service_accounts.jobs_sa_email
}

# AFTER service_accounts & gcs_buckets:
resource "google_storage_bucket_iam_member" "jobs_admin_scoped" {
  count  = var.manage_gcs_buckets ? 1 : 0
  bucket = module.gcs_buckets[0].data_bucket_name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${module.service_accounts.jobs_sa_email}"
}


module "cdn_backend_bucket" {
  source           = "./modules/cdn_backend_bucket"
  project_id       = var.project_id
  data_bucket_name = var.manage_gcs_buckets ? module.gcs_buckets[0].data_bucket_name : var.data_bucket_name
  data_domain      = var.data_domain
  labels           = local.common_labels
}

# Conditional Cloud Run Service App module
module "run_service_app" {
  count                  = var.manage_run_service_app ? 1 : 0
  source                 = "./modules/run_service_app"
  manage_run_service_app = var.manage_run_service_app
  project_id             = var.project_id
  region                 = var.region
  env                    = var.env
  service_name           = "lottosmartpicker-app"
  service_account_email  = module.service_accounts.run_sa_email
  enable_request_logging = var.enable_request_logging_labels
  labels                 = local.common_labels
  # Placeholders: wire actual env at deploy-time or via TF variables if desired
  env_vars = {
    NODE_ENV                = local.is_prod ? "production" : "staging"
    PUBLIC_BASE_URL         = "https://${var.data_domain}"
    GA_SCRATCHERS_INDEX_URL = "https://${var.data_domain}/ga/scratchers/index.latest.json"
  }
  # Public unauth
  allow_unauthenticated = true
  # Domain mapping example (optional—if you prefer CR Domain Mapping for the app)
  domain = var.app_domain
}

# Conditional Cloud Run Jobs module
module "run_jobs" {
  count                = var.manage_run_jobs ? 1 : 0
  source               = "./modules/run_jobs"
  manage_run_jobs      = var.manage_run_jobs
  project_id           = var.project_id
  region               = var.region
  env                  = var.env
  jobs_service_account = module.service_accounts.jobs_sa_email
  data_bucket_name     = var.manage_gcs_buckets ? module.gcs_buckets[0].data_bucket_name : var.data_bucket_name
  public_base_url      = "https://${var.data_domain}"
  secret_socrata_token = "socrata-app-token" # Secret Manager secret name
  cron_csvs            = [var.cron_csvs]
  cron_scratchers      = var.cron_scratchers
  labels               = local.common_labels
}

# Conditional Workload Identity Federation module
module "wif_github" {
  count                = var.manage_wif_github ? 1 : 0
  source               = "./modules/wif_github"
  project_id           = var.project_id
  github_repo          = var.github_repo
  ci_service_account   = module.service_accounts.ci_sa_email
  run_service_account  = module.service_accounts.run_sa_email
  jobs_service_account = module.service_accounts.jobs_sa_email
  labels               = local.common_labels
}

# Conditional Monitoring module
module "monitoring" {
  count       = var.manage_monitoring ? 1 : 0
  source      = "./modules/monitoring"
  project_id  = var.project_id
  region      = var.region
  app_domain  = var.app_domain
  data_domain = var.data_domain
  bucket_name = var.manage_gcs_buckets ? module.gcs_buckets[0].data_bucket_name : var.data_bucket_name
  labels      = local.common_labels
}

# Security Monitoring Module
# This module configures various security monitoring features for the GCP project.
# It includes settings for alerting thresholds, enabling security features like
# Security Command Center, Container Analysis, and Binary Authorization, and
# defining log retention policies.
# Conditional Security Monitoring module
module "security_monitoring" {
  count  = var.manage_security_monitoring ? 1 : 0
  source = "./modules/security_monitoring"

  project_id                  = var.project_id
  region                      = var.region
  environment                 = var.env
  security_notification_email = var.security_notification_email
  organization_id             = var.organization_id
  labels                      = local.common_labels

  # Environment-specific thresholds
  rate_limit_alert_threshold      = var.env == "prod" ? 50 : 100
  csrf_failure_alert_threshold    = var.env == "prod" ? 10 : 20
  security_events_alert_threshold = var.env == "prod" ? 100 : 200
  request_size_alert_threshold    = var.env == "prod" ? 20 : 40
  ua_block_alert_threshold        = var.env == "prod" ? 50 : 100

  # Security features configuration
  enable_security_command_center = var.enable_security_command_center
  enable_container_analysis      = var.enable_container_analysis
  enable_binary_authorization    = var.enable_binary_authorization

  # Log retention settings
  security_log_retention_days = var.security_log_retention_days
  audit_log_retention_days    = var.audit_log_retention_days

  depends_on = [
    module.service_accounts,
    module.run_service_app[0]
  ]
}

# Conditional Cloud Armor Security Policy module
module "security_policy" {
  count  = var.manage_security_policy ? 1 : 0
  source = "./modules/security_policy"

  manage_security_policy = var.manage_security_policy
  labels                 = local.common_labels
}

# Conditional Budget module
module "budget" {
  count               = var.manage_budget ? 1 : 0
  source              = "./modules/budget"
  manage_budget       = var.manage_budget
  project_id          = var.project_id
  billing_account_id  = var.billing_account_id
  notification_emails = var.budget_notification_emails
  labels              = local.common_labels
}
