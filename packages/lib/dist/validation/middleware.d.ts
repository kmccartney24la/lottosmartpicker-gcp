import { NextRequest } from 'next/server';
import { z } from 'zod';
export declare function validateRequest(schema: z.ZodObject<any>): (request: NextRequest) => Promise<any>;
