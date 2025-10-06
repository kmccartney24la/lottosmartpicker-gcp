# infra/modules/security_monitoring/log_metrics.tf
# Log-based metrics for security events

# Rate Limiting Violations
resource "google_logging_metric" "security_rate_limit_violations" {
  name   = "security_rate_limit_violations"
  filter = "resource.type=\"cloud_run_revision\" AND jsonPayload.level=\"SECURITY\" AND jsonPayload.eventType=\"RATE_LIMIT_EXCEEDED\""
  
  label_extractors = {
    session_id = "EXTRACT(jsonPayload.sessionId)"
    ip_address = "EXTRACT(jsonPayload.ipAddress)"
    user_agent = "EXTRACT(jsonPayload.userAgent)"
  }
  
  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "INT64"
    display_name = "Security: Rate Limit Violations"
    
    labels {
      key         = "session_id"
      value_type  = "STRING"
      description = "Session ID that exceeded rate limit"
    }
    labels {
      key         = "ip_address"
      value_type  = "STRING"
      description = "IP address that exceeded rate limit"
    }
    labels {
      key         = "user_agent"
      value_type  = "STRING"
      description = "User agent that exceeded rate limit"
    }
  }
  
  bucket_options {
    exponential_buckets {
      num_finite_buckets = 64
      growth_factor      = 2
      scale              = 1
    }
  }
}

# CSRF Protection Events
resource "google_logging_metric" "security_csrf_failures" {
  name   = "security_csrf_failures"
  filter = "resource.type=\"cloud_run_revision\" AND jsonPayload.level=\"SECURITY\" AND jsonPayload.eventType=\"CSRF_TOKEN_MISMATCH\""
  
  label_extractors = {
    session_id = "EXTRACT(jsonPayload.sessionId)"
    ip_address = "EXTRACT(jsonPayload.ipAddress)"
    path       = "EXTRACT(jsonPayload.path)"
    method     = "EXTRACT(jsonPayload.method)"
  }
  
  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "INT64"
    display_name = "Security: CSRF Token Failures"
    
    labels {
      key         = "session_id"
      value_type  = "STRING"
      description = "Session ID with CSRF failure"
    }
    labels {
      key         = "ip_address"
      value_type  = "STRING"
      description = "IP address with CSRF failure"
    }
    labels {
      key         = "path"
      value_type  = "STRING"
      description = "Request path with CSRF failure"
    }
    labels {
      key         = "method"
      value_type  = "STRING"
      description = "HTTP method with CSRF failure"
    }
  }
}

# CSRF Token Rotations (informational)
resource "google_logging_metric" "security_csrf_rotations" {
  name   = "security_csrf_rotations"
  filter = "resource.type=\"cloud_run_revision\" AND jsonPayload.level=\"SECURITY\" AND jsonPayload.eventType=\"CSRF_TOKEN_ROTATED\""
  
  label_extractors = {
    session_id = "EXTRACT(jsonPayload.sessionId)"
    path       = "EXTRACT(jsonPayload.path)"
  }
  
  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "INT64"
    display_name = "Security: CSRF Token Rotations"
    
    labels {
      key         = "session_id"
      value_type  = "STRING"
      description = "Session ID with token rotation"
    }
    labels {
      key         = "path"
      value_type  = "STRING"
      description = "Request path triggering rotation"
    }
  }
}

# Session Security Events
resource "google_logging_metric" "security_session_anomalies" {
  name   = "security_session_anomalies"
  filter = "resource.type=\"cloud_run_revision\" AND jsonPayload.level=\"SECURITY\" AND (jsonPayload.eventType=\"SESSION_CREATED\" OR jsonPayload.eventType=\"MISSING_SESSION\")"
  
  label_extractors = {
    event_type = "EXTRACT(jsonPayload.eventType)"
    ip_address = "EXTRACT(jsonPayload.ipAddress)"
    user_agent = "EXTRACT(jsonPayload.userAgent)"
  }
  
  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "INT64"
    display_name = "Security: Session Anomalies"
    
    labels {
      key         = "event_type"
      value_type  = "STRING"
      description = "Type of session event"
    }
    labels {
      key         = "ip_address"
      value_type  = "STRING"
      description = "IP address for session event"
    }
    labels {
      key         = "user_agent"
      value_type  = "STRING"
      description = "User agent for session event"
    }
  }
}

