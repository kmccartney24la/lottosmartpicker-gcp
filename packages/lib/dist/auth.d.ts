import { NextRequest } from 'next/server';
export declare enum UserRole {
    Guest = "guest",
    User = "user",
    Admin = "admin"
}
interface UserContext {
    sessionId: string;
    role: UserRole;
}
export declare function getUserContext(request: NextRequest): UserContext;
export declare function authorize(requiredRole: UserRole): (request: NextRequest) => Promise<any>;
export declare function canAccessScratcher(user: UserContext, gameId: number): boolean;
export declare function canModifyResource(user: UserContext, resourceId: string): boolean;
export {};
