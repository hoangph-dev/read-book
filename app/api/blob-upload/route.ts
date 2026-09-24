import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { LOCAL_ROOT } from '@/lib/blob-server';

export const runtime = 'nodejs';

/**
 * Endpoint cấp quyền upload trực tiếp từ trình duyệt lên Blob.
 * Việc nặng (PDF nhiều MB, pages JSON) đi thẳng client → blob, không qua hàm serverless.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (LOCAL_ROOT) {
    const fd = await request.formData();
    const file = fd.get('file');
    const pathname = String(fd.get('pathname') || '');
    if (!(file instanceof File) || !pathname) {
      return NextResponse.json({ error: 'thiếu file/pathname' }, { status: 400 });
    }
    const rel = pathname.replace(/^\/+/, '');
    const dir = join(LOCAL_ROOT, rel.split('/').slice(0, -1).join('/'));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(LOCAL_ROOT, rel), Buffer.from(await file.arrayBuffer()));
    const url = `/api/dev-blob/${rel}`;
    return NextResponse.json({ url, downloadUrl: url, pathname: rel });
  }

  try {
    const jsonResponse = await handleUpload({
      body: request.body as unknown as HandleUploadBody,
      request,
      onBeforeGenerateToken: async (_pathname, _clientPayload) => {
        return { allowedContentTypes: ['application/pdf', 'application/json', 'image/jpeg', 'image/png'], maximumSizeInBytes: 200 * 1024 * 1024 };
      },
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}