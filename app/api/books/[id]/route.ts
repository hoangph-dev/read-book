import { NextRequest, NextResponse } from 'next/server';

import { deleteBlob, getCatalog, readBlobText, saveCatalog } from '@/lib/blob-server';

export const runtime = 'nodejs';

async function findRow(id: string) {
  const rows = await getCatalog();
  return rows.find((r) => r.id === id) || null;
}

/** Toàn bộ sách (metadata + pages). Server đọc pages từ blob, client lưu lại IndexedDB để đọc offline. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await findRow(id);
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });

  let pages: unknown[] = [];
  if (row.pagesUrl) {
    try {
      pages = JSON.parse(await readBlobText(row.pagesUrl));
    } catch {
      pages = [];
    }
  }
  return NextResponse.json({ ...row, pages });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await getCatalog();
  const row = rows.find((r) => r.id === id);
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });

  await Promise.all([deleteBlob(row.pdfUrl || ''), deleteBlob(row.pagesUrl || '')]);
  await saveCatalog(rows.filter((r) => r.id !== id));
  return NextResponse.json({ ok: true });
}