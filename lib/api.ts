import { upload as blobUpload } from '@vercel/blob/client';

import type { Book, BookRow } from './types';

export interface BlobResult {
  url: string;
  downloadUrl: string;
  pathname: string;
}

let modePromise: Promise<boolean> | null = null;

/** Blob chạy ở chế độ local (dev) hay Vercel thật. */
function isLocalBlob(): Promise<boolean> {
  modePromise ||= fetch('/api/mode')
    .then((r) => r.json())
    .then((j) => Boolean(j && j.local))
    .catch(() => false);
  return modePromise;
}

/** Upload trực tiếp trình duyệt → blob (qua /api/blob-upload để cấp quyền). */
export async function uploadBlob(pathname: string, body: Blob): Promise<BlobResult> {
  if (await isLocalBlob()) {
    const fd = new FormData();
    fd.set('pathname', pathname);
    fd.set('file', body);
    const res = await fetch('/api/blob-upload', { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`upload local fail ${res.status}`);
    return res.json();
  }
  return blobUpload(pathname, body, {
    access: 'public',
    handleUploadUrl: '/api/blob-upload',
    clientPayload: undefined,
  });
}

export async function listSharedBooks(): Promise<BookRow[]> {
  const res = await fetch('/api/books', { cache: 'no-store' });
  if (!res.ok) throw new Error(`list books fail ${res.status}`);
  return res.json();
}

export async function getSharedBook(id: string): Promise<Book> {
  const res = await fetch(`/api/books/${encodeURIComponent(id)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`get book fail ${res.status}`);
  return res.json();
}

export async function createSharedBook(meta: Partial<BookRow>): Promise<BookRow> {
  const res = await fetch('/api/books', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(meta),
  });
  if (!res.ok) throw new Error(`create book fail ${res.status}`);
  return res.json();
}

export async function deleteSharedBook(id: string): Promise<void> {
  const res = await fetch(`/api/books/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`delete book fail ${res.status}`);
}