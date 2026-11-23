// @vitest-environment node
// Manuscript PDFs in var/: the word count runs and finds words. Files are
// numbered, never named (their names are manuscript IDs).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as worker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import { pdfPages } from '../lib/pdftext';
import { countPdfWords } from '../lib/wordcount';
import { files, HAVE_VAR } from './data';

(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
const pdfs = files(/\.pdf$/i).slice(0, 10);

describe.skipIf(!HAVE_VAR || !pdfs.length)(`real PDFs (${pdfs.length})`, () => {
  pdfs.forEach((p, i) =>
    it(`PDF ${i + 1}`, async () => {
      // Errors are swallowed, never passed on: a read error names the file (a manuscript ID).
      let words = -1;
      try {
        words = countPdfWords(await pdfPages(pdfjs, new Uint8Array(readFileSync(p)))).words;
      } catch {
        /* reported below as unreadable */
      }
      expect(words >= 0, `PDF ${i + 1}: couldn't be read`).toBe(true);
      expect(words > 100, `PDF ${i + 1}: ${words} words`).toBe(true);
    }),
  );
});
