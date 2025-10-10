# infra/environments/prod.tfvars
env                        = "prod"
project_id                 = "lottosmartpicker-prod"
billing_account_id         = "01BBCF-98D682-60E318"
app_domain                 = "app.lottosmartpicker.com"
data_domain                = "data.lottosmartpicker.com"
data_bucket_name           = "lottosmartpicker-data"
cors_allowed_origins       = ["https://app.lottosmartpicker.com"]
github_repo                = "kmccartney24la/lottosmartpicker-gcp"
budget_notification_emails = ["kmccartney24la@gmail.com"]
labels                     = { owner = "platform", cost-center = "lsp" }

# Security monitoring configuration
security_notification_email    = "kmccartney24la@gmail.com"
organization_id                = "" # Set to your Google Cloud Organization ID
enable_security_command_center = true
enable_container_analysis      = true
enable_binary_authorization    = false
security_log_retention_days    = 90
audit_log_retention_days       = 365
