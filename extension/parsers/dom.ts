// DOM helpers that avoid depending on ScholarOne's classes and IDs. They
// anchor on visible text (labels, headers) and on structure that has to be
// there for the page to make sense (tables with rows, label/value pairs).

import { labelKey, normalize, ownText, textOf } from '../lib/text';

const LABEL_TAGS = 'td,th,span,b,strong,label,dt,div,p,font,li';

/**
 * Find "label → value" pairs: an element whose own text is a short label,
 * followed by a value in the next cell, the next sibling, or the same element
 * after a colon.
 */
export function labeledValues(root: ParentNode): Map<string, string> {
  const out = new Map<string, string>();
  const els = root.querySelectorAll(LABEL_TAGS);
  for (const el of Array.from(els)) {
    // A label is the element's own text, or the text of a single child ("<td><b>Title:</b></td>").
    const raw = ownText(el) || (el.children.length <= 1 ? textOf(el) : '');
    if (!raw || raw.length > 60) continue;

    // "Label: value" inside one element.
    const inline = /^([A-Za-z][A-Za-z ()/'&#-]{1,40}):\s*(.+)$/.exec(textOf(el));
    if (inline && inline[1] && inline[2] && el.children.length <= 3) {
      setIfAbsent(out, labelKey(inline[1]), normalize(inline[2]));
    }

    if (!/[:]\s*$/.test(raw) && el.tagName !== 'TH' && el.tagName !== 'DT' && el.tagName !== 'LABEL') {
      // Bare words are only labels when a value cell follows them in a row.
      if (!(el.tagName === 'TD' && el.nextElementSibling?.tagName === 'TD')) continue;
    }
    const key = labelKey(raw);
    if (!key || key.length < 2) continue;
    const value = valueAfter(el);
    if (value) setIfAbsent(out, key, value);
  }
  return out;
}

function setIfAbsent(m: Map<string, string>, k: string, v: string) {
  if (!m.has(k) && v && v.length < 2000) m.set(k, v);
}

function valueAfter(el: Element): string {
  // Next cell in the same row, or the dd after a dt.
  let sib = el.nextElementSibling;
  while (sib && !textOf(sib)) sib = sib.nextElementSibling;
  if (sib) return textOf(sib);
  // Label wrapped in a cell: use the next cell of the parent row.
  const cell = el.closest('td,th');
  if (cell && cell !== el) {
    let next = cell.nextElementSibling;
    while (next && !textOf(next)) next = next.nextElementSibling;
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
      if (tr.querySelector('table')) continue;
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

/** Visible headings, most prominent first. */
export function headings(doc: Document): string[] {
  const out: string[] = [];
  for (const sel of ['h1', 'h2', '[role=heading]', 'h3', '.pagetitle, .pageTitle, .page-title']) {
    for (const el of Array.from(doc.querySelectorAll(sel))) {
      const t = textOf(el);
      if (t && t.length < 120 && !out.includes(t)) out.push(t);
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
