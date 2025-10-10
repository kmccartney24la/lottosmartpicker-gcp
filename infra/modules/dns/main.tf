# Prepare for future DNS zone management
resource "google_dns_managed_zone" "main_zone" {
  count       = var.manage_dns ? 1 : 0
  name        = "lottosmartpicker-zone"
  dns_name    = "lottosmartpicker.com."
  description = "Managed zone for lottosmartpicker.com"
  visibility  = "public"
}