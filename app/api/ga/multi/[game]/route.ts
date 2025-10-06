// app/api/multi/[game]/route.ts
import { NextResponse } from 'next/server';
export async function GET(_: Request, { params }: { params: { game: string } }) {
  return NextResponse.json({ ok: true, game: params.game });
}