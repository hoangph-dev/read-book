import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

import { LOCAL_ROOT } from '@/lib/blob-server';

export const runtime = 'nodejs';

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/** Dev-only: phục vụ file blob local như URL thật. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  if (!LOCAL_ROOT) return new NextResponse('not found', { status: 404 });
  const { path } = await params;
  const rel = path.join('/');
  const p = join(LOCAL_ROOT, rel);
  if (!existsSync(p)) return new NextResponse('not found', { status: 404 });
  const ext = extname(p).toLowerCase();
  const buf = readFileSync(p);
  return new NextResponse(new Uint8Array(buf), {
    headers: { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
}