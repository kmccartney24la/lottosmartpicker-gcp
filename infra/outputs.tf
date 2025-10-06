output "service_url" {
  value = google_cloud_run_service.web.status[0].url
}
