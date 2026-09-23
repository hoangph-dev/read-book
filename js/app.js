import { db, makeId } from './db.js';
import * as pdfjsLib from '../vendor/pdfjs/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.mjs';

const shelf = document.getElementById('shelf');
const empty = document.getElementById('empty');
const bookCount = document.getElementById('bookCount');
const fileInput = document.getElementById('fileInput');
const progBox = document.getElementById('progress');
const progLabel = document.getElementById('progressLabel');
const progPct = document.getElementById('progressPct');
const progBar = document.getElementById('progressBar');
const toastEl = document.getElementById('toast');

let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
    setTimeout(() => (toastEl.hidden = true), 300);
  }, 2600);
}

function setProgress(cur, total) {
  if (!total) return;
  const pct = Math.round((cur / total) * 100);
  progLabel.textContent = `Đang xử lý trang ${cur}/${total}`;
  progPct.textContent = `${pct}%`;
  progBar.style.width = `${pct}%`;
}

function layoutPage(items) {
  const els = items
    .filter((o) => typeof o.str === 'string' && o.str.trim().length > 0)
    .map((o) => ({
      str: o.str,
      x: o.transform[4],
      y: o.transform[5],
      h: Math.abs(o.transform[3]) || o.height || 1,
      w: o.width || 0,
    }))
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const lines = [];
  let cur = null;
  for (const it of els) {
    if (!cur) {
      cur = { y: it.y, h: it.h, items: [it] };
      continue;
    }
    if (Math.abs(it.y - cur.y) <= Math.max(cur.h, it.h) * 0.6) {
      cur.h = Math.max(cur.h, it.h);
      cur.y = (cur.y + it.y) / 2;
      cur.items.push(it);
    } else {
      lines.push(cur);
      cur = { y: it.y, h: it.h, items: [it] };
    }
  }
  if (cur) lines.push(cur);

  const lineStrs = lines.map((ln) => {
    ln.items.sort((a, b) => a.x - b.x);
    let out = '';
    let end = -Infinity;
    let h = 0;
    for (const it of ln.items) {
      if (it.x > end + Math.max(h, it.h) * 0.28 && out) out += ' ';
      out += it.str;
      end = it.x + it.w;
      h = it.h;
    }
    return { text: out, h: ln.h, y: ln.y };
  });

  if (lineStrs.length === 0) return '';

  const gaps = [];
  for (let i = 1; i < lineStrs.length; i++) {
    const g = lineStrs[i].y - (lineStrs[i - 1].y + lineStrs[i - 1].h);
    if (g > 0) gaps.push(g);
  }
  let threshold = Infinity;
  if (gaps.length) {
    const med = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
    threshold = Math.max(med * 2.4, med + lineStrs[0].h);
  }

  const paras = [];
  let para = '';
  let prevBottom = null;
  for (const ln of lineStrs) {
    const text = ln.text.trim();
    if (!para) {
      para = text;
    } else {
      const isNew = prevBottom !== null && ln.y > prevBottom + threshold;
      para += (isNew ? '\n\n' : ' ') + text;
    }
    prevBottom = ln.y + ln.h;
  }
  if (para.trim()) paras.push(para.trim());
  return paras.join('\n\n');
}

async function extractText(ab, onProgress) {
  const data = new Uint8Array(ab);
  const pdf = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
  const pages = [];
  let title = '';
  let author = '';
  try {
    const meta = await pdf.getMetadata();
    const info = (meta && meta.info) || {};
    title = (info.Title || '').toString().trim();
    author = (info.Author || '').toString().trim();
  } catch (_) { /* metadata lỗi thì bỏ qua */ }

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    pages.push(layoutPage(tc.items));
    if (onProgress) onProgress(i, pdf.numPages);
    page.cleanup();
  }
  return { pages, title, author, numPages: pdf.numPages };
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function coverHue(title) {
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 360;
}

function renderShelf(books) {
  const list = [...books].sort((a, b) => b.updatedAt - a.updatedAt);
  bookCount.textContent = list.length ? `${list.length} cuốn` : '';
  empty.hidden = list.length > 0;
  shelf.innerHTML = '';

  for (const b of list) {
    const pct = Math.round((b.progress || 0) * 100);
    const hue = coverHue(b.title || 'sach');
    const card = document.createElement('article');
    card.className = 'book';
    card.dataset.id = b.id;
    card.innerHTML = `
      <div class="book-cover" style="background: linear-gradient(160deg, hsl(${hue} 38% 26%), hsl(${hue} 42% 14%))">
        <span class="cover-letter">${escapeHTML((b.title || '?').trim().charAt(0).toUpperCase())}</span>
        <div class="cover-progress"><div class="cover-fill" style="width:${pct}%"></div></div>
      </div>
      <div class="book-meta">
        <h3>${escapeHTML(b.title)}</h3>
        <p class="book-sub">${b.pageCount} trang · ${pct}%</p>
        ${b.author ? `<p class="book-sub">${escapeHTML(b.author)}</p>` : ''}
      </div>
      <div class="book-actions">
        <button class="btn primary small" data-act="open">${pct > 0 ? 'Đọc tiếp' : 'Mở sách'}</button>
        <button class="btn ghost small" data-act="del">Xóa</button>
      </div>`;
    shelf.appendChild(card);
  }
}

async function refreshShelf() {
  renderShelf(await db.getAll());
}

async function handleOpen(id) {
  window.location.href = `reader.html?id=${encodeURIComponent(id)}`;
}

async function handleDelete(id) {
  const book = await db.get(id);
  if (!book) return;
  const ok = window.confirm(`Xóa "${book.title}" khỏi thư viện và mất vị trí đọc?`);
  if (!ok) return;
  await db.delete(id);
  await refreshShelf();
  toast('Đã xóa sách');
}

async function handleFile(file) {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    toast('Chỉ hỗ trợ file PDF');
    return;
  }
  if (file.size > 200 * 1024 * 1024) {
    toast('File quá lớn (tối đa 200 MB)');
    return;
  }
  progBox.hidden = false;
  setProgress(0, 1);
  try {
    const ab = await file.arrayBuffer();
    const { pages, title, author, numPages } = await extractText(ab, setProgress);
    const t = title || file.name.replace(/\.pdf$/i, '').trim() || 'Sách không tên';
    const book = {
      id: makeId(),
      title: t,
      author,
      pages,
      pageCount: numPages,
      progress: 0,
      updatedAt: Date.now(),
      size: file.size,
    };
    await db.put(book);
    await refreshShelf();
    toast('Đã thêm sách vào thư viện');
    window.location.href = `reader.html?id=${encodeURIComponent(book.id)}`;
  } catch (err) {
    console.error(err);
    toast('Không đọc được PDF này (bị mã hóa hoặc lỗi). Hãy thử file khác.');
  } finally {
    progBox.hidden = true;
    fileInput.value = '';
  }
}

function pickFile() {
  fileInput.click();
}

document.getElementById('btnAdd').addEventListener('click', pickFile);
document.getElementById('btnAddEmpty').addEventListener('click', pickFile);
fileInput.addEventListener('change', () => {
  const f = fileInput.files && fileInput.files[0];
  if (f) handleFile(f);
});

shelf.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const card = btn.closest('.book');
  if (!card) return;
  if (btn.dataset.act === 'open') await handleOpen(card.dataset.id);
  else if (btn.dataset.act === 'del') await handleDelete(card.dataset.id);
});

refreshShelf().catch((e) => {
  console.error(e);
  toast('Không mở được thư viện');
});