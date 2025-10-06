// app/api/ga/fantasy5/route.ts
import { NextResponse } from 'next/server';
export async function GET() { return NextResponse.json({ ok: true, game: 'fantasy5' }); }