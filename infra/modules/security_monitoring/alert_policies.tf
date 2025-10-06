# infra/modules/security_monitoring/alert_policies.tf
# Alert policies for security events

# Critical Alert: High Rate Limit Violations
resource "google_monitoring_alert_policy" "security_high_rate_limit_violations" {
  display_name = "Security: High Rate Limit Violations - ${title(var.environment)}"
  combiner     = "OR"
  enabled      = true
  
  conditions {
    display_name = "Rate limit violations > ${local.alert_thresholds.rate_limit_violations} in 5 minutes"
    
    condition_monitoring_query_language {
      query = <<-EOT
        fetch logging.googleapis.com/user/${local.security_metrics.rate_limit_violations}
        | align rate(1m)
        | group_by [resource.project_id], sum(value.${local.security_metrics.rate_limit_violations})
        | window 5m
        | condition gt(${local.alert_thresholds.rate_limit_violations})
      EOT
      
      duration = "300s"  # 5 minutes
      
      trigger {
        count = 1
      }
    }
  }
  
  notification_channels = [local.notification_channels.critical]
  
  alert_strategy {
    auto_close = var.alert_auto_close_duration
    
    notification_rate_limit {
      period = "300s"  # 5 minutes between notifications
    }
  }
  
  documentation {
    content = <<-EOT
# High Rate Limit Violations Detected

**Severity**: Critical
**Environment**: ${var.environment}
**Threshold**: ${local.alert_thresholds.rate_limit_violations} violations in 5 minutes

## Description
High number of rate limit violations detected. This may indicate:
- DoS attack attempt
- Misconfigured client application
- Automated scraping activity

## Immediate Actions Required
1. Check security dashboard for affected sessions/IPs
2. Review logs for attack patterns
3. Consider IP blocking if confirmed attack
4. Monitor for 30 minutes after initial response

## Dashboard
[Security Overview Dashboard](https://console.cloud.google.com/monitoring/dashboards/custom/security-overview?project=${var.project_id})

## Logs Query
```
jsonPayload.eventType="RATE_LIMIT_EXCEEDED"
```
    EOT
    mime_type = "text/markdown"
  }
  
  user_labels = merge(local.common_labels, {
    severity = "critical"
    category = "rate-limiting"
  })
}

# Critical Alert: CSRF Attack Pattern
resource "google_monitoring_alert_policy" "security_csrf_attack_pattern" {
  display_name = "Security: CSRF Attack Pattern Detected - ${title(var.environment)}"
  combiner     = "OR"
  enabled      = true
  
  conditions {
    display_name = "CSRF failures > ${local.alert_thresholds.csrf_failures} in 5 minutes"
    
    condition_monitoring_query_language {
      query = <<-EOT
        fetch logging.googleapis.com/user/${local.security_metrics.csrf_failures}
        | align rate(1m)
        | group_by [resource.project_id], sum(value.${local.security_metrics.csrf_failures})
        | window 5m
        | condition gt(${local.alert_thresholds.csrf_failures})
      EOT
      
      duration = "300s"
      
      trigger {
        count = 1
      }
    }
  }
  
  notification_channels = [local.notification_channels.critical]
  
  alert_strategy {
    auto_close = var.alert_auto_close_duration
    
    notification_rate_limit {
      period = "300s"
    }
  }
  
  documentation {
    content = <<-EOT
# CSRF Attack Pattern Detected

**Severity**: Critical
**Environment**: ${var.environment}
**Threshold**: ${local.alert_thresholds.csrf_failures} failures in 5 minutes

## Description
Multiple CSRF token validation failures detected. This may indicate:
- CSRF attack attempt
- Session hijacking
- Client-side security issue

## Immediate Actions Required
1. Verify CSRF token generation is working correctly
2. Check for session hijacking indicators
3. Review recent code changes to CSRF implementation
4. Validate session management security

## Dashboard
[Security Overview Dashboard](https://console.cloud.google.com/monitoring/dashboards/custom/security-overview?project=${var.project_id})

## Logs Query
```
jsonPayload.eventType="CSRF_TOKEN_MISMATCH"
```
    EOT
    mime_type = "text/markdown"
  }
  
  user_labels = merge(local.common_labels, {
    severity = "critical"
    category = "csrf-protection"
  })
}

# Critical Alert: Session Hijacking Indicators
resource "google_monitoring_alert_policy" "security_session_hijacking" {
  display_name = "Security: Session Hijacking Indicators - ${title(var.environment)}"
  combiner     = "OR"
  enabled      = true
  
  conditions {
    display_name = "Session anomalies > 5 in 10 minutes"
    
    condition_monitoring_query_language {
      query = <<-EOT
        fetch logging.googleapis.com/user/${local.security_metrics.session_anomalies}
        | align rate(1m)
        | group_by [resource.project_id], sum(value.${local.security_metrics.session_anomalies})
        | window 10m
        | condition gt(5)
      EOT
      
      duration = "600s"  # 10 minutes
      
      trigger {
        count = 1
      }
    }
  }
  
  notification_channels = [local.notification_channels.critical]
  
  alert_strategy {
    auto_close = var.alert_auto_close_duration
    
    notification_rate_limit {
      period = "600s"  # 10 minutes
    }
  }
  
  documentation {
    content = <<-EOT
# Session Hijacking Indicators Detected

**Severity**: Critical
**Environment**: ${var.environment}
**Threshold**: 5 session anomalies in 10 minutes

## Description
Multiple session anomalies detected. This may indicate:
- Session hijacking attempts
- Credential stuffing attacks
- Unusual user behavior patterns

## Immediate Actions Required
1. Review session events for patterns
2. Check for rapid session creation from same IP
3. Monitor affected user accounts
4. Invalidate suspicious sessions if possible

## Dashboard
[Security Overview Dashboard](https://console.cloud.google.com/monitoring/dashboards/custom/security-overview?project=${var.project_id})

## Logs Query
```
jsonPayload.eventType="SESSION_CREATED" OR jsonPayload.eventType="MISSING_SESSION"
```
    EOT
    mime_type = "text/markdown"
  }
  
  user_labels = merge(local.common_labels, {
    severity = "critical"
    category = "session-security"
  })
}

# Warning Alert: Elevated Security Events
resource "google_monitoring_alert_policy" "security_elevated_events" {
  display_name = "Security: Elevated Security Events - ${title(var.environment)}"
  combiner     = "OR"
  enabled      = true
  
  conditions {
    display_name = "Security events > ${local.alert_thresholds.security_events} in 1 hour"
    
    condition_monitoring_query_language {
      query = <<-EOT
        fetch logging.googleapis.com/user/${local.security_metrics.all_events}
        | filter (value.all_events.outcome == "failure")
        | align rate(1m)
        | group_by [resource.project_id], sum(value.${local.security_metrics.all_events})
        | window 1h
        | condition gt(${local.alert_thresholds.security_events})
      EOT
      
      duration = var.warning_alert_delay
      
      trigger {
        count = 1
      }
    }
  }
  
  notification_channels = [local.notification_channels.warning]
  
  alert_strategy {
    auto_close = var.alert_auto_close_duration
    
    notification_rate_limit {
      period = "1800s"  # 30 minutes
    }
  }
  
  documentation {
    content = <<-EOT
# Elevated Security Events Detected

**Severity**: Warning
**Environment**: ${var.environment}
**Threshold**: ${local.alert_thresholds.security_events} events in 1 hour

## Description
Elevated number of security events detected. Review for patterns and trends.

## Actions Required (within 2 hours)
1. Review security events breakdown in dashboard
2. Compare with historical baselines
3. Check for correlation with deployments or external factors
4. Adjust thresholds if legitimate traffic increase

## Dashboard
[Security Overview Dashboard](https://console.cloud.google.com/monitoring/dashboards/custom/security-overview?project=${var.project_id})
    EOT
    mime_type = "text/markdown"
  }
  
  user_labels = merge(local.common_labels, {
    severity = "warning"
    category = "general-security"
  })
}

# Warning Alert: Request Size Violations
resource "google_monitoring_alert_policy" "security_request_size_violations" {
  display_name = "Security: Request Size Violations - ${title(var.environment)}"
  combiner     = "OR"
  enabled      = true
  
  conditions {
    display_name = "Request size violations > ${var.request_size_alert_threshold} in 30 minutes"
    
    condition_monitoring_query_language {
      query = <<-EOT
        fetch logging.googleapis.com/user/${local.security_metrics.request_violations}
        | filter (value.request_violations.event_type == "REQUEST_SIZE_EXCEEDED")
        | align rate(1m)
        | group_by [resource.project_id], sum(value.${local.security_metrics.request_violations})
        | window 30m
        | condition gt(${var.request_size_alert_threshold})
      EOT
      
      duration = var.warning_alert_delay
      
      trigger {
        count = 1
      }
    }
  }
  
  notification_channels = [local.notification_channels.warning]
  
  alert_strategy {
    auto_close = var.alert_auto_close_duration
    
    notification_rate_limit {
      period = "1800s"
    }
  }
  
  documentation {
    content = <<-EOT
# Request Size Violations Detected

**Severity**: Warning
**Environment**: ${var.environment}
**Threshold**: ${var.request_size_alert_threshold} violations in 30 minutes

## Description
Multiple oversized requests detected. This may indicate:
- Potential DoS attempts
- Data exfiltration attempts
- Misconfigured client applications

## Actions Required
1. Review request patterns and sources
2. Check for legitimate use cases
3. Consider adjusting size limits if needed
4. Monitor for escalation

## Dashboard
[Security Overview Dashboard](https://console.cloud.google.com/monitoring/dashboards/custom/security-overview?project=${var.project_id})
    EOT
    mime_type = "text/markdown"
  }
  
  user_labels = merge(local.common_labels, {
    severity = "warning"
    category = "request-security"
  })
}

# Warning Alert: Blocked User Agent Pattern
resource "google_monitoring_alert_policy" "security_ua_block_pattern" {
  display_name = "Security: Blocked User Agent Pattern - ${title(var.environment)}"
  combiner     = "OR"
  enabled      = true
  
  conditions {
    display_name = "UA blocks > ${var.ua_block_alert_threshold} in 1 hour"
    
    condition_monitoring_query_language {
      query = <<-EOT
        fetch logging.googleapis.com/user/${local.security_metrics.access_violations}
        | filter (value.access_violations.event_type == "UA_BLOCK")
        | align rate(1m)
        | group_by [resource.project_id], sum(value.${local.security_metrics.access_violations})
        | window 1h
        | condition gt(${var.ua_block_alert_threshold})
      EOT
      
      duration = var.warning_alert_delay
      
      trigger {
        count = 1
      }
    }
  }
  
  notification_channels = [local.notification_channels.warning]
  
  alert_strategy {
    auto_close = var.alert_auto_close_duration
    
    notification_rate_limit {
      period = "3600s"  # 1 hour
    }
  }
  
  documentation {
    content = <<-EOT
# Blocked User Agent Pattern Detected

**Severity**: Warning
**Environment**: ${var.environment}
**Threshold**: ${var.ua_block_alert_threshold} blocks in 1 hour

## Description
High number of blocked user agents detected. This may indicate:
- Automated scraping attempts
- Bot activity
- Legitimate tools being blocked

## Actions Required
1. Review blocked user agents in logs
2. Determine if blocks are legitimate
3. Consider updating user agent block list
4. Monitor for evasion attempts

## Dashboard
[Security Overview Dashboard](https://console.cloud.google.com/monitoring/dashboards/custom/security-overview?project=${var.project_id})
    EOT
    mime_type = "text/markdown"
  }
  
  user_labels = merge(local.common_labels, {
    severity = "warning"
    category = "access-control"
  })
}

# Container Vulnerabilities Alert
resource "google_monitoring_alert_policy" "security_container_vulnerabilities" {
  count = var.enable_container_analysis ? 1 : 0
  
  display_name = "Security: Container Vulnerabilities Detected - ${title(var.environment)}"
  combiner     = "OR"
  enabled      = true
  
  conditions {
    display_name = "High/Critical vulnerabilities found"
    
    condition_monitoring_query_language {
      query = <<-EOT
        fetch gce_instance
        | filter (resource.project_id == "${var.project_id}")
        | metric 'containeranalysis.googleapis.com/vulnerability/count'
        | filter (metric.severity == "HIGH" || metric.severity == "CRITICAL")
        | group_by 1m, sum(value.count)
        | condition gt(0)
      EOT
      
      duration = "60s"
      
      trigger {
        count = 1
      }
    }
  }
  
  notification_channels = [local.notification_channels.warning]
  
  alert_strategy {
    auto_close = "86400s"  # 24 hours (manual resolution required)
    
    notification_rate_limit {
      period = "3600s"  # 1 hour
    }
  }
  
  documentation {
    content = <<-EOT
# Container Vulnerabilities Detected

**Severity**: Warning
**Environment**: ${var.environment}
**Threshold**: Any HIGH or CRITICAL vulnerabilities

## Description
High or Critical severity vulnerabilities detected in container images.

## Actions Required (within 4 hours)
1. Review vulnerability details in Security Command Center
2. Update affected dependencies
3. Rebuild and redeploy container images
4. Verify fixes with new scan

## Security Command Center
[View Findings](https://console.cloud.google.com/security/command-center/findings?project=${var.project_id})

## Container Analysis
[View Scans](https://console.cloud.google.com/gcr/images/${var.project_id}?project=${var.project_id})
    EOT
    mime_type = "text/markdown"
  }
  
  user_labels = merge(local.common_labels, {
    severity = "warning"
    category = "vulnerability-management"
  })
}