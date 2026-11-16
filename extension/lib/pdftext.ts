// Reads the text and its positions from a PDF with pdf.js, for
// lib/wordcount.ts. The caller passes the pdf.js module in, so the extension
// can load it only on PDF pages (entrypoints/content.ts) and the command
// line tool can import it from node_modules (tools/wordcount.ts).

import type { PageText, TextItem } from './wordcount';

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

export async function pdfPages(pdfjs: PdfJs, data: Uint8Array): Promise<PageText[]> {
  const task = pdfjs.getDocument({ data, useSystemFonts: false, disableFontFace: true, verbosity: 0 });
  const doc = await task.promise;
  try {
    const pages: PageText[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = page.view;
      const content = await page.getTextContent();
      const items: TextItem[] = [];
      for (const it of content.items) {
        if (!('str' in it) || !it.str) continue;
        const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = it.transform as number[];
        items.push({ str: it.str, x: e - x0, y: f - y0, w: it.width, h: it.height || Math.hypot(c, d) || Math.hypot(a, b) });
      }
      pages.push({ width: x1 - x0, height: y1 - y0, items });
      page.cleanup();
    }
    return pages;
  } finally {
    await task.destroy();
  }
}
