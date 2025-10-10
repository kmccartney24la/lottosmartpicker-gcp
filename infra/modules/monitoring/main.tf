# infra/modules/monitoring/main.tf
# Uptime checks
resource "google_monitoring_uptime_check_config" "app" {
  display_name = "App HTTP 200"
  timeout      = "10s"
  period       = "60s"
  http_check {
    path         = "/ga/scratchers/index.latest.json"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }
  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = var.app_domain
    }
  }
}

resource "google_monitoring_uptime_check_config" "data_index" {
  display_name = "Data index.latest.json 200"
  timeout      = "10s"
  period       = "60s"
  http_check {
    path         = "/ga/scratchers/index.latest.json"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }
  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = var.data_domain
    }
  }
}

# Log-based metrics for job runs
resource "google_logging_metric" "scratchers_success" {
  name   = "scratchers_success_count"
  filter = "resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"scratchers\" AND textPayload:\"JOB_SUCCESS\""
  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "INT64"
    display_name = "Scratchers Success Count"
  }
}

resource "google_logging_metric" "scratchers_failure" {
  name   = "scratchers_failure_count"
  filter = "resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"scratchers\" AND (severity=ERROR OR textPayload:\"JOB_FAILURE\")"
  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "INT64"
    display_name = "Scratchers Failure Count"
  }
}

# Alert: App 5xx ratio > 2% (5m)
resource "google_monitoring_alert_policy" "app_5xx" {
  display_name = "App 5xx > 2% (5m)"
  combiner     = "OR"
  conditions {
    display_name = "5xx ratio"
    condition_monitoring_query_language {
      query    = <<-EOT
        fetch cloud_run_revision
        | filter (resource.project_id == "${var.project_id}")
        | filter (metric.response_code_class == "5xx")
        | align rate(1m)
        | group_by [], sum(value.response_count)
        | { 
            fetch cloud_run_revision
            | filter (resource.project_id == "${var.project_id}")
            | align rate(1m)
            | group_by [], sum(value.response_count)
          }
        | ratio
        | window 5m
        | condition gt(0.02)
      EOT
      duration = "300s"
      trigger { count = 1 }
    }
  }
  notification_channels = [] # add channels if configured
}

# Alert: App p95 latency > 1000ms for 10m
resource "google_monitoring_alert_policy" "app_p95" {
  display_name = "App p95 > 1s (10m)"
  combiner     = "OR"
  conditions {
    display_name = "p95 latency"
    condition_monitoring_query_language {
      query    = <<-EOT
        fetch cloud_run_revision
        | filter (resource.project_id == "${var.project_id}")
        | align 1m
        | group_by [], percentile(value.request_latencies, 95)
        | window 10m
        | condition gt(1 s)
      EOT
      duration = "600s"
      trigger { count = 1 }
    }
  }
}

# Alert: Scratchers freshness > 26h (logs-based metric "absent_for")
resource "google_monitoring_alert_policy" "scratchers_freshness" {
  display_name = "Scratchers freshness > 26h"
  combiner     = "OR"
  conditions {
    display_name = "No success log in 26h"
    condition_monitoring_query_language {
      query    = <<-EOT
        fetch logging.googleapis.com/user/${google_logging_metric.scratchers_success.name}
        | within 26h
        | condition absent_for(26h)
      EOT
      duration = "60s"
      trigger { count = 1 }
    }
  }
}

# Minimal Dashboard (JSON)
resource "google_monitoring_dashboard" "exec" {
  dashboard_json = <<-JSON
  {
    "displayName": "LSP Exec Overview",
    "gridLayout": {
      "widgets": [
        {
          "title": "App Requests / Errors",
          "xyChart": {
            "dataSets": [
              {"timeSeriesQuery": {"timeSeriesFilter": {"filter": "metric.type=\"run.googleapis.com/request_count\" resource.type=\"cloud_run_revision\""}}, "plotType": "LINE"},
              {"timeSeriesQuery": {"timeSeriesFilter": {"filter": "metric.type=\"run.googleapis.com/error_count\" resource.type=\"cloud_run_revision\""}}, "plotType": "LINE"}
            ],
            "yAxis": {"label":"count"}
          }
        },
        {
          "title": "App p95 Latency",
          "xyChart": {
            "dataSets": [
              {"timeSeriesQuery": {"timeSeriesFilter": {"filter": "metric.type=\"run.googleapis.com/request_latencies\" resource.type=\"cloud_run_revision\"", "aggregation": {"perSeriesAligner":"ALIGN_PERCENTILE_95"}}}}
            ],
            "yAxis": {"label":"ms"}
          }
        },
        {
          "title": "Scratchers Success Count",
          "xyChart": {
            "dataSets": [
              {"timeSeriesQuery": {"timeSeriesFilter": {"filter": "metric.type=\"logging.googleapis.com/user/${google_logging_metric.scratchers_success.name}\""}}}
            ]
          }
        }
      ]
    }
  }
  JSON
}

# Integration with security monitoring
# Include security-related uptime checks
resource "google_monitoring_uptime_check_config" "security_endpoint" {
  display_name = "Security Endpoint Health"
  timeout      = "10s"
  period       = "300s" # 5 minutes

  http_check {
    path         = "/api/diag/remotes"
    port         = 443
    use_ssl      = true
    validate_ssl = true

    headers = {
      "User-Agent" = "Google-Cloud-Monitoring"
    }
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = var.app_domain
    }
  }

  content_matchers {
    content = "\"status\":\"ok\""
    matcher = "CONTAINS_STRING"
  }
}

# Alert for security endpoint failures
resource "google_monitoring_alert_policy" "security_endpoint_down" {
  display_name = "Security Endpoint Down"
  combiner     = "OR"

  conditions {
    display_name = "Security endpoint check failed"
    condition_monitoring_query_language {
      query    = <<-EOT
        fetch uptime_url
        | filter (resource.host == "${var.app_domain}")
        | metric 'monitoring.googleapis.com/uptime_check/check_passed'
        | group_by 5m, mean(value.check_passed)
        | condition lt(0.8)
      EOT
      duration = "300s"
      trigger { count = 1 }
    }
  }

  # Will be connected to security notification channels when security module is integrated
  notification_channels = []

  documentation {
    content   = <<-EOT
# Security Endpoint Health Check Failed

The security diagnostics endpoint is not responding properly. This may indicate:
- Application deployment issues
- Security middleware problems
- Infrastructure connectivity issues

Check the application logs and security monitoring dashboard.
    EOT
    mime_type = "text/markdown"
  }
}
