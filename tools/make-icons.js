import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function encodePNG(size, pixelFn) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelFn(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const BG = [19, 22, 31];
const EDGE = [37, 42, 58];
const BOOK = [243, 243, 248];
const LINE = [196, 200, 214];
const ACCENT = [94, 114, 235];

function inRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.max(x0 + r, Math.min(x1 - r, x));
  const cy = Math.max(y0 + r, Math.min(y1 - r, y));
  return Math.hypot(x - cx, y - cy) <= r;
}

function makeIcon(size) {
  const s = size / 512;
  const x0 = 40 * s, y0 = 40 * s, x1 = 472 * s, y1 = 472 * s, r = 96 * s;

  const pad = 30 * s, bsw = 78 * s;
  const bx = 40 * s + pad, by = 40 * s + pad;
  const bw = 432 * s - pad * 2, bh = 432 * s - pad * 2, bR = 54 * s;
  const spine = bsw;
  const px0 = bx + spine, pw = bw - spine;

  return encodePNG(size, (x, y) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return [0, 0, 0, 0];
    if (!inRoundedRect(x, y, x0, y0, x1, y1, r)) return [0, 0, 0, 0];
    const edgeWidth = 10 * s;
    if (!inRoundedRect(x, y, x0 + edgeWidth, y0 + edgeWidth, x1 - edgeWidth, y1 - edgeWidth, r - edgeWidth)) return EDGE;
    if (!inRoundedRect(x, y, bx, by, bx + bw, by + bh, bR)) return BG;

    if (x <= px0) return BOOK;
    const col = Math.floor((x - px0) / (pw / 3));
    const lineH = 22 * s, mL = 16 * s;
    const contentX0 = px0 + col * (pw / 3);
    const lx0 = contentX0 + mL, lx1 = contentX0 + pw / 3 - mL;

    if (col === 2 && y > by + bh * 0.78 && y < by + bh * 0.78 + 8 * s) return ACCENT;

    const ly = by + 30 * s;
    for (let i = 0; i < 10; i++) {
      const yy = ly + i * lineH;
      if (y > yy && y < yy + 4 * s) {
        if (i >= 4 && i <= 8 && col === 1) {
          const t = (x - lx0) / (lx1 - lx0);
          if (t < 0.95 && t * 100 < (i - 4) * 22 + 12 && x < contentX0 + pw / 3 * 0.85) return ACCENT;
        }
        return LINE;
      }
    }
    if (col === 1 && y > by + bh * 0.78 && y < by + bh * 0.78 + 8 * s && x > contentX0 + pw / 3 * 0.15) return ACCENT;
    return BOOK;
  });
}

mkdirSync('icons', { recursive: true });
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(`icons/${name}`, makeIcon(size));
  console.log(`wrote icons/${name}`);
}