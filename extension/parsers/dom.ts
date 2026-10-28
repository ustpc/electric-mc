// DOM helpers that avoid depending on ScholarOne's classes and IDs. They
// anchor on visible text (labels, headers) and on structure that has to be
// there for the page to make sense (tables with rows, label/value pairs).

import { cellLines, labelKey, normalize, ownText, textOf, isLayoutRow } from '../lib/text';

const LABEL_TAGS = 'td,th,span,b,strong,label,dt,div,p,font,li';

/**
 * Find "label → value" pairs: an element whose own text is a short label,
 * followed by a value in the next cell, the next sibling, or the same element
 * after a colon.
 */
export function labeledValues(root: ParentNode): Map<string, string> {
  const out = new Map<string, string>();
  // The editor block ("AE: …", "CC: …" one per line) comes first: it's where
  // MC names the manuscript's own AE and co-chair.
  for (const [k, v] of rolesIn(root)) out.set(k, v);
  const els = root.querySelectorAll(LABEL_TAGS);
  for (const el of Array.from(els)) {
    // A label is the element's own text, or the text of a single child ("<td><b>Title:</b></td>").
    const raw = ownText(el) || (el.children.length <= 1 ? textOf(el) : '');

    // "Label: value" inside one element, possibly several separated by
    // semicolons ("Submitted: 09-Sep-2026; Last Updated: 09-Sep-2026").
    if (el.children.length <= 3) {
      for (const seg of textOf(el).split(/;\s+(?=[A-Z][A-Za-z ()/'&#-]{1,40}:)/)) {
        const inline = /^([A-Za-z][A-Za-z ()/'&#-]{1,40}):\s*(.+)$/.exec(seg);
        if (inline && inline[1] && inline[2]) setIfAbsent(out, labelKey(inline[1]), normalize(inline[2]));
      }
    }
    if (!raw || raw.length > 60) continue;

    // "AE <a>Editor, Pat</a>": a short label followed by a single link.
    const own = ownText(el);
    const kids = Array.from(el.children);
    if (own && own.length <= 25 && kids.length === 1 && kids[0]!.tagName === 'A' && textOf(el).startsWith(own)) {
      setIfAbsent(out, labelKey(own), textOf(kids[0]));
    }

    if (!/[:]\s*$/.test(raw) && el.tagName !== 'TH' && el.tagName !== 'DT' && el.tagName !== 'LABEL') {
      // Bare words are only labels when a value cell follows them in a row.
      if (!(el.tagName === 'TD' && el.nextElementSibling?.tagName === 'TD')) continue;
      if (isHeaderRow(el.parentElement)) continue;
    }
    const key = labelKey(raw);
    if (!key || key.length < 2) continue;
    const value = valueAfter(el);
    if (value) setIfAbsent(out, key, value);
  }
  return out;
}

const ROLE_LINE = /^(AE|CC|EIC|ADM|SE|ME):\s*(.*)$/;

/**
 * MC's editor block on a manuscript: "AE: Not Assigned", "CC: Co-Chair, …",
 * one per line in a single cell. Keyed "ae", "cc" and so on; the first block
 * on the page wins.
 */
export function rolesIn(root: ParentNode): Map<string, string> {
  const out = new Map<string, string>();
  const blocks = Array.from(root.querySelectorAll('td, div, p, span')).filter((el) => {
    const t = textOf(el);
    return t.length < 800 && /\bAE:/.test(t) && /\b(CC|EIC|ADM):/.test(t);
  });
  // The innermost block, so a whole table's text doesn't count as one line.
  const inner = blocks.filter((b) => !blocks.some((o) => o !== b && b.contains(o)));
  for (const b of inner) {
    const lines = cellLines(b).filter((l) => ROLE_LINE.test(l));
    if (lines.length < 2) continue;
    for (const l of lines) {
      const m = ROLE_LINE.exec(l)!;
      setIfAbsent(out, m[1]!.toLowerCase(), normalize(m[2]));
    }
  }
  return out;
}

/** A column header row: five or more short cells, no colons, no digits. */
function isHeaderRow(row: Element | null): boolean {
  if (!row || row.tagName !== 'TR') return false;
  const cells = Array.from((row as HTMLTableRowElement).cells);
  return cells.length >= 5 && cells.every((c) => { const t = textOf(c); return t.length < 30 && !/[:\d]/.test(t); });
}

function setIfAbsent(m: Map<string, string>, k: string, v: string) {
  if (!m.has(k) && v && v.length < 2000) m.set(k, v);
}

function valueAfter(el: Element): string {
  // Next cell in the same row, or the dd after a dt. A header cell next to a
  // header cell is a column header row ("Title | Date Submitted"), not a value.
  let sib = el.nextElementSibling;
  while (sib && !textOf(sib)) sib = sib.nextElementSibling;
  if (sib && sib.tagName === 'TH') return '';
  if (sib) return textOf(sib);
  // Label wrapped in a cell: use the next cell of the parent row.
  const cell = el.closest('td,th');
  if (cell && cell !== el) {
    let next = cell.nextElementSibling;
    while (next && !textOf(next)) next = next.nextElementSibling;
    if (next && next.tagName === 'TH') return '';
    if (next) return textOf(next);
  }
  // Value as trailing text in the parent element.
  const parent = el.parentElement;
  if (parent) {
    const rest = textOf(parent).slice(textOf(el).length).trim();
    if (rest) return rest;
  }
  return '';
}

/** Look up the first label matching any of the patterns. Returns [label, value]. */
export function pick(fields: Map<string, string>, patterns: RegExp[]): [string, string] | null {
  for (const re of patterns) {
    for (const [k, v] of fields) if (re.test(k)) return [k, v];
  }
  return null;
}

export interface SimpleTable {
  el: HTMLTableElement;
  headers: string[];
  rows: Element[][];
}

/**
 * Tables flattened to header + data rows. Layout tables are common in
 * ScholarOne, so rows that contain a nested table are skipped: the nested
 * table is visited on its own.
 */
export function dataTables(root: ParentNode): SimpleTable[] {
  const out: SimpleTable[] = [];
  for (const t of Array.from(root.querySelectorAll('table'))) {
    const trs = Array.from(t.querySelectorAll('tr')).filter((tr) => tr.closest('table') === t);
    const rows: Element[][] = [];
    let headers: string[] = [];
    for (const tr of trs) {
      if (isLayoutRow(tr)) continue;
      const cells = Array.from(tr.children).filter((c) => c.tagName === 'TD' || c.tagName === 'TH');
      if (cells.length === 0) continue;
      // A single cell spanning the table is a caption ("Reviewer List"), not data.
      if (cells.length === 1 && Number(cells[0]!.getAttribute('colspan') ?? 1) > 1) continue;
      const isHeader = cells.every((c) => c.tagName === 'TH') || (headers.length === 0 && looksLikeHeader(cells));
      if (isHeader && headers.length === 0) headers = cells.map((c) => labelKey(textOf(c)));
      else rows.push(cells);
    }
    if (rows.length) out.push({ el: t as HTMLTableElement, headers, rows });
  }
  return out;
}

const HEADER_WORDS = /^(manuscript id|id|title|status|submitted|date|due|author|action|take action|days|reviewer|type|associate editor|editor|decision)/;

function looksLikeHeader(cells: Element[]): boolean {
  const texts = cells.map((c) => labelKey(textOf(c)));
  const hits = texts.filter((t) => HEADER_WORDS.test(t)).length;
  return hits >= 2 && texts.every((t) => t.length < 40);
}

// Cookie-consent headings, in case a consent tool's markup slips past IGNORE_SEL.
const THIRD_PARTY_HEADING = /privacy preference|cookie (settings|preferences|policy)|manage consent|your privacy/i;

/** Visible headings, most prominent first. */
export function headings(doc: Document): string[] {
  const out: string[] = [];
  for (const sel of ['h1', 'h2', '[role=heading]', 'h3', '.pagetitle, .pageTitle, .page-title']) {
    for (const el of Array.from(doc.querySelectorAll(sel))) {
      const t = textOf(el);
      if (t && t.length < 120 && !out.includes(t) && !THIRD_PARTY_HEADING.test(t)) out.push(t);
    }
  }
  return out;
}

/**
 * Structural fingerprint: the first 1500 element tag names in document order,
 * with depth, and no text or attributes. Two pages of the same kind usually
 * share a fingerprint; a change means ScholarOne changed the template.
 */
export function skeleton(doc: Document): string {
  const parts: string[] = [];
  const walk = (el: Element, depth: number) => {
    if (parts.length >= 1500) return;
    const tag = el.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'noscript' || el.hasAttribute('data-electric-mc')) return;
    parts.push(`${depth}${tag}`);
    for (const c of Array.from(el.children)) walk(c, depth + 1);
  };
  if (doc.body) walk(doc.body, 0);
  return parts.join(',');
}

// Things on the page that aren't part of Manuscript Central's content: the
// OneTrust cookie dialog (present but hidden on every page), other hidden
// elements, and our own additions. Our ID links wrap MC's own text, so they
// are unwrapped instead: dropping one dropped the ID inside it, and the
// queue page then parsed as unknown (0.0.33 to 0.0.39).
const WRAPPERS = '[data-electric-mc="id-link"]';
const IGNORE_SEL = [
  '#onetrust-consent-sdk', '[id^=onetrust]', '[id^=ot-]', '[class^="ot-"]', '[class*=" ot-"]', '.ot-sdk-container',
  '[class*=cookie-banner]', '[id*=cookie-consent]',
  '[hidden]', '[aria-hidden=true]', 'script', 'style', 'noscript', 'template', `[data-electric-mc]:not(${WRAPPERS})`,
].join(',');

/**
 * A copy of the document without hidden and third-party elements, so their
 * headings and links can't confuse the classifier. Elements hidden by CSS
 * are found on the live page (checkVisibility) before copying.
 */
export function cleanDocument(doc: Document): Document {
  const MARK = 'data-emc-drop';
  const marked: Element[] = [];
  const body = doc.body;
  if (body) {
    for (const el of Array.from(body.children)) markHidden(el, 0);
  }
  function markHidden(el: Element, depth: number) {
    if (el.matches(IGNORE_SEL) || isCssHidden(el)) {
      el.setAttribute(MARK, '');
      marked.push(el);
      return;
    }
    if (depth < 4) for (const c of Array.from(el.children)) markHidden(c, depth + 1);
  }
  const copy = doc.implementation.createHTMLDocument('');
  copy.replaceChild(copy.importNode(doc.documentElement, true), copy.documentElement);
  for (const el of marked) el.removeAttribute(MARK);
  copy.querySelectorAll(WRAPPERS).forEach((e) => e.replaceWith(...Array.from(e.childNodes)));
  copy.querySelectorAll(`[${MARK}], ${IGNORE_SEL}`).forEach((e) => e.remove());
  return copy;
}

function isCssHidden(el: Element): boolean {
  const s = (el as HTMLElement).style;
  if (s && (s.display === 'none' || s.visibility === 'hidden')) return true;
  const check = (el as Element & { checkVisibility?: (o?: object) => boolean }).checkVisibility;
  // jsdom has no layout, so only trust checkVisibility in a real browser.
  if (typeof check === 'function' && typeof navigator !== 'undefined' && !/jsdom/i.test(navigator.userAgent)) {
    return !check.call(el, { visibilityProperty: true });
  }
  return false;
}

/**
 * The breadcrumb trail ("Co-Chair Dashboard / Awaiting Co-Chair
 * Recommendation / Details for X"), if the page has one.
 */
export function breadcrumb(doc: Document): string[] | null {
  const cands = Array.from(doc.querySelectorAll('ol,ul,nav,div,td,p,span'));
  let best: string[] | null = null;
  for (const el of cands) {
    const t = textOf(el);
    if (t.length > 250 || !t.includes('/')) continue;
    const parts = t.split(/\s+\/\s+|\s*\/\s+|\s+\/\s*/).map((x) => x.replace(/\s*\+\s*search$/i, '').trim()).filter(Boolean);
    if (parts.length < 2 || parts.length > 6 || parts.some((x) => x.length > 80)) continue;
    if (!/dashboard|center|home|main menu/i.test(parts[0]!)) continue;
    // Prefer the smallest element that holds the whole trail.
    if (!best || parts.join('').length <= best.join('').length) best = parts;
  }
  return best;
}
