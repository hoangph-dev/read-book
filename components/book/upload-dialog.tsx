'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { LibraryBig, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { uploadBook, type UploadProgress } from '@/lib/upload';

export function UploadDialog({ folders, onUploaded }: { folders: string[]; onUploaded: () => Promise<void> | void }) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const fileRef = useRef<File | null>(null);
  const [folder, setFolder] = useState('Chung');
  const [shared, setShared] = useState(true);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    fileRef.current = e.target.files?.[0] || null;
  };

  const start = async () => {
    const file = fileRef.current;
    if (!file) {
      toast('Chọn file PDF trước');
      return;
    }
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast('Chỉ hỗ trợ file PDF');
      return;
    }
    if (file.size > 200 * 1024 * 1024) {
      toast('File quá lớn (tối đa 200 MB)');
      return;
    }
    setRunning(true);
    setProgress({ phase: 'extract', cur: 0, total: 1 });
    try {
      await uploadBook(file, folder.trim() || 'Chung', shared, setProgress);
      toast(shared ? 'Đã đăng lên thư viện chung' : 'Đã lưu sách trên máy');
      setOpen(false);
      await onUploaded();
    } catch (err) {
      console.error(err);
      toast('Đăng tải thất bại. Kiểm tra kết nối hoặc thử lại.');
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  const pct = progress ? Math.round((progress.cur / Math.max(1, progress.total)) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" className="h-9 w-9 rounded-full" title="Thêm sách PDF" aria-label="Thêm sách PDF">
          <Upload className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Thêm sách PDF</DialogTitle>
          <DialogDescription>PDF được xử lý ngay tại máy, không tải lên máy chủ dưới dạng thô.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="book-file">File PDF</Label>
            <Input id="book-file" type="file" accept="application/pdf,.pdf" onChange={handleFile} disabled={running} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="book-folder">Thư mục</Label>
            <Select value={folder} onValueChange={setFolder} disabled={running}>
              <SelectTrigger id="book-folder">
                <SelectValue placeholder="Chọn thư mục" />
              </SelectTrigger>
              <SelectContent>
                {[...new Set(['Chung', ...folders, folder])]
                  .filter(Boolean)
                  .slice(0, 40)
                  .map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {![...new Set(['Chung', ...folders])].includes(folder) && folder !== 'Chung' ? (
              <p className="text-xs text-muted-foreground">Thư mục mới «{folder}» sẽ được tạo.</p>
            ) : null}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!shared}
              onChange={(e) => setShared(!e.target.checked)}
              disabled={running}
              className="h-4 w-4 rounded border-input"
            />
            <span className="inline-flex items-center gap-1">
              <LibraryBig className="h-3.5 w-3.5" />
              Chỉ lưu trên máy (không đăng lên thư viện chung)
            </span>
          </label>

          {running && progress ? (
            <div className="grid gap-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{progress.phase === 'extract' ? 'Đang đọc nội dung PDF…' : 'Đang đăng tải…'}</span>
                <span>
                  {progress.cur}/{progress.total}
                </span>
              </div>
              <Progress value={pct} />
            </div>
          ) : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={running}>
            Hủy
          </Button>
          <Button onClick={start} disabled={running}>
            {running ? 'Đang xử lý…' : 'Thêm sách'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}