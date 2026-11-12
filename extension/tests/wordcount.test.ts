// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as worker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import { countPdfWords, countWords, type PageText } from '../lib/wordcount';
import { pdfPages } from '../lib/pdftext';
import { describeCount } from '../lib/pdfcount';
import { fakeManuscript, makePdf, type Run } from './makepdf';

(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;

const read = (runs: Run[][]) => pdfPages(pdfjs, makePdf(runs));

describe('countWords', () => {
  it('counts tokens with letters or digits and joins words hyphenated across lines', () => {
    expect(countWords(['The quick — brown fox, 2024.', 'jumps over the manu-', 'script and the Non-', 'Western dog'])).toBe(14);
  });
});

describe('countPdfWords on a made-up proof PDF', () => {
  it('skips the cover page, line numbers, headers, footers and references', async () => {
    const { runs, bodyWords } = fakeManuscript();
    const r = countPdfWords(await read(runs));
    expect(r.pages).toBe(4);
    expect(r.lineNumbers).toBe(40 + 40 + 20);
    expect(r.versions).toHaveLength(1);
    expect(r.versions[0]).toMatchObject({ from: 2, to: 4, endsAt: { page: 4, heading: 'references' } });
    expect(r.words).toBe(bodyWords);
    expect(r.versions[0]!.allWords).toBeGreaterThan(bodyWords);
  });

  it('counts only the first copy when the PDF holds the article twice', async () => {
    const { runs, bodyWords } = fakeManuscript({ copies: 2 });
    const r = countPdfWords(await read(runs));
    expect(r.versions.map((v) => [v.from, v.to, v.words])).toEqual([[2, 4, bodyWords], [5, 7, bodyWords]]);
    expect(r.words).toBe(bodyWords);
  });

  it('finds a marked-up second copy that differs a little from the first', async () => {
    const { runs, bodyWords } = fakeManuscript({ copies: 2 });
    // The second copy's first page: every fourth line changed.
    const changed = runs[4]!.map((run, k) => (run.x === 60 && k % 8 === 3 ? { ...run, text: 'inserted words replace this line here now' } : run));
    runs[4] = changed;
    const r = countPdfWords(await read(runs));
    expect(r.versions).toHaveLength(2);
    expect(r.versions[1]!.from).toBe(5);
    expect(r.words).toBe(bodyWords);
  });

  it('keeps a column of figures inside the text', async () => {
    const { runs, bodyWords } = fakeManuscript({ bodyPages: 2 });
    const figures = [7, 3, 12, 5, 9, 1, 8];
    figures.forEach((n, k) => runs[1]!.push({ x: 300, y: 300 - k * 17 + 8, text: String(n) }));
    const r = countPdfWords(await read(runs));
    expect(r.words).toBe(bodyWords + figures.length);
  });

  it('drops line numbers in a gutter between two columns', () => {
    const items = [];
    for (let l = 0; l < 30; l++) {
      const y = 700 - l * 14;
      items.push({ str: 'left column words here', x: 50, y, w: 240, h: 10 });
      items.push({ str: String(l + 1), x: 300, y, w: 10, h: 10 });
      items.push({ str: 'right column words too', x: 320, y, w: 240, h: 10 });
    }
    const pages: PageText[] = [{ width: 612, height: 792, items: [] }, { width: 612, height: 792, items }];
    const r = countPdfWords(pages);
    expect(r.lineNumbers).toBe(30);
    expect(r.words).toBe(30 * 8);
  });

  it('says so when there is no text', async () => {
    const r = countPdfWords(await read([[], [], []]));
    expect(r.words).toBe(0);
    expect(describeCount(r).head).toBe('No text to count');
  });
});

describe('describeCount', () => {
  it('gives the count and where it came from', () => {
    const d = describeCount({ words: 2898, pages: 6, lineNumbers: 280, emptyPages: 0, versions: [{ from: 2, to: 6, words: 2898, allWords: 3285, endsAt: { page: 6, heading: 'references' } }] });
    expect(d.head).toBe('2,898 words');
    expect(d.detail).toContain('up to "references" on page 6');
  });
  it('mentions a second copy', () => {
    const v = { words: 2488, allWords: 2706 };
    const d = describeCount({ words: 2488, pages: 9, lineNumbers: 480, emptyPages: 0, versions: [{ from: 2, to: 5, ...v }, { from: 6, to: 9, ...v }] });
    expect(d.detail).toContain('2 copies of the article; only the first is counted (pages 6-9: 2,488)');
  });
});
