import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    envSeen: {
      GA_FANTASY5_REMOTE_CSV_URL: !!process.env.GA_FANTASY5_REMOTE_CSV_URL,
      GA_CASH4LIFE_REMOTE_CSV_URL: !!process.env.GA_CASH4LIFE_REMOTE_CSV_URL,
      GA_POWERBALL_REMOTE_CSV_URL: !!process.env.GA_POWERBALL_REMOTE_CSV_URL,
      GA_MEGAMILLIONS_REMOTE_CSV_URL: !!process.env.GA_MEGAMILLIONS_REMOTE_CSV_URL,
    },
    now: new Date().toISOString(),
  });
}

