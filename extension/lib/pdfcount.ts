// The word count on MC's PDFs (lib/wordcount.ts), shown over Chrome's PDF
// viewer. Chrome's viewer can't be read from, so this fetches the same PDF
// again (from Chrome's cache when it can: the request is the same one the
// viewer just made) and reads it with pdf.js. pdf.js is loaded only here, on
// PDF pages, from the extension's own files (public/pdfjs, copied from
// node_modules at build time), and runs in this tab. The PDF's text and the
// count stay in the tab: nothing is stored or sent, and the log gets numbers
// only.

import { countPdfWords, type WordCount } from './wordcount';
import { pdfPages } from './pdftext';
import { EMC_COLOR } from './milestones';

type PdfJs = Parameters<typeof pdfPages>[0];

/** "2,898 words" and the line under it. */
export function describeCount(r: WordCount): { head: string; detail: string } {
  if (!r.versions.length) {
    return { head: 'No text to count', detail: r.emptyPages ? 'This PDF has no text layer (a scan?).' : 'This PDF has only a cover page.' };
  }
  const v = r.versions[0]!;
  const n = (x: number) => x.toLocaleString('en-US');
  const range = v.from === v.to ? `page ${v.from}` : `pages ${v.from}-${v.to}`;
  let detail = v.endsAt
    ? `Body text on ${range}, up to "${v.endsAt.heading}" on page ${v.endsAt.page}; ${n(v.allWords)} with it. No cover page or line numbers.`
    : `All text on ${range} (no references heading found). No cover page or line numbers.`;
  if (r.versions.length > 1) {
    const others = r.versions.slice(1).map((o) => `pages ${o.from}-${o.to}: ${n(o.words)}`).join('; ');
    detail += ` This PDF holds ${r.versions.length} copies of the article; only the first is counted (${others}).`;
  }
  return { head: `${n(r.words)} words`, detail };
}

async function loadPdfJs(): Promise<PdfJs> {
  const url = (f: string) => chrome.runtime.getURL(`pdfjs/${f}`);
  // pdf.js runs its worker code in this thread when it finds it here, so
  // no Worker (which a content script couldn't start from the extension).
  const worker = await import(/* @vite-ignore */ url('pdf.worker.min.mjs'));
  (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
  return (await import(/* @vite-ignore */ url('pdf.min.mjs'))) as PdfJs;
}

/** Fetch this tab's PDF, count it, and show the count. Resolves to what the log should get. */
export async function showPdfWordCount(doc: Document = document): Promise<Record<string, unknown>> {
  const t0 = Date.now();
  const r = await fetch(doc.location.href, { credentials: 'include', cache: 'force-cache' });
  const bytes = new Uint8Array(await r.arrayBuffer());
  const magic = String.fromCharCode(...bytes.subarray(0, 5));
  if (!r.ok || magic !== '%PDF-') {
    badge(doc, 'No word count', "Couldn't fetch this PDF again to count it.");
    return { ok: false, status: r.status, type: r.headers.get('content-type'), bytes: bytes.length };
  }
  const pdfjs = await loadPdfJs();
  const count = countPdfWords(await pdfPages(pdfjs, bytes));
  const { head, detail } = describeCount(count);
  badge(doc, head, detail);
  return {
    ok: true,
    words: count.words,
    pages: count.pages,
    lineNumbers: count.lineNumbers,
    emptyPages: count.emptyPages,
    versions: count.versions.map((v) => ({ from: v.from, to: v.to, words: v.words, all: v.allWords, end: v.endsAt?.heading ?? null })),
    ms: Date.now() - t0,
  };
}

/** A small box at the viewer's lower left, in a shadow root; click to hide. */
export function badge(doc: Document, head: string, detail: string): HTMLElement {
  doc.querySelector('[data-electric-mc-words]')?.remove();
  const host = doc.createElement('div');
  host.setAttribute('data-electric-mc-words', '');
  host.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'open' });
  const box = doc.createElement('div');
  box.title = 'Electric MC word count. Click to hide.';
  box.style.cssText = `max-width:360px;padding:8px 12px;border:2px solid ${EMC_COLOR};border-radius:8px;background:#fff;color:${EMC_COLOR};font:13px/1.35 system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.25);cursor:pointer;`;
  const b = doc.createElement('div');
  b.style.cssText = 'font-weight:700;font-size:15px;';
  b.textContent = head;
  const d = doc.createElement('div');
  d.style.cssText = 'font-weight:600;';
  d.textContent = detail;
  box.append(b, d);
  box.addEventListener('click', () => host.remove());
  root.append(box);
  (doc.body ?? doc.documentElement).append(host);
  return host;
}
