import { NextRequest, NextResponse } from 'next/server';
import { getSession } from './session.js';

// Define roles or permissions (example)
export enum UserRole {
  Guest = 'guest',
  User = 'user',
  Admin = 'admin',
}

// In a real application, user roles/permissions would come from an authentication system.
// For this example, we'll simulate a user role based on session data or a simple check.
interface UserContext {
  sessionId: string;
  role: UserRole;
  // Add other user-specific data as needed
}

// Placeholder function to get user context from a request
// In a real app, this would involve decoding a JWT, looking up a user in a DB, etc.
export function getUserContext(request: NextRequest): UserContext {
  const sessionId = request.cookies.get('lsp.sid')?.value || '';
  const session = getSession(sessionId);

  // For demonstration, assign 'admin' role if a specific header is present, otherwise 'user'
  const isAdminHeader = request.headers.get('x-admin-override');
  const role = isAdminHeader === 'true' ? UserRole.Admin : UserRole.User;

  return { sessionId, role };
}

// Authorization middleware wrapper
export function authorize(requiredRole: UserRole) {
  return async (request: NextRequest) => {
    const userContext = getUserContext(request);

    // Simple role-based authorization
    if (userContext.role === UserRole.Admin) {
      return NextResponse.next(); // Admins can do anything
    }

    if (userContext.role === UserRole.User && requiredRole === UserRole.User) {
      return NextResponse.next(); // Users can access user-level resources
    }

    // More granular authorization checks would go here (e.g., resource ownership)
    // For example: if (request.url.includes('/api/user/') && userContext.userId === resourceOwnerId)

    return new NextResponse('Unauthorized', { status: 401 });
  };
}

// --- Resource-level access control examples ---
// These would typically be implemented within API route handlers,
// after the authorization middleware has verified the user's general permissions.

export function canAccessScratcher(user: UserContext, gameId: number): boolean {
  // Example: Only admins can access certain scratcher game data
  if (user.role === UserRole.Admin) {
    return true;
  }
  // For now, all users can access all scratcher data
  return true;
}

export function canModifyResource(user: UserContext, resourceId: string): boolean {
  // Example: Only the owner or an admin can modify a resource
  if (user.role === UserRole.Admin) {
    return true;
  }
  // if (user.userId === getResourceOwner(resourceId)) {
  //   return true;
  // }
  return false;
}