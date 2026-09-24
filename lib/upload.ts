import { extractText, EXTRACT_VERSION } from './extract';
import { createSharedBook, uploadBlob } from './api';
import { idbPut } from './idb';
import { makeId, type Book } from './types';

export interface UploadProgress {
  phase: 'extract' | 'upload';
  cur: number;
  total: number;
}

/**
 * Xử lý PDF tại trình duyệt (trích xuất) rồi:
 * - shared: upload PDF + pages lên blob trực tiếp, ghi catalog qua API, cache local.
 * - offline: chỉ lưu IndexedDB.
 */
export async function uploadBook(
  file: File,
  folder: string,
  shared: boolean,
  onProgress: (p: UploadProgress) => void,
): Promise<Book> {
  onProgress({ phase: 'extract', cur: 0, total: 1 });
  const ab = await file.arrayBuffer();
  const fileCopy = !shared && file.size <= 25 * 1024 * 1024 ? ab.slice(0) : undefined;

  // pdf.js transfer (detach) buffer khi parse — lấy bản sao cho upload trước khi parse cũng được
  const { pages, title, author, numPages } = await extractText(ab, (cur, total) =>
    onProgress({ phase: 'extract', cur, total }),
  );

  const id = makeId();
  const base = {
    title: title || file.name.replace(/\.pdf$/i, '').trim() || 'Sách không tên',
    author,
    pageCount: numPages,
    folder,
    size: file.size,
    updatedAt: Date.now(),
    ver: EXTRACT_VERSION,
  };

  if (shared) {
    onProgress({ phase: 'upload', cur: 0, total: 2 });
    const [pdfRes, pagesRes] = await Promise.all([
      uploadBlob(`books/${id}/${id}.pdf`, file),
      uploadBlob(`books/${id}/${id}.pages.json`, new Blob([JSON.stringify(pages)], { type: 'application/json' })),
    ]);
    const row = await createSharedBook({ id, ...base, pdfUrl: pdfRes.url, pagesUrl: pagesRes.url });
    onProgress({ phase: 'upload', cur: 2, total: 2 });
    const book: Book = { ...row, pages, progress: 0 };
    await idbPut(book);
    return book;
  }

  const book: Book = { id, ...base, pages, progress: 0 };
  if (fileCopy) book.file = fileCopy;
  await idbPut(book);
  return book;
}