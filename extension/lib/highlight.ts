// Row highlighting on queue pages. Revisions (".R1", ".R2", …) can be shown
// bold on a light yellow background. MC queue tables often spread one
// manuscript over two rows (ID and title, then type and author), so the rows
// after an ID row that carry no ID of their own are highlighted with it.

import { parseManuscriptId } from './ids';
import { textOf } from './text';

const ATTR = 'data-emc-revision';
const STYLE_ID = 'emc-highlight-style';
const CSS = `tr[${ATTR}] > td, tr[${ATTR}] > th { background-color: #fff8d6 !important; font-weight: 700 !important; }
tr[${ATTR}] a { font-weight: 700 !important; }`;

/** Mark revision rows. Returns how many manuscripts were marked. */
export function highlightRevisions(doc: Document, idPattern?: string): number {
  clearHighlights(doc);
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (doc.head ?? doc.documentElement).appendChild(style);
  }
  let marked = 0;
  for (const table of Array.from(doc.querySelectorAll('table'))) {
    const rows = Array.from(table.rows).filter((tr) => !tr.querySelector('table'));
    let inRevision = false;
    let span = 0;
    for (const tr of rows) {
      const ref = parseManuscriptId(textOf(tr), idPattern);
      if (ref) {
        inRevision = ref.revision > 0;
        // Continuation rows are bounded by the tallest rowspan in the ID row.
        span = Math.max(1, ...Array.from(tr.cells).map((c) => c.rowSpan || 1)) - 1;
        if (inRevision) {
          tr.setAttribute(ATTR, ref.id);
          marked++;
        }
      } else if (inRevision && span > 0) {
        tr.setAttribute(ATTR, '');
        span--;
      } else {
        inRevision = false;
      }
    }
  }
  return marked;
}

export function clearHighlights(doc: Document): void {
  doc.querySelectorAll(`[${ATTR}]`).forEach((e) => e.removeAttribute(ATTR));
}
