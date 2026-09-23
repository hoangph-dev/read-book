# Sách — PDF Reader PWA

Ứng dụng đọc sách PDF kiểu reflow (chuyển thành văn bản sạch như ebook), chạy được trên
mọi thiết bị (Android, iPhone, máy tính), **hoạt động hoàn toàn offline**, tự lưu vị trí đọc.

Giải quyết bài toán: đọc PDF trực tiếp khó đọc trên điện thoại (không có chế độ đọc sách,
không lưu vệt mình đã đọc đến đâu).

## Tính năng

- **Chế độ đọc sách**: PDF được trích xuất thành văn bản, hiển thị lại như ebook — chữ to,
  giãn dòng, cột tối ưu, ngắt theo từng trang PDF kèm số trang.
- **Tự lưu tiến độ**: vị trí đọc được ghi tự động khi cuộn/dừng/rời trang; mở lại là đọc tiếp
  đúng đoạn, thư viện hiển thị % và nút "Đọc tiếp".
- **Tùy chỉnh trải nghiệm**: cỡ chữ (A−/A+), font Serif/Sans, 3 nền — tối / giấy vàng / sáng.
- **Offline 100%**: là PWA — sau lần mở đầu, sách + ứng dụng hoạt động không cần internet.
- **Quyền riêng tư**: toàn bộ sách và tiến độ lưu trong IndexedDB trên thiết bị, không gửi
  đi đâu, không cần tài khoản.

## Chạy thử

```bash
python3 -m http.server 8000
```

Mở `http://localhost:8000` trên máy, hoặc `http://<địa-chỉ-máy>:8000` trên điện thoại cùng WiFi
(Chrome → menu ⋮ → **Add to Home screen** để cài như app).

> Service worker chỉ hoạt động trên `localhost` hoặc HTTPS. Muốn dùng lâu dài trên điện thoại,
> deploy lên Netlify / Vercel / GitHub Pages là xong.

## Kiến trúc

| File | Chức năng |
|---|---|
| `index.html` + `js/app.js` | Thư viện sách: thêm PDF, trích xuất text (pdf.js), quản lý % tiến độ |
| `reader.html` + `js/reader.js` | Màn hình đọc reflow + tự lưu vị trí |
| `js/db.js` | Lớp IndexedDB |
| `sw.js`, `manifest.webmanifest` | PWA: cache offline + cài ra màn hình chính |
| `vendor/pdfjs/` | pdf.js bản địa (không phụ thuộc CDN) |
| `tools/` | Script sinh icon/PDF test, test E2E chạy bằng headless Chrome |

Sách được lưu dưới dạng văn bản đã trích xuất (kèm PDF gốc đã giải phóng ngay khi xử lý xong),
nên mở lại tức thì, không phải parse lại.

## Test

```bash
node tools/e2e.mjs   # E2E: import PDF → đọc → lưu tiến độ → offline, chạy bằng Chrome headless
```

Yêu cầu `google-chrome` trong PATH (hoặc đặt biến môi trường `CHROME`).

## Giới hạn

- PDF là ảnh scan (không có lớp chữ) sẽ không trích xuất được — cần OCR.
- Sách có bố cục nhiều cột / phức tạp có thể sai thứ tự văn bản; tiểu thuyết PDF thường chuẩn.