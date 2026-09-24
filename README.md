# Đọc sách PDF — Thư viện chung

PWA đọc sách PDF chạy trên **Next.js (App Router) + shadcn/ui**, deploy **Vercel**.
Người dùng A tải PDF lên → mọi người truy cập website đều đọc được. Sách được
trích xuất văn bản ngay tại trình duyệt, lưu **Vercel Blob** (không cần database).

## Chạy local

```bash
npm install
BLOB_LOCAL_ROOT=./dev-blobs npm run dev
# mở http://localhost:3000
```

- Chế độ dev không cần tài khoản Vercel: blob được ghi vào `dev-blobs/` và phục
  vụ qua `/api/dev-blob/...`.
- Xóa dữ liệu test: `rm -rf dev-blobs`

## Deploy lên Vercel

1. Tạo project trên Vercel, import repo này.
2. Thêm **Vercel Blob Storage** (tab Storage) — Vercel tự tạo env
   `BLOB_READ_WRITE_TOKEN` (hoặc tự thêm token từ dashboard → Settings → Storage).
3. Deploy. Không cần cấu hình thêm: dữ liệu nặng (PDF, trang ảnh) được trình
   duyệt tải **trực tiếp lên Blob** qua endpoint `/api/blob-upload` (presigned),
   nên không vướng giới hạn body của serverless function. Gate: mọi người đều
   upload được (dự án nội bộ).

## Kiến trúc dữ liệu

| Nơi | Dữ liệu |
|---|---|
| Vercel Blob `catalog.json` | Danh sách sách chung (metadata, không kèm pages) |
| Vercel Blob `books/<id>/<id>.pdf` + `.pages.json` | File gốc + toàn bộ trang đã trích xuất |
| IndexedDB (mỗi trình duyệt) | Cache sách đã đọc (đọc offline) + `progress` (vị trí đọc riêng mỗi người) + sách "chỉ lưu máy" |
| localStorage | Cài đặt đọc (cỡ chữ, font, theme) |

API: `POST/GET /api/books`, `GET/DELETE /api/books/[id]`, `POST /api/blob-upload`,
`GET /api/mode`. Sách chung cập nhật qua đọc-ghi `catalog.json` (đủ dùng cho
dự án nội bộ; ghi đồng thời hiếm).

## Pipeline trích xuất PDF (lib/extract.ts)

`pdf.js` → text items (tọa độ) → `layoutPage()`:
tách cột, gom dòng theo baseline, dấu tiếng Việt NFC, bỏ item trùng lặp,
tự tách đoạn; trang rác/scan được **render thành ảnh JPEG** lưu trong pages.
Phiên bản pipeline theo `EXTRACT_VERSION` → sách cũ tự nâng cấp khi mở.

## Kiểm thử

```bash
npm run test    # unit test layout (8 case)
npm run e2e     # build production + kịch bản: A upload → B đọc (headless Chrome)
```

## Cấu trúc

```
app/            Next.js: / (tủ sách), /read/[id] (trình đọc), api/*
components/ui/  shadcn/ui (Button, Dialog, Tabs, Select, Progress, ...)
components/book/ UploadDialog, BookCard
lib/            extract.ts, upload.ts, api.ts, idb.ts, blob-server.ts, types.ts
public/         sw.js (PWA shell), manifest, icons, pdf.worker
scripts/        e2e.mjs, copy-worker.mjs
tests/          layout.test.ts
```