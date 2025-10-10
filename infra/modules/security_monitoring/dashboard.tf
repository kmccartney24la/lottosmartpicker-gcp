# infra/modules/security_monitoring/dashboard.tf
# Security monitoring dashboard

resource "google_monitoring_dashboard" "security_overview" {
  dashboard_json = jsonencode({
    displayName = "LottoSmartPicker Security Overview - ${title(var.environment)}"

    mosaicLayout = {
      tiles = [
        # Security Events Timeline
        {
          width  = 12
          height = 4
          widget = {
            title = "Security Events Timeline (Last 24h)"
            xyChart = {
              dataSets = [
                {
                  timeSeriesQuery = {
                    timeSeriesFilter = {
                      filter = "metric.type=\"logging.googleapis.com/user/${local.security_metrics.rate_limit_violations}\""
                      aggregation = {
                        alignmentPeriod    = "60s"
                        perSeriesAligner   = "ALIGN_RATE"
                        crossSeriesReducer = "REDUCE_SUM"
                      }
                    }
                  }
                  plotType       = "LINE"
                  targetAxis     = "Y1"
                  legendTemplate = "Rate Limit Violations"
                },
                {
                  timeSeriesQuery = {
                    timeSeriesFilter = {
                      filter = "metric.type=\"logging.googleapis.com/user/${local.security_metrics.csrf_failures}\""
                      aggregation = {
                        alignmentPeriod    = "60s"
                        perSeriesAligner   = "ALIGN_RATE"
                        crossSeriesReducer = "REDUCE_SUM"
                      }
                    }
                  }
                  plotType       = "LINE"
                  targetAxis     = "Y1"
                  legendTemplate = "CSRF Failures"
                },
                {
                  timeSeriesQuery = {
                    timeSeriesFilter = {
                      filter = "metric.type=\"logging.googleapis.com/user/${local.security_metrics.access_violations}\""
                      aggregation = {
                        alignmentPeriod    = "60s"
                        perSeriesAligner   = "ALIGN_RATE"
                        crossSeriesReducer = "REDUCE_SUM"
                      }
                    }
                  }
                  plotType       = "LINE"
                  targetAxis     = "Y1"
                  legendTemplate = "Access Violations"
                },
                {
                  timeSeriesQuery = {
                    timeSeriesFilter = {
                      filter = "metric.type=\"logging.googleapis.com/user/${local.security_metrics.session_anomalies}\""
                      aggregation = {
                        alignmentPeriod    = "60s"
                        perSeriesAligner   = "ALIGN_RATE"
                        crossSeriesReducer = "REDUCE_SUM"
                      }
                    }
                  }
                  plotType       = "LINE"
                  targetAxis     = "Y1"
                  legendTemplate = "Session Anomalies"
                }
              ]
              yAxis = {
                label = "Events per minute"
                scale = "LINEAR"
              }
              xAxis = {
                scale = "TIME"
              }
              chartOptions = {
                mode = "COLOR"
              }
              timeshiftDuration = "0s"
            }
          }
        },

        # Rate Limiting Status
        {
          width  = 6
          height = 4
          widget = {
            title = "Rate Limiting Violations (Current Hour)"
            scorecard = {
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "metric.type=\"logging.googleapis.com/user/${local.security_metrics.rate_limit_violations}\""
                  aggregation = {
                    alignmentPeriod    = "3600s"
                    perSeriesAligner   = "ALIGN_SUM"
                    crossSeriesReducer = "REDUCE_SUM"
                  }
                }
              }
              sparkChartView = {
                sparkChartType = "SPARK_LINE"
              }
              thresholds = [
                {
                  value     = local.alert_thresholds.rate_limit_violations / 2
                  color     = "YELLOW"
                  direction = "ABOVE"
                },
                {
                  value     = local.alert_thresholds.rate_limit_violations
                  color     = "RED"
                  direction = "ABOVE"
                }
              ]
              gaugeView = {
                lowerBound = 0
                upperBound = local.alert_thresholds.rate_limit_violations * 2
              }
            }
          }
        },

        # CSRF Protection Status
        {
          width  = 6
          height = 4
          widget = {
            title = "CSRF Protection Status (Current Hour)"
            scorecard = {
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "metric.type=\"logging.googleapis.com/user/${local.security_metrics.csrf_failures}\""
                  aggregation = {
                    alignmentPeriod    = "3600s"
                    perSeriesAligner   = "ALIGN_SUM"
                    crossSeriesReducer = "REDUCE_SUM"
                  }
                }
              }
              sparkChartView = {
                sparkChartType = "SPARK_LINE"
              }
              thresholds = [
                {
                  value     = local.alert_thresholds.csrf_failures / 2
                  color     = "YELLOW"
                  direction = "ABOVE"
                },
                {
                  value     = local.alert_thresholds.csrf_failures
                  color     = "RED"
                  direction = "ABOVE"
                }
              ]
            }
          }
        },

        # Security Events by Type (Pie Chart)
        {
          width  = 6
          height = 4
          widget = {
            title = "Security Events by Type (Last 24h)"
            pieChart = {
              dataSets = [
                {
                  timeSeriesQuery = {
                    timeSeriesFilter = {
                      filter = "metric.type=\"logging.googleapis.com/user/${local.security_metrics.all_events}\""
                      aggregation = {
                        alignmentPeriod    = "86400s"
                        perSeriesAligner   = "ALIGN_SUM"
                        crossSeriesReducer = "REDUCE_SUM"
                        groupByFields      = ["metric.label.event_type"]
                      }
                    }
                  }
                }
              ]
              chartType = "DONUT"
            }
          }
        },

        # Session Security Metrics
        {
          width  = 6
          height = 4
          widget = {
            title = "Session Security Metrics"
            xyChart = {
              dataSets = [
                {
                  timeSeriesQuery = {
                    timeSeriesFilter = {
                      filter = "metric.type=\"logging.googleapis.com/user/${local.security_metrics.session_anomalies}\" AND metric.label.event_type=\"SESSION_CREATED\""
                      aggregation = {
                        alignmentPeriod    = "300s"
                        perSeriesAligner   = "ALIGN_RATE"
                        crossSeriesReducer = "REDUCE_SUM"
                      }
                    }
                  }
                  plotType       = "LINE"
                  targetAxis     = "Y1"
                  legendTemplate = "Sessions Created"
                },
                {
                  timeSeriesQuery = {
                    timeSeriesFilter = {
                      filter = "metric.type=\"logging.googleapis.com/user/${local.security_metrics.session_anomalies}\" AND metric.label.event_type=\"MISSING_SESSION\""
                      aggregation = {
                        alignmentPeriod    = "300s"
                        perSeriesAligner   = "ALIGN_RATE"
                        crossSeriesReducer = "REDUCE_SUM"
                      }
                    }
                  }
                  plotType       = "LINE"
                  targetAxis     = "Y1"
                  legendTemplate = "Missing Sessions"
                }
              ]
              yAxis = {
                label = "Events per minute"
                scale = "LINEAR"
              }
            }
          }
        },

        # Access Control Violations Breakdown
        {
          width  = 12
          height = 4
          widget = {
            title = "Access Control Violations by Type"
            xyChart = {
              dataSets = [
                {
                  timeSeriesQuery = {
                    timeSeriesFilter = {
                      filter = "metric.type=\"logging.googleapis.com/user/${local.security_metrics.access_violations}\" AND metric.label.event_type=\"UA_BLOCK\""
                      aggregation = {
                        alignmentPeriod    = "300s"
                        perSeriesAligner   = "ALIGN_RATE"
                        crossSeriesReducer = "REDUCE_SUM"
                      }
                    }
                  }
                  plotType       = "STACKED_BAR"
                  targetAxis     = "Y1"
                  legendTemplate = "User Agent Blocks"
                },
                {
                  timeSeriesQuery = {
                    timeSeriesFilter = {
                      filter = "metric.type=\"logging.googleapis.com/user/${local.security_metrics.access_violations}\" AND metric.label.event_type=\"CROSS_SITE_REQUEST\""
                      aggregation = {
                        alignmentPeriod    = "300s"
                        perSeriesAligner   = "ALIGN_RATE"
                        crossSeriesReducer = "REDUCE_SUM"
                      }
                    }
                  }
                  plotType       = "STACKED_BAR"
                  targetAxis     = "Y1"
                  legendTemplate = "Cross-Site Requests"
                },
                {
                  timeSeriesQuery = {
                    timeSeriesFilter = {
                      filter = "metric.type=\"logging.googleapis.com/user/${local.security_metrics.access_violations}\" AND metric.label.event_type=\"INVALID_HOST\""
                      aggregation = {
                        alignmentPeriod    = "300s"
                        perSeriesAligner   = "ALIGN_RATE"
                        crossSeriesReducer = "REDUCE_SUM"
                      }
                    }
                  }
                  plotType       = "STACKED_BAR"
                  targetAxis     = "Y1"
                  legendTemplate = "Invalid Host"
                }
              ]
              yAxis = {
                label = "Violations per 5 minutes"
                scale = "LINEAR"
              }
            }
          }
        },

        # Top Violating IPs
        {
          width  = 6
          height = 4
          widget = {
            title = "Top Violating IP Addresses (Last 6h)"
            scorecard = {
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "metric.type=\"logging.googleapis.com/user/${local.security_metrics.all_events}\" AND metric.label.outcome=\"failure\""
                  aggregation = {
                    alignmentPeriod    = "21600s"
                    perSeriesAligner   = "ALIGN_SUM"
                    crossSeriesReducer = "REDUCE_SUM"
                    groupByFields      = ["metric.label.ip_address"]
                  }
                }
              }
              sparkChartView = {
                sparkChartType = "SPARK_BAR"
              }
            }
          }
        },

        # Security Success Rate
        {
          width  = 6
          height = 4
          widget = {
            title = "Security Success Rate (Last 6h)"
            scorecard = {
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "metric.type=\"logging.googleapis.com/user/${local.security_metrics.successful_events}\""
                  aggregation = {
                    alignmentPeriod    = "21600s"
                    perSeriesAligner   = "ALIGN_SUM"
                    crossSeriesReducer = "REDUCE_SUM"
                  }
                }
              }
              sparkChartView = {
                sparkChartType = "SPARK_LINE"
              }
              gaugeView = {
                lowerBound = 0
                upperBound = 1000
              }
            }
          }
        },

        # Request Violations Timeline
        {
          width  = 12
          height = 4
          widget = {
            title = "Request Security Violations"
            xyChart = {
              dataSets = [
                {
                  timeSeriesQuery = {
                    timeSeriesFilter = {
                      filter = "metric.type=\"logging.googleapis.com/user/${local.security_metrics.request_violations}\" AND metric.label.event_type=\"REQUEST_SIZE_EXCEEDED\""
                      aggregation = {
                        alignmentPeriod    = "300s"
                        perSeriesAligner   = "ALIGN_RATE"
                        crossSeriesReducer = "REDUCE_SUM"
                      }
                    }
                  }
                  plotType       = "LINE"
                  targetAxis     = "Y1"
                  legendTemplate = "Size Exceeded"
                },
                {
                  timeSeriesQuery = {
                    timeSeriesFilter = {
                      filter = "metric.type=\"logging.googleapis.com/user/${local.security_metrics.request_violations}\" AND metric.label.event_type=\"METHOD_NOT_ALLOWED\""
                      aggregation = {
                        alignmentPeriod    = "300s"
                        perSeriesAligner   = "ALIGN_RATE"
                        crossSeriesReducer = "REDUCE_SUM"
                      }
                    }
                  }
                  plotType       = "LINE"
                  targetAxis     = "Y1"
                  legendTemplate = "Method Not Allowed"
                }
              ]
              yAxis = {
                label = "Violations per 5 minutes"
                scale = "LINEAR"
              }
            }
          }
        },

        # Alert Status Summary
        {
          width  = 12
          height = 2
          widget = {
            title = "Active Security Alerts"
            scorecard = {
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\""
                  aggregation = {
                    alignmentPeriod  = "300s"
                    perSeriesAligner = "ALIGN_FRACTION_TRUE"
                  }
                }
              }
              sparkChartView = {
                sparkChartType = "SPARK_LINE"
              }
            }
          }
        }
      ]
    }

    # Dashboard-level labels
    labels = merge(local.common_labels, {
      dashboard_type   = "security"
      refresh_interval = tostring(var.dashboard_refresh_interval)
    })
  })
}

