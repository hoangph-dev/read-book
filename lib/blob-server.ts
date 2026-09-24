import { del as blobDel, put as blobPut, list as blobList, type PutBlobResult } from '@vercel/blob';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import type { BookRow } from './types';
import { CATALOG_PATH } from './types';

/**
 * Tầng lưu trữ: dev dùng thư mục local (BLOB_LOCAL_ROOT), Vercel dùng Vercel Blob.
 * URL local có dạng /api/dev-blob/<rel> — client gọi như URL blob thật.
 */
export const LOCAL_ROOT = process.env.BLOB_LOCAL_ROOT;

export interface Uploaded {
  url: string;
  downloadUrl: string;
  pathname: string;
}

export function localUrl(pathname: string): string {
  return `/api/dev-blob/${pathname.replace(/^\/+/, '')}`;
}

export async function putBlob(
  pathname: string,
  body: string | Blob | ArrayBuffer,
  contentType: string,
): Promise<Uploaded> {
  if (LOCAL_ROOT) {
    const rel = pathname.replace(/^\/+/, '');
    const dir = join(LOCAL_ROOT, rel.split('/').slice(0, -1).join('/'));
    mkdirSync(dir, { recursive: true });
    if (typeof body === 'string') {
      writeFileSync(join(LOCAL_ROOT, rel), body);
    } else if (body instanceof ArrayBuffer) {
      writeFileSync(join(LOCAL_ROOT, rel), Buffer.from(body));
    } else {
      writeFileSync(join(LOCAL_ROOT, rel), Buffer.from(await body.arrayBuffer()));
    }
    return { url: localUrl(rel), downloadUrl: localUrl(rel), pathname: rel };
  }
  const res: PutBlobResult = await blobPut(pathname, body, {
    access: 'public',
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return { url: res.url, downloadUrl: res.downloadUrl, pathname: res.pathname };
}

export async function readBlobText(url: string): Promise<string> {
  if (LOCAL_ROOT && url.startsWith('/api/dev-blob/')) {
    const rel = url.replace(/^\/api\/dev-blob\//, '');
    return readFileSync(join(LOCAL_ROOT, rel), 'utf8');
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`read blob fail ${res.status}: ${url}`);
  return res.text();
}

export async function deleteBlob(url: string): Promise<void> {
  if (!url) return;
  if (LOCAL_ROOT && url.startsWith('/api/dev-blob/')) {
    const rel = url.replace(/^\/api\/dev-blob\//, '');
    const p = join(LOCAL_ROOT, rel);
    if (existsSync(p)) rmSync(p);
    return;
  }
  try {
    await blobDel(url);
  } catch {
    /* blob xóa hỏng thì bỏ qua */
  }
}

export async function getCatalog(): Promise<BookRow[]> {
  let url: string | null = null;
  if (LOCAL_ROOT) {
    url = localUrl(CATALOG_PATH);
  } else {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw new Error('Chưa cấu hình BLOB_READ_WRITE_TOKEN (Vercel Blob)');
    }
    const { blobs } = await blobList();
    const found = blobs.find((b) => b.pathname === CATALOG_PATH);
    if (!found) {
      await putBlob(CATALOG_PATH, '[]', 'application/json');
      return [];
    }
    url = found.url;
  }
  try {
    const src = await readBlobText(url);
    const arr = JSON.parse(src);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function saveCatalog(rows: BookRow[]): Promise<void> {
  await putBlob(CATALOG_PATH, JSON.stringify(rows), 'application/json');
}