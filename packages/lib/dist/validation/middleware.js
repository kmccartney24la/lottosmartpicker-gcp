import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
export function validateRequest(schema) {
    return async (request) => {
        try {
            const url = new URL(request.url);
            const queryParams = Object.fromEntries(url.searchParams.entries());
            // For GET requests, validate query parameters
            if (request.method === 'GET') {
                schema.parse(queryParams);
            }
            else {
                // For other methods (POST, PUT, etc.), validate the request body
                // Note: This assumes JSON body. Adjust if other content types are expected.
                const body = await request.json();
                schema.parse(body);
            }
            return NextResponse.next();
        }
        catch (error) {
            if (error instanceof ZodError) {
                return NextResponse.json({ errors: JSON.parse(JSON.stringify(error)) }, { status: 400 });
            }
            return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
        }
    };
}
