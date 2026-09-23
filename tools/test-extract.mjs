import * as pdfjsLib from '../vendor/pdfjs/pdf.min.mjs';
import { readFileSync } from 'node:fs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

const data = new Uint8Array(readFileSync('test-book.pdf'));
const pdf = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
console.log('numPages:', pdf.numPages);

let meta = null;
try {
  const m = await pdf.getMetadata();
  meta = m && m.info;
} catch (e) { console.log('metadata err:', e.message); }
console.log('metadata Title:', meta && meta.Title);

for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i);
  const tc = await page.getTextContent();
  const rows = tc.items.filter((o) => typeof o.str === 'string' && o.str.trim());
  console.log(`--- page ${i}: ${rows.length} items`);
  for (const r of rows.slice(0, 5)) console.log('   ', JSON.stringify(r.str.slice(0, 40)), 'y=', r.transform[5].toFixed(1), 'x=', r.transform[4].toFixed(1));
}