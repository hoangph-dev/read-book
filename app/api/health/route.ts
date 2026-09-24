import { NextResponse } from 'next/server';

import { LOCAL_ROOT } from '@/lib/blob-server';

export const runtime = 'nodejs';

/** Kiểm tra nhanh cấu hình server — mở https://<tên>.vercel.app/api/health */
export async function GET() {
  return NextResponse.json({
    ok: true,
    blob: Boolean(LOCAL_ROOT || process.env.BLOB_READ_WRITE_TOKEN),
    local: Boolean(LOCAL_ROOT),
  });
}
