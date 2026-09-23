import { db, makeId } from './db.js';
import { extractText, EXTRACT_VERSION } from './extract.js';

const shelf = document.getElementById('shelf');
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
    const fileCopy = file.size <= 25 * 1024 * 1024 ? ab.slice(0) : null;
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
      ver: EXTRACT_VERSION,
    };
    if (fileCopy) book.file = fileCopy;
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