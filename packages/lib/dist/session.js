import { NextRequest } from 'next/server';
import { nanoid } from 'nanoid'; // For generating unique IDs
const CSRF_TOKEN_SECRET = process.env.CSRF_TOKEN_SECRET || 'super-secret-csrf-key';
const SESSION_SECRET = process.env.SESSION_SECRET || 'super-secret-session-key';
const sessions = new Map(); // Map session ID to session data
// Generates a new CSRF token
export function generateCsrfToken() {
    return nanoid(32); // 32-character alphanumeric token
}
// Validates a CSRF token against the session
export function validateCsrfToken(sessionId, token) {
    const session = sessions.get(sessionId);
    if (!session) {
        return false;
    }
    return session.csrfToken === token;
}
// Creates a new session and returns a session ID
export function createSession(request) {
    const sessionId = nanoid(64); // 64-character alphanumeric session ID
    const csrfToken = generateCsrfToken();
    const sessionData = {
        csrfToken,
        createdAt: Date.now(),
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('remote-addr') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
    };
    sessions.set(sessionId, sessionData);
    return sessionId;
}
// Retrieves session data
export function getSession(sessionId) {
    return sessions.get(sessionId);
}
// Rotates the CSRF token for a given session
export function rotateCsrfToken(sessionId) {
    const session = sessions.get(sessionId);
    if (session) {
        session.csrfToken = generateCsrfToken();
        sessions.set(sessionId, session);
        return session.csrfToken;
    }
    return undefined;
}
// Cleans up expired sessions (placeholder for a real implementation)
export function cleanupExpiredSessions() {
    // In a real scenario, this would iterate through sessions and remove expired ones.
    // For in-memory, we'll keep it simple.
    console.log('Cleaning up expired sessions (placeholder)');
}
// Placeholder for session expiration logic
export function isSessionExpired(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) {
        return true; // Session not found, consider it expired
    }
    // Example: session expires after 1 hour (3600 * 1000 ms)
    const SESSION_EXPIRATION_MS = 3600 * 1000;
    return (Date.now() - session.createdAt) > SESSION_EXPIRATION_MS;
}
