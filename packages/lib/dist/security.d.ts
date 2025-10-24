import { NextRequest, NextResponse } from 'next/server';
export declare function enforceRequestSizeLimit(request: NextRequest): Promise<NextResponse | null>;
export declare function enforceTimeout(request: NextRequest): Promise<NextResponse | null>;
export declare function enforceRateLimit(request: NextRequest): NextResponse | null;
