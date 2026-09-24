import { NextResponse } from 'next/server';

import { LOCAL_ROOT } from '@/lib/blob-server';

export const runtime = 'nodejs';

/** Cho client biết blob đang chạy local (dev) hay Vercel. */
export async function GET() {
  return NextResponse.json({ local: Boolean(LOCAL_ROOT) });
}