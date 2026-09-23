#!/usr/bin/env python3
"""Tạo PDF test 3 trang với text (ASCII) để kiểm tra pipeline trích xuất text."""
import zlib

def esc(s):
    out = ''
    for ch in s:
        o = ord(ch)
        if o == 40 or o == 41 or o == 92:
            out += '\\' + chr(o)
        elif 32 <= o <= 126:
            out += chr(o)
        else:
            out += '?'
    return out

body = ['Troi mua tam ta. Do la mot buoi chieu mua ha, khi nhung con gio',
     'lua qua tung tan cay truoc san. Toi ngoi ben cua so, lat tung trang',
     'giay cu va nghi ve nhung ngay xua.', '', 'Ben ngoai, con pho nho van tap nap nguoi qua lai.',
     '', 'Hom nay la mot ngay dep troi de doc sach. Vo van cau chu',
     'duoc viet ra de tinh trang sach them day du, nguoi doc co the',
     'cuon theo nhung trang sach va quen di thoi gian.', '', 'Ngoi nha nam cuoi con ngo, mai ngoi da phu reu xanh.',
     '"Doc sach la cach tot nhat de song nhieu cuoc doi cung luc", cu noi.',
     '', 'Toi gat dau, mo cuon sach tren tay va bat dau doc.']
pages_bodies = [['Tieu de cuon sach test']] + [body for _ in range(40)]

parts = [b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n']

def add_obj(num, data):
    parts.append(f'{num} 0 obj\n'.encode('latin-1'))
    offsets.append([num, None])
    parts.append(data)
    parts.append(b'\nendobj\n')

offsets = []
add_obj(1, b'<< /Type /Catalog /Pages 2 0 R >>')
kids = ' '.join(f'{3 + i*2} 0 R' for i in range(len(pages_bodies)))
add_obj(2, f'<< /Type /Pages /Kids [{kids}] /Count {len(pages_bodies)} >>'.encode('latin-1'))
add_obj(10, b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')

for i, body in enumerate(pages_bodies):
    content = ''.join(
        f'BT /F1 {18 if j == 0 else 13} Tf 60 {782 - j * 26} Td ({esc(ln)}) Tj ET\n'
        for j, ln in enumerate(body)
    ).encode('latin-1')
    comp = zlib.compress(content)
    page_num = 3 + i * 2
    stream_num = page_num + 1
    add_obj(page_num, f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 10 0 R >> >> /Contents {stream_num} 0 R >>'.encode('latin-1'))
    add_obj(stream_num, f'<< /Length {len(comp)} /Filter /FlateDecode >>\nstream\n'.encode('latin-1') + comp + b'\nendstream')

# compute offsets: iterate parts to find where each obj's "N 0 obj\n" starts
pos = 0
marker_pos = {}
for p in parts:
    marker_pos.setdefault(p, []).append(pos)
    pos += len(p)

buf = b''.join(parts)

# find offsets by scanning the final buffer
out_offsets = {}
scan = 0
i = 0
while i < len(parts):
    p = parts[i]
    if isinstance(p, bytes) and b' 0 obj\n' in p:
        num = int(p.split(b' ')[0])
        out_offsets[num] = scan
    scan += len(p)
    i += 1

xref_pos = len(buf)
n = len(offsets)
lines = [f'xref\n0 {n + 1}\n', '0000000000 65535 f \n']
for num, _ in offsets:
    lines.append(f'{out_offsets[num]:010d} 00000 n \n')
lines.append(f'trailer\n<< /Size {n + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n')
buf += ''.join(lines).encode('latin-1')

with open('test-book.pdf', 'wb') as f:
    f.write(buf)
print('wrote test-book.pdf', len(buf), 'bytes')