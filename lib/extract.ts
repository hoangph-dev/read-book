import * as pdfjsLib from 'pdfjs-dist';

export const EXTRACT_VERSION = 2;

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

export type ImagePage = { kind: 'image'; src: string; w: number; h: number };
export type Page = string | ImagePage;

interface RawItem {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
}

const COMBINING =
  /[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]/;

function normStr(s: string): string {
  let out = '';
  const str = String(s).normalize('NFC');
  for (const ch of str) {
    const c = ch.codePointAt(0)!;
    if (c < 32 && c !== 9) continue;
    out += ch;
  }
  return out;
}

interface El {
  str: string;
  x: number;
  y: number;
  h: number;
  w: number;
}

interface Line {
  y0: number;
  y1: number;
  x0: number;
  x1: number;
  items: El[];
}

/** Dựng lại văn bản đọc được từ text items của pdf.js (mắt xích chính). */
export function layoutPage(items: RawItem[]): string {
  const els: El[] = [];
  const seenByStr = new Map<string, { x: number; y: number }>();
  for (const o of items) {
    if (!o || typeof o.str !== 'string') continue;
    const x = o.transform ? o.transform[4] : 0;
    const y = o.transform ? o.transform[5] : 0;
    const h = Math.abs(o.transform ? o.transform[3] : 0) || o.height || 1;
    const w = o.width || 0;
    const str = normStr(o.str).trim();
    if (!str) continue;
    const prevSeen = seenByStr.get(str);
    if (prevSeen && Math.abs(x - prevSeen.x) < 1 && Math.abs(y - prevSeen.y) < 1) continue;
    seenByStr.set(str, { x, y });
    els.push({ str, x, y, h, w });
  }
  if (!els.length) return '';

  els.sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: Line[] = [];
  for (const it of els) {
    const ln = lines[lines.length - 1];
    const tol = ln ? Math.max(ln.y1 - ln.y0, it.h) * 0.65 : 0;
    const sameBand = !!ln && it.y >= ln.y0 - tol && it.y <= ln.y1 + tol;
    const xTol = ln ? Math.max(ln.y1 - ln.y0, it.h) * 0.8 : 0;
    const xTouches =
      !!ln && it.x <= ln.x1 + xTol && it.x + it.w >= ln.x0 - xTol;
    if (sameBand && xTouches) {
      ln.items.push(it);
      if (it.y < ln.y0) ln.y0 = it.y;
      if (it.y + it.h > ln.y1) ln.y1 = it.y + it.h;
      ln.x0 = Math.min(ln.x0, it.x);
      ln.x1 = Math.max(ln.x1, it.x + it.w);
    } else {
      lines.push({ y0: it.y, y1: it.y + it.h, x0: it.x, x1: it.x + it.w, items: [it] });
    }
  }

  const groups: { x0: number; x1: number; lines: Line[] }[] = [];
  for (const ln of lines) {
    let best = -1;
    let bestOv = 0;
    for (let g = 0; g < groups.length; g++) {
      const ov = Math.min(ln.x1, groups[g].x1) - Math.max(ln.x0, groups[g].x0);
      const minW = Math.min(ln.x1 - ln.x0, groups[g].x1 - groups[g].x0);
      if (ov >= minW * 0.6 && ov > bestOv) {
        bestOv = ov;
        best = g;
      }
    }
    if (best < 0) {
      groups.push({ x0: ln.x0, x1: ln.x1, lines: [ln] });
    } else {
      groups[best].lines.push(ln);
      groups[best].x0 = Math.min(groups[best].x0, ln.x0);
      groups[best].x1 = Math.max(groups[best].x1, ln.x1);
    }
  }

  const cols = groups.sort((a, b) => a.x0 - b.x0);
  const parts: string[] = [];
  for (const g of cols) {
    g.lines.sort((a, b) => b.y0 - a.y0);
    parts.push(buildColumn(g.lines));
  }
  return parts.join('\n\n');
}

function lineToString(items: El[]): string {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  let out = '';
  let end = -Infinity;
  let h = 0;
  for (const it of sorted) {
    const isMark = COMBINING.test(it.str);
    const gap = it.x - end;
    if (out && !isMark && gap > Math.max(h, it.h) * 0.22) out += ' ';
    out += it.str;
    end = Math.max(end, it.x + it.w);
    h = Math.max(h, it.h);
  }
  try {
    return out.trim().normalize('NFC');
  } catch {
    return out.trim();
  }
}

function buildColumn(lines: Line[]): string {
  const lineStrs = lines.map(({ items }) => lineToString(items));

  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const g = lines[i - 1].y0 - lines[i].y1;
    if (g > 0) gaps.push(g);
  }
  let threshold = Infinity;
  if (gaps.length) {
    const med = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
    const lineH = lines[0].y1 - lines[0].y0;
    threshold = Math.max(med * 2.4, med + lineH);
  }

  const paras: string[] = [];
  let para = '';
  for (let i = 0; i < lineStrs.length; i++) {
    const text = lineStrs[i];
    if (!para) {
      para = text;
    } else {
      const gap = i > 0 ? lines[i - 1].y0 - lines[i].y1 : 0;
      para += (gap > threshold ? '\n\n' : ' ') + text;
    }
  }
  if (para.trim()) paras.push(para.trim());
  return paras.join('\n\n');
}

/** Trang text rỗng/rác ⇒ nên render thành ảnh. */
export function pageShouldRenderAsImage(text: string): boolean {
  const t = typeof text === 'string' ? text : '';
  const l = t.replace(/\s/g, '');
  if (l.length < 10) return true;
  let bad = 0;
  let letters = 0;
  for (const ch of t) {
    const c = ch.codePointAt(0)!;
    if (c === 0xfffd || (c >= 0x4e00 && c <= 0x9fff) || c < 32) bad++;
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) letters++;
  }
  return bad / t.length >= 0.02 || letters / l.length < 0.4;
}

async function renderPageImage(page: pdfjsLib.PDFPageProxy): Promise<ImagePage> {
  const viewport = page.getViewport({ scale: 1.25 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return { kind: 'image', src: canvas.toDataURL('image/jpeg', 0.82), w: canvas.width, h: canvas.height };
}

export interface ExtractResult {
  pages: Page[];
  title: string;
  author: string;
  numPages: number;
}

/** Chạy phía client: lấy text/ảnh từng trang — đầu ra y hệt dữ liệu lưu trong DB. */
export async function extractText(
  ab: ArrayBuffer,
  onProgress?: (cur: number, total: number) => void,
): Promise<ExtractResult> {
  const data = new Uint8Array(ab);
  const pdf = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
  const pages: Page[] = [];
  let title = '';
  let author = '';
  try {
    const meta = await pdf.getMetadata();
    const raw = meta as unknown as { info?: Record<string, unknown> };
    const info = (meta && raw.info) || {};
    title = String(info.Title || '').trim();
    author = String(info.Author || '').trim();
  } catch {
    /* metadata lỗi thì bỏ qua */
  }

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    let text = '';
    try {
      const tc = await page.getTextContent();
      text = layoutPage(tc.items as RawItem[]);
    } catch {
      /* bỏ qua trang lỗi */
    }
    let entry: Page = text;
    if (pageShouldRenderAsImage(text)) {
      try {
        entry = await renderPageImage(page);
      } catch {
        /* giữ text kém nếu không render được */
      }
    }
    pages.push(entry);
    if (onProgress) onProgress(i, pdf.numPages);
    page.cleanup();
  }
  return { pages, title, author, numPages: pdf.numPages };
}