output "dns_managed_zone_name" {
  description = "The name of the DNS managed zone"
  value       = var.manage_dns ? google_dns_managed_zone.main_zone[0].name : null
}