# Create a simplified mobile-friendly dashboard
resource "google_monitoring_dashboard" "security_mobile" {
  dashboard_json = jsonencode({
    displayName = "Security Mobile - ${title(var.environment)}"

    mosaicLayout = {
      tiles = [
        # Critical Metrics Summary
        {
          width  = 12
          height = 3
          widget = {
            title = "Critical Security Metrics (Last Hour)"
            scorecard = {
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "metric.type=\"logging.googleapis.com/user/${local.security_metrics.all_events}\" AND metric.label.outcome=\"failure\""
                  aggregation = {
                    alignmentPeriod    = "3600s"
                    perSeriesAligner   = "ALIGN_SUM"
                    crossSeriesReducer = "REDUCE_SUM"
                  }
                }
              }
              thresholds = [
                {
                  value     = 50
                  color     = "YELLOW"
                  direction = "ABOVE"
                },
                {
                  value     = 100
                  color     = "RED"
                  direction = "ABOVE"
                }
              ]
            }
          }
        },

        # Recent Events
        {
          width  = 12
          height = 4
          widget = {
            title = "Security Events (Last 4 Hours)"
            xyChart = {
              dataSets = [
                {
                  timeSeriesQuery = {
                    timeSeriesFilter = {
                      filter = "metric.type=\"logging.googleapis.com/user/${local.security_metrics.all_events}\""
                      aggregation = {
                        alignmentPeriod    = "900s"
                        perSeriesAligner   = "ALIGN_RATE"
                        crossSeriesReducer = "REDUCE_SUM"
                        groupByFields      = ["metric.label.event_type"]
                      }
                    }
                  }
                  plotType   = "STACKED_AREA"
                  targetAxis = "Y1"
                }
              ]
              yAxis = {
                label = "Events per 15min"
                scale = "LINEAR"
              }
            }
          }
        }
      ]
    }

    labels = merge(local.common_labels, {
      dashboard_type = "security-mobile"
      form_factor    = "mobile"
    })
  })
}