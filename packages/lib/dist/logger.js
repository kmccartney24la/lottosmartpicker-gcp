// lib/logger.ts
import { NextRequest } from 'next/server';
export var LogLevel;
(function (LogLevel) {
    LogLevel["INFO"] = "INFO";
    LogLevel["WARN"] = "WARN";
    LogLevel["ERROR"] = "ERROR";
    LogLevel["SECURITY"] = "SECURITY";
})(LogLevel || (LogLevel = {}));
// Enhanced logger with Google Cloud Logging integration
function log(level, message, context) {
    const entry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        context,
    };
    // Enhanced structured logging for Google Cloud Logging
    const structuredLog = {
        timestamp: entry.timestamp,
        severity: mapLogLevelToSeverity(level),
        message: entry.message,
        level: entry.level,
        ...entry.context,
        // Add trace context for Cloud Logging correlation
        'logging.googleapis.com/trace': getTraceId(),
        'logging.googleapis.com/spanId': getSpanId(),
        // Add source location for better debugging
        'logging.googleapis.com/sourceLocation': {
            file: 'lib/logger.ts',
            function: 'log'
        }
    };
    // Log to console with structured format for Cloud Logging ingestion
    console.log(JSON.stringify(structuredLog));
    // In production, also send critical security events to Cloud Logging directly
    if (level === LogLevel.SECURITY && isProduction()) {
        sendToCloudLogging(structuredLog);
    }
}
// Map our log levels to Google Cloud Logging severity levels
function mapLogLevelToSeverity(level) {
    switch (level) {
        case LogLevel.INFO:
            return 'INFO';
        case LogLevel.WARN:
            return 'WARNING';
        case LogLevel.ERROR:
            return 'ERROR';
        case LogLevel.SECURITY:
            return 'CRITICAL'; // Security events are treated as critical
        default:
            return 'DEFAULT';
    }
}
// Get trace ID for request correlation (if available)
function getTraceId() {
    // In Cloud Run, trace ID is available in headers
    if (typeof process !== 'undefined' && process.env.K_SERVICE) {
        const traceHeader = process.env.HTTP_X_CLOUD_TRACE_CONTEXT;
        if (traceHeader) {
            const traceId = traceHeader.split('/')[0];
            return `projects/${process.env.GOOGLE_CLOUD_PROJECT}/traces/${traceId}`;
        }
    }
    return undefined;
}
// Get span ID for request correlation (if available)
function getSpanId() {
    if (typeof process !== 'undefined' && process.env.K_SERVICE) {
        const traceHeader = process.env.HTTP_X_CLOUD_TRACE_CONTEXT;
        if (traceHeader) {
            const parts = traceHeader.split('/');
            return parts[1]?.split(';')[0];
        }
    }
    return undefined;
}
// Check if running in production environment
function isProduction() {
    return process.env.NODE_ENV === 'production' || process.env.K_SERVICE !== undefined;
}
// Send critical logs directly to Cloud Logging (for production)
async function sendToCloudLogging(logEntry) {
    try {
        // Only attempt direct Cloud Logging in production with proper credentials
        if (!isProduction() || !process.env.GOOGLE_CLOUD_PROJECT) {
            return;
        }
        // Use Google Cloud Logging client library if available
        let Logging = null;
        try {
            // Dynamic import with type assertion to avoid TypeScript build errors
            const cloudLogging = await import('@google-cloud/logging');
            Logging = cloudLogging.Logging;
        }
        catch (error) {
            // Cloud Logging not available, continue with console logging only
            console.warn('Cloud Logging not available, falling back to console logging');
            return;
        }
        if (Logging) {
            const logging = new Logging({
                projectId: process.env.GOOGLE_CLOUD_PROJECT,
            });
            const log = logging.log('security-events');
            const metadata = {
                resource: {
                    type: 'cloud_run_revision',
                    labels: {
                        project_id: process.env.GOOGLE_CLOUD_PROJECT,
                        service_name: process.env.K_SERVICE || 'lottosmartpicker-app',
                        revision_name: process.env.K_REVISION || 'unknown',
                        location: process.env.K_LOCATION || 'us-central1',
                    },
                },
                severity: logEntry.severity,
                labels: {
                    component: 'security-monitoring',
                    source: 'application'
                },
            };
            const entry = log.entry(metadata, logEntry);
            await log.write(entry);
        }
    }
    catch (error) {
        // Fallback to console logging if Cloud Logging fails
        console.error('Failed to send log to Cloud Logging:', error);
        console.log('Original log entry:', JSON.stringify(logEntry));
    }
}
export const logger = {
    info: (message, context) => log(LogLevel.INFO, message, context),
    warn: (message, context) => log(LogLevel.WARN, message, context),
    error: (message, context) => log(LogLevel.ERROR, message, context),
    security: (message, context) => log(LogLevel.SECURITY, message, context),
};
// --- Security Event Logging ---
export function logSecurityEvent(request, eventType, outcome, details) {
    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('remote-addr') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const sessionId = request.cookies.get('lsp.sid')?.value || 'none';
    logger.security(`Security Event: ${eventType} - ${outcome}`, {
        eventType,
        outcome,
        sessionId,
        ipAddress,
        userAgent,
        path: request.nextUrl.pathname,
        method: request.method,
        ...details,
    });
}
// --- Suspicious Activity Detection (Placeholder) ---
// This would involve more complex logic, potentially stateful analysis over time.
export function detectSuspiciousActivity(request, eventType, details) {
    // Example: Too many failed login attempts from an IP, unusual request patterns, etc.
    // For now, this is a placeholder.
    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('remote-addr') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    if (eventType === 'CSRF_TOKEN_MISMATCH') {
        logger.warn('Suspicious Activity: CSRF token mismatch detected', { ipAddress, userAgent, path: request.nextUrl.pathname, ...details });
        return true;
    }
    // Add more detection logic here
    return false;
}
