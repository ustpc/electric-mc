// Counts the words of a manuscript PDF, the way an editor checks a length
// limit: the body of the article only. MC's proof PDFs start with a cover
// page and stamp line numbers down the margin, and a revision's PDF can hold
// the article twice (a clean copy and a marked-up one), so this
//   - skips the cover page (page 1),
//   - drops line numbers: digit-only text that MC or the author's tool
//     stacks in one column, in the margin or the gutter,
//   - drops running headers and footers that repeat from page to page,
//   - stops at the first copy's end: a later page that opens the way the
//     article opened starts another version, and
//   - stops at the references (or acknowledgments, or author bios).
// Everything here works on text positions only (lib/pdftext.ts reads them
// with pdf.js), so it is easy to test. It runs in the browser; the text and
// the count never leave the device.

export interface TextItem {
  str: string;
  /** PDF coordinates: x from the left, y of the baseline from the bottom. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PageText {
  width: number;
  height: number;
  items: TextItem[];
}

export interface Version {
  /** First and last page of this copy of the article (1-based). */
  from: number;
  to: number;
  /** Body words: before the references, without line numbers or headers. */
  words: number;
  /** All the copy's words, references and bios included. */
  allWords: number;
  /** Page where the references (or what follows the body) start, if found. */
  endsAt?: { page: number; heading: string };
}

export interface WordCount {
  /** The first version's body words: the number to show. */
  words: number;
  versions: Version[];
  pages: number;
  /** Line numbers dropped, to show that the filter worked. */
  lineNumbers: number;
  /** Pages with no text at all (a scanned PDF has nothing but these). */
  emptyPages: number;
}

export interface Options {
  /** Pages to skip at the start. MC's cover page is 1. */
  skip?: number;
}

/** Headings where the body ends. Compared as lowercase letters and spaces. */
const END_HEADINGS = new Set([
  'references', 'reference', 'bibliography', 'works cited', 'literature cited', 'cited works', 'sources',
  'references and notes', 'notes and references', 'endnotes', 'end notes', 'further reading',
  'acknowledgments', 'acknowledgements', 'acknowledgment', 'acknowledgement',
  'about the author', 'about the authors', 'author bio', 'author bios', 'author biography', 'author biographies',
  'authors', 'biography', 'biographies',
]);

const DIGITS = /^\d{1,4}$/;
const WORDLIKE = /[\p{L}\p{N}]/u;

interface Line {
  text: string;
  x: number;
  right: number;
  y: number;
  h: number;
}

/** Line-number columns: digit-only items that line up at one x, many to a page. */
function dropLineNumbers(page: PageText): { items: TextItem[]; dropped: number } {
  const items = page.items.filter((i) => i.str.trim() !== '');
  const digits = items.filter((i) => DIGITS.test(i.str.trim()));
  const text = items.filter((i) => !DIGITS.test(i.str.trim()));
  if (digits.length < 5) return { items, dropped: 0 };
  // Columns of digit-only items, by right edge (numbers are right-aligned)
  // and by left edge, 3pt wide.
  const columns = new Map<string, TextItem[]>();
  for (const d of digits) {
    for (const key of [`r${Math.round((d.x + d.w) / 3)}`, `l${Math.round(d.x / 3)}`]) {
      const c = columns.get(key) ?? [];
      c.push(d);
      columns.set(key, c);
    }
  }
  const xs = text.map((i) => i.x).sort((a, b) => a - b);
  const rights = text.map((i) => i.x + i.w).sort((a, b) => a - b);
  const left = xs[Math.floor(xs.length * 0.05)] ?? page.width / 2;
  const right = rights[Math.floor(rights.length * 0.95)] ?? page.width / 2;
  const drop = new Set<TextItem>();
  for (const col of columns.values()) {
    if (col.length < 5) continue;
    const ordered = [...col].sort((a, b) => b.y - a.y).map((i) => Number(i.str.trim()));
    let rising = 0;
    for (let k = 1; k < ordered.length; k++) if (ordered[k]! > ordered[k - 1]!) rising++;
    const inSequence = rising >= (ordered.length - 1) * 0.8;
    const cx = col.reduce((s, i) => s + i.x + i.w / 2, 0) / col.length;
    const inMargin = cx < left || cx > right;
    // A column in the margin, or one that counts up the page (a gutter
    // between two text columns). A table's column of figures is neither.
    if (inMargin || inSequence) for (const i of col) drop.add(i);
  }
  return { items: items.filter((i) => !drop.has(i)), dropped: drop.size };
}

/** Items on one baseline, left to right, joined into lines of text. */
function linesOf(items: TextItem[]): Line[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: TextItem[][] = [];
  for (const i of sorted) {
    const row = rows[rows.length - 1];
    const tol = Math.max(1.5, Math.min(i.h || 10, row?.[0]?.h || 10) * 0.4);
    if (row && Math.abs(row[0]!.y - i.y) <= tol) row.push(i);
    else rows.push([i]);
  }
  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    let text = '';
    let end = -Infinity;
    for (const i of row) {
      const gap = i.x - end;
      // pdf.js splits words into pieces at font changes; a piece that starts
      // where the last ended belongs to the same word.
      if (text && gap > Math.max(1, (i.h || 10) * 0.1) && !/\s$/.test(text) && !/^\s/.test(i.str)) text += ' ';
      text += i.str;
      end = Math.max(end, i.x + i.w);
    }
    return { text: text.replace(/\s+/g, ' ').trim(), x: row[0]!.x, right: end, y: row[0]!.y, h: Math.max(...row.map((i) => i.h || 0)) };
  }).filter((l) => l.text !== '');
}

