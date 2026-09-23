import { db } from './db.js';
import { extractText, EXTRACT_VERSION } from './extract.js';

const params = new URLSearchParams(window.location.search);
const bookId = params.get('id');

const readerMain = document.getElementById('reader');
const bookTitleEl = document.getElementById('bookTitle');
const pageInfoEl = document.getElementById('pageInfo');
const loadText = document.getElementById('loadText');
const toolbar = document.getElementById('toolbar');
const tocSheet = document.getElementById('tocSheet');
const tocList = document.getElementById('tocList');
const settingsSheet = document.getElementById('settingsSheet');
const fontSizeLabel = document.getElementById('fontSizeLabel');
const toastEl = document.getElementById('toast');

const SETTINGS_KEY = 'sach-settings';
const defaults = {
  theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'paper',
  fontSize: 20,
  fontFamily: 'serif',
};
const settings = { ...defaults, ...JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || '{}') };

const FONT_MIN = 15, FONT_MAX = 34;

let book = null;
let pageEls = [];
let offsets = [];
let ready = false;
let toastTimer = null;

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
    setTimeout(() => (toastEl.hidden = true), 300);
  }, 2200);
}

function saveSettings() {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function applySettings() {
  document.documentElement.dataset.theme = settings.theme;
  document.documentElement.style.setProperty('--read-font', settings.fontFamily === 'sans'
    ? '"Roboto", "Helvetica Neue", system-ui, sans-serif'
    : 'Georgia, "Noto Serif", "Times New Roman", serif');
  document.documentElement.style.setProperty('--read-fs', settings.fontSize + 'px');
  fontSizeLabel.textContent = settings.fontSize;
  document.querySelectorAll('#fontFamilySeg button').forEach((b) =>
    b.classList.toggle('active', b.dataset.font === settings.fontFamily));
  document.querySelectorAll('#themeRow .theme-dot').forEach((b) =>
    b.classList.toggle('active', b.dataset.theme === settings.theme));
}

const CHUNK_SIZE = 25;

function makePage(page, index) {
  const sec = document.createElement('section');
  sec.className = 'pg';
  sec.dataset.i = index;
  const inner = document.createElement('div');
  inner.className = 'pg-inner';
  if (page && page.kind === 'image') {
    inner.classList.add('pg-image');
    const img = document.createElement('img');
    img.src = page.src;
    img.alt = `Trang ${index + 1}`;
    if (page.w && page.h) img.style.aspectRatio = `${page.w} / ${page.h}`;
    inner.appendChild(img);
  } else if (typeof page === 'string' && page.trim()) {
    inner.textContent = page;
  } else {
    inner.classList.add('pg-empty');
    inner.textContent = '(Trang hình ảnh)';
  }
  const mark = document.createElement('div');
  mark.className = 'pg-mark';
  mark.textContent = String(index + 1);
  sec.appendChild(inner);
  sec.appendChild(mark);
  return sec;
}

function renderBook() {
  applySettings();
  bookTitleEl.textContent = book.title;
  document.title = book.title || 'Đọc sách';
  loadText.textContent = 'Đang sắp xếp sách…';
  readerMain.classList.add('loading-on');
  readerMain.innerHTML = '';
  tocList.innerHTML = '';

  const total = book.pages.length;
  const pageFrag = document.createDocumentFragment();
  const tocFrag = document.createDocumentFragment();
  let i = 0;
  const pump = () => {
    try {
      const end = Math.min(i + CHUNK_SIZE, total);
      for (; i < end; i++) {
        pageFrag.appendChild(makePage(book.pages[i], i));
        const li = document.createElement('li');
        li.className = 'toc-item';
        li.dataset.i = i;
        li.textContent = `Trang ${i + 1}`;
        tocFrag.appendChild(li);
      }
      if (i < total) {
        loadText.textContent = `Đang sắp xếp trang ${i}/${total}…`;
        requestAnimationFrame(pump);
        return;
      }
      loadText.textContent = 'Đang dựng sách…';
      readerMain.appendChild(pageFrag);
      tocList.appendChild(tocFrag);
      requestAnimationFrame(() => finishBuild(book.progress || 0, false));
    } catch (err) {
      console.error(err);
      loadText.textContent = 'Không dựng được sách, thử mở lại';
    }
  };
  pump();
}

function measureOffsets() {
  offsets = pageEls.map((el) => el.offsetTop);
}

function finishBuild(restoreFrac, fracOnly) {
  try {
    pageEls = [...readerMain.querySelectorAll('.pg')];
    measureOffsets();
    readerMain.classList.remove('loading-on');
    ready = true;
    const frac = fracOnly
      ? restoreFrac
      : Math.min(0.999, Math.max(0, restoreFrac));
    window.scrollTo(0, frac * (document.documentElement.scrollHeight - window.innerHeight));
    updatePageInfo();
  } catch (err) {
    console.error(err);
    readerMain.classList.remove('loading-on');
    ready = true;
    loadText.textContent = 'Không dựng được sách, thử mở lại';
  }
}

function currentIndex() {
  if (!ready || offsets.length === 0) return 0;
  const pos = window.scrollY + window.innerHeight * 0.35;
  let lo = 0, hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= pos) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function updatePageInfo() {
  if (!ready) return;
  const idx = currentIndex();
  const pct = Math.min(100, Math.max(0, Math.round((window.scrollY / Math.max(1, document.documentElement.scrollHeight - window.innerHeight)) * 100)));
  pageInfoEl.textContent = `Trang ${idx + 1}/${book.pageCount} · ${pct}%`;
}

let saveTimer = null;
function saveProgress() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const frac = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
  if (book.progress !== frac || book.updatedAt === undefined) {
    book.progress = frac;
    book.updatedAt = Date.now();
    db.put(book).catch(() => {});
  }
}

function queueSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveProgress, 700);
}

function rebuild() {
  if (!ready) return;
  const frac = Math.min(1, Math.max(0, window.scrollY / Math.max(1, document.documentElement.scrollHeight - window.innerHeight)));
  readerMain.innerHTML = '';
  readerMain.classList.add('loading-on');
  pageEls = [];
  offsets = [];
  ready = false;
  const frag = document.createDocumentFragment();
  const total = book.pages.length;
  let i = 0;
  const pump = () => {
    try {
      const end = Math.min(i + CHUNK_SIZE, total);
      for (; i < end; i++) frag.appendChild(makePage(book.pages[i], i));
      if (i < total) {
        requestAnimationFrame(pump);
        return;
      }
      readerMain.appendChild(frag);
      requestAnimationFrame(() => finishBuild(frac, true));
    } catch (err) {
      console.error(err);
      readerMain.classList.remove('loading-on');
      ready = true;
    }
  };
  pump();
}

function openToc() {
  tocSheet.hidden = false;
  requestAnimationFrame(() => tocSheet.classList.add('open'));
}

function closeToc() {
  tocSheet.classList.remove('open');
  setTimeout(() => (tocSheet.hidden = true), 220);
}

function openSettings() {
  settingsSheet.hidden = false;
  requestAnimationFrame(() => settingsSheet.classList.add('open'));
}

function closeSettings() {
  settingsSheet.classList.remove('open');
  setTimeout(() => (settingsSheet.hidden = true), 220);
}

function goToPage(index) {
  if (index >= 0 && index < offsets.length) {
    window.scrollTo({ top: Math.max(0, offsets[index] - 8), behavior: 'smooth' });
  }
}

async function upgradeBook(b) {
  loadText.textContent = 'Đang nâng cấp sách…';
  readerMain.classList.add('loading-on');
  try {
    const { pages, title, author, numPages } = await extractText(b.file, (cur, total) => {
      loadText.textContent = `Đang nâng cấp sách ${cur}/${total}…`;
    });
    b.pages = pages;
    b.pageCount = numPages;
    if (title) b.title = title;
    if (author) b.author = author;
    b.ver = EXTRACT_VERSION;
    await db.put(b);
  } catch (err) {
    console.error('nâng cấp sách thất bại:', err);
  }
}

if (!bookId) {
  window.location.replace('index.html');
} else {
  db.get(bookId).then(async (b) => {
    if (!b) {
      loadText.textContent = 'Không tìm thấy sách';
      setTimeout(() => window.location.replace('index.html'), 1200);
      return;
    }
    book = b;
    if (book.ver !== EXTRACT_VERSION && book.file) {
      await upgradeBook(book);
    }
    renderBook();
  }).catch(() => {
    loadText.textContent = 'Lỗi mở sách';
  });
}

document.getElementById('btnBack').addEventListener('click', () => {
  saveProgress();
  window.location.href = 'index.html';
});
document.getElementById('btnSettings').addEventListener('click', openSettings);
document.getElementById('btnCloseSettings').addEventListener('click', closeSettings);
document.getElementById('btnCloseToc').addEventListener('click', closeToc);
document.getElementById('tocSheet').addEventListener('click', (e) => {
  if (e.target === tocSheet) closeToc();
});
document.getElementById('settingsSheet').addEventListener('click', (e) => {
  if (e.target === settingsSheet) closeSettings();
});

let fontTimer = null;
function scheduleRebuild() {
  clearTimeout(fontTimer);
  fontTimer = setTimeout(rebuild, 260);
}

document.getElementById('fontPlus').addEventListener('click', () => {
  if (settings.fontSize >= FONT_MAX) return;
  settings.fontSize = Math.min(FONT_MAX, settings.fontSize + 2);
  saveSettings();
  applySettings();
  scheduleRebuild();
});
document.getElementById('fontMinus').addEventListener('click', () => {
  if (settings.fontSize <= FONT_MIN) return;
  settings.fontSize = Math.max(FONT_MIN, settings.fontSize - 2);
  saveSettings();
  applySettings();
  scheduleRebuild();
});
document.getElementById('fontFamilySeg').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-font]');
  if (!b) return;
  settings.fontFamily = b.dataset.font;
  saveSettings();
  applySettings();
  scheduleRebuild();
});
document.getElementById('themeRow').addEventListener('click', (e) => {
  const b = e.target.closest('.theme-dot[data-theme]');
  if (!b) return;
  settings.theme = b.dataset.theme;
  saveSettings();
  applySettings();
});

tocList.addEventListener('click', (e) => {
  const li = e.target.closest('.toc-item');
  if (!li) return;
  closeToc();
  goToPage(Number(li.dataset.i));
});

let lastY = window.scrollY;
let hideTimer = null;
window.addEventListener('scroll', () => {
  if (!ready) return;
  const y = window.scrollY;
  if (y > 140 && y > lastY + 10) {
    toolbar.classList.add('hide');
  } else if (y < lastY - 10 || y <= 140) {
    toolbar.classList.remove('hide');
  }
  lastY = y;
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    updatePageInfo();
    queueSave();
  }, 300);
}, { passive: true });

window.addEventListener('scrollend', () => {
  if (!ready) return;
  clearTimeout(hideTimer);
  updatePageInfo();
  saveProgress();
});

window.addEventListener('resize', () => {
  clearTimeout(fontTimer);
  fontTimer = setTimeout(() => {
    if (!ready) return;
    measureOffsets();
    updatePageInfo();
  }, 200);
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveProgress();
});
window.addEventListener('pagehide', saveProgress);
window.addEventListener('beforeunload', saveProgress);