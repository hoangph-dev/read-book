import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs');
const dstDir = resolve(root, 'public');
const dst = resolve(dstDir, 'pdf.worker.min.mjs');

if (!existsSync(src)) {
  console.error('pdfjs worker not found at', src);
  process.exit(1);
}
mkdirSync(dstDir, { recursive: true });
copyFileSync(src, dst);
console.log('copied pdf.worker.min.mjs -> public/');