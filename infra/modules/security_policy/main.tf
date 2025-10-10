# Basic Cloud Armor security policy
resource "google_compute_security_policy" "waf_policy" {
  count       = var.manage_security_policy ? 1 : 0
  name        = "lsp-waf"
  description = "LSP WAF"

  # The existing policy has a default allow rule with the lowest priority.
  # We will replicate this behavior.
  rule {
    priority    = "2147483647"
    action      = "ALLOW"
    description = "default rule"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["0.0.0.0/0"]
      }
    }
  }
}