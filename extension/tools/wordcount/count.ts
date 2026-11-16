// Counts the body words of PDFs on this computer, the way the extension does
// in the PDF viewer (lib/wordcount.ts). It prints numbers and page ranges
// only, never the text: manuscripts are confidential.
//   npx tsx tools/wordcount/count.ts var/*.pdf

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
// Run pdf.js's worker in this thread, as the extension does.
import * as worker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import { pdfPages } from '../../lib/pdftext';
import { cleanPages, countPdfWords } from '../../lib/wordcount';
import { mkdir, writeFile } from 'node:fs/promises';

(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;

// --dump DIR writes each file's cleaned text there, one line per line, for
// checking the filters by eye. Keep DIR out of the repository.
const args = process.argv.slice(2);
const at = args.indexOf('--dump');
const dump = at >= 0 ? args.splice(at, 2)[1] : undefined;

for (const file of args) {
  const id = basename(file).match(/[A-Z]+-\d{2}-\d{2}-\d{3,5}(\.R\d+)?/)?.[0] ?? '(no manuscript ID in the name)';
  const pages = await pdfPages(pdfjs, new Uint8Array(await readFile(file)));
  const r = countPdfWords(pages);
  if (dump) {
    await mkdir(dump, { recursive: true });
    const { lines } = cleanPages(pages);
    await writeFile(`${dump}/${basename(file)}.txt`, lines.map((ls, k) => `=== page ${k + 1}\n${ls.join('\n')}`).join('\n'));
  }
  console.log(`${id}: ${r.words} words; ${r.pages} pages, ${r.lineNumbers} line numbers dropped${r.emptyPages ? `, ${r.emptyPages} pages without text` : ''}`);
  r.versions.forEach((v, k) =>
    console.log(`  version ${k + 1}: pages ${v.from}-${v.to}, ${v.words} words before ${v.endsAt ? `"${v.endsAt.heading}" on page ${v.endsAt.page}` : 'the end (no references heading found)'}, ${v.allWords} in all`),
  );
}
