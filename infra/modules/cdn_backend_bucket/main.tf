// infra/modules/cdn_backend_bucket/main.tf
// DEPRECATED: This module built the data.* HTTPS LB in front of a backend bucket.
// We now use same-origin API + private GCS. Keep the module disabled (enabled=false).

// Reserve global IP
resource "google_compute_global_address" "ip" {
  count = var.enabled ? 1 : 0
  name  = "cdn-backend-bucket-ip"
}

# Backend bucket with CDN
resource "google_compute_backend_bucket" "bb" {
  count       = var.enabled ? 1 : 0
  name        = "data-backend-bucket"
  bucket_name = var.data_bucket_name
  enable_cdn  = true
  description = "CDN for public data bucket (deprecated)"
  cdn_policy {
    cache_mode       = "USE_ORIGIN_HEADERS"
    default_ttl      = 3600
    client_ttl       = 3600
    max_ttl          = 31536000
    negative_caching = true
    negative_caching_policy { code = 404 ttl = 60 }
    negative_caching_policy { code = 301 ttl = 300 }
    negative_caching_policy { code = 302 ttl = 60 }
    serve_while_stale = 300
  }
}

# URL map
resource "google_compute_url_map" "map" {
  count           = var.enabled ? 1 : 0
  name            = "data-url-map"
  default_service = google_compute_backend_bucket.bb[0].self_link
}

# Managed SSL cert
resource "google_compute_managed_ssl_certificate" "cert" {
  count = var.enabled ? 1 : 0
  name  = "data-ssl-cert"
  managed { domains = [var.data_domain] }
}

# HTTPS proxy
resource "google_compute_target_https_proxy" "https_proxy" {
  count            = var.enabled ? 1 : 0
  name             = "data-https-proxy"
  url_map          = google_compute_url_map.map[0].self_link
  ssl_certificates = [google_compute_managed_ssl_certificate.cert[0].id]
}

# Forwarding rule
resource "google_compute_global_forwarding_rule" "fr" {
  count                 = var.enabled ? 1 : 0
  name                  = "data-https-fr"
  ip_address            = google_compute_global_address.ip[0].address
  port_range            = "443"
  target                = google_compute_target_https_proxy.https_proxy[0].self_link
  load_balancing_scheme = "EXTERNAL_MANAGED"
}
