import type { Page } from './extract';

export interface BookRow {
  /** uuid — trùng với tên file blob */
  id: string;
  title: string;
  author: string;
  pageCount: number;
  /** thư mục cá nhân (VD: "Chung", "Nguyễn Văn A", ...) */
  folder: string;
  size: number;
  pdfUrl?: string;
  pagesUrl?: string;
  updatedAt: number;
  /** phiên bản pipeline trích xuất (cho phép nâng cấp lại khi đổi engine) */
  ver?: number;
}

export interface Book extends BookRow {
  pages: Page[];
  /** vị trí đọc — chỉ lưu local (mỗi người đọc độc lập) */
  progress?: number;
  /** file gốc cho sách cá nhân offline (≤ 25MB) */
  file?: ArrayBuffer;
}

export type { Page };

export const CATALOG_PATH = 'catalog.json';

export function makeId(): string {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'b-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}