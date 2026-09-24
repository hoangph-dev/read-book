import { spawn } from 'node:child_process';
import { createServer as netServer } from 'node:net';
import { readdirSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const BASE = resolve(import.meta.dirname, '..');
const PORT = 3211;
const URL = `http://127.0.0.1:${PORT}`;
const BLOB_ROOT = join(BASE, 'dev-blobs');
rmSync(BLOB_ROOT, { recursive: true, force: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = async (u) => (await fetch(u)).json();

async function waitHttp(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {}
    await sleep(500);
  }
  throw new Error('server không lên ' + url);
}

function assertPortFree(port) {
  return new Promise((resolve, reject) => {
    const srv = netServer();
    srv.once('error', (e) => reject(new Error(`port ${port} đang bị chiếm: ${e.code}`)));
    srv.listen(port, () => srv.close(() => resolve(true)));
  });
}

let server;
await assertPortFree(PORT);
console.log('building...');
const build = spawn('npm', ['run', 'build'], { cwd: BASE, stdio: 'inherit' });
await new Promise((res, rej) => {
  build.on('exit', (code) => (code === 0 ? res() : rej(new Error('build fail ' + code))));
});
console.log('build ok, starting prod server...');
server = spawn('npm', ['run', 'start', '--', '-p', String(PORT)], {
  cwd: BASE,
  stdio: 'ignore',
  detached: true,
  env: { ...process.env, BLOB_LOCAL_ROOT: BLOB_ROOT },
});
await waitHttp(URL);

/** Kết nối CDP tới chrome, trả về helper evaluate. */
async function connect(debugPort) {
  let target;
  for (let i = 0; i < 30; i++) {
    try {
      const list = await json(`http://127.0.0.1:${debugPort}/json/list`);
      target = list.find((t) => t.type === 'page');
      if (target) break;
    } catch {}
    await sleep(500);
  }
  if (!target) throw new Error('chrome không khởi động được');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errors.push(m.params.args.map((a) => a.value || a.description || '').join(' '));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push('EX: ' + (d.exception?.description || d.text || '') + '\nSTACK: ' + (d.stackTrace ? JSON.stringify(d.stackTrace.callFrames.slice(0, 6).map((f) => f.functionName + ':' + f.url)) : ''));
    }
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolveMsg, rejectMsg) => {
      const mid = ++id;
      pending.set(mid, { resolve: resolveMsg, reject: rejectMsg });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  await new Promise((r) => (ws.onopen = r));
  await send('Runtime.enable');
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const setFile = async (selector, filePath) => {
    let lastErr;
    for (let i = 0; i < 10; i++) {
      try {
        const doc = await send('DOM.getDocument');
        const node = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector });
        if (node.nodeId && node.nodeId !== 0) {
          await send('DOM.setFileInputFiles', { nodeId: node.nodeId, files: [filePath] });
          return;
        }
      } catch (e) {
        lastErr = e;
      }
      await sleep(300);
    }
    throw lastErr || new Error('không đặt được file');
  };
  const shot = async (file) => {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    const { writeFileSync } = await import('node:fs');
    writeFileSync(file, Buffer.from(s.data, 'base64'));
  };
  return { ws, evaluate, setFile, shot, errors, send };
}

const chromeProcesses = [];

function launchChrome(profile, debugPort) {
  const chrome = spawn('google-chrome', [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    URL + '/',
  ], { stdio: 'ignore', detached: true });
  chromeProcesses.push(chrome);
  return chrome;
}

function chromeKill(c) {
  c.kill('SIGKILL');
}

let fails = 0;
function check(label, ok, extra = '') {
  console.log((ok ? 'PASS' : 'FAIL'), label, extra);
  if (!ok) fails += 1;
}

