import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

const BASE = resolve(import.meta.dirname, '..');
const URL = 'http://127.0.0.1:8011';
const CHROME = process.env.CHROME || 'google-chrome';
const USER_DATA = '/tmp/opencode/chrome-e2e';
const { rmSync } = await import('node:fs');
rmSync(USER_DATA, { recursive: true, force: true });

let server;
function startServer() {
  return new Promise((res) => {
    server = spawn('python3', ['-m', 'http.server', '8011'], { cwd: BASE, stdio: 'ignore' });
    server.once('exit', () => { server = null; });
    setTimeout(res, 600);
  });
}

let chrome;
function startChrome() {
  chrome = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    '--remote-debugging-port=9223',
    `--user-data-dir=${USER_DATA}`,
    URL + '/index.html',
  ], { stdio: 'ignore' });
}

async function json(url) {
  const r = await fetch(url);
  return r.json();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await startServer();
  startChrome();
  await sleep(2500);

  let target;
  for (let i = 0; i < 30; i++) {
    try {
      const list = await json('http://127.0.0.1:9223/json/list');
      target = list.find((t) => t.type === 'page');
      if (target) break;
    } catch (_) { /* chrome chưa sẵn sàng */ }
    await sleep(500);
  }
  if (!target) throw new Error('Chrome không khởi động được');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const errors = [];
  const logs = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.consoleAPICalled') {
      const text = m.params.args.map((a) => a.value || a.description || '').join(' ');
      if (m.params.type === 'error') errors.push(text);
      else if (m.params.type === 'log' || m.params.type === 'warning') logs.push(text);
    }
    if (m.id && pending.has(m.id)) {
      const { resolve: r, reject: j } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) j(new Error(m.error.message));
      else r(m.result);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolveMsg, rejectMsg) => {
      const mid = ++id;
      pending.set(mid, { resolve: resolveMsg, reject: rejectMsg });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  await new Promise((r) => (ws.onopen = r));

  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };

  await send('Runtime.enable');
  await send('Page.enable');

  // 1. Chờ trang index load
  await sleep(1500);
  const dbg = await evaluate(`(async () => {
    try {
      const m = await import('/js/db.js?t=' + Date.now());
      const all = await m.db.getAll();
      return { ok: true, isArray: Array.isArray(all), len: all ? all.length : -1 };
    } catch (e) { return { ok: false, err: String(e) }; }
  })()`);
  console.log('db debug:', JSON.stringify(dbg));
  const base = await evaluate(`({
    title: document.title,
    hasSW: !!document.querySelector('#fileInput'),
  })`);
  console.log('index loaded:', base.title);

  // 2. Set file thật vào input[type=file] (CDP tự fire change)
  const filePath = resolve(BASE, 'tools', 'test-book.pdf');
  const doc = await send('DOM.getDocument');
  const node = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#fileInput' });
  await send('DOM.setFileInputFiles', { nodeId: node.nodeId, files: [filePath] });

  // 3. Đợi chuyển sang reader page
  let moved = false;
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    const href = await evaluate('location.href');
    if (href.includes('reader.html')) { moved = true; break; }
  }
  if (!moved) {
    console.error('Không chuyển được tới reader! errors:', errors);
    process.exit(1);
  }
  console.log('chuyển tới reader.html OK');

  // 4. Đợi render xong (3 trang)
  let pages = 0;
  for (let i = 0; i < 60; i++) {
    await sleep(400);
    pages = await evaluate(`document.querySelectorAll('#reader .pg').length`);
    if (pages >= 3) break;
  }
  console.log('số trang render:', pages);

  const firstPageText = await evaluate(`document.querySelector('#reader .pg-inner')?.textContent?.slice(0, 60)`);
  console.log('text trang đầu:', JSON.stringify(firstPageText));

  // 5. Cuộn xuống giữa sách và chờ auto-save
  for (let i = 0; i < 60; i++) {
    const done = await evaluate(`!document.querySelector('.reader-main.loading-on') && !!document.querySelector('#reader .pg')`);
    if (done) break;
    await sleep(300);
  }
  const scrollState = await evaluate(`(scrollTo(0, document.documentElement.scrollHeight * 0.5), ({ y: scrollY, sh: document.documentElement.scrollHeight, ih: innerHeight }))`);
  console.log('scroll state:', JSON.stringify(scrollState));
  await sleep(2000);
  const progress = await evaluate(`new Promise((res) => {
    const req = indexedDB.open('sach-reader');
    req.onsuccess = () => {
      const db = req.result;
      const t = db.transaction('books', 'readonly');
      const r = t.objectStore('books').getAll();
      r.onsuccess = () => res(r.result.map(b => ({ title: b.title, progress: b.progress, pages: b.pages.length })));
    };
    req.onerror = () => res('err');
  })`);
  console.log('IndexedDB sau scroll:', JSON.stringify(progress));

  // 6. Kiểm tra settings sheet + theme đổi
  await evaluate(`document.getElementById('btnSettings').click()`);
  await sleep(400);
  await evaluate(`document.querySelector('.theme-dot[data-theme="paper"]').click()`);
  await evaluate(`document.getElementById('fontPlus').click()`);
  await sleep(900);
  const st = await evaluate(`({
    theme: document.documentElement.dataset.theme,
    saved: localStorage.getItem('sach-settings'),
    bodyBg: getComputedStyle(document.body).backgroundColor,
  })`);
  console.log('settings:', JSON.stringify(st));
  await evaluate(`document.getElementById('btnCloseSettings').click()`);
  await sleep(400);

  // 7. Quay lại shelf, xác nhận card có % đọc
  await evaluate(`document.getElementById('btnBack').click()`);
  let backOk = false;
  for (let i = 0; i < 20; i++) {
    await sleep(300);
    backOk = await evaluate(`location.pathname.endsWith('index.html')`);
    if (backOk) break;
  }
  console.log('back về index:', backOk);
  await sleep(800);
  const shelfInfo = await evaluate(`Array.from(document.querySelectorAll('.book')).map(c => ({
    title: c.querySelector('h3')?.textContent,
    sub: c.querySelector('.book-sub')?.textContent,
    btn: c.querySelector('button')?.textContent.trim(),
  }))`);
  console.log('shelf cards:', JSON.stringify(shelfInfo));

  // 8. Screenshot shelf
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const { writeFileSync } = await import('node:fs');
  writeFileSync('/tmp/opencode/e2e-shelf.png', Buffer.from(shot.data, 'base64'));

  // 9. OFF LINE: tắt server, reload, kiểm tra app vẫn chạy từ SW cache
  console.log('--- offline test ---');
  await sleep(1500);
  const swState = await evaluate(`(async () => {
    const reg = await navigator.serviceWorker.ready;
    return { scope: reg.scope, active: !!reg.active };
  })()`);
  console.log('sw:', JSON.stringify(swState));
  server && server.kill();
  server = null;
  await sleep(300);
  await evaluate(`window.location.reload()`);
  await sleep(2500);
  const offlineShelf = await evaluate(`({
    cards: document.querySelectorAll('.book').length,
    title: document.title,
    titleTxt: document.querySelector('.book h3')?.textContent,
  })`);
  console.log('offline reload:', JSON.stringify(offlineShelf));

  console.log('console errors:', errors.length ? JSON.stringify(errors) : 'none');
  console.log('logs:', JSON.stringify(logs.slice(-14)));
  console.log('all puts:', JSON.stringify(logs.filter((l) => l.startsWith('[db.put]'))));
  ws.close();
  chrome.kill();
  server && server.kill();
  process.exit(0);
}

main().catch((e) => {
  console.error('E2E FAIL:', e.message);
  process.exit(1);
});