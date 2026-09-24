'use client';

import Link from 'next/link';

import type { BookRow } from '@/lib/types';

function coverHue(title: string): number {
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 360;
}

export function BookCard({
  book,
  progress,
  source,
  onDelete,
}: {
  book: BookRow;
  progress?: number;
  source: 'shared' | 'local';
  onDelete?: () => void;
}) {
  const pct = Math.round((progress || 0) * 100);
  const hue = coverHue(book.title || 'sach');

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow transition-transform active:scale-[0.98]">
      <Link href={`/read/${encodeURIComponent(book.id)}`} className="flex-1">
        <div
          className="relative grid aspect-[3/4.2] place-items-center text-white"
          style={{ background: `linear-gradient(160deg, hsl(${hue} 38% 26%), hsl(${hue} 42% 14%))` }}
        >
          <span className="font-serif text-5xl font-semibold drop-shadow" style={{ textShadow: '0 2px 12px rgb(0 0 0 / 0.35)' }}>
            {(book.title || '?').trim().charAt(0).toUpperCase()}
          </span>
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/25">
            <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
          {source === 'local' && (
            <span className="absolute right-1.5 top-1.5 rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-medium text-foreground backdrop-blur">
              Máy
            </span>
          )}
        </div>
        <div className="p-3 pb-1.5">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{book.title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {book.pageCount} trang · {pct}%
          </p>
          {book.author ? <p className="truncate text-xs text-muted-foreground">{book.author}</p> : null}
        </div>
      </Link>
      <div className="flex gap-1.5 p-2.5 pt-1">
        <Link
          href={`/read/${encodeURIComponent(book.id)}`}
          className="inline-flex h-8 flex-1 items-center justify-center rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
        >
          {pct > 0 ? 'Đọc tiếp' : 'Mở sách'}
        </Link>
        {onDelete ? (
          <button
            onClick={onDelete}
            className="inline-flex h-8 flex-1 items-center justify-center rounded-full bg-secondary px-3 text-xs font-medium text-secondary-foreground hover:bg-accent"
          >
            Xóa
          </button>
        ) : null}
      </div>
    </div>
  );
}