try {
  /* ===== USER A: upload ===== */
  const runId = Date.now();
  const profA = `/tmp/opencode/next-e2e-a-${runId}`;
  rmSync(profA, { recursive: true, force: true });
  const chromeA = launchChrome(profA, 9241);
  await sleep(2500);
  const A = await connect(9241);

  await sleep(1500);
  const emptyShelf = await A.evaluate(`new Set(Array.from(document.querySelectorAll('a[href^="/read/"]')).map(a=>a.getAttribute('href'))).size`);
  check('A: tủ sách ban đầu rỗng', emptyShelf === 0, `(${emptyShelf} sách)`);

  await A.evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.title === 'Thêm sách PDF')?.click()`);
  await sleep(800);
  const diag = await A.evaluate(`({
    inputs: document.querySelectorAll('input[type=file]').length,
    hasDialog: !!document.querySelector('[role=dialog]'),
    uploadBtn: Array.from(document.querySelectorAll('button')).some(b => b.title === 'Thêm sách PDF'),
    body: document.body.innerText.slice(0, 300),
    nextErr: !!document.querySelector('nextjs-portal'),
    overlay: (() => {
      const p = document.querySelector('nextjs-portal');
      return p ? p.shadowRoot?.innerText?.slice(0, 600) || p.textContent?.slice(0, 600) : null;
    })(),
  })`);
  console.log('A dialog debug:', JSON.stringify(diag), 'consoleErrors:', JSON.stringify(A.errors.slice(-4)));
  await A.setFile('input[type=file]', resolve(BASE, 'tools', 'test-book.pdf'));
  await sleep(500);
  await A.evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Thêm sách')?.click()`);
  console.log('A: đang upload + trích xuất...');

  let count = 0;
  for (let i = 0; i < 240; i++) {
    await sleep(500);
    count = await A.evaluate(`new Set(Array.from(document.querySelectorAll('a[href^="/read/"]')).map(a=>a.getAttribute('href'))).size`);
    if (count >= 1) break;
  }
  if (count < 1) {
    const debug = await A.evaluate(`({
      toast: document.querySelector('[data-sonner-toast]')?.textContent || null,
      body: document.body.innerText.slice(0, 400),
    })`);
    console.log('A upload debug:', JSON.stringify(debug), 'errors:', JSON.stringify(A.errors.slice(-3)));
  }
  check('A: upload xong, tủ có sách chung', count >= 1, `(${count} sách)`);

  // Blob local: catalog + pdf + pages.json
  const blobs = readdirSync(BLOB_ROOT);
  const booksDir = existsSync(join(BLOB_ROOT, 'books')) ? readdirSync(join(BLOB_ROOT, 'books')) : [];
  check('A: blob catalog tồn tại', blobs.includes('catalog.json'), JSON.stringify(blobs));
  check('A: blob pdf + pages tồn tại', booksDir.length === 1, JSON.stringify(booksDir));
  const bookDir = join(BLOB_ROOT, 'books', booksDir[0] || '');
  const files = existsSync(bookDir) ? readdirSync(bookDir) : [];
  check('A: file pdf + pages.json', files.includes(`${booksDir[0]}.pdf`) && files.includes(`${booksDir[0]}.pages.json`), JSON.stringify(files));

  // đọc thử từ profile A
  await A.evaluate(`document.querySelector('a[href^="/read/"]')?.click()`);
  let pages = 0;
  let moved = false;
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    const href = await A.evaluate('location.pathname');
    if (href.startsWith('/read/')) moved = true;
    if (moved) {
      pages = await A.evaluate(`document.querySelectorAll('.pg').length`);
      const loading = await A.evaluate(`!!document.querySelector('.spinner')`);
      if (pages >= 41 && !loading) break;
    }
  }
  if (pages < 41) {
    const rdbg = await A.evaluate(`({
      path: location.pathname,
      spinner: !!document.querySelector('.spinner'),
      pg: document.querySelectorAll('.pg').length,
      text: document.body.innerText.slice(0, 200),
      loadMsg: document.querySelector('main p')?.textContent || null,
    })`);
    console.log('A reader debug:', JSON.stringify(rdbg), 'errors:', JSON.stringify(A.errors.slice(-4)));
  }
  check('A: đọc được 41 trang', pages >= 41, `(${pages} trang)`);
  await A.shot('/tmp/opencode/next-reader-a.png');

  /* ===== USER B: người khác truy cập ===== */
  const profB = `/tmp/opencode/next-e2e-b-${runId}`;
  rmSync(profB, { recursive: true, force: true });
  const chromeB = launchChrome(profB, 9242);
  await sleep(2500);
  const B = await connect(9242);
  await sleep(1500);

  let bCount = 0;
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    bCount = await B.evaluate(`new Set(Array.from(document.querySelectorAll('a[href^="/read/"]')).map(a=>a.getAttribute('href'))).size`);
    if (bCount >= 1) break;
  }
  check('B: thấy sách của A', bCount >= 1, `(${bCount} sách)`);

  const bTitle = await B.evaluate(`document.querySelector('a[href^="/read/"] h3')?.textContent`);
  check('B: đúng tên sách', bTitle === 'test-book', `("${bTitle}")`);

  await B.evaluate(`document.querySelector('a[href^="/read/"]')?.click()`);
  let bPages = 0;
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    bPages = await B.evaluate(`document.querySelectorAll('.pg').length`);
    const loading = await B.evaluate(`!!document.querySelector('.spinner')`);
    if (bPages >= 41 && !loading) break;
  }
  check('B: đọc được 41 trang', bPages >= 41, `(${bPages} trang)`);

  const bErrors = B.errors;
  check('B: không lỗi console', bErrors.length === 0, bErrors.length ? JSON.stringify(bErrors) : '');

  A.ws.close();
  B.ws.close();
  console.log('console errors A:', A.errors.length ? JSON.stringify(A.errors) : 'none');
} finally {
  if (server) {
    try { process.kill(-server.pid, 'SIGTERM'); } catch {}
    try { process.kill(server.pid, 'SIGKILL'); } catch {}
  }
  for (const c of chromeProcesses) {
    try { process.kill(-c.pid, 'SIGTERM'); } catch {}
    try { chromeKill(c); } catch {}
  }
}

process.exit(fails ? 1 : 0);