const shape = (s: string) => s.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
const headingKey = (s: string) => s.toLowerCase().replace(/^[\divx]+[.)]?\s+/, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();

/** Words in running text: hyphens at a line's end join the next line's word. */
export function countWords(lines: string[]): number {
  let n = 0;
  let carry = false;
  for (const raw of lines) {
    const toks = raw.split(/\s+/).filter((t) => WORDLIKE.test(t));
    if (!toks.length) continue;
    n += toks.length;
    // "manu-" + "script": one word, not two.
    if (carry && /^\p{Ll}/u.test(toks[0]!)) n--;
    carry = /\p{L}-$/u.test(toks[toks.length - 1]!);
  }
  return n;
}

function wordsOf(text: string): string[] {
  return text.toLowerCase().split(/\s+/).map((t) => t.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
}

function shingles(words: string[], n = 4): Set<string> {
  const s = new Set<string>();
  for (let k = 0; k + n <= words.length; k++) s.add(words.slice(k, k + n).join(' '));
  return s;
}

/** How much of b's opening appears in a's opening. */
function overlap(a: Set<string>, b: Set<string>): number {
  if (!b.size) return 0;
  let hit = 0;
  for (const x of b) if (a.has(x)) hit++;
  return hit / b.size;
}

/** Each page's lines of body text, line numbers, headers and footers gone. */
export function cleanPages(pages: PageText[], opts: Options = {}): { lines: string[][]; lineNumbers: number; emptyPages: number } {
  const { clean, lineNumbers, emptyPages } = clean_(pages, opts.skip ?? 1);
  return { lines: clean.map((ls) => ls.map((l) => l.text)), lineNumbers, emptyPages };
}

function clean_(pages: PageText[], skip: number) {
  let lineNumbers = 0;
  let emptyPages = 0;
  const pageLines: Line[][] = pages.map((p, k) => {
    if (k < skip) return [];
    const { items, dropped } = dropLineNumbers(p);
    lineNumbers += dropped;
    if (!items.length) emptyPages++;
    return linesOf(items);
  });

  // Running headers and footers: lines near the top or bottom whose text
  // (numbers aside) comes back on at least half the pages; page numbers too.
  const body = pages.map((_, k) => k).filter((k) => k >= skip);
  const band = (p: PageText, l: Line) => l.y > p.height * 0.92 || l.y < p.height * 0.08;
  const seen = new Map<string, number>();
  for (const k of body) {
    const keys = new Set(pageLines[k]!.filter((l) => band(pages[k]!, l)).map((l) => shape(l.text)));
    for (const s of keys) seen.set(s, (seen.get(s) ?? 0) + 1);
  }
  const repeats = (s: string) => body.length >= 2 && (seen.get(s) ?? 0) >= Math.max(2, body.length / 2);
  const clean: Line[][] = pageLines.map((lines, k) =>
    lines.filter((l) => !(band(pages[k]!, l) && (repeats(shape(l.text)) || /^(page )?#( of #)?$/.test(shape(l.text))))),
  );

  return { clean, lineNumbers, emptyPages };
}

export function countPdfWords(pages: PageText[], opts: Options = {}): WordCount {
  const skip = opts.skip ?? 1;
  const { clean, lineNumbers, emptyPages } = clean_(pages, skip);
  const body = pages.map((_, k) => k).filter((k) => k >= skip);

  // Versions: a page whose opening matches the article's opening starts a
  // new copy. A short page before it (the last copy ended there) lowers the
  // bar, since a marked-up copy differs a little from the clean one.
  const opening = (k: number) => shingles(wordsOf(clean[k]!.map((l) => l.text).join(' ')).slice(0, 80));
  const textPages = body.filter((k) => clean[k]!.length);
  const starts: number[] = textPages.slice(0, 1);
  if (textPages.length) {
    const first = opening(textPages[0]!);
    const lineCounts = textPages.map((k) => clean[k]!.length).sort((a, b) => a - b);
    const median = lineCounts[Math.floor(lineCounts.length / 2)];
    for (const k of textPages.slice(1)) {
      const sim = overlap(first, opening(k));
      const prev = textPages[textPages.indexOf(k) - 1]!;
      const shortBefore = clean[prev]!.length < median! * 0.75;
      if (sim >= 0.5 || (sim >= 0.25 && shortBefore)) starts.push(k);
    }
  }

  const versions: Version[] = starts.map((from, v) => {
    const to = v + 1 < starts.length ? starts[v + 1]! - 1 : pages.length - 1;
    const lines: { page: number; text: string }[] = [];
    for (let k = from; k <= to; k++) for (const l of clean[k]!) lines.push({ page: k, text: l.text });
    const all = countWords(lines.map((l) => l.text));
    // The body ends at the first end heading past a fifth of the copy (a
    // title like "Notes" at the top doesn't count).
    let cut = lines.length;
    let endsAt: Version['endsAt'];
    let sofar = 0;
    for (let n = 0; n < lines.length; n++) {
      const key = headingKey(lines[n]!.text);
      if (END_HEADINGS.has(key) && sofar >= all * 0.2) {
        cut = n;
        endsAt = { page: lines[n]!.page + 1, heading: key };
        break;
      }
      sofar += countWords([lines[n]!.text]);
    }
    return { from: from + 1, to: to + 1, words: countWords(lines.slice(0, cut).map((l) => l.text)), allWords: all, ...(endsAt ? { endsAt } : {}) };
  });

  return { words: versions[0]?.words ?? 0, versions, pages: pages.length, lineNumbers, emptyPages };
}
