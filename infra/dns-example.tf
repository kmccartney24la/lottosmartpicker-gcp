# infra/dns-example.tf (optional, not wired by default)
resource "google_dns_managed_zone" "public_zone" {
  name     = "lsp-zone"
  dns_name = "lottosmartpicker.com."
  visibility = "public"
}

# Point app subdomain to Cloud Run anycast (placeholder IPs per Google docs)
resource "google_dns_record_set" "app_a" {
  managed_zone = google_dns_managed_zone.public_zone.name
  name         = "app.lottosmartpicker.com."
  type         = "A"
  ttl          = 300
  rrdatas      = ["216.239.32.21", "216.239.34.21", "216.239.36.21", "216.239.38.21"]
}

# data.* will point to LB IP:
resource "google_dns_record_set" "data_a" {
  managed_zone = google_dns_managed_zone.public_zone.name
  name         = "data.lottosmartpicker.com."
  type         = "A"
  ttl          = 300
  rrdatas      = [module.cdn_backend_bucket.global_ip_address]
}
