output "security_policy_name" {
  description = "The name of the Cloud Armor security policy"
  value       = var.manage_security_policy ? google_compute_security_policy.waf_policy[0].name : null
}