// app/api/ga/cash4life/route.ts
import { NextResponse } from 'next/server';
export async function GET() { return NextResponse.json({ ok: true, game: 'cash4life' }); }
