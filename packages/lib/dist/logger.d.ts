import { NextRequest } from 'next/server';
export declare enum LogLevel {
    INFO = "INFO",
    WARN = "WARN",
    ERROR = "ERROR",
    SECURITY = "SECURITY"
}
export declare const logger: {
    info: (message: string, context?: Record<string, any>) => void;
    warn: (message: string, context?: Record<string, any>) => void;
    error: (message: string, context?: Record<string, any>) => void;
    security: (message: string, context?: Record<string, any>) => void;
};
export declare function logSecurityEvent(request: NextRequest, eventType: string, outcome: 'success' | 'failure', details?: Record<string, any>): void;
export declare function detectSuspiciousActivity(request: NextRequest, eventType: string, details?: Record<string, any>): boolean;
