import { NextRequest } from 'next/server';
interface SessionData {
    csrfToken: string;
    createdAt: number;
    ipAddress?: string;
    userAgent?: string;
}
export declare function generateCsrfToken(): string;
export declare function validateCsrfToken(sessionId: string, token: string): boolean;
export declare function createSession(request: NextRequest): string;
export declare function getSession(sessionId: string): SessionData | undefined;
export declare function rotateCsrfToken(sessionId: string): string | undefined;
export declare function cleanupExpiredSessions(): void;
export declare function isSessionExpired(sessionId: string): boolean;
export {};
