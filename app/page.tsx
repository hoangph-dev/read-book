'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { BookOpenText, Plus } from 'lucide-react';

import { BookCard } from '@/components/book/book-card';
import { UploadDialog } from '@/components/book/upload-dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { deleteSharedBook, listSharedBooks } from '@/lib/api';
import { idbDelete, idbGetAll } from '@/lib/idb';
import type { Book, BookRow } from '@/lib/types';

type RowWithProgress = BookRow & { progress?: number };

export default function HomePage() {
  const [shared, setShared] = useState<RowWithProgress[]>([]);
  const [local, setLocal] = useState<Book[]>([]);
  const [tab, setTab] = useState('shared');
  const [localByFolder, setLocalByFolder] = useState<Record<string, Book[]>>({});

  const refresh = useCallback(async () => {
    const [rows, books] = await Promise.all([listSharedBooks(), idbGetAll()]);
    const localMap = new Map(books.map((b) => [b.id, b]));
    setShared(rows.map((r) => (localMap.has(r.id) ? { ...r, progress: localMap.get(r.id)?.progress } : r)));
    setLocal(books.filter((b) => !rows.some((r) => r.id === b.id)));
  }, []);

  useEffect(() => {
    refresh().catch((e) => {
      console.error(e);
      toast(e instanceof Error ? e.message : 'Không tải được thư viện chung.');
    });
  }, [refresh]);

  const folders = useMemo(() => [...new Set(shared.map((b) => b.folder || 'Chung'))].sort(), [shared]);

  useEffect(() => {
    const grouped: Record<string, Book[]> = {};
    for (const b of local) {
      const f = b.folder || 'Chung';
      (grouped[f] ||= []).push(b);
    }
    setLocalByFolder(grouped);
  }, [local]);

  const confirmDeleteShared = async (b: BookRow) => {
    if (!window.confirm(`Xóa "${b.title}" khỏi thư viện chung?`)) return;
    try {
      await deleteSharedBook(b.id);
      await idbDelete(b.id);
      toast('Đã xóa sách');
      await refresh();
    } catch (e) {
      console.error(e);
      toast('Xóa thất bại');
    }
  };

  const confirmDeleteLocal = async (b: Book) => {
    if (!window.confirm(`Xóa "${b.title}" khỏi máy?`)) return;
    await idbDelete(b.id);
    toast('Đã xóa sách');
    await refresh();
  };

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      <header className="sticky top-0 z-20 -mx-4 flex items-center gap-3 border-b bg-background/85 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur">
        <h1 className="flex-1 text-lg font-semibold tracking-tight">
          <span className="inline-flex items-center gap-2">
            <BookOpenText className="h-5 w-5 text-primary" />
            Thư viện sách
          </span>
        </h1>
        <span className="text-sm text-muted-foreground">
          {shared.length + local.length > 0 ? `${shared.length + local.length} cuốn` : ''}
        </span>
        <UploadDialog folders={folders} onUploaded={refresh} />
      </header>

      <main className="pt-4">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="max-w-full overflow-x-auto">
            <TabsTrigger value="shared">Thư viện chung</TabsTrigger>
            <TabsTrigger value="local">Sách của tôi</TabsTrigger>
          </TabsList>

          <TabsContent value="shared">
            {shared.length === 0 && local.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-24 text-center text-sm text-muted-foreground">
                <Plus className="h-8 w-8 opacity-50" />
                <p>Chưa có sách nào trong thư viện chung.</p>
                <p className="max-w-xs text-xs">Bấm nút <b>+</b> ở góc trên phải để thêm file PDF. Mọi người truy cập website đều đọc được sách này.</p>
              </div>
            ) : shared.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-24 text-center text-sm text-muted-foreground">
                <p>Chưa có sách chung. Đăng sách của bạn lên nhé!</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {folders.map((f) => {
                  const books = shared.filter((b) => (b.folder || 'Chung') === f);
                  const selected = tab + f;
                  return (
                    <section key={selected}>
                      <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
                        {f} <span className="font-normal">· {books.length}</span>
                      </h2>
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
                        {books.map((b) => (
                          <BookCard key={b.id} book={b} progress={b.progress} source="shared" onDelete={() => confirmDeleteShared(b)} />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="local">
            {local.length === 0 ? (
              <div className="py-24 text-center text-sm text-muted-foreground">
                Chưa có sách lưu riêng trên máy này.
              </div>
            ) : (
              <div className="grid gap-4">
                {Object.entries(localByFolder).map(([f, books]) => (
                  <section key={f}>
                    <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
                      {f} <span className="font-normal">· {books.length}</span>
                    </h2>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
                      {books.map((b) => (
                        <BookCard key={b.id} book={b} progress={b.progress} source="local" onDelete={() => confirmDeleteLocal(b)} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <footer className="mt-10 pb-[calc(1rem+env(safe-area-inset-bottom))] text-center text-xs text-muted-foreground">
        Sách chung được lưu trên máy chủ; sách cá nhân chỉ nằm trên thiết bị này.
      </footer>
    </div>
  );
}