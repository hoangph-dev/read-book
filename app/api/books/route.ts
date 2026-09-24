import { NextRequest, NextResponse } from 'next/server';

import { getCatalog, saveCatalog } from '@/lib/blob-server';
import type { BookRow } from '@/lib/types';

export const runtime = 'nodejs';

function toRow(body: Partial<BookRow>): BookRow {
  return {
    id: String(body.id || crypto.randomUUID()),
    title: String(body.title || 'Sách không tên').slice(0, 300),
    author: String(body.author || '').slice(0, 300),
    pageCount: Math.max(1, Math.floor(Number(body.pageCount) || 1)),
    folder: String(body.folder || 'Chung').slice(0, 100),
    size: Math.max(0, Number(body.size) || 0),
    pdfUrl: String(body.pdfUrl || ''),
    pagesUrl: String(body.pagesUrl || ''),
    updatedAt: Number(body.updatedAt) || Date.now(),
    ver: Number(body.ver) || undefined,
  };
}

/** Danh sách sách chung (không kèm pages/url file để nhẹ). */
export async function GET() {
  const rows = await getCatalog();
  const list = rows.map(({ pagesUrl: _p, pdfUrl: _f, ver: _v, ...rest }) => rest);
  return NextResponse.json(list);
}

/** Ghi thêm (hoặc cập nhật) một đầu sách — payload nhỏ, dữ liệu nặng đã nằm ở blob. */
export async function POST(req: NextRequest) {
  let body: Partial<BookRow>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'body không hợp lệ' }, { status: 400 });
  }
  if (!String(body.id || '')) body.id = crypto.randomUUID();
  const row = toRow(body);

  const rows = await getCatalog();
  const idx = rows.findIndex((r) => r.id === row.id);
  if (idx >= 0) rows[idx] = row;
  else rows.push(row);
  await saveCatalog(rows);

  const { pdfUrl: _p, pagesUrl: _f, ver: _v, ...rest } = row;
  return NextResponse.json(rest, { status: 201 });
}