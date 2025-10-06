// lib/logger.ts
import { NextRequest } from 'next/server';

export enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  SECURITY = 'SECURITY',
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
}

// A simple logger for demonstration. In a real application, this would integrate
// with a dedicated logging service (e.g., Google Cloud Logging, Winston, Pino).
function log(level: LogLevel, message: string, context?: Record<string, any>) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
  };
  // For now, log to console. In production, this would send to a logging service.
  console.log(JSON.stringify(entry));
}

export const logger = {
  info: (message: string, context?: Record<string, any>) => log(LogLevel.INFO, message, context),
  warn: (message: string, context?: Record<string, any>) => log(LogLevel.WARN, message, context),
  error: (message: string, context?: Record<string, any>) => log(LogLevel.ERROR, message, context),
  security: (message: string, context?: Record<string, any>) => log(LogLevel.SECURITY, message, context),
};

// --- Security Event Logging ---

export function logSecurityEvent(
  request: NextRequest,
  eventType: string,
  outcome: 'success' | 'failure',
  details?: Record<string, any>
) {
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
export function detectSuspiciousActivity(request: NextRequest, eventType: string, details?: Record<string, any>): boolean {
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