# Access Control Violations
resource "google_logging_metric" "security_access_violations" {
  name   = "security_access_violations"
  filter = "resource.type=\"cloud_run_revision\" AND jsonPayload.level=\"SECURITY\" AND (jsonPayload.eventType=\"UA_BLOCK\" OR jsonPayload.eventType=\"CROSS_SITE_REQUEST\" OR jsonPayload.eventType=\"INVALID_HOST\")"
  
  label_extractors = {
    event_type = "EXTRACT(jsonPayload.eventType)"
    user_agent = "EXTRACT(jsonPayload.userAgent)"
    ip_address = "EXTRACT(jsonPayload.ipAddress)"
    path       = "EXTRACT(jsonPayload.path)"
  }
  
  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "INT64"
    display_name = "Security: Access Control Violations"
    
    labels {
      key         = "event_type"
      value_type  = "STRING"
      description = "Type of access violation"
    }
    labels {
      key         = "user_agent"
      value_type  = "STRING"
      description = "User agent causing violation"
    }
    labels {
      key         = "ip_address"
      value_type  = "STRING"
      description = "IP address causing violation"
    }
    labels {
      key         = "path"
      value_type  = "STRING"
      description = "Request path with violation"
    }
  }
}

# Request Security Violations
resource "google_logging_metric" "security_request_violations" {
  name   = "security_request_violations"
  filter = "resource.type=\"cloud_run_revision\" AND jsonPayload.level=\"SECURITY\" AND (jsonPayload.eventType=\"REQUEST_SIZE_EXCEEDED\" OR jsonPayload.eventType=\"METHOD_NOT_ALLOWED\")"
  
  label_extractors = {
    event_type = "EXTRACT(jsonPayload.eventType)"
    ip_address = "EXTRACT(jsonPayload.ipAddress)"
    path       = "EXTRACT(jsonPayload.path)"
    method     = "EXTRACT(jsonPayload.method)"
  }
  
  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "INT64"
    display_name = "Security: Request Violations"
    
    labels {
      key         = "event_type"
      value_type  = "STRING"
      description = "Type of request violation"
    }
    labels {
      key         = "ip_address"
      value_type  = "STRING"
      description = "IP address with request violation"
    }
    labels {
      key         = "path"
      value_type  = "STRING"
      description = "Request path with violation"
    }
    labels {
      key         = "method"
      value_type  = "STRING"
      description = "HTTP method with violation"
    }
  }
}

# Successful Security Events (for baseline monitoring)
resource "google_logging_metric" "security_successful_events" {
  name   = "security_successful_events"
  filter = "resource.type=\"cloud_run_revision\" AND jsonPayload.level=\"SECURITY\" AND jsonPayload.outcome=\"success\""
  
  label_extractors = {
    event_type = "EXTRACT(jsonPayload.eventType)"
  }
  
  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "INT64"
    display_name = "Security: Successful Events"
    
    labels {
      key         = "event_type"
      value_type  = "STRING"
      description = "Type of successful security event"
    }
  }
}

# All Security Events (aggregate metric)
resource "google_logging_metric" "security_all_events" {
  name   = "security_all_events"
  filter = "resource.type=\"cloud_run_revision\" AND jsonPayload.level=\"SECURITY\""
  
  label_extractors = {
    event_type = "EXTRACT(jsonPayload.eventType)"
    outcome    = "EXTRACT(jsonPayload.outcome)"
  }
  
  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "INT64"
    display_name = "Security: All Events"
    
    labels {
      key         = "event_type"
      value_type  = "STRING"
      description = "Type of security event"
    }
    labels {
      key         = "outcome"
      value_type  = "STRING"
      description = "Outcome of security event (success/failure)"
    }
  }
}

# Local values for metric names (for use in alert policies)
locals {
  security_metrics = {
    rate_limit_violations = google_logging_metric.security_rate_limit_violations.name
    csrf_failures         = google_logging_metric.security_csrf_failures.name
    csrf_rotations        = google_logging_metric.security_csrf_rotations.name
    session_anomalies     = google_logging_metric.security_session_anomalies.name
    access_violations     = google_logging_metric.security_access_violations.name
    request_violations    = google_logging_metric.security_request_violations.name
    successful_events     = google_logging_metric.security_successful_events.name
    all_events           = google_logging_metric.security_all_events.name
  }
}